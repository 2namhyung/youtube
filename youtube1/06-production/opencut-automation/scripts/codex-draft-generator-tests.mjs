import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import {
  AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA,
  AUTONOMOUS_NARRATION_SCHEMA,
  CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA,
  CODEX_DRAFT_CRITIC_PROMPT_VERSION,
  CODEX_DRAFT_CURATED_CORPUS_PATH,
  CODEX_DRAFT_CURATED_CORPUS_SHA256,
  CODEX_DRAFT_GUIDE_PATH,
  CODEX_STYLE_ONLY_EXEMPLAR,
  CODEX_DRAFT_PROMPT_VERSION,
  CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA,
  CODEX_SCENE_PROMPT_BATCH_OUTPUT_SCHEMA,
  assertCodexStrictStructuredOutputSchema,
  buildDraftInputPackage,
  compileStorySynopsisPlainText,
  generateCodexDraftCandidates,
  hashJson,
  reviewAutonomousNarrationSurface,
  validateAutonomousNarrationOutput,
  validateIndependentNarrationCritique,
  validatePersistedAutonomousNarrationContract,
} from "./newsroom-lib.mjs";

const workflow = JSON.parse(await fsp.readFile(new URL("../production/newsroom/projects/research-657380fce7eaccc9.workflow.json", import.meta.url), "utf8"));
const research = JSON.parse(await fsp.readFile(new URL("../production/newsroom/projects/research-657380fce7eaccc9.research.json", import.meta.url), "utf8"));
const policyPackage = buildDraftInputPackage({ candidate: workflow.candidate, researchSnapshot: research, legalReport: workflow.legalContextReport, editorialDirection: "구체적 위험과 정보 순서로 흥미를 만든다" });
const claimIds = Object.values(policyPackage.caseHistory).flatMap((value) => Array.isArray(value) ? value : []).map((item) => item?.id).filter(Boolean);
assert.ok(claimIds.length >= 2);

assert.equal(AUTONOMOUS_NARRATION_SCHEMA, "newsroom-autonomous-narration-v8");
assert.equal(AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, "newsroom-independent-narration-critique-v8");
assert.equal(CODEX_DRAFT_PROMPT_VERSION, "newsroom-autonomous-narration-prompt-v35-flow-readable-story");
assert.equal(CODEX_DRAFT_CRITIC_PROMPT_VERSION, "newsroom-independent-narration-critic-prompt-v18-flow-readable-story");
assert.equal(policyPackage.schemaVersion, 21);
assert.equal(policyPackage.caseBrief.schema, "newsroom-stage03-case-brief-v1");
assert.equal(policyPackage.caseBrief.sha256, policyPackage.policyBinding.caseBriefSha256);
assert.deepEqual(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.required, ["schema", "narration", "sentences", "storyText"]);
assert.deepEqual(CODEX_SCENE_PROMPT_BATCH_OUTPUT_SCHEMA.required, ["schema", "scriptSha256", "narrationSha256", "storyScriptSha256", "totalEstimatedDurationSeconds", "cuts"]);
assert.equal(Object.hasOwn(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.properties, "narrativeEngine"), false);
assert.deepEqual(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.required, ["schema", "decision", "findings"]);
assert.equal(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties.findings.minItems, 1);
assert.equal(Object.hasOwn(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties, "finalAuthority"), false);
assert.equal(Object.hasOwn(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties, "hookAudit"), false);
assert.equal(Object.hasOwn(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties, "retentionAudit"), false);
assert.equal(assertCodexStrictStructuredOutputSchema(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA, "generator fixture"), true);
assert.equal(assertCodexStrictStructuredOutputSchema(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA, "critic fixture"), true);

