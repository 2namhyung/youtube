/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- focused manager stub */
import assert from "node:assert/strict";
import test from "node:test";

import type { EditorCore } from "@/core";
import {
	automationTextParams,
	automationVideoGeometry,
	importAutomationManifest,
	parseAutomationManifest,
	type AutomationManifest,
} from "@/automation/manifest";
import {
	isSafeNewsroomHandoffAsset,
	isSafeRegisteredRenderAsset,
	newsroomEditorUrl,
	newsroomHandoffUrl,
	renderCuesToSrt,
} from "@/automation/newsroom-handoff";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const JOB_ID = "newsroom-test-job";

test("newsroom routes accept only canonical safe identifiers", () => {
	assert.equal(newsroomEditorUrl(PROJECT_ID), `/editor/${PROJECT_ID}`);
	assert.equal(newsroomHandoffUrl(JOB_ID), `/api/newsroom?handoff=${JOB_ID}`);
	assert.equal(
		isSafeNewsroomHandoffAsset({
			jobId: JOB_ID,
			asset: {
				name: "approved-image.jpg",
				url: `/api/newsroom?handoffAsset=approved-image.jpg&job=${JOB_ID}`,
				mime: "image/jpeg",
			},
		}),
		true,
	);
	assert.equal(
		isSafeNewsroomHandoffAsset({
			jobId: JOB_ID,
			asset: {
				name: "../private.mp4",
				url: `/api/newsroom?handoffAsset=..%2Fprivate.mp4&job=${JOB_ID}`,
				mime: "video/mp4",
			},
		}),
		false,
	);
	assert.throws(() => newsroomHandoffUrl("../outside"));
});

test("registered render assets stay on the exact contained handoff endpoint", () => {
	const asset = {
		name: "clip01.mp4",
		url: "/api/renders/handoff?versionId=render-v1&asset=clip01.mp4",
		mime: "video/mp4",
	};
	assert.equal(isSafeRegisteredRenderAsset({ asset, versionId: "render-v1" }), true);
	assert.equal(isSafeRegisteredRenderAsset({
		asset: { ...asset, url: `https://example.com${asset.url}` },
		versionId: "render-v1",
	}), false);
	assert.equal(isSafeRegisteredRenderAsset({
		asset: { ...asset, url: `${asset.url}&extra=1` },
		versionId: "render-v1",
	}), false);
});

test("production cues convert to exact SRT timing and reject invalid timing", () => {
	assert.equal(
		renderCuesToSrt([
			{ start: 0.1, end: 1.92, text: "첫 자막" },
			{ start: 1.92, end: 3.005, text: "둘째 자막" },
		]),
		"1\n00:00:00,100 --> 00:00:01,920\n첫 자막\n\n2\n00:00:01,920 --> 00:00:03,005\n둘째 자막\n",
	);
	assert.throws(() => renderCuesToSrt([{ start: 2, end: 1, text: "invalid" }]));
});

test("pixel title styles convert to exact OpenCut text units", () => {
	const line1 = automationTextParams({
		canvasSize: { width: 1080, height: 1920 },
		style: {
			fontFamily: "Noto Sans KR",
			fontWeight: "bold",
			fontSizePx: 120,
			color: "#27D3E8",
			textAlign: "center",
			centerXPx: 540,
			topPx: 201,
			lineHeight: 1,
			background: false,
		},
	});
	const line2 = automationTextParams({
		canvasSize: { width: 1080, height: 1920 },
		style: {
			fontFamily: "Noto Sans KR",
			fontWeight: "bold",
			fontSizePx: 143,
			color: "#FFFFFF",
			textAlign: "center",
			centerXPx: 540,
			topPx: 326,
			lineHeight: 1,
			background: false,
		},
	});
	assert.equal(line1.fontSize, 5.625);
	assert.equal(line1["transform.positionX"], 0);
	assert.equal(line1["transform.positionY"], -699);
	assert.equal(line1["background.enabled"], false);
	assert.equal(line2.fontSize, 6.703125);
	assert.equal(line2["transform.positionX"], 0);
	assert.equal(line2["transform.positionY"], -562.5);
	assert.equal(line2["background.enabled"], false);
	assert.doesNotThrow(() => parseAutomationManifest(JSON.stringify({
		project: { name: "Title", width: 1080, height: 1920, fps: 30 },
		tracks: [
			{ type: "text", text: "제주 초등학교", start: 0, duration: 98, textStyle: {
				fontFamily: "Noto Sans KR", fontWeight: "bold", fontSizePx: 120, color: "#27D3E8",
				textAlign: "center", centerXPx: 540, topPx: 201, lineHeight: 1, background: false,
			} },
		],
	})));
});

