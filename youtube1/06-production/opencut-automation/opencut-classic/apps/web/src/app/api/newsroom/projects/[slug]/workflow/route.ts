import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { AUTONOMOUS_NARRATIVE_QUALITY_GUIDANCE, assertSnapshotMatchesCandidate, buildDraftPolicyPackage, buildLegalContextReport, hashJson, isCurrentLegalContextReport, validateDraftLegalCompliance } from "@/newsroom/legal-context";
import { hasExplicitEditorialDirection, readDefaultEditorialDirection } from "@/newsroom/editorial-direction";
import { appendDraftHistory } from "@/newsroom/draft-history";
import { acquireProjectMutationLock, releaseProjectMutationLock, type ProjectMutationLock } from "@/newsroom/project-mutation-lock";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params -- JSON persistence boundary and Next.js route signatures are validated below. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/;
const SAFE_REFERENCE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const FORBIDDEN_REFERENCE_TEXT = /(?:https?:\/\/|file:\/\/|\\\\[^\\\s]+[\\/]|[A-Za-z]:[\\/]|(?:^|[\s"'(])(?:\.\.?[\\/]|~[\\/]))/iu;
const PRODUCTION_JOB_ID = /^production-[a-f0-9]{40}$/;
const DRAFT_VARIANT_LABELS: Record<string, string> = {
	documentary: "행동 우선형",
	direct: "역할 충돌형",
	suspense: "뒤늦은 발견형",
	empathy: "신뢰·일상 영향형",
};
const DRAFT_SECTION_KEYS = ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"] as const;
const AUTONOMOUS_NARRATION_SCHEMA = "newsroom-autonomous-narration-v8";
const LEGACY_PROVISIONAL_NARRATION_SCHEMA = "newsroom-autonomous-narration-v7";
const PROVISIONAL_CUT_PLAN_SCHEMA = "newsroom-stage03-provisional-cut-plan-v1";
const AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA = "newsroom-independent-narration-critique-v8";
const AUTONOMOUS_NARRATION_REJECTION_SCHEMA = "newsroom-script-admission-rejection-v6";
const AUTONOMOUS_NARRATION_REJECTION_AUDIT_SCHEMA = "newsroom-script-rejection-audit-v12-story-text";
const ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION = "newsroom-autonomous-narration-prompt-v35-flow-readable-story";
const ACTIVE_AUTONOMOUS_CRITIC_PROMPT_VERSION = "newsroom-independent-narration-critic-prompt-v18-flow-readable-story";
const ACTIVE_AUTONOMOUS_GENERATOR_PREFIX = `codex-cli:gpt-5.6-sol:medium:${ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION}`;
const NARRATIVE_ENGINES = ["suspense", "curiosity-reversal", "role-conflict", "evidence-reversal", "escalating-action", "numeric-contrast"] as const;
const CRITIQUE_CATEGORIES = ["factual-legal"] as const;
const ADMISSION_REJECTION_REASONS = ["insufficient-narrative-material", "duration-below-minimum", "duration-above-maximum", "factual-grounding-failure", "legal-qualification-failure", "weak-opening-stake", "low-information-gain", "provenance-narration", "repetition-or-padding", "modality-mismatch", "other-editorial-failure"] as const;
const NARRATIVE_ARCHITECTURES = ["cold-open-reconstruction", "linear-escalation", "reveal-led", "explanation-led", "record-contrast", "number-contrast", "hybrid"] as const;
const HOOK_FUNCTIONS = ["imminent-risk", "role-conflict", "consequence", "evidence-reversal", "record-change", "decision-conflict", "number-anomaly", "unresolved-question", "other-case-specific-stake"] as const;
const RETENTION_DELTA_FUNCTIONS = ["action-change", "choice-or-response", "consequence", "causal-context", "contrast", "reinterpretation", "legal-result", "unresolved-state", "number-change", "record-or-decision-change"] as const;
type Context = { params: Promise<{ slug: string }> };
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rootDir() {
	let cursor = path.resolve(process.cwd());
	for (let depth = 0; depth < 8; depth += 1) {
		if (existsSync(path.join(cursor, "production", "newsroom"))) return cursor;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	throw new Error("Newsroom workspace is unavailable");
}

function productionJobDirectory(jobId: string) {
	if (!PRODUCTION_JOB_ID.test(jobId)) throw new Error("Invalid production orchestration job id");
	const jobsRoot = path.join(rootDir(), "out", "newsroom", "jobs");
	const resolved = path.resolve(jobsRoot, jobId);
	if (!resolved.startsWith(`${path.resolve(jobsRoot)}${path.sep}`)) throw new Error("Production job path escapes workspace");
	return resolved;
}

async function currentProductionBindingExists(current: JsonRecord) {
	const binding = current.productionOrchestration && typeof current.productionOrchestration === "object" && !Array.isArray(current.productionOrchestration) ? current.productionOrchestration as JsonRecord : null;
	const jobId = String(binding?.jobId || "");
	const authorityHash = String(binding?.authorityHash || "");
	if (!PRODUCTION_JOB_ID.test(jobId) || !/^[a-f0-9]{64}$/.test(authorityHash)) return false;
	try {
		const status = JSON.parse(await readFile(path.join(productionJobDirectory(jobId), "status.json"), "utf8")) as JsonRecord;
		return status.jobId === jobId && status.authorityHash === authorityHash;
	} catch {
		return false;
	}
}

function runOrchestrationCli(payload: JsonRecord) {
	return new Promise<JsonRecord>((resolve, reject) => {
		const root = rootDir();
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "orchestration-enqueue"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
		let stdout = ""; let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); });
		child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) return reject(new Error(stderr.trim().slice(-1200) || `Production enqueue exited ${code}`));
			try { resolve(JSON.parse(stdout) as JsonRecord); } catch { reject(new Error("Production enqueue returned invalid JSON")); }
		});
		child.stdin.end(JSON.stringify(payload));
	});
}

function cleanCommonMasterAssets(value: unknown) {
	if (!Array.isArray(value) || value.length > 48) throw new Error("commonMasterAssets must be an explicit bounded character catalog");
	const seen = new Set<string>();
	return value.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`commonMasterAssets[${index}] is invalid`);
		const record = item as JsonRecord; const approval = record.approval && typeof record.approval === "object" && !Array.isArray(record.approval) ? record.approval as JsonRecord : null; const masterAssetId = String(record.masterAssetId || "");
		if (!SAFE_REFERENCE_ID.test(masterAssetId) || seen.has(masterAssetId) || record.role !== "character" || record.visualAuthorityId !== "paper-cut-grok-storyboard-v2" || !/^[a-f0-9]{64}$/.test(String(record.visualAuthoritySha256 || "")) || typeof record.prompt !== "string" || !record.prompt.trim() || typeof record.spec !== "string" || !record.spec.trim() || approval?.approved !== true || approval.status !== "admitted" || !/^[a-f0-9]{64}$/.test(String(approval.sha256 || "")) || !Number.isSafeInteger(approval.bytes) || Number(approval.bytes) <= 0) throw new Error(`commonMasterAssets[${index}] authority is invalid`);
		seen.add(masterAssetId);
		return { masterAssetId, role: "character", visualAuthorityId: "paper-cut-grok-storyboard-v2", visualAuthoritySha256: String(record.visualAuthoritySha256), prompt: record.prompt.normalize("NFC").trim(), spec: record.spec.normalize("NFC").trim(), approval: { approved: true, status: "admitted", sha256: String(approval.sha256), bytes: Number(approval.bytes) } };
	});
}

function runReconciliationCli(payload: JsonRecord) {
	return new Promise<JsonRecord>((resolve, reject) => {
		const root = rootDir();
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "orchestration-reconcile"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
		let stdout = ""; let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject); child.on("close", (code) => { if (code !== 0) reject(new Error(stderr.trim().slice(-1200) || `Production reconciliation exited ${code}`)); else { try { resolve(JSON.parse(stdout) as JsonRecord); } catch { reject(new Error("Production reconciliation returned invalid JSON")); } } });
		child.stdin.end(JSON.stringify(payload));
	});
}

function runScenePromptCli(payload: JsonRecord) {
	return new Promise<JsonRecord>((resolve, reject) => {
		const root = rootDir();
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "scene-prompts"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
		let stdout = ""; let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => { if (code !== 0) reject(new Error(stderr.trim().slice(-1200) || `Scene prompt generation exited ${code}`)); else { try { resolve(JSON.parse(stdout) as JsonRecord); } catch { reject(new Error("Scene prompt generation returned invalid JSON")); } } });
		child.stdin.end(JSON.stringify(payload));
	});
}

function runFlowStoryScriptCli(payload: JsonRecord) {
	return new Promise<JsonRecord>((resolve, reject) => {
		const root = rootDir();
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "flow-story-script"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
		let stdout = ""; let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => { if (code !== 0) reject(new Error(stderr.trim().slice(-1200) || `Flow story script generation exited ${code}`)); else { try { resolve(JSON.parse(stdout) as JsonRecord); } catch { reject(new Error("Flow story script generation returned invalid JSON")); } } });
		child.stdin.end(JSON.stringify(payload));
	});
}

function runProductionControl(args: string[]) {
	return new Promise<JsonRecord>((resolve, reject) => {
		const root = rootDir();
		const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
		let stdout = ""; let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => { if (code !== 0) reject(new Error(stderr.trim().slice(-1200) || `Production control exited ${code}`)); else { try { resolve(JSON.parse(stdout) as JsonRecord); } catch { reject(new Error("Production control returned invalid JSON")); } } });
	});
}

