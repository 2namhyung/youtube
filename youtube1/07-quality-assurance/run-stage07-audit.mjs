import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspace = path.resolve(import.meta.dirname, "..");
const automationRoot = path.join(workspace, "06-production", "opencut-automation");
const outRoot = path.join(automationRoot, "out");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const exactVersion = option("--version");
const explicitRender = option("--render");
if (exactVersion && !/^[A-Za-z0-9_-]+$/.test(exactVersion)) throw new Error("--version contains unsafe characters");
if (exactVersion && explicitRender) throw new Error("Use either --version or --render, not both.");
const latestRenderPath = path.join(outRoot, "latest-render.json");
const initialRenderPath = explicitRender
  ? path.resolve(explicitRender)
  : exactVersion
    ? path.join(outRoot, "registry", "versions", `${exactVersion}.json`)
    : latestRenderPath;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function readJson(file, label) {
  try { return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/u, "")); }
  catch (error) { throw new Error(`Invalid UTF-8 JSON in ${label || file}: ${error.message}`); }
}
async function runCheck(commandArgs) {
  try {
    const result = await execFileAsync(process.execPath, commandArgs, { cwd: workspace, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 });
    return { status: "passed", exitCode: 0, outputSha256: sha256(result.stdout) };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return { status: "failed", exitCode: Number.isInteger(error?.code) ? error.code : 1, outputSha256: sha256(`${stdout}\n${stderr}`), summary: stderr.trim().split(/\r?\n/).slice(-4).join("\n").slice(0, 1200) };
  }
}
async function validateGenericHandoff(render) {
  try {
	const handoffName = String(render.handoffFile || "");
	let handoffPath;
	if (typeof render.handoffPath === "string" && render.handoffPath) {
	  handoffPath = path.resolve(render.handoffPath);
	  const relative = path.relative(outRoot, handoffPath);
	  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("private handoff escaped production output");
	} else {
	  if (path.basename(handoffName) !== handoffName || handoffName !== `${render.versionId}.handoff.json`) throw new Error("registered handoff filename/version mismatch");
	  handoffPath = path.join(outRoot, "registry", "versions", handoffName);
	}
    const handoff = await readJson(handoffPath, "registered handoff");
    if (handoff.versionId !== render.versionId) throw new Error("handoff version mismatch");
	for (const key of ["scriptSha256", "projectConfigSha256", "projectAuthority", "contractAuthority", "contractSha256", "narrationConfigSha256"]) {
	  if ((render.sourceIntegrity?.[key] ?? null) !== (handoff.sourceIntegrity?.[key] ?? null)) throw new Error(`handoff sourceIntegrity.${key} does not match registry`);
	}
    if (handoff.project?.width !== 1080 || handoff.project?.height !== 1920 || handoff.project?.fps !== 30) throw new Error("handoff output lock drift");
    if (!Array.isArray(handoff.tracks) || !Array.isArray(handoff.cues) || !Array.isArray(handoff.assets) || handoff.cues.length < 1) throw new Error("editable handoff is incomplete");
    for (const key of ["script", "narration", "visuals", "captions"]) if (handoff.editableTrackContract?.[key]?.status !== "ready") throw new Error(`editable ${key} track is not ready`);
    if (handoff.editableTrackContract?.bgm?.required === true && handoff.editableTrackContract.bgm.status !== "ready") throw new Error("required BGM track is not ready");
    const visualCount = handoff.tracks.filter((track) => track.type === "video").length;
    const disclosureCount = handoff.tracks.filter((track) => track.type === "text" && typeof track.text === "string" && /AI/i.test(track.text)).length;
    if (visualCount < 1 || disclosureCount < visualCount) throw new Error("AI disclosure is not present for every visual cut");
	const handoffBytes = await readFile(handoffPath);
    return { status: "passed", outputSha256: sha256(handoffBytes), handoffSha256: sha256(handoffBytes), handoffPath, handoff };
  } catch (error) {
    return { status: "failed", outputSha256: null, summary: error.message };
  }
}

