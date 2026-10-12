import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCandidates, investigationQueries, assertPublicRemoteUrl, extractNewsArticleText } from "./newsroom-lib.mjs";
import { searchYouTubeTopicSources } from "./media-pipeline.mjs";
import { buildEventDossier, canonicalSourceUrl } from "./event-dossier.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ROOT = path.join(ROOT, "production", "newsroom", "projects");
const JEJU_SOURCES = [
  { publisher: "헤드라인제주", url: "https://www.headlinejeju.co.kr/news/articleView.html?idxno=594552" },
  { publisher: "경향신문", url: "https://www.khan.co.kr/article/202606161620001" },
  { publisher: "나우뉴스", url: "https://nownews.seoul.co.kr/news/newsView.php?id=20260617601002" },
  { publisher: "제주MBC", url: "https://jejumbc.com/NewsArticle/846079" },
];
for (const source of JEJU_SOURCES) source.expectedTokens = ["제주", "초등학교", "교실", "침입"];
const LAW_SOURCES = [
  { title: "범죄피해자보호법", url: "https://www.law.go.kr/LSW/lsSc.do?eventGubun=060101&query=%EB%B2%94%EC%A3%84%ED%94%BC%ED%95%B4%EC%9E%90%20%EB%B3%B4%ED%98%B8%EB%B2%95" },
  { title: "형사소송법", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%ED%98%95%EC%82%AC%EC%86%8C%EC%86%A1%EB%B2%95" },
  { title: "형법(건조물침입)", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%ED%98%95%EB%B2%95" },
  { title: "형법(재물손괴)", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%ED%98%95%EB%B2%95" },
  { title: "소년법", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%86%8C%EB%85%84%EB%B2%95" },
  { title: "경찰 피해자 보호 규칙", url: "https://www.law.go.kr/LSW/admRulSc.do?menuId=5&query=%EB%B2%94%EC%A3%84%ED%94%BC%ED%95%B4%EC%9E%90%20%EB%B3%B4%ED%98%B8%EA%B7%9C%EC%B9%99" },
  { title: "초중등교육법(학교 안전)", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%B4%88%E3%86%8D%EC%A4%91%EB%93%B1%EA%B5%90%EC%9C%A1%EB%B2%95" },
  { title: "교원지위법", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B5%90%EC%9B%90%EC%9D%98%20%EC%A7%80%EC%9C%84%20%ED%96%A5%EC%83%81%20%EB%B0%8F%20%EA%B5%90%EC%9C%A1%ED%99%9C%EB%8F%99%20%EB%B3%B4%ED%98%B8%EB%A5%BC%20%EC%9C%84%ED%95%9C%20%ED%8A%B9%EB%B3%84%EB%B2%95" },
  { title: "성폭력처벌법", url: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%84%B1%ED%8F%AD%EB%A0%A5%EB%B2%94%EC%A3%84%EC%9D%98%20%EC%B2%98%EB%B2%8C%20%EB%93%B1%EC%97%90%20%EA%B4%80%ED%95%9C%20%ED%8A%B9%EB%A1%80%EB%B2%95" },
];

const JEJU_DISTINCTIVE_ANCHORS = ["텀블러", "체액", "정액", "소변", "여교사", "고교생"];
const JEJU_DISAMBIGUATION_NOISE = ["중국인", "관광객", "촬영"];

const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]*$/;
function researchConfigPath(slug, configRoot = PROJECT_ROOT) { return path.join(configRoot, `${slug}.research.config.json`); }
export async function loadResearchConfig(slug, configRoot = PROJECT_ROOT) {
  if (!SAFE_SLUG.test(String(slug || ""))) throw new Error("Invalid newsroom project slug");
  try {
    const config = JSON.parse(await fs.readFile(researchConfigPath(slug, configRoot), "utf8"));
    if (config.schemaVersion !== 1 || config.slug !== slug || !String(config.topic || "").trim()) throw new Error("invalid schema");
    for (const key of ["keywords", "sources", "laws", "adapterIds"]) if (!Array.isArray(config[key])) throw new Error(`${key} must be an array`);
    return config;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Invalid research configuration for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const GENERIC_KEYWORD_STOPWORDS = new Set([
  "관련", "뉴스", "사건", "논란", "황당", "해명", "영상", "공개", "사연", "사람", "당사자", "가해자", "피해자",
]);

function distinctiveKeywords(...values) {
  const seen = new Set();
  const keywords = [];
  for (const value of values) {
    for (const token of String(value || "").replace(/[‘’“”'\"]/g, " ").split(/[^\p{L}\p{N}]+/u)) {
      const normalized = token.trim();
      if (normalized.length < 2 || GENERIC_KEYWORD_STOPWORDS.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      keywords.push(normalized);
      if (keywords.length >= 10) return keywords;
    }
  }
  return keywords;
}

export function buildResearchConfigFromCandidate(slug, candidate) {
  if (!SAFE_SLUG.test(String(slug || ""))) throw new Error("Invalid newsroom project slug");
  if (!candidate || typeof candidate !== "object" || !String(candidate.title || "").trim()) throw new Error("Research candidate is required");
  const topic = String(candidate.title).trim().slice(0, 240);
  const keywords = distinctiveKeywords(topic, candidate.hook, candidate.storySummary, candidate.rationale);
  const sourceRows = [
    { publisher: candidate.source, title: candidate.title, url: candidate.url },
    // Related coverage from semantic selection is only a discovery hint. It
    // is explicitly unverified and must not be flattened into authoritative
    // configured sources. Only an explicitly approved, typed relationship may
    // be carried forward, and it is still re-checked during refresh.
    ...(Array.isArray(candidate.relatedCoverage) ? candidate.relatedCoverage.filter((source) =>
      source?.status === "verified"
      && ["same-event", "follow-up", "prior-context"].includes(source?.kind)
      && (source?.sameEvent?.verified === true || source?.kind === "prior-context")
    ) : []),
  ];
  const sourceByUrl = new Map();
  for (const source of sourceRows) {
    const url = String(source?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || sourceByUrl.has(url)) continue;
    sourceByUrl.set(url, {
      publisher: String(source?.publisher || source?.source || "출처 미상").slice(0, 100),
      title: String(source?.title || url).slice(0, 240),
      url,
      ...(source?.kind ? { kind: String(source.kind) } : {}),
      ...(source?.relationshipReason ? { relationshipReason: String(source.relationshipReason) } : {}),
    });
  }
  const eventFingerprint = buildEventFingerprint(topic, keywords);
  return {
    schemaVersion: 1,
    slug,
    topic,
    query: topic,
    keywords,
    adapterIds: ["google-news", "yonhaptv", "naver-news", "daum-news", "news1-society"],
    mediaAdapters: ["youtube"],
    sources: [...sourceByUrl.values()].slice(0, 12),
    laws: [],
    relevance: { anchors: keywords.slice(0, 8), minMatches: Math.min(2, keywords.length), excludeWhenNoAnchor: [], ...eventFingerprint },
    eventFingerprint,
    contradictions: [],
    limit: 50,
    generatedFrom: "promoted-newsroom-candidate",
  };
}

const GENERIC_EVENT_TERMS = new Set(["직장", "동료", "경찰", "신고", "수사", "후속", "사건", "혐의", "범행", "피해", "논란", "뉴스", "보도", "기사", "재판", "법원", "여성", "남성"]);
const EVENT_SYNONYMS = [
  ["커피", "커피", "음료", "컵", "카페"],
  ["살충제", "살충제", "농약", "독극물", "독성물질", "제초제"],
  ["간호조무사", "간호조무사", "간호사", "병원 직원", "의료인"],
  ["항소", "항소", "2심", "2심", "이심", "감형", "선고"],
  ["불법촬영", "불법촬영", "불법 촬영", "몰래 촬영", "몰카"],
  ["휴대전화", "휴대전화", "휴대폰", "스마트폰", "전화기", "폰"],
  ["증거인멸", "증거인멸", "증거 인멸", "증거 은닉", "증거물 폐기", "휴대전화를 폐기", "휴대전화를 부숴"],
  ["경찰관 가족", "경찰관 아버지", "경찰 간부 아버지", "경찰관 부친", "경감"],
];
const EVENT_ACTION_FAMILIES = [
  ["road-retaliation", /보복\s*운전|차선.{0,12}(?:시비|변경)|진로.{0,8}(?:차단|가로막)|차량.{0,12}(?:추격|뒤쫓)/u],
  ["vehicle-impact", /(?:차량|승용차|자동차|차).{0,12}(?:추돌|들이받|충돌)|(?:추돌|들이받|충돌).{0,12}(?:차량|승용차|자동차|차)/u],
  ["firearm-threat", /(?:가짜|모형|장난감)?\s*(?:권총|총기)|총으로\s*보이는/u],
  ["puncture-tool", /송곳|타이어.{0,10}(?:찌르|펑크|훼손)|바퀴.{0,10}(?:찌르|펑크|훼손)/u],
  ["homicide", /살해|살인|흉기로.{0,10}(?:찔러|찌른).{0,8}(?:숨지|사망)/u],
  ["domestic-violence", /가정\s*폭력|배우자.{0,12}(?:폭행|협박)|(?:아내|남편).{0,12}(?:폭행|협박)/u],
  ["sexual-assault", /성폭행|성폭력|강간|추행/u],
  ["intrusion", /주거\s*침입|건조물\s*침입|교실.{0,10}침입/u],
  ["poisoning", /살충제|농약|독극물|독성\s*물질/u],
  ["record-manipulation", /(?:신고|기록).{0,14}(?:삭제|미입력|허위\s*종결)/u],
  ["evidence-destruction", /증거.{0,10}(?:인멸|은닉|폐기)|휴대전화.{0,10}(?:부숴|폐기)/u],
  ["kidnapping", /납치|감금/u],
  ["arson", /방화|불을\s*질/u],
  ["fraud", /사기|횡령|배임/u],
];
const EVENT_ROLE_FAMILIES = [
  ["offender-driving-with-young-child", /(?:5살|5세).{0,12}(?:딸|자녀).{0,20}(?:태운|태우고).{0,24}(?:보복\s*운전|위협)|(?:보복\s*운전|위협).{0,36}(?:5살|5세).{0,12}(?:딸|자녀).{0,12}(?:태운|태우고|탑승)/u],
  ["victim-driving-with-teen-daughter", /(?:중학생|중학교\s*1학년|10대).{0,12}(?:딸|자녀)|(?:딸|자녀).{0,12}(?:중학생|중학교\s*1학년|10대)/u],
  ["spouse-homicide-parties", /(?:아내|남편|배우자).{0,12}(?:살해|살인|숨지)|(?:살해|살인).{0,12}(?:아내|남편|배우자)/u],
  ["driver", /운전자|차를\s*몰던|운전\s*중/u],
  ["mother-daughter", /모녀|여성\s*운전자.{0,18}(?:딸|자녀)|(?:딸|자녀).{0,18}여성\s*운전자/u],
  ["spouses", /아내|남편|배우자|부부/u],
  ["public-official", /공무원|공직자/u],
  ["police-officer", /경찰관|경감|경위|경장/u],
  ["medical-worker", /간호조무사|간호사|의료인/u],
];
const KOREAN_REGION_NAMES = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
function normalizeEventText(value) { return String(value || "").toLocaleLowerCase("ko-KR").replace(/[\u200b\s]+/gu, ""); }
function matchedFacetNames(value, families) {
  const normalized = semanticEvidenceText(value).toLocaleLowerCase("ko-KR");
  return families.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name);
}
function semanticEvidenceText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(?:nbsp|hellip|apos|quot|amp);|&#(?:x[0-9a-f]+|\d+);/giu, " ")
    .replace(/(?:-->|<!--)/gu, " ")
    .replace(/로그인\s+회원가입[\s\S]{0,5000}?나를\s*위한\s*뉴스\s*click!/giu, " ")
    .split(/(?<=[.!?。？！])\s+/u)
    .filter((segment) => {
      if (/(?:로그인\s+회원가입|메뉴\s*펼치기|기사퍼가기|기자페이지\s*바로가기|copyright\s*[©ⓒ]|e-?paper\s+모바일보기|가장\s*많이\s*본\s*뉴스|나를\s*위한\s*뉴스\s*click)/iu.test(segment)) return false;
      const navigationTerms = ["사회", "정치", "경제", "문화", "라이프", "스포츠", "오피니언", "사람들", "뉴스레터"].filter((term) => segment.includes(term)).length;
      return navigationTerms < 5;
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}
function eventLocations(value) {
  const source = semanticEvidenceText(value);
  const locations = new Set(KOREAN_REGION_NAMES.filter((name) => new RegExp(`(?:^|[^가-힣])${name}(?=$|[^가-힣]|(?:시|도)(?:[^가-힣]|$))`, "u").test(source)));
  for (const match of source.matchAll(/(?:^|[^가-힣])([가-힣]{2,8}(?:시|군|구|동))(?=(?:의)?\s*(?:한\s*)?(?:도로|경찰서|경찰청|검찰청|법원|거처|다세대|현장|사건|주택|아파트))/gu)) {
    locations.add(match[1]);
  }
  return [...locations];
}
function eventDates(value) {
  const source = semanticEvidenceText(value);
  return [...new Set([
    ...[...source.matchAll(/20\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/gu)].map((match) => match[0].replace(/\s+/gu, "")),
    ...[...source.matchAll(/(?:지난달\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/gu)].map((match) => match[0].replace(/\s+/gu, "")),
    ...[...source.matchAll(/지난달\s*\d{1,2}\s*일/gu)].map((match) => match[0].replace(/\s+/gu, "")),
  ])].slice(0, 8);
}
export function deriveEventSemanticFacets(value) {
  return {
    locations: eventLocations(value),
    actions: matchedFacetNames(value, EVENT_ACTION_FAMILIES),
    roles: matchedFacetNames(value, EVENT_ROLE_FAMILIES),
    dates: eventDates(value),
  };
}
function buildEventFingerprint(topic, keywords = []) {
  const text = normalizeEventText(`${topic} ${keywords.join(" ")}`);
  const groups = EVENT_SYNONYMS.filter(([, ...terms]) => terms.some((term) => text.includes(normalizeEventText(term))));
  const tokens = [...new Set(String(`${topic} ${keywords.join(" ")}`).match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .filter((token) => !GENERIC_EVENT_TERMS.has(token));
  const anchors = tokens.slice(0, 10);
  const distinctiveAnchors = groups.length
    ? groups.map(([name, ...terms]) => ({ name, terms }))
    : anchors.slice(0, 4).map((anchor) => ({ name: anchor, terms: [anchor] }));
  const pesticideCase = /살충제|농약|독극물/.test(text) && /커피|음료|컵/.test(text) && /간호조무사|간호사/.test(text);
  return {
    anchors,
    distinctiveAnchors,
    minDistinctiveMatches: pesticideCase ? 3 : Math.min(2, Math.max(1, distinctiveAnchors.length || anchors.length)),
    minTotalMatches: pesticideCase ? 3 : Math.min(3, Math.max(2, anchors.length)),
  };
}

export function classifySameEvent(candidate, event = {}, options = {}) {
  const candidateEvidence = `${candidate?.title || ""} ${candidate?.description || ""} ${candidate?.snippet || ""} ${candidate?.channelTitle || ""}`;
  const text = normalizeEventText(candidateEvidence);
  const fingerprint = event.eventFingerprint || event.relevance || event;
  const anchors = Array.isArray(fingerprint.anchors) ? fingerprint.anchors.filter(Boolean) : [];
  const groups = Array.isArray(fingerprint.distinctiveAnchors) ? fingerprint.distinctiveAnchors : [];
  const matchedDistinctiveAnchors = groups.filter((group) => (Array.isArray(group?.terms) ? group.terms : [group]).some((term) => text.includes(normalizeEventText(term))));
  const matchedAnchors = [...new Set([...anchors.filter((anchor) => text.includes(normalizeEventText(anchor))), ...matchedDistinctiveAnchors.map((group) => group.name || group.terms?.[0]).filter(Boolean)])];
  const minDistinctiveMatches = Math.max(1, Number(fingerprint.minDistinctiveMatches || options.minDistinctiveMatches || 2));
  const minTotalMatches = Math.max(1, Number(fingerprint.minTotalMatches || options.minTotalMatches || 2));
  const lexicalVerified = groups.length > 0 && matchedDistinctiveAnchors.length >= minDistinctiveMatches && matchedAnchors.length >= minTotalMatches;
  const semanticFacets = fingerprint.semanticFacets && typeof fingerprint.semanticFacets === "object" ? fingerprint.semanticFacets : null;
  const candidateFacets = semanticFacets ? deriveEventSemanticFacets(candidateEvidence) : null;
  const sharedActions = semanticFacets && candidateFacets ? semanticFacets.actions.filter((name) => candidateFacets.actions.includes(name)) : [];
  const sharedLocations = semanticFacets && candidateFacets ? semanticFacets.locations.filter((name) => candidateFacets.locations.includes(name)) : [];
  const sharedRoles = semanticFacets && candidateFacets ? semanticFacets.roles.filter((name) => candidateFacets.roles.includes(name)) : [];
  const minimumActionMatches = semanticFacets?.actions?.length ? Math.min(2, semanticFacets.actions.length) : 0;
  const minimumRoleMatches = semanticFacets?.roles?.length ? 1 : 0;
  const actionVerified = minimumActionMatches === 0 || sharedActions.length >= minimumActionMatches;
  const roleVerified = minimumRoleMatches === 0 || sharedRoles.length >= minimumRoleMatches;
  const locationConflict = Boolean(semanticFacets?.locations?.length && candidateFacets?.locations?.length && sharedLocations.length === 0);
  const verified = lexicalVerified && actionVerified && roleVerified && !locationConflict;
  const rejectionReason = verified ? null
    : !lexicalVerified ? (groups.length === 0 ? "no-distinctive-fingerprint" : matchedDistinctiveAnchors.length < minDistinctiveMatches ? "insufficient-distinctive-anchors" : "insufficient-anchor-matches")
      : locationConflict ? "conflicting-location-fingerprint"
        : !actionVerified ? "insufficient-action-fingerprint"
          : "conflicting-participant-role-fingerprint";
  return {
    verified,
    confidence: verified ? Math.min(1, 0.55 + matchedDistinctiveAnchors.length / Math.max(1, groups.length) * 0.45) : matchedDistinctiveAnchors.length / Math.max(1, minDistinctiveMatches) * 0.5,
    matchedAnchors,
    matchedDistinctiveAnchors: matchedDistinctiveAnchors.map((group) => group.name || group.terms?.[0] || String(group)),
    semanticMatch: semanticFacets ? { sharedActions, sharedLocations, sharedRoles, candidateFacets, minimumActionMatches, minimumRoleMatches, locationConflict } : null,
    eventFingerprint: { anchors, distinctiveAnchors: groups, minDistinctiveMatches, minTotalMatches, ...(semanticFacets ? { semanticFacets } : {}) },
    rejectionReason,
  };
}

function attestFetchedSameEvent(candidate, eventFingerprint) {
  const gate = classifySameEvent(candidate, eventFingerprint);
  const contentEvidenceVerified = candidate?.status === "verified" && candidate?.contentVerification?.status === "verified";
  return {
    ...gate,
    verified: gate.verified && contentEvidenceVerified,
    verificationStage: "post-fetch",
    contentEvidenceVerified,
    rejectionReason: contentEvidenceVerified ? gate.rejectionReason : "unverified-fetched-content",
  };
}

function defaultDossierPath(configRoot) {
  // The promoted dossier registry is the explicit newsroom project registry.
  // Keep isolated callers self-contained while the production path reads the
  // durable registry used by the promotion flow.
  return path.resolve(configRoot) === PROJECT_ROOT
    ? path.join(ROOT, "out", "newsroom", "research-dossiers.json")
    : path.join(configRoot, "research-dossiers.json");
}

async function loadPromotedCandidate(slug, configRoot, dossierPath) {
  const registryPath = dossierPath || defaultDossierPath(configRoot);
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Invalid newsroom project registry: ${error instanceof Error ? error.message : String(error)}`);
  }
  const dossier = Array.isArray(registry?.dossiers)
    ? registry.dossiers.find((item) => item && typeof item === "object" && (item.slug === slug || item.id === slug))
    : null;
  if (!dossier || !String(dossier.title || "").trim() || !/^https?:\/\//i.test(String(dossier.url || ""))) return null;
  return dossier;
}

export async function ensureResearchConfig(slug, configRoot = PROJECT_ROOT, { dossierPath } = {}) {
  const existing = await loadResearchConfig(slug, configRoot);
  // Hand-authored research configs are authoritative. Configs generated from a
  // promoted newsroom candidate are rebuilt so later collector improvements and
  // candidate edits are reflected without asking the user to delete stale files.
  if (existing && existing.generatedFrom !== "promoted-newsroom-candidate") return existing;
  if (!existing && slug === "jeju-school-intrusion") return null;
  const workflowFile = path.join(configRoot, `${slug}.workflow.json`);
  let workflow;
  try {
    workflow = JSON.parse(await fs.readFile(workflowFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      // A promoted dossier is a registered project even when the workflow
      // page has not been opened yet. This closes the UI race where SAME-EVENT
      // RESEARCH starts before the workflow GET has persisted its state, while
      // still rejecting typos and arbitrary slugs absent from the registry.
      const promoted = await loadPromotedCandidate(slug, configRoot, dossierPath);
      if (!promoted) throw new Error("Unknown newsroom project");
      workflow = { slug, candidate: promoted };
    } else {
      throw new Error(`Invalid newsroom workflow for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const promoted = await loadPromotedCandidate(slug, configRoot, dossierPath);
  if (promoted && workflow.candidate?.url && promoted.url !== workflow.candidate.url) {
    throw new Error("Promoted dossier conflicts with the registered workflow representative source");
  }
  // The promotion registry can gain verified same-event coverage after the
  // workflow was first opened. Prefer that refreshed seed while retaining the
  // exact approved representative URL enforced above; every carried source is
  // still fetched and classified again by refreshResearchSnapshot.
  const config = buildResearchConfigFromCandidate(slug, promoted || workflow.candidate);
  const destination = researchConfigPath(slug, configRoot);
  const temporary = `${destination}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      // Windows does not replace an existing destination during rename. The
      // generated config is intentionally refreshable, so copy the complete
      // temporary file over the stale generated config, then parse the result.
      // Concurrent callers write identical candidate-derived bytes.
      if (["EEXIST", "EPERM", "EACCES", "ENOTEMPTY"].includes(error?.code)) {
        const current = await loadResearchConfig(slug, configRoot).catch(() => null);
        if (current && JSON.stringify(current) === JSON.stringify(config)) return current;
        let lastCopyError = error;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            await fs.copyFile(temporary, destination);
          } catch (copyError) {
            lastCopyError = copyError;
          }
          const persisted = await loadResearchConfig(slug, configRoot).catch(() => null);
          if (persisted && JSON.stringify(persisted) === JSON.stringify(config)) return persisted;
          if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        }
        throw lastCopyError;
      }
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
  return config;
}

export function isRelevantFollowUp(candidate, relevance = {}) {
  const text = `${candidate?.title || ""} ${candidate?.description || ""}`;
  const anchors = Array.isArray(relevance.anchors) ? relevance.anchors : [];
  const noise = Array.isArray(relevance.excludeWhenNoAnchor) ? relevance.excludeWhenNoAnchor : [];
  const minMatches = Math.max(1, Math.min(anchors.length || 1, Number(relevance.minMatches || 1)));
  const hasAnchor = anchors.filter((anchor) => text.includes(anchor)).length >= minMatches;
  if (noise.some((term) => text.includes(term)) && !hasAnchor) return false;
  return anchors.length ? hasAnchor : true;
}

export function isRelevantJejuFollowUp(candidate) {
  const text = `${candidate?.title || ""} ${candidate?.description || ""}`;
  const hasAnchor = JEJU_DISTINCTIVE_ANCHORS.some((anchor) => text.includes(anchor));
  const hasNoise = JEJU_DISAMBIGUATION_NOISE.some((term) => text.includes(term));
  if (hasNoise && !hasAnchor) return false;
  return hasAnchor;
}

function snapshotPath(slug, snapshotRoot = PROJECT_ROOT) { return path.join(snapshotRoot, `${slug}.research.json`); }
function decodeHtml(value = "") { return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function headlineFingerprint(value = "") { return decodeHtml(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
const FOLLOW_UP_SIGNALS = ["후속", "입건", "송치", "구속", "영장", "기소", "처분", "판결", "항소", "2심", "감형", "집행유예", "검거", "수사 착수", "사과", "합의", "보상", "재발 방지"];
function isActualFollowUp(candidate, sourceResults = []) {
  const text = `${candidate?.title || ""} ${candidate?.snippet || candidate?.description || ""}`;
  if (!FOLLOW_UP_SIGNALS.some((signal) => text.includes(signal))) return false;
  const candidateTime = Date.parse(candidate?.date || candidate?.publishedAt || "");
  const sourceTimes = sourceResults.map((item) => Date.parse(item?.date || "")).filter(Number.isFinite);
  return !Number.isFinite(candidateTime) || !sourceTimes.length || candidateTime > Math.max(...sourceTimes);
}
function topicMediaQuery({ topic = "", keywords = [], sourceResults = [] } = {}) {
  const quoted = [...String(topic).matchAll(/[‘’“”'"]([^‘’“”'"]{2,30})[‘’“”'"]/gu)].map((match) => match[1].trim());
  const evidence = sourceResults.map((item) => `${item?.title || ""} ${item?.snippet || ""}`).join(" ");
  const originTerms = ["JTBC", "사건반장", "SBS", "궁금한 이야기 Y", "MBC", "실화탐사대", "KBS"].filter((term) => evidence.includes(term));
  return [...new Set([...(keywords || []).slice(0, 2), ...quoted.slice(0, 2), ...originTerms])].filter(Boolean).join(" ") || String(topic).trim();
}
function meta(html, name) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i");
  const reverse = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i");
  return decodeHtml((html.match(re)?.[1] || html.match(reverse)?.[1] || "").trim());
}
function articleEvidence(html) {
  const structured = extractNewsArticleText(html);
  if (structured.text.length >= 80) return structured.text;
  const jsonBodies = [];
  const collectBodies = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) collectBodies(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.articleBody === "string" && value.articleBody.trim()) jsonBodies.push(value.articleBody);
    for (const nested of Object.values(value)) collectBodies(nested);
  };
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].replace(/<!--|-->/g, ""));
      collectBodies(parsed);
    } catch { /* malformed JSON-LD is handled by the HTML fallback */ }
  }
  if (jsonBodies.join(" ").trim()) return decodeHtml(jsonBodies.join(" "));
  const container = html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  if (container) return decodeHtml(container);
  const description = meta(html, "og:description") || meta(html, "description");
  if (description) return description;
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
}

const CONTENT_BLOCK_MARKERS = /(?:^|\b)(?:sign\s*in|log\s*in|captcha|access\s+denied|verify\s+you(?:r| are)\s+human|robot|cloudflare|challenge|error\s+404|page\s+not\s+found)(?:\b|$)/i;

function contentTokens(value) {
  return [...new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .filter((token) => token.length >= 2);
}

function verifyFetchedContent({ item, response, html, title, snippet }) {
  const normalizedSnippet = String(snippet || "").trim();
  const normalizedTitle = String(title || "").trim();
  const bodyEvidence = decodeHtml(String(html || "").match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || "");
  const body = `${normalizedTitle} ${normalizedSnippet}`.trim();
  const articleLike = /<(?:article|main)\b/i.test(html) || /application\/ld\+json/i.test(html) || Boolean(meta(html, "og:description") || meta(html, "description"));
  const meaningfulContent = normalizedSnippet.length >= 80 || bodyEvidence.length >= 80;
  const sourceTokens = [...new Set(contentTokens(item.title || "").concat(contentTokens((item.expectedTokens || []).join(" "))))];
  const bodyTokens = new Set(contentTokens(body));
  const overlap = sourceTokens.filter((token) => bodyTokens.has(token));
  const overlapRequired = sourceTokens.length >= 2 ? 2 : sourceTokens.length === 1 ? 1 : 0;
  const titleOverlap = overlapRequired > 0 && overlap.length >= overlapRequired;
  const blocked = CONTENT_BLOCK_MARKERS.test(body.slice(0, 2_000));
  const verified = Boolean(response?.ok) && articleLike && meaningfulContent && titleOverlap && !blocked;
  let reason = "verified-content";
  if (!response?.ok) reason = `http-${response?.status || "error"}`;
  else if (blocked) reason = "blocked-or-challenge-page";
  else if (!meaningfulContent) reason = "insufficient-content";
  else if (!articleLike) reason = "not-article-like";
  else if (!sourceTokens.length) reason = "missing-expected-evidence";
  else if (!titleOverlap) reason = "title-content-mismatch";
  return {
    status: verified ? "verified" : "unverified",
    reason,
    httpOk: Boolean(response?.ok),
    articleLike,
    meaningfulContent,
    titleOverlap,
    overlapTokens: overlap.slice(0, 12),
    snippetLength: normalizedSnippet.length,
    contentLength: normalizedSnippet.length,
  };
}
async function fetchHtml(url, fetchImpl = globalThis.fetch, lookup) {
  let current = await assertPublicRemoteUrl(url, lookup ? { lookup } : {});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    let response;
    for (let redirects = 0; redirects < 4; redirects += 1) {
      response = await fetchImpl(current, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "OpenCut-Local-Newsroom/1.0 research" } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers?.get?.("location") || response.headers?.location;
      if (!location) throw new Error("redirect has no destination");
      current = await assertPublicRemoteUrl(new URL(String(location), current).toString(), lookup ? { lookup } : {});
      if (redirects === 3) throw new Error("too many redirects");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error("article exceeds research size limit");
    return { response, html: bytes.toString("utf8"), finalUrl: current };
  } finally { clearTimeout(timer); }
}

function aggregatorTarget(html, baseUrl) {
  let base;
  try { base = new URL(baseUrl); } catch { return ""; }
  const candidates = [
    html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1],
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical/i)?.[1],
    meta(html, "og:url"),
    ...[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]).slice(0, 100),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      let target = new URL(decodeHtml(candidate), base).toString();
      const parsed = new URL(target);
      const nested = parsed.searchParams.get("url") || parsed.searchParams.get("q");
      if (nested && /^https?:\/\//i.test(nested)) target = nested;
      const host = new URL(target).hostname.toLocaleLowerCase();
      if (host !== base.hostname.toLocaleLowerCase() && !/(?:^|\.)google\./i.test(host) && host !== "news.google.com") return target;
    } catch { /* ignore malformed aggregator links */ }
  }
  return "";
}

function isAggregator(value) {
  try { return /(?:^|\.)(?:news\.google\.com|google\.[a-z.]+)$/i.test(new URL(value).hostname); } catch { return false; }
}

export async function verifyWebSource(item, { fetchImpl = globalThis.fetch, lookup } = {}) {
  const fetchedAt = new Date().toISOString();
  try {
    let fetched = await fetchHtml(item.url, fetchImpl, lookup);
    const aggregatorUrl = isAggregator(item.url) || isAggregator(fetched.finalUrl) ? String(item.url) : "";
    if (aggregatorUrl) {
      const target = aggregatorTarget(fetched.html, fetched.finalUrl);
      if (target) fetched = await fetchHtml(target, fetchImpl, lookup);
    }
    const { response, html, finalUrl } = fetched;
    const title = meta(html, "og:title") || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title || "");
    const published = meta(html, "article:published_time") || meta(html, "datePublished") || null;
    const text = articleEvidence(html);
    const boundedTitle = title.slice(0, 240);
    const snippet = text.slice(0, 4_000);
    let contentVerification = verifyFetchedContent({ item, response, html, title: boundedTitle, snippet });
    const authoritativeLegalPage = /(?:^|\.)law\.go\.kr$/iu.test(new URL(finalUrl).hostname)
      && ["precedent", "statute", "rule"].includes(String(item.kind || item.category || ""))
      && Boolean(response?.ok)
      && snippet.length >= 80
      && contentVerification.titleOverlap
      && !CONTENT_BLOCK_MARKERS.test(`${boundedTitle} ${snippet}`.slice(0, 2_000));
    if (authoritativeLegalPage) contentVerification = { ...contentVerification, status: "verified", reason: "verified-authoritative-legal-source", articleLike: true };
    const canonicalUrl = canonicalSourceUrl(finalUrl) || String(item.url || "");
    return { ...item, url: canonicalUrl, ...(aggregatorUrl && canonicalUrl !== canonicalSourceUrl(aggregatorUrl) ? { aggregatorUrl } : {}), title: boundedTitle, publisher: meta(html, "og:site_name") || item.publisher || item.source, date: published, status: contentVerification.status === "verified" ? "verified" : `content-unverified`, snippet, contentVerification, fetchedAt };
  } catch (error) {
    return { ...item, status: "error", contentVerification: { status: "unverified", reason: "fetch-error", httpOk: false }, error: error instanceof Error ? error.message : String(error), fetchedAt };
  }
}

export async function refreshResearchSnapshot({ slug, configRoot = PROJECT_ROOT, dossierPath, fetchImpl = globalThis.fetch, lookup, now = new Date(), snapshotRoot = PROJECT_ROOT, topicMediaSearch = searchYouTubeTopicSources, candidateSearch = fetchCandidates } = {}) {
	if (!SAFE_SLUG.test(String(slug || ""))) throw new Error("Invalid newsroom project slug");
  const configured = await ensureResearchConfig(slug, configRoot, { dossierPath });
  if (!configured && slug !== "jeju-school-intrusion") throw new Error("Unknown newsroom project");
  const topic = configured?.topic || "제주 초등학교 교실 침입 사건";
  const query = configured?.query || (configured ? topic : "제주 초등학교 교실 침입");
  const keywords = configured?.keywords || ["제주", "초등학교", "교실", "침입", "텀블러", "의자", "경찰", "영장", "피의자"];
  const sources = configured?.sources || JEJU_SOURCES;
  const laws = configured?.laws || LAW_SOURCES;
  const adapterIds = configured?.adapterIds || ["google-news", "yonhaptv"];
  const mediaAdapters = configured?.mediaAdapters || [];
  const relevant = configured ? (candidate) => isRelevantFollowUp(candidate, configured.relevance) : isRelevantJejuFollowUp;
  const rawSourceResults = await Promise.all(sources.map((source) => verifyWebSource(source, { fetchImpl, lookup })));
  const dedupedConfiguredResults = [...new Map(rawSourceResults.map((source) => [canonicalSourceUrl(source.url) || source.url, source])).values()];
  // Legacy built-in research has several primary sources. For promoted or
  // hand-authored projects, only the first untyped/primary source is the
  // representative source; every configured secondary source must pass the
  // same-event classifier before entering the dossier.
  const configuredProject = Boolean(configured);
  const primaryIndex = configuredProject
    ? dedupedConfiguredResults.findIndex((source) => source.kind === "primary" || !source.kind)
    : -1;
  const primaryResults = configuredProject
    ? (primaryIndex >= 0 ? [dedupedConfiguredResults[primaryIndex]] : [])
    : dedupedConfiguredResults.filter((source) => !["same-event", "follow-up", "prior-context"].includes(source.kind));
  const configuredSecondaryResults = configuredProject
    ? dedupedConfiguredResults.filter((_, index) => index !== primaryIndex)
    : [];
  const sourceResults = primaryResults;
  const sourceEvidence = sourceResults.filter((source) => source.status === "verified").map((source) => `${source.title || ""} ${source.snippet || ""}`).join(" ");
  const evidenceKeywords = distinctiveKeywords(sourceEvidence);
  const runtimeKeywords = [...new Set([...keywords, ...evidenceKeywords])].slice(0, 20);
  const derivedFingerprint = buildEventFingerprint(sourceEvidence || topic, runtimeKeywords);
  const knownSynonymGroups = new Set(EVENT_SYNONYMS.map(([name]) => name));
  const derivedUsesKnownSynonyms = derivedFingerprint.distinctiveAnchors.some((group) => knownSynonymGroups.has(group.name));
  const baseEventFingerprint = configured?.generatedFrom === "promoted-newsroom-candidate" && derivedUsesKnownSynonyms
    ? derivedFingerprint
    : configured?.eventFingerprint || configured?.relevance || derivedFingerprint;
  // Title overlap is only a discovery gate. Bind the reusable event identity to
  // semantic facets extracted from the verified representative article so a
  // shared age, child reference or legal stage cannot merge separate crimes.
  const evidenceFacets = deriveEventSemanticFacets(sourceEvidence || topic);
  const topicFacets = deriveEventSemanticFacets(topic);
  const semanticFacets = {
    ...evidenceFacets,
    // A lone mechanism appearing only in a long page body can be a related
    // link or extraction residue. Require it only when the approved topic also
    // names it; multiple coherent mechanisms remain strong body evidence.
    actions: evidenceFacets.actions.length >= 2 ? evidenceFacets.actions : evidenceFacets.actions.filter((name) => topicFacets.actions.includes(name)),
  };
  const eventFingerprint = { ...baseEventFingerprint, semanticFacets };
  const queries = investigationQueries({ topic: query, keywords: runtimeKeywords });
  const configuredSameEvent = configuredSecondaryResults
    .filter((source) => source.kind === "same-event" && source.status === "verified")
    .map((source) => ({ ...source, sameEvent: attestFetchedSameEvent(source, eventFingerprint) }))
    .filter((source) => source.sameEvent.verified);
  const configuredPriorContext = configuredSecondaryResults
    .filter((source) => source.kind === "prior-context" && source.status === "verified")
    .map((source) => ({ ...source, relationshipReason: source.relationshipReason || source.evidence || "사건 발생 이전의 직접 관련 맥락으로 설정된 검증 출처" }));
  const configuredFollowUps = configuredSecondaryResults.filter((source) => source.kind === "follow-up" && source.status === "verified").map((source) => ({ ...source, sameEvent: attestFetchedSameEvent(source, eventFingerprint) })).filter((source) => source.sameEvent.verified);
  const configuredUntypedSameEvent = configuredSecondaryResults
    .filter((source) => !source.kind && source.status === "verified")
    .map((source) => ({ ...source, sameEvent: attestFetchedSameEvent(source, eventFingerprint) }))
    .filter((source) => source.sameEvent.verified);
  const acceptedConfiguredSecondaryUrls = new Set([
    ...configuredSameEvent,
    ...configuredFollowUps,
    ...configuredUntypedSameEvent,
    ...configuredPriorContext,
  ].map((source) => source.url));
  const rejectedConfiguredSecondary = configuredSecondaryResults.filter((source) => !acceptedConfiguredSecondaryUrls.has(source.url));
  let followUpResult;
  try {
    followUpResult = await candidateSearch({ mode: "investigation", query, queries, adapterIds, limit: Number(configured?.limit || 20), now, fetchImpl, requireRelevance: false });
  } catch (error) {
    followUpResult = { candidates: [], errors: [{ adapterId: "investigation", message: error instanceof Error ? error.message : String(error) }] };
  }
  let mediaResult = { status: "unavailable", candidates: [], errors: [] };
  if (mediaAdapters.includes("youtube")) {
    try {
      mediaResult = await topicMediaSearch({ query: topicMediaQuery({ topic, keywords, sourceResults }), maxResults: 8 });
    } catch (error) {
      mediaResult = { status: "error", candidates: [], errors: [{ adapterId: "youtube", message: error instanceof Error ? error.message : String(error) }] };
    }
  }
  const lawResults = await Promise.all(laws.map((source) => verifyWebSource({ ...source, publisher: source.publisher || "국가법령정보센터" }, { fetchImpl, lookup })));
  const knownUrls = new Set(dedupedConfiguredResults.map((item) => String(item.url || "")).filter(Boolean));
  const knownTitles = new Set(dedupedConfiguredResults.map((item) => headlineFingerprint(item.title)).filter(Boolean));
  const followUpByUrl = new Map();
  // Discovery wrappers are hints, never evidence. Direct publisher URLs must
  // receive the bounded verification slots before Google landing pages.
  const orderedCandidates = [...(followUpResult.candidates || [])].sort((left, right) => Number(isAggregator(left.url)) - Number(isAggregator(right.url)));
  for (const candidate of orderedCandidates) {
    const gate = configured ? classifySameEvent(candidate, eventFingerprint) : { verified: relevant(candidate), matchedAnchors: [], matchedDistinctiveAnchors: [], eventFingerprint: eventFingerprint || {}, confidence: relevant(candidate) ? 1 : 0, rejectionReason: relevant(candidate) ? null : "legacy-jeju-anchor-mismatch" };
    if (!gate.verified) continue;
    const url = String(candidate.url || "").trim();
    if (!url || knownUrls.has(url) || knownTitles.has(headlineFingerprint(candidate.title)) || followUpByUrl.has(url)) continue;
    followUpByUrl.set(url, { ...candidate, sameEvent: gate });
    if (followUpByUrl.size >= 12) break;
  }
  const verifiedCandidates = await Promise.all([...followUpByUrl.values()].map(async (candidate) => {
    const verified = await verifyWebSource({
      title: candidate.title,
      url: candidate.url,
      publisher: candidate.source,
      score: candidate.score,
      evidence: candidate.scoreEvidence,
    }, { fetchImpl, lookup });
    const isGoogleLanding = verified.title === "Google News" || /^Comprehensive up-to-date news coverage/i.test(String(verified.snippet || ""));
    const fetchedCandidate = isGoogleLanding ? {
      ...verified,
      title: candidate.title,
      publisher: candidate.source,
      date: candidate.publishedAt,
      status: "candidate",
      snippet: candidate.description || "Google News 중계 링크입니다. 원문 매체에서 사실관계를 추가 확인해야 합니다.",
    } : verified;
    return { ...fetchedCandidate, sameEvent: attestFetchedSameEvent(fetchedCandidate, eventFingerprint) };
  }));
  const relevantFollowUps = [...new Map([...configuredFollowUps, ...verifiedCandidates].map((candidate) => [canonicalSourceUrl(candidate.url) || candidate.url, candidate])).values()]
    .filter((candidate) => candidate.status === "verified" && candidate.contentVerification?.status === "verified" && candidate.sameEvent?.verified === true && candidate.sameEvent?.verificationStage === "post-fetch");
  const rejectedFetchedCandidates = verifiedCandidates.filter((candidate) => candidate.status === "verified" && candidate.contentVerification?.status === "verified" && candidate.sameEvent?.verified !== true);
  const actualFollowUps = relevantFollowUps.filter((candidate) => isActualFollowUp(candidate, sourceResults));
  const sameTopicCoverage = relevantFollowUps.filter((candidate) => !isActualFollowUp(candidate, sourceResults));
  const relevantMedia = (mediaResult.candidates || [])
    .map((candidate) => ({ candidate, sameEvent: configured ? classifySameEvent(candidate, eventFingerprint) : { verified: relevant({ title: candidate.title, description: `${candidate.description || ""} ${candidate.channelTitle || ""}` }), eventFingerprint } }))
    .filter(({ sameEvent }) => sameEvent.verified)
    .slice(0, 8)
    .map(({ candidate, sameEvent }) => ({
      title: candidate.title,
      url: candidate.url,
      publisher: candidate.publisher || candidate.channelTitle || "YouTube",
      date: candidate.publishedAt,
      status: candidate.status || "indexed",
      snippet: candidate.description,
      fetchedAt: candidate.fetchedAt,
      mediaType: "video",
      thumbnail: candidate.thumbnail,
      rightsStatus: "reference-only",
      kind: "related-video",
      sameEvent,
    }));
  const serializeArticle = (candidate, extra = {}) => ({ title: candidate.title, url: candidate.url, publisher: candidate.publisher || candidate.source, date: candidate.date || candidate.publishedAt, status: candidate.status, snippet: candidate.snippet || candidate.description, contentVerification: candidate.contentVerification, fetchedAt: candidate.fetchedAt, score: candidate.score, evidence: candidate.evidence, sameEvent: candidate.sameEvent, ...(Array.isArray(candidate.extractedClaims) ? { extractedClaims: candidate.extractedClaims } : {}), ...extra, ...(candidate.error ? { error: candidate.error } : {}) });
  const snapshot = {
    slug,
    topic,
    mode: "investigation",
    fetchedAt: now.toISOString(),
    provenance: { collector: "newsroom-lib.fetchCandidates", config: configured ? path.basename(researchConfigPath(slug, configRoot)) : "built-in-jeju-legacy", queries, adapters: adapterIds, mediaAdapters, eventFingerprint },
    sources: sourceResults,
    relatedCoverage: [
      ...configuredSameEvent.map((candidate) => serializeArticle(candidate, { kind: "same-event", mediaType: "article", relationshipReason: candidate.relationshipReason })),
      ...configuredUntypedSameEvent.map((candidate) => serializeArticle(candidate, { kind: "same-event", mediaType: "article" })),
      ...sameTopicCoverage.map((candidate) => serializeArticle(candidate, { kind: "same-topic", mediaType: "article" })),
      ...relevantMedia,
    ],
    priorContext: configuredPriorContext.map((candidate) => serializeArticle(candidate, { kind: "prior-context", mediaType: "article", relationshipReason: candidate.relationshipReason })),
    followUps: actualFollowUps.map((candidate) => serializeArticle(candidate, { kind: "follow-up", mediaType: "article" })),
    laws: lawResults,
    actors: configured?.actors || [],
    contradictions: configured?.contradictions || [
      { field: "firstIntrusionDate", values: ["4월 27일", "4월 28일"], status: "unresolved" },
      { field: "secondIntrusionDate", values: ["6월 4일", "6월 5일"], status: "unresolved" },
      { field: "intrusionReason", values: ["간식을 찾으려 했다", "화장실이 급했다"], status: "unresolved" },
    ],
    unknowns: configured?.unknowns || [],
    errors: [
      ...(followUpResult.errors || []),
      ...(mediaResult.errors || []),
      ...sourceResults.filter((item) => item.status !== "verified").map((item) => ({ url: item.url, message: item.error || item.status })),
      ...rejectedConfiguredSecondary.map((item) => ({ url: item.url, message: item.sameEvent?.rejectionReason || "configured-secondary-source-rejected" })),
      ...rejectedFetchedCandidates.map((item) => ({ url: item.url, message: item.sameEvent?.rejectionReason || "post-fetch-same-event-rejected" })),
      ...lawResults.filter((item) => item.status !== "verified").map((item) => ({ url: item.url, message: item.error || item.status })),
    ],
    counts: { sources: sourceResults.filter((item) => item.contentVerification?.status === "verified").length, relatedCoverage: configuredSameEvent.length + configuredUntypedSameEvent.length + sameTopicCoverage.length + relevantMedia.length, priorContext: configuredPriorContext.length, originalMedia: relevantMedia.length, followUps: actualFollowUps.length, laws: lawResults.filter((item) => item.contentVerification?.status === "verified").length, errors: 0 },
  };
  snapshot.counts.errors = snapshot.errors.length;
  snapshot.eventDossier = buildEventDossier({ slug, candidate: { title: topic }, researchSnapshot: snapshot, generatedAt: now.toISOString() });
  await fs.mkdir(snapshotRoot, { recursive: true });
  await fs.writeFile(snapshotPath(slug, snapshotRoot), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export async function loadResearchSnapshot(slug, snapshotRoot = PROJECT_ROOT) {
  if (!SAFE_SLUG.test(String(slug || ""))) throw new Error("Invalid newsroom project slug");
  try {
    const snapshot = JSON.parse(await fs.readFile(snapshotPath(slug, snapshotRoot), "utf8"));
    if (!snapshot || typeof snapshot !== "object" || snapshot.slug !== slug) throw new Error("snapshot slug does not match requested project");
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Invalid research snapshot for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const slug = process.argv.includes("--slug") ? process.argv[process.argv.indexOf("--slug") + 1] : "";
  if (!slug) throw new Error("--slug is required");
  const snapshot = await refreshResearchSnapshot({ slug });
  console.log(JSON.stringify({ slug: snapshot.slug, fetchedAt: snapshot.fetchedAt, counts: snapshot.counts, errors: snapshot.errors.slice(0, 5) }, null, 2));
}
