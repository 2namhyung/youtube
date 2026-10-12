/* eslint-disable opencut/prefer-object-params, @typescript-eslint/no-unsafe-type-assertion */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, realpath, rename, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { REFERENCE_V3_CAPTION_PRESET, REFERENCE_V3_MEDIA_STYLE } from "@/automation/reference-v3-contract";
import { hasExplicitEditorialDirection, readDefaultEditorialDirection } from "@/newsroom/editorial-direction";
import { assertSnapshotMatchesCandidate, buildDraftPolicyPackage, isCurrentLegalContextReport } from "@/newsroom/legal-context";
import { loadNewsroomRegistry, upsertNewsroomProject } from "@/newsroom/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_ID = /^[a-z0-9][a-z0-9-]{5,63}$/;
const NEWSROOM_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/;

function findAutomationRoot() {
	let directory = process.cwd();
	for (let depth = 0; depth < 7; depth += 1) {
		if (existsSync(path.join(directory, "scripts", "newsroom-cli.mjs"))) return directory;
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	throw new Error("OpenCut automation root was not found");
}

function contained(root: string, target: string) {
	const base = path.resolve(root);
	const resolved = path.resolve(target);
	if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error("Path escapes newsroom workspace");
	return resolved;
}

function jobDirectory(root: string, jobId: string) {
	if (!JOB_ID.test(jobId)) throw new Error("Invalid newsroom job id");
	return contained(path.join(root, "out", "newsroom", "jobs"), path.join(root, "out", "newsroom", "jobs", jobId));
}

async function loadActionWorkflow(root: string, slugValue: unknown, requireFinalizedDraft = false) {
	const slug = typeof slugValue === "string" ? slugValue.trim() : "";
	if (!NEWSROOM_SLUG.test(slug)) throw new Error("A valid newsroom project slug is required");
	const projectRoot = path.join(root, "production", "newsroom", "projects");
	const workflow = JSON.parse(await readFile(path.join(projectRoot, `${slug}.workflow.json`), "utf8")) as Record<string, unknown>;
	const candidate = workflow.candidate && typeof workflow.candidate === "object" && !Array.isArray(workflow.candidate) ? workflow.candidate as Record<string, unknown> : null;
	const snapshot = JSON.parse(await readFile(path.join(projectRoot, `${slug}.research.json`), "utf8")) as Record<string, unknown>;
	const stages = workflow.stages && typeof workflow.stages === "object" && !Array.isArray(workflow.stages) ? workflow.stages as Record<string, unknown> : {};
	const legalStage = stages["02"] && typeof stages["02"] === "object" && !Array.isArray(stages["02"]) ? stages["02"] as Record<string, unknown> : {};
	if (!candidate) throw new Error("Persisted newsroom candidate is required");
	assertSnapshotMatchesCandidate({ snapshot, candidate, slug });
	if (legalStage.status !== "ready" || !isCurrentLegalContextReport({ report: workflow.legalContextReport, candidate, researchSnapshot: snapshot })) {
		throw new Error("Stage 02 legal review is not current; regenerate the report before drafting");
	}
	const report = workflow.legalContextReport && typeof workflow.legalContextReport === "object" && !Array.isArray(workflow.legalContextReport) ? workflow.legalContextReport as Record<string, unknown> : {};
	if (report.videoDecision && typeof report.videoDecision === "object" && !Array.isArray(report.videoDecision) && (report.videoDecision as Record<string, unknown>).decision === "block") throw new Error("This newsroom candidate is blocked by legal review");
	const draft = workflow.draft && typeof workflow.draft === "object" && !Array.isArray(workflow.draft) ? workflow.draft as Record<string, unknown> : null;
	if (requireFinalizedDraft && (workflow.draftFinalized !== true || !draft)) throw new Error("A persisted finalized newsroom draft is required");
	return { slug, workflow, candidate, snapshot, report, draft };
}

function runCli(root: string, argv: string[], stdin?: string) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), ...argv], {
			cwd: root,
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); });
		child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Newsroom command exited ${code}`)));
		if (stdin) child.stdin.end(stdin);
		else child.stdin.end();
	});
}

type ResearchRefreshStatus = {
	state: "idle" | "running" | "completed" | "failed";
	startedAt?: string;
	updatedAt?: string;
	completedAt?: string;
	pid?: number;
	error?: string;
	result?: Record<string, unknown>;
};

const MAX_RESEARCH_REFRESH_STDOUT_BYTES = 4 * 1024 * 1024;

let refreshLaunchPromise: Promise<ResearchRefreshStatus> | null = null;

function sanitizePublicError(cause: unknown) {
	const raw = cause instanceof Error ? cause.message : String(cause);
	const errorLines = [...raw.matchAll(/(?:^|\n)Error:\s*([^\r\n]+)/gu)];
	const message = errorLines.at(-1)?.[1] || raw.split(/\r?\n/gu).find((line) => line.trim() && !/^file:\/\//iu.test(line.trim()) && !/^\s*at\s/iu.test(line)) || "Newsroom mutation failed";
	return message.replace(/file:\/\/\/[^\s)]+/giu, "<local-file>").replace(/[A-Za-z]:\\[^\r\n"']+/gu, "<local-path>").replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/giu, "$1=<redacted>").slice(0, 1200);
}

function startProductionOrchestration(root: string, jobId: string, leaseId: string) {
	const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "orchestrate", "--job", jobId], {
		cwd: root,
		detached: false,
		stdio: "ignore",
		shell: false,
		windowsHide: true,
	});
	child.once("error", () => { void runCli(root, ["orchestration-release", "--job", jobId, "--lease", leaseId]); });
	child.unref();
}

async function writeAtomic(filePath: string, data: string | Uint8Array) {
	await mkdir(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
	const handle = await open(temporary, "wx");
	try {
		await handle.writeFile(data);
	} finally {
		await handle.close();
	}
	await rename(temporary, filePath);
}

function researchRefreshStatusPath(root: string) {
	return contained(path.join(root, "out", "newsroom"), path.join(root, "out", "newsroom", "research-refresh.json"));
}

async function readResearchRefreshStatus(root: string): Promise<ResearchRefreshStatus> {
	try {
		const value = JSON.parse(await readFile(researchRefreshStatusPath(root), "utf8")) as ResearchRefreshStatus;
		if (value && (value.state === "running" || value.state === "completed" || value.state === "failed")) return value;
	} catch { /* no prior refresh */ }
	return { state: "idle" };
}

function publicResearchRefreshStatus(status: ResearchRefreshStatus) {
	const { pid: _pid, ...publicStatus } = status;
	return publicStatus;
}

function processIsAlive(pid: number | undefined) {
	if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
	try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startResearchRefresh(root: string): Promise<ResearchRefreshStatus> {
	if (refreshLaunchPromise) return refreshLaunchPromise;
	refreshLaunchPromise = (async () => {
		const existing = await readResearchRefreshStatus(root);
		if (existing.state === "running" && processIsAlive(existing.pid)) return existing;
		const startedAt = new Date().toISOString();
		const running: ResearchRefreshStatus = { state: "running", startedAt, updatedAt: startedAt };
		await writeAtomic(researchRefreshStatusPath(root), `${JSON.stringify(running)}\n`);
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "refresh-research"], {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			windowsHide: true,
		});
		const runningWithPid = { ...running, pid: child.pid };
		await writeAtomic(researchRefreshStatusPath(root), `${JSON.stringify(runningWithPid)}\n`);
		const stdoutChunks: Buffer[] = [];
		let stdoutBytes = 0;
		let stdoutOverflowed = false;
		let stderr = "";
		const append = (current: string, chunk: unknown) => `${current}${String(chunk)}`.slice(-64 * 1024);
		child.stdout?.on("data", (chunk) => {
			if (stdoutOverflowed) return;
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
			stdoutBytes += buffer.byteLength;
			if (stdoutBytes > MAX_RESEARCH_REFRESH_STDOUT_BYTES) {
				stdoutOverflowed = true;
				child.kill();
				return;
			}
			stdoutChunks.push(buffer);
		});
		child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
		let terminalStatusWritten = false;
		const writeFailure = async (message: string) => {
			if (terminalStatusWritten) return;
			terminalStatusWritten = true;
			const completedAt = new Date().toISOString();
			const failed = { ...running, state: "failed" as const, updatedAt: completedAt, completedAt, error: message };
			await writeAtomic(researchRefreshStatusPath(root), `${JSON.stringify(failed)}\n`).catch(() => {});
		};
		child.on("error", async (error) => {
			await writeFailure(stdoutOverflowed
				? `Research refresh output exceeded ${MAX_RESEARCH_REFRESH_STDOUT_BYTES} bytes`
				: error instanceof Error ? error.message : String(error));
		});
		child.on("close", async (code) => {
			if (stdoutOverflowed) {
				await writeFailure(`Research refresh output exceeded ${MAX_RESEARCH_REFRESH_STDOUT_BYTES} bytes`);
				return;
			}
			if (code !== 0) {
				await writeFailure(stderr.trim() || `Research refresh exited ${code}`);
				return;
			}
			if (terminalStatusWritten) return;
			const completedAt = new Date().toISOString();
			try {
				const result = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8").trim()) as Record<string, unknown>;
				await writeAtomic(researchRefreshStatusPath(root), `${JSON.stringify({ ...running, state: "completed", updatedAt: completedAt, completedAt, result })}\n`);
				terminalStatusWritten = true;
			} catch (error) {
				await writeFailure(error instanceof Error ? error.message : "Invalid refresh output");
			}
		});
		child.unref();
		return runningWithPid;
	})().finally(() => { refreshLaunchPromise = null; });
	return refreshLaunchPromise;
}

function safeStatus(value: unknown) {
	if (!value || typeof value !== "object") return null;
	const status = value as Record<string, unknown>;
	const candidate = status.candidate && typeof status.candidate === "object"
		? Object.fromEntries(["id", "title", "source", "url", "publishedAt", "adapterId", "tags", "score", "scoreDetail"].flatMap((key) =>
			Object.hasOwn(status.candidate as object, key) ? [[key, (status.candidate as Record<string, unknown>)[key]]] : []))
		: undefined;
	const render = status.render && typeof status.render === "object"
		? Object.fromEntries(["versionId", "fileName", "duration", "frames", "templateId"].flatMap((key) =>
			Object.hasOwn(status.render as object, key) ? [[key, (status.render as Record<string, unknown>)[key]]] : []))
		: undefined;
	const worker = status.worker && typeof status.worker === "object" && !Array.isArray(status.worker) ? status.worker as Record<string, unknown> : null;
	const retryDue = !status.retryAfter || Date.parse(String(status.retryAfter)) <= Date.now();
	const runningOrphaned = status.state === "running" && (!worker || !processIsAlive(Number(worker.pid)));
	const resumeEligible = runningOrphaned || (status.retryable === true && (status.state === "queued" || status.state === "blocked") && retryDue);
	const codexQaRecord = status.codexQa && typeof status.codexQa === "object" && !Array.isArray(status.codexQa) ? status.codexQa as Record<string, unknown> : null;
	const codexMonitor = codexQaRecord?.monitor && typeof codexQaRecord.monitor === "object" && !Array.isArray(codexQaRecord.monitor) ? codexQaRecord.monitor as Record<string, unknown> : null;
	const codexFinalMonitor = codexQaRecord?.finalMonitor && typeof codexQaRecord.finalMonitor === "object" && !Array.isArray(codexQaRecord.finalMonitor) ? codexQaRecord.finalMonitor as Record<string, unknown> : null;
	const codexRepair = codexQaRecord?.repair && typeof codexQaRecord.repair === "object" && !Array.isArray(codexQaRecord.repair) ? codexQaRecord.repair as Record<string, unknown> : null;
	const designRecord = status.videoDesign && typeof status.videoDesign === "object" && !Array.isArray(status.videoDesign) ? status.videoDesign as Record<string, unknown> : null;
	return {
		jobId: status.jobId,
		state: status.state,
		stage: status.stage,
		progress: status.progress,
		error: typeof status.error === "string" ? sanitizePublicError(status.error) : undefined,
		createdAt: status.createdAt,
		updatedAt: status.updatedAt,
		completedAt: status.completedAt,
		retryable: status.retryable === true,
		retryAfter: status.retryAfter,
		resumeEligible,
		privateOnly: status.privateOnly === true,
		videoDesign: designRecord ? { sha256: typeof designRecord.sha256 === "string" ? designRecord.sha256 : undefined, status: typeof designRecord.status === "string" && ["compiled-awaiting-monitor", "compiled-monitored", "rendered"].includes(designRecord.status) ? designRecord.status : "unknown", cutCount: Number(designRecord.cutCount || 0), keyframeCount: Number(designRecord.keyframeCount || 0), animationMode: designRecord.animationMode === "ffmpeg-deterministic-keyframes-v1" ? designRecord.animationMode : undefined, blocker: status.state === "blocked" && status.stage === "video_design_planner" ? "planner-admin-blocked" : undefined } : undefined,
		codexQa: codexQaRecord ? {
			monitor: codexMonitor ? { state: codexMonitor.state, monitorOnly: codexMonitor.monitorOnly === true, canonicalQaRequired: codexMonitor.canonicalQaRequired === true, model: codexMonitor.model, reasoning: codexMonitor.reasoning, verdict: codexMonitor.verdict === "blocked" ? "blocked" : "continue", summaryCode: codexMonitor.verdict === "blocked" ? "concrete-risk" : "advisory-complete", completedAt: codexMonitor.completedAt } : undefined,
			finalMonitor: codexFinalMonitor ? { state: codexFinalMonitor.state, monitorOnly: codexFinalMonitor.monitorOnly === true, canonicalQaWasAuthority: codexFinalMonitor.canonicalQaWasAuthority === true, model: codexFinalMonitor.model, reasoning: codexFinalMonitor.reasoning, verdict: codexFinalMonitor.verdict === "blocked" ? "blocked" : "continue", summaryCode: codexFinalMonitor.verdict === "blocked" ? "concrete-risk" : "advisory-complete", completedAt: codexFinalMonitor.completedAt } : undefined,
			repairAttempts: Number(codexQaRecord.repairAttempts || 0),
			repair: codexRepair ? { status: codexRepair.status, reason: codexRepair.reason, terminal: codexRepair.terminal === true } : undefined,
		} : undefined,
		checkpoints: status.checkpoints && typeof status.checkpoints === "object" ? Object.fromEntries(Object.entries(status.checkpoints as Record<string, unknown>).map(([stage, checkpoint]) => {
			const record = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint) ? checkpoint as Record<string, unknown> : {};
			return [stage, Object.fromEntries(["state", "inputSha256", "outputSha256", "startedAt", "completedAt", "resumable"].flatMap((key) => Object.hasOwn(record, key) ? [[key, record[key]]] : []))];
		})) : undefined,
		logs: Array.isArray(status.logs) ? status.logs.slice(-120).map((entry) => typeof entry === "string" ? sanitizePublicError(entry) : "Production event") : [],
		candidate,
		render: render ? {
			...render,
			videoUrl: `/api/newsroom?asset=video&job=${encodeURIComponent(String(status.jobId))}`,
			thumbnailUrl: `/api/newsroom?asset=thumbnail&job=${encodeURIComponent(String(status.jobId))}`,
		} : undefined,
	};
}

async function assetResponse(root: string, jobId: string, kind: "video" | "thumbnail") {
	const dir = jobDirectory(root, jobId);
	const raw = JSON.parse(await readFile(path.join(dir, "status.json"), "utf8")) as Record<string, unknown>;
	const render = raw.render as Record<string, unknown> | undefined;
	if (raw.state !== "completed" || !render) return NextResponse.json({ error: "Render is not ready" }, { status: 404 });
	const privateRoot = path.join(root, "out", ".private");
	const filePath = contained(privateRoot, String(kind === "video" ? render.renderPath : render.thumbnailPath));
	const info = await stat(filePath);
	if (!info.isFile()) return NextResponse.json({ error: "Render file is unavailable" }, { status: 404 });
	const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
	return new NextResponse(stream, {
		headers: {
			"Content-Type": kind === "video" ? "video/mp4" : "image/png",
			"Content-Length": String(info.size),
			"Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

const HANDOFF_ASSET_EXTENSIONS: Record<string, string> = {
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
	".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
	".m4a": "audio/mp4",
};
const HANDOFF_SECTIONS = ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"] as const;
const REFERENCE_MEDIA_STYLE = REFERENCE_V3_MEDIA_STYLE;
const LOCKED_CAPTION_PRESET = REFERENCE_V3_CAPTION_PRESET;

function captionTrackFromPreset(preset: typeof LOCKED_CAPTION_PRESET = LOCKED_CAPTION_PRESET) {
	if (JSON.stringify(preset) !== JSON.stringify(LOCKED_CAPTION_PRESET)) throw new Error("Private handoff caption preset drift");
	return {
		type: "captions",
		captionStyle: {
			fontSizeRatioOfPlayHeight: preset.fontSize / 1920,
			fontFamily: preset.fontFamily,
			color: preset.color,
			textAlign: "center",
			fontWeight: "bold",
			lineHeight: preset.lineHeight,
			background: { enabled: false, color: "#000000" },
			placement: {
				verticalAlign: "bottom",
				marginLeftRatio: (1080 - preset.safeWidth) / 2 / 1080,
				marginRightRatio: (1080 - preset.safeWidth) / 2 / 1080,
				marginVerticalRatio: (1920 - preset.y) / 1920,
			},
		},
		captionReference: {
			fontFamily: preset.fontFamily, fontWeight: preset.fontWeight, fontSizePx: preset.fontSize,
			color: preset.color, outlineColor: preset.outlineColor, outlineWidthPx: preset.outlineWidth,
			centerXPx: preset.x, centerYPx: preset.y, safeWidthPx: preset.safeWidth, scaleXPercent: preset.scaleX,
		},
	} as const;
}

function handoffAssetUrl(jobId: string, name: string) {
	return `/api/newsroom?handoffAsset=${encodeURIComponent(name)}&job=${encodeURIComponent(jobId)}`;
}

function srtTimestamp(seconds: number) {
	const milliseconds = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(milliseconds / 3_600_000);
	const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
	const secs = Math.floor(milliseconds % 60_000 / 1000);
	const millis = milliseconds % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function handoffCaptions(sections: Record<string, unknown> | undefined, duration: number) {
	const values = HANDOFF_SECTIONS.map((key) => String(sections?.[key] ?? "").trim()).filter(Boolean);
	if (!values.length) return "";
	const cueDuration = duration / values.length;
	return values.map((text, index) => `${index + 1}\n${srtTimestamp(index * cueDuration)} --> ${srtTimestamp((index + 1) * cueDuration)}\n${text.replace(/\r?\n/g, " ")}\n`).join("\n");
}

type PrivateHandoff = {
	versionId: string;
	project: { name: string; width: number; height: number; fps: number };
	captionPreset: typeof LOCKED_CAPTION_PRESET;
	assets: Array<{ name: string; path: string; mime: string }>;
	tracks: Array<Record<string, unknown>>;
	cues: Array<{ start: number; end: number; text: string }>;
};

function cuesToSrt(cues: PrivateHandoff["cues"]) {
	return cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text.replace(/\r\n?/g, "\n")}\n`).join("\n");
}

