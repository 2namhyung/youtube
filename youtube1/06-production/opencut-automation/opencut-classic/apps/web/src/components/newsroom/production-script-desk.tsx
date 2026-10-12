"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- validated API response is the server-owned desk contract */

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, CircleX, Clock3, FileKey2, Headphones, RefreshCw } from "lucide-react";
import type { DeskStatus, ProductionQaCheck, ProductionScriptDeskState } from "@/newsroom/production-script-desk";
import styles from "@/app/newsroom/newsroom.module.css";

const STATUS_LABEL: Record<DeskStatus, string> = { current: "CURRENT", stale: "STALE", missing: "MISSING", pass: "PASS", warning: "WARNING", fail: "FAIL" };
const STATUS_ICON = { pass: Check, warning: AlertTriangle, fail: CircleX } as const;

function shortHash(value: string | null) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "—"; }
function seconds(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(3)}초` : "—"; }
function detailLabel(detail: Record<string, unknown>) {
	const cue = typeof detail.cue === "number" ? `CUE ${String(detail.cue).padStart(2, "0")}` : String(detail.code ?? "DETAIL").toUpperCase();
	const range = typeof detail.start === "number" || typeof detail.end === "number" ? `${seconds(detail.start)} → ${seconds(detail.end)}` : null;
	return { cue, range };
}

function CheckStatus({ check }: { check: ProductionQaCheck | undefined }) {
	const status = check?.status ?? "fail";
	const Icon = STATUS_ICON[status];
	return <article className={styles.qaLedgerItem} data-status={status}>
		<header><span><Icon size={15} />{STATUS_LABEL[status]}</span><b>{check?.summary ?? "QA 결과가 없습니다."}</b></header>
		{check?.details.length ? <details><summary><ChevronDown size={14} /> 상세 진단 {check.details.length}건</summary><ol>{check.details.map((detail, index) => {
			const label = detailLabel(detail);
			return <li key={`${check.id}-${index}`}><div><strong>{label.cue}</strong>{label.range ? <time>{label.range}</time> : null}</div>{typeof detail.text === "string" ? <p>{detail.text}</p> : null}<code>{JSON.stringify(detail)}</code></li>;
		})}</ol></details> : null}
	</article>;
}

export function ProductionScriptDesk({ initialState }: { initialState: ProductionScriptDeskState }) {
	const [state, setState] = useState(initialState);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const byId = new Map(state.qa?.checks.map((check) => [check.id, check]) ?? []);
	const summaryItems = [
		["대본 ↔ 자막", byId.get("script-caption-integrity")],
		["자막 ↔ 음성", byId.get("caption-audio-timing")],
		["내레이션 원문", byId.get("narration-integrity")],
		["렌더 최신성", byId.get("render-freshness")],
	] as const;
	const refresh = async () => {
		setRefreshing(true); setError(null);
		try {
			const response = await fetch(`/api/newsroom/projects/${encodeURIComponent(state.slug)}/script-qa`, { method: "POST", cache: "no-store" });
			const value = await response.json() as ProductionScriptDeskState & { error?: string };
			if (!response.ok) throw new Error(value.error || "동기화와 QA 새로고침에 실패했습니다.");
			setState(value);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "동기화와 QA 새로고침에 실패했습니다."); }
		finally { setRefreshing(false); }
	};
	return <main className={styles.productionQaDesk} aria-labelledby="production-script-title">
		<header className={styles.productionQaMasthead}>
			<div><p>03 / AUTHORITATIVE SCRIPT CONTROL</p><h1 id="production-script-title">대본 검증 데스크</h1><span>제작 원본·자막·음성·렌더를 한 버전으로 묶어 확인합니다.</span></div>
			<div className={styles.productionQaActions}><Link href={`/stories/${encodeURIComponent(state.slug)}/script?mode=workflow`}>워크플로 초안 편집</Link><button type="button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? styles.spin : undefined} />{refreshing ? "검증 중" : "동기화 / QA 새로고침"}</button></div>
		</header>

		<section className={styles.bindingStrip} aria-label="Production script binding">
			<div><span>SYNC STATE</span><strong data-status={state.syncStatus}>{STATUS_LABEL[state.syncStatus]}</strong></div>
			<div><span>PRODUCTION PROJECT</span><b>{state.productionProjectId}</b></div>
			<div><span>AUTHORITATIVE SHA</span><code title={state.authority.draftSha256}>{shortHash(state.authority.draftSha256)}</code></div>
			<div><span>LATEST HANDOFF</span><b>{state.artifact.versionId ?? "없음"}</b></div>
		</section>
		{state.syncReasons.length ? <aside className={styles.syncAlert} role="alert"><AlertTriangle size={18} /><div><b>현재 메타데이터는 권위 원본과 같은 버전이 아닙니다.</b>{state.syncReasons.map((reason) => <p key={reason}>{reason}</p>)}</div></aside> : null}
		{error ? <aside className={styles.syncAlert} role="alert"><CircleX size={18} /><div><b>새로고침 실패</b><p>{error}</p></div></aside> : null}

		<section className={styles.qaSummaryRail} aria-label="QA summary">
			{summaryItems.map(([label, check]) => { const status = state.syncStatus === "current" ? check?.status ?? "fail" : "fail"; const Icon = STATUS_ICON[status]; return <div key={label} data-status={status}><span><Icon size={15} />{label}</span><b>{state.syncStatus === "current" ? STATUS_LABEL[status] : "STALE"}</b><small>{check?.summary ?? "검증 없음"}</small></div>; })}
		</section>

		<div className={styles.productionQaGrid}>
			<section className={styles.authoritySheet} aria-labelledby="authority-copy-heading">
				<header><div><p>AUTHORITATIVE COPY</p><h2 id="authority-copy-heading">제작 권위 대본</h2></div><FileKey2 size={24} /></header>
				<dl><div><dt>경로</dt><dd>{state.authority.path}</dd></div><div><dt>확정</dt><dd>{state.authority.finalizedAt ? new Date(state.authority.finalizedAt).toLocaleString("ko-KR") : "—"}</dd></div><div><dt>복원</dt><dd>{state.authority.restorationStatus}</dd></div><div><dt>초안</dt><dd>{state.authority.selectedDraftId ?? "—"}</dd></div></dl>
				<pre aria-label="정확한 권위 대본" aria-readonly="true">{state.authority.draft}</pre>
			</section>
			<aside className={styles.versionColumn}>
				<section><p>VERSION BINDING</p><h2>현재 결합</h2><dl><div><dt>대본 SHA</dt><dd><code>{shortHash(state.authority.draftSha256)}</code></dd></div><div><dt>Handoff SHA</dt><dd><code>{shortHash(state.artifact.handoffSha256)}</code></dd></div><div><dt>Release</dt><dd>{state.artifact.releaseStatus ?? "—"} / {state.artifact.publishable ? "publishable" : "blocked"}</dd></div><div><dt>QA 생성</dt><dd>{state.qa?.generatedAt ? new Date(state.qa.generatedAt).toLocaleString("ko-KR") : "—"}</dd></div></dl></section>
				<section data-warning={!state.workflow.matchesAuthority}><p>EDIT PRECEDENCE</p><h2>의도한 편집 보존</h2><p>명시된 production authority가 화면의 원본입니다. newsroom workflow와 다른 내용은 덮어쓰지 않고 별도 버전으로 보존합니다.</p><strong>{state.workflow.matchesAuthority ? "workflow와 일치" : "workflow와 다름 · 자동 덮어쓰기 없음"}</strong></section>
				{state.conflicts.length ? <section data-warning><p>AUTHORITY CONFLICT</p><h2>다른 권위 후보 {state.conflicts.length}개</h2>{state.conflicts.map((item, index) => <small key={index}>{String(item.projectId)}<br /><code>{shortHash(typeof item.draftSha256 === "string" ? item.draftSha256 : null)}</code></small>)}</section> : null}
			</aside>
		</div>

		<section className={styles.draftHistoryDesk} aria-labelledby="draft-history-heading">
			<header><div><p>WORKFLOW DRAFT HISTORY</p><h2 id="draft-history-heading">초안 4개 비교 · 선택 이력</h2></div><span>{state.workflow.variants.length} DRAFTS · READ ONLY</span></header>
			<p className={styles.draftHistoryNotice}>workflow JSON에 보존된 과거 초안입니다. 현재 제작 권위 확정본과 자동으로 섞거나 덮어쓰지 않습니다. 선택 또는 승격은 명시적인 사용자 액션과 creator 검증이 필요합니다.</p>
			<div className={styles.draftHistoryGrid}>{state.workflow.variants.map((variant, index) => <article key={variant.id} data-selected={variant.selected}>
				<header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{variant.label}</h3><p>{variant.description}</p></div>{variant.selected ? <strong>당시 선택됨</strong> : null}</header>
				<code title={variant.draftSha256}>{shortHash(variant.draftSha256)}</code>
				<details><summary><ChevronDown size={14} /> 초안 전문 보기</summary><pre aria-readonly="true">{variant.draft}</pre></details>
			</article>)}</div>
		</section>

		<section className={styles.qaLedger} aria-labelledby="qa-ledger-heading">
			<header><div><p>QA LEDGER</p><h2 id="qa-ledger-heading">시점별 검증 기록</h2></div><span data-status={state.qa?.status ?? "fail"}>{state.qa ? `${state.qa.failures} FAIL · ${state.qa.warnings} WARNING · ${state.qa.passes} PASS` : "MISSING"}</span></header>
			<CheckStatus check={byId.get("script-caption-integrity")} />
			<CheckStatus check={byId.get("caption-structure")} />
			<CheckStatus check={byId.get("caption-audio-timing")} />
			<CheckStatus check={byId.get("narration-integrity")} />
			<CheckStatus check={byId.get("asr-diagnostic")} />
			<CheckStatus check={byId.get("render-freshness")} />
		</section>
		<footer className={styles.humanGate}><Headphones size={21} /><div><p>HUMAN LISTENING GATE</p><b>자동 검증은 샘플 단위 동기와 자연스러움을 보증하지 않습니다.</b><span>최신 exact 렌더 전체를 사람이 듣고 음색·발음·호흡·자막 체감을 승인하기 전에는 release가 차단됩니다.</span></div><Clock3 size={18} /></footer>
	</main>;
}