const corpusBytes = await fsp.readFile(CODEX_DRAFT_CURATED_CORPUS_PATH);
assert.equal(createHash("sha256").update(corpusBytes).digest("hex"), CODEX_DRAFT_CURATED_CORPUS_SHA256);
const corpus = JSON.parse(corpusBytes.toString("utf8"));
assert.equal(corpus.schema, "newsroom-curated-short-narration-corpus-v2");
assert.equal(corpus.referenceUsePolicy.relationship, "mutually-exclusive-alternative-patterns");
assert.equal(corpus.approvedStyleReferences.length, 2);
assert.ok(corpus.approvedStyleReferences.every((item) => item.approvalBasis === "user-explicitly-liked-wording-in-conversation"));
assert.deepEqual(corpus.approvedStyleReferences.map((item) => item.alternativePattern), ["late-payoff-disclosure", "hook-disclosure"]);
assert.ok(corpus.antiPatterns.every((item) => item.approvalBasis === "rejected-machine-pattern-not-user-approved"));
assert.ok(corpus.antiPatterns.some((item) => item.id === "machine-blended-alternative-disclosures"));
assert.match(corpus.approvedStyleReferences[1].text, /다섯 살 딸을 태운 아버지가/u);

const guide = await fsp.readFile(CODEX_DRAFT_GUIDE_PATH, "utf8");

function rawAuthority(narration, narrativeEngine = "role-conflict", schema = AUTONOMOUS_NARRATION_SCHEMA) {
  const sentences = narration.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu).map((text, index) => ({ text: text.trim(), claimRefs: [claimIds[index % claimIds.length]] }));
  return { schema, ...(schema === "newsroom-autonomous-narration-v7" ? { modality: "action-scene", provisionalCuts: sentences.map((sentence, index) => ({ cutId: `cut-${String(index + 1).padStart(3, "0")}`, sentenceRefs: [index + 1], narrationText: `${index ? " " : ""}${sentence.text}`, semanticClass: index % 2 ? "information-motion" : "human-action", cameraActionKorean: "검토용 카메라와 행동을 설명한다.", videoPromptEnglish: "A restrained editorial motion shot with clear continuity.", risks: [], estimatedDurationSeconds: 2.5 })) } : schema === "newsroom-autonomous-narration-v5" ? { narrativeEngine } : schema === AUTONOMOUS_NARRATION_SCHEMA ? {} : { modality: "action-scene" }), narration, sentences, evidenceLineage: { schema: schema === "newsroom-autonomous-narration-v7" ? "newsroom-autonomous-narration-evidence-lineage-v7" : "newsroom-autonomous-narration-evidence-lineage-v8", packageSha256: policyPackage.policyBinding.packageSha256, eventDossierSha256: policyPackage.policyBinding.eventDossierSha256, legalReportSha256: policyPackage.policyBinding.legalReportSha256, caseBriefSha256: policyPackage.policyBinding.caseBriefSha256, usedClaimRefs: [...new Set(sentences.flatMap((sentence) => sentence.claimRefs))] } };
}

const narration = [
  "차가 출구를 막는 순간 운전자는 방향을 바꿀 곳을 잃었습니다.",
  "뒤차 운전자는 손에 든 물건을 창문 쪽으로 겨누며 가까이 다가왔습니다.",
  "피해 차량이 움직이자 뒤차도 곧바로 방향을 틀어 추격을 이어갔습니다.",
  "막힌 도로에서 속도가 떨어지자 뒤범퍼에는 두 차례 충격이 이어졌습니다.",
  "운전자는 다시 내려 창문을 두드리고 차에서 내리라고 소리쳤습니다.",
  "그 뒤에는 장갑을 끼고 뾰족한 도구로 타이어와 유리를 훼손한 혐의가 붙었습니다.",
  "차 안의 운전자와 십 대 자녀는 이 과정에서 가벼운 상처를 입었습니다.",
  "남성은 차선 변경을 보고 순간적으로 화가 났다는 취지로 경찰에 진술했습니다.",
  "경찰은 특수상해와 특수협박 혐의를 적용해 남성을 구속했습니다.",
  "추격이 계속된 시간은 약 팔 분이었고 두 차량 모두 멈출 틈을 찾기 어려웠습니다.",
  "마지막에 확인된 것은 남성의 차 안에도 어린 자녀가 타고 있었다는 사실이었습니다.",
  "처음 길을 막은 행동 뒤에는 추격과 충돌, 차량 훼손이 차례로 이어졌습니다.",
  "피해 운전자가 현장을 벗어나려 할수록 뒤차의 위협은 다른 방식으로 바뀌었습니다.",
  "경찰이 확인한 피해와 적용 혐의는 이 연속된 행동을 따라 정리됐습니다.",
  "가족이 탄 평범한 차량은 몇 분 사이 반복되는 충격과 훼손의 대상이 됐습니다.",
  "멈춘 뒤에도 위협이 끝나지 않았다는 점이 처음의 가로막기와 마지막 처분을 잇습니다.",
  "두 아이가 탄 차량 사이에서 시작된 위협은 가해 차량의 보호자 구속으로 끝났습니다.",
].join(" ");
const authorityRaw = rawAuthority(narration);
const authority = validateAutonomousNarrationOutput(authorityRaw, policyPackage);
assert.equal(Object.hasOwn(authority, "narrativeEngine"), false);
assert.equal(Object.hasOwn(authority, "provisionalCutPlan"), false);
const legacyRaw = rawAuthority(narration, "role-conflict", "newsroom-autonomous-narration-v7");
const gapPlan = structuredClone(legacyRaw);
gapPlan.provisionalCuts[1].narrationText = gapPlan.provisionalCuts[1].narrationText.trimStart();
assert.throws(() => validateAutonomousNarrationOutput(gapPlan, policyPackage), /Provisional cut/u);
const overlapPlan = structuredClone(legacyRaw);
overlapPlan.provisionalCuts[0].narrationText += overlapPlan.provisionalCuts[1].narrationText;
assert.throws(() => validateAutonomousNarrationOutput(overlapPlan, policyPackage), /Provisional cut/u);
assert.throws(() => validateAutonomousNarrationOutput({ ...authorityRaw, sentences: authorityRaw.sentences.map((sentence, index) => index ? sentence : { ...sentence, claimRefs: ["other-case"] }) }, policyPackage), /unknown claim/u);

