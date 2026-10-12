import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deepResearchQueryVariants, enrichResearchCandidate, enrichResearchShortlist, fetchCandidates, parseNews1SocietySitemap,
  parseNaverNewsSearch, parseKakaoWebSearch, promoteResearchCandidate,
  readAllowedDotenv, resolveNewsroomSecret, PROJECT_ENV_PATH,
  RESEARCH_DEEP_DISCOVERY_LIMIT, RESEARCH_DEEP_FETCH_LIMIT, RESEARCH_DEEP_UNIQUE_CANDIDATE_LIMIT,
  NEWS_SITEMAP_MAX_BYTES, NEWS_SITEMAP_MAX_ITEMS, NEWS_PORTAL_API_MAX_BYTES, NEWS_PORTAL_API_MAX_ITEMS,
} from "./newsroom-lib.mjs";

assert.equal(PROJECT_ENV_PATH, path.resolve(process.cwd(), "..", "..", "..", ".env"), "shared portal credentials resolve to the user-selected app/.env");

const breadPrimaryBody = "2026년 8월 1일 빵집 앞에서 흡연 제지가 발생했고 경찰이 현장을 확인했습니다. 손님이 어깨로 사장을 밀쳐 충돌했고 피해 신고가 접수됐습니다. 이후 수사가 시작됐고 CCTV 확인이 진행됐습니다.";
const breadSecondaryBody = "2026년 8월 2일 빵집 흡연 갈등의 후속 상황이 알려졌고 경찰이 추가 확인에 나섰습니다. 경찰은 당시 제지 과정의 어깨 충돌을 확인했고 피해자 진술을 조사했습니다. 이후 사건 처분이 진행됐고 관련 영상도 확보됐습니다.";
const assaultBody = "2026년 8월 2일 부산의 별도 장소에서 남성이 폭행 피해를 입어 경찰이 현장을 확인했습니다. 당시 신고를 받은 경찰은 전혀 다른 사람을 상대로 수사를 시작했습니다. 이후 별도 사건의 처분 절차가 진행됐습니다.";
const recoveryOneBody = "2026년 8월 2일 서울 서대문구에서 배달원이 주거에 침입해 성폭행을 시도한 혐의로 긴급체포됐습니다. 마포경찰서는 당시 피해자 신고를 받고 현장을 확인했습니다. 이후 경찰은 배달원을 조사하고 구속 절차를 진행했습니다.";
const recoveryTwoBody = "2026년 8월 3일 서울 서대문구 주거침입 사건의 배달원이 구속 송치됐습니다. 경찰은 성폭행 시도 신고 직후 피의자를 체포했다고 확인했습니다. 이후 피해자 조사와 증거 확보를 거쳐 사건을 검찰에 넘겼습니다.";

