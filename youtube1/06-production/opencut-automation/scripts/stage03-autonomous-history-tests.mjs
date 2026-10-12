import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDraftInputPackage, hashJson } from "./newsroom-lib.mjs";
import { STAGE03_GENERATION_ATTEMPTS_PER_SLUG, buildDraftPolicyPackage as buildCliDraftPolicyPackage, buildStage03RejectionPayload, buildStage03SavePayload, parseStage03Arguments, persistStage03RunArtifact, readDefaultEditorialDirectionFile, readEditorialDirectionFile, resolveEditorialDirectionForSlug } from "./stage03-save-drafts.mjs";
import { appendDraftHistory, validateDraftHistory } from "../opencut-classic/apps/web/src/newsroom/draft-history.ts";
import { buildDraftPolicyPackage as buildWebDraftPolicyPackage } from "../opencut-classic/apps/web/src/newsroom/legal-context.ts";

const slug = "research-657380fce7eaccc9";
const workflow = JSON.parse(await fsp.readFile(new URL(`../production/newsroom/projects/${slug}.workflow.json`, import.meta.url), "utf8"));
const research = JSON.parse(await fsp.readFile(new URL(`../production/newsroom/projects/${slug}.research.json`, import.meta.url), "utf8"));
const fixtureUrl = new URL("../production/newsroom/fixtures/editorial-direction-autonomous-fixture.txt", import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);

assert.deepEqual(parseStage03Arguments([slug, "--editorial-direction-file", fixturePath]), { slugs: [slug], editorialDirectionFile: fixturePath });
assert.throws(() => parseStage03Arguments([slug, "--editorial-direction-file"]), /requires exactly one path/u);
assert.throws(() => parseStage03Arguments([slug, "--direction", "text"]), /Unsupported Stage 03 option/u);

const editorialDirection = await readEditorialDirectionFile(fixturePath);
assert.equal(editorialDirection, await fsp.readFile(fixtureUrl, "utf8"), "the exact decoded UTF-8 value is retained for POST and PATCH");
await assert.rejects(() => readEditorialDirectionFile(fileURLToPath(new URL("../../../AGENTS.md", import.meta.url))), /inside the automation workspace/u);
const policeDirection = await readDefaultEditorialDirectionFile("research-65b3c6b9444d9499");
assert.equal(policeDirection, await fsp.readFile(new URL("../production/newsroom/editorial-directions/research-65b3c6b9444d9499.txt", import.meta.url), "utf8"), "the slug-specific default is loaded");
assert.match(policeDirection, /동승 사실만으로 아이가 보거나 지켜봤거나 들었거나 공포를 느꼈거나 상황을 인지했다고 추론하지 않으며/u, "child presence cannot become inferred observation or interiority");
assert.match(policeDirection, /중학생 딸이.*다섯 살 자녀가 타고 있었다는 확인 사실은 보호자·자녀 역할 충돌 후보로 선택할 수 있다/u, "only verified child occupancy may optionally support the role-conflict candidate");
assert.match(policeDirection, /특정 claim bundle을 첫 5초에 강제하지 않고, cold open·반전·coda도 의무화하지 않는다/u, "v16 direction does not force an opening bundle or narrative device");
assert.match(policeDirection, /역할 충돌을 사용한다면 반복하지 말고 서사상 payoff가 가장 큰 위치에 한 번만 둔다/u, "optional role conflict appears at most once where it earns payoff");
assert.equal(await readDefaultEditorialDirectionFile("research-0000000000000000"), undefined, "missing slug-specific direction falls back to the generic prompt");
const directionTestRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "stage03-direction-"));
const directionTestDirectory = path.join(directionTestRoot, "production", "newsroom", "editorial-directions");
await fsp.mkdir(directionTestDirectory, { recursive: true });
await fsp.writeFile(path.join(directionTestDirectory, "research-1111111111111111.txt"), Buffer.alloc(16_385, 0x61));
await assert.rejects(() => readDefaultEditorialDirectionFile("research-1111111111111111", { root: directionTestRoot }), /at most 16384 bytes/u, "oversized defaults fail closed");
await fsp.writeFile(path.join(directionTestDirectory, "research-2222222222222222.txt"), Buffer.from([0xc3, 0x28]));
await assert.rejects(() => readDefaultEditorialDirectionFile("research-2222222222222222", { root: directionTestRoot }), /valid UTF-8|encoded data/u, "invalid UTF-8 defaults fail closed");
try {
  await fsp.symlink(path.join(directionTestDirectory, "research-3333333333333333.txt"), path.join(directionTestDirectory, "research-5555555555555555.txt"));
  await assert.rejects(() => readDefaultEditorialDirectionFile("research-5555555555555555", { root: directionTestRoot }), /regular non-symlink/u, "symlink defaults fail closed");
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && ["EPERM", "EACCES"].includes(error.code))) throw error;
}
await fsp.writeFile(path.join(directionTestDirectory, "research-3333333333333333.txt"), "첫 사건 방향\n", "utf8");
await fsp.writeFile(path.join(directionTestDirectory, "research-4444444444444444.txt"), "둘째 사건 방향\n", "utf8");
const explicitOverridePath = path.join(directionTestDirectory, "override.txt");
await fsp.writeFile(explicitOverridePath, editorialDirection, "utf8");
assert.equal(await resolveEditorialDirectionForSlug({ slug: "research-3333333333333333", root: directionTestRoot }), "첫 사건 방향\n", "batch slug one uses its own default");
assert.equal(await resolveEditorialDirectionForSlug({ slug: "research-4444444444444444", root: directionTestRoot }), "둘째 사건 방향\n", "batch slug two uses its own default");
assert.equal(await resolveEditorialDirectionForSlug({ slug: "research-4444444444444444", editorialDirectionFile: explicitOverridePath, root: directionTestRoot }), editorialDirection, "explicit file overrides the per-slug default");
await fsp.rm(directionTestRoot, { recursive: true, force: true });

