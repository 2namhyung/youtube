/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
import type { EditorCore } from "@/core";
import {
	importAutomationManifest,
		isValidAutomationProjectId,
		parseAutomationManifest,
		type AutomationManifest,
} from "@/automation/manifest";
import { REFERENCE_V3_CAPTION_PRESET } from "@/automation/reference-v3-contract";

export type NewsroomHandoffAsset = {
	name: string;
	url: string;
	mime: string;
	size?: number;
};

export type NewsroomHandoffBundle = {
	jobId: string;
	projectId?: string;
	manifest: AutomationManifest;
	assets: NewsroomHandoffAsset[];
};

const JOB_ID = /^[a-z0-9][a-z0-9-]{5,63}$/;
type ReferenceCaptionPreset = {
	id: string;
	fontFamily: string;
	fontWeight: number;
	fontSize: number;
	scaleX: number;
	safeWidth: number;
	maxLines: number;
	lineHeight: number;
	x: number;
	y: number;
	color: string;
	outlineColor: string;
	outlineWidth: number;
	background: string;
};

const LOCKED_CAPTION_PRESET: ReferenceCaptionPreset = REFERENCE_V3_CAPTION_PRESET;

function referenceCaptionTrack(preset: ReferenceCaptionPreset = LOCKED_CAPTION_PRESET) {
	if (JSON.stringify(preset) !== JSON.stringify(LOCKED_CAPTION_PRESET)) throw new Error("Registered render caption preset drift");
	return {
		type: "captions" as const,
		captionStyle: {
		fontSizeRatioOfPlayHeight: preset.fontSize / 1920,
		fontFamily: preset.fontFamily,
		color: preset.color,
		textAlign: "center" as const,
		fontWeight: "bold" as const,
		lineHeight: preset.lineHeight,
		background: { enabled: false, color: "#000000" },
		placement: {
			verticalAlign: "bottom" as const,
			marginLeftRatio: (1080 - preset.safeWidth) / 2 / 1080,
			marginRightRatio: (1080 - preset.safeWidth) / 2 / 1080,
			marginVerticalRatio: (1920 - preset.y) / 1920,
		},
		},
		captionReference: {
			fontFamily: preset.fontFamily,
			fontWeight: preset.fontWeight,
			fontSizePx: preset.fontSize,
			color: preset.color,
			outlineColor: preset.outlineColor,
			outlineWidthPx: preset.outlineWidth,
			centerXPx: preset.x,
			centerYPx: preset.y,
			safeWidthPx: preset.safeWidth,
			scaleXPercent: preset.scaleX,
		},
	};
}

export function isValidNewsroomJobId(value: unknown): value is string {
	return typeof value === "string" && JOB_ID.test(value);
}

export function newsroomEditorUrl(projectId: string): string {
	if (!isValidAutomationProjectId(projectId)) throw new Error("Invalid newsroom project id");
	return `/editor/${encodeURIComponent(projectId)}`;
}

export function newsroomHandoffUrl(jobId: string): string {
	if (!isValidNewsroomJobId(jobId)) throw new Error("Invalid newsroom job id");
	return `/api/newsroom?handoff=${encodeURIComponent(jobId)}`;
}

export function isSafeNewsroomHandoffAsset({
	asset,
	jobId,
}: {
	asset: NewsroomHandoffAsset;
	jobId: string;
}): boolean {
	if (!isValidNewsroomJobId(jobId) || !asset.name || asset.name !== asset.name.split(/[\\/]/).pop() || asset.name.length > 180) return false;
	try {
		const url = new URL(asset.url, "http://opencut.local");
		return url.origin === "http://opencut.local"
			&& url.pathname === "/api/newsroom"
			&& url.searchParams.get("job") === jobId
			&& url.searchParams.get("handoffAsset") === asset.name;
	} catch {
		return false;
	}
}

