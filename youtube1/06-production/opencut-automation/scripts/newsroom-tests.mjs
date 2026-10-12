#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  AUTOMATION_ROOT,
  JOBS_ROOT,
  MAX_REMOTE_IMAGE_BYTES,
  RESEARCH_ARTICLE_POOL_LIMIT,
  RESEARCH_DAILY_ARTICLE_LIMIT,
  RESEARCH_SEMANTIC_CANDIDATE_LIMIT,
  allowedCandidate,
  assertContained,
  assertPublicRemoteUrl,
  buildNewsroomProjectConfig,
  buildDraftInputPackage,
  hashJson,
  clusterStoryCandidates,
  deduplicateResearchEvaluations,
  analyzeResearch,
  enrichResearchCandidate,
  enrichResearchShortlist,
  mergeIncrementalResearchAnalysis,
  refreshResearch,
  retryFailedResearchAnalysis,
  downloadApprovedImages,
  extractImageCandidates,
  fetchCandidates,
  investigationQueries,
  isSafeId,
  parseRss,
  parseCsvRows,
  parseResearchCollectionStats,
  loadResearchRadar,
  loadResearchArticlePool,
  loadResearchDossiers,
  loadResearchFeedback,
  loadResearchSemanticSelection,
  loadMediaState,
  materializeMediaState,
  promoteResearchCandidate,
  rejectResearchCandidate,
  researchFeedbackMatches,
  reconcileResearchSemanticSelection,
  runRenderJob,
  scoreCandidate,
  splitTitle,
  unresolvedSections,
  validateDraft,
} from "./newsroom-lib.mjs";
import { REFERENCE_CAPTION_PRESET, validateProject } from "./production-lib.mjs";
import { buildEventDossier } from "./event-dossier.mjs";

