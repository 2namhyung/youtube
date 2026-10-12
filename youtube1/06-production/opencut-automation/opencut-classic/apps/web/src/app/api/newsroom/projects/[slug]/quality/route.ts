import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
	assertNewsroomSlug,
	authoritativeScriptText,
	ensureAutomationOutput,
	exactApprovalMatches,
	isCanonicalNewsroomProject,
	qualityFile,
	readWorkflow,
	renderBindingSha256,
	renderPayload,
	sha256,
	writeWorkflow,
} from "@/newsroom/project-runtime";
import { findYoutubeWorkspace } from "@/newsroom/workspace-server";

/* eslint-disable opencut/prefer-object-params */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
type Finding = { id: string; reason?: string; claim?: string };
type Check = { id: string; category: string; label: string; status: "passed" | "warning" | "failed" | "blocked" | "pending"; evidence: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function readCanonicalReport() {
	const file = path.join(findYoutubeWorkspace(), "07-quality-assurance", "runs", "latest-stage07-audit.json");
	try { return JSON.parse(await readFile(file, "utf8")) as unknown; } catch { return null; }
}

async function runCanonicalAudit() {
	const root = findYoutubeWorkspace();
	await execFileAsync(process.execPath, [path.join(root, "07-quality-assurance", "run-stage07-audit.mjs")], {
		cwd: root,
		timeout: 180_000,
		maxBuffer: 2 * 1024 * 1024,
	});
}

async function writeQualityReport(slug: string, report: unknown) {
	const destination = qualityFile(slug);
	await mkdir(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined);
	}
}

async function readQualityReport(slug: string) {
	try { return JSON.parse(await readFile(qualityFile(slug), "utf8")) as unknown; } catch { return null; }
}

async function dynamicAudit(slug: string) {
	const workflow = await readWorkflow(slug);
	const { status, metadata } = renderPayload(workflow);
	const checks: Check[] = [];
	const blockers: Finding[] = [];
	const warnings: Finding[] = [];
	const script = (await authoritativeScriptText(slug, workflow)).text;
	const versionId = typeof metadata?.versionId === "string" ? metadata.versionId : "unrendered";
	let renderPath: string | null = null;
	let thumbnailPath: string | null = null;
	let handoffPath: string | null = null;
	let renderSha256 = "";
	let thumbnailSha256 = "";
	let handoffSha256: string | null = null;

	const finalized = workflow.draftFinalized === true && script.length > 0;
	checks.push({ id: "script-finalized", category: "대본", label: "최종 대본이 확정됨", status: finalized ? "passed" : "blocked", evidence: { finalized, characters: script.length } });
	if (!finalized) blockers.push({ id: "script-not-finalized", reason: "03 단계에서 대본을 확정해야 합니다." });

	try {
		if (status?.state !== "completed" || typeof metadata?.renderPath !== "string") throw new Error("Completed render metadata is unavailable.");
		renderPath = await ensureAutomationOutput(metadata.renderPath);
		renderSha256 = sha256(await readFile(renderPath));
		checks.push({ id: "render-integrity", category: "영상", label: "완성 영상 파일과 버전이 존재함", status: "passed", evidence: { versionId, renderPath, renderSha256 } });
	} catch (error) {
		checks.push({ id: "render-integrity", category: "영상", label: "완성 영상 파일과 버전이 존재함", status: "blocked", evidence: error instanceof Error ? error.message : String(error) });
		blockers.push({ id: "render-missing", reason: "06 단계의 완성 영상이 없거나 유효하지 않습니다." });
	}

	try {
		if (typeof metadata?.thumbnailPath !== "string") throw new Error("Thumbnail metadata is unavailable.");
		thumbnailPath = await ensureAutomationOutput(metadata.thumbnailPath);
		thumbnailSha256 = sha256(await readFile(thumbnailPath));
		checks.push({ id: "thumbnail-integrity", category: "표지", label: "썸네일 파일이 존재함", status: "passed", evidence: { thumbnailPath } });
	} catch (error) {
		checks.push({ id: "thumbnail-integrity", category: "표지", label: "썸네일 파일이 존재함", status: "blocked", evidence: error instanceof Error ? error.message : String(error) });
		blockers.push({ id: "thumbnail-missing", reason: "현재 영상과 연결된 썸네일이 필요합니다." });
	}

	try {
		if (typeof metadata?.handoffPath === "string" && metadata.handoffPath) {
			handoffPath = await ensureAutomationOutput(metadata.handoffPath);
			handoffSha256 = sha256(await readFile(handoffPath));
		}
		checks.push({ id: "handoff-integrity", category: "source", label: "Exact editable handoff binding", status: "passed", evidence: { handoffPath, handoffSha256 } });
	} catch (error) {
		checks.push({ id: "handoff-integrity", category: "source", label: "Exact editable handoff binding", status: "blocked", evidence: error instanceof Error ? error.message : String(error) });
		blockers.push({ id: "handoff-invalid", reason: "The render's declared handoff is missing or invalid." });
	}

	const candidate = isRecord(workflow.candidate) ? workflow.candidate : {};
	const verification = isRecord(candidate.verification) ? candidate.verification : null;
	const missing = Array.isArray(verification?.missing) ? verification.missing.map(String).filter(Boolean) : [];
	checks.push({ id: "editorial-verification", category: "사실", label: "추가 확인 항목 검토", status: missing.length ? "warning" : "passed", evidence: { missing } });
	if (missing.length) warnings.push(...missing.map((claim, index) => ({ id: `verification-${index + 1}`, claim })));

	const scriptSha256 = sha256(script);
	const renderRegistrySha256 = renderPath && thumbnailPath && renderSha256 && thumbnailSha256
		? renderBindingSha256({ versionId, renderPath, thumbnailPath, handoffPath, renderSha256, thumbnailSha256, handoffSha256 })
		: "";
	const qa = isRecord(workflow.qa) ? workflow.qa : null;
	const approvalMatches = exactApprovalMatches({ approval: qa, binding: { versionId, renderPath: renderPath || "", thumbnailPath: thumbnailPath || "", handoffPath, renderSha256, thumbnailSha256, handoffSha256, renderRegistrySha256, scriptSha256 } });
	checks.push({ id: "human-playback-approval", category: "사람 검수", label: "최종 영상 재생 검수", status: approvalMatches ? "passed" : "pending", evidence: qa });
	if (!approvalMatches) blockers.push({ id: "human-playback-approval-required", reason: "현재 영상과 대본을 사람이 끝까지 재생 검수해야 합니다." });

	const publishable = blockers.length === 0;
	return {
		schemaVersion: 2,
		generatedAt: new Date().toISOString(),
		slug,
		versionId,
		status: publishable ? "approved" : "blocked",
		publishable,
		uploadBlocked: !publishable,
		renderSha256,
		thumbnailSha256,
		handoffSha256,
		renderRegistrySha256,
		scriptSha256,
		renderPath,
		thumbnailPath,
		checks,
		blockers,
		warnings,
		approval: approvalMatches ? qa : null,
	};
}

