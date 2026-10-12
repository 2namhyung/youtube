import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildCaseDispositionReview } from "./legal-review-policy.mjs";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params -- validated persisted JSON contracts and small pure similarity helpers */

export type JsonRecord = Record<string, unknown>;
type Decision = "allow" | "conditional" | "block";
type EditorialVerdict = "usable" | "conditional" | "do-not-use";

function channelDescriptionPath() {
	let cursor = path.resolve(process.cwd());
	for (let depth = 0; depth < 10; depth += 1) {
		const candidate = path.join(cursor, "09-channel-brand", "channel-description.md");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	throw new Error("Channel editorial contract source is unavailable");
}
const CHANNEL_DESCRIPTION_PATH = channelDescriptionPath();
const CHANNEL_DESCRIPTION_BYTES = fs.readFileSync(CHANNEL_DESCRIPTION_PATH);
export const CHANNEL_EDITORIAL_CONTRACT = Object.freeze({
	schemaVersion: 1,
	id: "nae-museupda-editorial-v1",
	sourcePath: "09-channel-brand/channel-description.md",
	sourceSha256: createHash("sha256").update(CHANNEL_DESCRIPTION_BYTES).digest("hex"),
	channelName: "내 무습다",
	mission: "평범한 일상에서 벌어진 도저히 이해하기 어려운 실제 사건을 공개 보도와 확인 가능한 자료로 짧고 명확하게 전한다.",
	promises: [
		"누구나 마주하는 물건·장소·역할에서 시작한다.",
		"사건 경과와 가장 비상식적인 행동을 먼저 이해시킨다.",
		"확인된 피해의 잔여 영향 또는 증거·수사·공적 신뢰의 문제를 구분해 다룬다.",
		"제도적 빈틈과 필요한 변화를 사건에서 직접 도출한다.",
	],
	signatureTurn: "이게 말이 되나요?",
	supportedEmotions: ["황당", "답답", "무서움"],
	factualBoundary: "수사·재판 중인 사건은 확정 사실, 혐의, 당사자 주장과 판단을 구분하고 확인되지 않은 감정·동기·피해를 만들지 않는다.",
});

export const AUDIENCE_IMMERSIVE_STYLE_PROFILE = Object.freeze({
	profileId: "nae-museupda-editorial-v1",
	version: 6,
	label: "내 무습다 · 일상 속 비상식 아카이브",
	template: "ordinary-context-central-absurdity-case-flow-lasting-stake-system-gap-question",
	tone: "conversational-direct-literary-empathetic",
	pacing: "short-spoken-lines",
	source: "channel-editorial-contract",
});

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonicalize(value[key])]));
}