const article = (title, body) => `<html><head><title>${title}</title></head><body><article>${body}</article></body></html>`;
const reportBody = (title, detail) => `${title}. 2026년 8월 2일 ${detail} 경찰과 관계 기관은 당시 현장을 확인하고 별도 수사를 진행했습니다. 이후 피해 상황과 사건 처분 절차를 추가로 확인했다고 밝혔습니다.`;
const pages = new Map([
  ["https://primary.example.test/deep-primary", article("빵집 앞 흡연 제지에 어깨 충돌 난동", breadPrimaryBody)],
  ["https://secondary.example.test/deep-secondary", article("빵집 흡연 제지 어깨 충돌 후속", breadSecondaryBody)],
  ["https://unrelated.example.test/deep-unrelated", article("부산 남성 폭행 별도 사건 경찰 수사", assaultBody)],
  ["https://news1.example.test/recovery", article("서대문구 배달원 주거침입 성폭행 시도 긴급체포", recoveryOneBody)],
  ["https://newsis.example.test/recovery", article("마포경찰서 배달원 서대문구 사건 구속 송치", recoveryTwoBody)],
  ["https://www.news1.kr/society/incident-accident/9999999", `<html><head><title>뉴스1 동적 기사</title></head><body><main>뉴스 홈 사회 정치 경제 검색 로그인 메뉴입니다. 관련 키워드와 인기 기사 목록을 확인하세요.</main><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { articleView: { title: "마포경찰서 배달원 서대문구 사건 구속 송치", contentArrange: [{ type: "text", content: recoveryTwoBody }] } } } })}</script></body></html>`],
  ["https://syndicated.example.test/copy", article("빵집 흡연 제지 어깨 충돌 후속", breadPrimaryBody)],
  ["https://jtbc.example.test/dynamic", `<html><head><title>메뉴뿐인 JTBC 페이지</title></head><body>JTBC NEWS 메뉴 검색</body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { article: { "@type": "NewsArticle", headline: "서대문구 배달원 주거침입 성폭행 시도", articleBody: recoveryOneBody } } } })}</script></html>`],
  ["https://www.mbn.co.kr/news/society/5211155", article("마을버스 상가 돌진에 8명 부상 모터보트 뒤집혀 선장 사망", reportBody("마을버스 상가 돌진에 8명 부상", "상가를 들이받은 마을버스 사고와 모터보트 전복을 조사했습니다."))],
  ["https://news.jtbc.co.kr/article/NB12316356", article("도로에 누운 사람 못 보고 덜컹 골목길 보행 사망", reportBody("골목길 보행 사망", "도로에 누워 있던 보행자를 차량이 발견하지 못한 사고입니다."))],
  ["https://www.newsis.com/view/NISX20260901_0003772211", article("속초 대포항 어선 충돌 2명 사망 60대 선장 검찰 송치", reportBody("속초 대포항 어선 충돌 2명 사망", "대포항에서 어선끼리 충돌해 선장이 검찰에 송치됐습니다."))],
  ["https://nownews.seoul.co.kr/news/newsView.php?id=20260828601012", article("납치돼 성폭행당할 뻔했다던 20대 사랑 확인 자작극", reportBody("납치 성폭행 자작극", "동남아에서 납치 주장이 거짓으로 확인된 별도 사건입니다."))],
  ["https://www.hani.co.kr/arti/society/society_general/1271956.html", article("아내 폭행 뒤 감금 화상 입힌 60대 남성 구속", reportBody("아내 폭행 뒤 감금", "가정폭력 신고로 남편이 구속된 별도 사건입니다."))],
  ["https://www.newsis.com/view/NISX20260901_0003772246", article("집중호우 중대본 1단계 해제 3명 사망", reportBody("집중호우 3명 사망", "전국 호우 피해를 집계한 재난 보도입니다."))],
  ["https://www.mbn.co.kr/news/society/5211158", article("서로 칼부림하던 2명 모두 사망", reportBody("서로 칼부림하던 2명 사망", "흉기 사건으로 두 명이 숨진 별도 사건입니다."))],
  ["https://www.hankyung.com/article/2026082519037", article("제주 한림읍서 발견된 시신 장미란씨로 최종 확인", reportBody("제주 한림읍 시신 신원 확인", "발견된 시신의 신원을 확인한 별도 사건입니다."))],
  ["https://www.newsis.com/view/NISX20260901_0003772282", article("시도경찰청장 14곳 물갈이 전국 18곳 향피제", reportBody("시도경찰청장 14곳 물갈이", "전국 경찰 고위직 인사와 향피제를 다룬 기사입니다."))],
  ["https://www.newsis.com/view/NISX20260807_0003741137", article("정책자금 컨설팅 불만에 흉기 들고 업체 찾아간 50대 체포", reportBody("정책자금 컨설팅 불만에 흉기 들고 업체 찾아간 50대 체포", "정책자금 컨설팅 업체를 찾아가 흉기로 위협한 별도 사건입니다."))],
  ["https://different-jeju.example.test/false-closure", article("제주 다른 가족 실종 신고 허위 종결 의혹", reportBody("제주 다른 가족 실종 신고 허위 종결 의혹", "별개의 실종 신고 처리 논란을 다룬 기사입니다."))],
  ["https://lawtalk.example.test/care-center", article("합의서 서명 안 하자 병원비 결제 취소 돌봄센터 대응", reportBody("돌봄센터 병원비 결제 취소", "돌봄센터 이용자가 다친 뒤 병원비 합의 과정에서 결제가 취소됐고 변호사가 법적 쟁점을 설명했습니다."))],
  ["https://traffic.example.test/hospital-injury", article("한남대교 음주 역주행 사고 운전자 병원 이송 부상", reportBody("한남대교 음주 역주행 사고", "교통사고 부상자가 병원으로 이송된 별도 사건입니다."))],
  ["https://obituary.example.test/hospital", article("법무법인 변호사 부친상 병원 장례식장 부고", reportBody("변호사 부친상 부고", "병원 장례식장 안내를 담은 부고입니다."))],
]);

const responseFor = (url) => ({
  ok: true, status: 200, headers: { get: () => "" },
  arrayBuffer: async () => Buffer.from(pages.get(String(url)) || pages.get(String(url).split("?")[0]) || "<html><body><article>missing</article></body></html>", "utf8"),
});
const fetchOptions = {
  lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async (url) => responseFor(url),
  discoveryImpl: async ({ queries, limit }) => {
    assert.ok(queries.length >= 3 && queries.length <= 5);
    assert.ok(queries.every((query) => query.includes("빵집")));
    assert.ok(limit <= RESEARCH_DEEP_DISCOVERY_LIMIT);
    return [
      { title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: "https://secondary.example.test/deep-secondary" },
      { title: "부산 남성 폭행 별도 사건 경찰 수사", source: "다른 매체", url: "https://unrelated.example.test/deep-unrelated" },
    ];
  },
};

