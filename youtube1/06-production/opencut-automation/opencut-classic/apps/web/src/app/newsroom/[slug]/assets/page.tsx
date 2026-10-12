import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, ExternalLink, Film, LockKeyhole, Search, ShieldAlert } from "lucide-react";
import { newsroomProject } from "@/newsroom/project";
import { readProjectContext } from "@/newsroom/project-runtime";
import { getLatestRender } from "@/app/api/renders/registry";
import { NewsroomShell } from "../../newsroom-shell";
import { EditorHandoff } from "./editor-handoff";
import { MediaDesk } from "./media-desk";
import { GenericPipelineWorkbench } from "../generic-pipeline-workbench";
import { BgmDesk } from "../pipeline/[stage]/bgm-desk";
import styles from "../../newsroom.module.css";

export const dynamic = "force-dynamic";

const canonicalAiAssets = [
	"canonical-v2-scene-01-hook.png", "canonical-v2-scene-02-intrusion.png", "canonical-v2-scene-03-tumbler.png",
	"canonical-v2-scene-04-forensic.png", "canonical-v2-scene-05-chair.png", "canonical-v2-scene-06-cctv.png",
	"canonical-v2-scene-07-suspect.png", "canonical-v2-scene-08-digital-forensics.png", "canonical-v2-scene-09-warrant-denied.png",
	"canonical-v2-scene-10-stalemate.png", "canonical-v2-scene-11-teacher-anxiety.png", "canonical-v2-scene-12-protection.png",
].map((file, index) => ({
	id: `CANONICAL-V2-${String(index + 1).padStart(2, "0")}`,
	kind: "AI reenactment",
	title: file,
	file: `assets/images/${file}`,
	status: "approved",
	rationale: "Canonical production-v2 in-house scene.",
}));

function statusClass(status: string) {
	if (status === "approved") return styles.rightsSafe;
	if (status === "blocked") return styles.rightsBlocked;
	return styles.rightsReview;
}

export default async function AssetsPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const project = await readProjectContext(slug);
	if (!project.canonical) return <GenericPipelineWorkbench slug={slug} stageNumber="04" />;
	return <CanonicalEditorPage slug={slug} caseTitle={project.title} />;
}

async function CanonicalEditorPage({ slug, caseTitle }: { slug: string; caseTitle: string }) {
	const latest = await getLatestRender();
	const metadata = latest?.metadata;
	const restrictedAssets = newsroomProject.assets.filter((asset) => asset.id !== "A-01");

	return (
		<NewsroomShell activeStep={3} projectSlug={slug} caseTitle={caseTitle}>
			<section className={styles.assetsPage}>
				<div className={styles.workflowHeading}>
					<div><p className={styles.eyebrow}>04 / VISUAL RIGHTS DESK</p><h1>Canonical visual assets</h1><p>Approved in-house scenes are separated from quarantined discoveries.</p></div>
					<aside className={styles.rightsRule}><LockKeyhole size={20} /><p><b>Rights rule</b><br />Unapproved or externally sourced media remains blocked from render handoff.</p></aside>
				</div>

				<section className={styles.assetSection} aria-labelledby="approved-assets-heading">
					<div className={styles.sectionHeading}><div><p className={styles.eyebrow}>GENERATED IN-HOUSE / 12</p><h2 id="approved-assets-heading">Approved canonical-v2 scenes</h2></div><span className={styles.sourceRule}><CheckCircle2 size={14} /> Approved</span></div>
					<div className={styles.aiAssetGrid}>
						{canonicalAiAssets.map((asset) => <article key={asset.id} className={styles.aiAssetCard}><div className={styles.aiClassroom} role="img" aria-label={asset.title}><span>AI REENACTMENT</span><i /><b>{asset.id}</b></div><div className={styles.assetCardBody}><div><span>{asset.id} · {asset.kind}</span><em className={statusClass(asset.status)}>{asset.status}</em></div><h3>{asset.title}</h3><p>{asset.rationale}</p><code>{asset.file}</code></div></article>)}
					</div>
				</section>

				<section className={styles.assetSection} aria-labelledby="review-assets-heading">
					<div className={styles.sectionHeading}><div><p className={styles.eyebrow}>QUARANTINE & DISCOVERY / {String(restrictedAssets.length).padStart(2, "0")}</p><h2 id="review-assets-heading">Review before use</h2></div><span className={styles.blockedRule}><Ban size={14} /> No automatic approval</span></div>
					<div className={styles.rightsTable}>{restrictedAssets.map((asset) => <article key={asset.id}><div className={styles.rightsIcon}>{asset.kind.includes("YouTube") ? <Film size={19} /> : <ShieldAlert size={19} />}</div><div><span>{asset.id} · {asset.kind}</span><h3>{asset.title}</h3><p>{asset.rationale}</p></div><em className={statusClass(asset.status)}>{asset.status}</em>{asset.kind.includes("YouTube") ? <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(asset.title)}`} target="_blank" rel="noreferrer"><Search size={14} /> Search <ExternalLink size={12} /></a> : <span className={styles.noPreview}>NO PREVIEW</span>}</article>)}</div>
				</section>

				<MediaDesk slug={slug} />
				<BgmDesk slug={slug} />
				<section className={styles.handoffPanel}><div><p className={styles.eyebrow}>READY FOR EDIT</p><h2>Canonical editor handoff</h2><p>Project ID <code>0986312f-e8a4-4354-8725-9134e71e247c</code> remains fixed for this case.</p></div><div className={styles.handoffActions}><EditorHandoff latest={metadata ? { versionId: metadata.versionId, title: metadata.title, duration: metadata.duration, resolution: metadata.resolution } : null} />{metadata ? <Link href="/renders" className={styles.renderLink}><Film size={16} /> View latest render</Link> : <span className={styles.renderUnavailable}>No registered render</span>}</div></section>
				<div className={styles.pageActions}><Link href={`/stories/${encodeURIComponent(slug)}/script`} className={styles.secondaryAction}><ArrowLeft size={16} /> Script review</Link><Link href={`/stories/${encodeURIComponent(slug)}/publish`} className={styles.primaryAction}>QA and publish <Film size={16} /></Link></div>
			</section>
		</NewsroomShell>
	);
}
