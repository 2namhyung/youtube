"use client";
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleDot, ExternalLink, FileJson, FolderPlus, LoaderCircle, RefreshCw, ShieldAlert, Trash2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./newsroom.module.css";

type Article = { id?: string; title?: string; source?: string; url?: string; publishedAt?: string; score?: number; selected?: boolean };
type StoryCandidate = {
	id: string;
	title?: string;
	representative?: Article & { score?: number; selected?: boolean };
	articles?: Article[];
	sourceCount?: number;
	articleCount?: number;
	shortsScore?: number;
	reasons?: string[];
	updatedAt?: string;
};
type RadarMeta = { source?: string; mtime?: string; rowCount?: number; connected?: boolean };
type PoolMeta = RadarMeta & { generatedAt?: string | null; boundedLimit?: number; dailyArticleLimit?: number; coveredDayCount?: number; rollingWindowDays?: number | null; metadataOnly?: boolean; contentScope?: string; excerptMaxChars?: number; stale?: boolean; staleReason?: string | null; ageHours?: number | null; staleAfterHours?: number; archiveCount?: number; historicalArchiveCount?: number; historicalSourceCount?: number; archiveOldestPublishedAt?: string | null; archiveNewestPublishedAt?: string | null; historicalOldestPublishedAt?: string | null; historicalNewestPublishedAt?: string | null; actualCoveredDayRange?: number };
type SemanticMeta = RadarMeta & { generatedAt?: string | null; scannedArticleCount?: number; batchCount?: number; aiSuggestion?: boolean; persistedRowCount?: number; availableRowCount?: number; unavailableCount?: number; feedbackExcludedCount?: number; poolSelectionMismatch?: boolean; poolGeneratedAt?: string | null; rawEvaluationCount?: number; incidentCandidateCount?: number; duplicateArticleCount?: number };
type CollectionStats = { startedAt?: string; completedAt?: string; mode?: "current" | "backfill" | "incremental"; collected?: number | null; deduplicated?: number | null; pool?: number | null; candidates?: number | null; currentCollected?: number | null; currentSnapshot?: number | null; incrementalSince?: string | null; incrementalDays?: number | null; knownUrlCountBefore?: number; newArticleCount?: number; historicalDiscovered?: number; historicalFetched?: number; historicalSaved?: number; historicalErrorCount?: number; rollingEligible?: number | null; rollingPool?: number | null; rollingWindowDays?: number; feedbackExclusionCount?: number; feedbackExcluded?: number; feedbackUpdatedAt?: string | null; archive?: { totalArchiveCount?: number; historicalArchiveCount?: number; sourceCount?: number; oldestPublishedAt?: string | null; newestPublishedAt?: string | null; historicalOldestPublishedAt?: string | null; historicalNewestPublishedAt?: string | null; actualCoveredDayRange?: number } };
type CodexStatus = { available?: boolean; version?: string | null; model?: string | null };
type AdapterDiagnostic = { adapterId?: string; status?: "ok" | "enabled" | "not-configured" | "error" | "fixture" | "local"; queryCount?: number; rawResults?: number; directUrls?: number; portalUrls?: number; errors?: number };
type DiscoveryTrace = { queryCount?: number; rawResults?: number; directUrlsResolved?: number; uniqueCandidates?: number; attemptedFetches?: number; bodyVerified?: number; sameEventPassed?: number; independentPublisherGroups?: number; adapterDiagnostics?: AdapterDiagnostic[]; rejections?: Record<string, number> };
type DeepResearch = { status?: "ready" | "needs-more-evidence" | "failed" | "pending"; verifiedSourceCount?: number; independentPublisherCount?: number; confirmedFactCount?: number; timelineEventCount?: number; readiness?: string; rankScore?: number; evidenceBasis?: string; verifiedRelatedCoverage?: Article[]; primaryVerification?: string; primaryFailureReason?: string; discoveryTrace?: DiscoveryTrace };
type ResearchEvaluation = Article & { url: string; title: string; shortsScore: number; hook: string; storySummary: string; rationale: string; feedExcerpt?: string; excerptProvenance?: string; dimensions?: Record<string, number>; selectionReasons: string[]; factCheckRisks: string[]; visualAngles: string[]; aiSuggestion?: boolean; incidentId?: string; articleCount?: number; sourceCount?: number; relatedCoverage?: Article[]; deepResearch?: DeepResearch };
type ResearchDossier = { id: string; slug?: string; title: string; source: string; url: string; publishedAt?: string; hook?: string; editorialStatus: "active-review"; approval?: { approvedAt?: string }; factCheckRisks?: string[]; relatedCoverage?: Article[]; verification?: { state?: string; missing?: string[] } };
type SchedulerStatus = { state?: string; intervalMinutes?: number; nextRunAt?: string | null; semanticSelectionAutomatic?: boolean };
type ResearchFeedbackMeta = { exclusionCount?: number; updatedAt?: string | null; reasonCounts?: Record<string, number>; connected?: boolean };
type Feed = { candidates?: Article[]; storyCandidates?: StoryCandidate[]; semanticCandidates?: ResearchEvaluation[]; researchRadar?: RadarMeta; researchArticlePool?: PoolMeta; researchSemantic?: SemanticMeta; researchCollection?: CollectionStats; researchScheduler?: SchedulerStatus; researchDossiers?: { dossiers?: ResearchDossier[]; updatedAt?: string | null }; researchFeedback?: ResearchFeedbackMeta; error?: string };
type ResearchAnalysis = { ok?: boolean; aiSuggestion?: boolean; cliVersion?: string | null; model?: string | null; generatedAt?: string; scannedArticleCount?: number; batchCount?: number; evaluations?: ResearchEvaluation[]; error?: string };
type ResearchRefreshStatus = { state?: "idle" | "running" | "completed" | "failed"; error?: string; result?: { analysis?: ResearchAnalysis } };
type UnifiedCandidate = {
	id: string;
	kind: "semantic" | "rule";
	title: string;
	url?: string;
	source?: string;
	publishedAt?: string;
	shortsScore?: number;
	meaningScore?: number;
	strict?: boolean;
	evaluation?: ResearchEvaluation;
	story?: StoryCandidate;
};
const CANDIDATES_PER_PAGE = 6;
const REJECTION_REASONS = ["채널 주제와 맞지 않음", "일상성이 약함", "황당함·공포가 약함", "단순 사고·범죄에 가까움", "영상화 자료가 부족함", "중복되거나 오래된 내용"] as const;
const DISCOVERY_CHANNEL_LABELS: Record<string, string> = { "google-news": "Google", "naver-news": "Naver", "daum-news": "Daum" };