test("reference-v3 video cover geometry matches the producer band", () => {
	assert.deepEqual(
		automationVideoGeometry({
			sourceSize: { width: 1920, height: 1080 },
			canvasSize: { width: 1080, height: 1920 },
			style: { fit: "cover", xPx: 0, yPx: 474, widthPx: 1080, heightPx: 972 },
		}),
		{
			positionX: 0,
			positionY: 0,
			scale: 1.6,
			maskWidth: 0.625,
			maskHeight: 1,
		},
	);
	assert.doesNotThrow(() => parseAutomationManifest(JSON.stringify({
		project: { name: "Motion handoff", width: 1080, height: 1920, fps: 30 },
		tracks: [{
			type: "video",
			src: "clip01.mp4",
			start: 0,
			duration: 8.2,
			sourceStart: 0,
			loop: true,
			videoStyle: { fit: "cover", xPx: 0, yPx: 474, widthPx: 1080, heightPx: 972 },
		}],
	})));
});

test("editable handoff keeps narration and BGM as separate audio tracks", () => {
	const manifest = parseAutomationManifest(JSON.stringify({
		project: { name: "BGM handoff", width: 1080, height: 1920, fps: 30 },
		tracks: [
			{ type: "audio", src: "narration-retimed.m4a", start: 0, duration: 50.8 },
			{ type: "audio", src: "background-music.m4a", start: 0, duration: 50.8, audioStyle: { volumeDb: -25, duckUnderNarration: true } },
		],
	}));
	assert.deepEqual(manifest.tracks.filter((track) => track.type === "audio").map((track) => track.src), ["narration-retimed.m4a", "background-music.m4a"]);
});

test("reimport replaces the mapped project instead of creating duplicates", async () => {
	const calls = {
		create: 0,
		load: 0,
		clear: 0,
		rename: 0,
		save: 0,
	};
	// This intentionally models only the managers exercised by an empty manifest.
	const editor = {
		project: {
			loadProject: async ({ id }: { id: string }) => {
				assert.equal(id, PROJECT_ID);
				calls.load += 1;
			},
			createNewProject: async () => {
				calls.create += 1;
				return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
			},
			renameProject: async () => {
				calls.rename += 1;
			},
			updateSettings: () => undefined,
			saveCurrentProject: async () => {
				calls.save += 1;
			},
		},
		media: {
			clearProjectMedia: async ({ projectId }: { projectId: string }) => {
				assert.equal(projectId, PROJECT_ID);
				calls.clear += 1;
			},
		},
		scenes: {
			initializeScenes: () => undefined,
			getActiveScene: () => ({ tracks: { main: { id: "main-track" } } }),
		},
		timeline: {
			insertElement: () => undefined,
		},
	} as unknown as EditorCore;
	const manifest: AutomationManifest = {
		project: { name: "Newsroom edit", width: 1920, height: 1080, fps: 30 },
		tracks: [],
	};

	const first = await importAutomationManifest({
		editor,
		manifest,
		files: [],
		existingProjectId: PROJECT_ID,
	});
	const second = await importAutomationManifest({
		editor,
		manifest,
		files: [],
		existingProjectId: PROJECT_ID,
	});

	assert.deepEqual(first, { projectId: PROJECT_ID });
	assert.deepEqual(second, { projectId: PROJECT_ID });
	assert.deepEqual(calls, {
		create: 0,
		load: 2,
		clear: 2,
		rename: 2,
		save: 2,
	});
});