const cliPackage = buildCliDraftPolicyPackage({ candidate: workflow.candidate, researchSnapshot: research, legalReport: workflow.legalContextReport, editorialDirection });
const libraryPackage = buildDraftInputPackage({ candidate: workflow.candidate, researchSnapshot: research, legalReport: workflow.legalContextReport, editorialDirection });
const webPackage = buildWebDraftPolicyPackage({ candidate: workflow.candidate, researchSnapshot: research, legalReport: workflow.legalContextReport, editorialDirection });
assert.deepEqual(cliPackage, libraryPackage, "CLI uses the canonical library package without an ambient transformation");
assert.deepEqual(webPackage, libraryPackage, "web/API and CLI package construction must remain byte-for-byte canonical before serialization");
assert.equal(cliPackage.policyBinding.packageSha256, webPackage.policyBinding.packageSha256, "CLI and web/API package construction must hash the same editorial direction and hook guidance");
assert.equal(cliPackage.schemaVersion, 21, "CLI generation uses the active schema-v21 case-brief package");
assert.equal(cliPackage.caseBrief.sha256, cliPackage.policyBinding.caseBriefSha256, "case brief is hash-bound into the Stage 03 package");
assert.equal(cliPackage.generationGuidance.narrativeQuality.narrativeEngine, "choose-exactly-one-of-suspense-curiosity-reversal-role-conflict-evidence-reversal-escalating-action-or-numeric-contrast", "CLI and UI hash-bind one evidence-fit engine");
assert.equal(cliPackage.generationGuidance.narrativeQuality.entertainmentMechanics, "earn-interest-through-specific-stakes-information-order-escalation-contrast-and-evidence-backed-reversal-never-invention-or-exaggeration", "CLI and UI hash-bind evidence-safe entertainment mechanics");
assert.equal(cliPackage.generationGuidance.narrativeQuality.autonomousStructure, "the-model-controls-wording-rhythm-order-and-payoff-shape-without-fixed-five-second-claim-bundle-or-universal-beats", "CLI and UI do not force a universal hook or beat structure");
assert.equal(cliPackage.generationGuidance.editorialIntent.direction, editorialDirection.trim(), "legacy free text is normalized into explicit structured intent");
assert.equal(cliPackage.generationGuidance.editorialIntent.sha256, cliPackage.policyBinding.editorialIntentSha256, "editorial intent is independently hash-bound inside the package");