const fixturePath = path.join(AUTOMATION_ROOT, "production", "newsroom", "fixtures", "sample-feed.xml");
const fixture = await fsp.readFile(fixturePath, "utf8");
const now = new Date("2026-07-24T08:00:00.000Z");
const parsed = parseRss(fixture, { adapterId: "fixture", adapterLabel: "Fixture" });
assert.equal(parsed.length, 4);
assert.deepEqual(Object.keys(parsed[0]).sort(), ["adapterId", "publishedAt", "source", "title", "url"]);
assert.doesNotMatch(JSON.stringify(parsed), /본문 설명|저장 금지/);
assert.equal(parsed[0].url, "https://example.test/news/safe-school-route");
const rssWithImage = parseRss(`<rss><channel><item><title>RSS 사진</title><link>https://example.test/rss-photo</link><pubDate>Fri, 24 Jul 2026 08:00:00 GMT</pubDate><media:content url="https://cdn.example.test/rss.jpg" type="image/jpeg" /></item></channel></rss>`, { adapterId: "fixture" });
assert.equal(rssWithImage[0].mediaCandidates[0].url, "https://cdn.example.test/rss.jpg");
const csvFixture = "score,source,title,url,published_at,matched_keywords\n4,Desk,\"Quoted, headline\",https://example.test/csv,2026-07-24T08:00:00+09:00,frustration:test\n";
assert.equal(parseCsvRows(csvFixture)[0].title, "Quoted, headline");
const radarFixture = await loadResearchRadar({ csvText: csvFixture });
assert.equal(radarFixture.metadata.connected, true);
assert.equal(radarFixture.metadata.rowCount, 1);
assert.equal(radarFixture.items[0].adapterId, "local-research-radar");
assert.deepEqual(parseResearchCollectionStats("수집 213건 / 중복 제거 후 201건 / 후보 12건"), { collected: 213, deduplicated: 201, candidates: 12 });
assert.deepEqual(parseResearchCollectionStats("수집 213건 / 중복 제거 후 201건 / 전체 풀 199건 / 후보 12건"), { collected: 213, deduplicated: 201, pool: 199, candidates: 12 });
assert.equal(parseResearchCollectionStats("collector output unavailable"), null);
assert.deepEqual(parseResearchCollectionStats('NEWS_RADAR_STATS {"collected":8,"deduplicated":7,"pool":6,"candidates":2}'), { collected: 8, deduplicated: 7, pool: 6, candidates: 2 });
assert.deepEqual(parseResearchCollectionStats('NEWS_RADAR_STATS {"collected":8,"deduplicated":7,"pool":9,"candidates":2,"current_collected":8,"current_snapshot":7,"rolling_eligible":11,"rolling_pool":9,"rolling_window_days":30}'), { collected: 8, deduplicated: 7, pool: 9, candidates: 2, current_collected: 8, current_snapshot: 7, rolling_eligible: 11, rolling_pool: 9, rolling_window_days: 30 });
assert.equal(parseResearchCollectionStats('NEWS_RADAR_STATS {"collected":18,"deduplicated":17,"pool":9,"candidates":2,"historical_discovered":10,"historical_fetched":10,"historical_saved":9,"archive":{"totalArchiveCount":99}}').historical_saved, 9);
const localRanked = await fetchCandidates({ adapterIds: ["local-research-radar"], researchRadar: { csvText: csvFixture }, now });
assert.equal(localRanked.researchRadar.source, "01-research/news_radar/data/latest_candidates.csv");
assert.equal(localRanked.candidates.length, 1);
const storyFixture = [
  { title: "제주 초등학교 교실에 외부인 침입", source: "Desk A", url: "https://example.test/a", publishedAt: "2026-07-24T07:00:00.000Z" },
  { title: "초등학교 교실 침입에 학부모 불안", source: "Desk B", url: "https://example.test/b", publishedAt: "2026-07-24T06:00:00.000Z" },
  { title: "여름 축제 일정 다음 달 공개", source: "Desk C", url: "https://example.test/c", publishedAt: "2026-07-24T05:00:00.000Z" },
];
const storyCandidates = clusterStoryCandidates(storyFixture, { now });
assert.equal(storyCandidates.length, 2, "unrelated headlines must not be over-merged");
const groupedStory = storyCandidates.find((story) => story.articleCount === 2);
assert.ok(groupedStory, "similar titles should form one story cluster");
assert.equal(groupedStory.sourceCount, 2);
assert.match(groupedStory.id, /^story-[a-f0-9]{16}$/);
assert.equal(groupedStory.articles.length, 2);
assert.ok(groupedStory.shortsScore >= 0 && groupedStory.shortsScore <= 100);
assert.ok(Array.isArray(groupedStory.reasons));
const singleStory = storyCandidates.find((story) => story.articleCount === 1);
assert.ok(singleStory, "single article must remain visible as a candidate");
const semanticIncidentFixture = [
  { title: "'절단 다리' 재활용품으로 버린 인천 요양병원 관계자 불구속 송치", source: "Desk A", url: "https://example.test/leg-a", publishedAt: "2026-08-03T08:00:00.000Z", shortsScore: 88, selectionReasons: ["일상 공간"], factCheckRisks: ["송치 혐의 확인"], visualAngles: ["병원 외경"] },
  { title: "'절단 환자 다리' 잘못 배출한 인천 요양병원…관계자 3명 송치", source: "Desk B", url: "https://example.test/leg-b", publishedAt: "2026-08-03T07:00:00.000Z", shortsScore: 91, selectionReasons: ["황당한 폐기"], factCheckRisks: ["병원 해명 확인"], visualAngles: ["폐기물 분리 그래픽"] },
  { title: "도로 위 우산에 차량 하부 파손…누구 책임인가", source: "Desk C", url: "https://example.test/umbrella", publishedAt: "2026-08-03T06:00:00.000Z", shortsScore: 77, selectionReasons: ["생활 위험"], factCheckRisks: [], visualAngles: [] },
];
const deduplicatedSemantic = deduplicateResearchEvaluations(semanticIncidentFixture);
assert.equal(deduplicatedSemantic.length, 2, "same incident coverage must collapse into one semantic candidate");
assert.equal(deduplicatedSemantic[0].url, "https://example.test/leg-b", "highest-scoring article must represent the incident");
assert.equal(deduplicatedSemantic[0].articleCount, 2);
assert.equal(deduplicatedSemantic[0].sourceCount, 2);
assert.deepEqual(deduplicatedSemantic[0].relatedCoverage.map((item) => item.url), ["https://example.test/leg-a"]);
assert.deepEqual(deduplicatedSemantic[0].selectionReasons, ["황당한 폐기", "일상 공간"]);
assert.equal(deduplicatedSemantic[1].articleCount, 1, "unrelated candidate must remain independent");
const broadPool = await loadResearchArticlePool({ data: { metadata_only: true, bounded_limit: 500, articles: [
  { article_id: "a", title: "경적 뒤 권총 위협", source: "Desk A", url: "https://example.test/a", published_at: "2026-07-24T07:00:00.000Z", deterministic_score: 0 },
] } });
assert.equal(broadPool.metadata.metadataOnly, true);
assert.equal(broadPool.metadata.version, 1, "legacy v1 pools remain readable");
assert.equal(broadPool.items[0].deterministicScore, 0, "semantic pool must retain deterministic misses");
const richPool = await loadResearchArticlePool({ now: "2026-07-27T12:00:00.000Z", data: { version: 2, generated_at: "2026-07-27T10:00:00.000Z", stale_after_hours: 6, rolling_window_days: 30, content_scope: "publisher-feed-and-sitemap-metadata-with-bounded-excerpt", excerpt_max_chars: 600, archive: { totalArchiveCount: 1800, historicalArchiveCount: 1200, sourceCount: 2, historicalOldestPublishedAt: "2026-06-28T00:00:00+09:00", historicalNewestPublishedAt: "2026-07-27T09:00:00+09:00", actualCoveredDayRange: 30 }, articles: [
  { article_id: "rich", title: "Classroom incident", source: "Desk", url: "https://example.test/rich", published_at: "2026-07-27T09:00:00.000Z", feed_excerpt: "Sanitized feed context", excerpt_provenance: "rss-description-or-atom-summary" },
] } });
assert.equal(richPool.metadata.stale, false);
assert.equal(richPool.metadata.fullBodiesIncluded, false);
assert.equal(richPool.metadata.rollingWindowDays, 30);
assert.equal(richPool.metadata.archiveCount, 1800);
assert.equal(richPool.metadata.historicalArchiveCount, 1200);
assert.equal(richPool.metadata.historicalSourceCount, 2);
assert.equal(richPool.metadata.actualCoveredDayRange, 30);
assert.equal(richPool.items[0].feedExcerpt, "Sanitized feed context");
const balancedPoolRows = Array.from({ length: RESEARCH_ARTICLE_POOL_LIMIT }, (_, index) => ({
  article_id: `balanced-${index}`,
  title: `Balanced article ${index}`,
  source: "Desk",
  url: `https://example.test/balanced/${index}`,
  published_at: `2026-07-${String(Math.floor(index / RESEARCH_DAILY_ARTICLE_LIMIT) + 1).padStart(2, "0")}T09:00:00+09:00`,
}));
const balancedPool = await loadResearchArticlePool({ data: {
  version: 3,
  bounded_limit: RESEARCH_ARTICLE_POOL_LIMIT,
  daily_article_limit: RESEARCH_DAILY_ARTICLE_LIMIT,
  rolling_window_days: 30,
  covered_day_count: 30,
  daily_counts: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`2026-07-${String(index + 1).padStart(2, "0")}`, RESEARCH_DAILY_ARTICLE_LIMIT])),
  articles: balancedPoolRows,
} });
assert.equal(balancedPool.items.length, 3000, "the Node loader must not re-truncate the balanced pool to 500 rows");
assert.equal(balancedPool.metadata.boundedLimit, 3000);
assert.equal(balancedPool.metadata.dailyArticleLimit, 100);
assert.equal(balancedPool.metadata.coveredDayCount, 30);
assert.equal(Object.keys(balancedPool.metadata.dailyCounts).length, 30);
assert.equal(RESEARCH_SEMANTIC_CANDIDATE_LIMIT, 300);
const invalidBalancedPool = await loadResearchArticlePool({ data: {
  version: 3,
  bounded_limit: 3000,
  daily_article_limit: 100,
  rolling_window_days: 30,
  covered_day_count: 1,
  daily_counts: { "2026-07-01": 99 },
  articles: [balancedPoolRows[0]],
} });
assert.equal(invalidBalancedPool.items.length, 0);
assert.match(invalidBalancedPool.error, /daily counts do not match/);
const [newsroomCliSource, newsroomRouteSource, newsroomPanelSource, newsroomCssSource, promotedDossierSource, promotedRouteSource, storiesResearchRouteSource, projectRuntimeSource, genericWorkbenchSource, workflowRouteSource, projectResearchRouteSource, qualityRouteSource, publishingRouteSource, publishingServerSource, mediaRouteSource, projectRouteSource] = await Promise.all([
  fsp.readFile(path.join(AUTOMATION_ROOT, "scripts", "newsroom-cli.mjs"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "newsroom", "newsroom-research-panel.tsx"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "newsroom", "newsroom.module.css"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "newsroom", "[slug]", "promoted-dossier-page.tsx"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "newsroom", "[slug]", "page.tsx"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "stories", "[slug]", "research", "page.tsx"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "newsroom", "project-runtime.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "newsroom", "[slug]", "generic-pipeline-workbench.tsx"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "workflow", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "research", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "quality", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "publishing", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "newsroom", "publishing-server.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "media", "route.ts"), "utf8"),
  fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "app", "api", "newsroom", "projects", "[slug]", "route.ts"), "utf8"),
]);
const legalContextSource = await fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "newsroom", "legal-context.ts"), "utf8");
const legalReviewPolicySource = await fsp.readFile(path.join(AUTOMATION_ROOT, "opencut-classic", "apps", "web", "src", "newsroom", "legal-review-policy.mjs"), "utf8");
const typescript = await import(pathToFileURL(path.join(AUTOMATION_ROOT, "opencut-classic", "node_modules", "typescript", "lib", "typescript.js")).href);
const legalReviewPolicyDataUrl = `data:text/javascript;base64,${Buffer.from(legalReviewPolicySource).toString("base64")}`;
const transpiledLegalContextSource = typescript.transpileModule(legalContextSource, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ES2022 } }).outputText.replace("./legal-review-policy.mjs", legalReviewPolicyDataUrl);
const legalContextModule = await import(`data:text/javascript;base64,${Buffer.from(transpiledLegalContextSource).toString("base64")}`);
const bakeryCandidate = { title: "빵집 앞 흡연 제지에 어깨 충돌 난동…우울증 탓 해명", url: "https://example.test/bakery", hook: "흡연을 말리자 손님이 사장을 밀쳤습니다.", storySummary: "빵집 앞 흡연 갈등이 폭언과 물리적 충돌로 번졌고 우울증 탓이라는 해명이 보도됐습니다.", rationale: "제보 영상과 방송 보도 중심의 사건입니다.", factCheckRisks: ["신고·수사·법적 처분 여부 확인"] };
const bakerySnapshot = { slug: "bakery", sources: [{ title: bakeryCandidate.title, publisher: "Fixture", url: bakeryCandidate.url, status: "verified", snippet: "鍮듭쭛 ???≪뿰 媛덈벑???곗슱利??볦씠?쇰뒗 ?대챸??蹂대룄?먯뒿?덈떎. ?ъ껜??媛寃?諛⑸쓣 ?곸꽭???ㅼ떆 ?ㅼ젙?섏뿬 ?댁슫 ?댁뒪 ?곸쓩???⑸땲??" }] };
assert.throws(() => legalContextModule.buildLegalContextReport({ slug: "bakery", candidate: bakeryCandidate, researchSnapshot: bakerySnapshot, generatedAt: "2026-08-04T00:00:00.000Z" }), /최신 사건 히스토리/, "legacy pre-dossier snapshots must fail closed");
assert.match(newsroomCliSource, /backfill-research/);
assert.match(newsroomCliSource, /refresh-research/);
assert.match(newsroomRouteSource, /days must be an integer from 1 through 30/);
assert.doesNotMatch(newsroomRouteSource, /body\.(?:host|url).*backfill-research/);
assert.match(newsroomPanelSource, /신규 기사만 갱신·AI 선별/);
assert.match(newsroomPanelSource, /최초 1회만 최근 30일을 구축/);
assert.match(newsroomPanelSource, /날짜별 최대 100건·총 3,000건/);
assert.match(newsroomPanelSource, /의미 선별 균형 풀/);
assert.match(newsroomPanelSource, /최대 3,000건/);
assert.match(newsroomPanelSource, /AI 후보 검색/);
assert.match(newsroomPanelSource, /candidateQuery\.normalize\("NFKC"\)/);
assert.match(newsroomCssSource, /\.candidateSearch \{/);
assert.equal((newsroomPanelSource.match(/<button className=\{styles\.researchRefresh\}/g) || []).length, 1, "Research must expose one primary run button");
assert.match(newsroomPanelSource, /<h3 id="unified-candidates-heading">전체 다음 영상 후보<\/h3>/);
assert.match(newsroomPanelSource, /const CANDIDATES_PER_PAGE = 6/);
assert.match(newsroomPanelSource, /className=\{styles\.candidatePagination\}/);
assert.match(newsroomPanelSource, /사건 개요/);
assert.match(newsroomPanelSource, /무슨 일이 있었나/);
assert.match(newsroomPanelSource, /candidateStory\(item\)/);
assert.match(newsroomCssSource, /\.candidateUnifiedGrid \{[^}]*repeat\(2,/);
assert.match(newsroomCssSource, /\.candidateUnifiedStory p \{[^}]*font: 15px\/1\.72/);
assert.match(newsroomPanelSource, /AI 판단 근거/);
assert.match(newsroomPanelSource, /반드시 확인/);
assert.match(newsroomPanelSource, /영상화 포인트/);
assert.match(newsroomPanelSource, /후보 제외/);
assert.match(newsroomPanelSource, /제외 학습/);
assert.match(newsroomRouteSource, /body\.action === "reject-research"/);
assert.match(newsroomCliSource, /reject-research/);
assert.match(newsroomPanelSource, /setAnalysis\(null\);[\s\S]*setFeed\(body\)/, "A feed reload must discard stale semantic analysis after exclusions");
assert.match(newsroomPanelSource, /filter\(\(item\) => rejectionState\[item\.id\] !== "done"\)/, "A successful rejection must hide the card immediately");
assert.doesNotMatch(newsroomPanelSource, /ALL CANDIDATES \/ ONE DESK/);
assert.doesNotMatch(newsroomPanelSource, /SELECTED \/ ACTIVE REVIEW/);
assert.doesNotMatch(newsroomPanelSource, /promoted-materials-heading/);
assert.doesNotMatch(newsroomPanelSource, /규칙 밖에서 건진 의미 후보/);
assert.match(newsroomPanelSource, /이 소재로 취재 시작/);
assert.match(newsroomPanelSource, /evaluation\?\.storySummary/, "candidate cards must render the generated incident narrative instead of a feed teaser");
assert.match(newsroomPanelSource, /candidate\.storySummary\?\.trim\(\)\.length >= 120/, "raw rule hits must not bypass the required incident narrative gate");
assert.match(newsroomPanelSource, /취재 작업 열기/);
assert.match(newsroomPanelSource, /router\.push\(`\/stories\/\$\{encodeURIComponent\(body\.dossier\.slug\)\}\/research`\)/);
assert.match(promotedDossierSource, /사건 심층 조사 기록/);
assert.match(promotedDossierSource, /세 가지 법률 검토/);
assert.match(promotedDossierSource, /projectSlug=\{slug\}/);
assert.match(promotedDossierSource, /심층 조사 시작/);
assert.match(promotedDossierSource, /\/api\/newsroom\/projects\/\$\{encodeURIComponent\(slug\)\}\/research/);
assert.match(newsroomCssSource, /\.intakeResearchDesk/);
assert.doesNotMatch(projectResearchRouteSource, /slug !== newsroomProject\.slug/);
assert.match(projectResearchRouteSource, /assertSlug/);
assert.match(promotedRouteSource, /PromotedDossierPage/);
assert.match(storiesResearchRouteSource, /isCanonicalNewsroomProject/);
assert.match(storiesResearchRouteSource, /PromotedDossierPage/);
assert.match(projectRuntimeSource, /project\?\.canonical === true/);
assert.match(projectRuntimeSource, /error\.code === "ENOENT"\) return false/);
assert.match(projectRuntimeSource, /first Research page load must route to the promoted/);
assert.match(genericWorkbenchSource, /action: "draft"/);
assert.doesNotMatch(genericWorkbenchSource, /form\.set\("action", "render"\)|renderVideo|confirmUnverified/);
assert.match(genericWorkbenchSource, /migrationRequired[\s\S]*migration-required:/);
assert.match(genericWorkbenchSource, /<QualityDesk slug=\{slug\}/);
assert.match(genericWorkbenchSource, /<PublishingDesk slug=\{slug\}/);
assert.match(genericWorkbenchSource, /<OpenCutEmbed src=\{`\/automation\?job=/);
assert.doesNotMatch(genericWorkbenchSource, /\/api\/newsroom\?handoff=/);
assert.doesNotMatch(qualityRouteSource, /slug !== newsroomProject\.slug/);
assert.match(qualityRouteSource, /dynamicAudit/);
assert.doesNotMatch(publishingRouteSource, /slug !== newsroomProject\.slug/);
assert.match(publishingServerSource, /approvedRelease\(slug: string\)/);
assert.match(publishingServerSource, /projectSlug: slug/);
assert.doesNotMatch(mediaRouteSource, /제주\|초등학교\|교실\|침입/);
assert.doesNotMatch(projectRouteSource, /slug !== newsroomProject\.slug/);
assert.doesNotMatch(newsroomRouteSource, /typeof payload\.slug === "string" \? payload\.slug : "jeju-school-intrusion"/);
assert.doesNotMatch(workflowRouteSource, /complete-legal/);
assert.match(workflowRouteSource, /generate-legal/);
assert.doesNotMatch(workflowRouteSource, /body\.approved/);
assert.match(workflowRouteSource, /isCurrentLegalContextReport/);
assert.match(workflowRouteSource, /status: "in-progress"/);
assert.match(genericWorkbenchSource, /AUTOMATED LEGAL REVIEW/);
assert.doesNotMatch(genericWorkbenchSource, /conditionAcknowledgements|approveLegal|complete-legal/);
assert.match(genericWorkbenchSource, /법률 검토 반영해 대본 생성/);
assert.match(newsroomRouteSource, /loadActionWorkflow\(root, body\.slug/);
assert.match(newsroomRouteSource, /candidate: persisted\.candidate/);
assert.doesNotMatch(newsroomRouteSource, /startRender|form\.getAll\("visuals"\)|draft: persisted\.draft/);
assert.doesNotMatch(newsroomRouteSource, /candidate: payload\.candidate/);
assert.doesNotMatch(newsroomRouteSource, /draft: payload\.draft/);
assert.doesNotMatch(newsroomRouteSource, /Array\.isArray\(payload\.mediaApprovals\)/);
assert.match(genericWorkbenchSource, /action: "draft", slug/);
assert.match(genericWorkbenchSource, /action: "media", slug/);
assert.match(legalContextSource, /confirmedFacts/);
assert.match(legalContextSource, /reportedFacts/);
assert.match(legalContextSource, /possibleLegalIssues/);
assert.match(legalContextSource, /sameEventSnapshot/);
assert.match(legalContextSource, /verdictLabel/);
assert.match(legalContextSource, /requiredConditions/);
assert.match(legalContextSource, /allowedMaterials/);
assert.doesNotMatch(workflowRouteSource, /editorialApprovalReady|conditionAcknowledgements/);
assert.match(workflowRouteSource, /save-draft/);
assert.doesNotMatch(workflowRouteSource, /newsroom-markdown-guided-seven-sections-length-only-v4/, "Stage03 save path must not require the legacy fixed-section length contract");
assert.match(workflowRouteSource, /newsroom-autonomous-narration-v3/);
assert.match(legalContextSource, /const projection = \{ schemaVersion: 19, caseHistory, videoDecision: legalReport\.videoDecision, legalPolicy: legalReport\.scriptPolicy, generationGuidance, policyBinding \}/, "web draft requests must build the same autonomous Stage 03 package consumed by Codex");
assert.match(legalContextSource, /openingHook: "lead-with-the-most-compelling-verified-stake-contrast-action-or-consequence-without-a-fixed-expectation-breach-template"/u, "the web package must hash-bind the flexible verified opening guidance");
assert.match(legalContextSource, /storyMode: "model-selects-action-scene-record-institution-number-explanation-evidence-reconstruction-or-hybrid-from-current-evidence"/u, "the web package must let the model select the evidence-fit modality");
assert.doesNotMatch(legalContextSource, /const projection = \{ schemaVersion: 6, caseHistory, legalReviews/, "the removed style and review payload must not return through the web draft path");
assert.doesNotMatch(workflowRouteSource, /runDraftValidationCli\(\{ packageInput:/, "save/final path must not invoke removed script-quality validation");
assert.match(workflowRouteSource, /generator, critic, final authority의 hash provenance가 일치하지 않습니다/u, "generator and independent critic provenance remains mandatory");
assert.match(genericWorkbenchSource, /draftVariantGrid/);
assert.match(genericWorkbenchSource, /생성 1회 \+ 독립 critic 1회 · 자동 재시도 없음/u);
assert.match(genericWorkbenchSource, /65–80초 영상 설계 출발점/, "Stage03 must expose the v9 planning successor instead of a legacy production retry");
assert.match(genericWorkbenchSource, /Gemini 호출 · production source admission · derivative\/render · upload · publication · Stage 07 · continuation/, "Stage03 must keep every execution surface explicitly unauthorized");
assert.match(genericWorkbenchSource, /4s[\s\S]*3s[\s\S]*3s[\s\S]*2–3s/, "Stage03 must distinguish provider multishot intent from sealed final cuts");
assert.doesNotMatch(genericWorkbenchSource, /빠른 숏폼/);
assert.match(newsroomCssSource, /\.draftVariantGrid/);
assert.match(workflowRouteSource, /save-render/);
assert.match(newsroomRouteSource, /buildDraftPolicyPackage/);
assert.doesNotMatch(newsroomRouteSource, /JSON\.stringify\(\{ candidate: persisted\.candidate, researchSnapshot:/, "draft CLI must not receive raw research");
assert.match(workflowRouteSource, /validateDraftLegalCompliance\(\{ sections, policy: expectedPackage\.legalPolicy \}\)/, "finalization must enforce the current legal script policy");
assert.match(workflowRouteSource, /Draft legal compliance failed/, "legal-policy violations must fail closed before production enqueue");
assert.doesNotMatch(workflowRouteSource, /approvalSha/);
assert.doesNotMatch(genericWorkbenchSource, /consumedUrls|researchSnapshotSha256|legalReportHash|contextSha256|draftEvidence/, "Stage03 UI must not expose research provenance or hashes");
assert.match(genericWorkbenchSource, /AUTOMATED LEGAL REVIEW/);
assert.match(newsroomPanelSource, /<details className=\{styles\.researchDetails\}>/);
assert.match(newsroomPanelSource, /수집·AI 실행 상세/);
const stalePool = await loadResearchArticlePool({ now: "2026-07-28T12:00:00.000Z", data: { version: 2, generated_at: "2026-07-27T10:00:00.000Z", stale_after_hours: 6, articles: [] } });
assert.equal(stalePool.metadata.stale, true);
await assert.rejects(() => analyzeResearch({}, { articlePool: { now: "2026-07-28T12:00:00.000Z", data: { version: 2, generated_at: "2026-07-27T10:00:00.000Z", stale_after_hours: 6, articles: [
  { article_id: "stale", title: "Stale story", source: "Desk", url: "https://example.test/stale", published_at: "2026-07-27T09:00:00.000Z" },
] } } }), /Collect fresh publisher feeds/);

function fakeCodexSpawn(mode = "valid") {
  return (_executable, argv) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { end() {
      const output = argv[argv.indexOf("-o") + 1];
      const payload = mode === "unknown-url"
        ? { evaluations: [{ url: "https://example.test/unknown", shortsScore: 50, hook: "hook", storySummary: "평범한 거리에서 사소한 시비가 시작됐습니다. 상대는 갑자기 과도한 위협 행동을 했고 주변 시민까지 위험에 놓였습니다. 신고를 받은 경찰이 출동해 상황을 정리했으며 정확한 혐의와 후속 조치는 확인이 필요합니다.", rationale: "why", dimensions: { ordinaryContext: 2, disproportionateEscalation: 3, explanationActionMismatch: 1, tangibleRisk: 3, responsibilityEvasion: 0, relatableEmotion: 2 }, selectionReasons: ["risk"], factCheckRisks: [], visualAngles: [] }] }
        : { evaluations: [{ url: "https://example.test/a", shortsScore: 81, hook: "hook", storySummary: "평범한 거리에서 운전자 사이 경적 시비가 시작됐습니다. 한 사람이 갑자기 권총을 꺼내 상대를 위협하면서 사소한 갈등이 심각한 상황으로 번졌습니다. 신고를 받은 경찰이 출동해 피의자를 특정했으며 정확한 혐의와 후속 처분은 추가 확인이 필요합니다.", rationale: "why", dimensions: { ordinaryContext: 2, disproportionateEscalation: 3, explanationActionMismatch: 1, tangibleRisk: 3, responsibilityEvasion: 0, relatableEmotion: 2 }, selectionReasons: ["사소한 경적 뒤 과잉 위협"], factCheckRisks: ["verify"], visualAngles: ["CCTV"] }] };
      if (argv[0] === "--version") child.stdout.emit("data", "codex 0.121.0\n");
      else {
        assert.ok(argv.includes("--ephemeral"));
        assert.ok(argv.includes("read-only"));
        assert.ok(argv.includes("--output-schema"));
        fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
      }
      queueMicrotask(() => child.emit("close", 0));
    } };
    child.kill = () => {};
    return child;
  };
}
function fakePartialCodexSpawn() {
  let analysisCall = 0;
  return (_executable, argv) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { end() {
      if (argv[0] === "--version") {
        child.stdout.emit("data", "codex 0.121.0\n");
        queueMicrotask(() => child.emit("close", 0));
        return;
      }
      analysisCall += 1;
      if (analysisCall === 1) {
        child.stderr.emit("data", "synthetic batch failure");
        queueMicrotask(() => child.emit("close", 1));
        return;
      }
      const output = argv[argv.indexOf("-o") + 1];
      const payload = { evaluations: [{ articleId: "second", shortsScore: 82, hook: "hook", storySummary: "평범한 생활 공간에서 사소한 갈등이 시작됐습니다. 한 사람이 이해하기 어려운 과잉 행동을 하며 주변까지 위험한 상황으로 만들었습니다. 피해가 발생한 뒤 관계 기관이 대응에 나섰지만 정확한 경위와 후속 조치는 추가 확인이 필요합니다.", rationale: "why", dimensions: { ordinaryContext: 2, disproportionateEscalation: 3, explanationActionMismatch: 1, tangibleRisk: 3, responsibilityEvasion: 0, relatableEmotion: 2 }, selectionReasons: ["risk"], factCheckRisks: [], visualAngles: [] }] };
      fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
      queueMicrotask(() => child.emit("close", 0));
    } };
    child.kill = () => {};
    return child;
  };
}
const semanticPool = [{ title: "경적 뒤 권총 위협", source: "Desk A", url: "https://example.test/a", publishedAt: "2026-07-24T07:00:00.000Z", deterministicScore: 0 }];
const refreshSequence = [];
const refreshed = await refreshResearch({
  days: 60,
  collectImpl: async (options) => { refreshSequence.push("collect"); assert.equal(options.days, 30); assert.equal(options.mode, "incremental"); assert.notEqual(options.historical, true); return { ok: true }; },
  analyzeImpl: async (_input, options) => { refreshSequence.push("analyze"); assert.equal(options.batchSize, 60); assert.equal(options.timeoutMs, 120_000); return { ok: true, evaluations: [] }; },
});
assert.deepEqual(refreshSequence, ["collect", "analyze"], "semantic selection must start only after collection completes");
assert.equal(refreshed.days, 30);
  const mergedIncremental = mergeIncrementalResearchAnalysis(
  { generatedAt: "2026-07-24T07:00:00.000Z", scannedArticleCount: 1, rawEvaluationCount: 1, evaluations: [{ articleId: "old", title: "old", source: "Desk", url: "https://example.test/old", publishedAt: "2026-07-24T05:00:00.000Z", shortsScore: 80, deepResearch: { status: "ready", verifiedSourceCount: 3, independentPublisherCount: 2, confirmedFactCount: 5, timelineEventCount: 3, readiness: "ready-for-promotion", rankScore: 1200, verifiedRelatedCoverage: [] } }] },
  { generatedAt: "2026-07-24T08:00:00.000Z", scannedArticleCount: 1, rawEvaluationCount: 1, evaluations: [{ articleId: "new", title: "new", source: "Desk", url: "https://example.test/new", publishedAt: "2026-07-24T06:00:00.000Z", shortsScore: 90 }] },
  { metadata: { rowCount: 2, generatedAt: "2026-07-24T08:00:00.000Z" }, items: [{ url: "https://example.test/old" }, { url: "https://example.test/new" }] },
  { generatedAt: "2026-07-24T08:00:00.000Z", incrementalSince: "2026-07-24T07:00:00.000Z", newArticleCount: 1 },
);
assert.equal(mergedIncremental.evaluations.length, 2);
assert.equal(mergedIncremental.incremental.analyzedArticleCount, 1);
assert.equal(mergedIncremental.scannedArticleCount, 2);
assert.equal(mergedIncremental.evaluations.find((item) => item.url === "https://example.test/old")?.deepResearch?.status, "ready", "incremental merge must retain prior enrichment when no newer enrichment exists");

const deepResearchHtml = new Map([
  ["https://primary.example.test/deep-primary", `<html><head><title>빵집 앞 흡연 제지에 어깨 충돌 난동</title></head><body><article>2026년 8월 1일 빵집 앞에서 흡연 제지가 발생했고 경찰이 현장을 확인했습니다. 손님이 어깨로 사장을 밀쳤고 피해 신고가 접수됐습니다. 이후 수사가 시작됐고 CCTV 확인이 진행됐습니다.</article></body></html>`],
  ["https://secondary.example.test/deep-secondary", `<html><head><title>빵집 흡연 제지 어깨 충돌 후속</title></head><body><article>2026년 8월 2일 빵집 흡연 갈등의 후속 상황이 알려졌고 경찰이 추가 확인에 나섰습니다. 경찰은 당시 충돌을 확인했고 피해자 진술을 조사했습니다. 이후 사건 처분이 진행됐고 관련 영상도 확보됐습니다.</article></body></html>`],
  ["https://unrelated.example.test/deep-unrelated", `<html><head><title>경찰 결국 사망한 별도 사건 보도</title></head><body><article>2026년 8월 2일 전혀 다른 장소에서 남성이 사망한 사건을 경찰이 조사했습니다. 이후 수사가 진행됐습니다.</article></body></html>`],
]);
const deepResearchResponse = (body) => ({ ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(body, "utf8") });
const deepCandidate = await enrichResearchCandidate({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동",
  source: "주요 매체",
  url: "https://primary.example.test/deep-primary",
  shortsScore: 90,
  relatedCoverage: [
    { title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: "https://secondary.example.test/deep-secondary" },
    { title: "경찰 결국 사망한 별도 사건 보도", source: "다른 매체", url: "https://unrelated.example.test/deep-unrelated" },
  ],
}, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async (url) => deepResearchResponse(deepResearchHtml.get(String(url)) || "<html><body><article>missing</article></body></html>") });
assert.equal(deepCandidate.deepResearch.status, "ready", "verified primary and same-event secondary evidence should be production-ready");
assert.equal(deepCandidate.deepResearch.verifiedSourceCount, 2);
assert.equal(deepCandidate.deepResearch.independentPublisherCount, 2);
assert.equal(deepCandidate.deepResearch.verifiedRelatedCoverage.length, 1, "unrelated secondary must not be stored as verified coverage");
assert.equal(deepCandidate.deepResearch.verifiedRelatedCoverage[0].url, "https://secondary.example.test/deep-secondary");
const platformRepost = await enrichResearchCandidate({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동",
  source: "JTBC",
  url: "https://primary.example.test/deep-primary",
  relatedCoverage: [{ title: "빵집 흡연 제지 어깨 충돌 후속", source: "JTBC News 영상", url: "https://youtube.com/watch?v=deep" }],
}, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async (url) => deepResearchResponse(deepResearchHtml.get(String(url)) || deepResearchHtml.get("https://secondary.example.test/deep-secondary")) });
assert.equal(platformRepost.deepResearch.independentPublisherCount, 1, "same publisher video repost must not count as an independent publisher");
assert.equal(platformRepost.deepResearch.evidenceBasis, "source-backed-evidence-sentences");
const poolDiscovered = await enrichResearchCandidate({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동",
  source: "주요 매체",
  url: "https://primary.example.test/deep-primary",
  relatedCoverage: [],
}, { articlePool: [
  { title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: "https://secondary.example.test/deep-secondary" },
  { title: "남성 결국 사망한 별도 사건", source: "다른 매체", url: "https://unrelated.example.test/deep-unrelated" },
], lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async (url) => deepResearchResponse(deepResearchHtml.get(String(url)) || "<html><body><article>missing</article></body></html>") });
assert.deepEqual(poolDiscovered.deepResearch.verifiedRelatedCoverage.map((item) => item.url), ["https://secondary.example.test/deep-secondary"], "bounded article pool enrichment must discover same-event coverage and exclude unrelated stories");
const shortlist = await enrichResearchShortlist([
  { ...deepCandidate, url: "https://primary.example.test/deep-primary" },
  { ...deepCandidate, url: "https://secondary.example.test/deep-secondary", shortsScore: 80 },
  { ...deepCandidate, url: "https://unrelated.example.test/deep-unrelated", shortsScore: 70 },
], { limit: 2, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async (url) => deepResearchResponse(deepResearchHtml.get(String(url)) || "<html><body><article>missing</article></body></html>") });
assert.equal(shortlist.length, 3, "bounded enrichment must retain the full candidate list");
const mockedAnalysis = await analyzeResearch({ articlePool: semanticPool }, { spawnImpl: fakeCodexSpawn("valid"), executable: "fake-codex", persist: false, batchSize: 1 });
assert.equal(mockedAnalysis.ok, true);
assert.equal(mockedAnalysis.evaluations[0].url, "https://example.test/a");
assert.equal(mockedAnalysis.scannedArticleCount, 1);
assert.equal(mockedAnalysis.batchCount, 1);
assert.equal(mockedAnalysis.evaluations[0].title, "경적 뒤 권총 위협", "display metadata must come from the validated pool");
assert.equal(mockedAnalysis.evaluations[0].dimensions.disproportionateEscalation, 3);
const loadedSemantic = await loadResearchSemanticSelection({ data: mockedAnalysis });
assert.equal(loadedSemantic.candidates[0].aiSuggestion, true);
const expandedSemanticRows = Array.from({ length: 40 }, (_, index) => ({
  ...mockedAnalysis.evaluations[0],
  articleId: `expanded-${index}`,
  url: `https://example.test/expanded/${index}`,
  title: `Expanded${index} subject${index} token${index}`,
  shortsScore: 100 - index,
}));
const expandedSemantic = await loadResearchSemanticSelection({ data: {
  ...mockedAnalysis,
  incidentCandidateCount: expandedSemanticRows.length,
  evaluations: expandedSemanticRows,
} });
assert.equal(expandedSemantic.candidates.length, 40, "the persisted AI desk must no longer truncate valid candidates to 24");
assert.equal(expandedSemantic.metadata.incidentCandidateCount, 40);
const reconciledSemantic = reconcileResearchSemanticSelection(
  { candidates: [loadedSemantic.candidates[0], { ...loadedSemantic.candidates[0], url: "https://example.test/unavailable" }], metadata: { rowCount: 2 } },
  { items: [{ url: "https://example.test/a", feedExcerpt: "경적을 울린 뒤 평범한 도로 위 시비가 총기 위협으로 번졌습니다.", excerptProvenance: "rss-description-or-atom-summary" }], metadata: { generatedAt: "2026-07-24T08:00:00.000Z" } },
);
assert.equal(reconciledSemantic.candidates.length, 1);
assert.match(reconciledSemantic.candidates[0].feedExcerpt, /도로 위 시비/);
assert.equal(reconciledSemantic.candidates[0].excerptProvenance, "rss-description-or-atom-summary");
assert.equal(reconciledSemantic.metadata.persistedRowCount, 2);
assert.equal(reconciledSemantic.metadata.availableRowCount, 1);
assert.equal(reconciledSemantic.metadata.unavailableCount, 1);
assert.equal(reconciledSemantic.metadata.poolSelectionMismatch, true);
const feedbackDir = await fsp.mkdtemp(path.join(os.tmpdir(), "newsroom-feedback-"));
const feedbackPath = path.join(feedbackDir, "research-feedback.json");
const rejectedCandidate = await rejectResearchCandidate({
  kind: "semantic",
  title: "[단독] 경적 뒤 권총 위협",
  source: "Desk A",
  url: "https://example.test/a?utm_source=desk",
  selectionReasons: ["일상 공간"],
  dimensions: { ordinaryContext: 3 },
}, "채널 주제와 맞지 않음", { sourcePath: feedbackPath, now: "2026-07-24T08:00:00.000Z" });
assert.equal(rejectedCandidate.ok, true);
assert.equal(rejectedCandidate.feedback.exclusionCount, 1);
const loadedFeedback = await loadResearchFeedback({ sourcePath: feedbackPath });
assert.equal(loadedFeedback.metadata.exclusionCount, 1);
assert.equal(researchFeedbackMatches({ title: "다른 제목", url: "https://example.test/a" }, loadedFeedback), true);
assert.equal(researchFeedbackMatches({ title: "경적 뒤 권총 위협", url: "https://example.test/new" }, loadedFeedback), true);
assert.equal(researchFeedbackMatches({ title: "완전히 다른 후보", url: "https://example.test/good" }, loadedFeedback), false);
const feedbackReconciled = reconcileResearchSemanticSelection(
  { candidates: [loadedSemantic.candidates[0]], metadata: { rowCount: 1 } },
  { items: [{ url: "https://example.test/a" }], metadata: {} },
  loadedFeedback,
);
assert.equal(feedbackReconciled.candidates.length, 0);
assert.equal(feedbackReconciled.metadata.feedbackExcludedCount, 1);
await fsp.rm(feedbackDir, { recursive: true, force: true });
const promotionDir = await fsp.mkdtemp(path.join(os.tmpdir(), "newsroom-promotion-"));
const semanticPath = path.join(promotionDir, "semantic.json");
const dossierPath = path.join(promotionDir, "dossiers.json");
const promotionAnalysis = structuredClone(mockedAnalysis);
promotionAnalysis.evaluations[0].deepResearch = {
  status: "ready",
  verifiedRelatedCoverage: [{
    source: "Desk B",
    title: `${semanticPool[0].title} follow up`,
    url: "https://example.test/b",
    publishedAt: "2026-07-24T07:30:00.000Z",
    sameEvent: { verified: true, matched: ["case-anchor"] },
  }],
};
await fsp.writeFile(semanticPath, `${JSON.stringify(promotionAnalysis)}\n`);
const promotionPool = { now: "2026-07-24T08:00:00.000Z", data: { version: 2, generated_at: "2026-07-24T07:30:00.000Z", articles: [
  { article_id: "a", title: semanticPool[0].title, source: "Desk A", url: "https://example.test/a", published_at: semanticPool[0].publishedAt },
  { article_id: "b", title: `${semanticPool[0].title} follow up`, source: "Desk B", url: "https://example.test/b", published_at: "2026-07-24T07:30:00.000Z" },
] } };
const promoted = await promoteResearchCandidate("https://example.test/a", { semanticPath, dossierPath, articlePool: promotionPool, now: "2026-07-24T08:00:00.000Z" });
assert.equal(promoted.created, true);
assert.equal(promoted.dossier.editorialStatus, "active-review");
assert.match(promoted.dossier.slug, /^research-[a-f0-9]{16}$/);
assert.equal(promoted.dossier.approval.kind, "human-promotion");
assert.equal(promoted.dossier.verification.state, "cross-source-verification-required");
assert.equal(promoted.dossier.relatedCoverage.length, 1);
assert.equal(promoted.dossier.relatedCoverage[0].status, "verified", "verified shortlist coverage must survive promotion as a re-verifiable same-event source");
assert.equal(promoted.dossier.relatedCoverage[0].kind, "same-event");
const promotedAgain = await promoteResearchCandidate("https://example.test/a", { semanticPath, dossierPath, articlePool: promotionPool, now: "2026-07-24T09:00:00.000Z" });
assert.equal(promotedAgain.created, false, "promotion is idempotent by exact URL");
assert.equal((await loadResearchDossiers({ sourcePath: dossierPath })).dossiers.length, 1);
await assert.rejects(() => promoteResearchCandidate("https://example.test/not-selected", { semanticPath, dossierPath, articlePool: promotionPool }), /not present in the persisted semantic selection/);
await fsp.rm(promotionDir, { recursive: true, force: true });
const quarantinedAnalysis = await analyzeResearch({ articlePool: semanticPool }, { spawnImpl: fakeCodexSpawn("unknown-url"), executable: "fake-codex", persist: false });
assert.equal(quarantinedAnalysis.ok, true, "an invalid model item must not abort the batch");
assert.equal(quarantinedAnalysis.evaluations.length, 0);
assert.equal(quarantinedAnalysis.rejectedEvaluationCount, 1);
assert.equal(quarantinedAnalysis.rejectedEvaluations[0].reason, "unknown-article-url");
assert.doesNotMatch(JSON.stringify(quarantinedAnalysis.rejectedEvaluations), /https?:\/\//, "rejection diagnostics must not expose fabricated URLs");
const loadedQuarantined = await loadResearchSemanticSelection({ data: quarantinedAnalysis });
assert.equal(loadedQuarantined.metadata.rejectedEvaluationCount, 1);
assert.equal(loadedQuarantined.metadata.rejectedEvaluations[0].reason, "unknown-article-url");
const partialAnalysis = await analyzeResearch({ articlePool: [
  { articleId: "first", title: "first", source: "Desk", url: "https://example.test/first", publishedAt: "2026-07-24T07:00:00.000Z" },
  { articleId: "second", title: "second", source: "Desk", url: "https://example.test/second", publishedAt: "2026-07-24T06:00:00.000Z" },
] }, { spawnImpl: fakePartialCodexSpawn(), executable: "fake-codex", persist: false, batchSize: 1, batchMaxAttempts: 1 });
assert.equal(partialAnalysis.ok, true, "one failed batch must not discard later successful batches");
assert.equal(partialAnalysis.completedBatchCount, 1);
assert.equal(partialAnalysis.failedBatchCount, 1);
assert.deepEqual(partialAnalysis.failedBatches, [{ batch: 0, reason: "codex-process-failed", attempts: 1 }]);
assert.equal(partialAnalysis.evaluations[0].url, "https://example.test/second");
assert.doesNotMatch(JSON.stringify(partialAnalysis.failedBatches), /https?:\/\//);
const retriedAnalysis = await analyzeResearch({ articlePool: [
  { articleId: "second", title: "second", source: "Desk", url: "https://example.test/second", publishedAt: "2026-07-24T06:00:00.000Z" },
] }, { spawnImpl: fakePartialCodexSpawn(), executable: "fake-codex", persist: false, batchSize: 1 });
assert.equal(retriedAnalysis.completedBatchCount, 1, "a transient failed batch must be retried once");
assert.equal(retriedAnalysis.failedBatchCount, 0);
assert.equal(retriedAnalysis.evaluations[0].url, "https://example.test/second");
const targetedRetry = await retryFailedResearchAnalysis({
  previousData: {
    version: 5,
    generatedAt: "2026-07-24T08:00:00.000Z",
    pool: { generatedAt: "pool-v1" },
    feedback: { updatedAt: null },
    scannedArticleCount: 2,
    batchSize: 1,
    batchCharacterLimit: 45_000,
    batchCount: 2,
    completedBatchCount: 1,
    failedBatchCount: 1,
    failedBatches: [{ batch: 1, reason: "codex-timeout" }],
    rawEvaluationCount: 1,
    rejectedEvaluationCount: 0,
    rejectedEvaluations: [],
    evaluations: [{ articleId: "first", title: "first", source: "Desk", url: "https://example.test/first", publishedAt: "2026-07-24T07:00:00.000Z", shortsScore: 80 }],
  },
  loadedPool: {
    metadata: { generatedAt: "pool-v1", rowCount: 2 },
    items: [
      { articleId: "first", title: "first", source: "Desk", url: "https://example.test/first", publishedAt: "2026-07-24T07:00:00.000Z" },
      { articleId: "second", title: "second", source: "Desk", url: "https://example.test/second", publishedAt: "2026-07-24T06:00:00.000Z" },
    ],
  },
  feedbackData: { exclusions: [], metadata: { updatedAt: null, exclusionCount: 0 } },
  analyzeImpl: async ({ articlePool }) => ({ ok: true, failedBatchCount: 0, rejectedEvaluationCount: 0, rejectedEvaluations: [], evaluations: [{ ...articlePool[0], shortsScore: 90 }] }),
  persist: false,
  now: "2026-07-24T09:00:00.000Z",
});
assert.equal(targetedRetry.completedBatchCount, 2);
assert.equal(targetedRetry.failedBatchCount, 0);
assert.equal(targetedRetry.retry.recoveredBatchCount, 1);
assert.equal(targetedRetry.evaluations.length, 2);
await assert.rejects(() => analyzeResearch({ articlePool: semanticPool }, { executable: "missing-codex", persist: false, spawnImpl: () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { end() { queueMicrotask(() => child.emit("error", Object.assign(new Error("not found"), { code: "ENOENT" }))); } }; return child; } }), /not found/);

const ranked = await fetchCandidates({
  adapterIds: ["google-news"],
  fixtureByAdapter: { "google-news": fixture },
  now,
});

const investigation = await fetchCandidates({
  mode: "investigation",
  query: "제주 초등학교 교실 침입",
  queries: investigationQueries({ topic: "제주 초등학교 교실 침입", keywords: ["텀블러", "경찰", "영장"] }),
  adapterIds: ["google-news"],
  fixtureByAdapter: { "google-news": fixture },
  now,
});
assert.ok(investigation.adapters.every((adapter) => adapter.id === "google-news"));
assert.ok(investigation.candidates.every((candidate) => `${candidate.title}`.includes("제주") || `${candidate.title}`.includes("초등학교") || `${candidate.title}`.includes("교실") || `${candidate.title}`.includes("침입")));
const investigationUrls = [];
await fetchCandidates({ mode: "investigation", query: "제주 초등학교", adapterIds: ["google-news"], fetchImpl: async (url) => { investigationUrls.push(String(url)); return { ok: true, text: async () => fixture }; } });
assert.ok(investigationUrls.length > 0 && investigationUrls.every((url) => !url.includes("when%3A2d")));
assert.equal(ranked.candidates.length, 4);
assert.equal(ranked.candidates[0].title, "아파트 주차장 출입구 막혀 주민들 불편, 황당한 상황");
assert.match(ranked.candidates[0].id, /^n-[a-f0-9]{16}$/);
assert.ok(ranked.candidates[0].score >= ranked.candidates[1].score);
assert.deepEqual(Object.keys(ranked.candidates[0].scoreDetail), [
  "proximity", "frustration", "fear", "absurdity", "actionability", "noisePenalty",
  "everydayProximity", "inexplicableBehavior", "sustainedVictimFear", "institutionalFrustration", "solutionPotential", "visualizability",
]);
const productNoise = ranked.candidates.find((item) => item.title === "대기업 신제품 출시 이벤트 개최");
assert.ok(productNoise);
assert.equal(productNoise.scoreDetail.noisePenalty, 30);

const olderEverydayAlarm = scoreCandidate({
  title: "우리 동네 아파트 화재 대피 경보, 주민 확인 필요",
  source: "지역뉴스",
  url: "https://example.test/news/alarm",
  publishedAt: "2026-07-23T20:00:00.000Z",
}, now);
const freshLowSignal = scoreCandidate({
  title: "정치권 인사말 발표 속보",
  source: "정치일보",
  url: "https://example.test/news/politics",
  publishedAt: "2026-07-24T07:55:00.000Z",
}, now);
assert.ok(olderEverydayAlarm.score > freshLowSignal.score, "nearby alarming incident should outrank fresh low-signal noise");
assert.ok(olderEverydayAlarm.scoreDetail.proximity > 0);
assert.ok(olderEverydayAlarm.scoreDetail.fear > 0);
assert.equal(freshLowSignal.scoreDetail.noisePenalty > 0, true);

const jejuClassroom = scoreCandidate({
  title: "제주 초등학교 교실에 낯선 남성 침입 학생들 공포 학교는 뒤늦게 대응",
  description: "경찰이 CCTV를 확인하고 재발 방지 대책을 조사 중이다.",
  source: "지역뉴스",
  url: "https://example.test/news/jeju-classroom",
  publishedAt: now.toISOString(),
}, now);
assert.equal(jejuClassroom.selected, true, "everyday intrusion with sustained fear should be selected");
assert.ok(jejuClassroom.score >= 70);
assert.equal(jejuClassroom.scoreBreakdown.everydayProximity, 20, "a location name must not add generic everyday-proximity points");
assert.match(jejuClassroom.selectionReason, /선정.*기준 70/);
assert.deepEqual(Object.keys(jejuClassroom.scoreBreakdown), [
  "everydayProximity", "inexplicableBehavior", "sustainedVictimFear", "institutionalFrustration", "solutionPotential", "visualizability",
]);
const irrelevant = scoreCandidate({
  title: "대기업 신제품 출시 이벤트 개최",
  source: "경제일보",
  url: "https://example.test/news/product",
  publishedAt: now.toISOString(),
}, now);
assert.equal(irrelevant.selected, false);
assert.match(irrelevant.selectionReason, /보류.*기준 70 미달/);

const institutionalFailure = scoreCandidate({
  title: "아파트 주민들 반복 민원에도 관리사무소 외면, 구청은 늑장 대응해 피해 계속",
  description: "입주민들이 신고와 대책을 요구했지만 기관 답변이 없고 불안이 이어졌다.",
  source: "지역뉴스",
  url: "https://example.test/news/institution",
  publishedAt: now.toISOString(),
}, now);
assert.ok(institutionalFailure.scoreBreakdown.institutionalFrustration >= 15);
assert.ok(institutionalFailure.scoreEvidence.institutionalFrustration.length >= 3);

const candidate = allowedCandidate(ranked.candidates[0]);
const draft = {
  generator: "fixture-seven-sections",
  sections: {
    hook: candidate.title,
    incident: "fixture incident",
    timeline: "[확인 필요] fixture timeline",
    frustrating: "[확인 필요] fixture conflict",
    solution: "[확인 필요] fixture result",
    legal: "fixture legal context",
    confirmation: "[확인 필요] fixture confirmation",
  },
};
const newsroomProject = buildNewsroomProjectConfig({ jobId: "job-contract-test", candidate, draft });
const mediaProject = buildNewsroomProjectConfig({ jobId: "job-media-contract", candidate, draft, mediaState: {
  bgm: { provider: "stable-audio-3", prompt: "restrained tension", status: "ready-to-render", volumeDb: -25, duckUnderNarration: true },
  clips: [{ path: "../assets/approved-clip-01.mp4", rightsAttested: true, startSeconds: 0, endSeconds: 3 }],
} });
assert.equal(mediaProject.project.bgm.provider, "stable-audio-3");
assert.equal(mediaProject.project.media.clips[0].path, "../assets/approved-clip-01.mp4");
const mediaValidationDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-media-project-"));
fs.writeFileSync(path.join(mediaValidationDir, "script.final.json"), `${JSON.stringify(mediaProject.scriptAuthority)}\n`, "utf8");
assert.equal(validateProject(mediaProject.project, mediaValidationDir).bgm.provider, "stable-audio-3");
fs.rmSync(mediaValidationDir, { recursive: true, force: true });
assert.deepEqual(newsroomProject.project.captionPreset, REFERENCE_CAPTION_PRESET);
assert.match(newsroomProject.project.scriptSource, /\.json$/i, 'newsroom projects must point at finalized script JSON');
assert.equal(Object.hasOwn(newsroomProject.project, 'scriptFile'), false, 'newsroom projects must not fall back to an ad-hoc script.txt');
const qwenNarration = newsroomProject.project.narration;
assert.doesNotMatch(JSON.stringify(qwenNarration), /gyogwon|teacher|classroom/i, 'generic newsroom narration must not pin a topic-specific reference');
if (qwenNarration.style === 'auto') {
  assert.equal(qwenNarration.referenceAudio, undefined);
  assert.equal(qwenNarration.referenceTranscript, undefined);
} else {
  assert.equal(qwenNarration.style || 'neutral', 'neutral', 'non-auto newsroom Qwen style must be the verified neutral default');
  assert.equal(typeof qwenNarration.referenceAudio, 'string');
  assert.equal(typeof qwenNarration.referenceTranscript, 'string');
}
assert.equal(Object.hasOwn(newsroomProject.project, 'media'), false, 'absent newsroom slugs must not inherit media');
assert.equal(await loadMediaState('missing-generic-newsroom-slug'), null);
const mismatchedMediaSlug = 'fixture-media-mismatch';
const mismatchedMediaPath = path.join(AUTOMATION_ROOT, 'production', 'newsroom', 'projects', `${mismatchedMediaSlug}.media.json`);
await fsp.writeFile(mismatchedMediaPath, `${JSON.stringify({ slug: 'different-media-slug', clips: [] })}\n`, 'utf8');
try { await assert.rejects(() => loadMediaState(mismatchedMediaSlug), /slug does not match/); } finally { await fsp.rm(mismatchedMediaPath, { force: true }); }
const mediaMaterializeRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'newsroom-media-materialize-'));
try {
  const assetsDir = path.join(mediaMaterializeRoot, 'assets'); const projectDir = path.join(mediaMaterializeRoot, 'project');
  await fsp.mkdir(assetsDir); await fsp.mkdir(projectDir);
  await assert.rejects(() => materializeMediaState({ slug: '../escape', clips: [] }, assetsDir, projectDir), /Invalid or mismatched/);
  const remoteBgmOnly = await materializeMediaState({ slug: 'remote-media-state', bgm: { provider: 'stable-audio-3', status: 'ready-to-render' } }, assetsDir, projectDir, 'remote-media-state');
  assert.equal(remoteBgmOnly.bgm.provider, 'stable-audio-3');
} finally { await fsp.rm(mediaMaterializeRoot, { recursive: true, force: true }); }
const newsroomLibSource = await fsp.readFile(path.join(AUTOMATION_ROOT, 'scripts', 'newsroom-lib.mjs'), 'utf8');
const producerSource = await fsp.readFile(path.join(AUTOMATION_ROOT, 'scripts', 'produce-short.mjs'), 'utf8');
assert.doesNotMatch(newsroomLibSource, /request\.slug\s*\|\|\s*(?:\x22|\x27)jeju-school-intrusion/);
assert.doesNotMatch(producerSource, /project\.narration\.subtitleSource \|\| .*school-case-assets/);
assert.match(producerSource, /project-specific scriptFile or narration\.subtitleSource is required/);
assert.equal(newsroomProject.project.narration.mode, "qwen3-tts");
assert.equal(newsroomProject.project.narration.device, "cuda");
assert.equal(Object.hasOwn(newsroomProject.project, "approvedMedia"), false);
assert.equal(newsroomProject.script.split("\n\n").length, 7);
assert.equal(draft.generator, "fixture-seven-sections");
assert.deepEqual(unresolvedSections(draft), ["timeline", "frustrating", "solution", "confirmation"]);
assert.doesNotMatch(JSON.stringify(draft), /본문 설명|저장 금지/);
assert.deepEqual(Object.keys(validateDraft(draft).sections), ["hook", "incident", "timeline", "frustrating", "solution", "legal", "confirmation"]);
assert.throws(() => validateDraft({ sections: {} }), /hook/);