function discoveryChannelSummary(trace?: DiscoveryTrace) {
	const rows = trace?.adapterDiagnostics || [];
	return Object.entries(DISCOVERY_CHANNEL_LABELS).map(([adapterId, label]) => {
		const matches = rows.filter((row) => row.adapterId === adapterId);
		if (matches.length === 0) return `${label} 미확인`;
		if (matches.every((row) => row.status === "not-configured")) return `${label} 키 필요`;
		if (matches.some((row) => row.status === "error")) return `${label} 오류`;
		const rawResults = matches.reduce((sum, row) => sum + (row.rawResults || 0), 0);
		return `${label} 활성${rawResults > 0 ? ` ${rawResults}건` : ""}`;
	}).join(" · ");
}
const MEANING_DIMENSIONS = [
	{ key: "ordinaryContext", label: "일상 공간" },
	{ key: "disproportionateEscalation", label: "과잉 확대" },
	{ key: "explanationActionMismatch", label: "행동·해명 불일치" },
	{ key: "tangibleRisk", label: "실제 위험" },
	{ key: "responsibilityEvasion", label: "책임 회피" },
	{ key: "relatableEmotion", label: "공감 감정" },
] as const;
type MeaningDimension = typeof MEANING_DIMENSIONS[number]["key"];

function dimensionScore({ candidate, key }: { candidate: ResearchEvaluation; key: MeaningDimension }) {
	const value = candidate.dimensions?.[key];
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.round(value))) : 0;
}

function formatDate(value?: string) {
	if (!value) return "날짜 없음";
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function candidateStory(item: UnifiedCandidate) {
	const source = item.evaluation?.storySummary || "사건의 발단·행동·피해·현재 상태를 확인할 자료가 부족해 후보 설명을 만들 수 없습니다.";
	const compact = source.replace(/^\[[^\]]{1,60}\]\s*/, "").replace(/^[^=.]{1,40}\s=\s/, "").replace(/\s+/g, " ").trim();
	return compact.length > 520 ? `${compact.slice(0, 520).trim()}…` : compact;
}

function deepResearchLabel(status?: DeepResearch["status"]) {
	return status === "ready" ? "제작 추천" : status === "needs-more-evidence" ? "추가 조사 필요" : status === "failed" ? "분석 실패" : "대기";
}

function deepResearchRank(candidate: ResearchEvaluation) {
	const status = candidate.deepResearch?.status || "pending";
	return [Number(DEEP_RESEARCH_STATUS_RANK[status] || 0), Number(candidate.deepResearch?.rankScore || 0), Number(candidate.shortsScore || 0)];
}

const DEEP_RESEARCH_STATUS_RANK: Record<NonNullable<DeepResearch["status"]>, number> = { ready: 4, "needs-more-evidence": 2, pending: 1, failed: 0 };