let renderPath = initialRenderPath;
let renderBytes = await readFile(renderPath);
let render = JSON.parse(renderBytes.toString("utf8").replace(/^\uFEFF/u, ""));
if (!exactVersion && !explicitRender && render.versionId) {
  const registryPath = path.join(outRoot, "registry", "versions", `${render.versionId}.json`);
  if (fs.existsSync(registryPath)) {
    renderPath = registryPath;
    renderBytes = await readFile(renderPath);
    const registered = JSON.parse(renderBytes.toString("utf8").replace(/^\uFEFF/u, ""));
    if (registered.versionId !== render.versionId) throw new Error("latest-render.json points at a different registered version");
    render = registered;
  }
}
if (!render.versionId || (exactVersion && render.versionId !== exactVersion)) throw new Error("Exact render version could not be resolved.");
const reportPath = path.resolve(option("--report") || (exactVersion || explicitRender ? path.join(import.meta.dirname, "runs", `${render.versionId}.stage07-audit.json`) : path.join(import.meta.dirname, "runs", "latest-stage07-audit.json")));
const approvalPath = path.resolve(option("--approval") || path.join(import.meta.dirname, "runs", "human-approval.json"));
const legalDecisionPath = path.resolve(option("--legal-decision") || path.join(import.meta.dirname, "runs", "legal-release-decision.json"));
const readOptionalJson = async (file) => { try { return await readJson(file); } catch { return null; } };

