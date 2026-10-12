import Link from "next/link";
import { notFound } from "next/navigation";
import {
	ArrowRight,
	CheckCircle2,
	ExternalLink,
	Flag,
	Link2,
	MessageSquareWarning,
	Scale,
} from "lucide-react";
import { newsroomProject } from "@/newsroom/project";
import { readProjectContext } from "@/newsroom/project-runtime";
import { NewsroomShell } from "../newsroom-shell";
import styles from "../newsroom.module.css";
import { PromotedDossierPage } from "./promoted-dossier-page";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	if (!slug) notFound();
	const project = await readProjectContext(slug);
	if (!project.canonical) return <PromotedDossierPage slug={slug} />;
	return <CanonicalResearchPage slug={slug} caseTitle={project.title} />;
}

function CanonicalResearchPage({ slug, caseTitle }: { slug: string; caseTitle: string }) {
	return (
		<NewsroomShell activeStep={0} projectSlug={slug} caseTitle={caseTitle}>
			<section className={styles.dossierHero}>
				<div>
					<p className={styles.eyebrow}>01 / RESEARCH DOSSIER</p>
					<h1>무엇을 알고,<br /><em>무엇을 아직 모르는가.</em></h1>
				</div>
				<aside className={styles.assignmentBrief}>
					<span>취재 주제</span>
					<p>{newsroomProject.topic}</p>
				</aside>
			</section>

			<div className={styles.dossierGrid}>
				<section className={styles.paperPanel} aria-labelledby="facts-heading">
					<div className={styles.panelHeading}>
						<span className={styles.panelNumber}>A</span>
						<div><p className={styles.eyebrow}>COMMON GROUND</p><h2 id="facts-heading">공통으로 확인된 사실</h2></div>
					</div>
					<ol className={styles.factList}>
						{newsroomProject.facts.map((fact, index) => (
							<li key={fact}><span>{String(index + 1).padStart(2, "0")}</span><p>{fact}</p><CheckCircle2 size={17} /></li>
						))}
					</ol>
				</section>

				<section className={styles.contradictionPanel} aria-labelledby="contradictions-heading">
					<div className={styles.panelHeading}>
						<span className={styles.panelNumber}>B</span>
						<div><p className={styles.eyebrow}>CONFLICT LOG / 03</p><h2 id="contradictions-heading">보도 간 불일치</h2></div>
					</div>
					<div className={styles.contradictionList}>
						{newsroomProject.contradictions.map((item, index) => (
							<article key={item.label}>
								<div className={styles.conflictTop}><span>C-{index + 1}</span><b>{item.label}</b><em>{item.status}</em></div>
								<div className={styles.conflictValues}><strong>{item.a}</strong><Scale size={16} /><strong>{item.b}</strong></div>
								<p>{item.note}</p>
							</article>
						))}
					</div>
				</section>
			</div>

			<section className={styles.sourceSection} aria-labelledby="sources-heading">
				<div className={styles.sectionHeading}>
					<div><p className={styles.eyebrow}>SOURCE LEDGER / 03</p><h2 id="sources-heading">수집 기사와 원문 링크</h2></div>
					<span className={styles.sourceRule}><Link2 size={14} /> 직접 링크만 보존</span>
				</div>
				<div className={styles.sourceList}>
					{newsroomProject.sources.map((source, index) => (
						<a key={source.url} href={source.url} target="_blank" rel="noreferrer" className={styles.sourceCard}>
							<span className={styles.sourceIndex}>S-{String(index + 1).padStart(2, "0")}</span>
							<div><p>{source.publisher} · {source.published}</p><h3>{source.title}</h3><small>{source.note}</small><code>{source.url}</code></div>
							<ExternalLink size={17} />
						</a>
					))}
				</div>
			</section>

			<div className={styles.followupGrid}>
				<section className={styles.followupPanel}>
					<div className={styles.panelHeading}><Flag size={19} /><div><p className={styles.eyebrow}>FOLLOW-UP CALLS</p><h2>후속 확인</h2></div></div>
					<ul>{newsroomProject.followUps.map((item) => <li key={item}>{item}</li>)}</ul>
				</section>
				<aside className={styles.sensitivePanel}>
					<div className={styles.panelHeading}><MessageSquareWarning size={19} /><div><p className={styles.eyebrow}>ATTRIBUTION RULE</p><h2>민감 정보 취급</h2></div></div>
					<ul>{newsroomProject.sensitiveNotes.map((item) => <li key={item}>{item}</li>)}</ul>
				</aside>
			</div>

			<div className={styles.pageActions}>
				<Link href="/news" className={styles.secondaryAction}>뉴스 목록</Link>
				<Link href={`/stories/${encodeURIComponent(slug)}/script`} className={styles.primaryAction}>대본 검토 <ArrowRight size={17} /></Link>
			</div>
		</NewsroomShell>
	);
}
