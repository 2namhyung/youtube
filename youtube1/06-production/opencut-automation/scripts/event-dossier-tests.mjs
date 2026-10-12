import assert from "node:assert/strict";
import { buildEventDossier, eventDossierHashIsCurrent } from "./event-dossier.mjs";
import { classifySameEvent, verifyWebSource } from "./research-pipeline.mjs";

const contentVerification = { status: "verified", reason: "fixture" };
const sameEvent = { verified: true, confidence: 1, verificationStage: "post-fetch", contentEvidenceVerified: true };
const source = (overrides) => ({ status: "verified", contentVerification, publisher: "Fixture", ...overrides });

const fingerprint = { anchors: ["커피", "살충제", "간호조무사"], distinctiveAnchors: [{ name: "커피", terms: ["커피"] }, { name: "살충제", terms: ["살충제"] }, { name: "간호조무사", terms: ["간호조무사"] }], minDistinctiveMatches: 3, minTotalMatches: 3 };
assert.equal(classifySameEvent({ title: "관광객 커피 맛집", description: "제주 여행" }, fingerprint).verified, false, "unrelated stories must be silently excluded");
assert.equal(classifySameEvent({ title: "간호조무사가 동료 커피에 살충제", description: "항소심" }, fingerprint).verified, true);

const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const html = (title, body, extra = "") => `<!doctype html><html><head><meta property="og:title" content="${title}"><meta property="og:description" content="${body}">${extra}</head><body><article>${body}</article></body></html>`;
const googleUrl = "https://news.google.com/rss/articles/fixture?oc=5";
const publisherUrl = "https://publisher.example/case/1";
const fetchImpl = async (url) => new Response(url === googleUrl
  ? html("Google News", "Comprehensive up-to-date news coverage placeholder text that is deliberately long enough for the fixture.", `<link rel="canonical" href="${publisherUrl}">`)
  : html("간호조무사 커피 살충제 사건", "간호조무사 커피 살충제 사건을 법원이 심리했습니다. 간호조무사와 동료 사이에서 발생한 커피 살충제 사건의 사실관계를 설명하는 검증용 본문이며 충분한 길이의 기사 내용을 포함합니다. 같은 사건에 관한 추가 설명도 포함합니다."), { status: 200, headers: { "content-type": "text/html" } });
const resolved = await verifyWebSource({ url: googleUrl, title: "간호조무사 커피 살충제 사건", expectedTokens: ["간호조무사", "커피", "살충제"] }, { fetchImpl, lookup });
assert.equal(resolved.url, publisherUrl);
assert.equal(resolved.aggregatorUrl, googleUrl);
assert.equal(resolved.status, "verified");

