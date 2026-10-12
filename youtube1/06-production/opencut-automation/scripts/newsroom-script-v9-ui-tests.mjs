import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../opencut-classic/apps/web/src/app/stories/[slug]/script/page.tsx", import.meta.url), "utf8");
const workbench = fs.readFileSync(new URL("../opencut-classic/apps/web/src/app/newsroom/[slug]/generic-pipeline-workbench.tsx", import.meta.url), "utf8");
const newsroomLib = fs.readFileSync(new URL("./newsroom-lib.mjs", import.meta.url), "utf8");
const guide = fs.readFileSync(new URL("../production/newsroom/youtube-shorts-script-guide.md", import.meta.url), "utf8");

assert.match(page, /GenericPipelineWorkbench slug=\{slug\} stageNumber="03"/u);
for (const token of ["newsroom-v9-entry-authority-v1", "newsroom-storyline-v2", "newsroom-semantic-cut-plan-v2"]) assert.ok(workbench.includes(token));
for (const token of ["newsroom-autonomous-narration-v8", "newsroom-autonomous-narration-v7", "newsroom-independent-narration-critique-v8", "newsroom-script-admission-rejection-v6", "prepare-scene-batch", "v21-narration-with-story-text"]) assert.ok(workbench.includes(token));
for (const token of ["prepare-flow-story-script", "Flow용 스토리 스크립트", "내레이션과 연결된 시각적 사건 전개", "draft-preview", "final-script-planning-only"]) assert.ok(workbench.includes(token));
assert.match(workbench, /aria-label="Flow용 스토리 스크립트" readOnly/u);
assert.match(workbench, /workflow\.flowStoryScript\.plainText/u);
assert.match(workbench, /한국어 대본과 별도 영어 storyText/u);
assert.match(workbench, /로마자 이름과 나이 또는 나이 범위, 일관된 복장/u);
assert.match(workbench, /대본\+영화 줄거리 generator 1회 \+ factual-legal critic 1회/u);
assert.doesNotMatch(workbench, /기존 카드형 스토리 다시 만들기/u);
assert.match(workbench, /critic은 사실·법률 안전만 pass·reject로 판정/u);
assert.match(workbench, /openingDisclosure:\s*"model-choice",\s*priorityClaimRefs:\s*\[\]/u);
assert.doesNotMatch(workbench, /aria-label="오프닝 공개 선호"/u);
assert.match(workbench, /record-draft-rejection/u);
assert.match(workbench, /기존 대본은 변경하지 않았습니다/u);
assert.match(workbench, /문장별 claim lineage와 critic hash가 결합돼\s*직접 편집할 수\s*없습니다/u);
assert.match(workbench, /critic은 대본을 고치거나 최종 권위를 만들지 않습니다/u);
assert.match(workbench, /장면 프롬프트 일괄 생성/u);
assert.match(workbench, /aria-label="생성된 장면 프롬프트"/u);
assert.match(workbench, /disabled[\s\S]{0,120}ref=\{fitTextareaToContent\}[\s\S]{0,120}readOnly/u);

for (const token of ["newsroom-autonomous-narration-prompt-v21", "newsroom-independent-narration-critic-prompt-v9", "schemaVersion: 21", "caseBrief", "retryCount: 0"]) assert.ok(newsroomLib.includes(token));
const generator = newsroomLib.slice(newsroomLib.indexOf("function codexDraftPrompt"), newsroomLib.indexOf("function codexCriticPrompt"));
assert.doesNotMatch(generator, /narrativeEngine|CURATED_STYLE_CORPUS|SCRIPT_GUIDE|hookAudit|narrativeArchitecture|retentionAudit|finalAuthority|disclosure|coda|훅/u);
assert.match(newsroomLib, /CRITIQUE_CATEGORIES = Object\.freeze\(\["factual-legal"\]\)/u);
assert.match(guide, /구성·문체·재미는 모델이 자율적으로 결정/u);
assert.match(guide, /대본을 수정하지 않는다/u);
assert.match(guide, /65\.0~80\.0초/u);

process.stdout.write("newsroom-script-v9-ui-tests passed\n");