test("a missing canonical handoff project is created with its exact id", async () => {
	let requestedId: string | undefined;
	const editor = {
		project: {
			loadProject: async () => { throw new Error("missing"); },
			createNewProject: async ({ id }: { id?: string }) => { requestedId = id; return id ?? "unexpected"; },
			updateSettings: () => undefined,
			saveCurrentProject: async () => undefined,
		},
		media: { clearProjectMedia: async () => undefined },
		scenes: { initializeScenes: () => undefined, getActiveScene: () => ({ tracks: { main: { id: "main-track" } } }) },
		timeline: { insertElement: () => undefined },
	} as unknown as EditorCore;
	const result = await importAutomationManifest({
		editor,
		manifest: { project: { id: PROJECT_ID, name: "Canonical edit", width: 1080, height: 1920, fps: 30 }, tracks: [] },
		files: [],
	});
	assert.equal(requestedId, PROJECT_ID);
	assert.deepEqual(result, { projectId: PROJECT_ID });
});

test("same-session manifest imports retain preview URLs for image assets", async () => {
	const globals = globalThis as unknown as Record<string, unknown>;
	const previousWindow = globals.window;
	const previousDocument = globals.document;
	const previousImage = globals.Image;
	const addedAssets: Array<Record<string, unknown>> = [];
	class TestImage {
		naturalWidth = 320;
		naturalHeight = 180;
		private listeners = new Map<string, () => void>();

		// eslint-disable-next-line opencut/prefer-object-params -- mirrors the DOM EventTarget API.
		addEventListener(type: string, listener: () => void): void {
			this.listeners.set(type, listener);
		}

		remove(): void {}

		set src(_value: string) {
			queueMicrotask(() => this.listeners.get("load")?.());
		}
	}
	globals.window = Object.assign(globalThis, { Image: TestImage });
	globals.document = {
		createElement: (tag: string) => {
			if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
			return {
				width: 0,
				height: 0,
				getContext: () => ({ drawImage: () => undefined }),
				toDataURL: () => "data:image/jpeg;base64,thumbnail",
			};
		},
	};

	try {
		const editor = {
			project: {
			createNewProject: async () => PROJECT_ID,
			updateSettings: () => undefined,
			getActiveProject: () => ({ metadata: { id: PROJECT_ID } }),
			},
			media: {
				clearProjectMedia: async () => undefined,
				addMediaAsset: async ({ asset }: { asset: Record<string, unknown> }) => {
					const saved = { ...asset, id: "asset-1" };
					addedAssets.push(saved);
					return saved;
				},
			},
			scenes: {
				initializeScenes: () => undefined,
				getActiveScene: () => ({ tracks: { main: { id: "main-track" } } }),
			},
			timeline: { insertElement: () => undefined },
		} as unknown as EditorCore;
		const file = new File([new Uint8Array([1, 2, 3])], "clip.png", { type: "image/png" });
		await importAutomationManifest({
			editor,
			manifest: {
				project: { name: "Preview URL import", width: 1080, height: 1920, fps: 30 },
				tracks: [{ type: "asset", src: "clip.png" }],
			},
			files: [file],
		});
		assert.equal(addedAssets.length, 1);
		assert.match(String(addedAssets[0].url), /^blob:/);
		assert.equal(addedAssets[0].thumbnailUrl, "data:image/jpeg;base64,thumbnail");
	} finally {
		globals.window = previousWindow;
		globals.document = previousDocument;
		if (previousImage === undefined) delete globals.Image;
		else globals.Image = previousImage;
	}
});
