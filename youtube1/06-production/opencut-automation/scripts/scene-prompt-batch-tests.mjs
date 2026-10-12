import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import { CODEX_SCENE_PROMPT_BATCH_OUTPUT_SCHEMA, generateCodexScenePromptBatch, hashJson } from "./newsroom-lib.mjs";

const sentences = Array.from({ length: 26 }, (_, index) => ({ text: `차량의 검증된 행동 ${index + 1}이 이어졌습니다.`, claimRefs: [`claim-${(index % 2) + 1}`] }));
const authority = {
  schema: "newsroom-autonomous-narration-v8",
  narration: sentences.map((sentence) => sentence.text).join(" "),
  sentences,
};
const scriptSha256 = hashJson(authority);
const narrationSha256 = createHash("sha256").update(authority.narration).digest("hex");
const storyScript = { schema: "newsroom-flow-story-script-v1", scriptSha256, narrationSha256, units: authority.sentences.map((sentence, index) => ({ storyUnitId: `story-${String(index + 1).padStart(3, "0")}`, sentenceRef: index + 1, narrationText: sentence.text, claimRefs: sentence.claimRefs, visualSetup: `검증된 시작 상태 ${index + 1}`, visibleAction: `검증된 행동 ${index + 1}`, visibleResult: `검증된 결과 ${index + 1}`, continuityToNext: index === authority.sentences.length - 1 ? "사건의 확인된 끝 상태" : `다음 행동 ${index + 2} 직전 상태` })) };
const storyScriptSha256 = hashJson(storyScript);
const approval = { schema: "newsroom-approved-script-scene-prompt-input-v1", approved: true, scriptSha256, narrationSha256, authoritySha256: scriptSha256, storyScriptSha256 };
const modelOutput = { schema: "newsroom-script-scene-batch-v1", scriptSha256, narrationSha256, storyScriptSha256, totalEstimatedDurationSeconds: 65, cuts: authority.sentences.map((sentence, index) => ({ cutId: `cut-${String(index + 1).padStart(3, "0")}`, sentenceRefs: [index + 1], narrationText: `${index ? " " : ""}${sentence.text}`, semanticClass: index ? "information-motion" : "human-action", cameraActionKorean: "차량의 이동을 낮은 앵글로 따라간다.", videoPromptEnglish: "Restrained editorial motion, clear continuity, no readable text.", risks: [], estimatedDurationSeconds: 2.5 })) };
assert.equal(CODEX_SCENE_PROMPT_BATCH_OUTPUT_SCHEMA.properties.cuts.items.required.length, 8);
await assert.rejects(() => generateCodexScenePromptBatch({ authority, approval }), /65-80 second narration target/u);
let calls = 0;
const generated = await generateCodexScenePromptBatch({ authority, storyScript, approval, targetDurationSeconds: 65 }, {
  cliVersion: "codex-cli 1.0.0",
  runCodexProcessImpl: async ({ argv }) => {
    calls += 1;
    await fsp.writeFile(argv[argv.indexOf("-o") + 1], JSON.stringify(modelOutput), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
});
assert.equal(calls, 1);
assert.equal(generated.batch.schema, "newsroom-script-scene-batch-v1");
assert.equal(generated.batch.cuts.length, 26);
assert.equal(generated.generation.outputSha256, hashJson(generated.batch));
await assert.rejects(() => generateCodexScenePromptBatch({ authority, storyScript, targetDurationSeconds: 65, approval: { ...approval, scriptSha256: "0".repeat(64) } }, { cliVersion: "codex-cli 1.0.0" }), /approved script binding/u);

const longSegments = Array.from({ length: 26 }, (_, index) => `확인된 행동${index + 1}${index === 25 ? "이 이어졌습니다." : ""}`);
const longAuthority = { schema: "newsroom-autonomous-narration-v8", narration: longSegments.join(" "), sentences: [{ text: longSegments.join(" "), claimRefs: ["claim-1"] }] };
const longScriptSha256 = hashJson(longAuthority);
const longNarrationSha256 = createHash("sha256").update(longAuthority.narration).digest("hex");
const longStory = { schema: "newsroom-flow-story-script-v1", scriptSha256: longScriptSha256, narrationSha256: longNarrationSha256, units: [{ storyUnitId: "story-001", sentenceRef: 1, narrationText: longAuthority.sentences[0].text, claimRefs: ["claim-1"], visualSetup: "검증된 시작 상태", visibleAction: "검증된 연속 행동", visibleResult: "검증된 끝 상태", continuityToNext: "사건의 끝" }] };
const longStorySha256 = hashJson(longStory);
const longApproval = { schema: "newsroom-approved-script-scene-prompt-input-v1", approved: true, scriptSha256: longScriptSha256, narrationSha256: longNarrationSha256, authoritySha256: longScriptSha256, storyScriptSha256: longStorySha256 };
const longOutput = { schema: "newsroom-script-scene-batch-v1", scriptSha256: longScriptSha256, narrationSha256: longNarrationSha256, storyScriptSha256: longStorySha256, totalEstimatedDurationSeconds: 65, cuts: longSegments.map((segment, index) => ({ cutId: `cut-${String(index + 1).padStart(3, "0")}`, sentenceRefs: [1], narrationText: `${index ? " " : ""}${segment}`, semanticClass: "information-motion", cameraActionKorean: "검증된 행동의 변화를 따라간다.", videoPromptEnglish: "Restrained editorial motion with clear continuity and no readable text.", risks: [], estimatedDurationSeconds: 2.5 })) };
const longGenerated = await generateCodexScenePromptBatch({ authority: longAuthority, storyScript: longStory, approval: longApproval, targetDurationSeconds: 65 }, {
  cliVersion: "codex-cli 1.0.0",
  runCodexProcessImpl: async ({ argv }) => {
    await fsp.writeFile(argv[argv.indexOf("-o") + 1], JSON.stringify(longOutput), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
});
assert.equal(longGenerated.batch.cuts.length, 26, "one long narration sentence may split into ordered scene subspans");
const undercovered = { ...longOutput, totalEstimatedDurationSeconds: 62.4, cuts: longOutput.cuts.map((cut) => ({ ...cut, estimatedDurationSeconds: 2.4 })) };
await assert.rejects(() => generateCodexScenePromptBatch({ authority: longAuthority, storyScript: longStory, approval: longApproval, targetDurationSeconds: 65 }, {
  cliVersion: "codex-cli 1.0.0",
  runCodexProcessImpl: async ({ argv }) => {
    await fsp.writeFile(argv[argv.indexOf("-o") + 1], JSON.stringify(undercovered), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
}), /does not cover the active 65-80 second narration target/u);
console.log("Scene prompt batch contract tests passed");