const queryVariants = deepResearchQueryVariants({ title: "빵집 앞 흡연 제지에 어깨 충돌 난동", snippet: breadPrimaryBody });
assert.ok(queryVariants.length >= 3 && queryVariants.length <= 5, "structured fingerprint produces 3-5 bounded query variants");
assert.equal(new Set(queryVariants).size, queryVariants.length);
assert.ok(queryVariants.some((query) => query.includes("2026년")));
assert.ok(queryVariants.every((query) => query.includes("빵집")), "queries retain an identity anchor instead of copying a headline");

const newsSitemapItem = (index, overrides = {}) => `<url><loc>${overrides.url || `https://www.news1.kr/society/incident-accident/${9000000 + index}`}</loc><news:news><news:publication_date>${overrides.date || "2026-09-01T10:00:00+09:00"}</news:publication_date><news:title><![CDATA[${overrides.title || `사회 사건 ${index}`}]]></news:title></news:news></url>`;
const newsSitemap = (items, prefix = "") => `<?xml version="1.0" encoding="UTF-8"?>${prefix}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${items.join("")}</urlset>`;
const parsedNewsSitemap = parseNews1SocietySitemap(newsSitemap([newsSitemapItem(1, { title: "마포경찰서 배달원 서대문구 사건 구속 송치", url: "https://www.news1.kr/society/incident-accident/9999999" })]));
assert.equal(parsedNewsSitemap.length, 1);
assert.equal(parsedNewsSitemap[0].adapterId, "news1-society");
assert.equal(parsedNewsSitemap[0].url, "https://www.news1.kr/society/incident-accident/9999999");
assert.throws(() => parseNews1SocietySitemap(newsSitemap([newsSitemapItem(1)], "<!DOCTYPE urlset [<!ENTITY x SYSTEM 'file:///x'>]>")), /DTD and entity/u);
assert.throws(() => parseNews1SocietySitemap(newsSitemap([newsSitemapItem(1, { url: "https://evil.example/society/story" })])), /disallowed article URL/u);
assert.throws(() => parseNews1SocietySitemap(newsSitemap([newsSitemapItem(1, { url: "https://www.news1.kr/politics/story" })])), /disallowed article URL/u);
assert.throws(() => parseNews1SocietySitemap(" ".repeat(NEWS_SITEMAP_MAX_BYTES + 1)), /bounded byte limit/u);
assert.equal(parseNews1SocietySitemap(newsSitemap(Array.from({ length: NEWS_SITEMAP_MAX_ITEMS + 5 }, (_, index) => newsSitemapItem(index)))).length, NEWS_SITEMAP_MAX_ITEMS, "news sitemap item count is bounded");
const naverFixture = JSON.stringify({ items: [
  { title: "<b>빵집 앞 흡연 제지 어깨 충돌</b>", originallink: "https://publisher.example.test/bread", link: "https://n.news.naver.com/article/999", description: "경찰이 현장을 확인했습니다.", pubDate: "Tue, 02 Aug 2026 09:00:00 +0900" },
  { title: "포털 미러만 있는 기사", link: "https://news.naver.com/main/read.naver?oid=999&aid=1", description: "원문 링크가 없습니다.", pubDate: "Tue, 02 Aug 2026 08:00:00 +0900" },
] });
const parsedNaver = parseNaverNewsSearch(naverFixture);
assert.equal(parsedNaver.length, 2);
assert.equal(parsedNaver[0].url, "https://publisher.example.test/bread", "Naver originallink is preferred over the portal mirror");
assert.equal(parsedNaver[0].portalUrl, "https://n.news.naver.com/article/999");
assert.equal(parsedNaver[0].discoveryPlatform, "naver");
assert.equal(parsedNaver[1].url, "https://news.naver.com/main/read.naver?oid=999&aid=1", "Naver mirror remains a discovery hint when no original link exists");
const kakaoFixture = JSON.stringify({ documents: [
  { title: "<b>빵집 흡연 제지 어깨 충돌 후속</b>", url: "https://v.daum.net/v/202608020900", contents: "경찰이 후속 조사를 진행했습니다.", datetime: "2026-08-02T09:00:00.000+09:00" },
  { title: "직접 언론사 검색 결과", url: "https://publisher.example.test/direct", contents: "원문으로 바로 연결됩니다.", datetime: "2026-08-02T08:00:00.000+09:00" },
] });
const parsedKakao = parseKakaoWebSearch(kakaoFixture);
assert.equal(parsedKakao.length, 2);
assert.equal(parsedKakao[0].discoveryPlatform, "daum");
assert.equal(parsedKakao[0].portalUrl, parsedKakao[0].url, "Daum portal URL is marked as discovery-only");
assert.equal(parsedKakao[1].url, "https://publisher.example.test/direct");
assert.equal(parseNaverNewsSearch(JSON.stringify({ items: Array.from({ length: NEWS_PORTAL_API_MAX_ITEMS + 5 }, () => ({ title: "bounded", originallink: "https://publisher.example.test/a", pubDate: "Tue, 02 Aug 2026 09:00:00 +0900" })) })).length, NEWS_PORTAL_API_MAX_ITEMS, "Naver API results are bounded");
assert.throws(() => parseKakaoWebSearch("x".repeat(NEWS_PORTAL_API_MAX_BYTES + 1)), /bounded byte limit/u, "oversized portal payload fails closed");
const portalAdapterFixture = await fetchCandidates({ mode: "investigation", query: "빵집 흡연 제지", adapterIds: ["naver-news", "daum-news"], fixtureByAdapter: { "naver-news": naverFixture, "daum-news": kakaoFixture }, now: "2026-09-02T00:00:00.000Z", requireRelevance: false });
assert.equal(portalAdapterFixture.candidates.length, 4, "configured portal fixtures are discovery candidates");
assert.equal(portalAdapterFixture.adapterDiagnostics.find((item) => item.adapterId === "naver-news").status, "fixture");
assert.equal(portalAdapterFixture.adapterDiagnostics.find((item) => item.adapterId === "daum-news").portalUrls, 1);
const unavailablePortals = await fetchCandidates({ mode: "investigation", query: "빵집 흡연 제지", adapterIds: ["naver-news", "daum-news"], NAVER_API_HUB_CLIENT_ID: "", NAVER_API_HUB_CLIENT_SECRET: "", NAVER_CLIENT_ID: "", NAVER_CLIENT_SECRET: "", KAKAO_REST_API_KEY: "", KAKAO_API_KEY: "", now: "2026-09-02T00:00:00.000Z", requireRelevance: false, fetchImpl: async () => { throw new Error("should not fetch without credentials"); } });
assert.equal(unavailablePortals.candidates.length, 0, "portal APIs fail closed without credentials");
assert.ok(unavailablePortals.adapterDiagnostics.every((item) => item.status === "not-configured"));
const dotenvDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-env-"));
const dotenvPath = path.join(dotenvDirectory, ".env");
fs.writeFileSync(dotenvPath, "# comment\nexport NAVER_CLIENT_ID=\"quoted-client\" # comment\nNAVER_CLIENT_SECRET='quoted-secret'\nKAKAO_API_KEY=plain-key\nUNKNOWN=value\nNAVER_API_HUB_CLIENT_ID=\"unterminated\nMALFORMED_LINE\n", "utf8");
const dotenvValues = readAllowedDotenv(dotenvPath);
assert.equal(dotenvValues.NAVER_CLIENT_ID, "quoted-client", "Node dotenv parser accepts quoted values");
assert.equal(dotenvValues.NAVER_CLIENT_SECRET, "quoted-secret");
assert.equal(dotenvValues.KAKAO_API_KEY, "plain-key");
assert.equal(dotenvValues.UNKNOWN, undefined, "Node dotenv parser ignores non-allowlisted names");
assert.equal(dotenvValues.NAVER_API_HUB_CLIENT_ID, undefined, "Node dotenv parser rejects unterminated quotes");
assert.equal(resolveNewsroomSecret("NAVER_CLIENT_ID", { NAVER_CLIENT_ID: "explicit-client" }), "explicit-client", "explicit runtime option wins");
assert.equal(resolveNewsroomSecret("NOT_ALLOWED", dotenvValues), "", "secret resolver is allowlisted");
fs.writeFileSync(dotenvPath, "NAVER_CLIENT_ID=" + "x".repeat(64 * 1024), "utf8");
assert.deepEqual(readAllowedDotenv(dotenvPath), {}, "oversized dotenv fails closed");
fs.rmSync(dotenvDirectory, { recursive: true, force: true });
let legacyNaverRequest;
await fetchCandidates({ mode: "investigation", query: "빵집 흡연 제지", adapterIds: ["naver-news"], NAVER_API_HUB_CLIENT_ID: "", NAVER_API_HUB_CLIENT_SECRET: "", naverClientId: "test-client", naverClientSecret: "test-secret", lookup: fetchOptions.lookup, fetchImpl: async (url, request) => { legacyNaverRequest = { url, request }; return { ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(naverFixture, "utf8") }; }, now: "2026-09-02T00:00:00.000Z", requireRelevance: false });
assert.ok(legacyNaverRequest.url.startsWith("https://openapi.naver.com/v1/search/news.json?"));
assert.equal(legacyNaverRequest.request.headers["X-Naver-Client-Id"], "test-client", "legacy Naver client id reaches the API request");
assert.equal(legacyNaverRequest.request.headers["X-Naver-Client-Secret"], "test-secret", "legacy Naver client secret reaches the API request");
let hubNaverRequest;
await fetchCandidates({ mode: "investigation", query: "빵집 흡연 제지", adapterIds: ["naver-news"], naverApiHubClientId: "hub-client", naverApiHubClientSecret: "hub-secret", lookup: fetchOptions.lookup, fetchImpl: async (url, request) => { hubNaverRequest = { url, request }; return { ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(naverFixture, "utf8") }; }, now: "2026-09-02T00:00:00.000Z", requireRelevance: false });
assert.ok(hubNaverRequest.url.startsWith("https://naverapihub.apigw.ntruss.com/search/v1/news?"));
assert.equal(hubNaverRequest.request.headers["X-NCP-APIGW-API-KEY-ID"], "hub-client", "Naver API Hub id reaches the API request");
assert.equal(hubNaverRequest.request.headers["X-NCP-APIGW-API-KEY"], "hub-secret", "Naver API Hub secret reaches the API request");
const redirectedNaverRequests = [];
await fetchCandidates({ mode: "investigation", query: "빵집 흡연 제지", adapterIds: ["naver-news"], naverApiHubClientId: "hub-client", naverApiHubClientSecret: "hub-secret", lookup: fetchOptions.lookup, fetchImpl: async (url, request) => {
  redirectedNaverRequests.push({ url, request });
  if (redirectedNaverRequests.length === 1) return { ok: false, status: 302, headers: { get: (name) => name.toLowerCase() === "location" ? "https://publisher.example.test/redirected" : "" } };
  return { ok: true, status: 200, headers: { get: () => "" }, arrayBuffer: async () => Buffer.from(naverFixture, "utf8") };
}, now: "2026-09-02T00:00:00.000Z", requireRelevance: false });
assert.equal(redirectedNaverRequests.length, 2);
assert.equal(redirectedNaverRequests[1].request.headers["X-NCP-APIGW-API-KEY-ID"], undefined, "Naver credentials are stripped on a cross-origin redirect");
assert.equal(redirectedNaverRequests[1].request.headers["X-NCP-APIGW-API-KEY"], undefined, "Naver secret is stripped on a cross-origin redirect");
const adapterFixture = await fetchCandidates({ mode: "investigation", query: "마포경찰서 배달원 구속 송치", adapterIds: ["news1-society"], fixtureByAdapter: { "news1-society": newsSitemap([newsSitemapItem(1, { title: "마포경찰서 배달원 서대문구 사건 구속 송치", url: "https://www.news1.kr/society/incident-accident/9999999" })]) }, now: "2026-09-02T00:00:00.000Z" });
assert.deepEqual(adapterFixture.candidates.map((item) => item.url), ["https://www.news1.kr/society/incident-accident/9999999"], "official sitemap adapter emits a direct News1 society URL");
const rankedAdapterFixture = await fetchCandidates({ mode: "investigation", query: "배달 성폭행 시도 배달원 구속송치", adapterIds: ["news1-society"], limit: 1, fixtureByAdapter: { "news1-society": newsSitemap([
  newsSitemapItem(1, { title: "생활 안전 경찰 피해 신고 배달 서비스", url: "https://www.news1.kr/society/general-society/9999998" }),
  newsSitemapItem(2, { title: "한달 전 배달 갔던 집 찾아 성폭행 시도 20대 배달원 구속송치", url: "https://www.news1.kr/society/incident-accident/9999999" }),
]) }, now: "2026-09-02T00:00:00.000Z" });
assert.equal(rankedAdapterFixture.candidates[0].url, "https://www.news1.kr/society/incident-accident/9999999", "investigation results rank exact query overlap before generic newsroom score");

