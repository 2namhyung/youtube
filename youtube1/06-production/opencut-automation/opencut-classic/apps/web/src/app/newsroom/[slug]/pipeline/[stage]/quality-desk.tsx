"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import styles from "../../../newsroom.module.css";

type Finding = { id: string; reason?: string; claim?: string };
type Check = {
	id: string;
	category: string;
	label: string;
	status: "passed" | "warning" | "failed" | "blocked" | "pending";
	evidence: unknown;
};
type Report = {
	generatedAt: string;
	versionId: string;
	status: "approved" | "blocked";
	publishable: boolean;
	checks: Check[];
	blockers: Finding[];
	warnings?: Finding[];
	approval?: { versionId: string; renderRegistrySha256: string; scriptSha256: string; reviewer: string; approvedAt: string } | null;
};

function statusLabel(status: Check["status"]) {
	if (status === "passed") return "통과";
	if (status === "warning") return "주의";
	if (status === "pending") return "사람 최종 재생 승인 대기";
	return "차단";
}

export function QualityDesk({ slug }: { slug: string }) {
	const [report, setReport] = useState<Report | null>(null);
	const [loading, setLoading] = useState(true);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		void fetch(`/api/newsroom/projects/${slug}/quality`, { cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) throw new Error(`QA report HTTP ${response.status}`);
				return response.json();
			})
			.then((value: unknown) => {
				if (!active || typeof value !== "object" || value === null || !("report" in value)) return;
				setReport(value.report as Report | null);
			})
			.catch((value: unknown) => {
				if (active) setError(value instanceof Error ? value.message : "QA 보고서를 불러오지 못했습니다.");
			})
			.finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [slug]);

	async function runAudit() {
		setRunning(true);
		setError("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/quality`, { method: "POST" });
			const value = await response.json() as { report?: Report; error?: string };
			if (!response.ok || !value.report) throw new Error(value.error || `QA audit HTTP ${response.status}`);
			setReport(value.report);
		} catch (value) {
			setError(value instanceof Error ? value.message : "QA 실행에 실패했습니다.");
		} finally {
			setRunning(false);
		}
	}

	async function approvePlayback() {
		setRunning(true);
		setError("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/quality`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "approve", reviewer: "local-owner" }),
			});
			const value = await response.json() as { report?: Report; error?: string };
			if (!response.ok || !value.report) throw new Error(value.error || `QA approval HTTP ${response.status}`);
			setReport(value.report);
		} catch (value) {
			setError(value instanceof Error ? value.message : "최종 재생 승인에 실패했습니다.");
		} finally {
			setRunning(false);
		}
	}

	return (
		<section className={styles.qualityDesk} aria-labelledby="quality-desk-heading">
			<header className={styles.qualityDeskHeader}>
				<div>
					<p className={styles.eyebrow}>PRACTICAL RELEASE AUDIT</p>
					<h2 id="quality-desk-heading">실제 게시 위험과 권고 사항을 구분합니다</h2>
					<p>현재 렌더의 기술·권리·사실·사람 검수를 확인하고, 차단과 주의를 별도로 표시합니다.</p>
				</div>
					<button type="button" onClick={runAudit} disabled={running}>
					{running ? <LoaderCircle className={styles.spin} size={15} /> : <RefreshCw size={15} />}
					{running ? "감사 실행 중" : "현재 버전 재감사"}
				</button>
				{report && report.checks.some((check) => check.id === "human-playback-approval" && check.status === "pending") && report.blockers.every((blocker) => blocker.id === "human-playback-approval-required") && (
					<button type="button" onClick={approvePlayback} disabled={running}>
						<ShieldCheck size={15} /> 최종 영상 확인 완료
					</button>
				)}
			</header>
			{loading && <div className={styles.qualityNotice}><LoaderCircle className={styles.spin} size={16} /> QA 보고서를 불러오는 중</div>}
			{error && <div className={styles.qualityError}><CircleAlert size={16} /> {error}</div>}
			{!loading && !error && !report && <div className={styles.qualityNotice}>아직 감사 보고서가 없습니다. 현재 버전을 재감사하세요.</div>}
			{report && (
				<>
					<div className={styles.qualitySummary} data-approved={report.publishable}>
						<ShieldCheck size={20} />
						<div><b>{report.publishable ? "게시 승인" : report.checks.some((check) => check.id === "human-playback-approval" && check.status === "pending") ? "사람 최종 재생 승인 대기" : "확인 필요"}</b><p>버전 {report.versionId} · {new Date(report.generatedAt).toLocaleString("ko-KR")}</p></div>
					</div>
					<div className={styles.qualityGrid}>
						{report.checks.map((check) => (
							<article key={check.id} data-status={check.status}>
								{check.status === "passed" ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
								<div><span>{check.category}</span><h3>{check.label}</h3><p>{statusLabel(check.status)}</p></div>
							</article>
						))}
					</div>
					{!!report.warnings?.length && (
						<div className={styles.qualityWarnings}>
							<b>업로드를 막지 않는 주의 사항</b>
							<ul>{report.warnings.map((warning) => <li key={warning.id}><code>{warning.id}</code><span>{warning.claim || warning.reason || "게시 전 확인을 권장합니다."}</span></li>)}</ul>
						</div>
					)}
					{!!report.blockers.length && (
						<div className={styles.qualityBlockers}>
							<b>남은 차단 사유</b>
							<ul>{report.blockers.map((blocker) => <li key={blocker.id}><code>{blocker.id}</code><span>{blocker.claim || blocker.reason || "검토가 필요합니다."}</span></li>)}</ul>
						</div>
					)}
				</>
			)}
		</section>
	);
}
