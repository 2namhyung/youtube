import "server-only";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ScriptGeneration, type ScriptState } from "./project";
import { isCanonicalNewsroomProject, readWorkflow, scriptText } from "./project-runtime";

function newsroomDirectory(): string {
	let cursor = path.resolve(process.env.OPENCUT_NEWSROOM_ROOT ?? process.cwd());
	if (process.env.OPENCUT_NEWSROOM_ROOT) return cursor;
	for (let depth = 0; depth < 7; depth += 1) {
		const candidate = path.join(cursor, "production", "newsroom");
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	throw new Error("Local newsroom directory is unavailable");
}

function statePath(slug: string): string {
	return path.join(newsroomDirectory(), "projects", `${slug}.json`);
}

function isScriptState(value: unknown, slug: string): value is ScriptState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<ScriptState>;
	return state.slug === slug
		&& typeof state.draft === "string"
		&& state.draft.length <= 30_000
		&& state.status === "final"
		&& typeof state.savedAt === "string"
		&& typeof state.finalizedAt === "string"
		&& (state.generation === undefined || isGeneration(state.generation));
}

function isGeneration(value: unknown): value is ScriptGeneration {
	if (!value || typeof value !== "object") return false;
	const generation = value as Record<string, unknown>;
	if (generation.source === "user-approved-final-script") {
		return typeof generation.voiceProfile === "string" && typeof generation.contentChanged === "boolean";
	}
	return generation.model === "gpt-5.6-luna"
		&& generation.reasoningEffort === "xhigh"
		&& typeof generation.generatedAt === "string"
		&& (generation.source === "codex-cli" || generation.source === "user-approved-final-script");
}

export async function loadScriptState(slug: string): Promise<ScriptState> {
	if (!(await isCanonicalNewsroomProject(slug))) {
		const workflow = await readWorkflow(slug);
		const finalized = workflow.draftFinalized === true;
		const updatedAt = typeof workflow.updatedAt === "string" ? workflow.updatedAt : null;
		return {
			slug,
			draft: scriptText(workflow),
			status: finalized ? "final" : "draft",
			savedAt: updatedAt,
			finalizedAt: finalized ? updatedAt : null,
			generation: { source: "user-approved-final-script", voiceProfile: "project-workflow", contentChanged: false },
		};
	}
	try {
		const value: unknown = JSON.parse(await readFile(statePath(slug), "utf8"));
		if (!isScriptState(value, slug)) throw new Error("Canonical newsroom script is invalid");
		return value;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new Error("Canonical newsroom script is unavailable");
		throw error;
	}
}

export async function persistScriptState(_input: { slug: string; draft: string; finalize: boolean; generation?: ScriptGeneration }): Promise<never> {
	throw new Error("Canonical newsroom script is read-only");
}
