import "server-only";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params -- validated local JSON boundary and compact hash helpers */

import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { assertNewsroomSlug, automationRoot, scriptText, readWorkflow, type JsonRecord } from "./project-runtime";

export type DeskStatus = "current" | "stale" | "missing" | "pass" | "warning" | "fail";
export type ProductionQaCheck = { id: string; status: "pass" | "warning" | "fail"; summary: string; details: JsonRecord[] };
export type WorkflowDraftVariant = { id: string; label: string; description: string; draftSha256: string; draft: string; selected: boolean };
export type ProductionScriptDeskState = {
	slug: string;
	productionProjectId: string;
	syncStatus: DeskStatus;
	syncReasons: string[];
	authority: { path: string; draft: string; draftSha256: string; finalizedAt: string | null; generatedAt: string | null; selectedDraftId: string | null; restorationStatus: string };
	workflow: { draftSha256: string | null; matchesAuthority: boolean | null; updatedAt: string | null; selectedDraftId: string | null; variants: WorkflowDraftVariant[] };
	conflicts: JsonRecord[];
	artifact: { versionId: string | null; handoffPath: string | null; handoffSha256: string | null; releaseStatus: string | null; publishable: boolean };
	qa: { generatedAt: string | null; status: "pass" | "warning" | "fail"; passes: number; warnings: number; failures: number; humanListeningRequired: boolean; checks: ProductionQaCheck[] } | null;
};

const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const qaStatus = (value: unknown): "pass" | "warning" | "fail" => value === "pass" || value === "warning" ? value : "fail";
const jsonHashWithout = (value: JsonRecord, field: string) => {
	const copy = { ...value };
	delete copy[field];
	return hash(JSON.stringify(copy));
};

function resolveInsideAutomation(relativePath: string) {
	const root = path.resolve(automationRoot());
	const resolved = path.resolve(root, relativePath);
	const relative = path.relative(root, resolved);
	if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Production script binding escapes the automation workspace.");
	return resolved;
}

async function latestPrivateHandoff(projectId: string) {
	const directory = path.join(automationRoot(), "out", ".private", projectId);
	if (!existsSync(directory)) return null;
	const candidates: { file: string; modified: number }[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.endsWith(".handoff")) continue;
		const file = path.join(directory, entry.name, "handoff.json");
		if (existsSync(file)) candidates.push({ file, modified: (await stat(file)).mtimeMs });
	}
	candidates.sort((a, b) => b.modified - a.modified || a.file.localeCompare(b.file));
	return candidates[0]?.file ?? null;
}