function sanitizePublicError(cause: unknown) {
	return (cause instanceof Error ? cause.message : String(cause)).replace(/[A-Za-z]:\\[^\r\n"']+/gu, "<local-path>").replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/giu, "$1=<redacted>").slice(0, 1200);
}

async function markLaunchBlocked(jobId: string, cause: unknown) {
	const statusPath = path.join(productionJobDirectory(jobId), "status.json");
	try {
		const current = JSON.parse(await readFile(statusPath, "utf8")) as JsonRecord;
		await saveProductionStatus(statusPath, { ...current, state: "blocked", stage: "finalized", retryable: true, retryAfter: new Date(Date.now() + 30_000).toISOString(), error: `Production worker could not start: ${sanitizePublicError(cause)}`, updatedAt: new Date().toISOString() });
	} catch {
		// The job may not have reached durable status creation; finalization still
		// retains its private job identity for a later retry.
	}
}

async function saveProductionStatus(destination: string, state: JsonRecord) {
	const temporary = `${destination}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	await rename(temporary, destination);
}

function startProductionOrchestration(jobId: string, leaseId: string) {
	const root = rootDir();
	const child = spawn(process.execPath, [path.join(root, "scripts", "newsroom-cli.mjs"), "orchestrate", "--job", jobId], { cwd: root, detached: false, stdio: "ignore", shell: false, windowsHide: true });
	child.once("error", (error) => { void runProductionControl(["orchestration-release", "--job", jobId, "--lease", leaseId]).finally(() => markLaunchBlocked(jobId, error)); });
	child.unref();
}

function assertSlug(slug: string) {
	if (!SAFE_SLUG.test(slug)) throw new Error("Invalid newsroom project slug");
	return slug;
}

function workflowPath(slug: string) {
	return path.join(rootDir(), "production", "newsroom", "projects", `${assertSlug(slug)}.workflow.json`);
}

async function readDossier(slug: string): Promise<JsonRecord> {
	const file = path.join(rootDir(), "out", "newsroom", "research-dossiers.json");
	const parsed = JSON.parse(await readFile(file, "utf8")) as { dossiers?: JsonRecord[] };
	const dossier = (parsed.dossiers || []).find((item) => item.slug === slug || item.id === slug);
	if (!dossier) throw new Error("선택한 취재 후보를 찾을 수 없습니다.");
	return dossier;
}

function researchPath(slug: string) {
	return path.join(rootDir(), "production", "newsroom", "projects", `${assertSlug(slug)}.research.json`);
}

async function readResearchSnapshot(slug: string): Promise<JsonRecord> {
	try {
		const snapshot = JSON.parse(await readFile(researchPath(slug), "utf8")) as JsonRecord;
		if (snapshot.slug && snapshot.slug !== slug) throw new Error("연구 스냅샷 프로젝트 식별자가 일치하지 않습니다.");
		return snapshot;
	} catch {
		throw new Error("동일 사건 연구 스냅샷이 없습니다. 먼저 01 단계 연구를 새로고침하세요.");
	}
}

function stageReady(stages: JsonRecord, number: string) {
	const stage = stages[number];
	return Boolean(stage && typeof stage === "object" && !Array.isArray(stage) && (stage as JsonRecord).status === "ready");
}

async function requirePrerequisite(current: JsonRecord, action: string, slug: string) {
	const stages = current.stages && typeof current.stages === "object" && !Array.isArray(current.stages) ? current.stages as JsonRecord : {};
	if (["save-agent-video-design", "save-draft", "record-draft-rejection", "prepare-flow-story-script", "prepare-scene-batch", "save-media", "complete-bgm", "save-render", "approve-qa"].includes(action)) {
		const candidate = current.candidate && typeof current.candidate === "object" && !Array.isArray(current.candidate) ? current.candidate as JsonRecord : null;
		const snapshot = await readResearchSnapshot(slug);
		if (!candidate) throw new Error("02 단계의 최신 편집·영상 이용권 검토가 필요합니다.");
		assertSnapshotMatchesCandidate({ snapshot, candidate, slug });
		const report = current.legalContextReport;
		if (!isCurrentLegalContextReport({ report, candidate, researchSnapshot: snapshot }) || !stageReady(stages, "02")) throw new Error("02 단계의 최신 법률 검토 결과가 필요합니다. Stage 02에서 검토를 다시 생성하세요.");
		if (report && typeof report === "object" && !Array.isArray(report) && (report as JsonRecord).videoDecision && typeof (report as JsonRecord).videoDecision === "object" && ((report as JsonRecord).videoDecision as JsonRecord).decision === "block") throw new Error("법률 검토가 대본 생성을 차단했습니다.");
	}
	if (action === "save-media" && !stageReady(stages, "03")) throw new Error("03 단계 대본 확정 후 자료를 수집할 수 있습니다.");
	if (action === "complete-bgm" && !stageReady(stages, "04")) throw new Error("04 단계 자료 수집 후 BGM을 설정할 수 있습니다.");
	if (action === "save-render" && (!stageReady(stages, "05") || current.draftFinalized !== true)) throw new Error("05 단계와 확정 대본 후 렌더할 수 있습니다.");
	if (action === "approve-qa" && !stageReady(stages, "06")) throw new Error("06 단계 영상 생성 후 품질 승인을 할 수 있습니다.");
}

async function save(slug: string, state: JsonRecord) {
	const destination = workflowPath(slug);
	await mkdir(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	await rename(temporary, destination);
	return state;
}

async function load(slug: string) {
	try {
		const workflow = JSON.parse(await readFile(workflowPath(slug), "utf8")) as JsonRecord;
		const candidate = workflow.candidate && typeof workflow.candidate === "object" && !Array.isArray(workflow.candidate) ? workflow.candidate as JsonRecord : null;
		if (candidate && workflow.stages && typeof workflow.stages === "object" && !Array.isArray(workflow.stages)) {
			const stages = workflow.stages as JsonRecord;
			const legalStage = stages["02"] && typeof stages["02"] === "object" && !Array.isArray(stages["02"]) ? stages["02"] as JsonRecord : {};
			let stale = legalStage.status === "ready" && !workflow.legalContextReport;
			try {
				const snapshot = await readResearchSnapshot(slug);
				assertSnapshotMatchesCandidate({ snapshot, candidate, slug });
				stale = stale || (legalStage.status === "ready" && !isCurrentLegalContextReport({ report: workflow.legalContextReport, candidate, researchSnapshot: snapshot }));
			} catch {
				stale = stale || legalStage.status === "ready";
			}
			if (stale) {
				const resetStages: JsonRecord = { ...stages, "02": { status: "in-progress", reason: "legal-context-report-missing-or-stale" } };
				for (const number of ["03", "04", "05", "06", "07", "08"]) resetStages[number] = { status: "pending" };
				const next = {
					...workflow,
					updatedAt: new Date().toISOString(),
					stages: resetStages,
					legalContextReport: undefined,
					draft: undefined,
					draftFinalized: false,
					draftLegalCompliance: undefined,
					flowStoryScript: undefined,
					sceneBatch: undefined,
					videoDesignAuthorship: undefined,
					videoReferences: undefined,
					productionApproval: undefined,
					productionOrchestration: undefined,
					media: undefined,
					bgm: undefined,
					render: undefined,
					qa: undefined,
				};
				// GET is also the recovery path after a research refresh. Persist the
				// invalidation so a subsequent PATCH cannot reuse stale legal or
				// downstream production authorities.
				return save(slug, next);
			}
		}
		return workflow;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		const dossier = await readDossier(slug);
		const now = new Date().toISOString();
		return save(slug, {
			version: 1,
			slug,
			title: dossier.title,
			candidate: dossier,
			createdAt: now,
			updatedAt: now,
			stages: {
				"01": { status: "ready", completedAt: now },
				"02": { status: "in-progress" },
				"03": { status: "pending" },
				"04": { status: "pending" },
				"05": { status: "pending" },
				"06": { status: "pending" },
				"07": { status: "pending" },
				"08": { status: "pending" },
			},
		});
	}
}

function cleanSections(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("대본 섹션이 필요합니다.");
	const sections = value as JsonRecord;
	const unknownKeys = Object.keys(sections).filter((key) => !DRAFT_SECTION_KEYS.includes(key as (typeof DRAFT_SECTION_KEYS)[number]));
	if (unknownKeys.length) throw new Error(`지원하지 않는 대본 섹션입니다: ${unknownKeys.join(", ")}`);
	const cleaned = Object.fromEntries(DRAFT_SECTION_KEYS.flatMap((key) => {
		if (!(key in sections)) return [];
		const text = String(sections[key] ?? "").replace(/\r\n/g, "\n").trim();
		if (!text || text.length > 6_000) throw new Error(`${key} 대본은 1~6000자여야 합니다.`);
		return [[key, text]];
	}));
	if (Object.keys(cleaned).length < 1) throw new Error("대본에는 편집 섹션이 하나 이상 필요합니다.");
	if (Object.values(cleaned).join("\n\n").length > 30_000) throw new Error("최종 대본은 30000자를 넘을 수 없습니다.");
	return cleaned;
}

function cleanApprovedHeadline(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("승인할 2줄 제목이 필요합니다.");
	const record = value as JsonRecord;
	if (record.approved !== true) throw new Error("2줄 제목의 명시적 승인이 필요합니다.");
	const line = (candidate: unknown, label: string) => {
		const text = String(candidate ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
		if (!text || text.length > 36 || /[\r\n]/u.test(String(candidate ?? ""))) throw new Error(`${label}은 줄바꿈 없이 1~36자여야 합니다.`);
		return text;
	};
	return { approved: true, line1: line(record.line1, "제목 1행"), line2: line(record.line2, "제목 2행") };
}

function cleanDraftVariants(value: unknown) {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length < 2 || value.length > 4) throw new Error("비교할 대본 후보는 2~4개여야 합니다.");
	const seen = new Set<string>();
	const variants = value.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("올바른 대본 후보가 아닙니다.");
		const record = item as JsonRecord;
		const id = String(record.id || "");
		if (!DRAFT_VARIANT_LABELS[id] || seen.has(id)) throw new Error("지원하지 않거나 중복된 대본 후보입니다.");
		seen.add(id);
		const sections = cleanSections(record.sections);
		const compactLength = Object.values(sections).join("").replace(/\s/g, "").length;
		return { id, label: DRAFT_VARIANT_LABELS[id], description: String(record.description || "").slice(0, 160), sections, length: { compactLength } };
	});
	return variants;
}

function cleanVideoReferences(value: unknown) {
	if (!Array.isArray(value) || value.length > 80) throw new Error("referenceCatalog must be an array of at most 80 entries");
	const seen = new Set<string>(); const seenAssets = new Set<string>();
	return value.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`referenceCatalog[${index}] is invalid`);
		const record = item as JsonRecord;
		const unknown = Object.keys(record).filter((key) => !["id", "role", "description", "styleAnchors", "exactText", "required", "assetId"].includes(key));
		const id = String(record.id || "");
		if (unknown.length || !SAFE_REFERENCE_ID.test(id) || seen.has(id)) throw new Error(`referenceCatalog[${index}] fields or ID are invalid`);
		seen.add(id);
		const text = (candidate: unknown, label: string, max: number) => { const result = String(candidate || "").normalize("NFC").trim(); if (!result || result.length > max || FORBIDDEN_REFERENCE_TEXT.test(result)) throw new Error(`${label} is invalid`); return result; };
		const styleAnchors = Array.isArray(record.styleAnchors) ? record.styleAnchors : [];
		const exactText = Array.isArray(record.exactText) ? record.exactText : [];
		if (styleAnchors.length > 12 || exactText.length > 20) throw new Error(`referenceCatalog[${index}] text arrays are too large`);
		const assetId = record.assetId === undefined ? undefined : String(record.assetId);
		if (assetId !== undefined && (!SAFE_REFERENCE_ID.test(assetId) || seenAssets.has(assetId))) throw new Error(`referenceCatalog[${index}].assetId is invalid or duplicate`);
		if (assetId !== undefined) seenAssets.add(assetId);
		return { id, role: text(record.role, `referenceCatalog[${index}].role`, 120), description: text(record.description, `referenceCatalog[${index}].description`, 500), styleAnchors: styleAnchors.map((entry, anchor) => text(entry, `referenceCatalog[${index}].styleAnchors[${anchor}]`, 160)), exactText: exactText.map((entry, textIndex) => text(entry, `referenceCatalog[${index}].exactText[${textIndex}]`, 240)), required: record.required === true, ...(assetId ? { assetId } : {}) };
	});
}

function cleanSceneRecipes(value: unknown) {
	if (!Array.isArray(value) || value.length > 80) throw new Error("sceneRecipes must be an array of at most 80 entries");
	return value.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`sceneRecipes[${index}] is invalid`);
		const record = item as JsonRecord; const id = String(record.recipe_id || record.id || "");
		if (!SAFE_REFERENCE_ID.test(id)) throw new Error(`sceneRecipes[${index}] ID is invalid`);
		const roles = record.reference_role_requirements || record.reference_requirements || record.reference_roles || [];
		if (!Array.isArray(roles) || roles.length > 12) throw new Error(`sceneRecipes[${index}] roles are invalid`);
		const anchors = Array.isArray(record.styleAnchors) ? record.styleAnchors : [];
		const safe = (candidate: unknown, label: string) => { const result = String(candidate || "").normalize("NFC").trim(); if (!result || result.length > 160 || FORBIDDEN_REFERENCE_TEXT.test(result)) throw new Error(`${label} is invalid`); return result; };
		return { id, family: safe(record.family || "editorial", `sceneRecipes[${index}].family`), referenceRoles: roles.map((entry, roleIndex) => safe(typeof entry === "string" ? entry : (entry as JsonRecord)?.role, `sceneRecipes[${index}].referenceRoles[${roleIndex}]`)), styleAnchors: anchors.slice(0, 12).map((entry, anchor) => safe(entry, `sceneRecipes[${index}].styleAnchors[${anchor}]`)) };
	});
}

function cleanDraftGeneration(value: unknown, expectedPackage: JsonRecord, variants: ReturnType<typeof cleanDraftVariants>) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Codex CLI 대본 생성 이력이 필요합니다.");
	const record = value as JsonRecord;
	const promptContractVersion = String(record.promptContractVersion || "");
	if (record.schemaVersion !== 3 || record.provider !== "codex-cli" || record.model !== "gpt-5.6-sol" || record.reasoning !== "medium" || !/^newsroom-[a-z0-9-]{8,120}$/u.test(promptContractVersion)) throw new Error("대본은 검증 가능한 Codex CLI 생성 계약으로 다시 생성해야 합니다.");
	const hash = (key: string) => {
		const result = String(record[key] || "");
		if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`대본 생성 ${key} 값이 올바르지 않습니다.`);
		return result;
	};
	const expectedBinding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== expectedBinding.packageSha256) throw new Error("Codex 대본 입력 계약이 현재 검증 자료와 일치하지 않습니다.");
	const outputSha256 = hash("outputSha256");
	const currentVariantsSha256 = hashJson(variants.map((variant) => ({ id: variant.id, label: variant.label, description: variant.description, sections: variant.sections, length: variant.length })));
	const rawAttempts = record.variantAttempts;
	if (!rawAttempts || typeof rawAttempts !== "object" || Array.isArray(rawAttempts)) throw new Error("초안별 생성 이력이 없습니다.");
	const variantAttempts = Object.fromEntries(variants.map(({ id }) => {
		const attempts = Number((rawAttempts as JsonRecord)[id]);
		if (!Number.isInteger(attempts) || attempts < 1 || attempts > 2) throw new Error(`초안 ${id}의 생성 시도 수가 올바르지 않습니다.`);
		return [id, attempts];
	}));
	const attemptCount = Math.max(...Object.values(variantAttempts));
	if (Number(record.attemptCount) !== attemptCount) throw new Error("초안 생성 시도 횟수와 초안별 이력이 일치하지 않습니다.");
	return {
		schemaVersion: 3,
		provider: "codex-cli",
		model: "gpt-5.6-sol",
		reasoning: "medium",
		promptContractVersion,
		promptSha256: hash("promptSha256"), packageSha256, outputSha256, currentVariantsSha256,
		userEdited: currentVariantsSha256 !== outputSha256,
		cliVersion: String(record.cliVersion || "").slice(0, 120), attemptCount, variantAttempts,
		generatedAt: String(record.generatedAt || "").slice(0, 40),
	};
}

function cleanEditorialDirection(value: unknown) {
	if (value === undefined || value === null || String(value).trim() === "") return "";
	const direction = String(value).normalize("NFC").replace(/\r\n?/gu, "\n").trim();
	if (direction.length > 2_000 || /https?:\/\//iu.test(direction)) throw new Error("편집 방향은 URL 없이 2000자 이하여야 합니다.");
	return direction;
}

function draftPackageClaimIds(expectedPackage: JsonRecord) {
	const ids = new Set<string>();
	const caseHistory = expectedPackage.caseHistory && typeof expectedPackage.caseHistory === "object" && !Array.isArray(expectedPackage.caseHistory) ? expectedPackage.caseHistory as JsonRecord : {};
	for (const value of Object.values(caseHistory)) {
		if (!Array.isArray(value)) continue;
		for (const item of value) if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as JsonRecord).id === "string") ids.add(String((item as JsonRecord).id));
	}
	return ids;
}

function normalizeNarrationWhitespace(value: unknown) {
	return String(value || "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function narrationSentenceBoundaries(text: string) {
	const quotePairs = new Map<string, string>([["“", "”"], ["‘", "’"], ["「", "」"], ["『", "』"], ["《", "》"], ["〈", "〉"]]);
	const quoteStack: string[] = [];
	const boundaries: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const expectedCloser = quoteStack.at(-1);
		if (expectedCloser === char) {
			quoteStack.pop();
			continue;
		}
		if (quotePairs.has(char)) {
			quoteStack.push(quotePairs.get(char) as string);
			continue;
		}
		if (char === '"') {
			if (expectedCloser === '"') quoteStack.pop();
			else quoteStack.push('"');
			continue;
		}
		if (quoteStack.length || !/[.!?。！？]/u.test(char)) continue;
		let end = index + 1;
		while (end < text.length && /[.!?。！？]/u.test(text[end])) end += 1;
		boundaries.push(end);
		index = end - 1;
	}
	return boundaries;
}

function forbiddenReportorialNarrationPhrase(narration: string) {
	return AUTONOMOUS_NARRATIVE_QUALITY_GUIDANCE.forbiddenReportorialNarrationPhrases.find((phrase) => narration.includes(phrase)) || "";
}

const OPENING_SOURCE_OR_SUMMARY_FRAME = /^(?:(?:["'“‘「『《〈(]|\[)\s*)*(?:경찰\s*조사에\s*따르면|업주에\s*따르면|고소장에는|[^.!?。！？]{0,24}설명으로는|발단은|시작은|사건은)/u;
const STOCK_REFLECTIVE_CODA = /(?:되돌아보게\s*(?:합니다|됩니다)|(?:씁쓸함|서늘함|막막함)(?:을|이)\s*남(?:깁니다|겼습니다)|누구(?:라도|나)|누구의[^.!?。！？]{0,80}(?:되돌아|생각|느끼|남깁)|(?:^|[\s,])우리(?:가|는|의|에게| 안의))/u;
const PROVENANCE_META_NARRATION = /(?:독립\s*보도\s*(?:(?:한|1)\s*(?:곳|건))?|단일\s*출처|보도\s*시점|확인\s*범위|같은\s*보도|현재\s*확인된\s*법적\s*단계|확인되지\s*않았습니다|확인할\s*수\s*없었습니다)/u;
const LOW_STAKE_CHRONOLOGY_OPENING = /(?:식사를?\s*(?:시작|이어|마친)|주문한\s*뒤)/u;

function narrationSurfaceFailureCodes(sentences: string[]) {
	return [
		...(sentences.slice(0, 2).some((sentence) => OPENING_SOURCE_OR_SUMMARY_FRAME.test(sentence)) ? ["opening-source-or-summary-frame"] : []),
		...(sentences.length && STOCK_REFLECTIVE_CODA.test(sentences.at(-1) || "") ? ["stock-reflective-coda"] : []),
		...(sentences.some((sentence) => PROVENANCE_META_NARRATION.test(sentence)) ? ["provenance-metadata-narration"] : []),
		...(sentences.slice(0, 2).some((sentence) => LOW_STAKE_CHRONOLOGY_OPENING.test(sentence)) ? ["low-stake-chronology-opening"] : []),
	];
}

function _cleanAutonomousNarrationAuthority(value: unknown, expectedPackage: JsonRecord) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("자율 구성 대본 권위가 필요합니다.");
	const record = value as JsonRecord;
	if (record.schema !== AUTONOMOUS_NARRATION_SCHEMA) throw new Error("새 저장은 newsroom-autonomous-narration-v1 대본만 허용합니다. 기존 4안/섹션 대본은 읽기 전용입니다.");
	const narration = normalizeNarrationWhitespace(record.narration);
	if (!narration || narration.length > 30_000 || !/[가-힣]/u.test(narration)) throw new Error("연속 한국어 대본은 기술적 안전 상한 30000자 이하여야 합니다.");
	if (!Array.isArray(record.beats) || record.beats.length < 1 || record.beats.length > 64) throw new Error("모델이 선택한 beat는 1~64개여야 합니다.");
	const knownClaimIds = draftPackageClaimIds(expectedPackage);
	const usedClaimRefs = new Set<string>();
	const beats = record.beats.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`beat ${index + 1}이 올바르지 않습니다.`);
		const beat = value as JsonRecord;
		const role = String(beat.role || "").normalize("NFC").trim();
		const summary = String(beat.summary || "").normalize("NFC").trim();
		if (!role || role.length > 200 || !summary || summary.length > 1_000) throw new Error(`beat ${index + 1}의 역할 또는 설명이 올바르지 않습니다.`);
		if (!Array.isArray(beat.claimRefs) || beat.claimRefs.length > 64) throw new Error(`beat ${index + 1}의 claimRefs가 올바르지 않습니다.`);
		const claimRefs = [...new Set(beat.claimRefs.map((item) => String(item || "").trim()).filter(Boolean))];
		for (const claimRef of claimRefs) {
			if (!knownClaimIds.has(claimRef)) throw new Error(`beat ${index + 1}이 현재 사건에 없는 claim을 참조합니다: ${claimRef}`);
			usedClaimRefs.add(claimRef);
		}
		return { role, summary, claimRefs };
	});
	if (usedClaimRefs.size < 1) throw new Error("자율 대본은 검증된 사건 claim을 하나 이상 참조해야 합니다.");
	const decision = record.editorialDecision && typeof record.editorialDecision === "object" && !Array.isArray(record.editorialDecision) ? record.editorialDecision as JsonRecord : null;
	const approach = String(decision?.approach || "").normalize("NFC").trim();
	const rationale = String(decision?.rationale || "").normalize("NFC").trim();
	if (!approach || approach.length > 1_000 || !rationale || rationale.length > 2_000) throw new Error("모델의 편집 결정과 근거가 필요합니다.");
	const hookInput = decision?.hook && typeof decision.hook === "object" && !Array.isArray(decision.hook) ? decision.hook as JsonRecord : null;
	const hookChoice = String(hookInput?.choice || "").normalize("NFC").trim();
	const hookRationale = String(hookInput?.rationale || "").normalize("NFC").trim();
	const suppliedOpeningText = normalizeNarrationWhitespace(hookInput?.openingText);
	const impactText = normalizeNarrationWhitespace(hookInput?.impactText);
	const impactMechanism = String(hookInput?.impactMechanism || "").normalize("NFC").trim();
	const expectationText = normalizeNarrationWhitespace(hookInput?.expectationText);
	const breachText = normalizeNarrationWhitespace(hookInput?.breachText);
	const withheldQuestion = String(hookInput?.withheldQuestion || "").normalize("NFC").trim();
	const retentionGap = String(hookInput?.retentionGap || "").normalize("NFC").trim();
	const payoff = normalizeNarrationWhitespace(hookInput?.payoff);
	if (!hookChoice || hookChoice.length > 500 || !hookRationale || hookRationale.length > 1_500 || !suppliedOpeningText || suppliedOpeningText.length > 2_000 || impactText.length < 2 || impactText.length > 1_500 || !impactMechanism || impactMechanism.length > 1_000 || expectationText.length < 2 || expectationText.length > 1_000 || breachText.length < 2 || breachText.length > 1_000 || expectationText === breachText || !withheldQuestion || withheldQuestion.length > 1_000 || !retentionGap || retentionGap.length > 1_000 || !payoff || payoff.length > 1_500) throw new Error("모델의 hook 선택, impact 감사, 실제 opening, 서로 다른 expectation/breach 문구, retention gap과 payoff가 필요합니다.");
	const sentenceBoundaries = narrationSentenceBoundaries(narration);
	const openingPrefixes = sentenceBoundaries.slice(0, 2).map((end) => narration.slice(0, end).trim());
	if (!openingPrefixes.includes(suppliedOpeningText)) throw new Error("제출된 hook openingText는 공백 정규화 뒤 인용문을 고려한 실제 첫 한두 문장 prefix여야 합니다.");
	const openingText = openingPrefixes.find((prefix) => prefix.includes(impactText) && prefix.includes(expectationText) && prefix.includes(breachText));
	if (!openingText || openingText.length >= narration.length) throw new Error("hook impactText, expectationText와 breachText는 모두 인용문을 고려한 실제 첫 한두 문장 안에 있고 이후 payoff 대본을 남겨야 합니다.");
	if (narration.indexOf(payoff, openingText.length) < openingText.length) throw new Error("hook payoff는 openingText 뒤의 실제 narration 문구와 정확히 일치해야 합니다.");
	for (const phrase of AUTONOMOUS_NARRATIVE_QUALITY_GUIDANCE.forbiddenOpeningPhrases) {
		if (openingText.includes(phrase)) throw new Error(`대본 opening에 금지된 내용 없는 hook 문구가 포함되어 있습니다: ${phrase}`);
	}
	const forbiddenReportorialPhrase = forbiddenReportorialNarrationPhrase(narration);
	if (forbiddenReportorialPhrase) throw new Error(`대본 전체에 보도 제작 메타 또는 무주체 수동 귀속을 포함할 수 없습니다: ${forbiddenReportorialPhrase}`);
	const cleanHookClaimRefs = (input: unknown, label: string) => {
		if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new Error(`${label}는 검증된 claim을 1~64개 참조해야 합니다.`);
		const claimRefs = [...new Set(input.map((item) => String(item || "").trim()).filter(Boolean))];
		if (claimRefs.length < 1) throw new Error(`${label}는 검증된 claim을 참조해야 합니다.`);
		for (const claimRef of claimRefs) {
			if (!knownClaimIds.has(claimRef)) throw new Error(`${label}가 현재 사건에 없는 claim을 참조합니다: ${claimRef}`);
			if (!usedClaimRefs.has(claimRef)) throw new Error(`${label}는 모델이 작성한 beat에도 결합된 claim을 참조해야 합니다: ${claimRef}`);
		}
		return claimRefs;
	};
	const expectationClaimRefs = cleanHookClaimRefs(hookInput?.expectationClaimRefs, "hook expectationClaimRefs");
	const breachClaimRefs = cleanHookClaimRefs(hookInput?.breachClaimRefs, "hook breachClaimRefs");
	if (new Set([...expectationClaimRefs, ...breachClaimRefs]).size < 2) throw new Error("hook expectation/breach 충돌은 서로 다른 현재 사건 claim을 최소 두 개 참조해야 합니다.");
	const impactClaimRefs = cleanHookClaimRefs(hookInput?.impactClaimRefs, "hook impactClaimRefs");
	const payoffClaimRefs = cleanHookClaimRefs(hookInput?.payoffClaimRefs, "hook payoffClaimRefs");
	const sceneCraftInput = decision?.sceneCraft && typeof decision.sceneCraft === "object" && !Array.isArray(decision.sceneCraft) ? decision.sceneCraft as JsonRecord : null;
	if (!sceneCraftInput) throw new Error("모델의 sceneCraft 편집 결정이 필요합니다.");
	const sceneApproach = String(sceneCraftInput.approach || "").normalize("NFC").trim();
	const continuityRationale = String(sceneCraftInput.continuityRationale || "").normalize("NFC").trim();
	const attributionStrategy = String(sceneCraftInput.attributionStrategy || "").normalize("NFC").trim();
	if (!sceneApproach || sceneApproach.length > 1_000 || !continuityRationale || continuityRationale.length > 1_500 || !attributionStrategy || attributionStrategy.length > 1_500) throw new Error("sceneCraft의 접근, continuity 근거와 귀속 전략이 필요합니다.");
	if (!Array.isArray(sceneCraftInput.sceneSpans) || sceneCraftInput.sceneSpans.length < 1 || sceneCraftInput.sceneSpans.length > 64) throw new Error("sceneCraft에는 검증 claim에 결합된 scene span이 1~64개 필요합니다.");
	const sceneSpans = sceneCraftInput.sceneSpans.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`scene span ${index + 1}이 올바르지 않습니다.`);
		const entry = value as JsonRecord;
		const text = normalizeNarrationWhitespace(entry.text);
		const continuityRole = String(entry.continuityRole || "").normalize("NFC").trim();
		if (text.length < 2 || text.length > 1_500 || !narration.includes(text) || !continuityRole || continuityRole.length > 500) throw new Error(`scene span ${index + 1}은 실제 narration 문구와 자유형 continuity 역할이어야 합니다.`);
		const claimRefs = cleanHookClaimRefs(entry.claimRefs, `sceneCraft sceneSpans[${index}].claimRefs`);
		return { text, claimRefs, continuityRole };
	});
	if (!sceneSpans.some((entry) => openingText.includes(entry.text))) throw new Error("sceneCraft는 실제 opening 안의 검증된 scene span을 하나 이상 결합해야 합니다.");
	if (!Array.isArray(sceneCraftInput.attributions) || sceneCraftInput.attributions.length > 64) throw new Error("sceneCraft attributions는 최대 64개 배열이어야 합니다.");
	const attributions = sceneCraftInput.attributions.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`attribution ${index + 1}이 올바르지 않습니다.`);
		const entry = value as JsonRecord;
		const text = normalizeNarrationWhitespace(entry.text);
		const necessity = String(entry.necessity || "").normalize("NFC").trim();
		if (text.length < 2 || text.length > 1_500 || !narration.includes(text) || !necessity || necessity.length > 1_000) throw new Error(`attribution ${index + 1}은 실제 narration 문구와 필요 이유를 가져야 합니다.`);
		const claimRefs = cleanHookClaimRefs(entry.claimRefs, `sceneCraft attributions[${index}].claimRefs`);
		return { text, claimRefs, necessity };
	});
	const codaInput = decision?.coda && typeof decision.coda === "object" && !Array.isArray(decision.coda) ? decision.coda as JsonRecord : null;
	if (!codaInput) throw new Error("모델의 coda 편집 결정이 필요합니다.");
	const dominantAftertaste = String(codaInput.dominantAftertaste || "").normalize("NFC").trim();
	const codaRationale = String(codaInput.codaRationale || "").normalize("NFC").trim();
	const closingText = normalizeNarrationWhitespace(codaInput.closingText);
	if (!dominantAftertaste || dominantAftertaste.length > 300 || !codaRationale || codaRationale.length > 1_500 || closingText.length < 2 || closingText.length > 1_500) throw new Error("모델의 자유형 dominant aftertaste, coda 근거와 실제 closing 문구가 필요합니다.");
	const previousSentenceEnd = sentenceBoundaries.length > 1 ? sentenceBoundaries.at(-2) as number : 0;
	if (closingText !== narration.slice(previousSentenceEnd).trim()) throw new Error("coda closingText는 narration의 실제 마지막 문장과 정확히 같아야 합니다.");
	const codaClaimRefs = cleanHookClaimRefs(codaInput.claimRefs, "coda claimRefs");
	const binding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const lineage = record.evidenceLineage && typeof record.evidenceLineage === "object" && !Array.isArray(record.evidenceLineage) ? record.evidenceLineage as JsonRecord : null;
	if (!lineage || lineage.schema !== "newsroom-autonomous-narration-evidence-lineage-v1" || lineage.packageSha256 !== binding.packageSha256 || lineage.eventDossierSha256 !== binding.eventDossierSha256 || lineage.legalReportSha256 !== binding.legalReportSha256) throw new Error("대본 evidence lineage가 현재 research/legal 권위와 일치하지 않습니다.");
	if (!Array.isArray(lineage.usedClaimRefs) || hashJson([...new Set(lineage.usedClaimRefs.map(String))]) !== hashJson([...usedClaimRefs])) throw new Error("대본 evidence lineage의 claim 참조가 beat와 일치하지 않습니다.");
	return { schema: AUTONOMOUS_NARRATION_SCHEMA, narration, beats, editorialDecision: { approach, rationale, hook: { choice: hookChoice, rationale: hookRationale, openingText, impactText, impactClaimRefs, impactMechanism, expectationText, expectationClaimRefs, breachText, breachClaimRefs, withheldQuestion, retentionGap, payoff, payoffClaimRefs }, sceneCraft: { approach: sceneApproach, continuityRationale, sceneSpans, attributionStrategy, attributions }, coda: { dominantAftertaste, codaRationale, closingText, claimRefs: codaClaimRefs } }, evidenceLineage: { schema: lineage.schema, packageSha256: lineage.packageSha256, eventDossierSha256: lineage.eventDossierSha256, legalReportSha256: lineage.legalReportSha256, usedClaimRefs: [...usedClaimRefs] } };
}

function _cleanAutonomousDraftGeneration(value: unknown, expectedPackage: JsonRecord, authority: ReturnType<typeof _cleanAutonomousNarrationAuthority>) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Codex CLI 자율 대본 생성 이력이 필요합니다.");
	const record = value as JsonRecord;
	if (record.schemaVersion !== 13 || record.provider !== "codex-cli" || record.model !== "gpt-5.6-sol" || record.reasoning !== "medium" || record.promptContractVersion !== "newsroom-autonomous-narration-prompt-v10" || Number(record.attemptCount) !== 1) throw new Error("대본은 단일 호출 자율 대본 계약으로 다시 생성해야 합니다.");
	const hash = (key: string) => { const result = String(record[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`대본 생성 ${key} 값이 올바르지 않습니다.`); return result; };
	const binding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("Codex 대본 입력 계약이 현재 검증 자료와 일치하지 않습니다.");
	const outputSha256 = hash("outputSha256");
	const currentAuthoritySha256 = hashJson(authority);
	return { schemaVersion: 13, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: "newsroom-autonomous-narration-prompt-v10", promptSha256: hash("promptSha256"), packageSha256, outputSha256, currentAuthoritySha256, userEdited: currentAuthoritySha256 !== outputSha256, cliVersion: String(record.cliVersion || "").slice(0, 120), attemptCount: 1, generatedAt: String(record.generatedAt || "").slice(0, 40) };
}

function cleanStage03V16NarrationAuthority(value: unknown, expectedPackage: JsonRecord) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("v23 자율 대본 권위가 필요합니다.");
	const record = value as JsonRecord;
	if (![AUTONOMOUS_NARRATION_SCHEMA, LEGACY_PROVISIONAL_NARRATION_SCHEMA].includes(String(record.schema))) throw new Error("새 저장은 newsroom-autonomous-narration-v8만 허용하며 기존 대본은 읽기 전용입니다.");
	const legacyProvisional = record.schema === LEGACY_PROVISIONAL_NARRATION_SCHEMA;
	const narration = normalizeNarrationWhitespace(record.narration);
	if (!narration || narration.length > 30_000 || !/[가-힣]/u.test(narration)) throw new Error("연속 한국어 대본은 기술적 안전 상한 30000자 이하여야 합니다.");
	const boundaries = narrationSentenceBoundaries(narration);
	const sentenceTexts: string[] = [];
	let start = 0;
	for (const end of boundaries) {
		const sentence = narration.slice(start, end).trim();
		if (sentence) sentenceTexts.push(sentence);
		start = end;
	}
	const remainder = narration.slice(start).trim();
	if (remainder) sentenceTexts.push(remainder);
	if (!sentenceTexts.length || sentenceTexts.length > 64 || !Array.isArray(record.sentences) || record.sentences.length !== sentenceTexts.length) throw new Error("문장 메타데이터는 narration의 모든 문장을 정확히 한 번씩 포함해야 합니다.");
	const knownClaimIds = draftPackageClaimIds(expectedPackage);
	const usedClaimRefs = new Set<string>();
	const sentences = record.sentences.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`문장 ${index + 1} 메타데이터가 올바르지 않습니다.`);
		const entry = value as JsonRecord;
		const text = normalizeNarrationWhitespace(entry.text);
		if (text !== sentenceTexts[index]) throw new Error(`문장 ${index + 1} 메타데이터가 narration과 일치하지 않습니다.`);
		if (!Array.isArray(entry.claimRefs) || entry.claimRefs.length < 1 || entry.claimRefs.length > 64) throw new Error(`문장 ${index + 1} claimRefs가 올바르지 않습니다.`);
		const claimRefs = [...new Set(entry.claimRefs.map((item) => String(item || "").trim()).filter(Boolean))];
		for (const claimRef of claimRefs) {
			if (!knownClaimIds.has(claimRef)) throw new Error(`문장 ${index + 1}이 현재 사건에 없는 claim을 참조합니다: ${claimRef}`);
			usedClaimRefs.add(claimRef);
		}
		return { text, claimRefs };
	});
	if (!usedClaimRefs.size) throw new Error("대본은 현재 사건 claim을 하나 이상 참조해야 합니다.");
	const binding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const lineage = record.evidenceLineage && typeof record.evidenceLineage === "object" && !Array.isArray(record.evidenceLineage) ? record.evidenceLineage as JsonRecord : null;
	const expectedLineageSchema = legacyProvisional ? "newsroom-autonomous-narration-evidence-lineage-v7" : "newsroom-autonomous-narration-evidence-lineage-v8";
	if (!lineage || lineage.schema !== expectedLineageSchema || lineage.packageSha256 !== binding.packageSha256 || lineage.eventDossierSha256 !== binding.eventDossierSha256 || lineage.legalReportSha256 !== binding.legalReportSha256 || lineage.caseBriefSha256 !== binding.caseBriefSha256) throw new Error("대본 evidence lineage가 현재 research/legal/caseBrief 권위와 일치하지 않습니다.");
	if (!Array.isArray(lineage.usedClaimRefs) || hashJson([...new Set(lineage.usedClaimRefs.map(String))]) !== hashJson([...usedClaimRefs])) throw new Error("대본 evidence lineage claim 참조가 문장 metadata와 일치하지 않습니다.");
	if (!legacyProvisional) return { schema: AUTONOMOUS_NARRATION_SCHEMA, narration, sentences, evidenceLineage: { schema: expectedLineageSchema, packageSha256: lineage.packageSha256, eventDossierSha256: lineage.eventDossierSha256, legalReportSha256: lineage.legalReportSha256, caseBriefSha256: lineage.caseBriefSha256, usedClaimRefs: [...usedClaimRefs] } };
	const planInput = record.provisionalCutPlan && typeof record.provisionalCutPlan === "object" && !Array.isArray(record.provisionalCutPlan) ? record.provisionalCutPlan as JsonRecord : null;
	if (!planInput || planInput.schema !== PROVISIONAL_CUT_PLAN_SCHEMA || planInput.status !== "advisory-only-owner-timing-and-semantic-cut-seal-required" || planInput.narrationSha256 !== createHash("sha256").update(narration).digest("hex") || !Array.isArray(planInput.cuts) || !planInput.cuts.length || planInput.cuts.length > 64) throw new Error("v7 provisional cut plan is missing or stale");
	const sentenceRanges: Array<{ start: number; end: number }> = [];
	let sentenceStart = 0;
	for (const boundary of boundaries) {
		const text = narration.slice(sentenceStart, boundary).trim();
		if (text) { const start = narration.indexOf(text, sentenceStart); sentenceRanges.push({ start, end: start + text.length }); }
		sentenceStart = boundary;
	}
	const narrationRemainder = narration.slice(sentenceStart).trim();
	if (narrationRemainder) { const start = narration.indexOf(narrationRemainder, sentenceStart); sentenceRanges.push({ start, end: start + narrationRemainder.length }); }
	let cursor = 0;
	const cuts = planInput.cuts.map((raw, index) => {
		if (!isRecord(raw)) throw new Error(`provisional cut ${index + 1} is invalid`);
		const cutId = String(raw.cutId || "");
		if (cutId !== `cut-${String(index + 1).padStart(3, "0")}`) throw new Error(`provisional cut ${index + 1} is out of order`);
		const narrationText = String(raw.narrationText || "").normalize("NFC").replace(/\s+/gu, " ");
		if (!narrationText || narration.slice(cursor, cursor + narrationText.length) !== narrationText) throw new Error(`provisional cut ${cutId} is not an exact next narration substring`);
		const start = cursor; const end = cursor + narrationText.length;
		const sentenceRefs = [...new Set((Array.isArray(raw.sentenceRefs) ? raw.sentenceRefs : []).map((item) => Number(item)))];
		const expectedRefs = sentenceRanges.map((range, rangeIndex) => range.start < end && range.end > start ? rangeIndex + 1 : null).filter((item): item is number => item !== null);
		if (!sentenceRefs.length || sentenceRefs.some((ref) => !Number.isInteger(ref) || ref < 1 || ref > sentenceTexts.length) || JSON.stringify(sentenceRefs) !== JSON.stringify(expectedRefs)) throw new Error(`provisional cut ${cutId} sentenceRefs do not match its substring`);
		const semanticClass = String(raw.semanticClass || "");
		const cameraActionKorean = String(raw.cameraActionKorean || "").normalize("NFC").trim();
		const videoPromptEnglish = String(raw.videoPromptEnglish || "").normalize("NFC").trim();
		if (!["human-action", "information-motion"].includes(semanticClass) || !cameraActionKorean || cameraActionKorean.length > 800 || !videoPromptEnglish || videoPromptEnglish.length > 1_200 || /https?:\/\//iu.test(videoPromptEnglish)) throw new Error(`provisional cut ${cutId} prompt fields are invalid`);
		if (!Array.isArray(raw.risks) || raw.risks.length > 8) throw new Error(`provisional cut ${cutId} risks are invalid`);
		const risks = raw.risks.map((risk) => String(risk || "").normalize("NFC").trim());
		if (risks.some((risk) => risk.length > 300)) throw new Error(`provisional cut ${cutId} risk is too long`);
		const estimatedDurationSeconds = Number(raw.estimatedDurationSeconds);
		if (!(estimatedDurationSeconds > 0) || estimatedDurationSeconds > 30) throw new Error(`provisional cut ${cutId} advisory duration is invalid`);
		cursor = end;
		return { cutId, sentenceRefs, narrationText, semanticClass, cameraActionKorean, videoPromptEnglish, risks, estimatedDurationSeconds };
	});
	if (cursor !== narration.length) throw new Error("provisional cut plan must cover the complete narration");
	return { schema: LEGACY_PROVISIONAL_NARRATION_SCHEMA, narration, sentences, provisionalCutPlan: { schema: PROVISIONAL_CUT_PLAN_SCHEMA, status: String(planInput.status), narrationSha256: String(planInput.narrationSha256), cuts }, evidenceLineage: { schema: expectedLineageSchema, packageSha256: lineage.packageSha256, eventDossierSha256: lineage.eventDossierSha256, legalReportSha256: lineage.legalReportSha256, caseBriefSha256: lineage.caseBriefSha256, usedClaimRefs: [...usedClaimRefs] } };
}

function cleanV16NarrationTiming(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("critic timing이 필요합니다.");
	const estimate = value as JsonRecord;
	const compactCharacters = Number(estimate.compactCharacters);
	const observedCompactKoreanCharactersPerSecond = Number(estimate.observedCompactKoreanCharactersPerSecond);
	const estimatedSeconds = Number(estimate.estimatedSeconds);
	const targetMinimumSeconds = Number(estimate.targetMinimumSeconds);
	const targetMaximumSeconds = Number(estimate.targetMaximumSeconds);
	const withinAdvisoryTarget = estimatedSeconds >= targetMinimumSeconds && estimatedSeconds <= targetMaximumSeconds;
	if (estimate.schema !== "newsroom-owner-rate-advisory-estimate-v1" || !Number.isInteger(compactCharacters) || compactCharacters < 0 || !(observedCompactKoreanCharactersPerSecond > 0) || !(estimatedSeconds >= 0) || targetMinimumSeconds !== 65 || targetMaximumSeconds !== 80 || estimate.withinAdvisoryTarget !== withinAdvisoryTarget || estimate.authority !== "advisory-only-owner-narration-locked-timing-remains-required") throw new Error("critic timing이 올바르지 않습니다.");
	return { schema: estimate.schema, compactCharacters, observedCompactKoreanCharactersPerSecond, estimatedSeconds, targetMinimumSeconds, targetMaximumSeconds, withinAdvisoryTarget, authority: estimate.authority };
}

// Read-only compatibility helpers for the v15 validators retained below. Active writes use v16.
function cleanStage03V15NarrationAuthority(value: unknown, expectedPackage: JsonRecord): any {
	return cleanStage03V16NarrationAuthority(value, expectedPackage);
}

function cleanNarrationTiming(value: unknown): any {
	if (!isRecord(value)) throw new Error("legacy critic timing이 필요합니다.");
	return { initial: cleanV16NarrationTiming(value.initial), final: cleanV16NarrationTiming(value.final) };
}

function cleanStage03V15CritiqueDiagnostics(record: JsonRecord, expectedPackage: JsonRecord, authority?: ReturnType<typeof cleanStage03V15NarrationAuthority>) {
	const knownClaimIds = draftPackageClaimIds(expectedPackage);
	const refs = (value: unknown, label: string, minimum = 0, maximum = 32) => {
		if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label} claimRefs가 올바르지 않습니다.`);
		const normalized = value.map((item) => String(item || "").trim());
		if (new Set(normalized).size !== normalized.length || normalized.some((item) => !item || !knownClaimIds.has(item))) throw new Error(`${label}에 현재 사건이 아닌 claim이 있습니다.`);
		return normalized;
	};
	const narrativeArchitecture = String(record.narrativeArchitecture || "");
	if (!(NARRATIVE_ARCHITECTURES as readonly string[]).includes(narrativeArchitecture)) throw new Error("critic narrativeArchitecture가 올바르지 않습니다.");
	if (!isRecord(record.hookAudit)) throw new Error("critic hookAudit이 필요합니다.");
	const hook = record.hookAudit;
	const firstFiveSecondStatus = String(hook.firstFiveSecondStatus || "");
	const firstFiveSecondFunction = String(hook.firstFiveSecondFunction || "");
	if (!["pass", "reject"].includes(firstFiveSecondStatus) || !(HOOK_FUNCTIONS as readonly string[]).includes(firstFiveSecondFunction)) throw new Error("critic 첫 5초 판정이 올바르지 않습니다.");
	const strongestAvailableClaimRefs = refs(hook.strongestAvailableClaimRefs, "strongest opening", 1, 12);
	const openingClaimRefs = refs(hook.openingClaimRefs, "opening", 1, 12);
	const deferredHighSalienceClaimRefs = refs(hook.deferredHighSalienceClaimRefs, "deferred opening", 0, 12);
	if (!Array.isArray(hook.alternativeBundles) || hook.alternativeBundles.length > 3) throw new Error("critic alternativeBundles가 올바르지 않습니다.");
	const alternativeBundles = hook.alternativeBundles.map((value, index) => {
		if (!isRecord(value) || !(HOOK_FUNCTIONS as readonly string[]).includes(String(value.function || ""))) throw new Error(`critic alternative bundle ${index + 1}이 올바르지 않습니다.`);
		const rationale = String(value.rationale || "").normalize("NFC").trim();
		if (!rationale || rationale.length > 800) throw new Error(`critic alternative bundle ${index + 1} 설명이 올바르지 않습니다.`);
		return { claimRefs: refs(value.claimRefs, `alternative bundle ${index + 1}`, 1, 12), function: String(value.function), rationale };
	});
	for (const key of ["strongerVerifiedOpeningAvailable", "resolutionLeak", "resolutionLeakJustified", "deferralCreatesQuestionAndPayoff", "editorialIntentSatisfied"]) if (typeof hook[key] !== "boolean") throw new Error(`critic hookAudit ${key}가 boolean이 아닙니다.`);
	const rationale = String(hook.rationale || "").normalize("NFC").trim();
	if (!rationale || rationale.length > 1_500 || !isRecord(hook.openingWindow)) throw new Error("critic hookAudit 설명 또는 openingWindow가 올바르지 않습니다.");
	const openingWindow = hook.openingWindow;
	const openingText = String(openingWindow.text || "");
	const rate = Number(((expectedPackage.generationGuidance as JsonRecord)?.speechRateEvidence as JsonRecord)?.observedCompactKoreanCharactersPerSecond || 0);
	const compactCharacterBudget = Math.floor(rate * 5);
	const expectedOpeningSeconds = Number((Number(openingWindow.compactCharacters) / rate).toFixed(3));
	if (openingWindow.schema !== "newsroom-owner-rate-opening-window-v1" || Number(openingWindow.targetSeconds) !== 5 || Number(openingWindow.compactCharacterBudget) !== compactCharacterBudget || Number(openingWindow.compactCharacters) !== [...openingText.replace(/\s/gu, "")].length || Number(openingWindow.estimatedSeconds) !== expectedOpeningSeconds || openingWindow.textSha256 !== createHash("sha256").update(openingText).digest("hex") || openingWindow.authority !== "deterministic-owner-rate-prefix-critic-semantic-review-required") throw new Error("critic exact 5초 openingWindow가 올바르지 않습니다.");
	if (authority) {
		let count = 0; let end = 0; const chars = [...authority.narration];
		for (const [index, character] of chars.entries()) { if (!/\s/u.test(character)) count += 1; end = index + 1; if (count >= compactCharacterBudget) break; }
		if (openingText !== chars.slice(0, end).join("").trimEnd()) throw new Error("critic openingWindow가 최종 대본의 exact 5초 prefix와 일치하지 않습니다.");
	}
	const intent = isRecord(expectedPackage.generationGuidance) && isRecord(expectedPackage.generationGuidance.editorialIntent) ? expectedPackage.generationGuidance.editorialIntent : null;
	const priorityClaimRefs = intent && Array.isArray(intent.priorityClaimRefs) ? intent.priorityClaimRefs.map(String) : [];
	if (intent?.openingDisclosure === "opening" && priorityClaimRefs.some((claimRef) => !openingClaimRefs.includes(claimRef))) throw new Error("critic opening이 hash-bound 편집 의도의 우선 claim을 포함하지 않습니다.");
	if (!isRecord(record.retentionAudit)) throw new Error("critic retentionAudit이 필요합니다.");
	const retention = record.retentionAudit;
	for (const key of ["ledgerLike", "portableCoda", "coldOpenReconstructionAddsInformation"]) if (typeof retention[key] !== "boolean") throw new Error(`critic retentionAudit ${key}가 boolean이 아닙니다.`);
	if (!Array.isArray(retention.informationDeltas) || retention.informationDeltas.length < 1 || retention.informationDeltas.length > 16) throw new Error("critic retention informationDeltas가 올바르지 않습니다.");
	const informationDeltas = retention.informationDeltas.map((value, index) => {
		if (!isRecord(value) || !(RETENTION_DELTA_FUNCTIONS as readonly string[]).includes(String(value.function || ""))) throw new Error(`retention delta ${index + 1}이 올바르지 않습니다.`);
		const deltaRationale = String(value.rationale || "").normalize("NFC").trim();
		if (!deltaRationale || deltaRationale.length > 800) throw new Error(`retention delta ${index + 1} 설명이 올바르지 않습니다.`);
		return { function: String(value.function), claimRefs: refs(value.claimRefs, `retention delta ${index + 1}`, 1, 32), rationale: deltaRationale };
	});
	const retentionRationale = String(retention.rationale || "").normalize("NFC").trim();
	if (!retentionRationale || retentionRationale.length > 1_500) throw new Error("critic retention 설명이 올바르지 않습니다.");
	return {
		narrativeArchitecture,
		hookAudit: { firstFiveSecondStatus, firstFiveSecondFunction, strongestAvailableClaimRefs, openingClaimRefs, alternativeBundles, strongerVerifiedOpeningAvailable: hook.strongerVerifiedOpeningAvailable, resolutionLeak: hook.resolutionLeak, resolutionLeakJustified: hook.resolutionLeakJustified, deferredHighSalienceClaimRefs, deferralCreatesQuestionAndPayoff: hook.deferralCreatesQuestionAndPayoff, editorialIntentSatisfied: hook.editorialIntentSatisfied, rationale, openingWindow: { schema: openingWindow.schema, targetSeconds: 5, compactCharacterBudget, compactCharacters: Number(openingWindow.compactCharacters), estimatedSeconds: Number(openingWindow.estimatedSeconds), text: openingText, textSha256: openingWindow.textSha256, authority: openingWindow.authority } },
		retentionAudit: { ledgerLike: retention.ledgerLike, portableCoda: retention.portableCoda, coldOpenReconstructionAddsInformation: retention.coldOpenReconstructionAddsInformation, informationDeltas, rationale: retentionRationale },
	};
}