const withCoverage = await enrichResearchCandidate({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary", shortsScore: 90,
  relatedCoverage: [
    { title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: "https://secondary.example.test/deep-secondary" },
    { title: "부산 남성 폭행 별도 사건 경찰 수사", source: "다른 매체", url: "https://unrelated.example.test/deep-unrelated" },
  ],
}, fetchOptions);
assert.equal(withCoverage.deepResearch.status, "ready");
assert.equal(withCoverage.deepResearch.verifiedSourceCount, 2);
assert.equal(withCoverage.deepResearch.independentPublisherCount, 2);
assert.deepEqual(withCoverage.deepResearch.verifiedRelatedCoverage.map((item) => item.url), ["https://secondary.example.test/deep-secondary"]);
assert.equal(withCoverage.deepResearch.discoveryTrace.rejections.differentEvent, 1, "generic police/incident words cannot join a different event");

const wrapperItem = { title: "빵집 흡연 제지 어깨 충돌 후속", source: "서울Eye", url: "https://news.google.com/rss/articles/AGGREGATED-SECONDARY", publishedAt: "2026-08-02T01:00:00.000Z" };
const directPoolItem = { title: wrapperItem.title, source: "서울Eye", url: "https://secondary.example.test/deep-secondary", publishedAt: "2026-08-02T02:00:00.000Z", feedExcerpt: breadSecondaryBody };
const resolvedWrapper = await enrichResearchCandidate({ title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary" }, {
  ...fetchOptions, articlePool: [directPoolItem], discoveryImpl: async () => [wrapperItem],
});
assert.deepEqual(resolvedWrapper.deepResearch.verifiedRelatedCoverage.map((item) => item.url), [directPoolItem.url], "Google hints resolve only through a proven direct pool match");
assert.equal(resolvedWrapper.deepResearch.discoveryTrace.directUrlsResolved, 1);