const defaultDirectionSlugs = [
  "research-0b5e8a6a5fd888df", "research-b7bd6a39023f5a83", "research-08fcabebc97e1b94",
  "research-387204d07b43afae", "research-d532c8fd7edb7d69", "research-1b6228cfdb86ef94",
  "research-ddab2f1aa396b1c5", "research-71c3c55c86a0cc54", "research-850236285c0d81ad",
];
for (const defaultSlug of defaultDirectionSlugs) {
  const defaultWorkflow = JSON.parse(await fsp.readFile(new URL(`../production/newsroom/projects/${defaultSlug}.workflow.json`, import.meta.url), "utf8"));
  const defaultResearch = JSON.parse(await fsp.readFile(new URL(`../production/newsroom/projects/${defaultSlug}.research.json`, import.meta.url), "utf8"));
  const defaultDirection = await readDefaultEditorialDirectionFile(defaultSlug);
  const conflictsWithV15 = /(?:(?:final\s*movement|마지막\s*문장|결말)[^.!?。！？\n]{0,180}(?:반드시|의무)|(?:반드시|의무)[^.!?。！？\n]{0,180}(?:감정|공감|self-projection|coda|마지막\s*문장)|70\s*[~～-]\s*80\s*초[^.!?。！？\n]{0,100}(?:목표로만|청취\s*목표로만|자문(?:용)?으로만))/iu.test(defaultDirection);
  if (conflictsWithV15) {
    assert.throws(() => buildDraftInputPackage({ candidate: defaultWorkflow.candidate, researchSnapshot: defaultResearch, legalReport: defaultWorkflow.legalContextReport, editorialDirection: defaultDirection }), /conflicts with the active Stage 03 contract/u, `${defaultSlug} conflicting legacy direction fails closed`);
  } else {
    const defaultPackage = buildDraftInputPackage({ candidate: defaultWorkflow.candidate, researchSnapshot: defaultResearch, legalReport: defaultWorkflow.legalContextReport, editorialDirection: defaultDirection });
    assert.equal(defaultPackage.generationGuidance.editorialIntent.direction, defaultDirection.trim(), `${defaultSlug} compatible legacy direction is normalized and hash-bound`);
  }
}
const missingReportDirection = await readDefaultEditorialDirectionFile("research-0b5e8a6a5fd888df");
assert.match(missingReportDirection, /아들이 경찰의 설명을 믿고 기다렸다고 기자회견에서 말한 사실은 그 발언의 귀속 범위에서만 사용할 수/u, "the family's reported waiting remains attributed");
assert.match(missingReportDirection, /가족 모두의 믿음·감정·기다림으로 일반화하거나 내레이션이 새로 대변하지 않는다/u, "the family interior cannot be generalized or newly represented");
assert.match(missingReportDirection, /기록·수색 절차·공적 신뢰의 보편적 의미에서만 모델이 자율 선택/u, "the coda is limited to abstract record/search/public-trust meaning");

const generated = { decision: "accept", generator: "generator", generation: { packageSha256: cliPackage.policyBinding.packageSha256 }, critique: { schema: "newsroom-independent-narration-critique-v8", decision: "pass" }, authority: { schema: "newsroom-autonomous-narration-v8" }, flowStoryScript: { schema: "newsroom-story-script-v1", storyText: "줄거리" }, policyBinding: cliPackage.policyBinding, editorialIntent: cliPackage.generationGuidance.editorialIntent };
const savePayload = buildStage03SavePayload({ generated, editorialDirection });
assert.equal(savePayload.editorialDirection, editorialDirection, "PATCH reuses the exact string sent to POST");
assert.equal(savePayload.planningMode, "v21-narration-with-story-text");
assert.equal(savePayload.editorialIntent.sha256, cliPackage.policyBinding.editorialIntentSha256);
assert.equal(savePayload.critique, generated.critique, "PATCH preserves the independent critique provenance");
assert.equal(STAGE03_GENERATION_ATTEMPTS_PER_SLUG, 1, "batch generation never retries a failed run");
const rejected = { decision: "reject", generation: { outputSha256: "d".repeat(64) }, critique: { schema: "newsroom-independent-narration-critique-v8", decision: "reject" }, attemptedAuthority: { schema: "newsroom-autonomous-narration-v8" }, flowStoryScript: { schema: "newsroom-story-script-v1", storyText: "줄거리" }, rejection: { schema: "newsroom-script-admission-rejection-v6" }, policyBinding: cliPackage.policyBinding, editorialIntent: cliPackage.generationGuidance.editorialIntent };
assert.equal(buildStage03RejectionPayload({ generated: rejected, editorialDirection }).action, "record-draft-rejection");
assert.throws(() => buildStage03SavePayload({ generated: rejected, editorialDirection }), /Only an accepted/u);

const exportRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "stage03-separated-export-"));
const exportPair = {
  ...rejected,
  generation: { ...rejected.generation, initialOutputSha256: "e".repeat(64) },
  attemptedAuthority: { schema: "newsroom-autonomous-narration-v8", narration: "첫 문장입니다. 둘째 문장입니다." },
  flowStoryScript: { schema: "newsroom-story-script-v1", scriptSha256: "f".repeat(64), narrationSha256: "a".repeat(64), storyText: "첫 상태에서 사건이 시작된다. 인물의 행동이 갈등을 키운다.\n\n확인된 결과로 사건이 마무리된다." },
};
const exported = await persistStage03RunArtifact({ slug, generated: exportPair, root: exportRoot });
assert.equal(await fsp.readFile(exported.narrationFile, "utf8"), "첫 문장입니다. 둘째 문장입니다.\n");
const separatedStory = await fsp.readFile(exported.storyScriptFile, "utf8");
assert.equal(separatedStory, "첫 상태에서 사건이 시작된다. 인물의 행동이 갈등을 키운다.\n\n확인된 결과로 사건이 마무리된다.\n");
assert.doesNotMatch(separatedStory, /첫 문장입니다|내레이션:/u);
const exportMetadata = JSON.parse(await fsp.readFile(exported.metadataFile, "utf8"));
assert.equal(exportMetadata.admissionStatus, "rejected-candidate-not-approved");
assert.equal(exportMetadata.outputs.length, 2);
await fsp.rm(exportRoot, { recursive: true, force: true });