const title = splitTitle("지역 학교 통학로 안전 점검 확대");
assert.ok(title.line1.length > 0 && title.line2.length > 0);
assert.equal(isSafeId("job-abc123"), true);
assert.equal(isSafeId("../escape"), false);
assert.throws(() => assertContained(JOBS_ROOT, path.join(JOBS_ROOT, "..", "escape")), /escapes/);

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (body, headers = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (key) => headers[key.toLowerCase()] || "" },
  arrayBuffer: async () => Buffer.from(body),
});
const mediaArticle = {
  title: "사진 후보 기사",
  source: "Fixture",
  url: "https://news.example.test/story",
  publishedAt: now.toISOString(),
};
const mediaHtml = `<html><meta property="og:image" content="https://cdn.example.test/photo.jpg"><meta name="twitter:image" content="https://cdn.example.test/photo.jpg"><script type="application/ld+json">{"image":"https://cdn.example.test/second.webp"}</script></html>`;
const extracted = await extractImageCandidates(mediaArticle, {
  lookup: publicLookup,
  fetchImpl: async () => response(mediaHtml, { "content-type": "text/html" }),
});
assert.equal(extracted.images.length, 2, "image candidates are deduplicated");
assert.equal(extracted.images[0].rightsStatus, "needs-review");
assert.equal(extracted.images[0].approved, false);
await assert.rejects(() => assertPublicRemoteUrl("http://127.0.0.1/private", { lookup: publicLookup }), /private|reserved/i);
await assert.rejects(() => downloadApprovedImages("job-media-ssrf", [{ url: "https://cdn.example.test/photo.jpg", approved: true }], { mediaAcknowledged: false, lookup: publicLookup }), /acknowledgement/i);
const mediaJobId = `job-media-${Date.now().toString(36)}`;
const mediaJobDir = path.join(JOBS_ROOT, mediaJobId);
await fsp.mkdir(mediaJobDir, { recursive: true });
try {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const downloaded = await downloadApprovedImages(mediaJobId, [{ id: extracted.images[0].id, url: extracted.images[0].url, approved: true, extractionMethod: "og:image" }], {
    mediaAcknowledged: true,
    lookup: publicLookup,
    fetchImpl: async () => response(png, { "content-type": "image/png" }),
  });
  assert.equal(downloaded.length, 1);
  assert.equal(fs.existsSync(downloaded[0].path), true);
  assert.equal(JSON.parse(await fsp.readFile(path.join(mediaJobDir, "media.json"), "utf8")).downloaded.length, 1);
  await assert.rejects(() => downloadApprovedImages(mediaJobId, [{ url: extracted.images[0].url, approved: true }], {
    mediaAcknowledged: true,
    lookup: publicLookup,
    fetchImpl: async () => response(Buffer.alloc(MAX_REMOTE_IMAGE_BYTES + 1), { "content-type": "image/png" }),
  }), /size limit/i);
} finally {
  await fsp.rm(mediaJobDir, { recursive: true, force: true });
}