function cleanStage03V15Critique(value: unknown, authority: ReturnType<typeof cleanStage03V15NarrationAuthority>, expectedPackage: JsonRecord) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("독립 대본 비평 이력이 필요합니다.");
	const record = value as JsonRecord;
	if (record.schema !== AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA || record.decision !== "accept" || !Array.isArray(record.rejectionReasons) || record.rejectionReasons.length || !Array.isArray(record.findings) || record.findings.length !== CRITIQUE_CATEGORIES.length) throw new Error("독립 critic의 accept 결정과 9개 의미 검토가 필요합니다.");
	const seen = new Set<string>();
	const findings = record.findings.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`critic finding ${index + 1}이 올바르지 않습니다.`);
		const finding = value as JsonRecord;
		const category = String(finding.category || "");
		const initialStatus = String(finding.initialStatus || "");
		const finalStatus = String(finding.finalStatus || "");
		const targetAuthority = String(finding.targetAuthority || "");
		const detail = String(finding.detail || "").normalize("NFC").trim();
		const exactQuote = normalizeNarrationWhitespace(finding.exactQuote);
		if (!(CRITIQUE_CATEGORIES as readonly string[]).includes(category) || seen.has(category) || !["pass", "revise"].includes(initialStatus) || finalStatus !== "pass" || !["global", "initial", "final"].includes(targetAuthority) || !detail || detail.length > 1_200 || exactQuote.length > 500) throw new Error(`critic finding ${index + 1}이 중복되었거나 올바르지 않습니다.`);
		seen.add(category);
		if (targetAuthority === "global" && exactQuote) throw new Error(`critic finding ${index + 1}의 전역 검토는 인용문을 가질 수 없습니다.`);
		if (targetAuthority === "final" && exactQuote && !authority.narration.includes(exactQuote)) throw new Error(`critic finding ${index + 1}의 최종본 인용문이 대본에 없습니다.`);
		return { category, initialStatus, finalStatus: "pass", targetAuthority, detail, exactQuote };
	});
	const needsRevision = findings.some((finding) => finding.initialStatus === "revise");
	if (record.initialVerdict !== (needsRevision ? "revise" : "pass") || (record.revisionApplied === true) !== needsRevision) throw new Error("critic verdict와 revision 상태가 findings와 일치하지 않습니다.");
	const revisionSummary = String(record.revisionSummary || "").normalize("NFC").trim();
	if (Boolean(revisionSummary) !== needsRevision || revisionSummary.length > 2_000) throw new Error("critic revision summary가 올바르지 않습니다.");
	for (const key of ["initialAuthoritySha256", "finalAuthoritySha256"]) if (!/^[a-f0-9]{64}$/u.test(String(record[key] || ""))) throw new Error(`critic ${key}가 올바르지 않습니다.`);
	if (record.finalAuthoritySha256 !== hashJson(authority)) throw new Error("critic final authority hash가 저장 대본과 일치하지 않습니다.");
	const timing = cleanNarrationTiming(record.timing);
	if (!timing.final.withinAdvisoryTarget || timing.final.estimatedSeconds < 65 || timing.final.estimatedSeconds > 80) throw new Error("채택 대본의 예상 길이는 65.0~80.0초여야 합니다.");
	const diagnostics = cleanStage03V15CritiqueDiagnostics(record, expectedPackage, authority);
	if (diagnostics.hookAudit.firstFiveSecondStatus !== "pass" || diagnostics.hookAudit.strongerVerifiedOpeningAvailable || !diagnostics.hookAudit.editorialIntentSatisfied || (diagnostics.hookAudit.resolutionLeak && (authority.modality === "action-scene" || !diagnostics.hookAudit.resolutionLeakJustified)) || (diagnostics.hookAudit.deferredHighSalienceClaimRefs.length && !diagnostics.hookAudit.deferralCreatesQuestionAndPayoff) || diagnostics.retentionAudit.ledgerLike || diagnostics.retentionAudit.portableCoda || (diagnostics.narrativeArchitecture === "cold-open-reconstruction" && !diagnostics.retentionAudit.coldOpenReconstructionAddsInformation)) throw new Error("채택 critic의 comparative hook/retention 판정이 통과 상태가 아닙니다.");
	return { schema: AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, decision: "accept", rejectionReasons: [], initialVerdict: record.initialVerdict, findings, revisionApplied: needsRevision, revisionSummary, ...diagnostics, initialAuthoritySha256: record.initialAuthoritySha256, finalAuthoritySha256: record.finalAuthoritySha256, timing };
}

