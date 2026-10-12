"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, react-hooks/set-state-in-effect -- API payloads are narrowed before projection; the effect synchronizes three persisted project resources. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, FileSearch2, LoaderCircle, RefreshCw, Scale } from "lucide-react";
import { NewsroomShell } from "../newsroom-shell";
import styles from "../newsroom.module.css";

type JsonRecord = Record<string, unknown>;
type Article = { title?: string; publisher?: string; source?: string; url?: string; date?: string; publishedAt?: string; status?: string; snippet?: string; kind?: string; mediaType?: string; relationshipReason?: string };
type Claim = { id?: string; summary?: string; date?: string; field?: string; perspective?: string; confidence?: string; followUp?: boolean; sourceIds?: string[]; agreement?: { sourceCount?: number; independentPublisherCount?: number } };
type DetailSection = { id?: string; title?: string; description?: string; claims?: Claim[] };
type SourceIndex = Article & { sourceId?: string; bucket?: string };
type EventDossier = {
	schemaVersion?: number;
	confirmedFacts?: Claim[];
	timeline?: Claim[];
	investigationAndCharges?: Claim[];
	trialStagesAndSentenceChanges?: Claim[];
	prosecutionClaims?: Claim[];
	defenseClaims?: Claim[];
	courtFindings?: Claim[];
	victimImpact?: Claim[];
	laterChanges?: Claim[];
	conflicts?: Array<{ field?: string; values?: string[]; note?: string; sourceIds?: string[] }>;
	unknowns?: string[];
	sourceIndex?: SourceIndex[];
	narrative?: { overview?: Claim[]; chronology?: Claim[]; sameEventFindings?: Claim[]; priorContext?: Claim[]; followUpDevelopments?: Claim[]; detailSections?: DetailSection[]; limitations?: string[] };
	sourceCoverage?: { verifiedSourceCount?: number; representativeSourceCount?: number; sameEventCoverageCount?: number; priorContextCount?: number; followUpCount?: number; independentPublisherCount?: number; corroboration?: string };
	readiness?: { readyForLegal?: boolean; readyForDraft?: boolean; detailedNarrativeComplete?: boolean; storyClaimCount?: number; narrativePhaseCount?: number; blockers?: string[]; warnings?: string[] };
};
type Snapshot = { fetchedAt?: string; sources?: Article[]; relatedCoverage?: Article[]; priorContext?: Article[]; followUps?: Article[]; laws?: Article[]; eventDossier?: EventDossier; counts?: Record<string, number> };
type Project = { id: string; slug?: string; title: string; source: string; url: string; publishedAt?: string; hook?: string; rationale?: string; approval?: { approvedAt?: string } };
type LegalReview = {
	schemaVersion?: number;
	caseDispositionReview?: { status?: string; question?: string; assessment?: string; limitations?: string[]; similarCases?: Array<{ title?: string; url?: string; court?: string; caseNumber?: string; legalPrinciple?: string; comparison?: string }> };
	videoUseReview?: { status?: string; decision?: string; question?: string; allowedUse?: string[]; conditions?: string[]; prohibitedUse?: string[]; reasons?: string[] };
	scriptWritingReview?: { status?: string; decision?: string; question?: string; required?: string[]; avoid?: string[]; safePhrasing?: string[] };
	reviewCompletion?: { caseDisposition?: boolean; videoUse?: boolean; scriptWriting?: boolean; allComplete?: boolean };
};
type Workflow = { title?: string; stages?: Record<string, { status?: string; reason?: string }>; legalContextReport?: LegalReview };