async function containedRealFile(root: string, target: string) {
	const lexical = contained(root, target);
	const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(lexical)]);
	if (!fileReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Handoff asset escapes its workspace");
	const info = await stat(fileReal);
	if (!info.isFile()) throw new Error("Handoff asset is unavailable");
	return { filePath: fileReal, info };
}

async function readPrivateHandoff(root: string, render: Record<string, unknown> | undefined): Promise<PrivateHandoff | null> {
	if (typeof render?.handoffPath !== "string") return null;
	const privateRoot = path.join(root, "out", ".private");
	const handoffPath = contained(privateRoot, render.handoffPath);
	const safe = await containedRealFile(privateRoot, handoffPath);
	const value = JSON.parse(await readFile(safe.filePath, "utf8")) as Partial<PrivateHandoff>;
	if (
		typeof value.versionId !== "string"
		|| !value.project
		|| JSON.stringify(value.captionPreset) !== JSON.stringify(LOCKED_CAPTION_PRESET)
		|| !Array.isArray(value.assets)
		|| !Array.isArray(value.tracks)
		|| !Array.isArray(value.cues)
	) throw new Error("Private producer handoff is invalid");
	return value as PrivateHandoff;
}

async function handoffBundle(root: string, jobId: string) {
	const dir = jobDirectory(root, jobId);
	const rawStatus = JSON.parse(await readFile(path.join(dir, "status.json"), "utf8")) as Record<string, unknown>;
	if (rawStatus.state !== "completed") return NextResponse.json({ error: "Render is not ready" }, { status: 409 });
	const request = JSON.parse(await readFile(path.join(dir, "request.json"), "utf8")) as Record<string, unknown>;
	const candidate = (rawStatus.candidate ?? request.candidate) as Record<string, unknown> | undefined;
	const draft = request.draft as Record<string, unknown> | undefined;
	const sections = draft?.sections as Record<string, unknown> | undefined;
	const assetsDir = contained(dir, path.join(dir, "assets"));
	const names = (await readdir(assetsDir).catch(() => []))
		.filter((name) => !name.includes("/") && !name.includes("\\") && HANDOFF_ASSET_EXTENSIONS[path.extname(name).toLowerCase()]);
	const render = rawStatus.render as Record<string, unknown> | undefined;
	const privateHandoff = await readPrivateHandoff(root, render);
	if (privateHandoff) {
		const assets = privateHandoff.assets.map((asset) => ({
			name: asset.name,
			url: handoffAssetUrl(jobId, asset.name),
			mime: asset.mime,
		}));
		assets.push({ name: "render.mp4", url: handoffAssetUrl(jobId, "render.mp4"), mime: "video/mp4" });
		assets.push({ name: "captions.srt", url: handoffAssetUrl(jobId, "captions.srt"), mime: "application/x-subrip" });
		return NextResponse.json({
			jobId,
			manifest: {
				project: privateHandoff.project,
				tracks: [
					...privateHandoff.tracks,
					{ type: "asset", src: "render.mp4", start: 0, duration: Number(render?.duration) },
					{
						...captionTrackFromPreset(privateHandoff.captionPreset),
						src: "captions.srt",
						start: 0,
						duration: Number(render?.duration),
					},
				],
			},
			assets,
		}, { headers: { "Cache-Control": "no-store" } });
	}
	const assets = names.map((name) => ({ name, url: handoffAssetUrl(jobId, name), mime: HANDOFF_ASSET_EXTENSIONS[path.extname(name).toLowerCase()] }));
	const tracks: Array<Record<string, unknown>> = [];
	const imageNames = names.filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
	const videoNames = names.filter((name) => /\.(mp4|webm|mov)$/i.test(name));
	const visualNames = imageNames.length ? imageNames : videoNames;
	const configuredDuration = Number(render?.duration);
	const duration = Number.isFinite(configuredDuration) && configuredDuration > 0 ? Math.min(configuredDuration, 14_400) : 21;
	if (visualNames.length) {
		const visualDuration = duration / visualNames.length;
		for (let index = 0; index < visualNames.length; index += 1) {
			tracks.push({
				type: "video",
				src: visualNames[index],
				start: index * visualDuration,
				duration: visualDuration,
				sourceStart: 0,
				loop: true,
				videoStyle: REFERENCE_MEDIA_STYLE,
			});
		}
	}
	if (render?.renderPath && render?.thumbnailPath) {
		assets.push({ name: "render.mp4", url: handoffAssetUrl(jobId, "render.mp4"), mime: "video/mp4" });
		assets.push({ name: "thumbnail.png", url: handoffAssetUrl(jobId, "thumbnail.png"), mime: "image/png" });
		tracks.unshift(visualNames.length
			? { type: "asset", src: "render.mp4", duration }
			: { type: "video", src: "render.mp4", start: 0, duration });
		tracks.push({ type: "asset", src: "thumbnail.png", duration });
	}
	const title = String(candidate?.title || `Newsroom ${jobId}`).trim().slice(0, 240);
	const titleWords = title.split(/\s+/);
	const splitAt = Math.max(1, Math.ceil(titleWords.length / 2));
	const titleLine1 = titleWords.slice(0, splitAt).join(" ");
	const titleLine2 = titleWords.slice(splitAt).join(" ") || "핵심 브리핑";
	tracks.push({
		type: "text", text: titleLine1, start: 0, duration,
		textStyle: { fontFamily: "Noto Sans KR", fontWeight: "bold", fontSizePx: 120, color: "#27D3E8", textAlign: "center", centerXPx: 540, topPx: 201, lineHeight: 1, background: false },
	});
	tracks.push({
		type: "text", text: titleLine2, start: 0, duration,
		textStyle: { fontFamily: "Noto Sans KR", fontWeight: "bold", fontSizePx: 143, color: "#FFFFFF", textAlign: "center", centerXPx: 540, topPx: 326, lineHeight: 1, background: false },
	});
	const captions = handoffCaptions(sections, duration);
	if (captions) {
		assets.push({ name: "captions.srt", url: handoffAssetUrl(jobId, "captions.srt"), mime: "application/x-subrip" });
		tracks.push({
			...captionTrackFromPreset(),
			src: "captions.srt",
			start: 0,
			duration,
		});
	}
	return NextResponse.json({
		jobId,
		manifest: {
			project: { name: title, width: 1080, height: 1920, fps: 30 },
			tracks,
		},
		assets,
	}, { headers: { "Cache-Control": "no-store" } });
}

