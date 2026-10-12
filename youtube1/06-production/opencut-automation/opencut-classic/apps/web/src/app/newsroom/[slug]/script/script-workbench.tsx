"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, FileCheck2, ShieldAlert, ShieldCheck } from "lucide-react";
import { newsroomProject, type ScriptState } from "@/newsroom/project";
import styles from "../../newsroom.module.css";

export function ScriptWorkbench({ slug, initialState }: { slug: string; initialState: ScriptState }) {
	const [research, setResearch] = useState<Record<string, unknown> | null>(null);

	useEffect(() => {
		void fetch(`/api/newsroom/projects/${encodeURIComponent(slug)}/research`, { cache: "no-store" })
			.then((response) => response.json())
			.then((value: unknown) => {
				if (value && typeof value === "object" && "snapshot" in value && value.snapshot && typeof value.snapshot === "object") {
					setResearch(value.snapshot as Record<string, unknown>);
				}
			})
			.catch(() => undefined);
	}, [slug]);

	return (
		<section className={styles.scriptPage} aria-labelledby="canonical-script-heading">
			<div className={styles.scriptResearchGrid}>
				<section className={`${styles.researchBlock} ${styles.evidenceBlock}`} aria-labelledby="confirmed-evidence-heading">
					<div className={styles.researchBlockHeading}>
						<span className={styles.blockNumber}>01</span>
						<div><p className={styles.eyebrow}>CONFIRMED REPORTING</p><h2 id="confirmed-evidence-heading">Confirmed evidence</h2></div>
					</div>
					<div className={styles.timelineList}>
						{newsroomProject.timeline.map((item) => <article key={item.period} className={styles.timelineItem}><span>{item.period}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}
					</div>
					<div className={styles.compactEvidence}>
						<div className={styles.subheading}><ShieldCheck size={15} /><b>Evidence map</b></div>
						{newsroomProject.evidence.slice(0, 3).map((item) => <p key={item.id}><strong>{item.id}</strong>{item.claim}</p>)}
					</div>
					<div className={styles.sourceLinks}>
						<div className={styles.subheading}><ExternalLink size={15} /><b>Sources</b></div>
						{newsroomProject.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}<ExternalLink size={12} /></a>)}
					</div>
				</section>

				<section className={`${styles.researchBlock} ${styles.legalBlock}`} aria-labelledby="analysis-heading">
					<div className={styles.researchBlockHeading}>
						<span className={styles.blockNumber}>02</span>
						<div><p className={styles.eyebrow}>ANALYSIS</p><h2 id="analysis-heading">Protection and legal gaps</h2></div>
					</div>
					<div className={styles.legalResearchGrid}>
						{newsroomProject.chargeGapResearch.map((item) => <article key={item.id} className={styles.legalCard}><div className={styles.legalCardBody}><p className={styles.legalWhy}><strong>{item.id} · {item.title}</strong>{item.currentProvisionalCharges}</p><p>{item.victimImpact}</p><p className={styles.safeSentence}>{item.caution}</p></div></article>)}
					</div>
					{research ? <p className={styles.blockIntro}>Latest research snapshot loaded: {typeof research.fetchedAt === "string" ? new Date(research.fetchedAt).toLocaleString("ko-KR") : "available"}.</p> : null}
				</section>

				<section className={`${styles.researchBlock} ${styles.scriptBlock}`} aria-labelledby="canonical-script-heading">
					<div className={styles.workflowHeading}>
						<div className={styles.researchBlockHeading}><span className={styles.blockNumber}>03</span><div><p className={styles.eyebrow}>CANONICAL SCRIPT</p><h2 id="canonical-script-heading">Final newsroom script</h2><p className={styles.blockIntro}>This script is pinned to the finalized production source and is read-only.</p></div></div>
						<div className={styles.finalBadge}><FileCheck2 size={18} /><span><b>FINAL LOCK</b><small>{initialState.finalizedAt ? new Date(initialState.finalizedAt).toLocaleString("ko-KR") : "Finalized"}</small></span></div>
					</div>
					<pre className={styles.scriptEditor} aria-readonly="true">{initialState.draft}</pre>
				</section>
			</div>

			<section className={styles.voiceGate} aria-label="Canonical script status">
				<ShieldAlert size={19} />
				<div><p className={styles.eyebrow}>READ-ONLY PRODUCTION SOURCE</p><p>The frontend does not offer alternate script selection or mutation.</p></div>
			</section>

			<div className={styles.pageActions}>
				<Link href={`/stories/${encodeURIComponent(slug)}/research`} className={styles.secondaryAction}><ArrowLeft size={16} /> Back to research</Link>
				<Link href={`/stories/${encodeURIComponent(slug)}/editor`} className={styles.primaryAction}>Review assets <ArrowRight size={17} /></Link>
			</div>
		</section>
	);
}
