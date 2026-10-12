import type { EditorCore } from "@/core";
import { buildElementFromMedia, buildTextElement } from "@/timeline/element-utils";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import type { MediaType } from "@/media/types";
import { floatToFrameRate } from "@/fps/utils";
import { mediaTimeFromSeconds } from "@/wasm";
import type { SubtitleStyleOverrides } from "@/subtitles/types";
import { buildDefaultScene } from "@/timeline/scenes";
import type { CreateTimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { processMediaAssets } from "@/media/processing";

export type AutomationTextStyle = {
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

export type AutomationTrack = {
	type: "video" | "audio" | "text" | "captions" | "asset";
	src?: string;
	start?: number;
	duration?: number;
	/** Source-media offset. Video loops restart from this offset. */
	sourceStart?: number;
	/** Repeat the editable source clip until the requested timeline duration is filled. */
	loop?: boolean;
	/** Producer-equivalent cover/crop target in project pixels. */
	videoStyle?: AutomationVideoStyle;
	text?: string;
	/** Pixel-based source style, converted to OpenCut's center-anchored text units. */
	textStyle?: AutomationTextStyle;
	/** Applied only to captions imported by this automation track. */
	captionStyle?: SubtitleStyleOverrides;
	/** Exact producer tokens retained even when OpenCut lacks an equivalent renderer primitive. */
	captionReference?: AutomationCaptionReference;
};

export type AutomationVideoStyle = {
	fit: "cover";
	xPx: number;
	yPx: number;
	widthPx: number;
	heightPx: number;
};

export type AutomationCaptionReference = {
	fontFamily: string;
	fontWeight: number;
	fontSizePx: number;
	color: string;
	outlineColor: string;
	outlineWidthPx: number;
	centerXPx: number;
	centerYPx: number;
	safeWidthPx: number;
	scaleXPercent: number;
};

export type AutomationManifest = {
	project: {
		name: string;
		width: number;
		height: number;
		fps: number;
		/** Existing project to replace. Only OpenCut-generated ids are accepted. */
		id?: string;
	};
	tracks: AutomationTrack[];
};

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAutomationProjectId(value: unknown): value is string {
	return typeof value === "string" && PROJECT_ID.test(value);
}

function assertManifest(value: unknown): asserts value is AutomationManifest {
	if (!value || typeof value !== "object") throw new Error("Manifest must be an object");
	const input = value as Partial<AutomationManifest>;
	if (!input.project || typeof input.project !== "object") throw new Error("Manifest.project is required");
	for (const key of ["name", "width", "height", "fps"] as const) {
		if (input.project[key] === undefined) throw new Error(`Manifest.project.${key} is required`);
	}
	if (input.project.id !== undefined && !isValidAutomationProjectId(input.project.id)) {
		throw new Error("Manifest.project.id is invalid");
	}
	if (!Array.isArray(input.tracks)) throw new Error("Manifest.tracks must be an array");
	if (typeof input.project.name !== "string" || !input.project.name.trim() || input.project.name.length > 240) {
		throw new Error("Manifest.project.name must be 1-240 characters");
	}
	for (const key of ["width", "height"] as const) {
		const value = input.project[key];
		if (!Number.isInteger(value) || value < 1 || value > 8192) throw new Error(`Manifest.project.${key} is invalid`);
	}
	if (!Number.isFinite(input.project.fps) || input.project.fps < 1 || input.project.fps > 120) {
		throw new Error("Manifest.project.fps is invalid");
	}
	for (const track of input.tracks) {
		if (!track || typeof track !== "object" || !["video", "audio", "text", "captions", "asset"].includes(track.type)) {
			throw new Error("Manifest track type is invalid");
		}
		if (track.src !== undefined && (typeof track.src !== "string" || pathBasename(track.src) !== track.src || track.src.length > 180)) {
			throw new Error("Manifest track src is invalid");
		}
		if (track.start !== undefined && (!Number.isFinite(track.start) || track.start < 0 || track.start > 14_400)) {
			throw new Error("Manifest track start is invalid");
		}
		if (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration <= 0 || track.duration > 14_400)) {
			throw new Error("Manifest track duration is invalid");
		}
		if (track.sourceStart !== undefined && (track.type !== "video" || !Number.isFinite(track.sourceStart) || track.sourceStart < 0 || track.sourceStart > 14_400)) {
			throw new Error("Manifest track sourceStart is invalid");
		}
		if (track.loop !== undefined && (track.type !== "video" || typeof track.loop !== "boolean")) {
			throw new Error("Manifest track loop is invalid");
		}
		if (track.videoStyle !== undefined && (track.type !== "video" || !isAutomationVideoStyle(track.videoStyle, input.project))) {
			throw new Error("Manifest track videoStyle is invalid");
		}
		if (track.text !== undefined && (typeof track.text !== "string" || track.text.length > 10_000)) {
			throw new Error("Manifest track text is invalid");
		}
		if (track.textStyle !== undefined) {
			if (track.type !== "text" || !isAutomationTextStyle(track.textStyle, input.project)) {
				throw new Error("Manifest track textStyle is invalid");
			}
		}
		if (track.captionReference !== undefined && (track.type !== "captions" || !isAutomationCaptionReference(track.captionReference, input.project))) {
			throw new Error("Manifest track captionReference is invalid");
		}
	}
}

function isAutomationVideoStyle(
	value: unknown,
	project: AutomationManifest["project"],
): value is AutomationVideoStyle {
	if (!value || typeof value !== "object") return false;
	const style = value as Partial<AutomationVideoStyle>;
	return Object.keys(value).length === 5
		&& style.fit === "cover"
		&& [style.xPx, style.yPx, style.widthPx, style.heightPx].every((entry) => typeof entry === "number" && Number.isFinite(entry))
		&& (style.xPx ?? -1) >= 0
		&& (style.yPx ?? -1) >= 0
		&& (style.widthPx ?? 0) > 0
		&& (style.heightPx ?? 0) > 0
		&& (style.xPx ?? 0) + (style.widthPx ?? 0) <= project.width
		&& (style.yPx ?? 0) + (style.heightPx ?? 0) <= project.height;
}

function isAutomationCaptionReference(
	value: unknown,
	project: AutomationManifest["project"],
): value is AutomationCaptionReference {
	if (!value || typeof value !== "object") return false;
	const reference = value as Partial<AutomationCaptionReference>;
	return Object.keys(value).length === 10
		&& typeof reference.fontFamily === "string"
		&& reference.fontFamily.trim().length > 0
		&& Number.isInteger(reference.fontWeight)
		&& (reference.fontWeight ?? 0) >= 100
		&& (reference.fontWeight ?? 0) <= 1000
		&& typeof reference.fontSizePx === "number"
		&& Number.isFinite(reference.fontSizePx)
		&& (reference.fontSizePx ?? 0) > 0
		&& typeof reference.color === "string"
		&& /^#[0-9a-f]{6}$/i.test(reference.color)
		&& typeof reference.outlineColor === "string"
		&& /^#[0-9a-f]{6}$/i.test(reference.outlineColor)
		&& typeof reference.outlineWidthPx === "number"
		&& Number.isFinite(reference.outlineWidthPx)
		&& (reference.outlineWidthPx ?? -1) >= 0
		&& typeof reference.centerXPx === "number"
		&& Number.isFinite(reference.centerXPx)
		&& (reference.centerXPx ?? -1) >= 0
		&& (reference.centerXPx ?? 0) <= project.width
		&& typeof reference.centerYPx === "number"
		&& Number.isFinite(reference.centerYPx)
		&& (reference.centerYPx ?? -1) >= 0
		&& (reference.centerYPx ?? 0) <= project.height
		&& typeof reference.safeWidthPx === "number"
		&& Number.isFinite(reference.safeWidthPx)
		&& (reference.safeWidthPx ?? 0) > 0
		&& (reference.safeWidthPx ?? 0) <= project.width
		&& typeof reference.scaleXPercent === "number"
		&& Number.isFinite(reference.scaleXPercent)
		&& (reference.scaleXPercent ?? 0) > 0
		&& (reference.scaleXPercent ?? 0) <= 400;
}

function isAutomationTextStyle(
	value: unknown,
	project: AutomationManifest["project"],
): value is AutomationTextStyle {
	if (!value || typeof value !== "object") return false;
	const style = value as Partial<AutomationTextStyle>;
	const keys = Object.keys(value);
	const allowed = new Set([
		"fontFamily",
		"fontWeight",
		"fontSizePx",
		"color",
		"textAlign",
		"centerXPx",
		"topPx",
		"lineHeight",
		"background",
	]);
	return keys.every((key) => allowed.has(key))
		&& keys.length === allowed.size
		&& typeof style.fontFamily === "string"
		&& style.fontFamily.trim().length > 0
		&& style.fontFamily.length <= 200
		&& (style.fontWeight === "normal" || style.fontWeight === "bold")
		&& typeof style.fontSizePx === "number"
		&& Number.isFinite(style.fontSizePx)
		&& style.fontSizePx > 0
		&& style.fontSizePx <= project.height
		&& typeof style.color === "string"
		&& /^#[0-9a-f]{6}$/i.test(style.color)
		&& (style.textAlign === "left" || style.textAlign === "center" || style.textAlign === "right")
		&& typeof style.centerXPx === "number"
		&& Number.isFinite(style.centerXPx)
		&& style.centerXPx >= 0
		&& style.centerXPx <= project.width
		&& typeof style.topPx === "number"
		&& Number.isFinite(style.topPx)
		&& style.topPx >= 0
		&& style.topPx <= project.height
		&& typeof style.lineHeight === "number"
		&& Number.isFinite(style.lineHeight)
		&& style.lineHeight > 0
		&& style.lineHeight <= 4
		&& typeof style.background === "boolean";
}

export function automationTextParams({
	style,
	canvasSize,
}: {
	style: AutomationTextStyle;
	canvasSize: { width: number; height: number };
}) {
	const fontSize = style.fontSizePx * 90 / canvasSize.height;
	return {
		fontSize,
		fontFamily: style.fontFamily,
		fontWeight: style.fontWeight,
		color: style.color,
		textAlign: style.textAlign,
		fontStyle: "normal",
		textDecoration: "none",
		letterSpacing: 0,
		lineHeight: style.lineHeight,
		"background.enabled": style.background,
		"transform.positionX": style.centerXPx - canvasSize.width / 2,
		"transform.positionY": style.topPx + style.fontSizePx * style.lineHeight / 2 - canvasSize.height / 2,
	};
}

function pathBasename(value: string): string {
	return value.split(/[\\/]/).pop() ?? "";
}

export function parseAutomationManifest(input: string): AutomationManifest {
	const value: unknown = JSON.parse(input);
	assertManifest(value);
	return value;
}

function fileMap(files: File[]): Map<string, File> {
	const result = new Map<string, File>();
	for (const file of files) result.set(file.name, file);
	return result;
}

type ImportedMedia = {
	id: string;
	type: MediaType;
	name: string;
	duration?: number;
	width?: number;
	height?: number;
};

export async function importAutomationManifest({
	editor,
	manifest,
	files,
	existingProjectId,
	onProgress,
}: {
	editor: EditorCore;
	manifest: AutomationManifest;
	files: File[];
	existingProjectId?: string;
	onProgress?: (message: string) => void;
}): Promise<{ projectId: string }> {
	assertManifest(manifest);
	const requestedProjectId = existingProjectId ?? manifest.project.id;
	if (requestedProjectId !== undefined && !isValidAutomationProjectId(requestedProjectId)) {
		throw new Error("Invalid existing project id");
	}
	let projectId: string;
	if (requestedProjectId) {
		onProgress?.("Loading existing project...");
		try {
			await editor.project.loadProject({ id: requestedProjectId });
			projectId = requestedProjectId;
		} catch {
			// A stale browser mapping must not strand a handoff. Create a fresh
			// project and let the caller replace its mapping.
			onProgress?.("Existing project was unavailable; creating a new project...");
			projectId = await editor.project.createNewProject({ name: manifest.project.name, id: requestedProjectId });
		}
		if (projectId === requestedProjectId) {
			await editor.media.clearProjectMedia({ projectId });
			const scene = buildDefaultScene({ name: "Main scene", isMain: true });
			editor.scenes.initializeScenes({ scenes: [scene], currentSceneId: scene.id });
			await editor.project.renameProject({ id: projectId, name: manifest.project.name });
		}
	} else {
		onProgress?.("Creating project...");
		projectId = await editor.project.createNewProject({ name: manifest.project.name });
	}

	const canvasSize = { width: manifest.project.width, height: manifest.project.height };
	editor.project.updateSettings({
		settings: {
			canvasSize,
			canvasSizeMode: "custom",
			lastCustomCanvasSize: canvasSize,
			fps: floatToFrameRate(manifest.project.fps),
		},
		pushHistory: false,
	});

	const byName = fileMap(files);
	const mediaIds = new Map<string, ImportedMedia>();
	for (const track of manifest.tracks) {
		if (!track.src || track.type === "text" || track.type === "captions") continue;
		const file = byName.get(track.src.split("/").pop() ?? track.src);
		if (!file) throw new Error(`Missing asset for manifest src: ${track.src}`);
		if (mediaIds.has(file.name)) continue;
		const processedAssets = await processMediaAssets({ files: [file] });
		const processedAsset = processedAssets[0];
		if (!processedAsset) throw new Error(`Failed to process asset: ${file.name}`);
		const mediaType: MediaType = processedAsset.type;
		onProgress?.(`Saving asset ${file.name}...`);
		const asset = await editor.media.addMediaAsset({
			projectId,
			asset: processedAsset,
		});
		if (!asset) throw new Error(`Failed to save asset: ${file.name}`);
		mediaIds.set(file.name, {
			id: asset.id,
			type: mediaType,
			name: file.name,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
		});
	}

	const activeScene = editor.scenes.getActiveScene();
	const mainTrackId = activeScene.tracks.main.id;
	onProgress?.("Building timeline...");
	for (const track of manifest.tracks) {
		if (track.type === "asset") continue;
		const start = mediaTimeFromSeconds({ seconds: track.start ?? 0 });
		const duration = mediaTimeFromSeconds({ seconds: track.duration ?? 1 });
		if (track.type === "captions" && track.src) {
			const file = byName.get(track.src.split("/").pop() ?? track.src);
			if (!file) throw new Error(`Missing captions file: ${track.src}`);
			const result = parseSubtitleFile({ fileName: file.name, input: await file.text() });
			const captions = track.captionStyle
				? result.captions.map((caption) => ({
						...caption,
						style: {
							...caption.style,
							...track.captionStyle,
							background: {
								...caption.style?.background,
								...track.captionStyle?.background,
								enabled: track.captionStyle?.background?.enabled ?? caption.style?.background?.enabled ?? false,
								color: track.captionStyle?.background?.color ?? caption.style?.background?.color ?? "#000000",
							},
							placement: {
								...caption.style?.placement,
								...track.captionStyle?.placement,
							},
						},
					}))
				: result.captions;
			const captionTrackId = insertCaptionChunksAsTextTrack({ editor, captions });
			if (captionTrackId && track.captionReference) {
				const captionTrack = editor.scenes.getActiveScene().tracks.overlay.find((item) => item.id === captionTrackId);
				const reference = track.captionReference;
				if (captionTrack?.type === "text") {
					editor.timeline.updateElements({
						pushHistory: false,
						updates: captionTrack.elements.map((element) => ({
							trackId: captionTrackId,
							elementId: element.id,
							patch: {
								params: {
									"transform.scaleX": reference.scaleXPercent / 100,
									"automation.caption.fontFamily": reference.fontFamily,
									"automation.caption.fontWeight": reference.fontWeight,
									"automation.caption.fontSizePx": reference.fontSizePx,
									"automation.caption.color": reference.color,
									"automation.caption.outlineColor": reference.outlineColor,
									"automation.caption.outlineWidthPx": reference.outlineWidthPx,
									"automation.caption.centerXPx": reference.centerXPx,
									"automation.caption.centerYPx": reference.centerYPx,
									"automation.caption.safeWidthPx": reference.safeWidthPx,
									"automation.caption.scaleXPercent": reference.scaleXPercent,
								},
							},
						})),
					});
				}
			}
			continue;
		}
		if (track.type === "text" && track.text) {
			const textParams = track.textStyle
				? automationTextParams({ style: track.textStyle, canvasSize })
				: {
						fontSize: 5,
						fontFamily: "Arial",
						fontWeight: "bold" as const,
						color: "#ffffff",
						"background.enabled": true,
						"background.color": "#111827",
						"background.paddingX": 24,
						"background.paddingY": 14,
						"transform.positionY": -canvasSize.height / 2 + 240,
					};
			editor.timeline.insertElement({
				element: buildTextElement({
					raw: {
						name: "Title",
						duration,
						params: {
							content: track.text,
							...textParams,
						},
					},
					startTime: start,
				}),
				placement: { mode: "auto", trackType: "text", insertIndex: 0 },
			});
			continue;
		}
		if (!track.src) continue;
		const fileName = track.src.split("/").pop() ?? track.src;
		const media = mediaIds.get(fileName);
		if (!media) throw new Error(`Asset was not imported: ${track.src}`);
		const elements = track.type === "video"
			? buildAutomationVideoElements({ track, media, canvasSize })
			: [buildElementFromMedia({
					mediaId: media.id,
					mediaType: media.type,
					name: media.name,
					duration,
					startTime: start,
				})];
		for (const element of elements) {
			editor.timeline.insertElement({
				element,
				placement:
					track.type === "audio"
						? { mode: "auto", trackType: "audio" }
						: { mode: "explicit", trackId: mainTrackId },
			});
		}
	}

	onProgress?.("Saving timeline...");
	// Save directly before navigation. SaveManager.flush() may return early while a
	// debounced save from project creation is still in progress, losing the newly
	// inserted timeline when the editor route reloads the project.
	await editor.project.saveCurrentProject();
	onProgress?.("Project ready.");
	return { projectId };
}

export function automationVideoGeometry({
	sourceSize,
	canvasSize,
	style,
}: {
	sourceSize: { width: number; height: number };
	canvasSize: { width: number; height: number };
	style: AutomationVideoStyle;
}) {
	const containScale = Math.min(canvasSize.width / sourceSize.width, canvasSize.height / sourceSize.height);
	const coverScale = Math.max(style.widthPx / sourceSize.width, style.heightPx / sourceSize.height);
	const visualWidth = sourceSize.width * coverScale;
	const visualHeight = sourceSize.height * coverScale;
	return {
		positionX: style.xPx + style.widthPx / 2 - canvasSize.width / 2,
		positionY: style.yPx + style.heightPx / 2 - canvasSize.height / 2,
		scale: coverScale / containScale,
		maskWidth: style.widthPx / visualWidth,
		maskHeight: style.heightPx / visualHeight,
	};
}

function buildAutomationVideoElements({
	track,
	media,
	canvasSize,
}: {
	track: AutomationTrack;
	media: ImportedMedia;
	canvasSize: { width: number; height: number };
}): CreateTimelineElement[] {
	const requestedDuration = track.duration ?? 1;
	const timelineStart = track.start ?? 0;
	if (media.type === "image") {
		const element = buildElementFromMedia({
			mediaId: media.id,
			mediaType: media.type,
			name: media.name,
			duration: mediaTimeFromSeconds({ seconds: requestedDuration }),
			startTime: mediaTimeFromSeconds({ seconds: timelineStart }),
		});
		if (element.type !== "image") throw new Error(`Visual track did not import as an image: ${media.name}`);
		const geometry = track.videoStyle && media.width && media.height
			? automationVideoGeometry({
					sourceSize: { width: media.width, height: media.height },
					canvasSize,
					style: track.videoStyle,
				})
			: null;
		if (geometry) {
			element.params = {
				...element.params,
				"transform.positionX": geometry.positionX,
				"transform.positionY": geometry.positionY,
				"transform.scaleX": geometry.scale,
				"transform.scaleY": geometry.scale,
				"automation.video.fit": "cover",
				"automation.video.boxX": track.videoStyle?.xPx ?? 0,
				"automation.video.boxY": track.videoStyle?.yPx ?? 0,
				"automation.video.boxWidth": track.videoStyle?.widthPx ?? canvasSize.width,
				"automation.video.boxHeight": track.videoStyle?.heightPx ?? canvasSize.height,
			};
			element.masks = [{
				id: generateUUID(),
				type: "rectangle",
				params: {
					centerX: 0, centerY: 0, width: geometry.maskWidth, height: geometry.maskHeight,
					rotation: 0, scale: 1, feather: 0, inverted: false,
					strokeColor: "#ffffff", strokeWidth: 0, strokeAlign: "center",
				},
			}];
		}
		return [element];
	}
	if (media.type !== "video") throw new Error(`Visual track did not import as video or image: ${media.name}`);
	const sourceDuration = media.duration;
	const sourceStart = track.sourceStart ?? 0;
	if (sourceDuration !== undefined && sourceStart >= sourceDuration) {
		throw new Error(`Video sourceStart exceeds source duration: ${media.name}`);
	}
	const availableDuration = sourceDuration === undefined ? requestedDuration : sourceDuration - sourceStart;
	if (!(availableDuration > 0)) throw new Error(`Video has no usable duration: ${media.name}`);
	const segments = track.loop
		? Math.max(1, Math.ceil(requestedDuration / availableDuration))
		: 1;
	const geometry = track.videoStyle && media.width && media.height
		? automationVideoGeometry({
				sourceSize: { width: media.width, height: media.height },
				canvasSize,
				style: track.videoStyle,
			})
		: null;
	const elements: CreateTimelineElement[] = [];
	let consumed = 0;
	for (let index = 0; index < segments && consumed < requestedDuration - 1e-9; index += 1) {
		const segmentDuration = Math.min(availableDuration, requestedDuration - consumed);
		const segmentDurationTime = mediaTimeFromSeconds({ seconds: segmentDuration });
		const element = buildElementFromMedia({
			mediaId: media.id,
			mediaType: media.type,
			name: `${media.name} · scene ${String(Math.round((track.start ?? 0) * 30)).padStart(4, "0")} · ${index + 1}/${segments}`,
			duration: segmentDurationTime,
			startTime: mediaTimeFromSeconds({ seconds: timelineStart + consumed }),
		});
		if (element.type !== "video") throw new Error(`Video track did not import as video: ${media.name}`);
		const fullSourceDuration = mediaTimeFromSeconds({ seconds: sourceDuration ?? segmentDuration });
		const trimStart = mediaTimeFromSeconds({ seconds: sourceStart });
		const trimEnd = mediaTimeFromSeconds({
			seconds: Math.max(0, (sourceDuration ?? segmentDuration) - sourceStart - segmentDuration),
		});
		element.sourceDuration = fullSourceDuration;
		element.trimStart = trimStart;
		element.trimEnd = trimEnd;
		element.isSourceAudioEnabled = false;
		element.params = {
			...element.params,
			"automation.scene.start": timelineStart,
			"automation.scene.duration": requestedDuration,
			"automation.scene.loop": track.loop === true,
			"automation.scene.loopIndex": index,
			...(geometry ? {
				"transform.positionX": geometry.positionX,
				"transform.positionY": geometry.positionY,
				"transform.scaleX": geometry.scale,
				"transform.scaleY": geometry.scale,
				"automation.video.fit": "cover",
				"automation.video.boxX": track.videoStyle?.xPx ?? 0,
				"automation.video.boxY": track.videoStyle?.yPx ?? 0,
				"automation.video.boxWidth": track.videoStyle?.widthPx ?? canvasSize.width,
				"automation.video.boxHeight": track.videoStyle?.heightPx ?? canvasSize.height,
			} : {}),
		};
		if (geometry) {
			element.masks = [{
				id: generateUUID(),
				type: "rectangle",
				params: {
					centerX: 0,
					centerY: 0,
					width: geometry.maskWidth,
					height: geometry.maskHeight,
					rotation: 0,
					scale: 1,
					feather: 0,
					inverted: false,
					strokeColor: "#ffffff",
					strokeWidth: 0,
					strokeAlign: "center",
				},
			}];
		}
		elements.push(element);
		consumed += segmentDuration;
	}
	return elements;
}
