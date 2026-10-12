import "server-only";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params */

import { existsSync } from "node:fs";
import { readdir, readFile, rename, rm, writeFile, mkdir, lstat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { findYoutubeWorkspace } from "./workspace-server";

export type NewsroomProjectRecord = {
	 slug: string;
	 title: string;
	 summary?: string;
	 topic?: string;
	 source?: string;
	 url?: string;
	 publishedAt?: string;
	 status?: string;
	 canonical?: boolean;
	 candidate?: Record<string, unknown>;
	 stages?: Record<string, unknown>;
	 research?: Record<string, unknown>;
	 createdAt?: string;
	 updatedAt?: string;
	 archive?: NewsroomArchiveEntry;
};

export type NewsroomArchiveEntry = {
	slug: string;
	storyTitle: string;
	status: "archived";
	archivedAt: string;
	upload: {
		provider: "youtube";
		jobId: string;
		versionId: string;
		platformId: string;
		postUrl: string;
		title: string;
		privacy: "public";
		providerStatus: string;
		videoSha256: string;
	};
	production: { videoPath: string; videoSha256: string; handoffPath: string; handoffSha256: string };
};

export type NewsroomRegistry = { version: 1; updatedAt: string; projects: NewsroomProjectRecord[] };

let registryQueue: Promise<void> = Promise.resolve();

function withRegistryLock<T>(operation: () => Promise<T>): Promise<T> {
	const result = registryQueue.then(operation, operation);
	registryQueue = result.then(() => undefined, () => undefined);
	return result;
}

function automationRoot() {
	return path.join(findYoutubeWorkspace(), "06-production", "opencut-automation");
}

function registryPath() { return path.join(automationRoot(), "out", "newsroom", "project-registry.json"); }
function dossierPath() { return path.join(automationRoot(), "out", "newsroom", "research-dossiers.json"); }
function projectsPath() { return path.join(automationRoot(), "production", "newsroom", "projects"); }
function archivePath() { return path.join(automationRoot(), "production", "newsroom", "archive.json"); }
function reconciliationPath(slug: string) { return path.join(automationRoot(), "production", "newsroom", "reconciliations", slug); }
const jobPattern = /^production-[a-f0-9]{40}$/u;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]` : `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;

function productionPointer(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const production = (value as Record<string, unknown>).productionOrchestration;
	let jobId = production && typeof production === "object" && !Array.isArray(production) ? (production as Record<string, unknown>).jobId : null;
	if (!jobId) { const stages = (value as Record<string, unknown>).stages; const stage04 = stages && typeof stages === "object" && !Array.isArray(stages) ? (stages as Record<string, unknown>)["04"] : null; jobId = stage04 && typeof stage04 === "object" && !Array.isArray(stage04) ? (stage04 as Record<string, unknown>).orchestrationJobId : null; }
	return typeof jobId === "string" && jobPattern.test(jobId) ? jobId : null;
}