function cleanStage03V15Generation(value: unknown, expectedPackage: JsonRecord, authority: ReturnType<typeof cleanStage03V15NarrationAuthority>) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Codex CLI 대본 생성 이력이 필요합니다.");
	const record = value as JsonRecord;
	if (record.schemaVersion !== 18 || record.provider !== "codex-cli" || record.model !== "gpt-5.6-sol" || record.reasoning !== "medium" || record.promptContractVersion !== "newsroom-autonomous-narration-prompt-v15" || record.criticPromptContractVersion !== "newsroom-independent-narration-critic-prompt-v5" || record.decision !== "accept" || Number(record.callCount) !== 2 || Number(record.generatorAttemptCount) !== 1 || Number(record.criticAttemptCount) !== 1 || Number(record.retryCount) !== 0) throw new Error("대본은 v15 generator 1회와 독립 critic 1회의 accept 계약으로 생성해야 합니다.");
	const hash = (key: string) => { const result = String(record[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`대본 생성 ${key}가 올바르지 않습니다.`); return result; };
	const binding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("Codex 대본 입력 계약이 현재 검증 자료와 일치하지 않습니다.");
	const outputSha256 = hash("outputSha256");
	const currentAuthoritySha256 = hashJson(authority);
	const timing = cleanNarrationTiming(record.timing);
	if (!timing.final.withinAdvisoryTarget || timing.final.estimatedSeconds < 65 || timing.final.estimatedSeconds > 80) throw new Error("채택 generation의 예상 길이는 65.0~80.0초여야 합니다.");
	return { schemaVersion: 18, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: "newsroom-autonomous-narration-prompt-v15", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v5", generatorPromptSha256: hash("generatorPromptSha256"), criticPromptSha256: hash("criticPromptSha256"), packageSha256, initialOutputSha256: hash("initialOutputSha256"), critiqueOutputSha256: hash("critiqueOutputSha256"), outputSha256, currentAuthoritySha256, userEdited: currentAuthoritySha256 !== outputSha256, cliVersion: String(record.cliVersion || "").slice(0, 120), callCount: 2, generatorAttemptCount: 1, criticAttemptCount: 1, retryCount: 0, decision: "accept", revisionApplied: record.revisionApplied === true, timing, generatedAt: String(record.generatedAt || "").slice(0, 40) };
}

function cleanStage03V15RejectedGeneration(value: unknown, expectedPackage: JsonRecord) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("거절된 Codex CLI 생성 이력이 필요합니다.");
	const record = value as JsonRecord;
	if (record.schemaVersion !== 18 || record.provider !== "codex-cli" || record.model !== "gpt-5.6-sol" || record.reasoning !== "medium" || record.promptContractVersion !== "newsroom-autonomous-narration-prompt-v15" || record.criticPromptContractVersion !== "newsroom-independent-narration-critic-prompt-v5" || record.decision !== "reject" || Number(record.callCount) !== 2 || Number(record.generatorAttemptCount) !== 1 || Number(record.criticAttemptCount) !== 1 || Number(record.retryCount) !== 0) throw new Error("거절 감사 기록은 v15의 2회 호출·무재시도 계약이어야 합니다.");
	const hash = (key: string) => { const result = String(record[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`거절 생성 ${key}가 올바르지 않습니다.`); return result; };
	const binding = expectedPackage.policyBinding && typeof expectedPackage.policyBinding === "object" && !Array.isArray(expectedPackage.policyBinding) ? expectedPackage.policyBinding as JsonRecord : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("거절 감사 입력이 현재 research/legal package와 일치하지 않습니다.");
	return { schemaVersion: 18, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: "newsroom-autonomous-narration-prompt-v15", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v5", generatorPromptSha256: hash("generatorPromptSha256"), criticPromptSha256: hash("criticPromptSha256"), packageSha256, initialOutputSha256: hash("initialOutputSha256"), critiqueOutputSha256: hash("critiqueOutputSha256"), outputSha256: hash("outputSha256"), cliVersion: String(record.cliVersion || "").slice(0, 120), callCount: 2, generatorAttemptCount: 1, criticAttemptCount: 1, retryCount: 0, decision: "reject", revisionApplied: record.revisionApplied === true, timing: cleanNarrationTiming(record.timing), generatedAt: String(record.generatedAt || "").slice(0, 40) };
}

function cleanStage03V15RejectedCritique(value: unknown, generation: ReturnType<typeof cleanStage03V15RejectedGeneration>, expectedPackage: JsonRecord) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("거절된 독립 critic 기록이 필요합니다.");
	const record = value as JsonRecord;
	if (record.schema !== AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA || record.decision !== "reject" || !Array.isArray(record.rejectionReasons) || !record.rejectionReasons.length || record.rejectionReasons.length > 12 || !Array.isArray(record.findings) || record.findings.length !== CRITIQUE_CATEGORIES.length) throw new Error("거절 critic에는 결정, 이유와 9개 검토가 필요합니다.");
	const reasonCodes = new Set<string>();
	const rejectionReasons = record.rejectionReasons.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`거절 이유 ${index + 1}이 올바르지 않습니다.`);
		const reason = value as JsonRecord;
		const code = String(reason.code || "");
		const detail = String(reason.detail || "").normalize("NFC").trim();
		if (!(ADMISSION_REJECTION_REASONS as readonly string[]).includes(code) || reasonCodes.has(code) || !detail || detail.length > 800) throw new Error(`거절 이유 ${index + 1}이 중복되었거나 올바르지 않습니다.`);
		reasonCodes.add(code);
		return { code, detail };
	});
	const seen = new Set<string>();
	const findings = record.findings.map((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`거절 critic finding ${index + 1}이 올바르지 않습니다.`);
		const finding = value as JsonRecord;
		const category = String(finding.category || "");
		const initialStatus = String(finding.initialStatus || "");
		const finalStatus = String(finding.finalStatus || "");
		const targetAuthority = String(finding.targetAuthority || "");
		const detail = String(finding.detail || "").normalize("NFC").trim();
		const exactQuote = normalizeNarrationWhitespace(finding.exactQuote);
		if (!(CRITIQUE_CATEGORIES as readonly string[]).includes(category) || seen.has(category) || !["pass", "revise"].includes(initialStatus) || !["pass", "reject"].includes(finalStatus) || !["global", "initial", "final"].includes(targetAuthority) || !detail || detail.length > 1_200 || exactQuote.length > 500 || (targetAuthority === "global" && exactQuote)) throw new Error(`거절 critic finding ${index + 1}이 중복되었거나 올바르지 않습니다.`);
		seen.add(category);
		return { category, initialStatus, finalStatus, targetAuthority, detail, exactQuote };
	});
	if (!findings.some((finding) => finding.finalStatus === "reject")) throw new Error("거절 critic은 하나 이상의 final reject finding이 필요합니다.");
	const needsRevision = findings.some((finding) => finding.initialStatus === "revise");
	const revisionSummary = String(record.revisionSummary || "").normalize("NFC").trim();
	if (record.initialVerdict !== (needsRevision ? "revise" : "pass") || (record.revisionApplied === true) !== needsRevision || Boolean(revisionSummary) !== needsRevision || revisionSummary.length > 2_000) throw new Error("거절 critic의 verdict/revision 기록이 올바르지 않습니다.");
	for (const key of ["initialAuthoritySha256", "finalAuthoritySha256"]) if (!/^[a-f0-9]{64}$/u.test(String(record[key] || ""))) throw new Error(`거절 critic ${key}가 올바르지 않습니다.`);
	if (record.initialAuthoritySha256 !== generation.initialOutputSha256 || record.finalAuthoritySha256 !== generation.outputSha256) throw new Error("거절 critic authority hash가 generation과 일치하지 않습니다.");
	const timing = cleanNarrationTiming(record.timing);
	if (hashJson(timing) !== hashJson(generation.timing)) throw new Error("거절 critic timing이 generation과 일치하지 않습니다.");
	if (timing.final.estimatedSeconds < 70 && !reasonCodes.has("duration-below-minimum")) throw new Error("짧은 거절 대본은 duration-below-minimum 이유가 필요합니다.");
	if (timing.final.estimatedSeconds > 80 && !reasonCodes.has("duration-above-maximum")) throw new Error("긴 거절 대본은 duration-above-maximum 이유가 필요합니다.");
	const diagnostics = cleanStage03V15CritiqueDiagnostics(record, expectedPackage);
	return { schema: AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, decision: "reject", rejectionReasons, initialVerdict: record.initialVerdict, findings, revisionApplied: needsRevision, revisionSummary, ...diagnostics, initialAuthoritySha256: String(record.initialAuthoritySha256), finalAuthoritySha256: String(record.finalAuthoritySha256), timing };
}

