import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { REFERENCE_V3_CAPTION_PRESET } from "@/automation/reference-v3-contract";
import { getRenderHandoff } from "../registry";

export const runtime = "nodejs";

const VERSION_ID = /^[A-Za-z0-9_-]+$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".npy": "application/octet-stream",
	".json": "application/json",
};

type HandoffAsset = { name: string; path: string; mime: string };
type HandoffTrack = {
	type: "video" | "audio" | "text" | "asset";
	src?: string;
	text?: string;
	start: number;
	duration: number;
	textStyle?: {
		fontFamily: string;
		fontWeight: "normal" | "bold";
		fontSizePx: number;
		color: string;
		textAlign: "left" | "center" | "right";
		centerXPx: number;
		topPx: number;
		lineHeight: number;
		background: boolean;
	};
};
type HandoffCue = { start: number; end: number; text: string };
type CaptionPreset = typeof REFERENCE_V3_CAPTION_PRESET;
type HandoffSnapshot = {
	versionId: string;
	project: { id?: string; name: string; width: number; height: number; fps: number };
	captionPreset: CaptionPreset;
	assets: HandoffAsset[];
	tracks: HandoffTrack[];
	cues: HandoffCue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function hasSafeRelativePath(value: string): boolean {
	if (!value || path.isAbsolute(value)) return false;
	const parts = value.split(/[\\/]/);
	return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function isCaptionPreset(value: unknown): value is CaptionPreset {
	return isRecord(value) && JSON.stringify(value) === JSON.stringify(REFERENCE_V3_CAPTION_PRESET);
}

function isSnapshot(value: unknown, versionId: string): value is HandoffSnapshot {
	if (!isRecord(value) || value.versionId !== versionId || !isRecord(value.project)) return false;
	if (
		(value.project.id !== undefined && (typeof value.project.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.project.id)))
		||
		typeof value.project.name !== "string"
		|| !value.project.name.trim()
		|| value.project.name.length > 240
		|| value.project.width !== 1080
		|| value.project.height !== 1920
		|| value.project.fps !== 30
		|| !isCaptionPreset(value.captionPreset)
		|| !Array.isArray(value.assets)
		|| !Array.isArray(value.tracks)
		|| !Array.isArray(value.cues)
	) return false;

	const names = new Set<string>();
	for (const item of value.assets) {
		if (!isRecord(item) || typeof item.name !== "string" || typeof item.path !== "string" || typeof item.mime !== "string") return false;
		const expectedMime = MIME[path.extname(item.name).toLowerCase()];
		if (!NAME.test(item.name) || names.has(item.name) || !hasSafeRelativePath(item.path) || !expectedMime || item.mime !== expectedMime) return false;
		names.add(item.name);
	}

	for (const item of value.tracks) {
		if (!isRecord(item) || !["video", "audio", "text", "asset"].includes(String(item.type))) return false;
		if (
			!isFiniteNumber(item.start)
			|| !isFiniteNumber(item.duration)
			|| item.start < 0
			|| item.duration <= 0
			|| item.start + item.duration > 14_400
		) return false;
		if (item.type === "text") {
			if (typeof item.text !== "string" || !item.text.trim() || item.text.length > 10_000) return false;
			if (item.textStyle !== undefined) {
				const style = item.textStyle;
				if (
					!isRecord(style)
					|| Object.keys(style).length !== 9
					|| typeof style.fontFamily !== "string"
					|| !style.fontFamily.trim()
					|| !["normal", "bold"].includes(String(style.fontWeight))
					|| !isFiniteNumber(style.fontSizePx)
					|| style.fontSizePx <= 0
					|| typeof style.color !== "string"
					|| !/^#[0-9a-f]{6}$/i.test(style.color)
					|| !["left", "center", "right"].includes(String(style.textAlign))
					|| !isFiniteNumber(style.centerXPx)
					|| !isFiniteNumber(style.topPx)
					|| !isFiniteNumber(style.lineHeight)
					|| style.lineHeight <= 0
					|| typeof style.background !== "boolean"
				) return false;
			}
		} else if (typeof item.src !== "string" || !names.has(item.src)) {
			return false;
		}
	}

	let previousStart = -1;
	for (const item of value.cues) {
		if (!isRecord(item) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 1_000) return false;
		if (
			!isFiniteNumber(item.start)
			|| !isFiniteNumber(item.end)
			|| item.start < previousStart
			|| item.start < 0
			|| item.end <= item.start
			|| item.end > 14_400
		) return false;
		previousStart = item.start;
	}
	return true;
}

function contained(options: { root: string; target: string }): string {
	const { root, target } = options;
	const base = path.resolve(root);
	const resolved = path.resolve(target);
	if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
		throw new Error("Path escapes render handoff workspace");
	}
	return resolved;
}

async function resolveAsset(options: { root: string; asset: HandoffAsset }) {
	const { root, asset } = options;
	const lexical = contained({ root, target: path.join(root, asset.path) });
	const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(lexical)]);
	if (!fileReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Path escapes render handoff workspace");
	const info = await lstat(fileReal);
	if (!info.isFile()) throw new Error("Render handoff asset is not a regular file");
	return { filePath: fileReal, info };
}

export async function GET(request: NextRequest) {
	const versionId = request.nextUrl.searchParams.get("versionId") || "";
	if (!VERSION_ID.test(versionId)) {
		return NextResponse.json({ error: "Invalid render version id" }, { status: 400 });
	}
	const handoff = await getRenderHandoff(versionId);
	if (!handoff || !isSnapshot(handoff.snapshot, versionId)) {
		return NextResponse.json({ error: "Render handoff snapshot is unavailable" }, { status: 404 });
	}

	const assetName = request.nextUrl.searchParams.get("asset");
	if (assetName) {
		if (!NAME.test(assetName)) {
			return NextResponse.json({ error: "Invalid render handoff asset" }, { status: 400 });
		}
		const asset = handoff.snapshot.assets.find((item) => item.name === assetName);
		if (!asset) return NextResponse.json({ error: "Invalid render handoff asset" }, { status: 400 });
		try {
			const safe = await resolveAsset({ root: handoff.root, asset });
			return new NextResponse(new Uint8Array(await readFile(safe.filePath)), {
				headers: {
					"Content-Type": asset.mime,
					"Content-Length": String(safe.info.size),
					"Content-Disposition": `inline; filename="${asset.name}"`,
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			});
		} catch {
			return NextResponse.json({ error: "Render handoff asset is unavailable" }, { status: 404 });
		}
	}

	try {
		await Promise.all(handoff.snapshot.assets.map((asset) => resolveAsset({ root: handoff.root, asset })));
	} catch {
		return NextResponse.json({ error: "Render handoff snapshot assets are unavailable" }, { status: 404 });
	}
	const assets = handoff.snapshot.assets.map((asset) => ({
		name: asset.name,
		mime: asset.mime,
		url: `/api/renders/handoff?versionId=${encodeURIComponent(versionId)}&asset=${encodeURIComponent(asset.name)}`,
	}));
	return NextResponse.json({
		versionId,
		manifest: {
			project: handoff.snapshot.project,
			tracks: handoff.snapshot.tracks,
			cues: handoff.snapshot.cues,
			captionPreset: handoff.snapshot.captionPreset,
		},
		assets,
	}, { headers: { "Cache-Control": "no-store" } });
}
