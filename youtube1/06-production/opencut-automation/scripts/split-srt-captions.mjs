#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
	throw new Error("Usage: node scripts/split-srt-captions.mjs <input.srt> <output.srt>");
}

const MIN_CUE_SECONDS = 0.65;
// Calibrated against OpenCut's Arial/fallback canvas measurement at 1080x1920.
// Keeping phrases under this limit prevents the editor from adding a second line.
const MAX_LINE_UNITS = 9.5;

function parseTime(value) {
	const [hours, minutes, rest] = value.trim().split(":");
	const [seconds, millis] = rest.split(",");
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function formatTime(value) {
	const millis = Math.max(0, Math.round(value * 1000));
	const hours = Math.floor(millis / 3_600_000);
	const minutes = Math.floor((millis % 3_600_000) / 60_000);
	const seconds = Math.floor((millis % 60_000) / 1000);
	const remainder = millis % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

function textUnits(text) {
	let units = 0;
	for (const char of text) {
		if (/\s/u.test(char)) units += 0.35;
		else if (/[\x00-\x7F]/u.test(char)) units += 0.55;
		else units += 1;
	}
	return units;
}

function splitPhrase(text) {
	const words = text.trim().replace(/\s+/gu, " ").split(" ");
	if (textUnits(text) <= MAX_LINE_UNITS) return [text.trim()];

	const chunks = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (current && textUnits(candidate) > MAX_LINE_UNITS) {
			chunks.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) chunks.push(current);

	// Avoid an unnatural one-word tail when it can fit on the previous line.
	if (chunks.length > 1 && textUnits(chunks.at(-1)) < 3) {
		const previousWords = chunks.at(-2).split(" ");
		const moved = previousWords.pop();
		if (moved) {
			const rebalancedTail = `${moved} ${chunks.at(-1)}`;
			const rebalancedPrevious = previousWords.join(" ");
			if (rebalancedPrevious && textUnits(rebalancedTail) <= MAX_LINE_UNITS) {
				chunks[chunks.length - 2] = rebalancedPrevious;
				chunks[chunks.length - 1] = rebalancedTail;
			}
		}
	}
	return chunks;
}

function allocateDurations(start, end, chunks) {
	const duration = end - start;
	const weights = chunks.map((chunk) => Math.max(1, textUnits(chunk)));
	const minimum = duration >= chunks.length * MIN_CUE_SECONDS ? MIN_CUE_SECONDS : duration / chunks.length;
	const remaining = Math.max(0, duration - minimum * chunks.length);
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	let cursor = start;
	return chunks.map((text, index) => {
		const cueStart = cursor;
		const cueEnd = index === chunks.length - 1
			? end
			: cueStart + minimum + remaining * (weights[index] / totalWeight);
		cursor = cueEnd;
		return { start: cueStart, end: cueEnd, text };
	});
}

const input = await fs.readFile(path.resolve(inputArg), "utf8");
const sourceCues = input.trim().split(/\r?\n\s*\r?\n/gu).map((block) => {
	const lines = block.split(/\r?\n/gu);
	const timingIndex = lines.findIndex((line) => line.includes("-->"));
	const [start, end] = lines[timingIndex].split("-->").map(parseTime);
	return { start, end, text: lines.slice(timingIndex + 1).join(" ").trim() };
});

const outputCues = [];
for (let index = 0; index < sourceCues.length; index += 1) {
	const cue = sourceCues[index];
	// SRT overlaps would display two text elements simultaneously. End the
	// earlier cue at the next cue's start while retaining the narration timing.
	const effectiveEnd = Math.min(cue.end, sourceCues[index + 1]?.start ?? cue.end);
	outputCues.push(...allocateDurations(cue.start, effectiveEnd, splitPhrase(cue.text)));
}

const output = outputCues.map((cue, index) =>
	`${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}`
).join("\n\n") + "\n";
await fs.writeFile(path.resolve(outputArg), output, "utf8");
console.log(JSON.stringify({ inputCues: sourceCues.length, outputCues: outputCues.length }, null, 2));