async function responseJson(response: Response): Promise<unknown> {
	const value: unknown = await response.json();
	if (!response.ok) {
		const message = value && typeof value === "object" && "error" in value ? String((value as { error?: unknown }).error) : "Newsroom handoff failed";
		throw new Error(message);
	}
	return value;
}

export async function fetchNewsroomHandoff({
	jobId,
	fetchImpl = fetch,
}: {
	jobId: string;
	fetchImpl?: typeof fetch;
}): Promise<NewsroomHandoffBundle> {
	if (!isValidNewsroomJobId(jobId)) throw new Error("Invalid newsroom job id");
	const value = await responseJson(await fetchImpl(newsroomHandoffUrl(jobId), { cache: "no-store" }));
	if (!value || typeof value !== "object") throw new Error("Invalid newsroom handoff bundle");
	const bundle = value as Partial<NewsroomHandoffBundle>;
	if (bundle.jobId !== jobId || !bundle.manifest || !Array.isArray(bundle.assets)) throw new Error("Invalid newsroom handoff bundle");
	parseAutomationManifest(JSON.stringify(bundle.manifest));
	if (bundle.projectId !== undefined && !isValidAutomationProjectId(bundle.projectId)) throw new Error("Invalid newsroom project id");
	return {
		jobId: bundle.jobId,
		manifest: bundle.manifest,
		assets: bundle.assets,
		...(bundle.projectId === undefined ? {} : { projectId: bundle.projectId }),
	};
}

async function fetchAsset({
	asset,
	jobId,
	fetchImpl,
}: {
	asset: NewsroomHandoffAsset;
	jobId: string;
	fetchImpl: typeof fetch;
}): Promise<File> {
	if (!isSafeNewsroomHandoffAsset({ asset, jobId })) {
		throw new Error("Invalid newsroom asset name");
	}
	const response = await fetchImpl(asset.url, { cache: "no-store" });
	if (!response.ok) throw new Error(`Failed to download newsroom asset: ${asset.name}`);
	return new File([await response.blob()], asset.name, { type: asset.mime || response.headers.get("content-type") || "application/octet-stream" });
}

export function isSafeRegisteredRenderAsset({
	asset,
	versionId,
}: {
	asset: NewsroomHandoffAsset;
	versionId: string;
}): boolean {
	if (
		!/^[A-Za-z0-9_-]+$/.test(versionId)
		|| !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset.name)
		|| !asset.url.startsWith("/")
		|| asset.url.startsWith("//")
	) return false;
	try {
		const url = new URL(asset.url, "http://opencut.local");
		return url.origin === "http://opencut.local"
			&& url.pathname === "/api/renders/handoff"
			&& url.searchParams.size === 2
			&& url.searchParams.get("versionId") === versionId
			&& url.searchParams.get("asset") === asset.name;
	} catch {
		return false;
	}
}

async function fetchRegisteredAsset({ asset, versionId, fetchImpl }: { asset: NewsroomHandoffAsset; versionId: string; fetchImpl: typeof fetch }): Promise<File> {
	if (!isSafeRegisteredRenderAsset({ asset, versionId })) throw new Error("Invalid render asset URL");
	const response = await fetchImpl(asset.url, { cache: "no-store" });
	if (!response.ok) throw new Error(`Failed to download render asset: ${asset.name}`);
	return new File([await response.blob()], asset.name, { type: asset.mime || response.headers.get("content-type") || "application/octet-stream" });
}