const incidentClaims = [
  { field: "incidentDate", value: "2025-03-28", date: "2025-03-28", category: "confirmedFacts", summary: "2025년 3월 28일 구리시 병원에서 동료의 커피에 살충제가 들어갔다." },
  { field: "firstTrial", value: "2025-09-29", date: "2025-09-29", category: "trialStagesAndSentenceChanges", summary: "2025년 9월 29일 1심은 특수상해를 인정해 징역 2년을 선고했다." },
  { field: "prosecutionTheory", value: "attempted-murder", category: "prosecutionClaims", perspective: "prosecution", summary: "검찰은 살인미수에 해당한다고 주장했다." },
  { field: "defenseTheory", value: "no-intent", category: "defenseClaims", perspective: "defense", summary: "피고인 측은 살인의 고의가 없었다고 주장했다." },
  { field: "courtFinding", value: "special-injury", category: "courtFindings", perspective: "court", summary: "재판부는 살인미수는 증명되지 않았고 특수상해만 인정된다고 판단했다." },
];
const nurseSnapshot = {
  slug: "nurse-fixture",
  topic: "간호조무사 커피 살충제 사건",
  sources: [source({ url: "https://a.example/case?utm_source=test", publisher: "서울신문", extractedClaims: incidentClaims })],
  relatedCoverage: [source({ url: "https://b.example/case", publisher: "뉴시스", sameEvent, extractedClaims: [{ ...incidentClaims[0], value: "2025-03-29", date: "2025-03-29", summary: "2025년 3월 29일 사건이 발생했다고 보도했다." }, ...incidentClaims.slice(1)] })],
  followUps: [source({ url: "https://c.example/appeal", publisher: "후속매체", sameEvent, extractedClaims: [
    { field: "appealSentence", value: "1y6m-suspended3y", date: "2026", category: "trialStagesAndSentenceChanges", perspective: "court", summary: "항소심은 징역 1년 6개월에 집행유예 3년으로 변경했다." },
    { field: "appealFactor", value: "settlement", date: "2026", category: "courtFindings", perspective: "court", summary: "재판부는 피해자와의 합의와 처벌불원 의사를 항소심 양형 요소로 고려했다." },
  ] })],
  contradictions: [{ field: "incidentDate", values: ["2025-03-28", "2025-03-29"], status: "disputed" }],
  unknowns: ["정확한 살충제 종류", "정확한 투입량", "항소심의 정확한 선고일"],
};
const dossier = buildEventDossier({ slug: "nurse-fixture", candidate: { title: nurseSnapshot.topic }, researchSnapshot: nurseSnapshot, generatedAt: "2026-08-06T00:00:00.000Z" });
assert.equal(eventDossierHashIsCurrent(dossier), true);
assert.equal(dossier.sourceCoverage.verifiedSourceCount, 3);
assert.equal(dossier.sourceCoverage.corroboration, "multi-source");
assert.equal(dossier.conflicts.some((item) => item.field === "incidentDate" && item.values.includes("2025-03-28") && item.values.includes("2025-03-29")), true);
assert.equal(dossier.unknowns.includes("정확한 살충제 종류"), true);
assert.equal(dossier.prosecutionClaims.some((item) => item.summary.includes("살인미수")), true);
assert.equal(dossier.defenseClaims.some((item) => item.summary.includes("고의가 없었다")), true);
assert.equal(dossier.courtFindings.some((item) => item.summary.includes("특수상해만 인정")), true);
assert.equal(dossier.trialStagesAndSentenceChanges.some((item) => item.summary.includes("징역 2년")), true);
assert.equal(dossier.laterChanges.some((item) => item.summary.includes("집행유예 3년")), true);
assert.equal(dossier.laterChanges.some((item) => item.summary.includes("합의와 처벌불원")), true);
assert.equal(dossier.schemaVersion, 3);
assert.equal(dossier.narrative.detailSections.some((section) => section.id === "investigation" && section.claims.some((claim) => claim.summary.includes("살인미수"))), true);
assert.equal(dossier.narrative.detailSections.some((section) => section.id === "appeal" && section.claims.some((claim) => claim.summary.includes("집행유예 3년"))), true);
assert.equal(JSON.stringify(dossier).includes("기사 원문 사실 확인"), false, "workflow checklist labels must never become facts or prohibited claims");

const single = buildEventDossier({ slug: "single", candidate: { title: "single" }, researchSnapshot: { slug: "single", sources: [source({ url: "https://single.example/a", publisher: "Only", extractedClaims: incidentClaims })], relatedCoverage: [], followUps: [], unknowns: [], contradictions: [] } });
assert.equal(single.sourceCoverage.corroboration, "single-source");
assert.deepEqual(single.readiness.warnings, ["single-source-only"]);
assert.equal(single.readiness.readyForDraft, true, "a detailed exclusive report may proceed with single-source attribution");
const sparse = buildEventDossier({ slug: "sparse", candidate: { title: "sparse" }, researchSnapshot: { slug: "sparse", sources: [source({ url: "https://single.example/sparse", publisher: "Only", extractedClaims: incidentClaims.slice(0, 2).map((claim) => ({ ...claim, category: "confirmedFacts" })) })], relatedCoverage: [], followUps: [], unknowns: [], contradictions: [] } });
assert.equal(sparse.readiness.readyForLegal, false);
assert.equal(sparse.readiness.readyForDraft, false);
assert.ok(sparse.readiness.blockers.includes("at-least-four-event-claims-required"));
const referral = buildEventDossier({ slug: "referral", candidate: { title: "referral" }, researchSnapshot: { slug: "referral", sources: [source({ url: "https://single.example/referral", publisher: "Only", snippet: "피해 교사의 고소로 경찰은 아들의 사건을 검찰에 넘겼고 아버지를 증거 인멸 혐의로 입건했습니다. 경찰은 자택을 압수수색하고 수사 개입 의혹을 확인하고 있습니다. 당사자는 내부망에서 수사가 부당하다는 취지로 주장했습니다. 전수 조사 과정에서 이 사례가 뒤늦게 드러났습니다." })], relatedCoverage: [], followUps: [], unknowns: [], contradictions: [] } });
assert.equal(referral.investigationAndCharges.some((claim) => claim.summary.includes("검찰에 넘겼고")), true, "referral to prosecutors is an investigation event, not a prosecution position");
assert.equal(referral.prosecutionClaims.length, 0);
const contrast = buildEventDossier({ slug: "contrast", candidate: { title: "contrast" }, researchSnapshot: { slug: "contrast", sources: [source({ url: "https://single.example/contrast", publisher: "Only", extractedClaims: [
  { summary: "A 경감은 비교가 억울하다고 주장했지만, 동료 경찰관들은 피해 교사도 누군가의 자식이라며 비판했습니다." },
  { summary: "피해 교사의 고소로 경찰은 관련 사건을 수사했습니다." },
  { summary: "경찰은 휴대전화를 폐기한 A 경감을 입건했습니다." },
  { summary: "전수 조사에서 사건이 뒤늦게 드러났습니다." },
] })], relatedCoverage: [], followUps: [], unknowns: [], contradictions: [] } });
assert.equal(contrast.defenseClaims.some((claim) => claim.summary === "A 경감은 비교가 억울하다고 주장했습니다."), true, "one compound sentence must isolate the subject's position");
assert.equal(contrast.confirmedFacts.some((claim) => claim.summary.includes("동료 경찰관들은")), true, "the reported response must not be wrapped into the defense position");
assert.equal(contrast.victimImpact.some((claim) => claim.summary.includes("누군가의 자식")), false, "mentioning a victim is not itself verified victim impact");

