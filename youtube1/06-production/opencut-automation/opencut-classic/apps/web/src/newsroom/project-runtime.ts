import "server-only";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params -- validated JSON persistence boundary and path helpers */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { readNewsroomProject, type NewsroomProjectRecord } from "@/newsroom/registry";
import { findYoutubeWorkspace } from "@/newsroom/workspace-server";
export { exactApprovalMatches, renderBindingSha256, sha256 } from "@/newsroom/artifact-binding";

export const SAFE_NEWSROOM_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/;
export type JsonRecord = Record<string, unknown>;

export function assertNewsroomSlug(slug: string) {
	if (!SAFE_NEWSROOM_SLUG.test(slug)) throw new Error("Invalid newsroom project slug.");
	return slug;
}

export function hasCanonicalNewsroomCapability(workflow: JsonRecord, project?: NewsroomProjectRecord | null) {
	if (project?.canonical === true || workflow.canonical === true) return true;
	return typeof workflow.draft === "string"
		&& workflow.status === "final"
		&& typeof workflow.savedAt === "string"
		&& typeof workflow.finalizedAt === "string"
		&& Boolean(workflow.generation && typeof workflow.generation === "object" && !Array.isArray(workflow.generation));
}

export async function isCanonicalNewsroomProject(slug: string) {
	assertNewsroomSlug(slug);
	const project = await readNewsroomProject(slug);
	if (project?.canonical === true) return true;
	try {
		const workflow = await readWorkflow(slug);
		return hasCanonicalNewsroomCapability(workflow, project);
	} catch (error) {
		// A human-promoted candidate is registered before its workflow is
		// materialized. Its first Research page load must route to the promoted
		// dossier desk, whose workflow API creates the durable *.workflow.json.
		// Missing both the workflow and legacy file therefore means
		// "non-canonical and not initialized yet", not a server error.
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

export function automationRoot() {
	return path.join(findYoutubeWorkspace(), "06-production", "opencut-automation");
}

export function workflowFile(slug: string) {
	return path.join(automationRoot(), "production", "newsroom", "projects", `${assertNewsroomSlug(slug)}.workflow.json`);
}

export function qualityFile(slug: string) {
	return path.join(automationRoot(), "production", "newsroom", "projects", `${assertNewsroomSlug(slug)}.quality.json`);
}

export async function readWorkflow(slug: string): Promise<JsonRecord> {
	assertNewsroomSlug(slug);
	let parsed: JsonRecord;
	try {
		parsed = JSON.parse(await readFile(workflowFile(slug), "utf8")) as JsonRecord;
	} catch (error) {
		// Legacy projects predate the per-slug workflow contract. Treat their
		// slug-named state as a read-only workflow-shaped record so they remain
		// addressable while new projects use *.workflow.json authoritatively.
		if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
		const legacyPath = path.join(automationRoot(), "production", "newsroom", "projects", `${slug}.json`);
		const legacy = JSON.parse(await readFile(legacyPath, "utf8")) as JsonRecord;
		const title = typeof legacy.title === "string" && legacy.title.trim() ? legacy.title : typeof legacy.topic === "string" && legacy.topic.trim() ? legacy.topic : slug;
		parsed = {
			...legacy,
			slug,
			title,
			candidate: typeof legacy.candidate === "object" && legacy.candidate && !Array.isArray(legacy.candidate) ? legacy.candidate : { id: slug, title },
			draftFinalized: legacy.status === "final",
			updatedAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : typeof legacy.savedAt === "string" ? legacy.savedAt : undefined,
		};
	}
	if (parsed.slug !== slug || typeof parsed.title !== "string" || !parsed.title.trim()) {
		throw new Error("Newsroom workflow is invalid.");
	}
	return parsed;
}

export async function writeWorkflow(slug: string, value: JsonRecord) {
	const destination = workflowFile(slug);
	await mkdir(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined);
	}
	return value;
}

export async function readProjectContext(slug: string) {
	assertNewsroomSlug(slug);
	const [workflow, project] = await Promise.all([readWorkflow(slug), readNewsroomProject(slug)]);
	return { slug, title: String(workflow.title), canonical: hasCanonicalNewsroomCapability(workflow, project), workflow };
}

export function renderPayload(workflow: JsonRecord) {
	const outer = workflow.render && typeof workflow.render === "object" ? workflow.render as JsonRecord : null;
	const inner = outer?.render && typeof outer.render === "object" ? outer.render as JsonRecord : null;
	return { status: outer, metadata: inner ?? outer };
}

export function scriptText(workflow: JsonRecord) {
	const draft = workflow.draft && typeof workflow.draft === "object" ? workflow.draft as JsonRecord : null;
	const sections = draft?.sections && typeof draft.sections === "object" ? draft.sections as JsonRecord : null;
	const order = ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"];
	return order.map((key) => String(sections?.[key] ?? "").trim()).filter(Boolean).join("\n\n");
}

export async function authoritativeScriptText(slugInput: string, workflow?: JsonRecord) {
	const slug = assertNewsroomSlug(slugInput);
	const bindingConfigPath = path.join(automationRoot(), "production", "newsroom", "script-bindings.json");
	let configured: JsonRecord | null = null;
	try {
		const parsed = JSON.parse(await readFile(bindingConfigPath, "utf8")) as { bindings?: JsonRecord[] };
		const matches = (parsed.bindings ?? []).filter((item) => item.newsroomSlug === slug);
		if (matches.length > 1) throw new Error("Duplicate production script binding for story.");
		configured = matches[0] ?? null;
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
	}
	if (!configured) {
		const current = workflow ?? await readWorkflow(slug);
		return { text: scriptText(current), source: "workflow" as const };
	}
	if (typeof configured.authoritativeScript !== "string" || !configured.authoritativeScript) throw new Error("Configured production script authority is invalid.");
	const root = path.resolve(automationRoot());
	const authorityPath = path.resolve(root, configured.authoritativeScript);
	const relative = path.relative(root, authorityPath);
	if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Production script binding escapes the automation workspace.");
	const authority = JSON.parse(await readFile(authorityPath, "utf8")) as JsonRecord;
	if (authority.slug !== slug || authority.status !== "final" || typeof authority.draft !== "string" || !authority.draft.trim()) throw new Error("Configured production script authority is invalid.");
	return { text: authority.draft.replace(/\r\n/gu, "\n").trim(), source: "production-binding" as const, path: configured.authoritativeScript };
}


export async function ensureAutomationOutput(file: string) {
	const outputRoot = await realpath(path.resolve(automationRoot(), "out"));
	let resolved: string;
	try {
		resolved = await realpath(path.resolve(file));
	} catch (error) {
		throw new Error("Project output is missing or outside the production output directory.", { cause: error });
	}
	const relative = path.relative(outputRoot, resolved);
	if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative) || !(await stat(resolved)).isFile()) {
		throw new Error("Project output is missing, not a regular file, or outside the production output directory.");
	}
	return resolved;
}
