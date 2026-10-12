import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNewsroomArchive } from "./newsroom-archive-lib.mjs";

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(automationRoot, "..", "..");
const jobsRoot = path.join(workspaceRoot, "08-upload-delivery", "runtime", "jobs");
const projectsRoot = path.join(automationRoot, "production", "newsroom", "projects");
const versionsRoot = path.join(automationRoot, "out", "registry", "versions");
const registryPath = path.join(automationRoot, "out", "newsroom", "project-registry.json");
const outputPath = path.join(automationRoot, "production", "newsroom", "archive.json");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const relative = (value) => path.relative(workspaceRoot, value).replaceAll("\\", "/");

async function jsonBytes(filePath) {
  const bytes = await readFile(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

async function loadJobs() {
  const result = [];
  for (const name of (await readdir(jobsRoot)).filter((item) => item.endsWith(".json")).sort()) {
    const filePath = path.join(jobsRoot, name);
    try {
      const { bytes, value: job } = await jsonBytes(filePath);
      result.push({ job, bytes, relativePath: relative(filePath) });
    } catch { /* unrelated/corrupt jobs are not archive evidence */ }
  }
  return result;
}

async function loadStoryTitles(slugs) {
	const result = new Map();
	try {
		const { value: registry } = await jsonBytes(registryPath);
		for (const project of Array.isArray(registry.projects) ? registry.projects : []) {
			if (typeof project?.slug === "string" && typeof project?.title === "string" && project.title.trim()) result.set(project.slug, project.title.trim());
		}
	} catch { /* project authorities below remain sufficient */ }
	for (const slug of slugs) {
    for (const suffix of [".workflow.json", ".json"]) {
      try {
        const { value } = await jsonBytes(path.join(projectsRoot, `${slug}${suffix}`));
        if (typeof value.title === "string" && value.title.trim()) { result.set(slug, value.title.trim()); break; }
      } catch { /* try the next authority */ }
    }
  }
  return result;
}

async function loadVersionEvidence(versionIds) {
  const result = new Map();
  for (const versionId of versionIds) {
    const versionPath = path.join(versionsRoot, `${versionId}.json`);
    const handoffPath = path.join(versionsRoot, `${versionId}.handoff.json`);
    const [{ bytes: versionBytes, value: version }, { bytes: handoffBytes }] = await Promise.all([jsonBytes(versionPath), jsonBytes(handoffPath)]);
    if (version.versionId !== versionId || typeof version.path !== "string") throw new Error(`Archive version registry is invalid: ${versionId}`);
    const videoBytes = await readFile(version.path);
    const videoSha256 = sha256(videoBytes);
    result.set(versionId, {
      versionRegistryPath: relative(versionPath),
      versionRegistrySha256: sha256(versionBytes),
      handoffPath: relative(handoffPath),
      handoffSha256: sha256(handoffBytes),
      videoPath: relative(version.path),
      videoSha256,
    });
  }
  return result;
}

async function writeAtomic(value) {
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, outputPath);
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

const jobs = await loadJobs();
const publicJobs = jobs.filter(({ job }) => job?.provider === "youtube" && job?.state === "published" && job?.privacy === "public" && typeof job?.projectSlug === "string");
const storyTitles = await loadStoryTitles(new Set(publicJobs.map(({ job }) => job.projectSlug)));
const versionEvidence = await loadVersionEvidence(new Set(publicJobs.map(({ job }) => job.versionId)));
const archive = buildNewsroomArchive({ jobs, storyTitles, versionEvidence });
await writeAtomic(archive);
process.stdout.write(`${JSON.stringify({ output: relative(outputPath), entryCount: archive.entryCount, slugs: archive.entries.map((entry) => entry.slug) })}\n`);