const unresolvedWrapper = await enrichResearchCandidate({ title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary" }, {
  ...fetchOptions, articlePool: [], discoveryImpl: async () => [wrapperItem],
});
assert.equal(unresolvedWrapper.deepResearch.verifiedSourceCount, 1);
assert.equal(unresolvedWrapper.deepResearch.discoveryTrace.rejections.unresolvedAggregator, 1);
for (const portalUrl of ["https://n.news.naver.com/article/999", "https://v.daum.net/v/202608020900"]) {
  const unresolvedPortal = await enrichResearchCandidate({ title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary" }, {
    ...fetchOptions, articlePool: [], discoveryImpl: async () => [{ title: "빵집 흡연 제지 어깨 충돌 후속", source: "포털 검색", url: portalUrl }],
  });
  assert.equal(unresolvedPortal.deepResearch.discoveryTrace.rejections.unresolvedAggregator, 1, `${portalUrl} is never accepted as evidence without a direct publisher URL`);
}

const jtbcDynamic = await enrichResearchCandidate({ title: "서대문구 배달원 주거침입 성폭행 시도", source: "JTBC", url: "https://jtbc.example.test/dynamic" }, { ...fetchOptions, discoveryImpl: async () => [] });
assert.equal(jtbcDynamic.deepResearch.verifiedSourceCount, 1, "deterministic Next/JTBC payload articleBody is extracted");
assert.equal(jtbcDynamic.deepResearch.primaryExtractionMethod, "next-payload:articleBody");

