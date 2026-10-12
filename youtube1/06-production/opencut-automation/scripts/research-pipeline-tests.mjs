import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildResearchConfigFromCandidate, ensureResearchConfig, verifyWebSource, loadResearchSnapshot, isRelevantFollowUp, isRelevantJejuFollowUp, refreshResearchSnapshot, classifySameEvent, deriveEventSemanticFacets } from "./research-pipeline.mjs";

const pesticideFingerprint = {
  anchors: ["직장", "동료", "커피", "살충제", "간호조무사", "2심", "감형"],
  distinctiveAnchors: [
    { name: "coffee", terms: ["커피", "음료", "컵"] },
    { name: "pesticide", terms: ["살충제", "농약", "독극물"] },
    { name: "nurse-assistant", terms: ["간호조무사", "간호사"] },
    { name: "appeal", terms: ["2심", "항소", "감형"] },
  ],
  minDistinctiveMatches: 3,
  minTotalMatches: 3,
};
assert.equal(classifySameEvent({ title: "직장 동료 커피에 살충제 탄 간호조무사 2심 감형" }, pesticideFingerprint).verified, true);
assert.equal(classifySameEvent({ title: "직장 동료 카카오톡 살인 사건" }, pesticideFingerprint).verified, false);
assert.equal(classifySameEvent({ title: "동료 살인 사건 후속" }, { anchors: ["동료", "사건"], minTotalMatches: 2 }).verified, false, "no distinctive fingerprint must fail closed");
assert.equal(classifySameEvent({ title: "간호사가 음료에 농약을 넣어 항소심 감형" }, pesticideFingerprint).verified, true, "Korean title variants and synonyms should match");

const roadRageRepresentative = "5살 자녀 태우고 모녀 차량 보복운전 흉기 든 운전자 영장. 대구 수성구 도로에서 여성 운전자와 중학생 딸이 탄 차를 추격해 들이받고 가짜 권총으로 위협한 뒤 송곳으로 타이어를 찔렀다. 가해 운전자는 자신의 5살 딸을 차에 태우고 있었다. 사건은 지난달 27일 발생했다.";
const roadRageFingerprint = {
  anchors: ["5살", "자녀", "태우고", "모녀", "차량", "보복운전", "흉기", "운전자", "영장"],
  distinctiveAnchors: [{ name: "5살", terms: ["5살"] }, { name: "자녀", terms: ["자녀"] }, { name: "태우고", terms: ["태우고"] }, { name: "모녀", terms: ["모녀"] }],
  minDistinctiveMatches: 2,
  minTotalMatches: 3,
  semanticFacets: deriveEventSemanticFacets(roadRageRepresentative),
};
const news1RoadRage = { title: "총 겨누고 송곳으로 타이어 '콕콕'…5살 딸 태우고 모녀에 보복 운전", snippet: "지난달 27일 대구 수성구 도로에서 여성 운전자와 중학생 딸을 8분간 추격하고 차량을 들이받아 가짜 권총과 송곳으로 위협했다." };
const segyeRoadRage = { title: "5살 딸 태우고 보복 운전…가짜 권총·송곳으로 모녀 위협한 40대", snippet: "대구 수성경찰서는 차량 추돌과 권총 위협, 타이어를 송곳으로 찌른 운전자를 구속했다. 피해 차량에는 여성과 10대 딸이 타고 있었다." };
const busanSpouseHomicide = { title: "'5살 자녀 앞 아내 살해' 현직 공무원 영장 신청…스마트워치도 못 막아", snippet: "경기 광주시 다세대주택에서 가정폭력으로 피신한 아내를 흉기로 살해한 공무원에게 살인 혐의 구속영장이 신청됐다. 5살 자녀가 현장에 있었다." };
assert.equal(classifySameEvent(news1RoadRage, roadRageFingerprint).verified, true, "News1 road-rage coverage must retain the matching location/action/participant fingerprint");
assert.equal(classifySameEvent(segyeRoadRage, roadRageFingerprint).verified, true, "Segye road-rage follow-up must retain the matching location/action/participant fingerprint");
const rejectedBusan = classifySameEvent(busanSpouseHomicide, roadRageFingerprint);
assert.equal(rejectedBusan.verified, false, "the Busan spouse-homicide article must not pass on shared age/child/warrant terms");
assert.equal(rejectedBusan.rejectionReason, "conflicting-location-fingerprint");
assert.deepEqual(rejectedBusan.semanticMatch.sharedActions, []);
assert.deepEqual(rejectedBusan.semanticMatch.sharedRoles, []);