async function handoffAssetResponse(root: string, jobId: string, name: string) {
	const dir = jobDirectory(root, jobId);
	if (!name || name !== path.basename(name)) return NextResponse.json({ error: "Invalid handoff asset" }, { status: 400 });
	const raw = JSON.parse(await readFile(path.join(dir, "status.json"), "utf8")) as Record<string, unknown>;
	if (raw.state !== "completed") return NextResponse.json({ error: "Render is not ready" }, { status: 404 });
	const render = raw.render as Record<string, unknown> | undefined;
	if (name === "captions.srt") {
		const privateHandoff = await readPrivateHandoff(root, render);
		if (privateHandoff) {
			return new NextResponse(cuesToSrt(privateHandoff.cues), { headers: { "Content-Type": "application/x-subrip; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
		}
		const request = JSON.parse(await readFile(path.join(dir, "request.json"), "utf8")) as Record<string, unknown>;
		const draft = request.draft as Record<string, unknown> | undefined;
		const sections = draft?.sections as Record<string, unknown> | undefined;
		const configuredDuration = Number(render?.duration);
		const duration = Number.isFinite(configuredDuration) && configuredDuration > 0 ? Math.min(configuredDuration, 14_400) : 21;
		return new NextResponse(handoffCaptions(sections, duration), { headers: { "Content-Type": "application/x-subrip; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
	}
	let filePath: string;
	let allowedRoot: string;
	const privateHandoff = await readPrivateHandoff(root, render);
	const privateAsset = privateHandoff?.assets.find((asset) => asset.name === name);
	if (privateAsset) {
		allowedRoot = path.join(root, "out", ".private");
		filePath = contained(allowedRoot, path.resolve(root, privateAsset.path));
	} else if (name === "render.mp4" || name === "thumbnail.png") {
		const privateRoot = path.join(root, "out", ".private");
		allowedRoot = privateRoot;
		filePath = contained(privateRoot, String(name === "render.mp4" ? render?.renderPath : render?.thumbnailPath));
	} else {
		const extension = path.extname(name).toLowerCase();
		if (!HANDOFF_ASSET_EXTENSIONS[extension]) return NextResponse.json({ error: "Unsupported handoff asset" }, { status: 400 });
		allowedRoot = path.join(dir, "assets");
		filePath = contained(allowedRoot, path.join(allowedRoot, name));
	}
	const safeFile = await containedRealFile(allowedRoot, filePath);
	const mime = name === "render.mp4" ? "video/mp4" : name === "thumbnail.png" ? "image/png" : HANDOFF_ASSET_EXTENSIONS[path.extname(name).toLowerCase()] || "application/octet-stream";
	return new NextResponse(Readable.toWeb(createReadStream(safeFile.filePath)) as unknown as ReadableStream, { headers: { "Content-Type": mime, "Content-Length": String(safeFile.info.size), "Content-Disposition": `inline; filename="${path.basename(name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: NextRequest) {
	try {
		const root = findAutomationRoot();
		const asset = request.nextUrl.searchParams.get("asset");
		if (request.nextUrl.searchParams.get("research-refresh") === "status") {
			return NextResponse.json(publicResearchRefreshStatus(await readResearchRefreshStatus(root)), { headers: { "Cache-Control": "no-store" } });
		}
		const jobId = request.nextUrl.searchParams.get("job");
		const handoff = request.nextUrl.searchParams.get("handoff");
		const handoffAsset = request.nextUrl.searchParams.get("handoffAsset");
		if (handoff !== null && !JOB_ID.test(handoff)) {
			return NextResponse.json({ error: "Invalid newsroom job id" }, { status: 400 });
		}
		if (handoffAsset !== null && (!jobId || !JOB_ID.test(jobId))) {
			return NextResponse.json({ error: "Invalid newsroom job id" }, { status: 400 });
		}
		const handoffJobId = handoff || jobId;
		if (handoff && handoffJobId) return await handoffBundle(root, handoffJobId);
		if (handoffAsset && jobId) return await handoffAssetResponse(root, jobId, handoffAsset);
		if ((asset === "video" || asset === "thumbnail") && jobId) return await assetResponse(root, jobId, asset);
		if (jobId) {
			const parsed = JSON.parse(await readFile(path.join(jobDirectory(root, jobId), "status.json"), "utf8")) as Record<string, unknown>;
			return NextResponse.json(safeStatus(parsed), { headers: { "Cache-Control": "no-store" } });
		}
		if (request.nextUrl.searchParams.get("codex") === "status") {
			const result = JSON.parse(await runCli(root, ["codex-status"]));
			return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
		}
		const query = request.nextUrl.searchParams.get("q")?.slice(0, 120) || "";
		const adapters = request.nextUrl.searchParams.get("adapters")?.slice(0, 120);
		const args = ["candidates", "--query", query, "--limit", "24"];
		if (adapters) args.push("--adapters", adapters);
		const result = JSON.parse(await runCli(root, args));
		const registry = await loadNewsroomRegistry();
		return NextResponse.json({ ...result, projects: registry.projects }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
		return NextResponse.json({ error: sanitizePublicError(error) || "Newsroom request failed" }, { status: missing ? 404 : 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const root = findAutomationRoot();
		const contentType = request.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
			const body = await request.json() as { action?: unknown; slug?: unknown; jobId?: unknown; candidate?: unknown; url?: unknown; days?: unknown; reason?: unknown; editorialDirection?: unknown; editorialIntent?: unknown };
			if (body.action === "resume-production") {
				const persisted = await loadActionWorkflow(root, body.slug, true);
				const orchestration = persisted.workflow.productionOrchestration && typeof persisted.workflow.productionOrchestration === "object" && !Array.isArray(persisted.workflow.productionOrchestration) ? persisted.workflow.productionOrchestration as Record<string, unknown> : null;
				const jobId = typeof body.jobId === "string" ? body.jobId : "";
				if (!orchestration || orchestration.jobId !== jobId || !JOB_ID.test(jobId)) return NextResponse.json({ error: "Production job is not bound to this finalized workflow" }, { status: 409 });
				const authorityHash = String(orchestration.authorityHash || "");
				const status = JSON.parse(await readFile(path.join(jobDirectory(root, jobId), "status.json"), "utf8")) as Record<string, unknown>;
				if (status.authorityHash !== authorityHash) return NextResponse.json({ error: "Production job authority does not match the workflow" }, { status: 409 });
				if (status.state === "completed" || (status.state !== "running" && status.retryAfter && Date.parse(String(status.retryAfter)) > Date.now())) return NextResponse.json(safeStatus(status), { headers: { "Cache-Control": "no-store" } });
				const claim = JSON.parse(await runCli(root, ["orchestration-claim", "--job", jobId, "--authority", authorityHash, "--pid", String(process.pid)])) as Record<string, unknown>;
				if (claim.claimed === true && typeof claim.leaseId === "string") startProductionOrchestration(root, jobId, claim.leaseId);
				return NextResponse.json({ ...safeStatus(status), resumeClaimed: claim.claimed === true }, { status: claim.claimed === true ? 202 : 200, headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "refresh-research") {
				const status = await startResearchRefresh(root);
				return NextResponse.json(publicResearchRefreshStatus(status), { status: status.state === "failed" ? 503 : 202, headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "collect-research") {
				const output = await runCli(root, ["collect-research"]);
				return NextResponse.json(JSON.parse(output), { headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "backfill-research") {
				if (body.days !== undefined && (typeof body.days !== "number" || !Number.isInteger(body.days) || body.days < 1 || body.days > 30)) {
					return NextResponse.json({ error: "days must be an integer from 1 through 30" }, { status: 400 });
				}
				const output = await runCli(root, ["backfill-research", "--days", String(body.days ?? 30)]);
				return NextResponse.json(JSON.parse(output), { headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "semantic-select" || body.action === "analyze-research") {
				const output = await runCli(root, ["semantic-select"]);
				const result = JSON.parse(output);
				return NextResponse.json(result, { status: result?.ok === false ? 503 : 200, headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "promote-research") {
				if (typeof body.url !== "string" || body.url.length > 2_048) return NextResponse.json({ error: "An exact candidate URL is required" }, { status: 400 });
				const promoted = JSON.parse(await runCli(root, ["promote-research", "--url", body.url])) as { dossier?: Record<string, unknown> };
				if (promoted.dossier && typeof promoted.dossier.slug === "string" && typeof promoted.dossier.title === "string") {
					await upsertNewsroomProject({ slug: promoted.dossier.slug, title: promoted.dossier.title, source: typeof promoted.dossier.source === "string" ? promoted.dossier.source : undefined, url: typeof promoted.dossier.url === "string" ? promoted.dossier.url : undefined, publishedAt: typeof promoted.dossier.publishedAt === "string" ? promoted.dossier.publishedAt : undefined, status: "active-review", candidate: promoted.dossier, updatedAt: new Date().toISOString() });
				}
				return NextResponse.json({ ...promoted, projects: (await loadNewsroomRegistry()).projects }, { headers: { "Cache-Control": "no-store" } });
			}
			if (body.action === "reject-research") {
				if (!body.candidate || typeof body.candidate !== "object") return NextResponse.json({ error: "제외할 후보 정보가 필요합니다" }, { status: 400 });
				if (typeof body.reason !== "string" || body.reason.length > 80) return NextResponse.json({ error: "올바른 제외 이유를 선택하세요" }, { status: 400 });
				const payload = JSON.stringify({ candidate: body.candidate, reason: body.reason });
				if (payload.length > 20_000) return NextResponse.json({ error: "후보 정보가 너무 큽니다" }, { status: 413 });
				const output = await runCli(root, ["reject-research"], payload);
				return NextResponse.json(JSON.parse(output), { headers: { "Cache-Control": "no-store" } });
			}
			if (body.action !== "draft" && body.action !== "media") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
			if (body.action === "draft") {
				const persisted = await loadActionWorkflow(root, body.slug);
				if (persisted.workflow.draftFinalized === true) throw new Error("확정된 Stage 03 대본 권위는 다시 생성하거나 덮어쓸 수 없습니다.");
				const editorialDirection = hasExplicitEditorialDirection(body) || body.editorialIntent !== undefined
					? body.editorialDirection
					: await readDefaultEditorialDirection({ root, slug: persisted.slug });
				const policyPackage = buildDraftPolicyPackage({ candidate: persisted.candidate, researchSnapshot: persisted.snapshot, legalReport: persisted.report, editorialDirection, editorialIntent: body.editorialIntent });
				const output = await runCli(root, ["draft"], JSON.stringify(policyPackage));
				const generated = JSON.parse(output) as Record<string, unknown>;
				return NextResponse.json({ ...generated, ...(editorialDirection === undefined ? {} : { editorialDirection }), editorialIntent: policyPackage.generationGuidance.editorialIntent }, { headers: { "Cache-Control": "no-store" } });
			}
			const persisted = await loadActionWorkflow(root, body.slug);
			const output = await runCli(root, ["media"], JSON.stringify(persisted.candidate));
			return NextResponse.json(JSON.parse(output), { headers: { "Cache-Control": "no-store" } });
		}
		if (!contentType.includes("multipart/form-data")) return NextResponse.json({ error: "Expected JSON or multipart form data" }, { status: 415 });
		return NextResponse.json({ error: "Legacy render is disabled. Finalize the script to start authority-bound private production." }, { status: 410, headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: sanitizePublicError(error) || "Newsroom mutation failed" }, { status: 400 });
	}
}