export async function importNewsroomHandoff({
	editor,
	bundle,
	fetchImpl = fetch,
	onProgress,
}: {
	editor: EditorCore;
	bundle: NewsroomHandoffBundle;
	fetchImpl?: typeof fetch;
	onProgress?: (message: string) => void;
}): Promise<{ projectId: string }> {
	if (!isValidNewsroomJobId(bundle.jobId)) throw new Error("Invalid newsroom job id");
	parseAutomationManifest(JSON.stringify(bundle.manifest));
	const files: File[] = [];
	for (const asset of bundle.assets) {
		onProgress?.(`Downloading ${asset.name}...`);
		files.push(await fetchAsset({ asset, jobId: bundle.jobId, fetchImpl }));
	}
	const storageKey = `opencut:newsroom-project:${bundle.jobId}`;
	const storedProjectId = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) ?? undefined : undefined;
	if (storedProjectId !== undefined && !isValidAutomationProjectId(storedProjectId) && typeof window !== "undefined") {
		window.localStorage.removeItem(storageKey);
	}
	const mappedProjectId = bundle.projectId ?? (isValidAutomationProjectId(storedProjectId) ? storedProjectId : undefined);
	const result = await importAutomationManifest({
		editor,
		manifest: bundle.manifest,
		files,
		existingProjectId: mappedProjectId,
		onProgress,
	});
	if (typeof window !== "undefined") window.localStorage.setItem(storageKey, result.projectId);
	return result;
}

