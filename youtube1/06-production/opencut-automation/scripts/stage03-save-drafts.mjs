import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDraftInputPackage, compileFlowStoryScriptText, hashJson } from "./newsroom-lib.mjs";

const AUTOMATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.OPENCUT_BASE_URL || "http://localhost:3002";
export const STAGE03_GENERATION_ATTEMPTS_PER_SLUG = 1;

export function parseStage03Arguments(argv) {
  const slugs = [];
  let editorialDirectionFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || "");
    if (value === "--editorial-direction-file") {
      if (editorialDirectionFile !== null || index + 1 >= argv.length) throw new Error("--editorial-direction-file requires exactly one path");
      editorialDirectionFile = String(argv[++index]);
    } else if (value.startsWith("--")) throw new Error(`Unsupported Stage 03 option: ${value}`);
    else slugs.push(value);
  }
  if (!slugs.length) return { slugs, editorialDirectionFile };
  for (const slug of slugs) if (!/^research-[a-f0-9]{16}$/u.test(slug)) throw new Error(`Invalid newsroom slug: ${slug}`);
  return { slugs, editorialDirectionFile };
}

export async function readEditorialDirectionFile(file, options = {}) {
  if (!file) return undefined;
  const root = await realpath(options.root || AUTOMATION_ROOT);
  const requested = path.resolve(options.cwd || process.cwd(), file);
  const requestedStat = await lstat(requested);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink() || requestedStat.size > 16_384) throw new Error("Editorial direction must be a regular non-symlink UTF-8 file of at most 16384 bytes");
  const resolved = await realpath(requested);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Editorial direction file must stay inside the automation workspace");
  const bytes = await readFile(resolved);
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  if (!decoded.trim()) throw new Error("Editorial direction file must not be empty");
  return decoded;
}

