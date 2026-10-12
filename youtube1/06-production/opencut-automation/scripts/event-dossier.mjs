import { createHash } from "node:crypto";

export const EVENT_DOSSIER_SCHEMA_VERSION = 3;

function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

export function hashEventDossier(value) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
}

export function canonicalSourceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|ocid|output|ved)$/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return "";
  }
}

function text(value) {
  if (typeof value !== "string") return "";
  const named = { nbsp: " ", amp: "&", quot: '"', apos: "'", hellip: "…", lt: "<", gt: ">" };
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&([a-z]+);/giu, (match, name) => named[String(name).toLowerCase()] ?? " ")
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (match, code) => {
      const point = String(code).toLowerCase().startsWith("x") ? Number.parseInt(String(code).slice(1), 16) : Number.parseInt(String(code), 10);
      try { return Number.isFinite(point) ? String.fromCodePoint(point) : " "; } catch { return " "; }
    })
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/(?:-->|<!--)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function verified(item) {
  return record(item) && item.status === "verified" && (!record(item.contentVerification) || item.contentVerification.status === "verified");
}

function fetchedSameEventAttested(item) {
  return item?.sameEvent?.verified === true
    && item.sameEvent.verificationStage === "post-fetch"
    && item.sameEvent.contentEvidenceVerified === true;
}

function contaminatedEventSources(snapshot) {
  return [
    ["same-event", snapshot.relatedCoverage],
    ["follow-up", snapshot.followUps],
  ].flatMap(([bucket, values]) => (Array.isArray(values) ? values : [])
    .filter((item) => verified(item) && !fetchedSameEventAttested(item))
    .map((item) => ({
      bucket,
      url: canonicalSourceUrl(item.url),
      title: text(item.title),
      reason: text(item.sameEvent?.rejectionReason) || "post-fetch-same-event-attestation-required",
    })));
}