async function canMergeWorkflowWithPointerDivergence(slug: string, stored: NewsroomProjectRecord | undefined, workflow: Record<string, unknown>, workflowFile: string) {
	const storedJob = productionPointer(stored); const workflowJob = productionPointer(workflow);
	if (!storedJob || !workflowJob || storedJob === workflowJob) return true;
	const [registryBytes, workflowBytes] = await Promise.all([readFile(registryPath()), readFile(workflowFile)]);
	const names = await readdir(reconciliationPath(slug)).catch((error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT" ? [] : Promise.reject(error));
	for (const name of names.sort().reverse()) {
		if (!/^reconciliation-[a-f0-9]{24}\.json$/u.test(name)) continue;
		try {
			const artifact = JSON.parse(await readFile(path.join(reconciliationPath(slug), name), "utf8")) as Record<string, unknown>;
			const artifactSha = artifact.artifactSha256; const unsigned = { ...artifact }; delete unsigned.artifactSha256;
			const workflowEvidence = artifact.workflow as Record<string, unknown>; const registryEvidence = artifact.registry as Record<string, unknown>;
			if (artifact.schema !== "newsroom-production-reconciliation-v1" || artifact.creator !== "newsroom-production-reconciliation-creator-v1" || artifact.verifier !== "newsroom-production-reconciliation-verifier-v1" || typeof artifactSha !== "string" || sha256(canonicalJson(unsigned)) !== artifactSha) continue;
			if (workflowEvidence.sha256 !== sha256(workflowBytes) || workflowEvidence.bytes !== workflowBytes.length || workflowEvidence.jobId !== workflowJob || registryEvidence.sha256 !== sha256(registryBytes) || registryEvidence.bytes !== registryBytes.length || registryEvidence.jobId !== storedJob) continue;
			const missingJobs = artifact.missingJobs;
			if (!Array.isArray(missingJobs) || ![workflowJob, storedJob].every((jobId) => missingJobs.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).jobId === jobId && (item as Record<string, unknown>).observedState === "missing-directory"))) continue;
			const intent = artifact.successorIntent as Record<string, unknown>; const headline = intent?.headline as Record<string, unknown>; const owner = intent?.ownerVoiceAuthority as Record<string, unknown>;
			if (intent?.preserveExistingJobs !== true || intent?.createSeparateImmutableJob !== true || headline?.approved !== true || !/[\uAC00-\uD7A3]/u.test(String(headline?.line1 || "")) || !/[\uAC00-\uD7A3]/u.test(String(headline?.line2 || "")) || owner?.approved !== true || owner?.profileId !== "owner-voice-v1" || !["paper-cut-i2v-v1", "paper-cut-keyframe-v1", "paper-cut-grok-storyboard-v2"].includes(String(intent?.visualAuthorityId || ""))) continue;
			for (const jobId of [workflowJob, storedJob]) { try { await lstat(path.join(automationRoot(), "out", "newsroom", "jobs", jobId)); throw new Error("stale job appeared"); } catch (error: unknown) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; } }
			return true;
		} catch { /* Invalid evidence cannot authorize destructive pointer convergence. */ }
	}
	return false;
}

