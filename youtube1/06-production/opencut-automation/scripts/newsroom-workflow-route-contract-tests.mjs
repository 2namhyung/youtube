import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../opencut-classic/apps/web/src/app/api/newsroom/projects/[slug]/workflow/route.ts", import.meta.url), "utf8");
for (const token of ["newsroom-storyline-v2", "newsroom-semantic-cut-plan-v2", "newsroom-color-storyboard-admission-v2", "paper-cut-grok-storyboard-v2"]) assert.ok(route.includes(token));
assert.match(route, /current\.draftFinalized === true[\s\S]*확정된 Stage 03 대본 권위는 덮어쓸 수 없습니다/u);
for (const token of ["newsroom-autonomous-narration-v8", "newsroom-autonomous-narration-v7", "newsroom-stage03-provisional-cut-plan-v1", "newsroom-independent-narration-critique-v8", "newsroom-script-admission-rejection-v6", "newsroom-script-rejection-audit-v12-story-text", "v21-narration-with-story-text", "newsroom-autonomous-script-draft-v12-story-text"]) assert.ok(route.includes(token), `route must carry ${token}`);
assert.match(route, /cleanStage03V16NarrationAuthority\(body\.authority, expectedPackage\)/u);
assert.match(route, /cleanStage03V19Generation\(body\.generation, expectedPackage, authority, flowStoryScript, "accept"\)/u);
assert.match(route, /cleanStage03V16Critique\(body\.critique, draftGeneration\.outputSha256, draftGeneration\.timing, "pass"\)/u);
assert.match(route, /ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION = "newsroom-autonomous-narration-prompt-v35-flow-readable-story"/u);
assert.match(route, /ACTIVE_AUTONOMOUS_CRITIC_PROMPT_VERSION = "newsroom-independent-narration-critic-prompt-v18-flow-readable-story"/u);
assert.match(route, /\(\?:\[가-힣\]\|\[A-Za-z\]\)/u);
assert.match(route, /ACTIVE_AUTONOMOUS_GENERATOR_PREFIX = `codex-cli:gpt-5\.6-sol:medium:\$\{ACTIVE_AUTONOMOUS_NARRATION_PROMPT_VERSION\}`/u);
assert.match(route, /schemaVersion !== 26[\s\S]*callCount\) !== 2/u);
assert.match(route, /startsWith\(ACTIVE_AUTONOMOUS_GENERATOR_PREFIX\)[\s\S]*대본과 storyText를 함께 반환/u);
assert.match(route, /CRITIQUE_CATEGORIES = \["factual-legal"\]/u);
assert.match(route, /const initialOutputSha256 = hashJson\(\{ authority, storyScript: storyCore \}\)/u);
assert.match(route, /const plainText = normalizedText\.replace\(\/\\\(\\s\*영상용/u);
assert.match(route, /value\.plainText !== normalizedText && value\.plainText !== plainText/u);
assert.match(route, /decision === "pass" && findings\[0\]\?\.status !== "pass"/u);
assert.match(route, /action === "record-draft-rejection"[\s\S]*previousEntrySha256[\s\S]*entrySha256: hashJson\(entryPayload\)/u);
assert.match(route, /attemptedAuthoritySha256 !== generation\.outputSha256/u);
assert.match(route, /attemptedPairSha256 !== expectedAttemptSha256/u);
assert.match(route, /timing\.estimatedSeconds < 65[\s\S]*timing\.estimatedSeconds > 80/u);
assert.match(route, /action === "prepare-scene-batch"[\s\S]*scriptSha256[\s\S]*narrationSha256[\s\S]*scene-prompts-generated-awaiting-semantic-cut-seal/u);
assert.match(route, /action === "prepare-flow-story-script"[\s\S]*newsroom-reviewed-script-flow-story-input-v1[\s\S]*hashJson\(latestWorkflow\) !== sourceWorkflowSha256/u);
for (const token of ["newsroom-flow-story-script-v1", "newsroom-flow-story-script-review-v1", "narrationFaithfulness", "sequenceContinuity", "storyScriptSha256"]) assert.ok(route.includes(token), `route must carry ${token}`);
assert.match(route, /flowStoryScript: undefined, sceneBatch: undefined/u);
assert.match(route, /pairedStoryValid[\s\S]*separatelyGeneratedStoryValid/u);
assert.match(route, /draftGeneration\?\.outputSha256 !== scriptSha256/u);
assert.match(route, /awaiting-owner-narration-locked-timing/u);
assert.match(route, /legalContextReport: undefined[\s\S]*videoDesignAuthorship: undefined[\s\S]*productionOrchestration: undefined/u);

process.stdout.write("newsroom-workflow-route-contract-tests passed\n");