const legacyDraft = { generator: "legacy-v4", sections: { hook: "이전 문장" }, variants: [{ id: "documentary", sections: { hook: "이전 문장" } }], selectedDraftId: null, policyBinding: { packageSha256: "a".repeat(64) } };
const approval = { headline: { approved: true, line1: "이전", line2: "제목" } };
const incomingDraft = { schema: "newsroom-autonomous-script-draft-v1", generator: "codex-cli", generation: { outputSha256: "b".repeat(64) }, authority: { schema: "newsroom-autonomous-narration-v1", narration: "새 대본" }, editorialDirection: null, policyBinding: { packageSha256: "c".repeat(64) } };
const firstHistory = appendDraftHistory({ current: { draft: legacyDraft, productionApproval: approval }, incomingDraft, archivedAt: "2026-09-04T00:00:00.000Z", hashJson });
assert.equal(firstHistory.length, 1);
assert.deepEqual(firstHistory[0].draftSnapshot, legacyDraft, "legacy draft is archived as an exact semantic object before replacement");
assert.equal(firstHistory[0].draftSnapshotSha256, hashJson(legacyDraft));
assert.deepEqual(firstHistory[0].productionApprovalSnapshot, approval);
assert.equal(firstHistory[0].productionApprovalSha256, hashJson(approval));

const replacement = { ...incomingDraft, authority: { ...incomingDraft.authority, narration: "다음 대본" } };
const secondHistory = appendDraftHistory({ current: { draft: { ...incomingDraft, history: firstHistory } }, incomingDraft: replacement, archivedAt: "2026-09-04T00:01:00.000Z", hashJson });
assert.equal(secondHistory.length, 2);
assert.deepEqual(secondHistory[0], firstHistory[0], "existing history entries are append-only");
assert.equal(secondHistory[1].draftSnapshotSha256, hashJson(incomingDraft));
assert.equal(appendDraftHistory({ current: { draft: { ...replacement, history: secondHistory } }, incomingDraft: replacement, archivedAt: "2026-09-04T00:02:00.000Z", hashJson }).length, 2, "an unchanged active revision is not duplicated");
assert.throws(() => validateDraftHistory({ value: [{ ...firstHistory[0], draftSnapshotSha256: "0".repeat(64) }], hashJson }), /snapshot hash/u);

const stageSource = await fsp.readFile(new URL("./stage03-save-drafts.mjs", import.meta.url), "utf8");
const postRouteSource = await fsp.readFile(new URL("../opencut-classic/apps/web/src/app/api/newsroom/route.ts", import.meta.url), "utf8");
const workflowRouteSource = await fsp.readFile(new URL("../opencut-classic/apps/web/src/app/api/newsroom/projects/[slug]/workflow/route.ts", import.meta.url), "utf8");
assert.match(stageSource, /postJson\(`\$\{baseUrl\}\/api\/newsroom`[\s\S]*editorialDirection/u, "CLI must use the same generation POST as the UI");
assert.match(stageSource, /sentenceCount: generated\.authority\.sentences\.length/u, "CLI summary must read the v2 sentence authority instead of removed beats");
assert.match(postRouteSource, /hasExplicitEditorialDirection\(body\)[\s\S]*readDefaultEditorialDirection[\s\S]*buildDraftPolicyPackage\(/u, "API draft generation resolves the slug-specific default server-side");
assert.match(workflowRouteSource, /hasExplicitEditorialDirection\(body\)[\s\S]*readDefaultEditorialDirection[\s\S]*buildDraftPolicyPackage\(/u, "workflow PATCH resolves the same slug-specific default");
assert.match(workflowRouteSource, /appendDraftHistory\(\{ current, incomingDraft: activeDraft, archivedAt: now, hashJson \}\)/u);
assert.match(workflowRouteSource, /current\.draftFinalized === true/u, "finalized drafts remain immutable");
assert.match(workflowRouteSource, /body\.planningMode !== "v21-narration-with-story-text"/u, "active writes use the narration plus storyText planning contract");
assert.match(workflowRouteSource, /draftRejectionHistory: \[\.\.\.existing, entry\]/u, "rejected runs append to a separate audit chain");

console.log("Stage03 editorial direction and append-only draft history tests passed");