export async function importRegisteredRender({
	editor,
	versionId,
	title,
	duration = 1,
	resolution = { width: 1080, height: 1920 },
	fetchImpl = fetch,
	onProgress,
}: {
	editor: EditorCore;
	versionId: string;
	title?: string;
	duration?: number;
	resolution?: { width: number; height: number };
	fetchImpl?: typeof fetch;
	onProgress?: (message: string) => void;
}): Promise<{ projectId: string }> {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(versionId)) throw new Error("Invalid render version id");
	const mappingKey = `opencut:render-project:${versionId}`;
	const stableMappingKey = "opencut:render-project:latest";
	let storedProjectId = typeof window !== "undefined"
		? window.localStorage.getItem(mappingKey) ?? window.localStorage.getItem(stableMappingKey) ?? undefined
		: undefined;
	if (storedProjectId === undefined && typeof window !== "undefined") {
		const priorProjectIds = new Set<string>();
		for (let index = 0; index < window.localStorage.length; index += 1) {
			const key = window.localStorage.key(index);
			if (!key?.startsWith("opencut:render-project:") || key === stableMappingKey) continue;
			const projectId = window.localStorage.getItem(key);
			if (isValidAutomationProjectId(projectId)) priorProjectIds.add(projectId);
		}
		if (priorProjectIds.size === 1) storedProjectId = priorProjectIds.values().next().value;
	}
	if (storedProjectId !== undefined && !isValidAutomationProjectId(storedProjectId) && typeof window !== "undefined") {
		window.localStorage.removeItem(mappingKey);
		window.localStorage.removeItem(stableMappingKey);
	}
	const existingProjectId = isValidAutomationProjectId(storedProjectId) ? storedProjectId : undefined;
	const handoffUrl = `/api/renders/handoff?versionId=${encodeURIComponent(versionId)}`;
	try {
		const handoffResponse = await fetchImpl(handoffUrl, { cache: "no-store" });
		if (handoffResponse.ok) {
			const bundle = await handoffResponse.json() as { versionId?: string; manifest?: AutomationManifest & { cues?: Array<{ start: number; end: number; text: string }>; captionPreset?: ReferenceCaptionPreset }; assets?: NewsroomHandoffAsset[] };
			if (bundle.versionId === versionId && bundle.manifest && Array.isArray(bundle.assets) && bundle.assets.length > 0) {
				const files = await Promise.all(bundle.assets.map((asset) => fetchRegisteredAsset({ asset, versionId, fetchImpl })));
				const cues = Array.isArray(bundle.manifest.cues) ? bundle.manifest.cues : [];
				const tracks = [...bundle.manifest.tracks];
				if (cues.length) {
					const srt = renderCuesToSrt(cues);
					files.push(new File([srt], "captions.srt", { type: "application/x-subrip" }));
					tracks.push({ ...referenceCaptionTrack(bundle.manifest.captionPreset), src: "captions.srt" });
				}
				const canonicalProjectId = isValidAutomationProjectId(bundle.manifest.project.id) ? bundle.manifest.project.id : existingProjectId;
				const result = await importAutomationManifest({ editor, manifest: { project: bundle.manifest.project, tracks }, files, existingProjectId: canonicalProjectId, onProgress });
				if (typeof window !== "undefined") {
					window.localStorage.setItem(mappingKey, result.projectId);
					window.localStorage.setItem(stableMappingKey, result.projectId);
					window.localStorage.setItem(`opencut:project-render-version:${result.projectId}`, registeredRenderMarker(versionId));
				}
				return result;
			}
		}
	} catch { onProgress?.("Exact scene handoff unavailable; using the final MP4 fallback..."); }
	const videoUrl = `/api/renders/final?versionId=${encodeURIComponent(versionId)}`;
	const thumbnailUrl = `/api/renders/final/thumbnail?versionId=${encodeURIComponent(versionId)}`;
	onProgress?.("Downloading registered render...");
	const [videoResponse, thumbnailResponse] = await Promise.all([
		fetchImpl(videoUrl, { cache: "no-store" }),
		fetchImpl(thumbnailUrl, { cache: "no-store" }),
	]);
	if (!videoResponse.ok) throw new Error("Final render is not available");
	if (!thumbnailResponse.ok) throw new Error("Final render thumbnail is not available");
	const video = new File([await videoResponse.blob()], "final-render.mp4", { type: "video/mp4" });
	const thumbnail = new File([await thumbnailResponse.blob()], "final-render-thumbnail.png", { type: "image/png" });
	const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
	const safeTitle = title?.trim().slice(0, 240) || "Final render";
	const safeWidth = Number.isInteger(resolution.width) && resolution.width > 0 && resolution.width <= 8192 ? resolution.width : 1080;
	const safeHeight = Number.isInteger(resolution.height) && resolution.height > 0 && resolution.height <= 8192 ? resolution.height : 1920;
	const result = await importAutomationManifest({
		editor,
		manifest: {
			project: { name: safeTitle, width: safeWidth, height: safeHeight, fps: 30 },
			tracks: [
				{ type: "video", src: video.name, start: 0, duration: safeDuration },
				{ type: "asset", src: thumbnail.name, duration: safeDuration },
				{ type: "text", text: safeTitle, start: 0, duration: Math.min(3, safeDuration) },
			],
		},
		files: [video, thumbnail],
		existingProjectId,
		onProgress,
	});
	if (typeof window !== "undefined") {
		window.localStorage.setItem(mappingKey, result.projectId);
		window.localStorage.setItem(stableMappingKey, result.projectId);
		window.localStorage.setItem(`opencut:project-render-version:${result.projectId}`, registeredRenderMarker(versionId));
	}
	return result;
}

export function registeredRenderMarker(versionId: string): string {
	return `exact-handoff-v2:${versionId}`;
}

export function renderCuesToSrt(cues: Array<{ start: number; end: number; text: string }>): string {
	let previousStart = -1;
	return cues.map((cue, index) => {
		if (
			!Number.isFinite(cue.start)
			|| !Number.isFinite(cue.end)
			|| cue.start < previousStart
			|| cue.start < 0
			|| cue.end <= cue.start
			|| cue.end > 14_400
			|| typeof cue.text !== "string"
			|| !cue.text.trim()
			|| cue.text.length > 1_000
		) throw new Error("Invalid registered render caption cue");
		previousStart = cue.start;
		return `${index + 1}\n${toSrtTime(cue.start)} --> ${toSrtTime(cue.end)}\n${cue.text.replace(/\r\n?/g, "\n")}\n`;
	}).join("\n");
}

function toSrtTime(seconds: number): string {
	const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
	const millis = Math.round(value * 1000);
	const hours = Math.floor(millis / 3_600_000);
	const minutes = Math.floor((millis % 3_600_000) / 60_000);
	const secs = Math.floor((millis % 60_000) / 1000);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis % 1000).padStart(3, "0")}`;
}
