import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  CODEX_FLOW_STORY_SCRIPT_OUTPUT_SCHEMA,
  CODEX_FLOW_STORY_SCRIPT_REVIEW_SCHEMA,
  compileFlowStoryScriptText,
  generateCodexFlowStoryScript,
  hashJson,
} from "./newsroom-lib.mjs";

const authority = {
  schema: "newsroom-autonomous-narration-v8",
  narration: "차량이 큰길에 합류했습니다. 뒤따르던 차량이 앞으로 이동했습니다.",
  sentences: [
    { text: "차량이 큰길에 합류했습니다.", claimRefs: ["claim-join"] },
    { text: "뒤따르던 차량이 앞으로 이동했습니다.", claimRefs: ["claim-move"] },
  ],
};
const scriptSha256 = hashJson(authority);
const narrationSha256 = createHash("sha256").update(authority.narration).digest("hex");
const binding = { schema: "newsroom-reviewed-script-flow-story-input-v1", reviewRequested: true, scriptSha256, narrationSha256 };
const storyOutput = {
  schema: "newsroom-flow-story-script-v1",
  scriptSha256,
  narrationSha256,
  units: [
    { storyUnitId: "story-001", sentenceRef: 1, narrationText: authority.sentences[0].text, claimRefs: ["claim-join"], visualSetup: "차량이 큰길 입구에 놓여 있다.", visibleAction: "차량이 큰길 방향으로 합류한다.", visibleResult: "차량이 큰길 흐름 안에 들어온다.", continuityToNext: "뒤 차량이 같은 진행 방향에 남는다." },
    { storyUnitId: "story-002", sentenceRef: 2, narrationText: authority.sentences[1].text, claimRefs: ["claim-move"], visualSetup: "뒤 차량이 같은 방향에서 보인다.", visibleAction: "뒤 차량이 앞쪽으로 이동한다.", visibleResult: "두 차량의 앞뒤 관계가 달라진다.", continuityToNext: "확인된 이동 결과에서 장면을 닫는다." },
  ],
};
const passingReview = { schema: "newsroom-flow-story-script-review-v1", decision: "pass", narrationFaithfulness: "pass", sequenceContinuity: "pass", detail: "원문과 순서를 유지한 시각 전개입니다." };

assert.deepEqual(Object.keys(CODEX_FLOW_STORY_SCRIPT_OUTPUT_SCHEMA.properties).sort(), CODEX_FLOW_STORY_SCRIPT_OUTPUT_SCHEMA.required.slice().sort());
assert.deepEqual(Object.keys(CODEX_FLOW_STORY_SCRIPT_REVIEW_SCHEMA.properties).sort(), CODEX_FLOW_STORY_SCRIPT_REVIEW_SCHEMA.required.slice().sort());

let calls = 0;
const generated = await generateCodexFlowStoryScript({ authority, binding }, {
  cliVersion: "codex-cli 1.0.0",
  runCodexProcessImpl: async ({ argv }) => {
    calls += 1;
    const output = argv[argv.indexOf("-o") + 1];
    await fsp.writeFile(output, JSON.stringify(output.endsWith("story-script-review.json") ? passingReview : storyOutput), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
});
assert.equal(calls, 2);
assert.equal(generated.storyScript.units.length, authority.sentences.length);
assert.equal(generated.review.narrationFaithfulness, "pass");
assert.equal(generated.generation.callCount, 2);
assert.equal(generated.generation.retryCount, 0);
assert.equal(generated.generation.outputSha256, hashJson(storyOutput));
assert.equal(generated.storyScript.plainText, compileFlowStoryScriptText(storyOutput));
assert.match(generated.storyScript.plainText, /시작 상태:[\s\S]*보이는 전개:[\s\S]*보이는 결과:[\s\S]*다음 연결:/u);
assert.match(generated.storyScript.plainText, /\[story-001 \| sentenceRef 1\]/u);
assert.doesNotMatch(generated.storyScript.plainText, /내레이션:/u);
assert.doesNotMatch(generated.storyScript.plainText, /cut-|[0-9]+\.[0-9]+초/u);

await assert.rejects(() => generateCodexFlowStoryScript({ authority, binding: { ...binding, scriptSha256: "0".repeat(64) } }, { cliVersion: "codex-cli 1.0.0" }), /Exact reviewed narration binding/u);

for (const invalid of [
  { ...storyOutput, units: [...storyOutput.units].reverse() },
  { ...storyOutput, units: storyOutput.units.map((unit, index) => index ? unit : { ...unit, claimRefs: ["claim-other"] }) },
  { ...storyOutput, units: storyOutput.units.slice(0, 1) },
]) {
  await assert.rejects(() => generateCodexFlowStoryScript({ authority, binding }, {
    cliVersion: "codex-cli 1.0.0",
    runCodexProcessImpl: async ({ argv }) => {
      await fsp.writeFile(argv[argv.indexOf("-o") + 1], JSON.stringify(invalid), "utf8");
      return { code: 0, stdout: "", stderr: "" };
    },
  }), /exact current narration|stale or reordered sentence lineage/u);
}

await assert.rejects(() => generateCodexFlowStoryScript({ authority, binding }, {
  cliVersion: "codex-cli 1.0.0",
  runCodexProcessImpl: async ({ argv }) => {
    const output = argv[argv.indexOf("-o") + 1];
    const rejected = { ...passingReview, decision: "reject", narrationFaithfulness: "reject", detail: "원문에 없는 결과가 추가되었습니다." };
    await fsp.writeFile(output, JSON.stringify(output.endsWith("story-script-review.json") ? rejected : storyOutput), "utf8");
    return { code: 0, stdout: "", stderr: "" };
  },
}), /review rejected/u);

console.log("Flow story script contract tests passed");