export function hashJson(value: unknown) {
	return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function text(value: unknown) {
	return typeof value === "string" ? value.replace(/https?:\/\/\S+/giu, "").replace(/\s+/gu, " ").trim() : "";
}

function rows(value: unknown) {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown) {
	return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function unique(values: unknown[]) {
	return [...new Set(values.map(text).filter(Boolean))];
}

function snapshotWithoutDossier(snapshot: JsonRecord) {
	const { eventDossier: _eventDossier, ...payload } = snapshot;
	return payload;
}

function dossierPayload(dossier: JsonRecord) {
	const { currentHash: _currentHash, ...payload } = dossier;
	return payload;
}

export function isCurrentEventDossier(researchSnapshot: JsonRecord) {
	if (!isRecord(researchSnapshot.eventDossier)) return false;
	const dossier = researchSnapshot.eventDossier;
	const claimCount = ["confirmedFacts", "investigationAndCharges", "trialStagesAndSentenceChanges", "prosecutionClaims", "defenseClaims", "courtFindings", "victimImpact"].flatMap((key) => rows(dossier[key])).length;
	const readyForDraft = isRecord(dossier.readiness) && (dossier.readiness.readyForDraft === true || (dossier.readiness.readyForDraft === undefined && dossier.readiness.detailedNarrativeComplete === true && claimCount >= 4));
	return (dossier.schemaVersion === 2 || dossier.schemaVersion === 3)
		&& typeof dossier.currentHash === "string"
		&& dossier.currentHash === hashJson(dossierPayload(dossier))
		&& dossier.researchSnapshotSha256 === hashJson(snapshotWithoutDossier(researchSnapshot))
		&& isRecord(dossier.sourceCoverage)
		&& Number(dossier.sourceCoverage.representativeSourceCount || 0) > 0
		&& isRecord(dossier.readiness)
		&& dossier.readiness.readyForLegal === true
		&& readyForDraft
		&& dossier.readiness.detailedNarrativeComplete === true;
}

export function assertSnapshotMatchesCandidate({ snapshot, candidate, slug }: { snapshot: JsonRecord; candidate: JsonRecord; slug: string }) {
	if (snapshot.slug && snapshot.slug !== slug) throw new Error("연구 스냅샷과 프로젝트가 일치하지 않습니다.");
	const candidateUrl = typeof candidate.url === "string" ? candidate.url : "";
	const sources = [...rows(snapshot.sources), ...rows(snapshot.relatedCoverage), ...rows(snapshot.priorContext), ...rows(snapshot.followUps)];
	if (candidateUrl && !sources.some((source) => source.url === candidateUrl || source.aggregatorUrl === candidateUrl)) throw new Error("대표 기사와 연구 스냅샷이 일치하지 않습니다.");
}

export function isContentVerifiedSource({ source }: { source: JsonRecord; candidate?: JsonRecord }) {
	return source.status === "verified" && (!isRecord(source.contentVerification) || source.contentVerification.status === "verified") && text(source.snippet).length >= 80;
}

const CHECKLIST_LABELS = new Set(["기사 원문 사실 확인", "독립 출처 교차 검증", "02 Context/Legal 인계"]);

function dossierClaims(dossier: JsonRecord) {
	return ["confirmedFacts", "investigationAndCharges", "trialStagesAndSentenceChanges", "prosecutionClaims", "defenseClaims", "courtFindings", "victimImpact", "timeline", "laterChanges"]
		.flatMap((key) => rows(dossier[key]));
}

function claimSummary(claim: JsonRecord) {
	return text(claim.summary || claim.claim);
}

function claimTokens(value: unknown) {
	const normalized = text(value)
		.replace(/두 번째 재판/gu, "항소심")
		.replace(/첫 재판/gu, "1심")
		.replace(/감옥에 바로 가지 않는 집행유예/gu, "집행유예")
		.replace(/법원/gu, "재판부")
		.replace(/바꿨습니다/gu, "변경 선고")
		.toLocaleLowerCase("ko-KR");
	const words = (normalized.match(/[\p{L}\p{N}]{2,}/gu) || []).filter((token) => token.length >= 2);
	const tokens = new Set(words);
	for (const word of words) if (/^[가-힣]{3,}$/u.test(word)) for (let index = 0; index < word.length - 1; index += 1) tokens.add(word.slice(index, index + 2));
	return tokens;
}

function similarity(left: unknown, right: unknown) {
	const a = claimTokens(left);
	const b = claimTokens(right);
	if (!a.size || !b.size) return 0;
	const common = [...a].filter((token) => b.has(token)).length;
	return common / Math.min(a.size, b.size);
}

export type ScriptPolicy = {
	version: 2;
	allowedFacts: string[];
	allowedClaims: Array<{ claimId: string; summary: string; attributionRequired: boolean; perspective: string; confidence: string }>;
	prohibitedClaims: string[];
	prohibitedPhrases: string[];
	requiredQualifications: Array<{ id: string; claimIds: string[]; semanticTrigger: string; qualifier: string }>;
	safeReplacements: Array<{ unsafe: string; safe: string }>;
	safePhrasing: string[];
	uncertaintyInstructions: string[];
	omissionInstructions: string[];
	identityRestrictions: string[];
	footageRestrictions: string[];
	sourceAttribution: { mode: "script-scope" | "not-required"; neutralPrefix: string; claimIds: string[] };
};

export const NEUTRAL_SINGLE_SOURCE_ATTRIBUTION = "공개된 보도에서 확인된 범위로는";

export type LegalContextReport = JsonRecord & {
	schemaVersion: 5;
	slug: string;
	candidateSha256: string;
	researchSnapshotSha256: string;
	eventDossierSha256: string;
	videoDecision: { decision: Decision; reasons: string[] };
	scriptPolicy: ScriptPolicy;
	reviewCompletion: { caseDisposition: boolean; videoUse: boolean; scriptWriting: boolean; allComplete: boolean };
	verdict: EditorialVerdict;
	reasons: string[];
};

function comparablePrecedents(snapshot: JsonRecord) {
	return rows(snapshot.laws)
		.filter((law) => law.status === "verified" && typeof law.url === "string" && (law.kind === "precedent" || law.category === "precedent" || /판례|판결/u.test(text(law.title))))
		.map((law) => ({
			title: text(law.title),
			url: law.url,
			court: text(law.court),
			caseNumber: text(law.caseNumber),
			legalPrinciple: text(law.legalPrinciple || law.snippet),
			comparison: text(law.comparison || law.relationshipReason),
			status: "authoritative-reference",
		}));
}

function legalReferences(dossier: JsonRecord, snapshot: JsonRecord) {
	const claims = dossierClaims(dossier).map(claimSummary).join(" ");
	const references = rows(snapshot.laws).filter((law) => law.status === "verified" && typeof law.url === "string").map((law) => ({ title: text(law.title), url: law.url, status: "authoritative-reference" }));
	if (/(?:기소|혐의|재판|법원|검찰|형사)/u.test(claims)) references.push({ title: "국가법령정보센터 형법", url: "https://www.law.go.kr/법령/형법", status: "authoritative-reference" });
	if (/(?:피해자|합의|처벌불원)/u.test(claims)) references.push({ title: "범죄피해자 보호법", url: "https://www.law.go.kr/법령/범죄피해자보호법", status: "authoritative-reference" });
	return references.filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index);
}

export function buildLegalContextReport({ slug, candidate, researchSnapshot, generatedAt = new Date().toISOString() }: { slug: string; candidate: JsonRecord; researchSnapshot: JsonRecord; generatedAt?: string }): LegalContextReport {
	if (!isCurrentEventDossier(researchSnapshot)) throw new Error("최신 사건 히스토리와 검증된 대표 출처가 필요합니다. Stage 01을 다시 실행하세요.");
	const dossier = researchSnapshot.eventDossier as JsonRecord;
	const claims = dossierClaims(dossier).filter((claim, index, all) => claimSummary(claim) && all.findIndex((item) => item.id === claim.id) === index);
	const coverage = dossier.sourceCoverage as JsonRecord;
	const conflicts = rows(dossier.conflicts);
	const unknowns = strings(dossier.unknowns).filter((item) => !CHECKLIST_LABELS.has(item));
	const independentSources = Number(coverage.independentPublisherCount || 0);
	const hasConflicts = conflicts.length > 0;
	const decision: Decision = independentSources < 2 || hasConflicts || unknowns.length ? "conditional" : "allow";
	const reasons = unique([
		...(independentSources < 2 ? ["검증된 독립 보도가 한 곳뿐이므로 사실 범위와 불확실성을 보수적으로 유지합니다."] : []),
		...(hasConflicts ? ["동일 사건 보도 사이에 해결되지 않은 불일치가 있습니다."] : []),
		...(unknowns.length ? ["확인되지 않은 세부사항은 단정하거나 보완해 쓰면 안 됩니다."] : []),
	]);
	const allowedClaims = claims.map((claim) => ({
		claimId: text(claim.id),
		summary: claimSummary(claim),
		attributionRequired: ["prosecution", "defense"].includes(text(claim.perspective)),
		perspective: text(claim.perspective) || "reported",
		confidence: text(claim.confidence) || "single-source",
	}));
	const prohibitedClaims = unique([
		...conflicts.map((conflict) => `${text(conflict.field) || "불일치 항목"}의 값을 하나로 확정하는 주장`),
		...unknowns.map((unknown) => `${unknown}을 확인된 사실로 단정하는 주장`),
	]).filter((item) => !CHECKLIST_LABELS.has(item));
	const hasTrialStage = rows(dossier.trialStagesAndSentenceChanges).length > 0 || rows(dossier.courtFindings).length > 0;
	const defenseQualifier = hasTrialStage ? "피고인 측은 …라고 주장했습니다" : "당사자는 …라고 주장했습니다";
	const requiredQualifications = allowedClaims.filter((claim) => claim.attributionRequired).map((claim) => ({
		id: `qualify-${claim.claimId}`,
		claimIds: [claim.claimId],
		semanticTrigger: claim.summary,
		qualifier: claim.perspective === "prosecution" ? "검찰은 …라고 주장했습니다" : defenseQualifier,
	}));
	const policy: ScriptPolicy = {
		version: 2,
		allowedFacts: allowedClaims.map((claim) => claim.summary),
		allowedClaims,
		prohibitedClaims,
		prohibitedPhrases: ["보도에 따르면"],
		requiredQualifications,
		safeReplacements: [],
		safePhrasing: ["검찰은 …라고 주장했습니다", defenseQualifier, "재판부는 …라고 판단했습니다", "정확한 내용은 확인되지 않았습니다"],
		uncertaintyInstructions: unknowns,
		omissionInstructions: prohibitedClaims.map((claim) => `별도 확인 전 생략: ${claim}`),
		identityRestrictions: ["사건 관계자의 실명·얼굴·직장 세부 위치를 추가로 식별하지 않기", "피해자와 제3자는 익명 표기를 유지하기"],
		footageRestrictions: ["기사·방송 원본 화면은 별도 이용 허락 없이는 사용하지 않기", "재연 화면은 실제 현장 화면이 아니라는 점을 표시하기"],
		// Shorts narration does not carry a mandatory publisher/source prefix.
		// Evidence confidence, disputed facts, party claims, identity and footage
		// restrictions remain enforced independently.
		sourceAttribution: { mode: "not-required", neutralPrefix: "", claimIds: [] },
	};
	const verdict: EditorialVerdict = decision === "allow" ? "usable" : decision === "conditional" ? "conditional" : "do-not-use";
	const legalSources = legalReferences(dossier, researchSnapshot);
	const similarCases = comparablePrecedents(researchSnapshot);
	const caseDispositionReview = buildCaseDispositionReview({
		similarCases,
		applicableIssues: unique([...rows(dossier.investigationAndCharges).map(claimSummary), ...rows(dossier.courtFindings).map(claimSummary)]),
	});
	const videoUseReview = {
		status: "complete",
		decision,
		question: "이 사건을 영상 소재로 활용할 수 있는가",
		allowedUse: ["검증된 기사와 판결·법령을 요약한 자체 서술", "실제 화면과 혼동되지 않도록 고지한 비식별 AI 재구성", "출처와 불확실성을 함께 표시한 사건 연표"],
		conditions: unique([...policy.identityRestrictions, ...policy.footageRestrictions, ...policy.omissionInstructions]),
		prohibitedUse: ["권리 확인 없는 기사·방송·CCTV 원본 재사용", "관계자의 얼굴·이름·직장·위치를 추가로 특정", "수사·재판 결과 또는 정신건강과 행위의 인과를 확인 사실처럼 단정"],
		reasons,
	};
	const hasAttributedPartyClaims = rows(dossier.prosecutionClaims).length > 0
		|| rows(dossier.defenseClaims).length > 0
		|| rows(dossier.courtFindings).length > 0;
	const hasCourtProgression = rows(dossier.trialStagesAndSentenceChanges).length > 0
		|| rows(dossier.courtFindings).length > 0
		|| rows(dossier.laterChanges).length > 0;
	const scriptRequirements = unique([
		"사건 사실은 확인된 증거 범위 안에서만 서술하며 미확인·불일치 내용을 확정하지 않습니다.",
		...(hasAttributedPartyClaims ? ["검찰·당사자·재판부의 주장은 해당 발화 주체를 분명히 붙입니다."] : []),
		...(hasConflicts || unknowns.length ? ["출처 간 불일치나 중요한 미확인 사실은 필요한 경우 한 문장으로만 한정합니다."] : []),
		...(hasCourtProgression ? ["수사·재판·후속 변화는 실제로 확인된 단계만 시간순으로 분리합니다."] : ["발견·신고·입건·강제수사 등 실제로 확인된 사건 단계만 시간순으로 설명합니다."]),
	]);
	const scriptWritingReview = {
		status: "complete",
		decision: "approved-with-conditions",
		question: "대본 작성 시 무엇을 지키고 피해야 하는가",
		required: scriptRequirements,
		avoid: unique([...policy.prohibitedClaims, ...policy.prohibitedPhrases, ...policy.omissionInstructions]),
		safePhrasing: policy.safePhrasing,
	};
	const reviewCompletion = {
		caseDisposition: caseDispositionReview.status === "complete",
		videoUse: videoUseReview.status === "complete",
		scriptWriting: scriptWritingReview.status === "complete",
		allComplete: caseDispositionReview.status === "complete" && videoUseReview.status === "complete" && scriptWritingReview.status === "complete",
	};
	return {
		schemaVersion: 5,
		slug,
		generatedAt,
		candidateSha256: hashJson(candidate),
		researchSnapshotSha256: hashJson(researchSnapshot),
		eventDossierSha256: hashJson(dossier),
		confirmedFacts: rows(dossier.confirmedFacts),
		reportedFacts: claims,
		unverifiedFacts: unknowns,
		possibleLegalIssues: [],
		missingFacts: unknowns,
		safePhrasing: policy.safePhrasing,
		sources: rows(dossier.sourceIndex),
		legalSources,
		evidence: { verifiedSourceCount: coverage.verifiedSourceCount, representativeSourceCount: coverage.representativeSourceCount, independentPublisherCount: independentSources, sameEventSnapshot: true, eventDossierCurrent: true },
		verdict,
		verdictLabel: verdict === "usable" ? "사용 가능" : "조건부 사용",
		reasons,
		reasonCodes: unique([...(independentSources < 2 ? ["single-source"] : []), ...(hasConflicts ? ["source-conflict"] : []), ...(unknowns.length ? ["unknown-details"] : [])]),
		requiredEdits: policy.omissionInstructions,
		allowedMaterials: ["사건 히스토리의 승인된 사실", "직접 제작한 비식별 재연"],
		restrictedMaterials: [...policy.identityRestrictions, ...policy.footageRestrictions],
		requiredConditions: [],
		assessment: { sourceCorroboration: independentSources >= 2 ? "multi-source" : "single-source", conflicts: conflicts.length, unknowns: unknowns.length },
		contradictions: conflicts,
		scriptPolicy: policy,
		factBrief: { confirmedFacts: policy.allowedFacts, timeline: rows(dossier.timeline).map(claimSummary), disputedFacts: conflicts.map((item) => `${text(item.field)}: ${strings(item.values).join(" / ")}`), unknownFacts: unknowns, followUpChanges: rows(dossier.laterChanges).map(claimSummary) },
		videoDecision: { decision, reasons },
		caseDispositionReview,
		videoUseReview,
		scriptWritingReview,
		reviewCompletion,
	};
}

function sanitizedCaseHistory(dossier: JsonRecord) {
	const cleanClaims = (value: unknown) => rows(value).map((claim) => ({ id: text(claim.id), field: text(claim.field), detailGroup: text(claim.detailGroup), summary: claimSummary(claim), date: text(claim.date), perspective: text(claim.perspective), confidence: text(claim.confidence), sourceCount: isRecord(claim.agreement) ? Number(claim.agreement.sourceCount || 0) : 0 }));
	return {
		eventIdentity: { title: text(isRecord(dossier.eventIdentity) ? dossier.eventIdentity.title : "") },
		actors: rows(dossier.actors).map((actor) => ({ role: text(actor.role), label: text(actor.label), anonymized: true })),
		confirmedFacts: cleanClaims(dossier.confirmedFacts),
		timeline: cleanClaims(dossier.timeline),
		investigationAndCharges: cleanClaims(dossier.investigationAndCharges),
		trialStagesAndSentenceChanges: cleanClaims(dossier.trialStagesAndSentenceChanges),
		prosecutionClaims: cleanClaims(dossier.prosecutionClaims),
		defenseClaims: cleanClaims(dossier.defenseClaims),
		courtFindings: cleanClaims(dossier.courtFindings),
		victimImpact: cleanClaims(dossier.victimImpact),
		conflicts: rows(dossier.conflicts).map((item) => ({ field: text(item.field), values: strings(item.values), status: "disputed" })),
		unknowns: strings(dossier.unknowns),
		laterChanges: cleanClaims(dossier.laterChanges),
		sourceCoverage: dossier.sourceCoverage,
	};
}

function cleanEditorialDirection(value: unknown) {
	if (value === undefined || value === null || String(value).trim() === "") return "";
	const direction = String(value).normalize("NFC").replace(/\r\n?/gu, "\n").trim();
	if (direction.length > 2_000) throw new Error("편집 방향은 2000자 이하여야 합니다.");
	if (/https?:\/\//iu.test(direction)) throw new Error("편집 방향에는 URL을 포함할 수 없습니다.");
	return direction;
}

const STAGE03_EDITORIAL_INTENT_SCHEMA = "newsroom-stage03-editorial-intent-v1";

function normalizeEditorialIntent({ editorialDirection, editorialIntent, caseHistory }: { editorialDirection?: unknown; editorialIntent?: unknown; caseHistory: JsonRecord }) {
	const explicit = isRecord(editorialIntent) ? editorialIntent : null;
	if (editorialIntent !== undefined && editorialIntent !== null && !explicit) throw new Error("편집 의도는 객체여야 합니다.");
	if (explicit?.schema !== undefined && explicit.schema !== STAGE03_EDITORIAL_INTENT_SCHEMA) throw new Error("편집 의도 스키마가 올바르지 않습니다.");
	const legacyDirection = cleanEditorialDirection(editorialDirection);
	const structuredDirection = cleanEditorialDirection(explicit?.direction);
	if (legacyDirection && structuredDirection && legacyDirection !== structuredDirection) throw new Error("기존 편집 방향과 구조화 편집 의도가 충돌합니다.");
	const direction = structuredDirection || legacyDirection;
	const conflicts = [
		...(/(?:(?:final\s*movement|마지막\s*문장|결말)[^.!?。！？\n]{0,180}(?:반드시|의무)|(?:반드시|의무)[^.!?。！？\n]{0,180}(?:감정|공감|self-projection|coda|마지막\s*문장))/iu.test(direction) ? ["mandatory-emotional-ending"] : []),
		...(/70\s*[~～-]\s*80\s*초[^.!?。！？\n]{0,100}(?:목표로만|청취\s*목표로만|자문(?:용)?으로만)/iu.test(direction) ? ["advisory-only-stage03-duration"] : []),
	];
	if (conflicts.length) throw new Error(`편집 방향이 현재 Stage 03 계약과 충돌합니다: ${conflicts.join(",")}`);
	const openingDisclosure = String(explicit?.openingDisclosure || "model-choice");
	if (!["model-choice", "opening", "defer"].includes(openingDisclosure)) throw new Error("오프닝 공개 선호가 올바르지 않습니다.");
	const knownClaimIds = new Set(Object.values(caseHistory).flatMap((value) => Array.isArray(value) ? value : []).map((item) => isRecord(item) ? text(item.id) : "").filter(Boolean));
	const refs = explicit?.priorityClaimRefs === undefined ? [] : explicit.priorityClaimRefs;
	if (!Array.isArray(refs) || refs.length > 12) throw new Error("오프닝 우선 근거가 올바르지 않습니다.");
	const priorityClaimRefs = [...new Set(refs.map((value) => String(value || "").trim()).filter(Boolean))];
	for (const claimRef of priorityClaimRefs) if (!knownClaimIds.has(claimRef)) throw new Error(`현재 사건에 없는 오프닝 근거입니다: ${claimRef}`);
	if (openingDisclosure === "opening" && !direction && !priorityClaimRefs.length) throw new Error("오프닝 우선 의도에는 편집 방향이나 현재 사건 근거가 필요합니다.");
	const projection = { schema: STAGE03_EDITORIAL_INTENT_SCHEMA, direction, openingDisclosure, priorityClaimRefs };
	const sha256 = hashJson(projection);
	if (typeof explicit?.sha256 === "string" && explicit.sha256 !== sha256) throw new Error("편집 의도 해시가 일치하지 않습니다.");
	return { ...projection, sha256 };
}

export const AUTONOMOUS_NARRATIVE_QUALITY_GUIDANCE = Object.freeze({
	narrativeEngine: "choose-exactly-one-of-suspense-curiosity-reversal-role-conflict-evidence-reversal-escalating-action-or-numeric-contrast",
	openingHook: "open-with-concrete-action-risk-or-contrast-and-leave-one-specific-case-grounded-element-unresolved-without-a-universal-template",
	entertainmentMechanics: "earn-interest-through-specific-stakes-information-order-escalation-contrast-and-evidence-backed-reversal-never-invention-or-exaggeration",
	autonomousStructure: "the-model-controls-wording-rhythm-order-and-payoff-shape-without-fixed-five-second-claim-bundle-or-universal-beats",
	forbiddenOpeningPhrases: Object.freeze(["충격적인 사건입니다", "대체 무슨 일이", "끝까지 보세요", "이 사건에는", "더 무겁게 만든 사실은", "그런데 놀라운 사실은", "잠시 뒤", "상상도 못한"]),
	forbiddenOpeningFrames: Object.freeze(["경찰 조사에 따르면", "업주에 따르면", "고소장에는", "설명으로는", "발단은", "시작은", "사건은"]),
	factualBoundary: "never-invent-dialogue-sound-sensation-expression-motive-interior-state-or-action",
	attributionIntegration: "preserve-legally-required-attribution-and-uncertainty-through-a-clearly-responsible-source-record-or-evidence-object",
	forbiddenReportorialNarrationPhrases: Object.freeze(["제보 영상", "취재진", "취재 결과", "취재 과정", "기자가", "기자는", "전해졌습니다", "알려졌습니다", "나타났습니다"]),
	forbiddenProvenanceNarrationPhrases: Object.freeze(["독립 보도 한 곳", "독립 보도 1곳", "단일 출처", "보도 시점", "확인 범위", "같은 보도", "현재 확인된 법적 단계", "확인되지 않았습니다"]),
	ending: "end-on-the-strongest-case-specific-verified-endpoint-and-reject-portable-morals-questions-or-reflections",
	forbiddenStockCodaFrames: Object.freeze(["되돌아보게 합니다", "씁쓸함을 남깁니다", "서늘함을 남깁니다", "막막함을 남깁니다", "누구라도", "누구나", "우리 안의"]),
	independentCritique: "a-separate-read-only-critic-can-only-pass-revise-or-reject-and-cannot-rewrite-the-generator-authority",
	admissionBoundary: "only-a-critic-pass-with-code-owned-duration-claim-lineage-legal-and-surface-gates-can-become-active",
});

function caseBriefText(value: unknown, maximum = 700) {
	return text(value).replace(/https?:\/\/\S+/giu, "").replace(/<[^>]{0,200}>/gu, " ").replace(/&(?:nbsp|#x27);/giu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function buildStage03CaseBrief(candidate: JsonRecord, researchSnapshot: JsonRecord, legalReport: JsonRecord, dossier: JsonRecord) {
	const legalPolicy = legalReport.scriptPolicy as JsonRecord;
	const claims = new Map<string, JsonRecord>();
	const admit = (raw: unknown) => {
		if (!isRecord(raw)) return;
		const id = caseBriefText(raw.id || raw.claimId, 120);
		const summary = caseBriefText(raw.summary, 900);
		if (!id || !summary) return;
		const previous = claims.get(id) || {};
		const agreement = isRecord(raw.agreement) ? raw.agreement : {};
		claims.set(id, { ...previous, id, summary, date: caseBriefText(raw.date || previous.date, 80), perspective: caseBriefText(raw.perspective || previous.perspective, 80), confidence: caseBriefText(raw.confidence || previous.confidence, 80), sourceIds: unique([...strings(previous.sourceIds), ...strings(raw.sourceIds)]), sourceCount: Math.max(Number(previous.sourceCount || 0), Number(agreement.sourceCount || 0)), independentPublisherCount: Math.max(Number(previous.independentPublisherCount || 0), Number(agreement.independentPublisherCount || 0)), attributionRequired: Boolean(previous.attributionRequired || raw.attributionRequired) });
	};
	for (const key of ["confirmedFacts", "timeline", "investigationAndCharges", "trialStagesAndSentenceChanges", "prosecutionClaims", "defenseClaims", "courtFindings", "victimImpact", "laterChanges"]) rows(dossier[key]).forEach(admit);
	const narrative = isRecord(dossier.narrative) ? dossier.narrative : {};
	for (const key of ["overview", "chronology", "sameEventFindings", "priorContext", "followUpDevelopments"]) rows(narrative[key]).forEach(admit);
	rows(legalPolicy.allowedClaims).forEach(admit);
	const allowedIds = new Set(rows(legalPolicy.allowedClaims).map((claim) => caseBriefText(claim.claimId, 120)).filter(Boolean));
	const eligible = [...claims.values()].filter((claim) => !allowedIds.size || allowedIds.has(String(claim.id)));
	const seen = new Set<string>();
	const coreFacts = eligible.flatMap((claim) => {
		const fingerprint = String(claim.summary).normalize("NFC").replace(/[\s.,'“”‘’()\[\]]/gu, "").toLowerCase();
		if (!fingerprint || seen.has(fingerprint)) return [];
		seen.add(fingerprint);
		return [{ factId: `fact-${String(claim.id).replace(/^claim-/u, "")}`, text: claim.summary, claimRefs: [claim.id], corroboration: { sourceIds: claim.sourceIds, sourceCount: claim.sourceCount, independentPublisherCount: claim.independentPublisherCount, confidence: claim.confidence } }];
	});
	if (!coreFacts.length) throw new Error("Stage 03 사건 브리프에는 법률상 허용된 검증 사실이 필요합니다.");
	const allSources = [...rows(researchSnapshot.sources), ...rows(researchSnapshot.relatedCoverage), ...rows(researchSnapshot.followUps)];
	const contextSource = (publisher: string, title: string) => allSources.find((source) => caseBriefText(source.publisher, 100) === publisher && caseBriefText(source.title, 300) === title);
	const sourceGroups = rows(dossier.sourceIndex).slice(0, 16).flatMap((source) => {
		const sourceId = caseBriefText(source.sourceId, 120);
		const related = eligible.filter((claim) => strings(claim.sourceIds).includes(sourceId));
		if (!sourceId || !related.length) return [];
		const publisher = caseBriefText(source.publisher, 100);
		const title = caseBriefText(source.title, 300);
		const summaries = related.map((claim) => claim.summary).join(" ");
		return [{ sourceId, publisherGroup: publisher, independentGroupId: `publisher-${hashJson(publisher.toLowerCase()).slice(0, 12)}`, publishedAt: caseBriefText(source.date, 80), contextSnippet: caseBriefText(contextSource(publisher, title)?.snippet || title, 420), claimRefs: related.map((claim) => claim.id), roleAliases: { suspect: summaries.match(/([A-Z])\s*씨[^.!?。！？]{0,90}(?:혐의|구속|범행|위협|추격|뒤쫓|들이받|겨누|송곳)/u)?.[1] || "", victim: summaries.match(/(?:피해(?:자|\s*차량)?|여성\s*운전자|제보자)\s*([A-Z])(?:\([^)]*\))?\s*씨/u)?.[1] || summaries.match(/([A-Z])\s*씨[^.!?。！？]{0,70}(?:딸을\s*태우|상처|부상|도망|벗어)/u)?.[1] || "" } }];
	});
	const refs = (pattern: RegExp) => eligible.filter((claim) => pattern.test(String(claim.summary))).map((claim) => claim.id).slice(0, 8);
	const entities: JsonRecord[] = [];
	const entity = (id: string, role: string, description: string, claimRefs: unknown[]) => { if (claimRefs.length) entities.push({ id, role, description, claimRefs }); };
	entity("suspect", "suspect-or-accused", "위협·추격·충돌 또는 법적 혐의의 행위 주체", refs(/피의자|피고인|남성\s*운전자|혐의|구속|범행|위협|추격|들이받|겨누|송곳/u));
	entity("victim", "victim-or-target", "행동의 상대이자 피해 차량 운전자", refs(/피해|여성\s*운전자|제보자|상처|부상|도망|벗어/u));
	entity("suspect-child", "child-linked-to-suspect", "행위 주체의 차량에 동승한 자녀", refs(/(?:자신|본인|그의)[^.!?。！？]{0,35}(?:5살|자녀|딸)|(?:5살|자녀|딸)[^.!?。！？]{0,35}(?:자신|본인|그의)\s*차/u));
	entity("victim-child", "child-linked-to-victim", "피해 차량에 동승한 자녀", refs(/(?:중학생|중학교|10대)[^.!?。！？]{0,30}(?:딸|자녀)|(?:딸|자녀)[^.!?。！？]{0,30}(?:피해|여성\s*운전자)/u));
	const allowedOrder = new Map(rows(legalPolicy.allowedClaims).map((item, index) => [caseBriefText(item.claimId, 120), index]));
	const eventEligible = eligible.map((claim, index) => ({ claim, index, allowedOrder: allowedOrder.get(String(claim.id)) ?? Number.MAX_SAFE_INTEGER })).sort((a,b) => a.allowedOrder-b.allowedOrder || a.index-b.index);
	const isSynopsis = (summary: string) => [/(?:추격|뒤쫓)/u, /(?:총기|흉기|송곳|무기)/u, /(?:위협|겨누)/u, /(?:충돌|추돌|들이받|파손)/u].filter((pattern) => pattern.test(summary)).length >= 3;
	const rankedBeatCandidates = eventEligible.filter(({ claim }) => /(합류|진입|경적|가로막|내(?:린|려)|꺼내|겨누|벗어|도망|추격|뒤쫓|충돌|추돌|들이받|창문|유리|후진|송곳|타이어|자녀|아들|딸|상처|부상|진술|구속|영장|기소|송치|판결|혐의)/u.test(String(claim.summary))).filter(({ claim }) => !isSynopsis(String(claim.summary)));
	const eventBeats = (rankedBeatCandidates.length ? rankedBeatCandidates : eligible.slice(0,10).map((claim,index)=>({claim,index,order:index}))).slice(0,9).map(({ claim }, index) => ({ beat:index+1, actor: /(?:피의자|피고인|가해|혐의|구속|범행|위협|추격|뒤쫓|들이받|겨누|송곳)/u.test(String(claim.summary)) ? "suspect" : /(?:피해|제보자|상처|부상|도망|벗어)/u.test(String(claim.summary)) ? "victim" : "unresolved-actor", action: claim.summary, target: /(?:상대|피해|모녀|앞\s*차량|A씨\s*차량|B씨\s*차량|타이어|바퀴|유리|창문|뒤범퍼)/u.test(String(claim.summary)) ? "other-party-or-vehicle" : "", result: /(?:상처|부상|파손|구멍|구속|영장|기소|송치|판결)/u.test(String(claim.summary)) ? claim.summary : "", time: claim.date, space: "", claimRefs:[claim.id] }));
	if (!eventBeats.length) throw new Error("Stage 03 사건 브리프에는 claim 연결 사건 beat가 필요합니다.");
	const narrativeContext = coreFacts.slice(0,4).map((fact) => ({ text:fact.text, claimRefs:fact.claimRefs }));
	const sceneInventory = eventBeats.filter((beat) => /(위협|추격|들이받|겨누|송곳|타이어|창문|유리|후진|경적|가로막|숫자|기록)/u.test(String(beat.action))).slice(0,8).map((beat) => ({ description:beat.action, claimRefs:beat.claimRefs }));
	const requiredQualifications = rows(legalPolicy.requiredQualifications).flatMap((item) => {
		const qualifier = caseBriefText(item.qualifier, 600);
		if (!qualifier) return [];
		return [{ id:caseBriefText(item.id,120), claimRefs:strings(item.claimIds).map((claimId)=>caseBriefText(claimId,120)).filter((claimId)=>claims.has(claimId)), semanticTrigger:caseBriefText(item.semanticTrigger,600), qualifier }];
	});
	for (const value of strings(legalPolicy.requiredQualifications)) {
		const qualifier = caseBriefText(value, 600);
		if (qualifier) requiredQualifications.push({ id:"", claimRefs:[], semanticTrigger:"", qualifier });
	}
	const brief = { schema:"newsroom-stage03-case-brief-v1", event:{ title:caseBriefText(isRecord(dossier.eventIdentity) ? dossier.eventIdentity.title : candidate.title,300) }, entities, eventBeats, coreFacts, sourceGroups, conflicts:rows(dossier.conflicts).slice(0,20).map((item)=>({field:caseBriefText(item.field,160),values:strings(item.values).map((value)=>caseBriefText(value,400)),status:"disputed"})), unknowns:strings(dossier.unknowns).slice(0,20).map((value)=>caseBriefText(value,500)), legal:{ allowedClaims:rows(legalPolicy.allowedClaims).flatMap((item)=>claims.has(caseBriefText(item.claimId,120))?[{text:caseBriefText(item.summary,900),claimRefs:[caseBriefText(item.claimId,120)],attributionRequired:Boolean(item.attributionRequired),perspective:caseBriefText(item.perspective,80),confidence:caseBriefText(item.confidence,80)}]:[]), prohibitedClaims:strings(legalPolicy.prohibitedClaims).map((value)=>caseBriefText(value,600)), requiredQualifications, uncertaintyInstructions:strings(legalPolicy.uncertaintyInstructions).map((value)=>caseBriefText(value,600)) }, narrativeContext, sceneInventory, narrativeAutonomy:"Evidence inventory only. It does not prescribe a hook, twist, coda, or universal information order." };
	return { ...brief, sha256:hashJson(brief) };
}

export function buildDraftPolicyPackage({ candidate, researchSnapshot, legalReport, editorialDirection, editorialIntent }: { candidate: JsonRecord; researchSnapshot: JsonRecord; legalReport: unknown; editorialDirection?: unknown; editorialIntent?: unknown }) {
	if (!isRecord(legalReport) || !isRecord(legalReport.reviewCompletion) || legalReport.reviewCompletion.allComplete !== true) throw new Error("사건 처리 비교, 영상 활용, 대본 주의사항의 세 가지 법률 검토가 모두 완료되어야 합니다.");
	if (!isRecord(legalReport) || !isRecord(legalReport.scriptPolicy) || !isRecord(legalReport.videoDecision)) throw new Error("최신 법률 정책이 필요합니다.");
	if (!isCurrentLegalContextReport({ report: legalReport, candidate, researchSnapshot })) throw new Error("사건 히스토리 또는 법률 정책이 오래되었습니다.");
	if (isRecord(legalReport.videoDecision) && legalReport.videoDecision.decision === "block") throw new Error("법률 검토가 영상 생성을 차단했습니다.");
	const dossier = researchSnapshot.eventDossier as JsonRecord;
	const claimCount = ["confirmedFacts", "investigationAndCharges", "trialStagesAndSentenceChanges", "prosecutionClaims", "defenseClaims", "courtFindings", "victimImpact"].flatMap((key) => rows(dossier[key])).length;
	const legacyDetailedDraft = isRecord(dossier.readiness) && dossier.readiness.readyForDraft === undefined && dossier.readiness.detailedNarrativeComplete === true && claimCount >= 4;
	if (!isRecord(dossier.readiness) || !(dossier.readiness.readyForDraft === true || legacyDetailedDraft) || dossier.readiness.detailedNarrativeComplete !== true) throw new Error("사건 흐름을 구성할 충분한 본문·동일 사건 자료가 필요합니다. Research를 다시 실행하세요.");
	const caseHistory = sanitizedCaseHistory(dossier);
	const intent = normalizeEditorialIntent({ editorialDirection, editorialIntent, caseHistory });
	const caseBrief = buildStage03CaseBrief(candidate, researchSnapshot, legalReport, dossier);
	const policyBinding = {
		eventDossierSha256: hashJson(dossier),
		legalReportSha256: hashJson(legalReport),
		editorialIntentSha256: intent.sha256,
		caseBriefSha256: caseBrief.sha256,
	};
	const generationGuidance = {
		audioOnlyStorytelling: true,
		narrativeQuality: AUTONOMOUS_NARRATIVE_QUALITY_GUIDANCE,
		targetListeningSeconds: { minimum: 65, maximum: 80 },
		durationAuthority: "owner-narration-locked-timing",
		textLengthIsNotDurationEvidence: true,
		speechRateEvidence: {
			schema: "owner-narration-speech-rate-observation-v1",
			advisoryOnly: true,
			observedCompactKoreanCharactersPerSecond: 6.87,
			observedDurationSeconds: 55.016,
			sourceScriptSha256: "47f7caa49138267382ce23ec2c360359e1448434671abb1835f314f52de7f8ae",
			sourceAudioSha256: "d57593fd6d5437caac96148b8ba8e963ebc164f3e8db2cdb99fe4edab88a6ac6",
		},
		editorialIntent: intent,
	};
	const projection = { schemaVersion: 21, caseHistory, caseBrief, videoDecision: legalReport.videoDecision, legalPolicy: legalReport.scriptPolicy, generationGuidance, policyBinding };
	const result = { ...projection, policyBinding: { ...policyBinding, packageSha256: hashJson(projection) } };
	if (/https?:\/\//iu.test(JSON.stringify(result))) throw new Error("Stage 03 입력에는 원문 URL을 포함할 수 없습니다.");
	return result;
}

export function isCurrentLegalContextReport({ report, candidate, researchSnapshot }: { report: unknown; candidate: JsonRecord; researchSnapshot: JsonRecord }) {
	if (!isRecord(report) || report.schemaVersion !== 5 || !isCurrentEventDossier(researchSnapshot) || !isRecord(report.scriptPolicy) || report.scriptPolicy.version !== 2 || !isRecord(report.reviewCompletion) || report.reviewCompletion.allComplete !== true) return false;
	return report.candidateSha256 === hashJson(candidate)
		&& report.researchSnapshotSha256 === hashJson(researchSnapshot)
		&& report.eventDossierSha256 === hashJson(researchSnapshot.eventDossier)
		&& isRecord(report.videoDecision)
		&& ["allow", "conditional", "block"].includes(String(report.videoDecision.decision));
}

export type LegalComplianceResult = { ok: boolean; violations: string[]; blockedStatements: string[] };

export function validateDraftLegalCompliance({ sections, policy }: { sections: unknown; policy: unknown; factBrief?: unknown; candidateNarrative?: unknown }): LegalComplianceResult {
	if (!isRecord(sections) || !isRecord(policy) || policy.version !== 2) return { ok: false, violations: ["approved-script-policy-required"], blockedStatements: [] };
	const allowed = rows(policy.allowedClaims);
	const sentences = Object.entries(sections).flatMap(([section, value]) => text(value).split(/(?<=[.!?다요])\s+|\n/gu).map((sentence) => ({ section, sentence: text(sentence) })).filter((item) => item.sentence));
	const violations: string[] = [];
	const blockedStatements: string[] = [];
	const fullScript = Object.values(sections).map(text).join("\n");
	for (const phrase of strings(policy.prohibitedPhrases)) {
		if (fullScript.includes(phrase)) violations.push(`prohibited-phrase:${phrase}`);
	}
	for (const prohibited of strings(policy.prohibitedClaims)) {
		for (const { section, sentence } of sentences) if (!/(?:확인되지 않았|공개되지 않았|단정하자는 게 아닙니다|단정하지 않습니다)/u.test(sentence) && !(/확인되지 않/u.test(prohibited) && /공개 보도만으로는[\s\S]*확인되지 않/u.test(text(sections[section]))) && similarity(sentence, prohibited) >= 0.65) { violations.push(`prohibited-assertion:${prohibited}`); blockedStatements.push(sentence); break; }
	}
	const attribution = /(?:보도|기사|매체|따르면|전해|검찰|피고인|변호|재판부|법원|주장|판단)/u;
	for (const { section, sentence } of sentences) {
		if (!["incident", "timeline", "frustrating"].includes(section)) continue;
		const match = allowed.map((claim) => ({ claim, score: similarity(sentence, claim.summary) })).sort((a, b) => b.score - a.score)[0];
		if (match && match.score >= 0.65 && match.claim.attributionRequired === true && !attribution.test(sentence)) violations.push(`missing-semantic-attribution:${text(match.claim.claimId)}:${section}`);
	}
	for (const { sentence } of sentences.filter((item) => ["incident", "timeline"].includes(item.section))) {
		if (!sentence.startsWith(NEUTRAL_SINGLE_SOURCE_ATTRIBUTION) && sentence !== "보도에 따르면," && !/(?:확인되지 않았습니다|공개되지 않았습니다)/u.test(sentence) && !allowed.some((claim) => similarity(sentence, claim.summary) >= 0.2)) violations.push(`unsupported-fact:${sentence}`);
	}
	const approvedText = allowed.map((claim) => claimSummary(claim)).join(" ");
	for (const { sentence } of sentences) if (/(?:신고하세요|신고해야|보호 조치|안전 조치|증거를 보존|법률 지원|상담을 받)/u.test(sentence) && similarity(sentence, approvedText) < 0.45) violations.push(`unsupported-advice:${sentence}`);
	return { ok: violations.length === 0, violations: unique(violations), blockedStatements: unique(blockedStatements) };
}