const categories = ["factual-legal"];
const passCritic = { schema: AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, decision: "pass", findings: categories.map((category) => ({ category, status: "pass", detail: "현재 사건 근거와 낭독 전개를 통과합니다.", exactQuote: "" })) };
const storyText = "Mira is a woman in her early thirties wearing a long navy cardigan and beige trousers, beside Hana, her fourteen-year-old daughter in a short yellow hoodie and blue jeans. Mira owns a compact blue hatchback. Joon is a man in his late thirties wearing a broad charcoal jacket and black trousers, with Yuna, his five-year-old daughter in a red coat and gray leggings. Joon owns a white sedan. Joon's white sedan follows Mira's blue hatchback, sounds its horn, overtakes it, and blocks the road ahead.\n\nMira drives the blue hatchback away. Joon pursues Mira's blue hatchback in the white sedan for about eight minutes. Joon's white sedan strikes the blue hatchback's rear bumper twice in traffic. Police later detain Joon on the reported charges. Yuna has been inside Joon's white sedan during the incident.";
const critique = validateIndependentNarrationCritique(passCritic, policyPackage, authorityRaw);
assert.equal(critique.decision, "pass");
assert.equal(critique.authoritySha256, hashJson(authority));
assert.ok(critique.timing.estimatedSeconds >= 65 && critique.timing.estimatedSeconds <= 80);
assert.throws(() => validateIndependentNarrationCritique({ ...passCritic, finalAuthority: authorityRaw }, policyPackage, authorityRaw), /cannot return rewritten or final authority/u);

const sourceFirst = rawAuthority("경찰 조사에 따르면 사건은 위험했습니다. 발단은 차선 변경이었습니다. 누구나 되돌아보게 합니다.");
assert.deepEqual(reviewAutonomousNarrationSurface(sourceFirst).codes, ["opening-source-or-summary-frame", "opening-restart-frame", "stock-reflective-coda"]);
assert.equal(validateIndependentNarrationCritique(passCritic, policyPackage, sourceFirst).decision, "reject", "duration, not style, rejects a short draft");