async function writeAtomic(filePath: string, value: unknown) {
	await mkdir(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(temporary, filePath);
	} finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
	try { const value: unknown = JSON.parse(await readFile(filePath, "utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
}

async function readRegistryJson(): Promise<Record<string, unknown> | null> {
	let source: string;
	try {
		source = await readFile(registryPath(), "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw new Error("Newsroom project registry could not be read; refusing to overwrite it.", { cause: error });
	}
	try {
		const value: unknown = JSON.parse(source);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Registry root must be an object.");
		const registry = value as Record<string, unknown>;
		if (registry.version !== 1 || typeof registry.updatedAt !== "string" || !Array.isArray(registry.projects)) throw new Error("Registry schema is invalid.");
		return value as Record<string, unknown>;
	} catch {
		const quarantinePath = `${registryPath()}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
		try {
			await rename(registryPath(), quarantinePath);
		} catch (quarantineError) {
			throw new Error("Newsroom project registry is corrupt and could not be quarantined; refusing to overwrite it.", { cause: quarantineError });
		}
		return null;
	}
}

function hasLegacyCanonicalSchema(value: Record<string, unknown>) {
	return typeof value.draft === "string"
		&& value.status === "final"
		&& typeof value.savedAt === "string"
		&& typeof value.finalizedAt === "string"
		&& Boolean(value.generation && typeof value.generation === "object" && !Array.isArray(value.generation));
}

function mergeProject(current: NewsroomProjectRecord | undefined, next: NewsroomProjectRecord): NewsroomProjectRecord {
	const definedNext = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
	return { ...(current || {}), ...definedNext, candidate: next.candidate || current?.candidate, stages: next.stages || current?.stages, research: next.research || current?.research } as NewsroomProjectRecord;
}

function currentTitle(current: NewsroomProjectRecord | undefined, legacy: Record<string, unknown>, slug: string) {
	if (current?.title) return current.title;
	if (typeof legacy.title === "string" && legacy.title.trim()) return legacy.title;
	if (typeof legacy.topic === "string" && legacy.topic.trim()) return legacy.topic;
	return slug;
}

/** Load the durable newsroom registry, migrating legacy dossiers/workflows on first read. */
async function loadNewsroomRegistryUnlocked(): Promise<NewsroomRegistry> {
	const existing = await readRegistryJson();
	const bySlug = new Map<string, NewsroomProjectRecord>();
	const stored = (Array.isArray(existing?.projects) ? existing.projects : []).slice().sort((left, right) => String((left as Record<string, unknown>)?.slug || "").localeCompare(String((right as Record<string, unknown>)?.slug || "")) || String((left as Record<string, unknown>)?.updatedAt || "").localeCompare(String((right as Record<string, unknown>)?.updatedAt || "")));
	for (const value of stored) {
		if (!value || typeof value !== "object" || typeof value.slug !== "string" || typeof value.title !== "string") continue;
		const record = value as unknown as NewsroomProjectRecord;
		bySlug.set(value.slug, { ...record, status: record.status === "archived" ? undefined : record.status, archive: undefined });
	}
	const dossiers = await readJson(dossierPath());
	for (const value of (Array.isArray(dossiers?.dossiers) ? dossiers.dossiers : []).slice().sort((left, right) => String((left as Record<string, unknown>)?.slug || "").localeCompare(String((right as Record<string, unknown>)?.slug || "")))) {
		if (!value || typeof value !== "object" || typeof value.slug !== "string" || typeof value.title !== "string") continue;
		const dossier = value as Record<string, unknown>;
		bySlug.set(dossier.slug as string, mergeProject(bySlug.get(dossier.slug as string), {
			slug: dossier.slug as string, title: dossier.title as string, source: typeof dossier.source === "string" ? dossier.source : undefined,
			url: typeof dossier.url === "string" ? dossier.url : undefined, publishedAt: typeof dossier.publishedAt === "string" ? dossier.publishedAt : undefined,
			status: typeof dossier.editorialStatus === "string" ? dossier.editorialStatus : "active-review", candidate: dossier,
			updatedAt: typeof (dossier.approval as Record<string, unknown> | undefined)?.approvedAt === "string" ? (dossier.approval as Record<string, unknown>).approvedAt as string : undefined,
		}));
	}

	if (existsSync(projectsPath())) {
		for (const name of (await readdir(projectsPath())).sort()) {
			if (!name.endsWith(".json") || name.includes(".pre-") || /\.(?:media|research|config|quality|workflow)\.json$/.test(name)) continue;
			const legacy = await readJson(path.join(projectsPath(), name));
			if (!legacy) continue;
			const fileSlug = name.slice(0, -5);
			const slug = typeof legacy.slug === "string" ? legacy.slug : fileSlug;
			if (!/^[a-z0-9][a-z0-9-]{5,80}$/.test(slug)) continue;
			const title = currentTitle(bySlug.get(slug), legacy, slug);
			bySlug.set(slug, mergeProject(bySlug.get(slug), {
				slug,
				title,
				canonical: legacy.canonical === true || hasLegacyCanonicalSchema(legacy) ? true : undefined,
				summary: typeof legacy.summary === "string" ? legacy.summary : undefined,
				topic: typeof legacy.topic === "string" ? legacy.topic : undefined,
				candidate: legacy.candidate as Record<string, unknown> | undefined,
				updatedAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : typeof legacy.savedAt === "string" ? legacy.savedAt : undefined,
			}));
		}
		for (const name of (await readdir(projectsPath())).sort()) {
			if (!name.endsWith(".workflow.json") || name.includes(".pre-")) continue;
			const workflow = await readJson(path.join(projectsPath(), name));
			if (!workflow || typeof workflow.slug !== "string" || typeof workflow.title !== "string") continue;
			if (!await canMergeWorkflowWithPointerDivergence(workflow.slug, bySlug.get(workflow.slug), workflow, path.join(projectsPath(), name))) continue;
			bySlug.set(workflow.slug, mergeProject(bySlug.get(workflow.slug), {
				slug: workflow.slug, title: workflow.title, canonical: workflow.canonical === true ? true : undefined, status: typeof workflow.draftFinalized === "boolean" ? (workflow.draftFinalized ? "draft-finalized" : "active-review") : undefined,
				candidate: workflow.candidate as Record<string, unknown> | undefined, stages: workflow.stages as Record<string, unknown> | undefined,
				createdAt: typeof workflow.createdAt === "string" ? workflow.createdAt : undefined, updatedAt: typeof workflow.updatedAt === "string" ? workflow.updatedAt : undefined,
			}));
		}
		// Research snapshots are authoritative per slug as well. Merge them
		// independently so a project remains discoverable even when its workflow
		// is still being created (or when a legacy record has no workflow file).
		for (const name of (await readdir(projectsPath())).sort()) {
			if (!name.endsWith(".research.json") || name.includes(".pre-")) continue;
			const research = await readJson(path.join(projectsPath(), name));
			if (!research || typeof research.slug !== "string") continue;
			const slug = research.slug as string;
			const current = bySlug.get(slug);
			bySlug.set(slug, mergeProject(current, {
				slug,
				title: current?.title || (typeof research.topic === "string" && research.topic.trim() ? research.topic : slug),
				research,
				updatedAt: typeof research.fetchedAt === "string" ? research.fetchedAt : current?.updatedAt,
			}));
		}
	}

	const archive = await readJson(archivePath());
	for (const value of Array.isArray(archive?.entries) ? archive.entries : []) {
		if (!value || typeof value !== "object") continue;
		const entry = value as unknown as NewsroomArchiveEntry;
		if (entry.status !== "archived" || typeof entry.slug !== "string" || typeof entry.storyTitle !== "string") continue;
		const current = bySlug.get(entry.slug);
		if (!current) continue;
		bySlug.set(entry.slug, mergeProject(current, { slug: entry.slug, title: current.title || entry.storyTitle, status: "archived", archive: entry }));
	}

	const projects = [...bySlug.values()].sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || "") || left.slug.localeCompare(right.slug));
	const result = { version: 1 as const, updatedAt: typeof existing?.updatedAt === "string" ? existing.updatedAt : new Date().toISOString(), projects };
	if (!existing || JSON.stringify(existing.projects) !== JSON.stringify(projects)) await writeAtomic(registryPath(), { ...result, updatedAt: new Date().toISOString() });
	return result;
}

export async function loadNewsroomRegistry(): Promise<NewsroomRegistry> {
	return withRegistryLock(loadNewsroomRegistryUnlocked);
}

export async function upsertNewsroomProject(project: NewsroomProjectRecord) {
	return withRegistryLock(async () => {
		const current = await loadNewsroomRegistryUnlocked();
		const projects = [mergeProject(current.projects.find((item) => item.slug === project.slug), project), ...current.projects.filter((item) => item.slug !== project.slug)];
		const result = { version: 1 as const, updatedAt: new Date().toISOString(), projects };
		await writeAtomic(registryPath(), result);
		return result;
	});
}

export async function persistNewsroomResearch(slug: string, research: Record<string, unknown>) {
	return withRegistryLock(async () => {
		const current = await loadNewsroomRegistryUnlocked();
		const existing = current.projects.find((item) => item.slug === slug);
		if (!existing) throw new Error("Unknown newsroom project");
		const project = mergeProject(existing, { slug, title: existing.title, research, updatedAt: new Date().toISOString() });
		const result = { version: 1 as const, updatedAt: new Date().toISOString(), projects: [project, ...current.projects.filter((item) => item.slug !== slug)] };
		await writeAtomic(registryPath(), result);
		return result;
	});
}

export async function readNewsroomProject(slug: string) {
	const registry = await loadNewsroomRegistry();
	return registry.projects.find((project) => project.slug === slug) || null;
}

export function isArchivedNewsroomProject(project: NewsroomProjectRecord) {
	return project.status === "archived" && project.archive?.status === "archived";
}