const alternateDeliveryHeadline = await enrichResearchCandidate({
  title: "배달 갔던 집 다시 가서 성폭행 시도 20대 배달원 구속 송치", source: "JTBC", url: "https://jtbc.example.test/dynamic",
  relatedCoverage: [{ title: "마포경찰서 배달원 서대문구 사건 구속 송치", source: "뉴시스", url: "https://newsis.example.test/recovery" }],
}, { ...fetchOptions, discoveryImpl: async () => [] });
assert.equal(alternateDeliveryHeadline.deepResearch.status, "ready", "alternate headline passes only on shared location/authority/actor and rare action fields");

const sitemapDeliveryAdmission = await enrichResearchCandidate({
  title: "배달 갔던 집 다시 가서 성폭행 시도 20대 배달원 구속 송치", source: "JTBC", url: "https://jtbc.example.test/dynamic",
}, {
  ...fetchOptions,
  discoveryImpl: async ({ queries }) => (await fetchCandidates({
    mode: "investigation", query: queries.join(" "), adapterIds: ["news1-society"],
    fixtureByAdapter: { "news1-society": newsSitemap([newsSitemapItem(1, { title: "마포경찰서 배달원 서대문구 사건 구속 송치", url: "https://www.news1.kr/society/incident-accident/9999999" })]) },
    now: "2026-09-02T00:00:00.000Z",
  })).candidates,
});
assert.equal(sitemapDeliveryAdmission.deepResearch.status, "ready", "direct News1 sitemap report reaches body and strict same-event gates");
assert.deepEqual(sitemapDeliveryAdmission.deepResearch.verifiedRelatedCoverage.map((item) => item.url), ["https://www.news1.kr/society/incident-accident/9999999"]);

