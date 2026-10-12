#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
	throw new Error("Usage: node scripts/build-v2-ass.mjs <input.srt> <output.ass>");
}

const ACCENT_KEYWORDS = [
	"디지털 증거",
	"불법 촬영",
	"보호 조치",
	"출입 통제",
	"교권보호국",
	"CCTV",
	"피의자",
	"정액",
	"소변",
	"침입",
	"영장",
	"기각",
	"공포",
	"응징",
	"16세",
].sort((left, right) => right.length - left.length);

const WHITE = "&H00FFFFFF&";
const CYAN = "&H00E5D616&";

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

function accentKeywords(text) {
	let result = escapeAssText(text);
	for (const keyword of ACCENT_KEYWORDS) {
		result = result.replaceAll(
			keyword,
			`{\\c${CYAN}}${keyword}{\\c${WHITE}}`,
		);
	}
	return result;
}

const source = await readFile(path.resolve(inputArg), "utf8");
const blocks = source.trim().split(/\r?\n\s*\r?\n/);
const events = blocks.map((block) => {
	const lines = block.split(/\r?\n/);
	const timing = lines[1]?.match(
		/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/,
	);
	if (!timing || lines.length < 3) {
		throw new Error(`Invalid SRT cue: ${block}`);
	}

	const text = accentKeywords(lines.slice(2).join(" "));
	return `Dialogue: 0,${assTimestamp(timing[1])},${assTimestamp(timing[2])},Caption,,0,0,0,,${text}`;
});

const ass = `[Script Info]
Title: School case shorts V2
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,School Shorts Noto Sans KR,100,${WHITE},${CYAN},&H001F1107,&H9007111F,0,0,0,0,76,100,0,0,1,10,4,2,70,170,565,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

await writeFile(path.resolve(outputArg), ass, "utf8");
console.log(`Wrote ${events.length} cues to ${path.resolve(outputArg)}`);
