#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
	throw new Error("Usage: node scripts/build-v3-ass.mjs <input.srt> <output.ass>");
}

function assTimestamp(timestamp) {
	const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(timestamp);
	if (!match) throw new Error(`Invalid SRT timestamp: ${timestamp}`);

	const [, hours, minutes, seconds, milliseconds] = match;
	const centiseconds = Math.round(Number(milliseconds) / 10)
		.toString()
		.padStart(2, "0");
	return `${Number(hours)}:${minutes}:${seconds}.${centiseconds}`;
}

function escapeAssText(text) {
	return text
		.replaceAll("\\", "\\\\")
		.replaceAll("{", "\\{")
		.replaceAll("}", "\\}")
		.replaceAll(/\r?\n/g, " ");
}

const source = await readFile(path.resolve(inputArg), "utf8");
const blocks = source.trim().split(/\r?\n\s*\r?\n/);
const captionCenterOffsets = [
	2, 2, 1, 0, 0, 2, 1, 2, 2, 2, 0, 2, 0, 1, 0, 0, 1, 1, 0, 1, 2, 0, 2,
	0, 0, 1, 0, 0, 2, 2, 1, 0, 0, 2, 2, 0, 0, 2, 2, 2, 2, 0, -1, 0, 2, 2,
	0, 1, 0, 0, 0, 2, 0, 1, 0, 2, 0, 2, 0, 0, 0, 2, 2, 1, 0, 2, 2, 0, 0,
	1, 0, 0, 2, 1, 0, 0, 0, 1, 2, 0, 2, 2, 2, 0, 2, 2, 1, 2, -1, 2, 0, 1,
	1, 2, 1, 2, 1,
];

if (blocks.length > captionCenterOffsets.length) {
	throw new Error(
		`Expected at most ${captionCenterOffsets.length} caption cues, received ${blocks.length}`,
	);
}

const events = blocks.map((block, index) => {
	const lines = block.split(/\r?\n/);
	const timing = lines[1]?.match(
		/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/,
	);
	if (!timing || lines.length < 3) {
		throw new Error(`Invalid SRT cue: ${block}`);
	}

	const text = escapeAssText(lines.slice(2).join(" "));
	const centerX = 540 + (captionCenterOffsets[index] ?? 0);
	const start = assTimestamp(timing[1]);
	const end = assTimestamp(timing[2]);
	return `Dialogue: 0,${start},${end},Caption,,0,0,0,,{\\an2\\pos(${centerX},1400)\\fscx94}${text}`;
});

const ass = `[Script Info]
Title: School case reference-style V3
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,School Shorts V3 Noto Sans KR,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,1,0,0,0,94,100,0,0,1,5,0,2,80,80,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

await writeFile(path.resolve(outputArg), ass, "utf8");
console.log(`Wrote ${events.length} V3 cues to ${path.resolve(outputArg)}`);