function cleanStage03V16Critique(value: unknown, authoritySha256: string, timing: ReturnType<typeof cleanV16NarrationTiming>, requiredDecision: "pass" | "non-pass") {
	if (!isRecord(value) || value.schema !== AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA || !["pass", "reject"].includes(String(value.decision || "")) || !Array.isArray(value.findings) || value.findings.length !== 1) throw new Error("v23 독립 critic의 factual-legal 안전 검토가 필요합니다.");
	const decision = String(value.decision) as "pass" | "reject";
	if ((requiredDecision === "pass" && decision !== "pass") || (requiredDecision === "non-pass" && decision === "pass")) throw new Error("critic 결정이 저장 동작과 일치하지 않습니다.");
	const seen = new Set<string>();
	const findings = value.findings.map((raw, index) => {
		if (!isRecord(raw)) throw new Error(`critic finding ${index + 1}이 올바르지 않습니다.`);
		const category = String(raw.category || "");
		const status = String(raw.status || "");
		const detail = String(raw.detail || "").normalize("NFC").trim();
		const exactQuote = normalizeNarrationWhitespace(raw.exactQuote);
		if (!(CRITIQUE_CATEGORIES as readonly string[]).includes(category) || seen.has(category) || !["pass", "reject"].includes(status) || !detail || detail.length > 800 || exactQuote.length > 500) throw new Error(`critic finding ${index + 1}이 중복되었거나 올바르지 않습니다.`);
		seen.add(category);
		return { category, status, detail, exactQuote };
	});
	if (decision === "pass" && findings[0]?.status !== "pass") throw new Error("critic pass에는 factual-legal pass가 필요합니다.");
	if (String(value.authoritySha256 || "") !== authoritySha256) throw new Error("critic authority hash가 generator 대본과 일치하지 않습니다.");
	const cleanedTiming = cleanV16NarrationTiming(value.timing);
	if (hashJson(cleanedTiming) !== hashJson(timing)) throw new Error("critic timing이 generation과 일치하지 않습니다.");
	if (decision === "reject" && findings[0]?.status === "pass" && cleanedTiming.withinAdvisoryTarget) throw new Error("범위 내 안전 대본을 critic이 문체나 구성 이유로 거절할 수 없습니다.");
	if (decision === "pass" && (!cleanedTiming.withinAdvisoryTarget || cleanedTiming.estimatedSeconds < 65 || cleanedTiming.estimatedSeconds > 80)) throw new Error("채택 대본의 예상 길이는 65.0~80.0초여야 합니다.");
	return { schema: AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, decision, findings, authoritySha256, timing: cleanedTiming };
}

