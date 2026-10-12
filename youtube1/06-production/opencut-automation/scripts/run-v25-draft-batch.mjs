import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDraftInputPackage, generateCodexDraftCandidates } from "./newsroom-lib.mjs";

const defaultSlugs = [
  "research-0b5e8a6a5fd888df",
  "research-ddab2f1aa396b1c5",
  "research-850236285c0d81ad",
  "research-08fcabebc97e1b94",
  "research-387204d07b43afae",
];
const slugs = process.env.NEWSROOM_V27_SLUGS ? process.env.NEWSROOM_V27_SLUGS.split(",").map((slug) => slug.trim()).filter(Boolean) : defaultSlugs;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "out", "newsroom", "draft-runs");
const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[-:.]/gu, "");
const results = [];
let nextIndex = 0;

async function generateOne(slug) {
  const workflow = JSON.parse(await fsp.readFile(path.join(root, "production", "newsroom", "projects", `${slug}.workflow.json`), "utf8"));
  const research = JSON.parse(await fsp.readFile(path.join(root, "production", "newsroom", "projects", `${slug}.research.json`), "utf8"));
  const baseEditorialDirection = await fsp.readFile(path.join(root, "production", "newsroom", "editorial-directions", `${slug}.txt`), "utf8");
  const correctiveDirection = {
    "research-0b5e8a6a5fd888df": "현재 진행 중인 경찰 전수조사는 대기발령 같은 완료된 조치와 분리해 현재형으로 유지하고, 조사 결과가 확정된 것처럼 쓰지 않는다.",
    "research-ddab2f1aa396b1c5": "단지가 커 절차가 복잡해졌다는 자료만 사용하고, 화물용 엘리베이터를 찾기 어렵다는 세부 관계는 쓰지 않는다.",
    "research-08fcabebc97e1b94": "영상의 공개·방송 소개 사실만 사용하고, 업주가 영상을 제출했다고 주체를 특정하지 않는다. 남성이 경찰에게도 말을 하며 난동을 이어갔다는 자료만 사용하며, 경찰이 출동한 뒤라는 시간 순서를 추가하지 않는다. 첫 문장에서 성별이 직접 확인되지 않으면 ‘손님’으로 쓰고, ‘남성 손님’이라고 쓸 때는 남성임을 직접 뒷받침하는 claim을 함께 연결한다.",
    "research-65b3c6b9444d9499": "첫 문장의 차량을 가로막은 사실에는 그 사실을 직접 뒷받침하는 claim을 연결하고, 결말은 추상적 훈계 대신 현재 사건의 확인된 차량·도로 상황에서 일상적 안전을 떠올리게 짧게 닫는다.",
  }[slug];
  const editorialDirection = correctiveDirection ? `${baseEditorialDirection}\n${correctiveDirection}` : baseEditorialDirection;
  const packageInput = buildDraftInputPackage({ candidate: workflow.candidate, researchSnapshot: research, legalReport: workflow.legalContextReport, editorialDirection });
  const started = Date.now();
  const generated = await generateCodexDraftCandidates(packageInput);
  const generatedAt = generated.generation?.generatedAt || new Date().toISOString();
  const fileStamp = generatedAt.replace(/[-:.]/gu, "");
  const directory = path.join(outputRoot, slug);
  const jsonPath = path.join(directory, `${fileStamp}-v8-cli-draft.json`);
  const wrapper = { schema: "newsroom-nonauthoritative-draft-run-v1", slug, generatedAt, elapsedMs: Date.now() - started, ...generated };
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(jsonPath, `${JSON.stringify(wrapper, null, 2)}\n`, "utf8");
  return { slug, jsonPath, wrapper };
}

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= slugs.length) return;
    try {
      results[index] = await generateOne(slugs[index]);
    } catch (error) {
      results[index] = { slug: slugs[index], error: error instanceof Error ? error.message : String(error) };
    }
  }
}

await Promise.all([worker(), worker()]);
const markdownPath = path.join(outputRoot, `v25-batch-${stamp}.md`);
const markdown = [
  `# v27 script-first batch (${startedAt})`,
  "",
  "각 사건은 현재 사건 package만 사용해 Codex CLI generator 1회와 독립 factual/legal critic 1회로 생성했습니다. 이 문서는 비권위 초안입니다.",
  "",
  ...results.map((result, index) => {
    if (result.error) return [`## ${index + 1}. ${result.slug}`, "", `- status: failed`, `- error: ${result.error}`, ""].join("\n");
    const { wrapper } = result;
    const timing = wrapper.generation?.timing || {};
    return [
      `## ${index + 1}. ${result.slug}`,
      "",
      `- decision: ${wrapper.decision}`,
      `- critic: ${wrapper.critique?.decision || "n/a"}`,
      `- generator: ${wrapper.generator || "n/a"}`,
      `- timing: ${timing.estimatedSeconds ?? "n/a"}s / compact ${timing.compactCharacters ?? "n/a"} chars / elapsed ${wrapper.elapsedMs}ms`,
      `- JSON: ${path.relative(root, result.jsonPath).replaceAll(path.sep, "/")}`,
      "",
      wrapper.authority?.narration || wrapper.rejection?.reasons?.map((item) => item.detail).join(" ") || "(no narration)",
      "",
    ].join("\n");
  }),
].join("\n");
await fsp.writeFile(markdownPath, markdown, "utf8");
process.stdout.write(`${JSON.stringify({ markdownPath, results: results.map(({ slug, jsonPath, wrapper, error }) => ({ slug, jsonPath, decision: wrapper?.decision, critic: wrapper?.critique?.decision, elapsedMs: wrapper?.elapsedMs, estimatedSeconds: wrapper?.generation?.timing?.estimatedSeconds, compactCharacters: wrapper?.generation?.timing?.compactCharacters, narration: wrapper?.authority?.narration, error })) }, null, 2)}\n`);