export function NewsroomResearchPanel() {
	const router = useRouter();
	const [feed, setFeed] = useState<Feed | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [collectError, setCollectError] = useState<string | null>(null);
	const [draftState, setDraftState] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
	const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
	const [analysis, setAnalysis] = useState<ResearchAnalysis | null>(null);
	const [promotionState, setPromotionState] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
	const [promotionError, setPromotionError] = useState<string | null>(null);
	const [pipelineRunning, setPipelineRunning] = useState(false);
	const [candidatePage, setCandidatePage] = useState(1);
	const [candidateQuery, setCandidateQuery] = useState("");
	const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
	const [rejectionState, setRejectionState] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
	const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (!isRefresh) setLoading(true);
		setError(null);
		try {
			const response = await fetch("/api/newsroom?adapters=local-research-radar&limit=24", { cache: "no-store" });
			const body = await response.json() as Feed;
			if (!response.ok) throw new Error(body.error || "조사 후보를 불러올 수 없습니다");
			// The server feed is authoritative because it applies persisted editorial
			// exclusions. Clear any older in-memory semantic analysis snapshot so a
			// rejected card cannot reappear after this reload.
			setAnalysis(null);
			setFeed(body);
			void fetch("/api/newsroom?codex=status", { cache: "no-store" }).then(async (statusResponse) => setCodexStatus(await statusResponse.json() as CodexStatus)).catch(() => setCodexStatus({ available: false }));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "조사 후보를 불러올 수 없습니다");
		} finally { setLoading(false); }
	}, []);

	useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

	useEffect(() => {
		let stopped = false;
		const checkRefreshStatus = async () => {
			try {
				const response = await fetch("/api/newsroom?research-refresh=status", { cache: "no-store" });
				const status = await response.json() as ResearchRefreshStatus;
				if (stopped) return;
				if (status.state === "running") {
					setPipelineRunning(true);
					setCollectError(null);
					return;
				}
				if (status.state === "completed") {
					setCollectError(null);
					if (status.result?.analysis) setAnalysis(status.result.analysis);
					setPipelineRunning(false);
					await load(true);
					return;
				}
				if (status.state === "failed") {
					setPipelineRunning(false);
					setCollectError(status.error || "뉴스 수집·AI 선별에 실패했습니다.");
				}
			} catch {
				if (!stopped && pipelineRunning) setCollectError("뉴스 수집 상태를 확인하지 못했습니다.");
			}
		};
		void checkRefreshStatus();
		if (!pipelineRunning) return () => { stopped = true; };
		const timer = window.setInterval(() => { void checkRefreshStatus(); }, 4_000);
		return () => { stopped = true; window.clearInterval(timer); };
	}, [pipelineRunning, load]);

	const meta = feed?.researchRadar || {};
	const poolMeta = feed?.researchArticlePool || {};
	const semanticMeta = feed?.researchSemantic || {};
	const collection = feed?.researchCollection;
	const scheduler = feed?.researchScheduler;
	const dossiers = feed?.researchDossiers?.dossiers || [];
	const feedbackMeta = feed?.researchFeedback || {};
	const articles = feed?.candidates || [];
	const semanticCandidates = useMemo(() => {
		const query = candidateQuery.normalize("NFKC").toLocaleLowerCase("ko-KR").trim();
		return (analysis?.ok ? analysis.evaluations || [] : feed?.semanticCandidates || [])
			.filter((candidate) => candidate.storySummary?.trim().length >= 120)
			.filter((candidate) => !query || [candidate.title, candidate.source, candidate.hook, candidate.storySummary]
				.some((value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query)));
	}, [analysis, candidateQuery, feed]);
	const deepAnalysisStats = useMemo(() => {
		const candidates = analysis?.ok ? analysis.evaluations || [] : feed?.semanticCandidates || [];
		const analyzed = candidates.filter((candidate) => candidate.deepResearch?.status && candidate.deepResearch.status !== "pending");
		return {
			analyzed: analyzed.length,
			ready: analyzed.filter((candidate) => candidate.deepResearch?.status === "ready").length,
		};
	}, [analysis, feed]);
	const connected = meta.connected ?? articles.length > 0;
	const unifiedCandidates = useMemo<UnifiedCandidate[]>(() => {
		const unique = new Map<string, ResearchEvaluation>();
		for (const candidate of semanticCandidates) {
			const url = candidate.url?.trim();
			if (url && candidate.title?.trim() && !unique.has(url)) unique.set(url, candidate);
		}
		const rankedSemantic = [...unique.values()].map((candidate, originalIndex) => {
			const ordinary = dimensionScore({ candidate, key: "ordinaryContext" });
			const disproportion = dimensionScore({ candidate, key: "disproportionateEscalation" });
			const mismatch = dimensionScore({ candidate, key: "explanationActionMismatch" });
			const risk = dimensionScore({ candidate, key: "tangibleRisk" });
			const evasion = dimensionScore({ candidate, key: "responsibilityEvasion" });
			const relatable = dimensionScore({ candidate, key: "relatableEmotion" });
			return {
				candidate,
				meaningScore: ordinary * 3 + disproportion * 2 + mismatch * 2 + risk * 2 + evasion + relatable,
				strict: ordinary >= 2 && (disproportion >= 2 || mismatch >= 2) && (risk >= 1 || evasion >= 1),
				originalIndex,
			};
		}).sort((left, right) => {
			const leftDeep = deepResearchRank(left.candidate); const rightDeep = deepResearchRank(right.candidate);
			return rightDeep[0] - leftDeep[0] || rightDeep[1] - leftDeep[1] || (right.strict === left.strict ? right.meaningScore - left.meaningScore || (right.candidate.shortsScore || 0) - (left.candidate.shortsScore || 0) || left.originalIndex - right.originalIndex : Number(right.strict) - Number(left.strict));
		});
		const semanticItems: UnifiedCandidate[] = rankedSemantic.map(({ candidate, meaningScore, strict }, index) => ({
			id: `semantic-${candidate.url}`,
			kind: "semantic",
			title: candidate.title,
			url: candidate.url,
			source: candidate.source,
			publishedAt: candidate.publishedAt,
			shortsScore: candidate.shortsScore,
			meaningScore,
			strict,
			evaluation: candidate,
			index,
		} as UnifiedCandidate));
		return semanticItems.filter((item) => rejectionState[item.id] !== "done");
	}, [rejectionState, semanticCandidates]);
	const candidatePageCount = Math.max(1, Math.ceil(unifiedCandidates.length / CANDIDATES_PER_PAGE));
	const visibleCandidatePage = Math.min(candidatePage, candidatePageCount);
	const pagedCandidates = unifiedCandidates.slice((visibleCandidatePage - 1) * CANDIDATES_PER_PAGE, visibleCandidatePage * CANDIDATES_PER_PAGE);
	async function refreshResearchPipeline() {
		setPipelineRunning(true); setCollectError(null); setCandidatePage(1);
		try {
			const response = await fetch("/api/newsroom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh-research" }) });
			const body = await response.json() as ResearchRefreshStatus & { error?: string };
			if (!response.ok) throw new Error(body.error || body.result?.analysis?.error || "뉴스 수집·AI 선별을 시작하지 못했습니다.");
			if (body.state === "failed") throw new Error(body.error || "뉴스 수집·AI 선별에 실패했습니다.");
		} catch (cause) {
			setPipelineRunning(false);
			setCollectError(cause instanceof Error ? cause.message : "뉴스 수집·AI 선별을 시작하지 못했습니다.");
		}
	}

	async function checkDraft(candidate: StoryCandidate) {
		const id = candidate.id;
		setDraftState((current) => ({ ...current, [id]: "loading" }));
		try {
			const response = await fetch("/api/newsroom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", candidate: candidate.representative || candidate.articles?.[0] }) });
			if (!response.ok) throw new Error("초안 연결 확인에 실패했습니다");
			setDraftState((current) => ({ ...current, [id]: "done" }));
		} catch { setDraftState((current) => ({ ...current, [id]: "error" })); }
	}

	async function promote(candidate: ResearchEvaluation) {
		setPromotionState((current) => ({ ...current, [candidate.url]: "loading" }));
		setPromotionError(null);
		try {
			const response = await fetch("/api/newsroom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "promote-research", url: candidate.url }) });
			const body = await response.json() as { error?: string; dossier?: ResearchDossier };
			if (!response.ok) throw new Error(body.error || "취재 파일 승격에 실패했습니다.");
			if (!body.dossier?.slug) throw new Error("생성된 취재 파일 주소를 확인하지 못했습니다.");
			setPromotionState((current) => ({ ...current, [candidate.url]: "done" }));
			router.push(`/stories/${encodeURIComponent(body.dossier.slug)}/research`);
		} catch (cause) {
			setPromotionState((current) => ({ ...current, [candidate.url]: "error" }));
			setPromotionError(cause instanceof Error ? cause.message : "취재 파일 승격에 실패했습니다.");
		}
	}

	async function rejectCandidate(item: UnifiedCandidate) {
		const reason = rejectionReason[item.id] || REJECTION_REASONS[0];
		setRejectionState((current) => ({ ...current, [item.id]: "loading" }));
		setRejectionMessage(null);
		const candidate = {
			kind: item.kind,
			title: item.title,
			url: item.url,
			source: item.source,
			relatedUrls: [...new Set([
				...(item.evaluation?.relatedCoverage || []).map((article) => article.url).filter((url): url is string => Boolean(url)),
				...(item.story?.articles || []).map((article) => article.url).filter((url): url is string => Boolean(url)),
			])],
			selectionReasons: item.evaluation?.selectionReasons || item.story?.reasons || [],
			dimensions: item.evaluation?.dimensions || {},
		};
		try {
			const response = await fetch("/api/newsroom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject-research", candidate, reason }) });
			const body = await response.json() as { error?: string; feedback?: { exclusionCount?: number } };
			if (!response.ok) throw new Error(body.error || "후보 제외에 실패했습니다");
			setRejectionState((current) => ({ ...current, [item.id]: "done" }));
			setRejectionMessage(`후보를 제외했습니다. 제외 기록 ${body.feedback?.exclusionCount ?? ""}건을 다음 수집과 AI 선별에 반영합니다.`);
			await load(true);
		} catch (cause) {
			setRejectionState((current) => ({ ...current, [item.id]: "error" }));
			setRejectionMessage(cause instanceof Error ? cause.message : "후보 제외에 실패했습니다");
		}
	}

	return <section className={styles.researchPanel} aria-labelledby="research-radar-heading">
		<div className={styles.researchPanelHeader}>
			<div><p className={styles.eyebrow}>01 조사 / 다음 소재</p><h2 id="research-radar-heading">다음 영상 소재 찾기</h2><p className={styles.researchIntro}>신규 뉴스를 선별한 뒤 사건별 검색어를 확장해 최대 18개 후보를 심층분석합니다. 검증된 동일 사건 보도와 독립 매체, 확인 근거가 풍부한 소재를 먼저 보여줍니다.</p></div>
			<div className={styles.researchControls}>
				<span className={connected ? styles.connectionBadge : styles.connectionBadgeOffline}>{connected ? <CircleDot size={13} /> : <WifiOff size={13} />}{poolMeta.connected ? "전체 후보 풀 연결됨" : connected ? "규칙 후보 연결됨" : "조사 데이터 연결 끊김"}</span>
				<button className={styles.researchRefresh} type="button" onClick={() => void refreshResearchPipeline()} disabled={pipelineRunning || loading} aria-busy={pipelineRunning}>{pipelineRunning ? <LoaderCircle size={14} className={styles.spin} /> : <RefreshCw size={14} />} {pipelineRunning ? "수집·선별·심층분석 중…" : "신규 뉴스 수집·심층분석"}</button>
			</div>
		</div>
		{poolMeta.stale && <div className={styles.freshnessGate} role="alert"><ShieldAlert size={16} /><div><b>기사 풀이 오래됐습니다</b><p>{poolMeta.staleReason}. 새로 수집하기 전에는 의미 선별을 실행할 수 없습니다.</p></div></div>}
		{analysis?.error && <div className={styles.researchError} role="alert">AI 선별 오류: {analysis.error}</div>}
		{collectError && <div className={styles.researchError} role="alert">{collectError}</div>}
		{promotionError && <div className={styles.researchError} role="alert">{promotionError}</div>}
		{rejectionMessage && <div className={styles.feedbackNotice} role="status">{rejectionMessage}</div>}
		<section className={styles.candidateDesk} aria-labelledby="unified-candidates-heading">
			<div className={styles.candidateDeskHeader}>
				<div><span>전체 후보 / 통합 검토</span><h3 id="unified-candidates-heading">전체 다음 영상 후보</h3><p>사건 개요와 선정 이유, 확인 위험, 영상화 포인트를 비교하세요. 제외한 후보와 이유는 다음 수집·선별의 부정 예시로 반영됩니다.</p></div>
				<small>{unifiedCandidates.length}건 · 심층분석 {deepAnalysisStats.analyzed}건 · 제작 추천 {deepAnalysisStats.ready}건 · 제외 학습 {feedbackMeta.exclusionCount ?? 0}건 · {candidatePageCount}페이지</small>
			</div>
			<label className={styles.candidateSearch}><span>AI 후보 검색</span><input type="search" value={candidateQuery} onChange={(event) => { setCandidateQuery(event.target.value); setCandidatePage(1); }} placeholder="사건, 장소, 대상, 감정 키워드" /><small>AI가 3,000건 전체에서 선별한 후보의 제목·출처·사건 개요를 검색합니다.</small></label>
			{loading ? <div className={styles.researchEmpty}><LoaderCircle size={17} className={styles.spin} /> 후보를 불러오는 중…</div> : error ? <div className={styles.researchEmpty} role="alert"><WifiOff size={17} /> {error}</div> : unifiedCandidates.length === 0 ? <div className={styles.researchEmpty}>후보가 없습니다. 위 버튼을 눌러 마지막 성공 수집 이후의 신규 기사만 추가하고 AI 선별을 실행하세요.</div> : <>
				<div className={styles.candidateUnifiedGrid}>
					{pagedCandidates.map((item, index) => {
						const candidate = item.evaluation;
						const story = item.story;
						const status = story ? draftState[story.id] || "idle" : "idle";
						const selectedDossier = candidate ? dossiers.find((dossier) => dossier.url === candidate.url) : undefined;
						const selected = Boolean(selectedDossier);
						return <article className={styles.candidateUnifiedCard} key={item.id}>
							<div className={styles.candidateUnifiedTopline}><span>{item.kind === "semantic" ? "AI 의미 선별" : "규칙 선별"}</span><b>#{String((visibleCandidatePage - 1) * CANDIDATES_PER_PAGE + index + 1).padStart(2, "0")}</b></div>
							<div className={styles.candidateUnifiedMeta}><span>{item.source || "출처 미상"} · {formatDate(item.publishedAt)}</span><span>쇼츠 {item.shortsScore ?? 0}/100{typeof item.meaningScore === "number" ? ` · 의미 ${item.meaningScore}/42` : ""}</span></div>
							<h4>{item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a> : item.title}</h4>
							<p className={styles.candidateUnifiedHook}><b>사건 개요</b>{candidate?.hook || story?.reasons?.[0] || "기사 원문에서 사건의 발단과 피해 내용을 추가 확인하세요."}</p>
							<div className={styles.candidateUnifiedStory}><b>무슨 일이 있었나</b><p>{candidateStory(item)}</p></div>
							{candidate && <div className={`${styles.deepResearchBadge} ${styles[`deepResearch${candidate.deepResearch?.status || "pending"}`]}`}><b>{deepResearchLabel(candidate.deepResearch?.status)}</b><span>검증 출처 {candidate.deepResearch?.verifiedSourceCount ?? 0} · 독립 매체 {candidate.deepResearch?.independentPublisherCount ?? 0} · 확인 근거 {candidate.deepResearch?.confirmedFactCount ?? 0}문장 · 전개 {candidate.deepResearch?.timelineEventCount ?? 0}</span></div>}
							{candidate?.deepResearch?.discoveryTrace && <details className={styles.candidateUnifiedDetails}><summary>출처 수집 진단 · 검색 {candidate.deepResearch.discoveryTrace.queryCount ?? 0}회 · 발견 {candidate.deepResearch.discoveryTrace.rawResults ?? 0}건 · 원문 검증 {candidate.deepResearch.discoveryTrace.bodyVerified ?? 0}건</summary><div><p>채널 상태: {discoveryChannelSummary(candidate.deepResearch.discoveryTrace)}</p><p>직접 원문 해소 {candidate.deepResearch.discoveryTrace.directUrlsResolved ?? 0}건 · 중복 제거 후 {candidate.deepResearch.discoveryTrace.uniqueCandidates ?? 0}건 · 본문 확인 시도 {candidate.deepResearch.discoveryTrace.attemptedFetches ?? 0}건 · 동일 사건 통과 {candidate.deepResearch.discoveryTrace.sameEventPassed ?? 0}건</p><p>탈락: 중계주소 미해소 {candidate.deepResearch.discoveryTrace.rejections?.unresolvedAggregator ?? 0} · 본문 불가 {candidate.deepResearch.discoveryTrace.rejections?.bodyUnavailable ?? 0} · 본문 불충분 {candidate.deepResearch.discoveryTrace.rejections?.bodyUnverified ?? 0} · 다른 사건 {candidate.deepResearch.discoveryTrace.rejections?.differentEvent ?? 0} · 같은 매체/재전재 {(candidate.deepResearch.discoveryTrace.rejections?.duplicatePublisher ?? 0) + (candidate.deepResearch.discoveryTrace.rejections?.syndicatedDuplicate ?? 0)}</p>{candidate.deepResearch.primaryVerification !== "verified" && <p>대표 원문 검증 실패 후에도 보조 출처 검색을 계속했습니다.{candidate.deepResearch.primaryFailureReason ? ` (${candidate.deepResearch.primaryFailureReason})` : ""}</p>}</div></details>}
							<div className={styles.candidateUnifiedSignals} aria-label="선정 이유">
								{(candidate?.selectionReasons?.length ? candidate.selectionReasons : story?.reasons || []).map((reason) => <span key={reason}>{reason}</span>)}
							</div>
							{candidate && <div className={styles.candidateUnifiedDimensions} aria-label="후보 진단 점수">{MEANING_DIMENSIONS.map(({ key, label }) => <span key={key}><b>{label}</b>{dimensionScore({ candidate, key })}/3</span>)}</div>}
							{candidate && <details className={styles.candidateUnifiedDetails}><summary>판단 근거와 확인 위험</summary><div><b>AI 판단 근거</b><p>{candidate.rationale}</p><b>반드시 확인</b><p>{candidate.factCheckRisks.length > 0 ? candidate.factCheckRisks.join(" · ") : "원문, 독립 출처, 당사자 반론을 확인하세요."}</p><b>영상화 포인트</b><p>{candidate.visualAngles.length > 0 ? candidate.visualAngles.join(" · ") : "CCTV, 현장 사진, 관계자 설명의 확보 여부를 확인하세요."}</p></div></details>}
							{candidate?.deepResearch?.verifiedRelatedCoverage && candidate.deepResearch.verifiedRelatedCoverage.length > 0 && <details className={styles.storyArticles}><summary>검증된 동일 사건 보도 {candidate.deepResearch.verifiedSourceCount ?? candidate.deepResearch.verifiedRelatedCoverage.length}건 · 독립 매체 {candidate.deepResearch.independentPublisherCount || 1}곳</summary><ul>{candidate.deepResearch.primaryVerification === "verified" && <li><a href={candidate.url} target="_blank" rel="noreferrer">{candidate.title}</a><small>{candidate.source || "출처 미상"} · 대표 기사</small></li>}{candidate.deepResearch.verifiedRelatedCoverage.map((article, articleIndex) => <li key={`${article.url || "related"}-${articleIndex}`}><a href={article.url} target="_blank" rel="noreferrer">{article.title || article.url}</a><small>{article.source || "출처 미상"} · {formatDate(article.publishedAt)}</small></li>)}</ul></details>}
							{story && <details className={styles.storyArticles}><summary>묶인 원문 기사 {story.articles?.length || 0}건</summary><ul>{(story.articles || []).map((article, articleIndex) => <li key={`${article.url || "article"}-${articleIndex}`}><a href={article.url} target="_blank" rel="noreferrer">{article.title || article.url}</a><small>{article.source || "출처 미상"} · {formatDate(article.publishedAt)}</small></li>)}</ul></details>}
							<div className={styles.verificationWarning}><ShieldAlert size={13} /> 선택 후 원문·독립 출처·당사자 반론을 확인해야 합니다.</div>
							<div className={styles.candidateUnifiedActions}>
								{item.url && <a className={styles.promotedSourceLink} href={item.url} target="_blank" rel="noreferrer noopener" aria-label={`${item.title} 원문 열기`}>원문 확인 <ExternalLink size={13} /></a>}
								{candidate ? selectedDossier?.slug ? <Link className={styles.nextStoryAction} href={`/stories/${encodeURIComponent(selectedDossier.slug)}/research`}><Check size={14} /> 취재 작업 열기</Link> : <button className={styles.nextStoryAction} type="button" onClick={() => void promote(candidate)} disabled={promotionState[candidate.url] === "loading"}>{promotionState[candidate.url] === "loading" ? <LoaderCircle size={14} className={styles.spin} /> : <FolderPlus size={14} />}{promotionState[candidate.url] === "error" ? "선택 다시 시도" : "이 소재로 취재 시작"}</button> : story ? <button className={styles.draftCheck} type="button" onClick={() => void checkDraft(story)} disabled={status === "loading"}>{status === "loading" ? <LoaderCircle size={14} className={styles.spin} /> : status === "done" ? <Check size={14} /> : <FileJson size={14} />}{status === "done" ? "초안 연결 정상" : status === "error" ? "초안 재시도" : "초안 연결 확인"}</button> : null}
							</div>
							<div className={styles.candidateRejectControls}>
								<label htmlFor={`reject-reason-${item.id}`}>제외 이유</label>
								<select id={`reject-reason-${item.id}`} value={rejectionReason[item.id] || REJECTION_REASONS[0]} onChange={(event) => setRejectionReason((current) => ({ ...current, [item.id]: event.target.value }))} disabled={selected || rejectionState[item.id] === "loading"}>{REJECTION_REASONS.map((reason) => <option value={reason} key={reason}>{reason}</option>)}</select>
								<button type="button" onClick={() => void rejectCandidate(item)} disabled={selected || rejectionState[item.id] === "loading"} aria-label={`${item.title} 후보 제외`}>{rejectionState[item.id] === "loading" ? <LoaderCircle size={13} className={styles.spin} /> : <Trash2 size={13} />}{selected ? "선택된 소재" : rejectionState[item.id] === "error" ? "제외 다시 시도" : "후보 제외"}</button>
							</div>
						</article>;
					})}
				</div>
				<nav className={styles.candidatePagination} aria-label="전체 후보 페이지">
					<span>후보 {(visibleCandidatePage - 1) * CANDIDATES_PER_PAGE + 1}–{Math.min(visibleCandidatePage * CANDIDATES_PER_PAGE, unifiedCandidates.length)} / {unifiedCandidates.length} · {visibleCandidatePage} / {candidatePageCount}페이지</span>
					<div><button type="button" onClick={() => setCandidatePage((page) => Math.max(1, page - 1))} disabled={visibleCandidatePage === 1} aria-label="이전 후보 페이지">이전</button>{Array.from({ length: candidatePageCount }, (_, pageIndex) => pageIndex + 1).map((page) => <button type="button" key={page} onClick={() => setCandidatePage(page)} aria-label={`${page}페이지`} aria-current={page === visibleCandidatePage ? "page" : undefined}>{page}</button>)}<button type="button" onClick={() => setCandidatePage((page) => Math.min(candidatePageCount, page + 1))} disabled={visibleCandidatePage === candidatePageCount} aria-label="다음 후보 페이지">다음</button></div>
				</nav>
			</>}
		</section>
		<details className={styles.researchDetails}>
			<summary><span>수집·AI 실행 상세</span><small>전체 후보 {unifiedCandidates.length}건 · 30일 기사 보관함 {poolMeta.archiveCount ?? collection?.archive?.totalArchiveCount ?? 0}건</small></summary>
			<div className={styles.researchDetailsBody}>
				<div className={styles.researchMeta} aria-live="polite"><code>{poolMeta.source || meta.source || "01-research/news_radar/data/latest_article_pool.json"}</code><span>30일 기사 보관함 {poolMeta.archiveCount ?? collection?.archive?.totalArchiveCount ?? 0}건</span><span>과거 수집 보관함 {poolMeta.historicalArchiveCount ?? collection?.archive?.historicalArchiveCount ?? 0}건 · {poolMeta.historicalSourceCount ?? collection?.archive?.sourceCount ?? 0}개 출처</span><span>과거 수집 날짜 {formatDate(poolMeta.historicalOldestPublishedAt || collection?.archive?.historicalOldestPublishedAt || undefined)} — {formatDate(poolMeta.historicalNewestPublishedAt || collection?.archive?.historicalNewestPublishedAt || undefined)}</span><span>의미 선별 균형 풀 {poolMeta.rowCount ?? collection?.pool ?? 0} / 최대 3,000건</span><span>날짜별 최대 {poolMeta.dailyArticleLimit ?? 100}건 · {poolMeta.coveredDayCount ?? 0}일 포함</span><span>{poolMeta.generatedAt || meta.mtime ? `갱신 ${formatDate(poolMeta.generatedAt || meta.mtime)}` : "갱신 시각 없음"}</span><span>{scheduler ? `정기 뉴스 피드 ${scheduler.state === "running" ? "실행 중" : scheduler.state === "idle" ? "대기" : scheduler.state || "상태 미상"}` : "정기 뉴스 피드 꺼짐"}</span><span>{codexStatus?.available ? `AI 선별 도구 ${codexStatus.version || "연결됨"}${codexStatus.model ? ` · ${codexStatus.model}` : ""}` : "AI 선별 도구 사용 불가"}</span></div>
				{analysis?.ok && <div className={styles.aiNotice}>AI 제안(사람 승인 아님) · {analysis.generatedAt ? formatDate(analysis.generatedAt) : "완료"}</div>}
				{semanticMeta.poolSelectionMismatch && <div className={styles.aiNotice}>현재 풀에서 사라진 이전 후보 {semanticMeta.unavailableCount ?? 0}건은 숨겼습니다.</div>}
				{(feedbackMeta.exclusionCount ?? 0) > 0 && <div className={styles.aiNotice}>편집자 제외 학습 {feedbackMeta.exclusionCount}건 · 마지막 반영 {formatDate(feedbackMeta.updatedAt || undefined)} · 다음 수집과 AI 선별에 자동 적용</div>}
				{collection && <div className={styles.collectionLedger} aria-label="최근 뉴스 수집 결과"><span>모드 <b>{collection.mode === "backfill" ? "최초 30일 구축" : collection.mode === "incremental" ? "마지막 수집 이후 증분" : "현재 뉴스 피드"}</b></span><span>증분 시작 <b>{collection.incrementalSince ? formatDate(collection.incrementalSince) : "최초 구축"}</b></span><span>기존 URL / 신규 저장 <b>{collection.knownUrlCountBefore ?? 0} / {collection.newArticleCount ?? collection.currentCollected ?? 0}건</b></span><span>현재 뉴스 피드 신규 <b>{collection.currentCollected ?? collection.collected ?? "—"}건</b></span><span>과거 발견 / 조회 / 저장 <b>{collection.historicalDiscovered ?? 0} / {collection.historicalFetched ?? 0} / {collection.historicalSaved ?? 0}건</b></span><span>과거 수집 오류 <b>{collection.historicalErrorCount ?? 0}건</b></span><span>30일 기사 보관함 <b>{collection.archive?.totalArchiveCount ?? poolMeta.archiveCount ?? "—"}건</b></span><span>의미 선별 풀 <b>{collection.rollingPool ?? collection.pool ?? poolMeta.rowCount ?? "—"}건</b></span><span>제외 학습 적용 <b>{collection.feedbackExcluded ?? 0}건</b></span><time dateTime={collection.completedAt}>{collection.completedAt ? formatDate(collection.completedAt) : "완료 시각 없음"}</time></div>}
			</div>
		</details>
	</section>;
}
