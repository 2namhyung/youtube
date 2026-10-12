import { expect, test } from "bun:test";
import { validRecord } from "./registry";

const baseRecord = {
	versionId: "preview-1",
	path: "C:/renders/video.mp4",
	thumbnailPath: "C:/renders/thumb.png",
	fileName: "video.mp4",
	thumbnailFileName: "thumb.png",
	thumbnail: "thumb.png",
	title: "Preview",
	duration: 1,
	frames: 30,
	fps: 30,
	resolution: { width: 1080, height: 1920 },
	templateId: "reference-v3",
	timestamp: new Date().toISOString(),
};

test("accepts a strictly shaped custom thumbnail override", () => {
	expect(validRecord({
		...baseRecord,
		thumbnailOverride: {
			image: "../../04-visual-assets/preview.png",
			sha256: "d3a77bb24971dc2c16e619db49f66ddf0a26c2f0a16b7eb34cb252156e638b89",
			source: "ai-generated-thumbnail-v1",
			provenance: "../../04-visual-assets/prompt.md",
		},
	})).toBe(true);
});

test("rejects malformed custom thumbnail metadata", () => {
	expect(validRecord({
		...baseRecord,
		thumbnailOverride: {
			image: "preview.png",
			sha256: "not-a-hash",
			source: "fixture",
		},
	})).toBe(false);
});
