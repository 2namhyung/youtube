import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv.includes("--slug") ? process.argv[process.argv.indexOf("--slug") + 1] : "";
const mode = process.argv.includes("--invalidate") ? "invalidate" : "backup-only";
if (!/^[a-z0-9][a-z0-9-]{5,80}$/u.test(slug)) throw new Error("--slug is required");
const projectRoot = path.join(root, "production", "newsroom", "projects");
const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
const files = ["workflow", "research", "research.config"].map((kind) => ({ kind, file: path.join(projectRoot, `${slug}.${kind}.json`) }));
const backups = [];
for (const item of files) {
  const backup = item.file.replace(/\.json$/u, `.pre-event-dossier-${stamp}.json`);
  try { await copyFile(item.file, backup); backups.push(backup); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}
if (mode === "invalidate") {
  const workflowFile = path.join(projectRoot, `${slug}.workflow.json`);
  const workflow = JSON.parse(await readFile(workflowFile, "utf8"));
  const stages = { ...(workflow.stages || {}), "02": { status: "in-progress", reason: "event-dossier-v1-migration" } };
  for (const number of ["03", "04", "05", "06", "07", "08"]) stages[number] = { status: "pending" };
  const next = { ...workflow, updatedAt: new Date().toISOString(), stages, migration: { name: "event-dossier-v1", migratedAt: new Date().toISOString(), backups }, legalContextReport: undefined, draft: undefined, draftFinalized: false, draftLegalCompliance: undefined, media: undefined, bgm: undefined, render: undefined, qa: undefined };
  const temporary = `${workflowFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, workflowFile);
}
console.log(JSON.stringify({ slug, mode, backups }, null, 2));