const contaminatedRoadRage = buildEventDossier({
  slug: "road-rage-contamination",
  candidate: { title: "대구 모녀 차량 보복운전" },
  researchSnapshot: {
    slug: "road-rage-contamination",
    sources: [source({ url: "https://insight.example/road-rage", publisher: "인사이트", extractedClaims: [
      { summary: "대구 수성구 도로에서 차량 보복운전 사건이 발생했다." },
      { summary: "운전자는 피해 차량을 추격해 여러 차례 들이받았다." },
      { summary: "운전자는 가짜 권총으로 여성 운전자와 중학생 딸을 위협했다." },
      { summary: "운전자는 송곳으로 피해 차량 타이어를 찔렀다." },
      { category: "investigationAndCharges", summary: "대구 수성경찰서는 특수상해와 특수협박 혐의로 구속영장을 신청했다." },
    ] })],
    relatedCoverage: [],
    followUps: [source({
      url: "https://busan.example/spouse-homicide",
      publisher: "부산일보",
      sameEvent: { verified: true },
      snippet: "로그인 회원가입 e-paper 모바일보기 메뉴 펼치기 사회 정치 경제 문화 라이프 스포츠 오피니언 사람들 뉴스레터 가장 많이 본 뉴스 Click! '5살 자녀 앞 아내 살해' 현직 공무원 영장 신청. 경기 광주시에서 가정폭력 피해 아내를 살해한 별도 사건이다. 기자페이지 바로가기 Copyright ⓒ 부산일보.",
    })],
    unknowns: [],
    contradictions: [],
  },
});
assert.equal(contaminatedRoadRage.readiness.readyForLegal, false, "an unattested follow-up must fail the legal gate closed even when the representative report is otherwise detailed");
assert.equal(contaminatedRoadRage.readiness.readyForDraft, false);
assert.ok(contaminatedRoadRage.readiness.blockers.includes("unverified-event-source-contamination"));
assert.equal(contaminatedRoadRage.sourceCoverage.rejectedSameEventSourceCount, 1);
assert.equal(contaminatedRoadRage.sourceIndex.some((item) => item.url.includes("busan.example")), false);
assert.equal(JSON.stringify(contaminatedRoadRage).includes("경기 광주시에서 가정폭력"), false, "rejected cross-event prose must not enter claims or timeline");

const chromeFiltered = buildEventDossier({ slug: "chrome-filter", candidate: { title: "chrome filter" }, researchSnapshot: { slug: "chrome-filter", sources: [source({
  url: "https://news.example/clean",
  publisher: "검증매체",
  snippet: "대구 수성구 도로에서 차량이 앞차를 가로막았습니다. 운전자는 가짜 권총으로 피해자를 위협했습니다. 이어 송곳으로 타이어를 훼손했습니다. 경찰은 특수협박 혐의로 운전자를 입건했습니다. 로그인 회원가입 e-paper 모바일보기 메뉴 펼치기 사회 정치 경제 문화 라이프 스포츠 오피니언 사람들 뉴스레터 가장 많이 본 뉴스 Click! reporter@example.test 기자페이지 바로가기 Copyright ⓒ 검증매체.",
})], relatedCoverage: [], followUps: [], unknowns: [], contradictions: [] } });
assert.equal(JSON.stringify(chromeFiltered.confirmedFacts).includes("로그인"), false);
assert.equal(JSON.stringify(chromeFiltered.timeline).includes("기자페이지"), false);

console.log("event dossier contract tests passed");