const liveFalsePositiveCases = [
  {
    title: "죽여줄까 말다툼 끝에 보행자 향해 차량 돌진 50대 여성 중상", url: "https://www.newsis.com/view/NISX20260807_0003739860", storySummary: "원주에서 운전자가 보행자를 향해 차량을 돌진시킨 사건입니다.",
    related: [
      ["마을버스 상가 돌진에 8명 부상 모터보트 뒤집혀 선장 사망", "MBN", "https://www.mbn.co.kr/news/society/5211155"],
      ["도로에 누운 사람 못 보고 덜컹 골목길 보행 사망", "JTBC", "https://news.jtbc.co.kr/article/NB12316356"],
    ],
  },
  {
    title: "배달 갔던 집 다시 가서 성폭행 시도 20대 배달원 구속 송치", url: "https://news.jtbc.co.kr/article/NB12315638", storySummary: "서울 서대문구에서 배달원이 주거침입 성폭행을 시도해 마포경찰서가 수사한 사건입니다.",
    related: [
      ["속초 대포항 어선 충돌 2명 사망 60대 선장 검찰 송치", "뉴시스", "https://www.newsis.com/view/NISX20260901_0003772211"],
      ["납치돼 성폭행당할 뻔했다던 20대 사랑 확인 자작극", "나우뉴스", "https://nownews.seoul.co.kr/news/newsView.php?id=20260828601012"],
      ["아내 폭행 뒤 감금 화상 입힌 60대 남성 구속", "한겨레", "https://www.hani.co.kr/arti/society/society_general/1271956.html"],
    ],
  },
  {
    title: "또 다른 허위 종결 가족 두 차례 경찰 찾아갔지만 무시당했다", url: "https://news.jtbc.co.kr/article/NB12314647", storySummary: "제주 경찰의 실종 신고 허위 종결 의혹 사건입니다.",
    related: [
      ["집중호우 중대본 1단계 해제 3명 사망", "뉴시스", "https://www.newsis.com/view/NISX20260901_0003772246"],
      ["서로 칼부림하던 2명 모두 사망", "MBN", "https://www.mbn.co.kr/news/society/5211158"],
      ["제주 한림읍서 발견된 시신 장미란씨로 최종 확인", "한국경제", "https://www.hankyung.com/article/2026082519037"],
      ["제주 다른 가족 실종 신고 허위 종결 의혹", "다른 매체", "https://different-jeju.example.test/false-closure"],
    ],
  },
  {
    title: "단독 벌금 못 내 버티고 하루 6.6억 원 황제 노역", url: "https://news.sbs.co.kr/news/endPage.do?news_id=N1008732798", storySummary: "벌금 대신 하루 6.6억 원으로 환산되는 황제 노역 사건입니다.",
    related: [["시도경찰청장 14곳 물갈이 전국 18곳 향피제", "뉴시스", "https://www.newsis.com/view/NISX20260901_0003772282"]],
  },
  {
    title: "남편 외출에 분노해 6살 아들 배에 흉기 겨눈 사진 40대 여성 체포", url: "https://news.jtbc.co.kr/article/NB12315154", storySummary: "어머니가 어린 아들을 상대로 흉기를 겨눈 사진을 보낸 가족 내 아동 위협 사건입니다.",
    related: [["정책자금 컨설팅 불만에 흉기 들고 업체 찾아간 50대 체포", "뉴시스", "https://www.newsis.com/view/NISX20260807_0003741137"]],
  },
  {
    title: "합의서 서명 안 하자 병원비 결제 취소 돌봄센터 황당 대응", url: "https://lawtalk.example.test/care-center", storySummary: "돌봄센터에서 다친 이용자의 병원비 결제와 합의서 서명을 둘러싼 사건입니다.",
    related: [
      ["한남대교 음주 역주행 사고 운전자 병원 이송 부상", "뉴시스", "https://traffic.example.test/hospital-injury"],
      ["법무법인 변호사 부친상 병원 장례식장 부고", "뉴스1", "https://obituary.example.test/hospital"],
    ],
  },
];
for (const fixture of liveFalsePositiveCases) {
  const result = await enrichResearchCandidate({ title: fixture.title, source: "대표 매체", url: fixture.url, storySummary: fixture.storySummary, relatedCoverage: fixture.related.map(([title, source, url]) => ({ title, source, url })) }, { ...fetchOptions, discoveryImpl: async () => [] });
  assert.equal(result.deepResearch.verifiedRelatedCoverage.length, 0, `live unrelated coverage must fail closed: ${fixture.url}`);
  assert.equal(result.deepResearch.status === "ready", false, `live contaminated candidate must not be ready: ${fixture.url}`);
}

const recoveredPrimary = await enrichResearchCandidate({
  title: "서대문구 배달원 주거침입 성폭행 시도 구속", source: "JTBC", url: "https://missing.example.test/no-body",
  storySummary: "마포경찰서가 지난 2일 서울 서대문구에서 배달원의 주거침입 성폭행 시도 신고를 받아 긴급체포한 뒤 구속 송치한 사건입니다.",
  relatedCoverage: [
    { title: "서대문구 배달원 주거침입 성폭행 시도 긴급체포", source: "뉴스1", url: "https://news1.example.test/recovery" },
    { title: "마포경찰서 배달원 서대문구 사건 구속 송치", source: "뉴시스", url: "https://newsis.example.test/recovery" },
  ],
}, { ...fetchOptions, discoveryImpl: async () => [] });
assert.equal(recoveredPrimary.deepResearch.status, "ready", "failed primary continues discovery and recovers through two independent sources");
assert.equal(recoveredPrimary.deepResearch.primaryVerification, "failed-recovered-through-secondary-search");
assert.equal(recoveredPrimary.deepResearch.verifiedSourceCount, 2, "failed primary itself is never counted");
assert.equal(recoveredPrimary.deepResearch.independentPublisherCount, 2);