export async function readDefaultEditorialDirectionFile(slug, options = {}) {
  if (!/^research-[a-f0-9]{16}$/u.test(slug)) throw new Error(`Invalid newsroom slug: ${slug}`);
  const root = path.resolve(options.root || AUTOMATION_ROOT);
  const file = path.join(root, "production", "newsroom", "editorial-directions", `${slug}.txt`);
  try {
    return await readEditorialDirectionFile(file, { ...options, root });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function resolveEditorialDirectionForSlug({ slug, editorialDirectionFile, root = AUTOMATION_ROOT } = {}) {
  return editorialDirectionFile
    ? readEditorialDirectionFile(editorialDirectionFile, { root })
    : readDefaultEditorialDirectionFile(slug, { root });
}

export function buildDraftPolicyPackage({ candidate, researchSnapshot, legalReport, editorialDirection, editorialIntent }) {
  return buildDraftInputPackage({ candidate, researchSnapshot, legalReport, editorialDirection, editorialIntent });
}

export function buildStage03SavePayload({ generated, editorialDirection, editorialIntent = generated?.editorialIntent }) {
  if (generated?.decision !== "accept" || !generated.authority) throw new Error("Only an accepted Stage 03 generation can build an active draft payload");
  return {
    action: "save-draft",
    planningMode: "v21-narration-with-story-text",
    generator: generated.generator,
    generation: generated.generation,
    critique: generated.critique,
    authority: generated.authority,
    flowStoryScript: generated.flowStoryScript,
    ...(editorialDirection === undefined ? {} : { editorialDirection }),
    ...(editorialIntent === undefined ? {} : { editorialIntent }),
    finalized: false,
    policyBinding: generated.policyBinding,
  };
}

export function buildStage03RejectionPayload({ generated, editorialDirection, editorialIntent = generated?.editorialIntent }) {
  if (generated?.decision !== "reject" || !generated.rejection || !generated.generation || !generated.critique || !generated.attemptedAuthority || !generated.flowStoryScript) throw new Error("A complete rejected Stage 03 narration/storyText generation is required");
  return {
    action: "record-draft-rejection",
    generation: generated.generation,
    critique: generated.critique,
    attemptedAuthority: generated.attemptedAuthority,
    flowStoryScript: generated.flowStoryScript,
    rejection: generated.rejection,
    policyBinding: generated.policyBinding,
    ...(editorialDirection === undefined ? {} : { editorialDirection }),
    ...(editorialIntent === undefined ? {} : { editorialIntent }),
  };
}

export async function persistStage03RunArtifact({ slug, generated, root = AUTOMATION_ROOT }) {
  const storyCore = generated?.flowStoryScript ? { schema: generated.flowStoryScript.schema, scriptSha256: generated.flowStoryScript.scriptSha256, narrationSha256: generated.flowStoryScript.narrationSha256, storyText: generated.flowStoryScript.storyText } : null;
  const authority = generated?.decision === "accept" ? generated.authority : generated?.attemptedAuthority;
  const pairSha256 = String(generated?.rejection?.attemptedPairSha256 || (authority && storyCore ? hashJson({ authority, storyScript: storyCore }) : ""));
  if (!/^research-[a-f0-9]{16}$/u.test(slug) || !/^[a-f0-9]{64}$/u.test(pairSha256) || !["accept", "reject"].includes(generated?.decision)) throw new Error("A validated paired Stage 03 result is required for append-only persistence");
  const directory = path.join(path.resolve(root), "out", "newsroom", "stage03-separated-runs");
  await mkdir(directory, { recursive: true });
  const core = { schema: "newsroom-stage03-story-text-run-v1", slug, decision: generated.decision, pairSha256, generated };
  const artifact = { ...core, artifactSha256: hashJson(core) };
  const file = path.join(directory, `${slug}-${pairSha256}.json`);
  try { await writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
  const exportDirectory = path.join(directory, `${slug}-${pairSha256}`);
  await mkdir(exportDirectory, { recursive: true });
  const narrationBytes = Buffer.from(`${String(authority?.narration || "").trim()}\n`, "utf8");
  const storyText = String(generated?.flowStoryScript?.storyText || "").trim();
  const storyBytes = Buffer.from(`${storyText || compileFlowStoryScriptText(generated.flowStoryScript)}\n`, "utf8");
  if (narrationBytes.length <= 1 || storyBytes.length <= 1) throw new Error("Paired Stage 03 text exports require both narration and story script");
  const writeOnce = async (destination, bytes) => {
    try { await writeFile(destination, bytes, { flag: "wx" }); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(destination);
      if (!existing.equals(bytes)) throw new Error(`Append-only Stage 03 export already exists with different bytes: ${path.basename(destination)}`);
    }
  };
  const narrationFile = path.join(exportDirectory, "narration.txt");
  const storyScriptFile = path.join(exportDirectory, "story-script.txt");
  await writeOnce(narrationFile, narrationBytes);
  await writeOnce(storyScriptFile, storyBytes);
  const metadataCore = {
    schema: "newsroom-stage03-story-text-exports-v1",
    slug,
    decision: generated.decision,
    admissionStatus: generated.decision === "accept" ? "accepted-draft-not-final-production-authority" : "rejected-candidate-not-approved",
    pairSha256,
    sourceAuditFile: path.basename(file),
    outputs: [
      { role: "narration", file: "narration.txt", bytes: narrationBytes.length, sha256: createHash("sha256").update(narrationBytes).digest("hex") },
      { role: "story-script", file: "story-script.txt", bytes: storyBytes.length, sha256: createHash("sha256").update(storyBytes).digest("hex") },
    ],
  };
  const metadataFile = path.join(exportDirectory, "metadata.json");
  await writeOnce(metadataFile, Buffer.from(`${JSON.stringify({ ...metadataCore, metadataSha256: hashJson(metadataCore) }, null, 2)}\n`, "utf8"));
  return { auditFile: file, narrationFile, storyScriptFile, metadataFile };
}

const getJson = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
};

const postJson = async (url, payload, method = "POST") => {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
};

const { slugs, editorialDirectionFile } = parseStage03Arguments(process.argv.slice(2));

for (const slug of slugs) {
  // An explicit file overrides every slug. Without it, each story gets only
  // its own contained, hash-bound editorial direction file when present.
  const editorialDirection = await resolveEditorialDirectionForSlug({ slug, editorialDirectionFile });
  const workflowUrl = `${baseUrl}/api/newsroom/projects/${slug}/workflow`;
  const workflow = await getJson(workflowUrl);
  if (workflow.draftFinalized === true) throw new Error(`${slug}: finalized Stage 03 authority is immutable`);
  // This is the same POST contract used by the Script UI. The exact decoded
  // string is then reused for PATCH so both policy-package hash checks see the
  // same editorial direction value.
  // Exactly one generation request is allowed per slug in this process. A user
  // may start a later process as a new run; this batch never retries a failed run.
  const generated = await postJson(`${baseUrl}/api/newsroom`, { action: "draft", slug, ...(editorialDirection === undefined ? {} : { editorialDirection }) });
  const runArtifact = await persistStage03RunArtifact({ slug, generated });
  if (generated.decision === "reject") {
    const body = await postJson(workflowUrl, buildStage03RejectionPayload({ generated, editorialDirection }), "PATCH");
    console.log(JSON.stringify({ slug, patchStatus: 200, decision: "reject", reasons: generated.rejection?.reasons || [], activeDraftPreserved: true, runArtifact, rejectionHistoryCount: Array.isArray(body.draftRejectionHistory) ? body.draftRejectionHistory.length : 0 }, null, 2));
    continue;
  }
  const body = await postJson(workflowUrl, buildStage03SavePayload({ generated, editorialDirection }), "PATCH");
  const verify = await getJson(workflowUrl);
  console.log(JSON.stringify({ slug, patchStatus: 200, stages: verify.stages, draftFinalized: verify.draftFinalized, authoritySchema: generated.authority.schema, sentenceCount: generated.authority.sentences.length, storyCharacterCount: generated.flowStoryScript.storyText.length, callCount: generated.generation.callCount, runArtifact, historyCount: Array.isArray(body.draft?.history) ? body.draft.history.length : 0, policyBinding: generated.policyBinding }, null, 2));
}