if (process.argv.includes("--live")) {
  const live = await fetchCandidates({ query: "사회 안전", limit: 3 });
  assert.ok(live.candidates.length > 0, `Live adapters returned no candidates: ${JSON.stringify(live.errors)}`);
  console.log(`Optional live smoke passed (${live.candidates.length} candidates)`);
}

if (process.argv.includes("--render-smoke")) {
  const jobId = `job-smoke-${Date.now().toString(36)}`;
  const jobDir = path.join(JOBS_ROOT, jobId);
  const latestPath = path.join(AUTOMATION_ROOT, "out", "latest-render.json");
  const latestBefore = fs.existsSync(latestPath) ? await fsp.readFile(latestPath, "utf8") : null;
  const shortDraft = {
    generator: "fixture-smoke",
    sections: {
      hook: "지역 안전 소식입니다.",
      incident: "학교 통학로 점검이 확대됐습니다.",
      timeline: "오늘 점검 계획이 발표됐습니다.",
      frustrating: "보행 안전 우려가 이어졌습니다.",
      solution: "현장 점검과 보완이 진행됩니다.",
      legal: "뉴스 이미지는 사용하지 않습니다.",
      confirmation: "출처와 날짜를 확인했습니다.",
    },
  };
  await fsp.mkdir(path.join(jobDir, "assets"), { recursive: true });
  const createdAt = new Date().toISOString();
  await Promise.all([
    fsp.writeFile(path.join(jobDir, "request.json"), `${JSON.stringify({ candidate, draft: shortDraft, confirmUnverified: false }, null, 2)}\n`),
    fsp.writeFile(path.join(jobDir, "status.json"), `${JSON.stringify({ jobId, state: "queued", progress: 2, createdAt, logs: [] }, null, 2)}\n`),
  ]);
  try {
    await runRenderJob(jobId);
    const status = JSON.parse(await fsp.readFile(path.join(jobDir, "status.json"), "utf8"));
    assert.equal(status.state, "completed");
    assert.equal(status.render.templateId, "reference-v3");
    assert.equal(status.render.renderPath.includes(`${path.sep}.private${path.sep}`), true);
    assert.equal(fs.existsSync(status.render.renderPath), true);
    assert.equal(fs.existsSync(status.render.thumbnailPath), true);
    assert.equal(fs.existsSync(status.render.handoffPath), true);
    const handoff = JSON.parse(await fsp.readFile(status.render.handoffPath, "utf8"));
    assert.deepEqual(handoff.captionPreset, REFERENCE_CAPTION_PRESET);
    assert.equal(handoff.editableTrackContract?.script?.status, 'ready', 'OpenCut handoff script track must be ready');
    assert.equal(handoff.editableTrackContract?.script?.representation, 'authoritative-json');
    assert.equal(typeof handoff.editableTrackContract?.script?.asset, 'string');
    assert.equal(handoff.tracks.filter((track) => track.type === "video").length, 12);
    assert.equal(handoff.tracks.filter((track) => track.type === "audio").length, 1);
    assert.equal(handoff.tracks.filter((track) => track.type === "text").length, 2);
    assert.equal(handoff.cues.length > 0, true);
    assert.equal(handoff.cues.every((cue) => cue.text.split(/\r?\n/).length <= 2), true);
    assert.equal(handoff.tracks.filter((track) => track.type === "video").every((track) => track.videoStyle?.fit === "cover"), true);
    const latestAfter = fs.existsSync(latestPath) ? await fsp.readFile(latestPath, "utf8") : null;
    assert.equal(latestAfter, latestBefore, "private newsroom render changed out/latest-render.json");
    await fsp.rm(path.dirname(status.render.renderPath), { recursive: true, force: true });
    console.log(`Private newsroom render smoke passed (${status.render.frames} frames)`);
  } finally {
    await fsp.rm(jobDir, { recursive: true, force: true });
  }
}