const resolvedVideoPath = path.resolve(render.path || "");
const resolvedThumbnailPath = path.resolve(render.thumbnailPath || "");
for (const [label, target] of [["video", resolvedVideoPath], ["thumbnail", resolvedThumbnailPath]]) {
  const relative = path.relative(outRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Registered ${label} escaped the production output directory.`);
}
const finalVideoSha256 = sha256(await readFile(resolvedVideoPath));
const finalThumbnailSha256 = sha256(await readFile(resolvedThumbnailPath));
const sourceIntegrity = render.sourceIntegrity ?? {};
const projectArg = option("--project");
const contractArg = option("--contract");
if (Boolean(projectArg) !== Boolean(contractArg)) throw new Error("--project and --contract must be supplied together");
const isJejuCanonical = sourceIntegrity.slug === "jeju-school-intrusion" || String(sourceIntegrity.authority || "").includes("jeju-school-intrusion");
if (!isJejuCanonical && (!projectArg || !contractArg)) throw new Error("Generic Stage 07 audits require the exact --project and --contract pair");
const handoffCheck = await validateGenericHandoff(render);
let projectSha256 = null;
let contractSha256 = null;
let thumbnailContractValid = isJejuCanonical;
let thumbnailContractEvidence = isJejuCanonical ? finalThumbnailSha256 : null;
let technical;
if (projectArg && contractArg) {
  const projectPath = path.resolve(projectArg);
  const contractPath = path.resolve(contractArg);
  const [projectText, contractBytes, verifier] = await Promise.all([
    readFile(projectPath, "utf8"),
    readFile(contractPath),
    runCheck([path.join(automationRoot, "scripts", "verify-editorial-cartoon-project.mjs"), projectPath, contractPath]),
  ]);
  projectSha256 = sha256(projectText.replace(/\r\n/g, "\n"));
  contractSha256 = sha256(contractBytes);
  const selectedProject = JSON.parse(projectText.replace(/^\uFEFF/u, ""));
  const thumbnailContract = selectedProject.thumbnailContract;
  const thumbnailConfigPath = thumbnailContract?.renderer?.config ? path.resolve(path.dirname(projectPath), thumbnailContract.renderer.config) : null;
  const thumbnailReproducibility = thumbnailConfigPath
    ? await runCheck([path.join(automationRoot, "scripts", "generate-editorial-thumbnail.mjs"), "--config", thumbnailConfigPath, "--verify"])
    : { status: "failed", outputSha256: null, summary: "machine thumbnail contract/config is missing" };
  thumbnailContractValid = Boolean(
    thumbnailContract?.schema === "editorial-thumbnail-contract-v1"
    && thumbnailContract?.spokenCaptions === false
    && thumbnailContract?.headline?.required === true
    && thumbnailContract?.headline?.line1 === selectedProject.title?.line1
    && thumbnailContract?.headline?.line2 === selectedProject.title?.line2
    && thumbnailContract?.aiDisclosure?.required === true
    && thumbnailContract?.aiDisclosure?.text === selectedProject.scenes?.[0]?.label
    && thumbnailContract?.output?.sha256 === finalThumbnailSha256
    && selectedProject.thumbnail?.sha256 === finalThumbnailSha256
    && thumbnailReproducibility.status === "passed"
  );
  thumbnailContractEvidence = thumbnailContractValid ? { sha256: finalThumbnailSha256, layoutId: thumbnailContract.layoutId, reproducibility: thumbnailReproducibility.outputSha256 } : { sha256: finalThumbnailSha256, error: thumbnailReproducibility.summary ?? "thumbnail semantic contract mismatch" };
  const projectAuthority = path.relative(automationRoot, projectPath).replaceAll(path.sep, "/");
  const contractAuthority = path.relative(automationRoot, contractPath).replaceAll(path.sep, "/");
  const integrityMatches = handoffCheck.status === "passed"
    && projectSha256 === sourceIntegrity.projectConfigSha256
    && contractSha256 === sourceIntegrity.contractSha256
    && projectAuthority === sourceIntegrity.projectAuthority
    && contractAuthority === sourceIntegrity.contractAuthority;
  technical = verifier.status === "passed" && integrityMatches
    ? { status: "passed", outputSha256: sha256(`${verifier.outputSha256}:${handoffCheck.handoffSha256}:${projectSha256}:${contractSha256}`) }
    : { status: "failed", outputSha256: null, summary: verifier.status === "failed" ? verifier.summary : "selected project/contract path or hash does not match registry/handoff sourceIntegrity" };
} else if (isJejuCanonical) {
  const verifier = await runCheck([path.join(import.meta.dirname, "check-jeju-release.mjs"), "--version", render.versionId]);
  technical = verifier.status === "passed" && handoffCheck.status === "passed" ? verifier : { status: "failed", outputSha256: null, summary: verifier.summary ?? handoffCheck.summary };
} else {
  technical = handoffCheck;
}
const blockers = Array.isArray(render.releaseGate?.blockers) ? render.releaseGate.blockers : [];
const narration = render.narrationProvider ?? {};
const bgm = render.bgm ?? {};
const thumbnail = render.thumbnailOverride ?? {};
const approval = await readOptionalJson(approvalPath);
const legalDecision = await readOptionalJson(legalDecisionPath);
const renderRegistrySha256 = sha256(renderBytes);
const exactApprovalBinding = (candidate) => Boolean(candidate && candidate.schemaVersion === 2 && candidate.versionId === render.versionId && candidate.renderRegistrySha256 === renderRegistrySha256 && candidate.scriptSha256 === sourceIntegrity.scriptSha256 && candidate.renderSha256 === finalVideoSha256 && candidate.thumbnailSha256 === finalThumbnailSha256 && (candidate.handoffSha256 ?? null) === (handoffCheck.handoffSha256 ?? null));
const approvalValid = Boolean(exactApprovalBinding(approval) && typeof approval.reviewer === "string" && approval.reviewer.trim() && !Number.isNaN(Date.parse(approval.approvedAt)));
const blockerIds = blockers.map((blocker) => blocker.id).sort();
const decisionBlockerIds = Array.isArray(legalDecision?.blockerIds) ? [...legalDecision.blockerIds].sort() : [];
const legalDecisionValid = Boolean(exactApprovalBinding(legalDecision) && JSON.stringify(decisionBlockerIds) === JSON.stringify(blockerIds) && typeof legalDecision.reviewer === "string" && legalDecision.reviewer.trim() && typeof legalDecision.rationale === "string" && legalDecision.rationale.trim().length >= 20 && !Number.isNaN(Date.parse(legalDecision.approvedAt)));
// A project-native approval predates render artifacts and cannot safely bind a
// registry hash without a circular digest. Only external exact-file decisions
// can authorize release.
const nativeReleaseApproved = false;
const releaseApproved = nativeReleaseApproved || legalDecisionValid;
const legalReview = blockers.length === 0 ? { status: "passed", blocking: false, evidence: [], warnings: [] } : legalDecisionValid ? { status: "warning", blocking: false, evidence: blockerIds, warnings: blockers.map((blocker) => ({ ...blocker, severity: "warn", originalSeverity: blocker.severity ?? "block", resolution: legalDecision })) } : { status: "blocked", blocking: true, evidence: blockerIds, warnings: [] };
const narrationAccepted = ["approved-locked", "qwen3-tts", "edge-tts"].includes(narration.actualProvider) && narration.fallbackUsed === false && narration.speechAcceptance?.accepted === true && narration.speechAcceptance?.final?.accepted === true && (narration.actualProvider !== "edge-tts" || narration.speechAcceptance.final.dualAsr === true);
const sourceIntegrityBound = sourceIntegrity.status === "final"
  && /^[a-f0-9]{64}$/i.test(sourceIntegrity.scriptSha256 ?? "")
  && /^[a-f0-9]{64}$/i.test(sourceIntegrity.projectConfigSha256 ?? "")
  && (isJejuCanonical || (/^[a-f0-9]{64}$/i.test(sourceIntegrity.contractSha256 ?? "") && typeof sourceIntegrity.projectAuthority === "string" && typeof sourceIntegrity.contractAuthority === "string"));

const checks = [
  ["render-handoff-contract", "technical", isJejuCanonical ? "Canonical v17 regression and exact handoff contract" : "Reusable editorial-cartoon and exact handoff contract", technical.status, technical.outputSha256, true],
  ["release-gate", "release", "Release gate is approved or covered by an exact signed legal decision", releaseApproved ? "passed" : "failed", legalDecisionValid ? legalDecision : render.releaseGate, true],
  ["source-integrity", "source", "Final script, project and contract hashes are locked", sourceIntegrityBound ? "passed" : "failed", sourceIntegrity.scriptSha256 ?? null, true],
  ["narration-acceptance", "audio", "Approved narration and strict ASR checks", narrationAccepted ? "passed" : "failed", narration.approvedAudioSha256 ?? narration.postAcceptanceAudioSha256 ?? narration.speechAcceptance?.reports ?? null, true],
  ["caption-contract", "captions", "Caption text, timing and Korean semantic split contract", technical.status, `${sourceIntegrity.sourceCueCount ?? "unknown"} source cues`, true],
  ["render-contract", "video", "1080x1920 H.264 render and frame contract", render.resolution?.width === 1080 && render.resolution?.height === 1920 && render.fps === 30 && render.videoEncoding?.codec === "libx264" && Number.isInteger(render.frames) && render.frames > 0 ? "passed" : "failed", `${render.frames ?? "unknown"} frames`, true],
  ["bgm-contract", "audio", "BGM provenance, level and narration ducking", bgm.status === "ready" && typeof bgm.provenance === "string" && bgm.provenance.trim() && bgm.duckUnderNarration === true ? "passed" : "failed", `${bgm.volumeDb ?? "unknown"} dB`, true],
  ["thumbnail-contract", "visual", "Headline, event media and AI disclosure thumbnail without spoken captions", /^[a-f0-9]{64}$/i.test(thumbnail.sha256 ?? "") && thumbnail.sha256 === finalThumbnailSha256 && thumbnailContractValid ? "passed" : "failed", thumbnailContractEvidence, true],
  ["legal-rights-review", "legal", "Tiered factual, legal and media-rights review", legalReview.status, legalReview.evidence, legalReview.blocking],
  ["human-playback-approval", "human", "A reviewer watched the exact final file and approved release", approvalValid ? "passed" : "pending", approvalValid ? approval : null, true],
].map(([id, category, label, status, evidence, blocking]) => ({ id, category, label, blocking, status, evidence }));
const blockingChecks = checks.filter((check) => check.blocking && check.status !== "passed");
const report = { schemaVersion: 3, generatedAt: new Date().toISOString(), renderRegistryPath: renderPath, projectSlug: sourceIntegrity.slug ?? "unknown", versionId: render.versionId, renderRegistrySha256, renderSha256: finalVideoSha256, thumbnailSha256: finalThumbnailSha256, handoffSha256: handoffCheck.handoffSha256 ?? null, projectSha256, contractSha256, scriptSha256: sourceIntegrity.scriptSha256 ?? null, status: blockingChecks.length === 0 ? "approved" : "blocked", publishable: blockingChecks.length === 0, uploadBlocked: blockingChecks.length !== 0, checks, blockers: [...(legalReview.blocking ? blockers : []), ...(technical.status === "failed" ? [{ id: "render-handoff-contract-failed", stage: "07-quality-assurance", severity: "block", reason: technical.summary ?? "Render/handoff checker failed." }] : []), ...(approvalValid ? [] : [{ id: "human-playback-approval-required", stage: "07-quality-assurance", severity: "block", reason: "The exact final render has not been signed off by a human reviewer." }])], warnings: legalReview.warnings, approval: approvalValid ? approval : null };
await mkdir(path.dirname(reportPath), { recursive: true });
const temporaryReport = `${reportPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryReport, reportPath);
} finally {
  await fs.promises.rm(temporaryReport, { force: true }).catch(() => undefined);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