function sourceRows(snapshot) {
  const buckets = [
    ["representative", snapshot.sources],
    ["same-event", snapshot.relatedCoverage],
    ["prior-context", snapshot.priorContext],
    ["follow-up", snapshot.followUps],
  ];
  const byUrl = new Map();
  for (const [bucket, values] of buckets) {
    for (const item of Array.isArray(values) ? values : []) {
      if (!verified(item)) continue;
      if (["same-event", "follow-up"].includes(bucket) && !fetchedSameEventAttested(item)) continue;
      const url = canonicalSourceUrl(item.url);
      if (!url || byUrl.has(url)) continue;
      const sourceId = `src-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
      byUrl.set(url, { ...item, url, sourceId, bucket });
    }
  }
  return [...byUrl.values()];
}

function claimCategory(summary, supplied = "") {
  if (supplied) return supplied;
  if (/(?:검찰[^.!?]{0,40}(?:주장|구형|공소|기소)|prosecut)/iu.test(summary) && !/(?:검찰에\s*(?:넘|송치|이첩))/u.test(summary)) return "prosecutionClaims";
  if (/(?:(?:피고인|변호인|당사자|[A-Z]\s*(?:씨|경감|경정|경위))\s*측?[^.!?]{0,60}(?:주장|해명|항변)|(?:내부망|게시글|글)[^.!?]{0,80}(?:적혀|썼|밝혔)|defen[cs]e)/iu.test(summary)) return "defenseClaims";
  if (/(?:재판부|법원|대법원|court)/iu.test(summary)) return "courtFindings";
  if (/(?:고소|기소|입건|혐의|수사|체포|송치|검찰에\s*(?:넘|송치|이첩)|압수수색|전수\s*조사|charge|investigat|arrest)/iu.test(summary)) return "investigationAndCharges";
  if (/(?:1심|2심|항소심|상고|선고|징역|집행유예|trial|appeal|sentenc)/iu.test(summary)) return "trialStagesAndSentenceChanges";
  if (/(?:(?:피해자|피해 교사|유족)[^.!?]{0,80}(?:피해|상처|불안|공포|장애|치료|증상|고통|사망|부상|후유|느꼈|호소)|victim\s+impact)/iu.test(summary)) return "victimImpact";
  return "confirmedFacts";
}

function perspective(summary, supplied = "") {
  if (supplied) return supplied;
  if (/(?:검찰[^.!?]{0,40}(?:주장|구형|공소)|prosecut)/iu.test(summary) && !/(?:검찰에\s*(?:넘|송치|이첩))/u.test(summary)) return "prosecution";
  if (/(?:(?:피고인|변호인|당사자|[A-Z]\s*(?:씨|경감|경정|경위))\s*측?[^.!?]{0,60}(?:주장|해명|항변)|(?:내부망|게시글|글)[^.!?]{0,80}(?:적혀|썼|밝혔)|defen[cs]e)/iu.test(summary)) return "defense";
  if (/(?:재판부|법원|대법원|court)/iu.test(summary)) return "court";
  return "reported";
}

function detailGroup(claim) {
  const supplied = text(claim.detailGroup);
  if (supplied) return supplied;
  const field = text(claim.field);
  const summary = text(claim.summary || claim.claim);
  const category = text(claim.category);
  if (/(?:motive|background|relationship|conflict)/iu.test(field) || /(?:갈등|불만|핀잔|사이가 좋지|관계가 좋지)/u.test(summary)) return "background";
  if (/(?:trigger|immediateCause|argument)/iu.test(field) || /(?:범행 전날|말다툼|홧김)/u.test(summary)) return "trigger";
  if (/(?:preparation|substance|purchase|storage|toxicity)/iu.test(field) || /(?:사둔|보관|농사용 살충제|과량 노출)/u.test(summary)) return "preparation";
  if (/(?:method|opportunity|incidentAction)/iu.test(field) || /(?:자리를 비운 사이|커피에 .*넣|커피에 .*탔)/u.test(summary)) return "execution";
  if (/(?:discovery|consumption|detection)/iu.test(field) || /(?:맛이 이상|음용을 중단|자리로 돌아)/u.test(summary)) return "discovery";
  if (category === "victimImpact" || /(?:위장장애|불안장애|상해|피해|증상)/u.test(summary)) return "harm";
  if (category === "investigationAndCharges" || category === "prosecutionClaims" || category === "defenseClaims" || /(?:고소|송치|압수수색|전수\s*조사)/u.test(summary)) return "investigation";
  if (category === "courtFindings" || category === "trialStagesAndSentenceChanges") return claim.followUp ? "appeal" : "judgment";
  return "core";
}

function dateFrom(summary, supplied = "") {
  if (supplied) return text(supplied);
  return summary.match(/(?:20\d{2}[.\-/년]\s*\d{1,2}(?:[.\-/월]\s*\d{1,2}일?)?|\d{1,2}월\s*\d{1,2}일)/u)?.[0]?.replace(/\s+/gu, "") || "";
}

function splitCompoundClaimSummary(value) {
  const summary = text(value);
  const contrast = summary.match(/^(.+?)(주장|해명)했지만,\s*(.+)$/u);
  if (!contrast) return [summary];
  return [`${contrast[1]}${contrast[2]}했습니다.`, contrast[3]];
}

function isEditorialChromeClaim(value) {
  const summary = text(value);
  if (!summary) return true;
  if (/(?:로그인\s+회원가입|메뉴\s*펼치기|기사퍼가기|기자페이지\s*바로가기|copyright\s*[©ⓒ]|e-?paper\s+모바일보기|가장\s*많이\s*본\s*뉴스|나를\s*위한\s*뉴스\s*click)/iu.test(summary)) return true;
  if (/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}).{0,40}(?:기자페이지|copyright)/iu.test(summary)) return true;
  const navigationTerms = ["사회", "정치", "경제", "문화", "라이프", "스포츠", "오피니언", "사람들", "뉴스레터"].filter((term) => summary.includes(term)).length;
  return navigationTerms >= 5;
}

function structuredClaims(source) {
  const supplied = Array.isArray(source.extractedClaims) ? source.extractedClaims : Array.isArray(source.claims) ? source.claims : [];
  if (supplied.length) return supplied.filter(record).flatMap((claim) => splitCompoundClaimSummary(claim.summary || claim.claim).filter((summary) => !isEditorialChromeClaim(summary)).map((summary) => ({
    summary,
    field: text(claim.field),
    value: text(claim.value),
    date: dateFrom(summary, claim.date),
    category: claimCategory(summary, splitCompoundClaimSummary(claim.summary || claim.claim).length === 1 ? text(claim.category) : ""),
    perspective: perspective(summary, splitCompoundClaimSummary(claim.summary || claim.claim).length === 1 ? text(claim.perspective) : ""),
    status: text(claim.status) || "reported",
    detailGroup: text(claim.detailGroup),
  }))).filter((claim) => claim.summary);
  return text(source.snippet).split(/(?<=[.!?。？！])\s+/u).map((summary) => text(summary)).filter((summary) => summary.length >= 25 && !isEditorialChromeClaim(summary) && !/^\((?:영상취재|영상편집|디자인|사진|취재|편집)\s*:/u.test(summary) && !/^[^.!?]{1,30}기자의 (?:단독 )?보도입니다[.!]?$/u.test(summary)).slice(0, 12).flatMap(splitCompoundClaimSummary).filter((summary) => !isEditorialChromeClaim(summary)).map((summary) => ({
    summary,
    field: "",
    value: "",
    date: dateFrom(summary),
    category: claimCategory(summary),
    perspective: perspective(summary),
    status: "reported",
  }));
}

function claimKey(claim) {
  if (claim.field) return `field:${claim.field}:${claim.value || claim.summary}`;
  return claim.summary.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 100);
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function publicClaim(claim, sources) {
  const sourceIds = [...claim.sourceIds];
  const publisherCount = new Set(sourceIds.map((id) => sources.find((source) => source.sourceId === id)?.publisher).filter(Boolean)).size;
  return {
    id: `claim-${createHash("sha256").update(`${claim.field}|${claim.value}|${claim.summary}`).digest("hex").slice(0, 12)}`,
    summary: claim.summary,
    ...(claim.field ? { field: claim.field } : {}),
    ...(claim.value ? { value: claim.value } : {}),
    ...(claim.date ? { date: claim.date } : {}),
    perspective: claim.perspective,
    status: claim.status,
    detailGroup: detailGroup(claim),
    sourceIds,
    agreement: { sourceCount: sourceIds.length, independentPublisherCount: publisherCount },
    confidence: publisherCount >= 2 ? "corroborated" : "single-source",
  };
}

function claimSources(claim, sources) {
  return claim.sourceIds.map((sourceId) => sources.find((source) => source.sourceId === sourceId)).filter(Boolean);
}

function detailedNarrative({ claims, timeline, conflicts, unknowns, sources }) {
  const verifiedFacts = claims.filter((claim) => claim.status !== "disputed");
  const sameEventClaims = verifiedFacts.filter((claim) => claimSources(claim, sources).some((source) => ["representative", "same-event"].includes(source.bucket)));
  const priorContextClaims = verifiedFacts.filter((claim) => claimSources(claim, sources).some((source) => source.bucket === "prior-context"));
  const followUpClaims = verifiedFacts.filter((claim) => claim.followUp);
  const sourceAgreement = verifiedFacts.map((claim) => ({
    claimId: claim.id,
    summary: claim.summary,
    confidence: claim.confidence,
    sourceIds: claim.sourceIds,
    sourceCount: claim.agreement.sourceCount,
    independentPublisherCount: claim.agreement.independentPublisherCount,
  }));
  const detailDefinitions = [
    ["background", "갈등과 관계의 배경", "왜 갈등이 시작됐는지 확인된 범위"],
    ["trigger", "범행 직전의 직접 계기", "직전 상황과 감정적 촉발 요인"],
    ["preparation", "도구와 준비 정황", "사용 물질의 출처·위험성과 사전 준비 여부"],
    ["execution", "실행 방식과 당시 상황", "언제 어디서 어떤 틈을 이용했는지"],
    ["discovery", "피해자가 알아챈 과정", "음용과 이상 징후, 즉시 대응"],
    ["harm", "피해와 후유증", "신체·정신적 피해와 공개되지 않은 범위"],
    ["investigation", "수사와 양측 주장", "적용 혐의와 검찰·피고인 측 주장"],
    ["judgment", "1심 판단과 양형 이유", "인정된 죄명과 판단 근거"],
    ["appeal", "항소심 변화와 이유", "형이 달라진 결과와 확인된 감형 요소"],
  ];
  const detailSections = detailDefinitions.map(([id, title, description]) => ({ id, title, description, claims: verifiedFacts.filter((claim) => claim.detailGroup === id) })).filter((section) => section.claims.length);
  return {
    overview: sameEventClaims.slice(0, 8),
    chronology: timeline,
    sameEventFindings: sameEventClaims,
    priorContext: priorContextClaims,
    followUpDevelopments: followUpClaims,
    detailSections,
    sourceAgreement,
    conflicts,
    unresolvedQuestions: unknowns,
    limitations: [
      ...(sources.filter((source) => source.bucket === "same-event").length ? [] : ["독립적으로 검증된 동일 사건 추가 보도를 찾지 못했습니다."]),
      ...(sources.filter((source) => source.bucket === "prior-context").length ? [] : ["이 사건의 직접적인 사전 맥락으로 확인된 보도를 찾지 못했습니다."]),
      ...(sources.filter((source) => source.bucket === "follow-up").length ? [] : ["현재까지 확인된 후속 보도가 없습니다."]),
    ],
  };
}

export function buildEventDossier({ slug, candidate = {}, researchSnapshot, generatedAt = new Date().toISOString() } = {}) {
  if (!record(researchSnapshot) || researchSnapshot.slug !== slug) throw new Error("Event dossier requires the matching research snapshot");
  const sourceContamination = contaminatedEventSources(researchSnapshot);
  const sources = sourceRows(researchSnapshot);
  const groups = new Map();
  for (const source of sources) {
    for (const claim of structuredClaims(source)) {
      const key = claimKey(claim);
      const current = groups.get(key);
      if (current) {
        current.sourceIds.add(source.sourceId);
        if (source.bucket === "follow-up") current.followUp = true;
      } else {
        groups.set(key, { ...claim, sourceIds: new Set([source.sourceId]), followUp: source.bucket === "follow-up" });
      }
    }
  }
  const claims = [...groups.values()].map((claim) => ({ ...publicClaim(claim, sources), followUp: claim.followUp }));
  const categories = ["confirmedFacts", "investigationAndCharges", "trialStagesAndSentenceChanges", "prosecutionClaims", "defenseClaims", "courtFindings", "victimImpact"];
  const categorized = Object.fromEntries(categories.map((category) => [category, claims.filter((claim) => groups.get(claimKey(claim))?.category === category)]));
  const timeline = claims.filter((claim) => claim.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const conflicts = (Array.isArray(researchSnapshot.contradictions) ? researchSnapshot.contradictions : []).filter(record).map((item, index) => ({
    id: `conflict-${index + 1}`,
    field: text(item.field) || `disputed-${index + 1}`,
    values: uniqueText(item.values || []),
    status: "disputed",
    sourceIds: uniqueText(item.sourceIds || []),
    note: text(item.note || item.description),
  })).filter((item) => item.values.length > 1 || item.note);
  const fieldClaims = new Map();
  for (const claim of claims.filter((item) => item.field && item.value)) {
    const values = fieldClaims.get(claim.field) || new Map();
    const ids = values.get(claim.value) || [];
    values.set(claim.value, [...new Set([...ids, ...claim.sourceIds])]);
    fieldClaims.set(claim.field, values);
  }
  for (const [field, values] of fieldClaims) if (values.size > 1 && !conflicts.some((item) => item.field === field)) conflicts.push({ id: `conflict-${conflicts.length + 1}`, field, values: [...values.keys()], status: "disputed", sourceIds: [...new Set([...values.values()].flat())], note: "Verified same-event sources report different values." });
  const representativeSourceCount = sources.filter((source) => source.bucket === "representative").length;
  const independentPublisherCount = new Set(sources.map((source) => text(source.publisher || source.source)).filter(Boolean)).size;
  const sourceIndex = sources.map((source) => ({ sourceId: source.sourceId, url: source.url, title: text(source.title), publisher: text(source.publisher || source.source) || "Unknown publisher", date: text(source.date || source.publishedAt), bucket: source.bucket, status: "verified", relationshipReason: text(source.relationshipReason || source.evidence) }));
  const unknowns = uniqueText(researchSnapshot.unknowns || []);
  const narrative = detailedNarrative({ claims, timeline, conflicts, unknowns, sources });
  const storyClaims = claims.filter((claim) => claim.status !== "disputed");
  const progressionClaims = storyClaims.filter((claim) => groups.get(claimKey(claim))?.category !== "confirmedFacts" || ["discovery", "harm", "investigation", "judgment", "appeal"].includes(claim.detailGroup));
  const narrativePhases = new Set(storyClaims.map((claim) => claim.detailGroup).filter(Boolean));
  const storyReady = sourceContamination.length === 0
    && representativeSourceCount > 0
    && storyClaims.length >= 4
    && (progressionClaims.length > 0 || timeline.length >= 2 || narrativePhases.size >= 2);
  const readinessBlockers = [
    ...(sourceContamination.length === 0 ? [] : ["unverified-event-source-contamination"]),
    ...(representativeSourceCount > 0 ? [] : ["verified-representative-source-required"]),
    ...(storyClaims.length >= 4 ? [] : ["at-least-four-event-claims-required"]),
    ...(progressionClaims.length > 0 || timeline.length >= 2 || narrativePhases.size >= 2 ? [] : ["event-progression-required"]),
  ];
  const dossier = {
    schemaVersion: EVENT_DOSSIER_SCHEMA_VERSION,
    slug,
    generatedAt,
    researchSnapshotSha256: hashEventDossier({ ...researchSnapshot, eventDossier: undefined }),
    eventIdentity: { title: text(candidate.title || researchSnapshot.topic), fingerprint: researchSnapshot.provenance?.eventFingerprint || researchSnapshot.eventFingerprint || null },
    actors: Array.isArray(researchSnapshot.actors) ? researchSnapshot.actors.filter(record).map((actor, index) => ({ id: text(actor.id) || `actor-${index + 1}`, role: text(actor.role) || "reported actor", label: text(actor.anonymizedLabel || actor.label) || `익명 인물 ${index + 1}`, anonymized: true })) : [],
    ...categorized,
    timeline,
    conflicts,
    unknowns,
    laterChanges: claims.filter((claim) => claim.followUp),
    narrative,
    sourceCoverage: {
      verifiedSourceCount: sources.length,
      representativeSourceCount,
      sameEventCoverageCount: sources.filter((source) => source.bucket === "same-event").length,
      priorContextCount: sources.filter((source) => source.bucket === "prior-context").length,
      followUpCount: sources.filter((source) => source.bucket === "follow-up").length,
      independentPublisherCount,
      corroboration: independentPublisherCount >= 2 ? "multi-source" : sources.length ? "single-source" : "none",
      rejectedSameEventSourceCount: sourceContamination.length,
    },
    readiness: {
      readyForLegal: storyReady,
      readyForDraft: storyReady,
      preferredCorroborationMet: independentPublisherCount >= 2,
      detailedNarrativeComplete: storyReady,
      storyClaimCount: storyClaims.length,
      narrativePhaseCount: narrativePhases.size,
      blockers: readinessBlockers,
      warnings: representativeSourceCount > 0 && independentPublisherCount < 2 ? ["single-source-only"] : [],
    },
    sourceIndex,
    sourceExclusions: sourceContamination,
  };
  dossier.currentHash = hashEventDossier(dossier);
  return dossier;
}

export function eventDossierHashIsCurrent(dossier) {
  if (!record(dossier) || typeof dossier.currentHash !== "string") return false;
  const { currentHash, ...payload } = dossier;
  return currentHash === hashEventDossier(payload);
}
