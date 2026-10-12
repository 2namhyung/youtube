import { existsSync, lstatSync } from "node:fs";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";

export type RenderMetadata = { versionId: string; path: string; thumbnailPath: string; fileName: string; thumbnailFileName: string; thumbnail: string; title: string; duration: number; frames: number; fps: number; resolution: { width: number; height: number }; templateId: string; timestamp: string; handoffFile?: string; sourceIntegrity?: { scriptSha256?: string; [key: string]: unknown }; [key: string]: unknown };
const allowedVideo = new Set([".mp4"]); const allowedThumb = new Set([".png"]);
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function safeRelativeAsset(value: unknown) { return typeof value === "string" && value.length <= 300 && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."); }
function validMedia(value: unknown) {
	if (!isRecord(value) || !isRecord(value.source) || Object.keys(value.source).some((key) => !["publisher", "candidateVideoId", "sourceUrl", "articleUrl", "attribution", "sha256"].includes(key)) || typeof value.source.publisher !== "string" || value.source.publisher.length > 200 || typeof value.source.candidateVideoId !== "string" || value.source.candidateVideoId.length > 100 || typeof value.source.sourceUrl !== "string" || value.source.sourceUrl.length > 2000 || !value.source.sourceUrl.startsWith("https://") || typeof value.source.articleUrl !== "string" || value.source.articleUrl.length > 2000 || !value.source.articleUrl.startsWith("https://") || typeof value.source.attribution !== "string" || value.source.attribution.length > 2000 || typeof value.source.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.source.sha256)) return false;
	const replacements = value.sceneReplacements; if (!isRecord(replacements) || Object.keys(replacements).length > 64 || Object.entries(replacements).some(([key, asset]) => !/^\d{1,3}$/.test(key) || !safeRelativeAsset(asset))) return false;
	const clips = value.clips; if (!Array.isArray(clips) || clips.length > 64 || clips.some((clip) => !isRecord(clip) || !safeRelativeAsset(clip.path) || typeof clip.muted !== "boolean" || typeof clip.start !== "number" || typeof clip.end !== "number" || !Number.isFinite(clip.start) || !Number.isFinite(clip.end) || clip.start < 0 || clip.end <= clip.start || clip.end - clip.start > 600)) return false;
	return true;
}
function validVideoEncoding(value: unknown) {
	return isRecord(value) && Object.keys(value).every((key) => ["codec", "preset", "crf", "pixelFormat"].includes(key)) && value.codec === "libx264" && typeof value.preset === "string" && value.preset.length <= 40 && Number.isFinite(value.crf) && Number(value.crf) >= 0 && Number(value.crf) <= 51 && typeof value.pixelFormat === "string" && value.pixelFormat.length <= 40;
}
function validSourceIntegrity(value: unknown) {
	if (!isRecord(value) || Object.keys(value).some((key) => !["authority", "slug", "status", "finalizedAt", "scriptSha256", "projectConfigSha256", "projectAuthority", "contractAuthority", "contractSha256", "narrationConfigSha256", "visualConfigSha256", "sourceCueCount"].includes(key))) return false;
	if (!safeRelativeAsset(value.authority) || value.status !== "final" || typeof value.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(value.slug) || typeof value.finalizedAt !== "string" || value.finalizedAt.length > 80 || !Number.isInteger(value.sourceCueCount) || Number(value.sourceCueCount) < 1 || Number(value.sourceCueCount) > 500) return false;
	if (![value.scriptSha256, value.projectConfigSha256, value.narrationConfigSha256, value.visualConfigSha256].every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash))) return false;
	if (value.slug !== "jeju-school-intrusion") return safeRelativeAsset(value.projectAuthority) && safeRelativeAsset(value.contractAuthority) && typeof value.contractSha256 === "string" && /^[a-f0-9]{64}$/i.test(value.contractSha256);
	return (value.projectAuthority === undefined || safeRelativeAsset(value.projectAuthority)) && (value.contractAuthority === undefined || safeRelativeAsset(value.contractAuthority)) && (value.contractSha256 === undefined || (typeof value.contractSha256 === "string" && /^[a-f0-9]{64}$/i.test(value.contractSha256)));
}
function validReleaseGate(value: unknown) {
	if (!isRecord(value) || Object.keys(value).some((key) => !["publishable", "releaseStatus", "uploadBlocked", "blockers", "approval"].includes(key))) return false;
	const blocked = value.publishable === false && value.releaseStatus === "preview" && value.uploadBlocked === true;
	const approved = value.publishable === true && value.releaseStatus === "approved" && value.uploadBlocked === false;
	if ((!blocked && !approved) || !Array.isArray(value.blockers) || value.blockers.length > 20 || (blocked && value.blockers.length < 1) || (approved && value.blockers.length !== 0)) return false;
	const blockersValid = value.blockers.every((blocker) => isRecord(blocker)
		&& Object.keys(blocker).every((key) => ["id", "stage", "severity", "claim", "reason", "authority"].includes(key))
		&& typeof blocker.id === "string" && blocker.id.length > 0 && blocker.id.length <= 200
		&& typeof blocker.stage === "string" && blocker.stage.length > 0 && blocker.stage.length <= 200
		&& blocker.severity === "block"
		&& typeof blocker.claim === "string" && blocker.claim.length > 0 && blocker.claim.length <= 2000
		&& typeof blocker.reason === "string" && blocker.reason.length > 0 && blocker.reason.length <= 5000
		&& isRecord(blocker.authority)
		&& Object.keys(blocker.authority).every((key) => ["case", "url"].includes(key))
		&& typeof blocker.authority.case === "string" && blocker.authority.case.length > 0 && blocker.authority.case.length <= 500
		&& typeof blocker.authority.url === "string" && blocker.authority.url.startsWith("https://") && blocker.authority.url.length <= 2000);
	if (!blockersValid) return false;
	if (blocked) return value.approval === undefined;
	if (!isRecord(value.approval) || Object.keys(value.approval).some((key) => !["reportVersionId", "reportSha256", "scriptSha256", "reviewer", "approvedAt"].includes(key))) return false;
	return typeof value.approval.reportVersionId === "string" && value.approval.reportVersionId.length > 0 && value.approval.reportVersionId.length <= 200
		&& typeof value.approval.reportSha256 === "string" && /^[a-f0-9]{64}$/i.test(value.approval.reportSha256)
		&& typeof value.approval.scriptSha256 === "string" && /^[a-f0-9]{64}$/i.test(value.approval.scriptSha256)
		&& typeof value.approval.reviewer === "string" && value.approval.reviewer.trim().length >= 2 && value.approval.reviewer.length <= 200
		&& typeof value.approval.approvedAt === "string" && !Number.isNaN(Date.parse(value.approval.approvedAt));
}
function validBgm(value: unknown) {
	return isRecord(value)
		&& Object.keys(value).every((key) => ["status", "sourcePath", "volumeDb", "duckUnderNarration", "durationSeconds", "provenance"].includes(key))
		&& (value.status === "ready" || value.status === "pending" || value.status === "unavailable")
		&& (value.sourcePath === undefined || typeof value.sourcePath === "string")
		&& (value.volumeDb === undefined || (Number.isFinite(value.volumeDb) && Number(value.volumeDb) >= -60 && Number(value.volumeDb) <= 0))
		&& (value.duckUnderNarration === undefined || typeof value.duckUnderNarration === "boolean")
		&& (value.durationSeconds === undefined || (Number.isFinite(value.durationSeconds) && Number(value.durationSeconds) > 0))
		&& (value.provenance === undefined || value.provenance === null || typeof value.provenance === "string");
}
function validThumbnailOverride(value: unknown) {
	if (!isRecord(value) || Object.keys(value).some((key) => !["image", "sha256", "source", "prompt", "provenance"].includes(key))) return false;
	if (typeof value.image !== "string" || value.image.length < 1 || value.image.length > 500 || path.isAbsolute(value.image) || value.image.includes("\0") || path.extname(value.image).toLowerCase() !== ".png") return false;
	if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) return false;
	if (typeof value.source !== "string" || value.source.length < 1 || value.source.length > 200) return false;
	for (const key of ["prompt", "provenance"]) if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length < 1 || value[key].length > 5000)) return false;
	return true;
}
export function validRecord(value: unknown): value is RenderMetadata {
	const keys = new Set(["versionId", "path", "thumbnailPath", "fileName", "thumbnailFileName", "thumbnail", "thumbnailOverride", "videoUrl", "thumbnailUrl", "title", "duration", "frames", "fps", "resolution", "videoEncoding", "template", "templateId", "timestamp", "handoffFile", "sourceIntegrity", "narrationProvider", "bgm", "media", "publishable", "releaseStatus", "releaseGate"]);
	if (!isRecord(value) || Object.keys(value).some((key) => !keys.has(key)) || typeof value.versionId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value.versionId) || typeof value.path !== "string" || typeof value.thumbnailPath !== "string" || typeof value.fileName !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(value.fileName) || path.basename(value.fileName) !== value.fileName || !allowedVideo.has(path.extname(value.fileName).toLowerCase()) || typeof value.thumbnailFileName !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(value.thumbnailFileName) || path.basename(value.thumbnailFileName) !== value.thumbnailFileName || !allowedThumb.has(path.extname(value.thumbnailFileName).toLowerCase())) return false;
	return typeof value.title === "string" && value.title.length <= 500 && (value.thumbnailOverride === undefined || validThumbnailOverride(value.thumbnailOverride)) && (!('handoffFile' in value) || (typeof value.handoffFile === "string" && path.basename(value.handoffFile) === value.handoffFile && /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(value.handoffFile))) && (value.sourceIntegrity === undefined || validSourceIntegrity(value.sourceIntegrity)) && (value.videoEncoding === undefined || validVideoEncoding(value.videoEncoding)) && (value.narrationProvider === undefined || isRecord(value.narrationProvider)) && (value.bgm === undefined || validBgm(value.bgm)) && (value.media === undefined || validMedia(value.media)) && (value.releaseGate === undefined || (isRecord(value.releaseGate) && validReleaseGate(value.releaseGate) && value.publishable === value.releaseGate.publishable && value.releaseStatus === value.releaseGate.releaseStatus)) && value.thumbnail === value.thumbnailFileName && (!('videoUrl' in value) || (typeof value.videoUrl === "string" && value.videoUrl.startsWith("/api/renders/final?versionId="))) && (!('thumbnailUrl' in value) || (typeof value.thumbnailUrl === "string" && value.thumbnailUrl.startsWith("/api/renders/final/thumbnail?versionId="))) && typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration > 0 && typeof value.frames === "number" && Number.isInteger(value.frames) && value.frames > 0 && value.fps === 30 && isRecord(value.resolution) && Object.keys(value.resolution).every((key) => key === "width" || key === "height") && value.resolution.width === 1080 && value.resolution.height === 1920 && typeof value.templateId === "string" && value.templateId.length <= 100 && typeof value.timestamp === "string";
}
function hasEnvironmentOverride(name: string) { return Object.prototype.hasOwnProperty.call(process.env, name); }
function registryCandidates() { if (hasEnvironmentOverride("OPENCUT_RENDER_REGISTRY")) return [process.env.OPENCUT_RENDER_REGISTRY ?? ""]; const candidates: string[] = []; let directory = process.cwd(); for (let depth = 0; depth < 6; depth += 1) { candidates.push(path.join(directory, "out", "latest-render.json")); const parent = path.dirname(directory); if (parent === directory) break; directory = parent; } return candidates; }
async function safeRead(options: { candidate: string; override?: unknown }) {
	const { candidate } = options;
	try { if (!existsSync(candidate) || !lstatSync(candidate).isFile()) return null; } catch { return null; }
	let parsed: unknown = options.override;
	try { if (!Object.prototype.hasOwnProperty.call(options, "override")) parsed = JSON.parse(await readFile(candidate, "utf8")); } catch { return null; }
	if (!validRecord(parsed)) return null;
	const root = path.resolve(process.env.OPENCUT_RENDER_ROOT || path.dirname(candidate)); const rootReal = await realpath(root).catch(() => null); if (!rootReal) return null;
	const video = path.resolve(root, parsed.fileName); const thumb = path.resolve(root, parsed.thumbnailFileName); if (path.resolve(parsed.path) !== video || path.resolve(parsed.thumbnailPath) !== thumb || path.dirname(video) !== root || path.dirname(thumb) !== root || !existsSync(video) || !existsSync(thumb)) return null;
	try { if (!lstatSync(video).isFile() || !lstatSync(thumb).isFile()) return null; } catch { return null; }
	const [videoReal, thumbReal] = await Promise.all([realpath(video).catch(() => null), realpath(thumb).catch(() => null)]); if (!videoReal || !thumbReal || !videoReal.startsWith(`${rootReal}${path.sep}`) || !thumbReal.startsWith(`${rootReal}${path.sep}`)) return null;
	return { metadata: parsed, videoPath: videoReal, thumbnailPath: thumbReal };
}
export async function getLatestRender(versionId?: string) {
	if (versionId !== undefined && !/^[A-Za-z0-9_-]+$/.test(versionId)) return null;
	for (const candidate of registryCandidates()) {
		if (versionId !== undefined) {
			try {
				const versionFile = path.join(path.dirname(candidate), "registry", "versions", `${versionId}.json`);
				if (!existsSync(versionFile)) continue;
				if (!lstatSync(versionFile).isFile()) return null;
				const selected = JSON.parse(await readFile(versionFile, "utf8"));
				if (!isRecord(selected) || selected.versionId !== versionId) return null;
				const value = await safeRead({ candidate, override: selected });
				if (value) return value;
			} catch {
				return null;
			}
		} else {
			const value = await safeRead({ candidate });
			if (value) return value;
		}
	}
	return null;
}
export function fallbackRenderPath() { return null; }
export function hasExplicitRegistry() { return hasEnvironmentOverride("OPENCUT_RENDER_REGISTRY"); }

export async function getRenderHandoff(versionId: string) {
	if (!/^[A-Za-z0-9_-]+$/.test(versionId)) return null;
	for (const candidate of registryCandidates()) {
		const versionFile = path.join(path.dirname(candidate), "registry", "versions", `${versionId}.json`);
		try {
			const metadata = JSON.parse(await readFile(versionFile, "utf8"));
			if (!validRecord(metadata) || metadata.versionId !== versionId || typeof metadata.handoffFile !== "string") continue;
			const handoffPath = path.join(path.dirname(versionFile), metadata.handoffFile);
			if (path.basename(handoffPath) !== metadata.handoffFile || !lstatSync(handoffPath).isFile()) continue;
			return { root: path.dirname(path.dirname(candidate)), snapshot: JSON.parse(await readFile(handoffPath, "utf8")) as unknown };
		} catch { /* try the next workspace candidate */ }
	}
	return null;
}