const modelCalls = [];
const generated = await generateCodexDraftCandidates(policyPackage, {
  cliVersion: "codex-cli 1.0.0",
  scriptGuideText: guide,
  runCodexProcessImpl: async ({ argv, input }) => {
    modelCalls.push(input);
    const outputPath = argv[argv.indexOf("-o") + 1];
    await fsp.writeFile(outputPath, JSON.stringify(modelCalls.length === 1 ? { ...authorityRaw, storyText } : passCritic), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
});
assert.equal(modelCalls.length, 2);
assert.match(modelCalls[0], /한국어 65~80초 Shorts 대본 작가/u);
assert.match(modelCalls[0], /띄어쓰기와 문장부호를 포함한 일반 문자 수 640~670자/u);
assert.doesNotMatch(modelCalls[0], /provisionalCuts는 cut-001부터 순서대로/u);
assert.match(modelCalls[0], /공백 제외 Unicode 65\.0~80\.0초로 판정/u);
assert.match(modelCalls[0], /caseBrief만 사건 자료로 삼아/u);
assert.match(modelCalls[0], /근거 없는 사실/u);
assert.match(modelCalls[0], /사실의 시점·기간을 앞뒤 행동 전체로 늘리지 마세요/u);
assert.match(modelCalls[0], /<STYLE_REFERENCE>총으로 보이는 물건을 든 남성이 대낮 도심에서/u);
assert.match(modelCalls[0], /그런데 당시 남성의 차 안에는, 그의 다섯 살 딸도 타고 있었습니다\.<\/STYLE_REFERENCE>/u);
assert.match(modelCalls[0], /현재 사건에 복사하거나 근거로 사용하지 마세요/u);
assert.match(modelCalls[0], /A씨·B씨 대신 여성 운전자·남성 운전자·교사·동료/u);
assert.equal(modelCalls[0].includes(CODEX_STYLE_ONLY_EXEMPLAR), true);
assert.match(modelCalls[0], /<COFFEE>하지만 피해자의 커피잔에 남은 공포도 줄었을까요/u);
assert.match(modelCalls[0], /<JEJU>이게 드라마처럼/u);
assert.match(modelCalls[0], /공감·규범·질문 결말은 사실 claim과 구별하세요/u);
assert.match(modelCalls[0], /context anchor/u);
assert.match(modelCalls[0], /공백 제외 Unicode 문자 수는 약/u);
assert.match(modelCalls[0], /법적 제한/u);
assert.match(modelCalls[0], /"caseBrief"\s*:/u);
assert.doesNotMatch(modelCalls[0], /"currentCase"\s*:/u);
assert.doesNotMatch(modelCalls[0], /narrativeEngine|CURATED_STYLE_CORPUS|SCRIPT_GUIDE|hookAudit|narrativeArchitecture|retentionAudit|disclosure|coda|훅/u);
assert.doesNotMatch(modelCalls[0], /"allowedFacts"\s*:/u);
assert.match(modelCalls[0], /별도 필드 storyText/u);
assert.match(modelCalls[0], /영어 영화 줄거리 산문/u);
assert.match(modelCalls[0], /읽기 쉬운 로마자 이름/u);
assert.match(modelCalls[0], /나이 또는 나이 범위, 구체적인 복장/u);
assert.match(modelCalls[0], /각 인물이 처음 행동하기 전에 이름/u);
assert.match(modelCalls[0], /색과 외곽선이 다른/u);
assert.match(modelCalls[0], /반복 등장하는 차량마다 첫 움직임 전에/u);
assert.match(modelCalls[0], /Minseo drove Minseo's blue hatchback/u);
assert.match(modelCalls[0], /STYLE_REFERENCE와 caseBrief에는/u);
assert.match(modelCalls[0], /이 문구는 storyText의 사실 근거가 아니므로 반드시 무시/u);
assert.match(modelCalls[0], /최초 소개 뒤에는 owner 이름이나 이미 유일한/u);
assert.match(modelCalls[0], /하나의 주요 공간 이동이나 행동/u);
assert.match(modelCalls[0], /the same object, later identified by police as an imitation gun/u);
assert.match(modelCalls[0], /상대 날짜는 storyText만 읽어도 기준일이 분명할 때만/u);
assert.match(modelCalls[0], /자녀가 타고 있었다는 사실이 caseBrief에 있으면/u);
assert.match(modelCalls[0], /모순되지 않는 구체 나이 또는 나이 범위를 영상 인물 설정으로 정할 수 있습니다/u);
assert.match(modelCalls[0], /본문에는 "fictional alias", "visual setting", "composite character" 같은 제작용 메타 설명을 넣지 마세요/u);
assert.match(modelCalls[0], /narration과 sentence claim 근거에는 절대 넣지 마세요/u);
assert.match(modelCalls[0], /확인된 주체와 대상, 출발 위치 또는 직전 상태/u);
assert.match(modelCalls[0], /시작 차로·끝 차로·방향·거리처럼 자료가 확정하지 않은 세부는 생략/u);
assert.match(modelCalls[0], /"entered two lanes at once"나 "crossed two lanes"/u);
assert.match(modelCalls[1], /factual-legal finding 하나만/u);
assert.match(modelCalls[1], /재미·문체의 취향이나 흥행성은 평가하지 마세요/u);
assert.match(modelCalls[1], /문장별 claim 격리는 요구하지 않습니다/u);
assert.match(modelCalls[1], /<STORY_TEXT>/u);
assert.match(modelCalls[1], /반복 등장인물마다 첫 행동 전에 로마자 이름, 나이 또는 나이 범위/u);
assert.match(modelCalls[1], /반복 등장 차량도 첫 움직임 전에 소유자/u);
assert.match(modelCalls[1], /동어 반복이나 모든 문장에 전체 소유 차량명/u);
assert.match(modelCalls[1], /제3의 차량처럼 보이면 reject/u);
assert.match(modelCalls[1], /같은 물건의 용어가 근거 없이/u);
assert.match(modelCalls[1], /기준일이 불명확한 relative date/u);
assert.match(modelCalls[1], /사건의 의미 정확성과 영상 연속성 검사/u);
assert.match(modelCalls[1], /모순되지 않는 구체 나이 또는 나이 범위와 창작 복장을 설정할 수 있고/u);
assert.match(modelCalls[1], /"fictional alias", "visual setting", "composite character" 같은 제작용 메타 설명/u);
assert.match(modelCalls[1], /caseBrief에 없는 계급·대사·체포·수사 행동·판단/u);
assert.match(modelCalls[1], /사건의 의미 정확성과 영상 연속성 검사/u);
assert.match(modelCalls[1], /원자료가 시작 차로·끝 차로·거리·궤적을 확정하지 않으면/u);
assert.equal(generated.decision, "accept");
assert.equal(generated.generation.schemaVersion, 26);
assert.equal(generated.generation.callCount, 2);
assert.equal(generated.generation.retryCount, 0);
assert.equal(generated.generation.revisionApplied, false);
assert.equal(Object.hasOwn(generated.generation, "curatedCorpusSha256"), false);
assert.notEqual(generated.generation.initialOutputSha256, generated.generation.outputSha256);
assert.match(generated.flowStoryScript.storyText, /Mira/u);
assert.equal(compileStorySynopsisPlainText("서윤(영상용 가명)은 이동했다.\n\n민수(영상용 합성 인물)는 경찰을 대표했다."), "서윤은 이동했다.\n\n민수는 경찰을 대표했다.");
assert.doesNotMatch(generated.flowStoryScript.plainText, /영상용 가명|영상용 합성 인물/u);
assert.equal(generated.flowStoryScript.scriptSha256, generated.generation.outputSha256);
assert.equal(validatePersistedAutonomousNarrationContract({ packageInput: policyPackage, authority: generated.authority, generation: generated.generation }).generation.userEdited, false);
assert.equal(Object.hasOwn(generated.authority, "provisionalCutPlan"), false);
const legacyBase = { ...generated.generation };
delete legacyBase.storyScriptSha256;
const legacyV20Generation = { ...legacyBase, schemaVersion: 21, promptContractVersion: "newsroom-autonomous-narration-prompt-v20", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v9" };
assert.equal(validatePersistedAutonomousNarrationContract({ packageInput: policyPackage, authority: generated.authority, generation: legacyV20Generation }).generation.userEdited, false);
const legacyV19Generation = { ...legacyBase, schemaVersion: 21, promptContractVersion: "newsroom-autonomous-narration-prompt-v19", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v9" };
assert.equal(validatePersistedAutonomousNarrationContract({ packageInput: policyPackage, authority: generated.authority, generation: legacyV19Generation }).generation.userEdited, false);
const legacyV18Generation = { ...legacyBase, schemaVersion: 20, promptContractVersion: "newsroom-autonomous-narration-prompt-v18", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v8", curatedCorpusSha256: CODEX_DRAFT_CURATED_CORPUS_SHA256 };
assert.equal(validatePersistedAutonomousNarrationContract({ packageInput: policyPackage, authority: generated.authority, generation: legacyV18Generation }).generation.userEdited, false);

const rejected = await generateCodexDraftCandidates(policyPackage, {
  cliVersion: "codex-cli 1.0.0",
  scriptGuideText: guide,
  runCodexProcessImpl: async ({ argv }) => {
    const outputPath = argv[argv.indexOf("-o") + 1];
    await fsp.writeFile(outputPath, JSON.stringify(outputPath.includes("independent-critique") ? passCritic : { ...sourceFirst, storyText }), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
});
assert.equal(rejected.decision, "reject");
assert.equal(Object.hasOwn(rejected, "authority"), false);
assert.equal(rejected.attemptedAuthority.schema, AUTONOMOUS_NARRATION_SCHEMA);
assert.match(rejected.flowStoryScript.storyText, /Mira/u);
assert.equal(rejected.rejection.schema, "newsroom-script-admission-rejection-v6");
assert.equal(rejected.generation.retryCount, 0);
assert.notEqual(rejected.generation.initialOutputSha256, rejected.generation.outputSha256);

const legacyAuthority = validateAutonomousNarrationOutput(rawAuthority(narration, "role-conflict", "newsroom-autonomous-narration-v3"), policyPackage);
const legacyGeneration = { ...legacyBase, schemaVersion: 18, promptContractVersion: "newsroom-autonomous-narration-prompt-v15", criticPromptContractVersion: "newsroom-independent-narration-critic-prompt-v5", outputSha256: hashJson(legacyAuthority) };
assert.equal(validatePersistedAutonomousNarrationContract({ packageInput: policyPackage, authority: legacyAuthority, generation: legacyGeneration }).generation.schemaVersion, 18);

let calls = 0;
await assert.rejects(() => generateCodexDraftCandidates(policyPackage, {
  cliVersion: "codex-cli 1.0.0",
  scriptGuideText: guide,
  runCodexProcessImpl: async ({ argv }) => {
    calls += 1;
    await fsp.writeFile(argv[argv.indexOf("-o") + 1], JSON.stringify(calls === 1 ? { ...authorityRaw, storyText } : { ...passCritic, findings: [] }), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
}), /one-writer-plus-factual-critic/u);
assert.equal(calls, 2);

const roadWorkflow = JSON.parse(await fsp.readFile(new URL("../production/newsroom/projects/research-65b3c6b9444d9499.workflow.json", import.meta.url), "utf8"));
const roadResearch = JSON.parse(await fsp.readFile(new URL("../production/newsroom/projects/research-65b3c6b9444d9499.research.json", import.meta.url), "utf8"));
const roadPackage = buildDraftInputPackage({ candidate: roadWorkflow.candidate, researchSnapshot: roadResearch, legalReport: roadWorkflow.legalContextReport, editorialDirection: "오디오만으로 공간과 행동을 이해할 수 있게 쓰고, 서사 엔진과 정보 순서는 모델이 선택한다." });
const roadBrief = roadPackage.caseBrief;
assert.deepEqual(["suspect", "victim", "suspect-child", "victim-child"].map((id) => roadBrief.entities.some((entity) => entity.id === id)), [true, true, true, true]);
assert.ok(roadBrief.sourceGroups.length >= 3);
assert.ok(roadBrief.sourceGroups.some((source) => source.roleAliases.suspect === "A"));
assert.ok(roadBrief.sourceGroups.some((source) => source.roleAliases.suspect === "B"));
assert.ok(roadBrief.eventBeats.length >= 8 && roadBrief.eventBeats.length <= 10);
assert.ok(roadBrief.eventBeats.every((beat) => beat.claimRefs.length > 0));
assert.equal(new Set(roadBrief.coreFacts.map((fact) => fact.text.normalize("NFC").replace(/\s/gu, ""))).size, roadBrief.coreFacts.length);
assert.ok(roadBrief.legal.allowedClaims.some((claim) => /특수상해|특수협박/u.test(claim.text)));

console.log("Codex v21 ordinary-character length safety tests passed");