async function approveDynamic(slug: string, reviewer: string) {
	const preliminary = await dynamicAudit(slug);
	const blockers = preliminary.blockers.filter((item) => item.id !== "human-playback-approval-required");
	if (blockers.length) throw new Error("Resolve blocking QA findings before approving playback.");
	const workflow = await readWorkflow(slug);
	const now = new Date().toISOString();
	const stages = { ...(isRecord(workflow.stages) ? workflow.stages : {}) };
	stages["07"] = { status: "ready", completedAt: now };
	stages["08"] = { status: "in-progress" };
	await writeWorkflow(slug, {
		...workflow,
		updatedAt: now,
		stages,
		qa: {
			schemaVersion: 2,
			approved: true,
			approvedAt: now,
			reviewer,
			versionId: preliminary.versionId,
			renderSha256: preliminary.renderSha256,
			thumbnailSha256: preliminary.thumbnailSha256,
			handoffSha256: preliminary.handoffSha256,
			renderRegistrySha256: preliminary.renderRegistrySha256,
			scriptSha256: preliminary.scriptSha256,
		},
	});
	return dynamicAudit(slug);
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
	try {
		const { slug: rawSlug } = await context.params;
		const slug = assertNewsroomSlug(rawSlug);
		if (await isCanonicalNewsroomProject(slug)) return NextResponse.json({ report: await readCanonicalReport() }, { headers: { "Cache-Control": "no-store" } });
		await readWorkflow(slug);
		return NextResponse.json({ report: await readQualityReport(slug) }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Quality report unavailable." }, { status: 404 });
	}
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
	try {
		const { slug: rawSlug } = await context.params;
		const slug = assertNewsroomSlug(rawSlug);
		let body: { action?: string; reviewer?: string } = {};
		try {
			const parsed: unknown = await request.json();
			if (isRecord(parsed)) body = { action: typeof parsed.action === "string" ? parsed.action : undefined, reviewer: typeof parsed.reviewer === "string" ? parsed.reviewer : undefined };
		} catch { /* empty body requests a fresh audit */ }

		if (await isCanonicalNewsroomProject(slug)) {
			await runCanonicalAudit();
			if (body.action === "approve") {
				const parsed = await readCanonicalReport();
				if (!isRecord(parsed) || typeof parsed.versionId !== "string" || typeof parsed.renderRegistrySha256 !== "string" || typeof parsed.renderSha256 !== "string" || typeof parsed.thumbnailSha256 !== "string" || typeof parsed.scriptSha256 !== "string") throw new Error("QA report is missing version/hash binding.");
				const blockers = Array.isArray(parsed.blockers) ? parsed.blockers.filter(isRecord) : [];
				if (blockers.some((item) => item.id !== "human-playback-approval-required")) throw new Error("Resolve blocking QA findings before approving playback.");
				const approvalPath = path.join(findYoutubeWorkspace(), "07-quality-assurance", "runs", "human-approval.json");
				await mkdir(path.dirname(approvalPath), { recursive: true });
				const approval = { schemaVersion: 2, versionId: parsed.versionId, renderRegistrySha256: parsed.renderRegistrySha256, renderSha256: parsed.renderSha256, thumbnailSha256: parsed.thumbnailSha256, handoffSha256: typeof parsed.handoffSha256 === "string" ? parsed.handoffSha256 : null, scriptSha256: parsed.scriptSha256, reviewer: body.reviewer?.trim() || "local-owner", approvedAt: new Date().toISOString() };
				const temporary = `${approvalPath}.${randomUUID()}.tmp`;
				try {
					await writeFile(temporary, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
					await rename(temporary, approvalPath);
				} finally {
					await rm(temporary, { force: true }).catch(() => undefined);
				}
				await runCanonicalAudit();
			}
			return NextResponse.json({ report: await readCanonicalReport() }, { headers: { "Cache-Control": "no-store" } });
		}

		const report = body.action === "approve" ? await approveDynamic(slug, body.reviewer?.trim() || "local-owner") : await dynamicAudit(slug);
		await writeQualityReport(slug, report);
		return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Quality audit failed.";
		return NextResponse.json({ error: message }, { status: message.includes("Resolve blocking") ? 409 : 500 });
	}
}