const handoffCandidate = { title: "Verified hospital incident", source: "Fixture", url: "https://example.test/verified", publishedAt: "2026-01-01T00:00:00Z", hook: "A verified hospital incident was reviewed.", storySummary: "Two independent reports confirm the incident and later court decision.", rationale: "Context", styleProfile: { template: "chronological-case-history", tone: "restrained-investigative", pacing: "short-form-chronological" } };
const sharedClaims = [
  { field: "incident", value: "hospital-incident", date: "2026-01-01", category: "confirmedFacts", summary: "2026년 1월 1일 병원에서 사건이 발생했다." },
  { field: "decision", value: "court-decision", date: "2026-02-01", category: "trialStagesAndSentenceChanges", perspective: "court", summary: "2026년 2월 1일 재판부가 사건을 판단했다." },
  { field: "finding", value: "bounded-finding", category: "courtFindings", perspective: "court", summary: "재판부는 확인된 기록 범위에서 책임을 인정했다." },
];
const verifiedContent = { status: "verified", reason: "fixture" };
const handoffSnapshot = { slug: "fixture", fetchedAt: "2026-01-01T00:00:00Z", sources: [
  { title: "Verified incident A", publisher: "Desk A", url: handoffCandidate.url, status: "verified", contentVerification: verifiedContent, extractedClaims: [...sharedClaims, { field: "prosecution", value: "intent", category: "prosecutionClaims", perspective: "prosecution", summary: "고의로 행동했다." }] },
  { title: "Verified incident B", publisher: "Desk B", url: "https://example.test/verified-b", status: "verified", contentVerification: verifiedContent, extractedClaims: sharedClaims },
], relatedCoverage: [{ title: "Rejected", url: "https://example.test/rejected", status: "candidate", sameEvent: { verified: false } }], followUps: [], laws: [{ title: "대법원 판례: 검증 사건", url: "https://law.go.kr/fixture", status: "verified", kind: "precedent", court: "대법원", legalPrinciple: "고의와 결과를 공개된 증거로 판단한다.", comparison: "현재 사건도 증거 범위에서 비교한다." }], contradictions: [], unknowns: ["정확한 동기"] };
handoffSnapshot.eventDossier = buildEventDossier({ slug: "fixture", candidate: handoffCandidate, researchSnapshot: handoffSnapshot, generatedAt: "2026-01-01T00:00:00Z" });
const handoffLegal = legalContextModule.buildLegalContextReport({ slug: "fixture", candidate: handoffCandidate, researchSnapshot: handoffSnapshot, generatedAt: "2026-01-01T00:00:00Z" });
const investigationOnlyCandidate = { ...handoffCandidate, title: "수사 단계 사건", url: "https://example.test/investigation-only" };
const investigationOnlySnapshot = { slug: "investigation-only", fetchedAt: "2026-01-01T00:00:00Z", sources: [{ title: "수사 단계 보도", publisher: "Desk A", url: investigationOnlyCandidate.url, status: "verified", contentVerification: verifiedContent, extractedClaims: [
  { field: "incident", value: "incident", category: "confirmedFacts", summary: "사건의 핵심 행동이 확인됐다." },
  { field: "complaint", value: "complaint", category: "investigationAndCharges", summary: "피해자의 고소로 수사가 시작됐다." },
  { field: "booking", value: "booking", category: "investigationAndCharges", summary: "관계자가 혐의로 입건됐다." },
  { field: "search", value: "search", category: "investigationAndCharges", summary: "수사기관이 압수수색에 착수했다." },
]}], relatedCoverage: [], followUps: [], laws: [], contradictions: [], unknowns: [] };
investigationOnlySnapshot.eventDossier = buildEventDossier({ slug: "investigation-only", candidate: investigationOnlyCandidate, researchSnapshot: investigationOnlySnapshot, generatedAt: "2026-01-01T00:00:00Z" });
const investigationOnlyLegal = legalContextModule.buildLegalContextReport({ slug: "investigation-only", candidate: investigationOnlyCandidate, researchSnapshot: investigationOnlySnapshot, generatedAt: "2026-01-01T00:00:00Z" });
assert.ok(investigationOnlyLegal.scriptWritingReview.required.every((item) => !item.includes("단일 출처") && !item.includes("출처에 귀속")), "single-source cases must not force a YouTube narration attribution prefix");
assert.equal(investigationOnlyLegal.scriptPolicy.sourceAttribution.mode, "not-required");
assert.ok(investigationOnlyLegal.scriptWritingReview.required.some((item) => item.includes("발견·신고·입건·강제수사")), "investigation-only cases must describe their actual progression");
assert.equal(investigationOnlyLegal.scriptWritingReview.required.some((item) => /1심|항소심/u.test(item)), false, "investigation-only cases must not receive invented trial-stage instructions");
assert.equal(investigationOnlyLegal.scriptWritingReview.required.some((item) => /불일치|미확인/u.test(item)), false, "absent conflicts must not become mandatory filler");
const noPrecedentSnapshot = structuredClone(handoffSnapshot);
delete noPrecedentSnapshot.eventDossier;
noPrecedentSnapshot.laws = [];
noPrecedentSnapshot.eventDossier = buildEventDossier({ slug: "fixture", candidate: handoffCandidate, researchSnapshot: noPrecedentSnapshot, generatedAt: "2026-01-01T00:00:00Z" });
const noPrecedentLegal = legalContextModule.buildLegalContextReport({ slug: "fixture", candidate: handoffCandidate, researchSnapshot: noPrecedentSnapshot, generatedAt: "2026-01-01T00:00:00Z" });
assert.equal(noPrecedentLegal.caseDispositionReview.status, "complete", "a verified no-result precedent search must not deadlock Stage 03");
assert.equal(noPrecedentLegal.reviewCompletion.allComplete, true);
assert.match(noPrecedentLegal.caseDispositionReview.assessment, /비교 결론을 만들지 않고/);
const currentLegalBeforePolicyFixture = structuredClone(handoffLegal);
assert.equal(handoffLegal.schemaVersion, 5);
assert.equal(handoffLegal.scriptPolicy.version, 2);
assert.equal(handoffLegal.videoDecision.decision, "conditional");
assert.equal(handoffLegal.evidence.independentPublisherCount, 2);
assert.equal(legalContextModule.isCurrentLegalContextReport({ report: currentLegalBeforePolicyFixture, candidate: handoffCandidate, researchSnapshot: handoffSnapshot }), true);
const handoffPackage = buildDraftInputPackage({ candidate: handoffCandidate, researchSnapshot: handoffSnapshot, legalReport: handoffLegal });
const serializedPackage = JSON.stringify(handoffPackage);
assert.doesNotMatch(serializedPackage, /https?:\/\//i, "Stage03 package must contain no URLs");
assert.deepEqual(Object.keys(handoffPackage).sort(), ["caseHistory", "generationGuidance", "legalPolicy", "policyBinding", "schemaVersion", "videoDecision"]);
assert.equal(handoffPackage.schemaVersion, 8);
assert.equal(handoffPackage.generationGuidance.durationAuthority, "owner-narration-locked-timing");
const blockedLegal = { ...handoffLegal, videoDecision: { decision: "block", reasons: ["Insufficient support"] } };
assert.throws(() => buildDraftInputPackage({ candidate: handoffCandidate, researchSnapshot: handoffSnapshot, legalReport: blockedLegal }), /allow or conditional legal decision/, "block decision must prohibit generation");
const changedSnapshot = structuredClone(handoffSnapshot);
changedSnapshot.unknowns.push("새 미확인 사항");
assert.equal(legalContextModule.isCurrentLegalContextReport({ report: currentLegalBeforePolicyFixture, candidate: handoffCandidate, researchSnapshot: changedSnapshot }), false, "research changes must force legal re-review");
assert.match(newsroomCliSource, /await generateCodexDraftCandidates\(payload\)/u, "draft CLI must delegate approved packages to the single autonomous narration generator");
const rejectedRaw = spawnSync(process.execPath, [path.join(AUTOMATION_ROOT, "scripts", "newsroom-cli.mjs"), "draft"], { input: JSON.stringify({ candidate: handoffCandidate, researchSnapshot: handoffSnapshot, legalReport: handoffLegal }), encoding: "utf8" });
assert.notEqual(rejectedRaw.status, 0, "draft CLI must reject raw research input");
console.log("Newsroom fixture tests passed");