function record(value: unknown): value is JsonRecord { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function rows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function formatDate(value?: string) { if (!value) return "날짜 미상"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function claimKey({ claim, index }: { claim: Claim; index: number }) { return claim.id || `${claim.date || "undated"}-${claim.summary || index}`; }
function bucketLabel(bucket?: string) { return bucket === "same-event" ? "동일 사건 보도" : bucket === "prior-context" ? "사건 이전 맥락" : bucket === "follow-up" ? "사건 이후 후속 보도" : "사건 대표 보도"; }
function statusLabel(value?: string) { return value === "complete" ? "완료" : value === "incomplete" ? "보강 필요" : value || "대기"; }
function readinessLabel(value: string) { return value === "verified-representative-source-required" ? "검증된 대표 기사 본문이 필요합니다." : value === "at-least-four-event-claims-required" ? "사건 전개를 구성할 확인 사실이 최소 4개 필요합니다." : value === "event-progression-required" ? "발생 뒤 발견·피해·수사·처분 중 다음 단계가 확인돼야 합니다." : value; }

function ClaimList({ claims, sources }: { claims?: Claim[]; sources: Map<string, SourceIndex> }) {
	if (!claims?.length) return <p className={styles.historyMuted}>확인된 내용이 없습니다.</p>;
	return <ul className={styles.deepClaimList}>{claims.map((claim, index) => {
		const evidence = rows<string>(claim.sourceIds).map((id) => sources.get(id)).filter((item): item is SourceIndex => Boolean(item));
		return <li key={claimKey({ claim, index })}><p>{claim.summary}</p><div><span>{claim.date || "날짜 확인 중"}</span><span>{claim.confidence === "corroborated" ? "복수 출처 교차확인" : "단일 출처"}</span><span>근거 {claim.agreement?.sourceCount || evidence.length}건</span></div>{evidence.length > 0 && <small>{evidence.map((source) => source.publisher || source.source || source.title).filter(Boolean).join(" · ")}</small>}</li>;
	})}</ul>;
}

function DetailSectionGrid({ sections, sources }: { sections?: DetailSection[]; sources: Map<string, SourceIndex> }) {
	if (!sections?.length) return null;
	return <section className={styles.dossierDetailDesk} aria-labelledby="dossier-detail-heading"><header><span>사건 해부</span><div><h3 id="dossier-detail-heading">왜 시작됐고, 어떻게 실행됐으며, 무엇이 달라졌나</h3><p>동기와 직접 계기부터 피해·재판 결과까지 기사에서 확인된 세부 사실을 단계별로 분리했습니다.</p></div></header><div>{sections.map((section, index) => <article key={section.id || section.title || index}><header><em>{String(index + 1).padStart(2, "0")}</em><div><h4>{section.title}</h4><p>{section.description}</p></div></header><ClaimList claims={section.claims} sources={sources} /></article>)}</div></section>;
}

function SourceGroup({ title, description, articles }: { title: string; description: string; articles: Article[] }) {
	return <section className={styles.researchSourceGroup}><header><h3>{title}</h3><span>{articles.length}건</span></header><p>{description}</p>{articles.length ? <ul>{articles.map((article, index) => <li key={`${article.url || article.title}-${index}`}><div><b>{article.title || "제목 미상"}</b><small>{article.publisher || article.source || "출처 미상"} · {formatDate(article.date || article.publishedAt)}</small>{article.relationshipReason && <p>{article.relationshipReason}</p>}</div>{article.url && <a href={article.url} target="_blank" rel="noreferrer noopener">원문 <ArrowUpRight size={13} /></a>}</li>)}</ul> : <div className={styles.researchGap}>관련성을 검증할 수 있는 자료를 찾지 못했습니다. 빈칸을 추정으로 채우지 않습니다.</div>}</section>;
}

function LegalCard({ index, title, review, children }: { index: string; title: string; review?: { status?: string; question?: string }; children: React.ReactNode }) {
	return <article className={styles.legalReviewCard}><header><span>{index}</span><div><h3>{title}</h3><p>{review?.question}</p></div><b data-status={review?.status}>{statusLabel(review?.status)}</b></header>{children}</article>;
}

export function PromotedDossierPage({ slug }: { slug: string }) {
	const [project, setProject] = useState<Project | null>(null);
	const [research, setResearch] = useState<Snapshot | null>(null);
	const [workflow, setWorkflow] = useState<Workflow | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const loadAll = useCallback(async () => {
		const [newsResponse, researchResponse, workflowResponse] = await Promise.all([
			fetch("/api/newsroom?adapters=local-research-radar&limit=1", { cache: "no-store" }),
			fetch(`/api/newsroom/projects/${encodeURIComponent(slug)}/research`, { cache: "no-store" }),
			fetch(`/api/newsroom/projects/${encodeURIComponent(slug)}/workflow`, { cache: "no-store" }),
		]);
		const news: unknown = await newsResponse.json();
		const researchBody: unknown = await researchResponse.json();
		const workflowBody: unknown = await workflowResponse.json();
		if (!newsResponse.ok || !record(news)) throw new Error(record(news) && typeof news.error === "string" ? news.error : "선택한 사건을 불러오지 못했습니다.");
		const dossiers = record(news.researchDossiers) ? rows<Project>(news.researchDossiers.dossiers) : [];
		const projects = rows<JsonRecord>(news.projects);
		const selected = dossiers.find((item) => item.slug === slug || item.id === slug) || (() => { const item = projects.find((candidate) => candidate.slug === slug); if (!item) return null; const candidate = record(item.candidate) ? item.candidate : item; return { ...candidate, id: typeof candidate.id === "string" ? candidate.id : slug, slug, title: String(candidate.title || item.title || slug), source: String(candidate.source || item.source || "출처 미상"), url: String(candidate.url || item.url || "") } as Project; })();
		if (!selected) throw new Error("선택한 사건 레코드가 없습니다.");
		setProject(selected);
		if (researchResponse.ok && record(researchBody) && record(researchBody.snapshot)) setResearch(researchBody.snapshot as Snapshot);
		if (workflowResponse.ok && record(workflowBody)) setWorkflow(workflowBody as Workflow);
	}, [slug]);

	useEffect(() => { let cancelled = false; void loadAll().catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [loadAll]);

	const runDeepResearch = async () => {
		setBusy(true); setError(null); setNotice("동일 사건·사전 맥락·후속 보도를 다시 수집하고 있습니다.");
		try {
			const researchResponse = await fetch(`/api/newsroom/projects/${encodeURIComponent(slug)}/research`, { method: "POST" });
			const researchBody: unknown = await researchResponse.json();
			if (!researchResponse.ok || !record(researchBody) || !record(researchBody.snapshot)) throw new Error(record(researchBody) && typeof researchBody.error === "string" ? researchBody.error : "심층 조사에 실패했습니다.");
			const refreshed = researchBody.snapshot as Snapshot;
			setResearch(refreshed);
			if (refreshed.eventDossier?.readiness?.readyForLegal !== true || refreshed.eventDossier?.readiness?.readyForDraft !== true) {
				setNotice("기사 본문과 사건 전개가 충분하지 않아 법률 검토와 대본 생성을 중단했습니다. 표시된 조사 빈칸을 먼저 보강해야 합니다.");
				return;
			}
			setNotice("사건 기록을 고정했습니다. 유사 판례·영상 활용·대본 주의사항을 순서대로 검토합니다.");
			const legalResponse = await fetch(`/api/newsroom/projects/${encodeURIComponent(slug)}/workflow`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate-legal" }) });
			const legalBody: unknown = await legalResponse.json();
			if (!legalResponse.ok || !record(legalBody)) throw new Error(record(legalBody) && typeof legalBody.error === "string" ? legalBody.error : "법률 검토에 실패했습니다.");
			setWorkflow(legalBody as Workflow);
			setNotice(record(legalBody.legalContextReport) && record(legalBody.legalContextReport.reviewCompletion) && legalBody.legalContextReport.reviewCompletion.allComplete === true ? "심층 조사와 세 가지 법률 검토가 모두 완료됐습니다." : "사건 기록은 작성됐지만 법률 검토 결과를 완성하지 못했습니다.");
		} catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
	};

	const dossier = research?.eventDossier;
	const sources = useMemo(() => new Map(rows<SourceIndex>(dossier?.sourceIndex).map((source) => [String(source.sourceId), source])), [dossier]);
	const legal = workflow?.legalContextReport;
	const storyReady = dossier?.readiness?.readyForLegal === true && dossier?.readiness?.readyForDraft === true && dossier?.readiness?.detailedNarrativeComplete === true;
	const legalComplete = storyReady && legal?.reviewCompletion?.allComplete === true;
	if (loading) return <NewsroomShell activeStep={0} caseTitle="사건 자료를 불러오는 중" caseCode="RESEARCH" projectSlug={slug}><div className={styles.intakeState}><LoaderCircle className={styles.spin} size={22} /> 조사 기록을 여는 중입니다.</div></NewsroomShell>;
	if (!project) return <NewsroomShell activeStep={0} caseTitle="사건을 찾을 수 없음" caseCode="RESEARCH" projectSlug={slug}><div className={styles.intakeState} role="alert"><CircleAlert size={22} />{error || "사건 레코드가 없습니다."}</div></NewsroomShell>;

	return <NewsroomShell activeStep={0} caseTitle={project.title} caseCode="RESEARCH" projectSlug={slug}>
		<section className={styles.intakeHero}><div><p className={styles.eyebrow}>01 / 심층 사건 조사</p><span className={styles.intakeStatus}><FileSearch2 size={14} /> 출처 기반 기록</span><h1>{project.title}</h1><p>{project.hook || project.rationale || "선택한 보도를 출발점으로 동일 사건과 전후 맥락을 검증합니다."}</p></div><aside><span>선택한 대표 보도</span><b>{project.source}</b><time>{formatDate(project.publishedAt || project.approval?.approvedAt)}</time><small>기사 목록이 아니라 하나의 사건 기록으로 재구성합니다.</small></aside></section>
		<section className={styles.intakeResearchDesk}>
			<header><div><p className={styles.eyebrow}>DEEP RESEARCH</p><h2>사건의 전후 맥락과 법률 판단까지 한 번에 검증합니다</h2><p>동일 사건, 사건 이전 맥락, 이후 후속 보도를 분리하고 출처별 일치·불일치와 빈칸을 기록합니다.</p></div><button className={styles.primaryAction} type="button" disabled={busy} aria-busy={busy} onClick={() => void runDeepResearch()}>{busy ? <LoaderCircle className={styles.spin} size={16} /> : <RefreshCw size={16} />}{busy ? "조사·검토 중" : research ? "심층 조사 다시 실행" : "심층 조사 시작"}</button></header>
			{error && <div className={styles.researchCollectionError} role="alert"><CircleAlert size={16} /> {error}</div>}{notice && <div className={styles.researchCollectionNotice} role="status" aria-live="polite">{busy ? <LoaderCircle className={styles.spin} size={16} /> : <CheckCircle2 size={16} />}{notice}</div>}
			{dossier ? <>
				{!storyReady && <section className={styles.researchCollectionError} role="alert"><CircleAlert size={18} /><div><b>사건 흐름이 충분하지 않아 법률 검토와 대본 생성을 차단했습니다.</b><p>확인 사실 {dossier.readiness?.storyClaimCount || 0}개 · 전개 단계 {dossier.readiness?.narrativePhaseCount || 0}개</p><ul>{(dossier.readiness?.blockers || []).map((item) => <li key={item}>{readinessLabel(item)}</li>)}</ul></div></section>}
				<section className={styles.historyRecord} aria-labelledby="deep-record-heading"><header className={styles.historyRecordHeader}><div><p className={styles.eyebrow}>사건 심층 조사 기록</p><h2 id="deep-record-heading">확인된 사실, 시간 흐름, 출처의 차이를 세부 기록합니다</h2><p>각 문장은 어느 출처에서 확인됐고 서로 몇 개 매체가 일치하는지 함께 표시합니다.</p></div><div className={styles.historyCoverage}><span>검증 출처 {dossier.sourceCoverage?.verifiedSourceCount || 0}</span><span>독립 매체 {dossier.sourceCoverage?.independentPublisherCount || 0}</span><span>동일 사건 {dossier.sourceCoverage?.sameEventCoverageCount || 0}</span><span>사전 맥락 {dossier.sourceCoverage?.priorContextCount || 0}</span><span>후속 {dossier.sourceCoverage?.followUpCount || 0}</span></div></header>
					<section className={styles.deepResearchSection}><h3>사건 개요와 확인된 핵심 사실</h3><ClaimList claims={dossier.narrative?.overview || dossier.confirmedFacts} sources={sources} /></section>
					<DetailSectionGrid sections={dossier.narrative?.detailSections} sources={sources} />
					<div className={styles.researchSourceGrid}><SourceGroup title="동일 사건 보도" description="같은 행위·당사자·시점·장소를 다루는 독립 보도입니다." articles={[...(research?.sources || []), ...(research?.relatedCoverage || [])]} /><SourceGroup title="사건 이전 맥락" description="사건이 벌어지기 전 직접 관련된 분쟁·수사·절차만 포함합니다." articles={research?.priorContext || []} /><SourceGroup title="사건 이후 후속 보도" description="수사, 기소, 재판, 합의, 처분처럼 사건 이후 실제로 달라진 내용입니다." articles={research?.followUps || []} /></div>
					<section className={styles.deepResearchSection}><h3>시간순 사건 기록</h3><ClaimList claims={dossier.narrative?.chronology || dossier.timeline} sources={sources} /></section>
					<section className={styles.editorialComparisons}><div className={styles.editorialComparison}><h3>수사·검찰의 주장</h3><ClaimList claims={[...(dossier.investigationAndCharges || []), ...(dossier.prosecutionClaims || [])]} sources={sources} /></div><div className={styles.editorialComparison}><h3>피고인·당사자 측 입장</h3><ClaimList claims={dossier.defenseClaims} sources={sources} /></div><div className={styles.editorialComparison}><h3>법원 또는 공식 판단</h3><ClaimList claims={[...(dossier.courtFindings || []), ...(dossier.trialStagesAndSentenceChanges || [])]} sources={sources} /></div></section>
					<section className={styles.deepResearchSection}><h3>피해와 영향</h3><ClaimList claims={dossier.victimImpact} sources={sources} /></section>
					<section className={styles.uncertaintySection}><h3>출처가 충돌하거나 아직 확인되지 않은 내용</h3>{(dossier.conflicts || []).length || (dossier.unknowns || []).length ? <ul>{(dossier.conflicts || []).map((item, index) => <li key={`${item.field}-${index}`}><b>{item.field || "불일치 항목"}</b>: {(item.values || []).join(" / ")}{item.note ? ` — ${item.note}` : ""}</li>)}{(dossier.unknowns || []).map((item) => <li key={item}>{item}</li>)}</ul> : <p>현재 수집 범위에서 별도 불일치가 확인되지 않았습니다.</p>}{(dossier.narrative?.limitations || []).length > 0 && <ul>{dossier.narrative?.limitations?.map((item) => <li key={item}>{item}</li>)}</ul>}</section>
					<details className={styles.sourceLedger}><summary>검증 출처 원문과 사건 관계 보기 ({dossier.sourceIndex?.length || 0})</summary><ul>{(dossier.sourceIndex || []).map((source) => <li key={source.sourceId || source.url}><span>{bucketLabel(source.bucket)}</span><div><b>{source.title || "제목 미상"}</b><small>{source.publisher || source.source || "출처 미상"} · {formatDate(source.date || source.publishedAt)}</small>{source.relationshipReason && <p>{source.relationshipReason}</p>}</div>{source.url && <a href={source.url} target="_blank" rel="noreferrer noopener">원문 <ArrowUpRight size={13} /></a>}</li>)}</ul></details>
				</section>
				<section className={styles.legalReviewDesk} aria-labelledby="legal-review-heading"><header><div><p className={styles.eyebrow}>02 / 법률 검토</p><h2 id="legal-review-heading">사건 기록이 끝난 뒤 세 가지 판단을 모두 완료합니다</h2></div><span data-complete={legalComplete}>{legalComplete ? "검토 완료" : "검토 보강 필요"}</span></header>
					<LegalCard index="01" title="사건 처리와 유사 사례 비교" review={legal?.caseDispositionReview}><p>{legal?.caseDispositionReview?.assessment || "유사 판례 확인 결과가 없습니다."}</p>{(legal?.caseDispositionReview?.similarCases || []).map((item) => <div className={styles.precedentRow} key={item.url || item.title}><div><b>{item.title}</b><small>{[item.court, item.caseNumber].filter(Boolean).join(" · ")}</small><p>{item.legalPrinciple}</p><p>{item.comparison}</p></div>{item.url && <a href={item.url} target="_blank" rel="noreferrer noopener">판례 원문 <ArrowUpRight size={13} /></a>}</div>)}{(legal?.caseDispositionReview?.limitations || []).length > 0 && <><h4>검토 한계</h4><ul>{legal?.caseDispositionReview?.limitations?.map((item) => <li key={item}>{item}</li>)}</ul></>}</LegalCard>
					<LegalCard index="02" title="영상 소재 활용 가능성" review={legal?.videoUseReview}><p><b>판단:</b> {legal?.videoUseReview?.decision || "대기"}</p><h4>허용되는 활용</h4><ul>{(legal?.videoUseReview?.allowedUse || []).map((item) => <li key={item}>{item}</li>)}</ul><h4>금지·제한</h4><ul>{[...(legal?.videoUseReview?.conditions || []), ...(legal?.videoUseReview?.prohibitedUse || [])].map((item) => <li key={item}>{item}</li>)}</ul></LegalCard>
					<LegalCard index="03" title="대본 작성 시 주의점과 금지사항" review={legal?.scriptWritingReview}><h4>반드시 지킬 것</h4><ul>{(legal?.scriptWritingReview?.required || []).map((item) => <li key={item}>{item}</li>)}</ul><h4>피할 것</h4><ul>{(legal?.scriptWritingReview?.avoid || []).map((item) => <li key={item}>{item}</li>)}</ul></LegalCard>
				</section>
			</> : <div className={styles.researchCollectionEmpty}><FileSearch2 size={22} /><div><b>아직 상세 사건 기록이 없습니다.</b><p>심층 조사를 실행하면 동일 사건·전후 보도와 출처별 근거를 수집합니다.</p></div></div>}
		</section>
		<footer className={styles.pageActions}><Link className={styles.secondaryAction} href="/news"><ArrowLeft size={15} /> 뉴스 목록</Link>{legalComplete ? <Link className={styles.primaryAction} href={`/stories/${encodeURIComponent(slug)}/script`}>검토 결과로 대본 작성 <ArrowUpRight size={15} /></Link> : <span className={styles.disabledAction} aria-disabled="true"><Scale size={15} /> 세 가지 법률 검토가 끝나야 대본 작성 가능</span>}</footer>
	</NewsroomShell>;
}