const syndicated = await enrichResearchCandidate({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary",
  relatedCoverage: [{ title: "빵집 흡연 제지 어깨 충돌 후속", source: "복제 매체", url: "https://syndicated.example.test/copy" }],
}, { ...fetchOptions, discoveryImpl: async () => [] });
assert.equal(syndicated.deepResearch.independentPublisherCount, 1, "near-identical syndicated body cannot inflate publisher groups");
assert.equal(syndicated.deepResearch.discoveryTrace.rejections.syndicatedDuplicate, 1);

const bounded = await enrichResearchCandidate({ title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: "https://primary.example.test/deep-primary" }, {
  ...fetchOptions, articlePool: [],
  discoveryImpl: async () => Array.from({ length: RESEARCH_DEEP_DISCOVERY_LIMIT + 30 }, (_, index) => ({ title: `빵집 흡연 제지 충돌 후속 ${index}`, source: `매체 ${index}`, url: `https://bounded-${index}.example.test/story` })),
});
assert.equal(bounded.deepResearch.discoveryTrace.rawResults, RESEARCH_DEEP_DISCOVERY_LIMIT);
assert.equal(bounded.deepResearch.discoveryTrace.uniqueCandidates, RESEARCH_DEEP_UNIQUE_CANDIDATE_LIMIT);
assert.equal(bounded.deepResearch.discoveryTrace.attemptedFetches, RESEARCH_DEEP_FETCH_LIMIT);

let backfillCalls = 0;
const backfill = await enrichResearchShortlist(Array.from({ length: 8 }, (_, index) => ({
  title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: `https://primary.example.test/deep-primary?candidate=${index}`, shortsScore: 100 - index,
})), {
  ...fetchOptions, limit: 6, visibleRecommendationSlots: 6, maxEnrichmentCandidates: 8,
  discoveryImpl: async ({ candidate }) => {
    backfillCalls += 1;
    const index = new URL(candidate.url).searchParams.get("candidate");
    return Number(index) >= 6 ? [{ title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: `https://secondary.example.test/deep-secondary?candidate=${index}` }] : [];
  },
});
assert.equal(backfillCalls, 8, "bounded backfill continues beyond first six until the cap");
assert.equal(backfill[6].deepResearch.status, "ready");
assert.equal(backfill[7].deepResearch.status, "ready");

const promotionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-deep-promotion-"));
try {
  const semanticPath = path.join(promotionRoot, "semantic.json");
  const dossierPath = path.join(promotionRoot, "dossiers.json");
  const primaryUrl = "https://primary.example.test/deep-primary";
  const secondaryUrl = "https://secondary.example.test/deep-secondary";
  fs.writeFileSync(semanticPath, `${JSON.stringify({ generatedAt: "2026-09-02T00:00:00.000Z", evaluations: [{
    title: "빵집 앞 흡연 제지에 어깨 충돌 난동", url: primaryUrl,
    deepResearch: { status: "ready", verifiedRelatedCoverage: [{ title: "빵집 흡연 제지 어깨 충돌 후속", source: "교차 매체", url: secondaryUrl, sameEvent: { verified: true, matched: ["흡연제지충돌"] } }] },
  }] })}\n`, "utf8");
  const promoted = await promoteResearchCandidate(primaryUrl, {
    semanticPath, dossierPath, now: "2026-09-02T00:00:00.000Z",
    articlePool: { now: "2026-09-02T00:00:00.000Z", data: { version: 2, generated_at: "2026-09-02T00:00:00.000Z", articles: [{ article_id: "primary", title: "빵집 앞 흡연 제지에 어깨 충돌 난동", source: "주요 매체", url: primaryUrl, published_at: "2026-09-01T00:00:00.000Z" }] } },
  });
  assert.deepEqual(promoted.dossier.relatedCoverage.map((item) => ({ url: item.url, status: item.status, kind: item.kind })), [{ url: secondaryUrl, status: "verified", kind: "same-event" }], "promotion must preserve shortlist-verified direct coverage for mandatory project re-verification");
} finally {
  fs.rmSync(promotionRoot, { recursive: true, force: true });
}

console.log("newsroom deep research focused tests passed");