function cleanStage03V16Generation(value: unknown, expectedPackage: JsonRecord, authority: ReturnType<typeof cleanStage03V16NarrationAuthority>, requiredDecision: "accept" | "reject") {
	if (!isRecord(value)) throw new Error("Codex CLI v23 대본 생성 이력이 필요합니다.");
	if (authority.schema !== AUTONOMOUS_NARRATION_SCHEMA) throw new Error("v23 generation은 v8 script-only authority와만 결합할 수 있습니다.");
	const criticDecision = String(value.criticDecision || "");
	if (value.schemaVersion !== 23 || value.provider !== "codex-cli" || value.model !== "gpt-5.6-sol" || value.reasoning !== "medium" || value.promptContractVersion !== ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION || value.criticPromptContractVersion !== "newsroom-independent-narration-critic-prompt-v13" || Object.hasOwn(value, "curatedCorpusSha256") || value.decision !== requiredDecision || (requiredDecision === "accept" ? criticDecision !== "pass" : criticDecision !== "reject") || value.revisionApplied !== false || Number(value.callCount) !== 2 || Number(value.generatorAttemptCount) !== 1 || Number(value.criticAttemptCount) !== 1 || Number(value.retryCount) !== 0) throw new Error("대본은 v27 generator 1회와 factual-legal critic 1회의 무재시도 계약으로 생성해야 합니다.");
	const hash = (key: string) => { const result = String(value[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`대본 생성 ${key}가 올바르지 않습니다.`); return result; };
	const binding = isRecord(expectedPackage.policyBinding) ? expectedPackage.policyBinding : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("Codex 대본 입력 계약이 현재 검증 자료와 일치하지 않습니다.");
	const authoritySha256 = hashJson(authority);
	const initialOutputSha256 = hash("initialOutputSha256");
	const outputSha256 = hash("outputSha256");
	if (initialOutputSha256 !== authoritySha256 || outputSha256 !== authoritySha256) throw new Error("v23 critic은 generator 대본을 수정하거나 대체할 수 없습니다.");
	const timing = cleanV16NarrationTiming(value.timing);
	if (requiredDecision === "accept" && (!timing.withinAdvisoryTarget || timing.estimatedSeconds < 65 || timing.estimatedSeconds > 80)) throw new Error("채택 generation의 예상 길이는 65.0~80.0초여야 합니다.");
	return { schemaVersion: 23, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION, criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v13", generatorPromptSha256: hash("generatorPromptSha256"), criticPromptSha256: hash("criticPromptSha256"), packageSha256, initialOutputSha256, critiqueOutputSha256: hash("critiqueOutputSha256"), outputSha256, currentAuthoritySha256: authoritySha256, userEdited: false, cliVersion: String(value.cliVersion || "").slice(0, 120), callCount: 2, generatorAttemptCount: 1, criticAttemptCount: 1, retryCount: 0, decision: requiredDecision, criticDecision, revisionApplied: false, timing, generatedAt: String(value.generatedAt || "").slice(0, 40) };
}

function cleanStage03V16RejectedGeneration(value: unknown, expectedPackage: JsonRecord) {
	if (!isRecord(value)) throw new Error("거절된 Codex CLI v23 생성 이력이 필요합니다.");
	if (value.schemaVersion !== 23 || value.provider !== "codex-cli" || value.model !== "gpt-5.6-sol" || value.reasoning !== "medium" || value.promptContractVersion !== ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION || value.criticPromptContractVersion !== "newsroom-independent-narration-critic-prompt-v13" || Object.hasOwn(value, "curatedCorpusSha256") || value.decision !== "reject" || value.criticDecision !== "reject" || value.revisionApplied !== false || Number(value.callCount) !== 2 || Number(value.generatorAttemptCount) !== 1 || Number(value.criticAttemptCount) !== 1 || Number(value.retryCount) !== 0) throw new Error("거절 감사는 v27 generator 1회와 factual-legal critic 1회의 무재시도 계약이어야 합니다.");
	const hash = (key: string) => { const result = String(value[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`거절 생성 ${key}가 올바르지 않습니다.`); return result; };
	const binding = isRecord(expectedPackage.policyBinding) ? expectedPackage.policyBinding : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("거절 감사 입력이 현재 검증 자료와 일치하지 않습니다.");
	const initialOutputSha256 = hash("initialOutputSha256");
	const outputSha256 = hash("outputSha256");
	if (initialOutputSha256 !== outputSha256) throw new Error("v22 critic은 거절 시에도 generator 대본을 수정하거나 대체할 수 없습니다.");
	return { schemaVersion: 23, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION, criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v13", generatorPromptSha256: hash("generatorPromptSha256"), criticPromptSha256: hash("criticPromptSha256"), packageSha256, initialOutputSha256, critiqueOutputSha256: hash("critiqueOutputSha256"), outputSha256, cliVersion: String(value.cliVersion || "").slice(0, 120), callCount: 2, generatorAttemptCount: 1, criticAttemptCount: 1, retryCount: 0, decision: "reject", criticDecision: "reject", revisionApplied: false, timing: cleanV16NarrationTiming(value.timing), generatedAt: String(value.generatedAt || "").slice(0, 40) };
}

function cleanStorySynopsis(value: unknown, authority: ReturnType<typeof cleanStage03V16NarrationAuthority>) {
	if (!isRecord(value) || value.schema !== "newsroom-story-script-v1") throw new Error("generator가 대본과 함께 만든 영화 줄거리형 storyText가 필요합니다.");
	const scriptSha256 = hashJson(authority);
	const narrationSha256 = createHash("sha256").update(authority.narration as string).digest("hex");
	const storyText = String(value.storyText || "").normalize("NFC").replace(/\r\n/gu, "\n").trim();
	const paragraphs = storyText.split(/\n\s*\n/gu).map((item) => item.replace(/\s+/gu, " ").trim()).filter(Boolean);
	if (value.scriptSha256 !== scriptSha256 || value.narrationSha256 !== narrationSha256 || storyText.length < 120 || storyText.length > 8_000 || paragraphs.length < 2 || paragraphs.length > 6 || !/(?:[가-힣]|[A-Za-z])/u.test(storyText) || paragraphs.some((paragraph) => /^(?:\[|#|(?:SCENE|SHOT|장면|컷)\b|\d+[.)])/iu.test(paragraph)) || /(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/])/iu.test(storyText)) throw new Error("스토리 스크립트는 현재 내레이션에 결합된 2~6개 한국어 또는 영어 줄거리 문단이어야 합니다.");
	const normalizedText = paragraphs.join("\n\n");
	const plainText = normalizedText.replace(/\(\s*영상용\s+(?:가명|합성\s*인물)\s*\)/gu, "");
	if (value.plainText !== undefined && value.plainText !== normalizedText && value.plainText !== plainText) throw new Error("스토리 복사용 텍스트가 generator 원문에서 허용된 제작 라벨만 제거한 표시본과 일치하지 않습니다.");
	return { schema: "newsroom-story-script-v1", scriptSha256, narrationSha256, storyText: normalizedText, plainText };
}

function cleanStage03V19Generation(value: unknown, expectedPackage: JsonRecord, authority: ReturnType<typeof cleanStage03V16NarrationAuthority>, storyScript: ReturnType<typeof cleanStorySynopsis>, requiredDecision: "accept" | "reject") {
	if (!isRecord(value)) throw new Error("Codex CLI v26 대본·storyText 생성 이력이 필요합니다.");
	const criticDecision = String(value.criticDecision || "");
	if (value.schemaVersion !== 26 || value.provider !== "codex-cli" || value.model !== "gpt-5.6-sol" || value.reasoning !== "medium" || value.promptContractVersion !== ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION || value.criticPromptContractVersion !== ACTIVE_AUTONOMOUS_CRITIC_PROMPT_VERSION || value.decision !== requiredDecision || (requiredDecision === "accept" ? criticDecision !== "pass" : criticDecision !== "reject") || value.revisionApplied !== false || Number(value.callCount) !== 2 || Number(value.generatorAttemptCount) !== 1 || Number(value.criticAttemptCount) !== 1 || Number(value.retryCount) !== 0) throw new Error("대본과 storyText를 반환하는 generator 1회와 factual/legal critic 1회의 무재시도 계약이 필요합니다.");
	const hash = (key: string) => { const result = String(value[key] || ""); if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`생성 ${key}가 올바르지 않습니다.`); return result; };
	const binding = isRecord(expectedPackage.policyBinding) ? expectedPackage.policyBinding : {};
	const packageSha256 = hash("packageSha256");
	if (packageSha256 !== binding.packageSha256) throw new Error("Codex 입력 계약이 현재 검증 자료와 일치하지 않습니다.");
	const storyCore = { schema: storyScript.schema, scriptSha256: storyScript.scriptSha256, narrationSha256: storyScript.narrationSha256, storyText: storyScript.storyText };
	const outputSha256 = hashJson(authority);
	const initialOutputSha256 = hashJson({ authority, storyScript: storyCore });
	if (hash("outputSha256") !== outputSha256 || hash("initialOutputSha256") !== initialOutputSha256 || hash("storyScriptSha256") !== hashJson(storyCore)) throw new Error("같은 generator 응답의 대본·storyText hash가 생성 이력과 일치하지 않습니다.");
	const timing = cleanV16NarrationTiming(value.timing);
	if (requiredDecision === "accept" && (!timing.withinAdvisoryTarget || timing.estimatedSeconds < 65 || timing.estimatedSeconds > 80)) throw new Error("채택 generation의 내레이션 예상 길이는 65.0~80.0초여야 합니다.");
	return { schemaVersion: 26, provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "medium", promptContractVersion: ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION, criticPromptContractVersion: ACTIVE_AUTONOMOUS_CRITIC_PROMPT_VERSION, generatorPromptSha256: hash("generatorPromptSha256"), criticPromptSha256: hash("criticPromptSha256"), packageSha256, initialOutputSha256, critiqueOutputSha256: hash("critiqueOutputSha256"), storyScriptSha256: hash("storyScriptSha256"), outputSha256, currentAuthoritySha256: outputSha256, userEdited: false, cliVersion: String(value.cliVersion || "").slice(0, 120), callCount: 2, generatorAttemptCount: 1, criticAttemptCount: 1, retryCount: 0, decision: requiredDecision, criticDecision, revisionApplied: false, timing, generatedAt: String(value.generatedAt || "").slice(0, 40) };
}

function cleanRejectionReasons(value: unknown, timing: ReturnType<typeof cleanV16NarrationTiming>) {
	if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error("거절 이유가 필요합니다.");
	const seen = new Set<string>();
	const reasons = value.map((raw, index) => {
		if (!isRecord(raw)) throw new Error(`거절 이유 ${index + 1}이 올바르지 않습니다.`);
		const code = String(raw.code || "");
		const detail = String(raw.detail || "").normalize("NFC").trim();
		if (!(ADMISSION_REJECTION_REASONS as readonly string[]).includes(code) || seen.has(code) || !detail || detail.length > 800) throw new Error(`거절 이유 ${index + 1}이 중복되었거나 올바르지 않습니다.`);
		seen.add(code);
		return { code, detail };
	});
	if (timing.estimatedSeconds < 65 && !seen.has("duration-below-minimum")) throw new Error("짧은 거절 대본은 duration-below-minimum 이유가 필요합니다.");
	if (timing.estimatedSeconds > 80 && !seen.has("duration-above-maximum")) throw new Error("긴 거절 대본은 duration-above-maximum 이유가 필요합니다.");
	return reasons;
}

export async function GET(_request: Request, context: Context) {
	try {
		const { slug } = await context.params;
		return NextResponse.json(await load(assertSlug(slug)), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: sanitizePublicError(error) || "프로젝트를 불러오지 못했습니다." }, { status: 404 });
	}
}

export async function PATCH(request: Request, context: Context) {
	let mutationLock: ProjectMutationLock | null = null;
	try {
		const { slug } = await context.params;
		mutationLock = await acquireProjectMutationLock({ workflowFile: workflowPath(assertSlug(slug)) });
		const current = await load(assertSlug(slug));
		const body = await request.json() as JsonRecord;
		const action = String(body.action || "");
		const stages = { ...((current.stages || {}) as JsonRecord) };
		const now = new Date().toISOString();
		let next: JsonRecord = { ...current, updatedAt: now };
		let productionLaunchJobId: string | null = null;
		let productionResearchSha256: string | null = null;
		await requirePrerequisite(current, action, slug);

		if (action === "save-video-references") {
			const referenceCatalog = cleanVideoReferences(body.referenceCatalog);
			const sceneRecipes = cleanSceneRecipes(body.sceneRecipes);
			next = { ...next, videoReferences: { referenceCatalog, sceneRecipes, summary: { referenceCount: referenceCatalog.length, requiredCount: referenceCatalog.filter((entry) => entry.required).length, assetCount: referenceCatalog.filter((entry) => entry.assetId).length, recipeCount: sceneRecipes.length }, updatedAt: now } };
		} else if (action === "save-agent-video-design") {
			const storyline = body.storyline && typeof body.storyline === "object" && !Array.isArray(body.storyline) ? body.storyline as JsonRecord : null;
			const semanticCutPlan = body.semanticCutPlan && typeof body.semanticCutPlan === "object" && !Array.isArray(body.semanticCutPlan) ? body.semanticCutPlan as JsonRecord : null;
			const storyboardAdmission = body.storyboardAdmission && typeof body.storyboardAdmission === "object" && !Array.isArray(body.storyboardAdmission) ? body.storyboardAdmission as JsonRecord : null;
			const plan = body.agentVideoDesignPlan && typeof body.agentVideoDesignPlan === "object" && !Array.isArray(body.agentVideoDesignPlan) ? body.agentVideoDesignPlan as JsonRecord : null;
			const commonMasterAssets = cleanCommonMasterAssets(body.commonMasterAssets);
			if (storyline?.schema !== "newsroom-storyline-v2" || semanticCutPlan?.schema !== "newsroom-semantic-cut-plan-v2" || storyboardAdmission?.schema !== "newsroom-color-storyboard-admission-v2" || !plan || plan.schema !== "agent-authored-video-design-plan-v6-board-admitted" || !Array.isArray(plan.cuts) || plan.cuts.length < 1) throw new Error("Hash-bound storyline, sealed semantic cut plan, storyboard admission, and matching primary-agent design are required");
			next = { ...next, videoDesignAuthorship: { schema: "primary-agent-video-design-draft-v2-two-stage", workflowVersion: "newsroom-primary-agent-video-design-v8-two-stage-color-storyboard-authority", storyline, semanticCutPlan, storyboardAdmission, commonMasterAssets, plan, updatedAt: now } };
		} else if (action === "generate-legal") {
			const candidate = next.candidate && typeof next.candidate === "object" && !Array.isArray(next.candidate) ? next.candidate as JsonRecord : null;
			if (!candidate) throw new Error("워크플로 후보가 없습니다.");
			const snapshot = await readResearchSnapshot(slug);
			assertSnapshotMatchesCandidate({ snapshot, candidate, slug });
			const report = buildLegalContextReport({ slug, candidate, researchSnapshot: snapshot, generatedAt: now });
			stages["02"] = { status: "ready", completedAt: now, reportGeneratedAt: now, evidenceSha256: hashJson(snapshot) };
			const legalReady = report.videoDecision.decision !== "block" && report.reviewCompletion.allComplete === true;
			stages["03"] = { status: legalReady ? "in-progress" : "blocked", ...(!legalReady ? { reason: "legal-review-incomplete" } : {}) };
			for (const number of ["04", "05", "06", "07", "08"]) stages[number] = { status: "pending" };
			next = { ...next, stages, legalContextReport: report, draft: undefined, draftFinalized: false, draftLegalCompliance: undefined, flowStoryScript: undefined, sceneBatch: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
		} else if (action === "prepare-flow-story-script") {
			const draft = current.draft && typeof current.draft === "object" && !Array.isArray(current.draft) ? current.draft as JsonRecord : null;
			const authority = draft?.authority && typeof draft.authority === "object" && !Array.isArray(draft.authority) ? draft.authority as JsonRecord : null;
			const draftGeneration = draft?.generation && typeof draft.generation === "object" && !Array.isArray(draft.generation) ? draft.generation as JsonRecord : null;
			const critique = draft?.critique && typeof draft.critique === "object" && !Array.isArray(draft.critique) ? draft.critique as JsonRecord : null;
			if (!authority || authority.schema !== AUTONOMOUS_NARRATION_SCHEMA || typeof authority.narration !== "string" || !Array.isArray(authority.sentences)) throw new Error("검토를 통과한 v8 대본이 필요합니다.");
			const scriptSha256 = hashJson(authority);
			const narrationSha256 = createHash("sha256").update(authority.narration).digest("hex");
			if (draftGeneration?.outputSha256 !== scriptSha256 || draftGeneration.currentAuthoritySha256 !== scriptSha256 || draftGeneration.criticDecision !== "pass" || critique?.decision !== "pass") throw new Error("현재 대본의 생성·독립 사실 검토 결합이 유효하지 않습니다.");
			const sourceWorkflowSha256 = hashJson(current);
			const generated = await runFlowStoryScriptCli({ authority, binding: { schema: "newsroom-reviewed-script-flow-story-input-v1", reviewRequested: true, scriptSha256, narrationSha256 } });
			const latestWorkflow = JSON.parse(await readFile(workflowPath(slug), "utf8")) as JsonRecord;
			if (hashJson(latestWorkflow) !== sourceWorkflowSha256) throw new Error("스토리 스크립트 생성 중 프로젝트 권위가 변경되어 결과를 저장하지 않았습니다.");
			const storyScript = generated.storyScript && typeof generated.storyScript === "object" && !Array.isArray(generated.storyScript) ? generated.storyScript as JsonRecord : null;
			const review = generated.review && typeof generated.review === "object" && !Array.isArray(generated.review) ? generated.review as JsonRecord : null;
			const generation = generated.generation && typeof generated.generation === "object" && !Array.isArray(generated.generation) ? generated.generation as JsonRecord : null;
			const storyCore = storyScript ? { schema: storyScript.schema, scriptSha256: storyScript.scriptSha256, narrationSha256: storyScript.narrationSha256, units: storyScript.units } : null;
			if (!storyScript || storyScript.schema !== "newsroom-flow-story-script-v1" || storyScript.scriptSha256 !== scriptSha256 || storyScript.narrationSha256 !== narrationSha256 || !Array.isArray(storyScript.units) || typeof storyScript.plainText !== "string" || !storyScript.plainText.trim() || review?.schema !== "newsroom-flow-story-script-review-v1" || review.decision !== "pass" || review.narrationFaithfulness !== "pass" || review.sequenceContinuity !== "pass" || generation?.schema !== "newsroom-flow-story-script-generation-v1" || generation.outputSha256 !== hashJson(storyCore) || generation.reviewSha256 !== hashJson(review)) throw new Error("스토리 스크립트가 현재 대본 또는 독립 검토 결과와 일치하지 않습니다.");
			next = { ...next, flowStoryScript: { ...storyScript, status: current.draftFinalized === true ? "final-script-planning-only" : "draft-preview", review, generation, source: { draftFinalized: current.draftFinalized === true, generationOutputSha256: String(draftGeneration.outputSha256), packageSha256: String(draftGeneration.packageSha256 || ""), critiqueOutputSha256: String(draftGeneration.critiqueOutputSha256 || "") }, providerExecution: false, finalCutAuthority: false, createdAt: now }, sceneBatch: undefined };
		} else if (action === "prepare-scene-batch") {
			if (current.draftFinalized !== true) throw new Error("확정된 대본 뒤에만 장면 배치를 준비할 수 있습니다.");
			const approval = current.productionApproval && typeof current.productionApproval === "object" && !Array.isArray(current.productionApproval) ? current.productionApproval as JsonRecord : null;
			const ownerVoice = approval?.ownerVoiceAuthority && typeof approval.ownerVoiceAuthority === "object" && !Array.isArray(approval.ownerVoiceAuthority) ? approval.ownerVoiceAuthority as JsonRecord : null;
			if (ownerVoice?.approved !== true || ownerVoice.profileId !== "owner-voice-v1" || !/^[a-f0-9]{64}$/u.test(String(ownerVoice.profileSha256 || ""))) throw new Error("승인된 owner voice profile이 필요합니다.");
			const draft = current.draft && typeof current.draft === "object" && !Array.isArray(current.draft) ? current.draft as JsonRecord : null;
			const authority = draft?.authority && typeof draft.authority === "object" && !Array.isArray(draft.authority) ? draft.authority as JsonRecord : null;
			if (!authority || authority.schema !== AUTONOMOUS_NARRATION_SCHEMA || typeof authority.narration !== "string" || !Array.isArray(authority.sentences)) throw new Error("확정된 v8 대본 권위가 필요합니다.");
			const narration = authority.narration as string;
			const authoritySentences = authority.sentences as JsonRecord[];
			const scriptSha256 = hashJson(authority);
			const narrationSha256 = createHash("sha256").update(narration).digest("hex");
			const compliance = current.draftLegalCompliance && typeof current.draftLegalCompliance === "object" && !Array.isArray(current.draftLegalCompliance) ? current.draftLegalCompliance as JsonRecord : null;
			const draftGeneration = draft?.generation && typeof draft.generation === "object" && !Array.isArray(draft.generation) ? draft.generation as JsonRecord : null;
			if (compliance?.authoritySha256 !== scriptSha256 || draftGeneration?.outputSha256 !== scriptSha256) throw new Error("확정 대본의 legal compliance와 v23 generation hash가 일치하지 않습니다.");
			const storedStory = current.flowStoryScript && typeof current.flowStoryScript === "object" && !Array.isArray(current.flowStoryScript) ? current.flowStoryScript as JsonRecord : null;
			const storyCore = storedStory ? { schema: storedStory.schema, scriptSha256: storedStory.scriptSha256, narrationSha256: storedStory.narrationSha256, units: storedStory.units } : null;
			const storyGeneration = storedStory?.generation && typeof storedStory.generation === "object" && !Array.isArray(storedStory.generation) ? storedStory.generation as JsonRecord : null;
			const storyReview = storedStory?.review && typeof storedStory.review === "object" && !Array.isArray(storedStory.review) ? storedStory.review as JsonRecord : null;
			const pairedStoryValid = draftGeneration?.schemaVersion === 24 && draftGeneration.storyScriptSha256 === hashJson(storyCore) && draftGeneration.storyReviewSha256 === hashJson(storyReview);
			const separatelyGeneratedStoryValid = storyGeneration?.schema === "newsroom-flow-story-script-generation-v1" && storyGeneration.outputSha256 === hashJson(storyCore) && storyGeneration.reviewSha256 === hashJson(storyReview);
			if (!storedStory || storedStory.schema !== "newsroom-flow-story-script-v1" || storedStory.status !== "final-script-planning-only" || storedStory.scriptSha256 !== scriptSha256 || storedStory.narrationSha256 !== narrationSha256 || !Array.isArray(storedStory.units) || storyReview?.schema !== "newsroom-flow-story-script-review-v1" || storyReview.decision !== "pass" || storyReview.narrationFaithfulness !== "pass" || storyReview.sequenceContinuity !== "pass" || (!pairedStoryValid && !separatelyGeneratedStoryValid)) throw new Error("확정 대본에 결합된 현재 Flow 스토리 스크립트가 필요합니다.");
			const storyScriptSha256 = hashJson(storyCore);
			const existingBatch = current.sceneBatch && typeof current.sceneBatch === "object" && !Array.isArray(current.sceneBatch) ? current.sceneBatch as JsonRecord : null;
			const existingGeneration = existingBatch?.generation && typeof existingBatch.generation === "object" && !Array.isArray(existingBatch.generation) ? existingBatch.generation as JsonRecord : null;
			const existingCuts = Array.isArray(existingBatch?.cuts) ? existingBatch.cuts as JsonRecord[] : [];
			let existingCursor = 0;
			const existingCutsValid = existingCuts.length > 0 && existingCuts.length <= 64 && existingCuts.every((cut, index) => {
				const narrationText = String(cut.narrationText || "");
				const ordered = narrationText.length > 0 && narration.slice(existingCursor, existingCursor + narrationText.length) === narrationText;
				if (ordered) existingCursor += narrationText.length;
				return ordered && cut.cutId === `cut-${String(index + 1).padStart(3, "0")}` && Array.isArray(cut.sentenceRefs) && cut.sentenceRefs.length > 0 && cut.sentenceRefs.every((ref) => Number.isInteger(Number(ref)) && Number(ref) >= 1 && Number(ref) <= authoritySentences.length) && ["human-action", "information-motion"].includes(String(cut.semanticClass || "")) && typeof cut.cameraActionKorean === "string" && typeof cut.videoPromptEnglish === "string" && !/https?:\/\//iu.test(String(cut.videoPromptEnglish)) && Array.isArray(cut.risks) && Number(cut.estimatedDurationSeconds) >= 2 && Number(cut.estimatedDurationSeconds) <= 3;
			}) && existingCursor === narration.length && Math.abs(existingCuts.reduce((sum, cut) => sum + Number(cut.estimatedDurationSeconds), 0) - Number(existingBatch?.totalEstimatedDurationSeconds || 0)) <= 0.01;
			const existingBatchPayload = existingBatch ? { schema: existingBatch.schema, scriptSha256: existingBatch.scriptSha256, narrationSha256: existingBatch.narrationSha256, storyScriptSha256: existingBatch.storyScriptSha256, totalEstimatedDurationSeconds: existingBatch.totalEstimatedDurationSeconds, cuts: existingCuts } : null;
			if (existingBatch?.scriptSha256 === scriptSha256 && existingBatch.narrationSha256 === narrationSha256 && existingBatch.storyScriptSha256 === storyScriptSha256 && existingBatch.status === "scene-prompts-generated-awaiting-semantic-cut-seal" && existingCutsValid && existingGeneration?.outputSha256 === hashJson(existingBatchPayload)) {
				next = { ...next, sceneBatch: existingBatch };
			} else {
				const targetDurationSeconds = Number((draftGeneration?.timing as JsonRecord | undefined)?.estimatedSeconds || 0);
				const sourceWorkflowSha256 = hashJson(current);
				const generated = await runScenePromptCli({ authority, storyScript: storyCore, targetDurationSeconds, approval: { schema: "newsroom-approved-script-scene-prompt-input-v1", approved: true, scriptSha256, narrationSha256, authoritySha256: scriptSha256, storyScriptSha256 } });
				const latestWorkflow = JSON.parse(await readFile(workflowPath(slug), "utf8")) as JsonRecord;
				if (hashJson(latestWorkflow) !== sourceWorkflowSha256) throw new Error("대본 또는 스토리 스크립트가 장면 프롬프트 생성 중 변경되어 결과를 저장하지 않았습니다.");
				const batch = generated.batch && typeof generated.batch === "object" && !Array.isArray(generated.batch) ? generated.batch as JsonRecord : null;
				const generation = generated.generation && typeof generated.generation === "object" && !Array.isArray(generated.generation) ? generated.generation as JsonRecord : null;
				if (!batch || batch.schema !== "newsroom-script-scene-batch-v1" || batch.scriptSha256 !== scriptSha256 || batch.narrationSha256 !== narrationSha256 || batch.storyScriptSha256 !== storyScriptSha256 || !Array.isArray(batch.cuts) || !generation || generation.schema !== "newsroom-scene-prompt-generation-v1" || generation.outputSha256 !== hashJson(batch)) throw new Error("Scene prompt generation returned an invalid or stale script/story binding");
				const sceneBatch = { ...batch, status: "scene-prompts-generated-awaiting-semantic-cut-seal", authority: "approved-script-and-narration-hash-bound", ownerVoiceProfileSha256: String(ownerVoice.profileSha256), providerExecution: false, finalCutAuthority: false, generation, createdAt: now };
				next = { ...next, sceneBatch };
			}
		} else if (action === "record-draft-rejection") {
			if (current.draftFinalized === true) throw new Error("확정된 Stage 03 뒤에는 새 대본 시도를 기록할 수 없습니다.");
			const editorialDirection = cleanEditorialDirection(hasExplicitEditorialDirection(body) || body.editorialIntent !== undefined
				? body.editorialDirection
				: await readDefaultEditorialDirection({ root: rootDir(), slug }));
			const policyBinding = body.policyBinding && typeof body.policyBinding === "object" && !Array.isArray(body.policyBinding) ? body.policyBinding as JsonRecord : null;
			const candidate = next.candidate && typeof next.candidate === "object" && !Array.isArray(next.candidate) ? next.candidate as JsonRecord : null;
			const snapshot = await readResearchSnapshot(slug);
			const report = next.legalContextReport && typeof next.legalContextReport === "object" && !Array.isArray(next.legalContextReport) ? next.legalContextReport as JsonRecord : null;
			if (!policyBinding || !candidate || !report) throw new Error("거절 감사 기록의 legal policy가 없습니다.");
			const expectedPackage = buildDraftPolicyPackage({ candidate, researchSnapshot: snapshot, legalReport: report, editorialDirection, editorialIntent: body.editorialIntent });
			if (hashJson(policyBinding) !== hashJson(expectedPackage.policyBinding)) throw new Error("거절 감사 기록이 현재 legal policy와 일치하지 않습니다.");
			const attemptedAuthority = cleanStage03V16NarrationAuthority(body.attemptedAuthority, expectedPackage);
			const flowStoryScript = cleanStorySynopsis(body.flowStoryScript, attemptedAuthority);
			const generation = cleanStage03V19Generation(body.generation, expectedPackage, attemptedAuthority, flowStoryScript, "reject");
			const critique = cleanStage03V16Critique(body.critique, generation.outputSha256, generation.timing, generation.criticDecision === "pass" ? "pass" : "non-pass");
			if (generation.critiqueOutputSha256 !== hashJson(critique)) throw new Error("거절 critic hash가 generation과 일치하지 않습니다.");
			const envelope = body.rejection && typeof body.rejection === "object" && !Array.isArray(body.rejection) ? body.rejection as JsonRecord : null;
			const reasons = cleanRejectionReasons(envelope?.reasons, generation.timing);
			const rejectedStoryCore = { schema: flowStoryScript.schema, scriptSha256: flowStoryScript.scriptSha256, narrationSha256: flowStoryScript.narrationSha256, storyText: flowStoryScript.storyText };
			const expectedAttemptSha256 = hashJson({ authority: attemptedAuthority, storyScript: rejectedStoryCore });
			if (!envelope || envelope.schema !== AUTONOMOUS_NARRATION_REJECTION_SCHEMA || envelope.decision !== "reject" || envelope.packageSha256 !== generation.packageSha256 || envelope.generationSha256 !== hashJson(body.generation) || envelope.critiqueSha256 !== hashJson(body.critique) || envelope.attemptedAuthoritySha256 !== generation.outputSha256 || envelope.attemptedPairSha256 !== expectedAttemptSha256 || hashJson(envelope.timing) !== hashJson(generation.timing)) throw new Error("거절 응답 envelope의 hash provenance가 일치하지 않습니다.");
			const existing = Array.isArray(current.draftRejectionHistory) ? current.draftRejectionHistory as JsonRecord[] : [];
			let previousEntrySha256 = "";
			for (const [index, entry] of existing.entries()) {
				if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`기존 거절 감사 기록 ${index + 1}이 올바르지 않습니다.`);
				const { entrySha256, ...entryPayload } = entry;
				if (entryPayload.previousEntrySha256 !== previousEntrySha256 || entrySha256 !== hashJson(entryPayload)) throw new Error(`기존 거절 감사 hash chain ${index + 1}이 올바르지 않습니다.`);
				previousEntrySha256 = String(entrySha256);
			}
			if (!existing.some((entry) => (entry.generation as JsonRecord | undefined)?.initialOutputSha256 === generation.initialOutputSha256)) {
				const normalizedIntent = (expectedPackage.generationGuidance as JsonRecord).editorialIntent as JsonRecord;
				const entryPayload = { schema: AUTONOMOUS_NARRATION_REJECTION_AUDIT_SCHEMA, decision: "reject", reasons, generation, critique, attemptedAuthority, flowStoryScript, policyBinding, editorialDirection: String(normalizedIntent.direction || "") || null, editorialIntent: normalizedIntent, recordedAt: now, previousEntrySha256 };
				const entry = { ...entryPayload, entrySha256: hashJson(entryPayload) };
				next = { ...next, draftRejectionHistory: [...existing, entry] };
			}
		} else if (action === "save-draft") {
			if (current.draftFinalized === true) throw new Error("확정된 Stage 03 대본 권위는 덮어쓸 수 없습니다.");
			if (!body.authority || typeof body.authority !== "object" || Array.isArray(body.authority) || (body.authority as JsonRecord).schema !== AUTONOMOUS_NARRATION_SCHEMA) throw new Error("기존 대본은 읽기 전용입니다. 현재 generator+critic으로 명시적으로 다시 생성하세요.");
			if (body.planningMode !== undefined && body.planningMode !== "v21-narration-with-story-text") throw new Error("새 자율 대본은 대본+storyText 계획 단계에서만 저장할 수 있습니다.");
			const finalized = body.finalized === true;
			const editorialDirection = cleanEditorialDirection(hasExplicitEditorialDirection(body) || body.editorialIntent !== undefined
				? body.editorialDirection
				: await readDefaultEditorialDirection({ root: rootDir(), slug }));
			const policyBinding = body.policyBinding && typeof body.policyBinding === "object" && !Array.isArray(body.policyBinding) ? body.policyBinding as JsonRecord : null;
			const candidate = next.candidate && typeof next.candidate === "object" && !Array.isArray(next.candidate) ? next.candidate as JsonRecord : null;
			const snapshot = await readResearchSnapshot(slug);
			const report = next.legalContextReport && typeof next.legalContextReport === "object" && !Array.isArray(next.legalContextReport) ? next.legalContextReport as JsonRecord : null;
			if (!policyBinding || !candidate || !report) throw new Error("Draft legal policy is stale or mismatched; regenerate from the current legal review.");
			const expectedPackage = buildDraftPolicyPackage({ candidate, researchSnapshot: snapshot, legalReport: report, editorialDirection, editorialIntent: body.editorialIntent });
			if (hashJson(policyBinding) !== hashJson(expectedPackage.policyBinding)) throw new Error("Draft legal policy is stale or mismatched; regenerate from the current legal review.");
			const authority = cleanStage03V16NarrationAuthority(body.authority, expectedPackage);
			const flowStoryScript = cleanStorySynopsis(body.flowStoryScript, authority);
			const draftGeneration = cleanStage03V19Generation(body.generation, expectedPackage, authority, flowStoryScript, "accept");
			const critique = cleanStage03V16Critique(body.critique, draftGeneration.outputSha256, draftGeneration.timing, "pass");
			if (draftGeneration.critiqueOutputSha256 !== hashJson(critique)) throw new Error("generator와 읽기 전용 critic의 hash provenance가 일치하지 않습니다.");
			if (!String(body.generator || "").startsWith(ACTIVE_AUTONOMOUS_GENERATOR_PREFIX)) throw new Error("대본과 storyText를 함께 반환하는 generator 및 factual-legal critic 계약이 필요합니다.");
			const legalCompliance = validateDraftLegalCompliance({ sections: { narration: authority.narration }, policy: expectedPackage.legalPolicy });
			if (finalized && !legalCompliance.ok) throw new Error(`Draft legal compliance failed: ${legalCompliance.violations.join(", ")}`);
			const normalizedIntent = (expectedPackage.generationGuidance as JsonRecord).editorialIntent as JsonRecord;
			const activeDraft = { schema: "newsroom-autonomous-script-draft-v12-story-text", generator: String(body.generator), generation: draftGeneration, critique, flowStoryScript, authority, editorialDirection: String(normalizedIntent.direction || "") || null, editorialIntent: normalizedIntent, policyBinding };
			const history = appendDraftHistory({ current, incomingDraft: activeDraft, archivedAt: now, hashJson });
			const draft = { ...activeDraft, ...(history.length ? { history } : {}) };
			const pairedPlanning = { ...flowStoryScript, status: finalized ? "final-script-planning-only" : "draft-preview", source: { draftFinalized: finalized, generationOutputSha256: draftGeneration.outputSha256, packageSha256: draftGeneration.packageSha256, critiqueOutputSha256: draftGeneration.critiqueOutputSha256 }, providerExecution: false, finalCutAuthority: false, createdAt: now };
			stages["03"] = { status: finalized ? "ready" : "in-progress", ...(finalized ? { completedAt: now } : {}) };
			for (const number of ["04", "05", "06", "07", "08"]) stages[number] = { status: "pending" };
			if (finalized) stages["04"] = { status: "in-progress", reason: "awaiting-owner-narration-locked-timing" };
			if (finalized) {
				const headline = cleanApprovedHeadline(body.headline);
				const ownerVoiceAuthority = body.ownerVoiceAuthority && typeof body.ownerVoiceAuthority === "object" && !Array.isArray(body.ownerVoiceAuthority) ? body.ownerVoiceAuthority as JsonRecord : null;
				const visualAuthorityId = String(body.visualAuthorityId || "");
				if (ownerVoiceAuthority?.approved !== true || ownerVoiceAuthority.profileId !== "owner-voice-v1" || !/^[a-f0-9]{64}$/u.test(String(ownerVoiceAuthority.profileSha256 || ""))) throw new Error("Explicit approved owner-voice-v1 authority is required");
				if (visualAuthorityId !== "paper-cut-grok-storyboard-v2") throw new Error("paper-cut-grok-storyboard-v2 is the only active visual authority");
				next = { ...next, stages, draft, draftFinalized: true, draftLegalCompliance: { schema: "draft-legal-compliance-v1", ...legalCompliance, authoritySha256: hashJson(authority), policySha256: hashJson(expectedPackage.legalPolicy), validatedAt: now }, productionApproval: { headline, ownerVoiceAuthority, visualAuthorityId, approvedAt: now }, flowStoryScript: pairedPlanning, sceneBatch: undefined, videoDesignAuthorship: undefined, v9Planning: undefined, productionOrchestration: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
			} else {
				next = { ...next, stages, draft, draftFinalized: false, draftLegalCompliance: undefined, productionApproval: undefined, flowStoryScript: pairedPlanning, sceneBatch: undefined, videoDesignAuthorship: undefined, v9Planning: undefined, productionOrchestration: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
			}
			/* Legacy section/variant code is retained as a load-shape reference, but the required authority guard above makes it unreachable for writes. */
			if (body.authority === undefined) {
			const selectedDraftId = typeof body.selectedDraftId === "string" ? body.selectedDraftId : "";
			const legacyFinalized = body.finalized === true;
			const finalized = legacyFinalized;
			const v9ScriptAuthorityOnly = String(body.planningMode || "") === "v9-script-authority-only";
			const sections = cleanSections(body.sections);
			const variants = cleanDraftVariants(body.variants);
			let draftGeneration: JsonRecord | null = null;
			if (variants.length && selectedDraftId && !variants.some((item) => item.id === selectedDraftId)) throw new Error("선택한 대본 후보를 찾을 수 없습니다.");
			if (variants.length) {
				const authoritativeVariant = selectedDraftId ? variants.find((item) => item.id === selectedDraftId) : variants[0];
				if (!authoritativeVariant || hashJson(authoritativeVariant.sections) !== hashJson(sections)) throw new Error("현재 편집 대본은 selectedDraftId가 가리키는 초안과 일치해야 합니다.");
			}
			if (legacyFinalized && variants.length && !selectedDraftId) throw new Error("비교한 초안 중 하나를 선택한 뒤 대본을 확정하세요.");
			{
				const policyBinding = body.policyBinding && typeof body.policyBinding === "object" && !Array.isArray(body.policyBinding) ? body.policyBinding as JsonRecord : null;
				const candidate = next.candidate && typeof next.candidate === "object" && !Array.isArray(next.candidate) ? next.candidate as JsonRecord : null;
				const snapshot = await readResearchSnapshot(slug);
				const report = next.legalContextReport && typeof next.legalContextReport === "object" && !Array.isArray(next.legalContextReport) ? next.legalContextReport as JsonRecord : null;
				if (!policyBinding || !candidate || !report) throw new Error("Draft legal policy is stale or mismatched; regenerate from the current legal review.");
				const expectedPackage = buildDraftPolicyPackage({ candidate, researchSnapshot: snapshot, legalReport: report });
				if (hashJson(policyBinding) !== hashJson(expectedPackage.policyBinding)) throw new Error("Draft legal policy is stale or mismatched; regenerate from the current legal review.");
				const legalCompliance = validateDraftLegalCompliance({ sections, policy: expectedPackage.legalPolicy });
				if (finalized && !legalCompliance.ok) throw new Error(`Draft legal compliance failed: ${legalCompliance.violations.join(", ")}`);
				if (variants.length && !String(body.generator || "").startsWith("codex-cli:")) throw new Error("복수 초안 저장에는 검증 가능한 Codex 대본 계약이 필요합니다.");
				draftGeneration = String(body.generator || "").startsWith("codex-cli:") ? cleanDraftGeneration(body.generation, expectedPackage, variants) : null;
				if (String(body.generator || "").startsWith("codex-cli:") && !draftGeneration) throw new Error("Codex CLI 대본 생성 이력이 필요합니다.");
				if (draftGeneration && !selectedDraftId && draftGeneration.userEdited === true) throw new Error("Codex 생성 결과가 저장 전에 변경됐습니다. 원본 초안을 다시 생성하세요.");
				next = { ...next, draftLegalCompliance: finalized ? { schema: "draft-legal-compliance-v1", ...legalCompliance, sectionsSha256: hashJson(sections), policySha256: hashJson(expectedPackage.legalPolicy), validatedAt: now } : undefined };
			}
			stages["03"] = { status: finalized ? "ready" : "in-progress", ...(finalized ? { completedAt: now } : {}) };
			if (finalized) stages["04"] = { status: "in-progress" };
			const draft = { generator: String(body.generator || "editorial-workbench"), sections, policyBinding: body.policyBinding, ...(draftGeneration ? { generation: draftGeneration } : {}), ...(draftGeneration?.userEdited === true ? { editAuthority: { type: "selected-variant-human-edit", selectedDraftId, validatedAt: now, sectionsSha256: hashJson(sections) } } : {}), ...(variants.length ? { variants, selectedDraftId: selectedDraftId || null } : {}) };
			if (finalized) {
				const headline = cleanApprovedHeadline(body.headline);
				const ownerVoiceAuthority = body.ownerVoiceAuthority && typeof body.ownerVoiceAuthority === "object" && !Array.isArray(body.ownerVoiceAuthority) ? body.ownerVoiceAuthority as JsonRecord : null;
				const visualAuthorityId = String(body.visualAuthorityId || "");
				if (ownerVoiceAuthority?.approved !== true || ownerVoiceAuthority.profileId !== "owner-voice-v1" || !/^[a-f0-9]{64}$/.test(String(ownerVoiceAuthority.profileSha256 || ""))) throw new Error("Explicit approved owner-voice-v1 authority is required");
				if (visualAuthorityId !== 'paper-cut-grok-storyboard-v2') throw new Error("paper-cut-grok-storyboard-v2 is the only active visual authority");
				const snapshot = await readResearchSnapshot(slug);
				const report = next.legalContextReport && typeof next.legalContextReport === "object" && !Array.isArray(next.legalContextReport) ? next.legalContextReport as JsonRecord : null;
				if (!report) throw new Error("Current legal report is required before production orchestration");
				const candidate = next.candidate && typeof next.candidate === "object" && !Array.isArray(next.candidate) ? next.candidate as JsonRecord : null;
				if (!candidate || !isCurrentLegalContextReport({ report, candidate, researchSnapshot: snapshot })) throw new Error("Legal review changed before production enqueue; regenerate it from the current research snapshot");
				const storedTwoStage = next.videoDesignAuthorship && typeof next.videoDesignAuthorship === "object" && !Array.isArray(next.videoDesignAuthorship) ? next.videoDesignAuthorship as JsonRecord : null;
				const suppliedTwoStage = body.storyline !== undefined || body.semanticCutPlan !== undefined || body.storyboardAdmission !== undefined || body.agentVideoDesignPlan !== undefined || body.commonMasterAssets !== undefined;
				if (v9ScriptAuthorityOnly) {
					stages["03"] = { status: "ready", completedAt: now };
					stages["04"] = { status: "in-progress", reason: "awaiting-owner-narration-locked-timing" };
					for (const number of ["05", "06", "07", "08"]) stages[number] = { status: "pending" };
					next = { ...next, stages, draft, draftFinalized: true, productionApproval: { headline, ownerVoiceAuthority, visualAuthorityId, approvedAt: now }, videoDesignAuthorship: undefined, v9Planning: undefined, productionOrchestration: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
				} else if (!storedTwoStage && !suppliedTwoStage) {
					stages["03"] = { status: "ready", completedAt: now };
					stages["04"] = { status: "in-progress", reason: "awaiting-two-stage-video-authority" };
					for (const number of ["05", "06", "07", "08"]) stages[number] = { status: "pending" };
					next = { ...next, stages, draft, draftFinalized: true, productionApproval: { headline, ownerVoiceAuthority, visualAuthorityId, approvedAt: now }, productionOrchestration: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
				} else {
				productionResearchSha256 = hashJson(snapshot);
				const storedReferences = next.videoReferences && typeof next.videoReferences === "object" && !Array.isArray(next.videoReferences) ? next.videoReferences as JsonRecord : {};
				const referenceCatalog = body.referenceCatalog === undefined ? cleanVideoReferences(storedReferences.referenceCatalog || []) : cleanVideoReferences(body.referenceCatalog);
				const sceneRecipes = body.sceneRecipes === undefined ? cleanSceneRecipes(storedReferences.sceneRecipes || []) : cleanSceneRecipes(body.sceneRecipes);
				const storedAgentDesign = next.videoDesignAuthorship && typeof next.videoDesignAuthorship === "object" && !Array.isArray(next.videoDesignAuthorship) ? next.videoDesignAuthorship as JsonRecord : null;
				const commonMasterAssets = cleanCommonMasterAssets(body.commonMasterAssets === undefined ? storedAgentDesign?.commonMasterAssets : body.commonMasterAssets);
				const storyline = body.storyline && typeof body.storyline === "object" && !Array.isArray(body.storyline) ? body.storyline as JsonRecord : storedAgentDesign?.storyline && typeof storedAgentDesign.storyline === "object" && !Array.isArray(storedAgentDesign.storyline) ? storedAgentDesign.storyline as JsonRecord : null;
				const semanticCutPlan = body.semanticCutPlan && typeof body.semanticCutPlan === "object" && !Array.isArray(body.semanticCutPlan) ? body.semanticCutPlan as JsonRecord : storedAgentDesign?.semanticCutPlan && typeof storedAgentDesign.semanticCutPlan === "object" && !Array.isArray(storedAgentDesign.semanticCutPlan) ? storedAgentDesign.semanticCutPlan as JsonRecord : null;
				const storyboardAdmission = body.storyboardAdmission && typeof body.storyboardAdmission === "object" && !Array.isArray(body.storyboardAdmission) ? body.storyboardAdmission as JsonRecord : storedAgentDesign?.storyboardAdmission && typeof storedAgentDesign.storyboardAdmission === "object" && !Array.isArray(storedAgentDesign.storyboardAdmission) ? storedAgentDesign.storyboardAdmission as JsonRecord : null;
				const agentVideoDesignPlan = body.agentVideoDesignPlan && typeof body.agentVideoDesignPlan === "object" && !Array.isArray(body.agentVideoDesignPlan) ? body.agentVideoDesignPlan as JsonRecord : storedAgentDesign?.plan && typeof storedAgentDesign.plan === "object" && !Array.isArray(storedAgentDesign.plan) ? storedAgentDesign.plan as JsonRecord : null;
				if (storyline?.schema !== "newsroom-storyline-v2" || semanticCutPlan?.schema !== "newsroom-semantic-cut-plan-v2" || storyboardAdmission?.schema !== "newsroom-color-storyboard-admission-v2" || agentVideoDesignPlan?.schema !== "agent-authored-video-design-plan-v6-board-admitted") throw new Error("Two-stage video authorities are required before production enqueue");
				if (!(await currentProductionBindingExists(current))) await runReconciliationCli({ slug, headline, ownerVoiceAuthority, visualAuthorityId });
				const queued = await runOrchestrationCli({ slug, title: next.title, selectedDraftId: selectedDraftId || null, sections, headline, ownerVoiceAuthority, visualAuthorityId, researchSnapshot: snapshot, legalReport: report, referenceCatalog, sceneRecipes, commonMasterAssets, storyline, semanticCutPlan, storyboardAdmission, agentVideoDesignPlan });
				const jobId = String(queued.jobId || "");
				const authorityHash = String(queued.authorityHash || "");
				if (!PRODUCTION_JOB_ID.test(jobId) || !/^[a-f0-9]{64}$/.test(authorityHash)) throw new Error("Production enqueue returned an invalid authority identity");
				for (const number of ["04", "05", "06"]) stages[number] = { status: "in-progress", orchestrationJobId: jobId };
				stages["07"] = { status: "pending", reason: "private-production-stops-before-stage07" };
				stages["08"] = { status: "pending", reason: "publication-not-authorized" };
				const currentRecord = current as JsonRecord;
				const priorAuthority = currentRecord.productionOrchestration && typeof currentRecord.productionOrchestration === "object" && !Array.isArray(currentRecord.productionOrchestration) ? String((currentRecord.productionOrchestration as JsonRecord).authorityHash || "") : "";
				next = { ...next, stages, draft, draftFinalized: true, productionApproval: { headline, ownerVoiceAuthority, ...(queued.approvedNarrationAuthority ? { approvedNarrationAuthority: queued.approvedNarrationAuthority } : {}), visualAuthorityId, approvedAt: now }, videoReferences: { referenceCatalog, sceneRecipes, summary: { referenceCount: referenceCatalog.length, requiredCount: referenceCatalog.filter((entry) => entry.required).length, assetCount: referenceCatalog.filter((entry) => entry.assetId).length, recipeCount: sceneRecipes.length }, updatedAt: now }, productionOrchestration: { jobId, authorityHash, state: queued.state || "queued", stage: queued.stage || "finalized", privateOnly: true }, ...(priorAuthority && priorAuthority !== authorityHash ? { media: undefined, bgm: undefined, render: undefined, qa: undefined } : {}) };
				if (queued.shouldLaunch === true) productionLaunchJobId = jobId;
				}
			} else {
				for (const number of ["04", "05", "06", "07", "08"]) stages[number] = { status: "pending" };
				next = { ...next, stages, draft, draftFinalized: false, ...(v9ScriptAuthorityOnly ? { videoDesignAuthorship: undefined, v9Planning: undefined } : {}), productionOrchestration: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
			}
			}
		} else if (action === "save-media") {
			stages["04"] = { status: "ready", completedAt: now };
			stages["05"] = { status: "in-progress" };
			next = { ...next, stages, media: body.media || null };
		} else if (action === "complete-bgm") {
			stages["05"] = { status: "ready", completedAt: now };
			stages["06"] = { status: "in-progress" };
			next = { ...next, stages, bgm: body.bgm || null };
		} else if (action === "save-render") {
			const renderState = String((body.render as JsonRecord | undefined)?.state || "queued");
			stages["06"] = { status: renderState === "completed" ? "ready" : "in-progress", ...(renderState === "completed" ? { completedAt: now } : {}) };
			if (renderState === "completed") stages["07"] = { status: "in-progress" };
			next = { ...next, stages, render: body.render || null };
		} else if (action === "approve-qa") {
			stages["07"] = { status: "ready", completedAt: now };
			stages["08"] = { status: "in-progress" };
			next = { ...next, stages, qa: { approved: true, approvedAt: now } };
		} else {
			return NextResponse.json({ error: "지원하지 않는 프로젝트 작업입니다." }, { status: 400 });
		}

		if (productionLaunchJobId) {
			const [latestWorkflow, latestSnapshot] = await Promise.all([readFile(workflowPath(slug), "utf8").then((value) => JSON.parse(value) as JsonRecord), readResearchSnapshot(slug)]);
			if (latestWorkflow.updatedAt !== (current as JsonRecord).updatedAt) throw new Error("Workflow changed concurrently; finalization was not committed");
			if (hashJson(latestSnapshot) !== productionResearchSha256) throw new Error("Research changed concurrently; finalization was not committed");
		}
		const saved = await save(slug, next);
		if (productionLaunchJobId) {
			const authorityHash = String((saved.productionOrchestration as JsonRecord | undefined)?.authorityHash || "");
			const claim = await runProductionControl(["orchestration-claim", "--job", productionLaunchJobId, "--authority", authorityHash, "--pid", String(process.pid)]);
			if (claim.claimed === true && typeof claim.leaseId === "string") startProductionOrchestration(productionLaunchJobId, claim.leaseId);
		}
		return NextResponse.json(saved, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: sanitizePublicError(error) || "프로젝트를 저장하지 못했습니다." }, { status: 400 });
	} finally {
		if (mutationLock) await releaseProjectMutationLock(mutationLock);
	}
}