const response = (html, status = 200) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => Buffer.from(html.replace(/<article>([\s\S]*?)<\/article>/i, (_, body) => `<article>${body} This fixture contains enough article context and corroborating detail for a deterministic content verification decision by the newsroom rights review.</article>`).replace(/("articleBody"\s*:\s*"[^"]*)"/i, '$1 CCTV evidence provides corroborating context for this verified article source and editorial review."'), "utf8") });
const html = `<html><head><title>제주 사건 후속</title><meta property="og:title" content="제주 사건 후속 확인"><meta property="article:published_time" content="2026-07-26T00:00:00Z"><meta property="og:description" content="요약 설명"></head><body><article>앞부분 내비게이션이 아니라 본문 증거입니다.</article><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","articleBody":"경찰은 CCTV를 확인했다고 밝혔다."}]}</script></body></html>`;
const verified = await verifyWebSource({ publisher: "fixture", title: "CCTV evidence", expectedTokens: ["CCTV", "경찰"], url: "https://example.test/article" }, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => response(html) });
assert.equal(verified.status, "verified");
assert.equal(verified.title, "제주 사건 후속 확인");
assert.match(verified.snippet, /경찰은 CCTV/);
assert.doesNotMatch(verified.snippet, /앞부분 내비게이션/);
assert.ok(verified.fetchedAt);
const articlePreferred = await verifyWebSource({ publisher: "fixture", title: "경찰 증거 수사", expectedTokens: ["경찰", "증거"], url: "https://example.test/full-article" }, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => response(`<html><head><meta property="og:title" content="경찰 증거 수사"><meta property="og:description" content="경찰 증거 수사 요약만 있습니다."></head><body><article>경찰은 핵심 증거를 확보했습니다. 수사팀은 관련자를 입건했고 자택 압수수색에 착수했습니다. 피해자의 고소 뒤 사건을 검찰에 송치했습니다.</article></body></html>`) });
assert.match(articlePreferred.snippet, /압수수색/u, "full article body must win over the short social description");
assert.doesNotMatch(articlePreferred.snippet, /요약만/u);
const nextPayloadPreferred = await verifyWebSource({ publisher: "fixture", title: "제주 실종 신고 허위 종결", expectedTokens: ["제주", "실종"], url: "https://example.test/next-payload" }, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => response(`<html><head><meta property="og:title" content="제주 실종 신고 허위 종결"><meta property="og:description" content="제주 실종 신고 허위 종결 사건의 짧은 요약 설명만 제공합니다."></head><body><script>window.__article={"articleBody":"제주 경찰은 실종 신고 기록을 삭제했습니다. 이후 전수조사에서 추가 사례를 확인했습니다. 수사팀은 담당 경찰관을 송치했고 지휘 책임도 조사했습니다. 유가족은 신고 처리 과정에 대한 진상 규명을 요구했습니다."};</script></body></html>`) });
assert.match(nextPayloadPreferred.snippet, /전수조사/u, "project research must extract the same embedded Next/JTBC article body as shortlist research");
assert.doesNotMatch(nextPayloadPreferred.snippet, /짧은 요약/u);
const softPage = await verifyWebSource({ title: "Jeju school incident", url: "https://example.test/login" }, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => response("<html><head><title>Sign in</title></head><body><main>Please sign in to verify you are human before continuing.</main></body></html>") });
assert.equal(softPage.status, "content-unverified");
assert.equal(softPage.contentVerification.reason, "blocked-or-challenge-page");
const unrelatedPage = await verifyWebSource({ title: "Jeju school incident", url: "https://example.test/unrelated" }, { lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => response("<html><head><title>Sports results</title></head><body><article>This long article describes unrelated football results, league tables, and match statistics for the weekend.</article></body></html>") });
assert.equal(unrelatedPage.status, "content-unverified");
assert.equal(unrelatedPage.contentVerification.reason, "title-content-mismatch");
assert.equal(isRelevantJejuFollowUp({ title: "제주 학교 텀블러 체액 사건 후속" }), true);
assert.equal(isRelevantJejuFollowUp({ title: "중국인 관광객 학교 촬영 사건" }), false);
assert.equal(isRelevantJejuFollowUp({ title: "제주 학교 안전 일반 보도" }), false);
assert.equal(await loadResearchSnapshot("missing-project"), null);
await assert.rejects(() => loadResearchSnapshot("../escape"), /Invalid newsroom project slug/);
const productionSnapshot = path.join(process.cwd(), "production", "newsroom", "projects", "jeju-school-intrusion.research.json");
const beforeHash = fsSync.existsSync(productionSnapshot) ? crypto.createHash("sha256").update(fsSync.readFileSync(productionSnapshot)).digest("hex") : null;
const immutableAuditSource = path.join(process.cwd(), "..", "..", "01-research", "data", "news-media-audit", "20260726-jeju-classroom-intrusion", "headlinejeju.html");
const immutableAuditHash = fsSync.existsSync(immutableAuditSource) ? crypto.createHash("sha256").update(fsSync.readFileSync(immutableAuditSource)).digest("hex") : null;
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "research-pipeline-isolated-"));
try {
  const fixtureResponse = (body) => ({ ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(body.replace(/<article>([\s\S]*?)<\/article>/i, (_, text) => `<article>${text} 제주 초등학교 교실 침입 This fixture article includes enough corroborating detail and context for deterministic source verification and editorial review.</article>`), "utf8") });
  const isolated = await refreshResearchSnapshot({ slug: "jeju-school-intrusion", snapshotRoot: tempRoot, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => fixtureResponse("<html><head><title>fixture source</title></head><body><article>fixture evidence</article></body></html>") });
  assert.equal(isolated.counts.sources, 4);
  assert.equal(isolated.counts.laws, 0, "fixture law pages are unrelated and must fail content verification");
  assert.equal(fsSync.existsSync(path.join(tempRoot, "jeju-school-intrusion.research.json")), true);
  await fs.writeFile(path.join(tempRoot, "broken-snapshot.research.json"), "{broken", "utf8");
  await assert.rejects(() => loadResearchSnapshot("broken-snapshot", tempRoot), /Invalid research snapshot/);
  const autoSlug = "bakery-smoking-confrontation";
  const autoCandidate = {
    title: "빵집 앞 흡연 제지에 어깨 충돌 난동",
    source: "테스트 뉴스",
    url: "https://example.test/bakery",
    hook: "흡연 장소를 옮겨 달라는 부탁 뒤 물리적 위협이 이어졌습니다.",
    storySummary: "빵집 앞에서 시작된 흡연 갈등이 폭언과 물리적 충돌로 확대됐습니다.",
    relatedCoverage: [{ source: "교차 뉴스", title: "빵집 흡연 갈등 후속", url: "https://example.test/bakery-followup" }],
  };
  const builtConfig = buildResearchConfigFromCandidate(autoSlug, autoCandidate);
  assert.ok(builtConfig.keywords.includes("빵집"));
  assert.deepEqual(builtConfig.adapterIds, ["google-news", "yonhaptv", "naver-news", "daum-news", "news1-society"], "promoted projects must retain shortlist discovery channels");
  assert.equal(builtConfig.sources.length, 1, "unverified related coverage must not become an authoritative source");
  assert.equal(builtConfig.sources[0].url, autoCandidate.url);
  const gatedSlug = "configured-secondary-gate";
  const primaryTitle = "빵집 앞 흡연 제지에 어깨 충돌 난동";
  const sameEventTitle = "빵집 흡연 제지 어깨 충돌 후속";
  const unrelatedTitle = "남성 결국 사망한 별도 사건";
  await fs.writeFile(path.join(tempRoot, `${gatedSlug}.research.config.json`), `${JSON.stringify({
    schemaVersion: 1,
    slug: gatedSlug,
    topic: primaryTitle,
    query: primaryTitle,
    keywords: ["빵집", "흡연", "제지", "어깨", "충돌"],
    adapterIds: [],
    sources: [
      { publisher: "주요 매체", title: primaryTitle, url: "https://example.test/gated-primary" },
      { publisher: "교차 매체", title: sameEventTitle, url: "https://example.test/gated-same-event" },
      { publisher: "다른 매체", title: unrelatedTitle, url: "https://example.test/gated-unrelated" },
    ],
    laws: [],
    relevance: {
      anchors: ["빵집", "흡연", "제지", "어깨", "충돌"],
      distinctiveAnchors: [{ name: "bakery", terms: ["빵집"] }, { name: "smoking", terms: ["흡연"] }],
      minDistinctiveMatches: 2,
      minTotalMatches: 2,
    },
    eventFingerprint: {
      anchors: ["빵집", "흡연", "제지", "어깨", "충돌"],
      distinctiveAnchors: [{ name: "bakery", terms: ["빵집"] }, { name: "smoking", terms: ["흡연"] }],
      minDistinctiveMatches: 2,
      minTotalMatches: 2,
    },
  }, null, 2)}\n`, "utf8");
  const gatedHtml = new Map([
    ["https://example.test/gated-primary", primaryTitle],
    ["https://example.test/gated-same-event", sameEventTitle],
    ["https://example.test/gated-unrelated", unrelatedTitle],
  ]);
  const gatedSnapshot = await refreshResearchSnapshot({
    slug: gatedSlug,
    configRoot: tempRoot,
    snapshotRoot: tempRoot,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (url) => {
      const title = gatedHtml.get(String(url));
      return fixtureResponse(`<html><head><title>${title}</title></head><body><article>${title} 원문에는 사건 경위와 현장 설명이 충분히 포함되어 있습니다. 추가 확인 가능한 본문 근거입니다.</article></body></html>`);
    },
    topicMediaSearch: async () => ({ status: "ready", candidates: [], errors: [] }),
  });
  assert.equal(gatedSnapshot.counts.sources, 1, "configured secondary sources must not inflate authoritative source count");
  assert.deepEqual(gatedSnapshot.sources.map((source) => source.url), ["https://example.test/gated-primary"]);
  assert.deepEqual(gatedSnapshot.relatedCoverage.map((source) => source.url), ["https://example.test/gated-same-event"]);
  assert.ok(gatedSnapshot.errors.some((error) => error.url === "https://example.test/gated-unrelated"), "rejected secondary source should be observable");
  const roadSlug = "daegu-road-rage-event-gate";
  const roadUrls = {
    primary: "https://insight.example/road-rage",
    news1: "https://news1.example/road-rage",
    segye: "https://segye.example/road-rage-followup",
    busan: "https://busan.example/spouse-homicide",
  };
  await fs.writeFile(path.join(tempRoot, `${roadSlug}.research.config.json`), `${JSON.stringify({
    schemaVersion: 1,
    slug: roadSlug,
    topic: "5살 자녀 태우고 모녀 차량 보복운전... 흉기 든 운전자 영장",
    query: "5살 자녀 태우고 모녀 차량 보복운전 흉기 운전자 영장",
    keywords: ["5살", "자녀", "태우고", "모녀", "차량", "보복운전", "흉기", "운전자", "영장"],
    adapterIds: [],
    mediaAdapters: [],
    sources: [{ publisher: "인사이트", title: "5살 자녀 태우고 모녀 차량 보복운전... 흉기 든 운전자 영장", url: roadUrls.primary }],
    laws: [],
    relevance: roadRageFingerprint,
    eventFingerprint: roadRageFingerprint,
    contradictions: [],
  }, null, 2)}\n`, "utf8");
  const articleHtml = (title, body, publishedAt) => `<html><head><meta property="og:title" content="${title.replace(/'/gu, "&#x27;")}"><meta property="article:published_time" content="${publishedAt}"></head><body><article>${body} 사건 관계와 수사 단계의 사실관계를 확인하기 위한 충분한 검증 문장을 추가합니다.</article></body></html>`;
  const roadPages = new Map([
    [roadUrls.primary, articleHtml("5살 자녀 태우고 모녀 차량 보복운전... 흉기 든 운전자 영장", roadRageRepresentative, "2026-08-26T10:00:00+09:00")],
    [roadUrls.news1, articleHtml(news1RoadRage.title, news1RoadRage.snippet, "2026-08-26T14:35:00+09:00")],
    [roadUrls.segye, articleHtml(segyeRoadRage.title, segyeRoadRage.snippet, "2026-08-30T10:00:00+09:00")],
    [roadUrls.busan, articleHtml(busanSpouseHomicide.title, `로그인 회원가입 e-paper 모바일보기 메뉴 펼치기 사회 정치 경제 문화 라이프 스포츠 오피니언 사람들 뉴스레터 가장 많이 본 뉴스 나를 위한 뉴스 Click! ${busanSpouseHomicide.snippet} 박정미 busan@example.test 기자페이지 바로가기 Copyright ⓒ 부산일보.`, "2026-09-02T10:52:00+09:00")],
  ]);
  const roadResponse = (body) => ({ ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(body, "utf8") });
  const roadSnapshot = await refreshResearchSnapshot({
    slug: roadSlug,
    configRoot: tempRoot,
    snapshotRoot: tempRoot,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (url) => roadResponse(roadPages.get(String(url))),
    candidateSearch: async () => ({ candidates: [
      { ...news1RoadRage, url: roadUrls.news1, source: "뉴스1", publishedAt: "2026-08-26T14:35:00+09:00" },
      { ...segyeRoadRage, url: roadUrls.segye, source: "세계일보", publishedAt: "2026-08-30T10:00:00+09:00" },
      { title: "5살 자녀 태우고 모녀 보복운전 가짜 권총 영장", description: "차량 추격과 송곳 위협 후속", url: roadUrls.busan, source: "부산일보", publishedAt: "2026-09-02T10:52:00+09:00" },
    ], errors: [] }),
    topicMediaSearch: async () => ({ status: "ready", candidates: [], errors: [] }),
  });
  assert.deepEqual(roadSnapshot.relatedCoverage.map((item) => item.url), [roadUrls.news1]);
  assert.deepEqual(roadSnapshot.followUps.map((item) => item.url), [roadUrls.segye]);
  assert.equal(JSON.stringify(roadSnapshot.eventDossier).includes("아내 살해"), false, "post-fetch source replacement must not contaminate claims, timeline or legal input");
  assert.ok(roadSnapshot.errors.some((error) => error.url === roadUrls.busan && error.message === "conflicting-location-fingerprint"), "post-fetch event mismatch must remain observable");
  await fs.writeFile(path.join(tempRoot, `${autoSlug}.workflow.json`), `${JSON.stringify({ slug: autoSlug, candidate: autoCandidate }, null, 2)}\n`, "utf8");
  const generatedConfig = await ensureResearchConfig(autoSlug, tempRoot);
  assert.equal(generatedConfig.slug, autoSlug);
  assert.deepEqual(generatedConfig.mediaAdapters, ["youtube"]);
  assert.equal(fsSync.existsSync(path.join(tempRoot, `${autoSlug}.research.config.json`)), true);
  await fs.writeFile(path.join(tempRoot, `${autoSlug}.research.config.json`), `${JSON.stringify({ ...generatedConfig, adapterIds: ["google-news", "yonhaptv"] }, null, 2)}\n`, "utf8");
  const refreshedGeneratedConfig = await ensureResearchConfig(autoSlug, tempRoot);
  assert.deepEqual(refreshedGeneratedConfig.adapterIds, builtConfig.adapterIds, "stale generated configs must be replaced on Windows as collectors improve");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(tempRoot, `${autoSlug}.research.config.json`), "utf8")).adapterIds, builtConfig.adapterIds);
  await fs.writeFile(path.join(tempRoot, "research-dossiers.json"), `${JSON.stringify({ version: 1, dossiers: [{
    ...autoCandidate,
    id: autoSlug,
    slug: autoSlug,
    relatedCoverage: [{ source: "검증 뉴스", title: "빵집 흡연 제지 어깨 충돌 후속", url: "https://example.test/verified-followup", status: "verified", kind: "same-event", sameEvent: { verified: true } }],
  }] }, null, 2)}\n`, "utf8");
  const reconciledPromotionConfig = await ensureResearchConfig(autoSlug, tempRoot);
  assert.deepEqual(reconciledPromotionConfig.sources.map((source) => source.url), [autoCandidate.url, "https://example.test/verified-followup"], "refreshed verified promotion coverage must replace the stale workflow seed and remain subject to project re-verification");
  const sameEvent = await refreshResearchSnapshot({
    slug: autoSlug,
    configRoot: tempRoot,
    snapshotRoot: tempRoot,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async () => fixtureResponse("<html><head><title>bakery fixture</title></head><body><article>빵집 흡연 충돌 증거</article></body></html>"),
    topicMediaSearch: async ({ query }) => ({
      status: "ready",
      query,
      candidates: [{ title: "빵집 흡연 어깨빵 원보도", url: "https://www.youtube.com/watch?v=fixture", publisher: "사건 채널", channelTitle: "사건 채널", publishedAt: "2026-08-03T00:00:00Z", description: "빵집 앞 흡연 제지 장면", mediaType: "video", status: "indexed", fetchedAt: "2026-08-04T00:00:00Z" }],
    }),
  });
  assert.equal(sameEvent.counts.relatedCoverage, 2);
  assert.equal(sameEvent.counts.originalMedia, 1);
  assert.equal(sameEvent.relatedCoverage.find((item) => item.mediaType === "article")?.url, "https://example.test/verified-followup", "carried shortlist coverage must pass project body and same-event verification again");
  assert.equal(sameEvent.relatedCoverage.find((item) => item.kind === "related-video")?.rightsStatus, "reference-only");
  const registeredSlug = "research-utf8-fixture";
  const registeredTitle = "\uC81C\uC8FC \uD559\uAD50 \uC55E \uBE75\uC9D1 \uAC08\uB4F1";
  const registeredDossier = {
    version: 1,
    dossiers: [{ id: registeredSlug, slug: registeredSlug, title: registeredTitle, source: "\uB274\uC2A4 \uD53C\uCE58", url: "https://example.test/utf8", hook: "\uD55C\uAD6D\uC5B4 \uC0AC\uAC74 \uC124\uBA85" }],
  };
  await fs.writeFile(path.join(tempRoot, "research-dossiers.json"), `${JSON.stringify(registeredDossier, null, 2)}\n`, "utf8");
  const registered = await refreshResearchSnapshot({
    slug: registeredSlug,
    configRoot: tempRoot,
    snapshotRoot: tempRoot,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async () => fixtureResponse(`<html><head><title>${registeredTitle}</title></head><body><article>${registeredTitle} 원문 확인</article></body></html>`),
    topicMediaSearch: async () => ({ status: "ready", candidates: [], errors: [] }),
  });
  assert.equal(registered.topic, registeredTitle, "promoted dossier registration must start same-event research without a workflow pre-read");
  const generatedUtf8 = await fs.readFile(path.join(tempRoot, `${registeredSlug}.research.config.json`), "utf8");
  assert.match(generatedUtf8, new RegExp(registeredTitle));
  assert.equal(JSON.parse(generatedUtf8).sources[0].title, registeredTitle);
  await assert.rejects(() => refreshResearchSnapshot({ slug: "research-utf8-fixtur", configRoot: tempRoot, snapshotRoot: tempRoot, fetchImpl: async () => fixtureResponse("<article>typo</article>") }), /Unknown newsroom project/);
  const concurrentSlug = "research-concurrent-fixture";
  registeredDossier.dossiers.push({ id: concurrentSlug, slug: concurrentSlug, title: "\uC11C\uC6B8 \uC2DC\uCCAD \uCDE8\uC7AC", source: "\uD14C\uC2A4\uD2B8 \uB274\uC2A4", url: "https://example.test/concurrent" });
  await fs.writeFile(path.join(tempRoot, "research-dossiers.json"), `${JSON.stringify(registeredDossier, null, 2)}\n`, "utf8");
  const concurrentConfigs = await Promise.all(Array.from({ length: 50 }, () => ensureResearchConfig(concurrentSlug, tempRoot)));
  assert.equal(new Set(concurrentConfigs.map((config) => JSON.stringify(config))).size, 1, "concurrent config generation must converge on identical JSON");
  assert.equal(fsSync.existsSync(path.join(tempRoot, `${concurrentSlug}.research.config.json`)), true);
  assert.deepEqual((await fs.readdir(tempRoot)).filter((name) => name.endsWith(".tmp")), [], "concurrent config generation must leave no temporary files");
  await assert.rejects(() => ensureResearchConfig("../unsafe", tempRoot), /Invalid newsroom project slug/);
  const genericSlug = "electric-bus-fares";
  await fs.writeFile(path.join(tempRoot, `${genericSlug}.research.config.json`), `${JSON.stringify({
    schemaVersion: 1,
    slug: genericSlug,
    topic: "전기버스 요금 조정",
    query: "전기버스 요금 조정",
    keywords: ["전기버스", "요금"],
    adapterIds: ["google-news"],
    sources: [{ publisher: "교통뉴스", url: "https://example.test/electric-bus" }],
    laws: [{ title: "대중교통법", publisher: "법령센터", url: "https://example.test/transit-law" }],
    relevance: { anchors: ["전기버스", "요금"], excludeWhenNoAnchor: ["제주"] },
    contradictions: [],
  }, null, 2)}\n`, "utf8");
  const generic = await refreshResearchSnapshot({ slug: genericSlug, configRoot: tempRoot, snapshotRoot: tempRoot, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => fixtureResponse("<html><head><title>generic fixture</title></head><body><article>electric bus evidence</article></body></html>") });
  assert.equal(generic.topic, "전기버스 요금 조정");
  assert.equal(generic.counts.sources, 0, "generic source without expected evidence must fail closed");
  assert.equal(generic.counts.laws, 0, "unrelated generic law content must fail title verification");
  assert.equal(generic.provenance.config, `${genericSlug}.research.config.json`);
  assert.equal(isRelevantFollowUp({ title: "전기버스 요금 변경" }, { anchors: ["전기버스"] }), true);
  assert.equal(JSON.stringify(generic).includes("jeju-school-intrusion"), false);
  const afterHash = fsSync.existsSync(productionSnapshot) ? crypto.createHash("sha256").update(fsSync.readFileSync(productionSnapshot)).digest("hex") : null;
  assert.equal(afterHash, beforeHash, "isolated research test changed production snapshot");
  const afterImmutableAuditHash = fsSync.existsSync(immutableAuditSource) ? crypto.createHash("sha256").update(fsSync.readFileSync(immutableAuditSource)).digest("hex") : null;
  assert.equal(afterImmutableAuditHash, immutableAuditHash, "research tests must not mutate immutable news audit sources");
} finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
const finalHash = fsSync.existsSync(productionSnapshot) ? crypto.createHash("sha256").update(fsSync.readFileSync(productionSnapshot)).digest("hex") : null;
assert.equal(finalHash, beforeHash, "production snapshot changed after isolated test");
const finalImmutableAuditHash = fsSync.existsSync(immutableAuditSource) ? crypto.createHash("sha256").update(fsSync.readFileSync(immutableAuditSource)).digest("hex") : null;
assert.equal(finalImmutableAuditHash, immutableAuditHash, "immutable news audit source changed after isolated test");
console.log("research pipeline tests passed");
