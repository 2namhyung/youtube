import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, AUTONOMOUS_NARRATION_SCHEMA, CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA, CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA, DRAFT_VARIANT_PROFILES, SECTION_KEYS, assertCodexStrictStructuredOutputSchema } from "./newsroom-lib.mjs";

assert.equal(AUTONOMOUS_NARRATION_SCHEMA, "newsroom-autonomous-narration-v8");
assert.equal(AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA, "newsroom-independent-narration-critique-v8");
assert.deepEqual(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.required, ["schema", "narration", "sentences"]);
assert.deepEqual(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.properties.sentences.items.required, ["text", "claimRefs"]);
assert.equal(Object.hasOwn(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.properties.sentences.items.properties, "legalQualification"), false);
for (const removed of ["beats", "editorialDecision", "hook", "sceneCraft", "coda"]) assert.equal(Object.hasOwn(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA.properties, removed), false);
assert.equal(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties.findings.minItems, 1);
assert.equal(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties.findings.maxItems, 1);
const authoritySchema = JSON.parse(await fsp.readFile(new URL("../production/newsroom/newsroom-autonomous-narration-v8.schema.json", import.meta.url), "utf8"));
const critiqueSchema = JSON.parse(await fsp.readFile(new URL("../production/newsroom/newsroom-independent-narration-critique-v8.schema.json", import.meta.url), "utf8"));
const rejectionSchema = JSON.parse(await fsp.readFile(new URL("../production/newsroom/newsroom-script-admission-rejection-v6.schema.json", import.meta.url), "utf8"));
const rejectionAuditSchema = JSON.parse(await fsp.readFile(new URL("../production/newsroom/newsroom-script-rejection-audit-v9.schema.json", import.meta.url), "utf8"));
const cliSource = await fsp.readFile(new URL("./newsroom-cli.mjs", import.meta.url), "utf8");
assert.equal(authoritySchema.$id, AUTONOMOUS_NARRATION_SCHEMA);
assert.equal(critiqueSchema.$id, AUTONOMOUS_NARRATION_CRITIQUE_SCHEMA);
assert.equal(rejectionSchema.$id, "newsroom-script-admission-rejection-v6");
assert.equal(rejectionAuditSchema.$id, "newsroom-script-rejection-audit-v9");
assert.match(authoritySchema.description, /Script-only narration/u);
assert.match(critiqueSchema.description, /Read-only factual and legal safety/u);
assert.deepEqual(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.required, ["schema", "decision", "findings"]);
assert.deepEqual(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA.properties.decision.enum, ["pass", "reject"]);
assert.deepEqual(authoritySchema.required, ["schema", "narration", "sentences", "evidenceLineage"]);
assert.equal(assertCodexStrictStructuredOutputSchema(CODEX_SINGLE_DRAFT_OUTPUT_SCHEMA, "dynamic generator schema"), true);
assert.equal(assertCodexStrictStructuredOutputSchema(CODEX_DRAFT_CRITIQUE_OUTPUT_SCHEMA, "dynamic critic schema"), true);
assert.equal(assertCodexStrictStructuredOutputSchema(authoritySchema, "persisted narration schema"), true);
assert.equal(assertCodexStrictStructuredOutputSchema(critiqueSchema, "persisted critique schema"), true);
assert.equal(rejectionAuditSchema.properties.generation.properties.retryCount.const, 0);
assert.match(cliSource, /newsroom-autonomous-narration-v8"\]\.includes\(payload\?\.authority\?\.schema\) \? validatePersistedAutonomousNarrationContract/u);

// Legacy readers remain available; they are not active write contracts.
assert.deepEqual(SECTION_KEYS, ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"]);
assert.equal(DRAFT_VARIANT_PROFILES.length, 4);

console.log("Script creation contract tests passed");