export async function loadProductionScriptDesk(slugInput: string): Promise<ProductionScriptDeskState | null> {
	const slug = assertNewsroomSlug(slugInput);
	const config = JSON.parse(await readFile(path.join(automationRoot(), "production", "newsroom", "script-bindings.json"), "utf8")) as { bindings?: JsonRecord[] };
	const allBindings = config.bindings ?? [];
	for (const field of ["newsroomSlug", "productionProjectId", "authoritativeScript"] as const) {
		const values = allBindings.map((item) => item[field]).filter((value): value is string => typeof value === "string");
		if (new Set(values).size !== values.length) throw new Error(`Duplicate production script binding ${field}.`);
	}
	const configuredMatches = allBindings.filter((item) => item.newsroomSlug === slug);
	if (configuredMatches.length > 1) throw new Error("Duplicate production script binding for story.");
	const configured = configuredMatches[0];
	if (!configured) return null;
	const productionProjectId = String(configured.productionProjectId);
	const authorityPath = resolveInsideAutomation(String(configured.authoritativeScript));
	const authorityText = await readFile(authorityPath, "utf8");
	const authority = JSON.parse(authorityText) as JsonRecord;
	if (authority.slug !== slug || authority.status !== "final" || typeof authority.draft !== "string") throw new Error("Configured production script authority is invalid.");
	const draft = authority.draft.replace(/\r\n/gu, "\n").trim();
	const draftSha256 = hash(draft);
	const reasons: string[] = [];
	const bindingPath = path.join(automationRoot(), "production", "newsroom", "projects", `${slug}.script-binding.json`);
	const qaPath = path.join(automationRoot(), "production", "newsroom", "projects", `${slug}.script-qa.json`);
	let binding: JsonRecord | null = null;
	let qa: JsonRecord | null = null;
	try { binding = JSON.parse(await readFile(bindingPath, "utf8")) as JsonRecord; } catch { reasons.push("binding metadata is missing"); }
	try { qa = JSON.parse(await readFile(qaPath, "utf8")) as JsonRecord; } catch { reasons.push("QA metadata is missing"); }
	const boundAuthority = binding?.authority && typeof binding.authority === "object" ? binding.authority as JsonRecord : null;
	if (binding && (binding.bindingSha256 !== jsonHashWithout(binding, "bindingSha256"))) reasons.push("binding metadata hash is invalid");
	if (boundAuthority?.draftSha256 !== draftSha256 || boundAuthority?.fileSha256 !== hash(authorityText)) reasons.push("authoritative script changed after the last sync");
	if (binding?.productionProjectId !== productionProjectId || boundAuthority?.path !== configured.authoritativeScript) reasons.push("configured production binding changed");
	if (qa && qa.qaSha256 !== jsonHashWithout(qa, "qaSha256")) reasons.push("QA metadata hash is invalid");
	if (qa && (qa.authoritativeDraftSha256 !== draftSha256 || qa.bindingSha256 !== binding?.bindingSha256)) reasons.push("QA is stale for the current authoritative script");
	const latestHandoff = await latestPrivateHandoff(productionProjectId);
	const latestRelative = latestHandoff ? path.relative(automationRoot(), latestHandoff).replaceAll(path.sep, "/") : null;
	const qaArtifact = qa?.artifact && typeof qa.artifact === "object" ? qa.artifact as JsonRecord : null;
	if (!latestHandoff) reasons.push("private render handoff is missing");
	else if (qaArtifact?.handoffPath !== latestRelative) reasons.push("a newer private handoff exists; refresh QA");
	const workflow = await readWorkflow(slug);
	const workflowText = scriptText(workflow);
	const workflowDraftSha256 = workflowText ? hash(workflowText) : null;
	const workflowDraftRecord = workflow.draft && typeof workflow.draft === "object" && !Array.isArray(workflow.draft) ? workflow.draft as JsonRecord : null;
	const selectedDraftId = typeof workflowDraftRecord?.selectedDraftId === "string" ? workflowDraftRecord.selectedDraftId : null;
	const variants: WorkflowDraftVariant[] = Array.isArray(workflowDraftRecord?.variants) ? workflowDraftRecord.variants.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		const variant = item as JsonRecord;
		const sections = variant.sections && typeof variant.sections === "object" && !Array.isArray(variant.sections) ? variant.sections as JsonRecord : null;
		const draft = ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"].map((key) => String(sections?.[key] ?? "").trim()).filter(Boolean).join("\n\n");
		if (typeof variant.id !== "string" || !draft) return [];
		return [{ id: variant.id, label: typeof variant.label === "string" ? variant.label : variant.id, description: typeof variant.description === "string" ? variant.description : "", draftSha256: hash(draft), draft, selected: variant.id === selectedDraftId }];
	}) : [];
	const boundWorkflow = binding?.workflow && typeof binding.workflow === "object" ? binding.workflow as JsonRecord : null;
	if (binding && (boundWorkflow?.draftSha256 !== workflowDraftSha256 || boundWorkflow?.updatedAt !== (typeof workflow.updatedAt === "string" ? workflow.updatedAt : null))) reasons.push("workflow draft changed after the last production sync; production authority is unchanged");
	const qaSummary = qa?.summary && typeof qa.summary === "object" ? qa.summary as JsonRecord : null;
	const checks: ProductionQaCheck[] = Array.isArray(qa?.checks) ? qa.checks.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((item) => ({ id: String(item.id), status: qaStatus(item.status), summary: String(item.summary ?? ""), details: Array.isArray(item.details) ? item.details.filter((detail): detail is JsonRecord => Boolean(detail && typeof detail === "object" && !Array.isArray(detail))) : [] })) : [];
	const restoration = authority.restoration && typeof authority.restoration === "object" ? authority.restoration as JsonRecord : null;
	const revision = authority.revision && typeof authority.revision === "object" ? authority.revision as JsonRecord : null;
	const restorationStatus = revision?.schemaVersion === "authoritative-script-revision-v1" && revision.draftSha256 === draftSha256 ? "editorial-revised" : restoration?.exactCharacterRestoration === true && restoration.restoredDraftSha256 === draftSha256 ? "restored-exact" : restoration ? "invalid-restoration" : "not-restored";
	return {
		slug,
		productionProjectId,
		syncStatus: reasons.length ? "stale" : "current",
		syncReasons: reasons,
		authority: { path: String(configured.authoritativeScript), draft, draftSha256, finalizedAt: typeof authority.finalizedAt === "string" ? authority.finalizedAt : null, generatedAt: typeof authority.generatedAt === "string" ? authority.generatedAt : null, selectedDraftId: typeof authority.selectedDraftId === "string" ? authority.selectedDraftId : null, restorationStatus },
		workflow: { draftSha256: workflowDraftSha256, matchesAuthority: workflowDraftSha256 ? workflowDraftSha256 === draftSha256 : null, updatedAt: typeof workflow.updatedAt === "string" ? workflow.updatedAt : null, selectedDraftId, variants },
		conflicts: Array.isArray(binding?.conflicts) ? binding.conflicts.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [],
		artifact: { versionId: typeof qaArtifact?.versionId === "string" ? qaArtifact.versionId : null, handoffPath: typeof qaArtifact?.handoffPath === "string" ? qaArtifact.handoffPath : null, handoffSha256: typeof qaArtifact?.handoffSha256 === "string" ? qaArtifact.handoffSha256 : null, releaseStatus: typeof qaArtifact?.releaseStatus === "string" ? qaArtifact.releaseStatus : null, publishable: qaArtifact?.publishable === true },
		qa: qaSummary ? { generatedAt: typeof qa?.generatedAt === "string" ? qa.generatedAt : null, status: qaStatus(qaSummary.status), passes: Number(qaSummary.passes ?? 0), warnings: Number(qaSummary.warnings ?? 0), failures: Number(qaSummary.failures ?? 0), humanListeningRequired: qaSummary.humanListeningRequired === true, checks } : null,
	};
}
