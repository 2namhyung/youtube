#!/usr/bin/env node
import fsp from "node:fs/promises";
import path from "node:path";
import { analyzeResearch, collectResearchRadar, extractImageCandidates, fetchCandidates, generateCodexDraftCandidates, generateCodexFlowStoryScript, generateCodexScenePromptBatch, getCodexCliStatus, promoteResearchCandidate, refreshResearch, rejectResearchCandidate, retryFailedResearchAnalysis, runRenderJob, validatePersistedAutonomousNarrationContract, validatePersistedDraftContract } from "./newsroom-lib.mjs";
import { claimProductionLaunch, enqueueProductionOrchestration, releaseProductionLaunch, runProductionOrchestration } from "./newsroom-production-orchestration.mjs";
import { ensureProductionReconciliation } from "./newsroom-production-reconciliation.mjs";

const args = process.argv.slice(2);
const command = args[0];
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (command === "collect-research") {
  process.stdout.write(`${JSON.stringify(await collectResearchRadar())}\n`);
} else if (command === "backfill-research") {
  const days = Number(value("--days") || 30);
  process.stdout.write(`${JSON.stringify(await collectResearchRadar({ historical: true, days }))}\n`);
} else if (command === "refresh-research") {
  process.stdout.write(`${JSON.stringify(await refreshResearch({ days: 30 }))}\n`);
} else if (command === "candidates") {
  const fixturePath = value("--fixture");
  const radarFixturePath = value("--research-radar-fixture");
  const fixtureByAdapter = fixturePath
    ? { "google-news": await fsp.readFile(path.resolve(fixturePath), "utf8") }
    : undefined;
  const researchRadar = radarFixturePath
    ? { csvText: await fsp.readFile(path.resolve(radarFixturePath), "utf8") }
    : undefined;
  const result = await fetchCandidates({
    query: value("--query") || "",
    adapterIds: value("--adapters")?.split(",").filter(Boolean),
    limit: Number(value("--limit") || 24),
    now: value("--now"),
    threshold: Number(value("--threshold") || 70),
    fixtureByAdapter,
    researchRadar,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "draft") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input);
  if (payload?.researchSnapshot || payload?.sources || payload?.followUps || payload?.laws || payload?.contradictions) throw new Error("draft accepts only candidate narrative and approved legal policy");
  process.stdout.write(`${JSON.stringify(await generateCodexDraftCandidates(payload))}\n`);
} else if (command === "scene-prompts") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input);
  process.stdout.write(`${JSON.stringify(await generateCodexScenePromptBatch(payload))}\n`);
} else if (command === "flow-story-script") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input);
  process.stdout.write(`${JSON.stringify(await generateCodexFlowStoryScript(payload))}\n`);
} else if (command === "validate-draft") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input);
  process.stdout.write(`${JSON.stringify(["newsroom-autonomous-narration-v3", "newsroom-autonomous-narration-v4", "newsroom-autonomous-narration-v5", "newsroom-autonomous-narration-v6", "newsroom-autonomous-narration-v7", "newsroom-autonomous-narration-v8"].includes(payload?.authority?.schema) ? validatePersistedAutonomousNarrationContract(payload) : validatePersistedDraftContract(payload))}\n`);
} else if (command === "media") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${JSON.stringify(await extractImageCandidates(JSON.parse(input)))}\n`);
} else if (command === "semantic-select" || command === "analyze-research") {
  try {
    process.stdout.write(`${JSON.stringify(await analyzeResearch(undefined, { batchSize: 60, timeoutMs: 120_000 }))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  }
} else if (command === "retry-failed-research") {
  try {
    process.stdout.write(`${JSON.stringify(await retryFailedResearchAnalysis({ batchMaxAttempts: 2, timeoutMs: 120_000 }))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  }
} else if (command === "codex-status") {
  process.stdout.write(`${JSON.stringify(await getCodexCliStatus())}\n`);
} else if (command === "promote-research") {
  const url = value("--url");
  if (!url) throw new Error("promote-research requires --url <exact persisted URL>");
  process.stdout.write(`${JSON.stringify(await promoteResearchCandidate(url))}\n`);
} else if (command === "reject-research") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input || "{}");
  process.stdout.write(`${JSON.stringify(await rejectResearchCandidate(payload.candidate, payload.reason))}\n`);
} else if (command === "render") {
  const jobId = value("--job");
  if (!jobId) throw new Error("render requires --job <id>");
  await runRenderJob(jobId);
} else if (command === "orchestration-enqueue") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${JSON.stringify(await enqueueProductionOrchestration(JSON.parse(input)))}\n`);
} else if (command === "orchestration-reconcile") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const result = await ensureProductionReconciliation(JSON.parse(input));
  process.stdout.write(`${JSON.stringify({ required: result.required, artifactPath: result.file, artifactSha256: result.artifact?.artifactSha256 || null })}\n`);
} else if (command === "orchestrate") {
  const jobId = value("--job");
  if (!jobId) throw new Error("orchestrate requires --job <id>");
  process.stdout.write(`${JSON.stringify(await runProductionOrchestration(jobId))}\n`);
} else if (command === "orchestration-claim") {
  const jobId = value("--job"); const authorityHash = value("--authority"); const pid = Number(value("--pid"));
  if (!jobId || !authorityHash || !Number.isInteger(pid)) throw new Error("orchestration-claim requires --job, --authority and --pid");
  process.stdout.write(`${JSON.stringify(await claimProductionLaunch(jobId, authorityHash, { pid }))}\n`);
} else if (command === "orchestration-release") {
  const jobId = value("--job"); const leaseId = value("--lease");
  if (!jobId || !leaseId) throw new Error("orchestration-release requires --job and --lease");
  await releaseProductionLaunch(jobId, leaseId);
  process.stdout.write(`${JSON.stringify({ released: true })}\n`);
} else {
  throw new Error("Usage: newsroom-cli.mjs candidates|collect-research|analyze-research|retry-failed-research|draft|validate-draft|media|render|orchestration-reconcile|orchestration-enqueue|orchestration-claim|orchestration-release|orchestrate --job <id>");
}
