import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDot, FileText, FolderKanban, Plus } from "lucide-react";
import styles from "./newsroom/newsroom.module.css";
import { NewsroomResearchPanel } from "./newsroom/newsroom-research-panel";
import { isArchivedNewsroomProject, loadNewsroomRegistry } from "@/newsroom/registry";

export const metadata: Metadata = {
	title: "News | OpenCut",
	description: "Evidence-led editorial newsroom for local video stories",
};

export default async function NewsroomDashboard() {
	const registry = await loadNewsroomRegistry();
	const activeProjects = registry.projects.filter((project) => !isArchivedNewsroomProject(project));
	const archivedCount = registry.projects.length - activeProjects.length;
	return (
		<main className={styles.newsroom}>
			<header className={styles.topbar}>
				<Link href="/news" className={styles.wordmark} aria-label="OpenCut newsroom home">
					<span className={styles.wordmarkStamp}>OC</span>
					<span><b>OpenCut</b><small>investigation desk</small></span>
				</Link>
				<nav className={styles.mainNav} aria-label="Newsroom navigation">
					<Link className={styles.navActive} href="/news">News</Link>
					<span aria-label="Select a story to open research, script, editor, and publish">Story workspace</span>
					<Link href="/archive">Archive</Link>
				</nav>
				<div className={styles.localStatus}><CircleDot size={13} /> Local desk</div>
			</header>

			<section className={styles.dashboardHero}>
				<div>
					<p className={styles.eyebrow}>ASSIGNMENT BOARD</p>
					<h1>Turn verified reporting into <em>editable evidence.</em></h1>
				</div>
				<div className={styles.heroNote}>
					<span>Editorial principle</span>
					<p>Separate confirmed facts from claims, preserve source links, and carry the same project record through every page.</p>
				</div>
			</section>

			<NewsroomResearchPanel />

			<section className={styles.board} aria-labelledby="projects-heading">
				<div className={styles.sectionHeading}>
					<div><p className={styles.eyebrow}>ACTIVE STORIES / {String(activeProjects.length).padStart(2, "0")}</p><h2 id="projects-heading">Story projects</h2></div>
					<Link href="/archive" className={styles.quietButton}>Archive {archivedCount}</Link>
				</div>
				<div className={styles.projectGrid}>
					{activeProjects.map((project) => {
						const summary = project.summary || project.topic || (typeof project.candidate?.storySummary === "string" ? project.candidate.storySummary : "Source verification in progress.");
						return <Link href={`/stories/${encodeURIComponent(project.slug)}/research`} className={styles.secondaryProject} key={project.slug}>
							<div className={styles.secondaryProjectMeta}><span>{project.canonical ? "LEGACY RECORD" : "STORY"}</span><span>{project.status || "active-review"}</span></div>
							<h3>{project.title}</h3><p>{summary}</p><div><span>{project.slug}</span><ArrowRight size={15} /></div>
						</Link>;
					})}
					<button className={styles.quietButton} type="button" disabled title="Create a story from the research intake above"><Plus size={15} /> New story</button>
					<article className={styles.queueCard}>
						<div className={styles.queueIcon}><FolderKanban size={20} /></div><p className={styles.eyebrow}>NEXT ASSIGNMENT</p><h3>New story file</h3><p>Collect source links and begin with the evidence ledger.</p><span>Ready from research intake</span>
					</article>
					<aside className={styles.deskMemo}><FileText size={18} /><p><b>Desk note</b><br />Every story keeps one slug, one research snapshot, and one editable workflow.</p></aside>
				</div>
			</section>
		</main>
	);
}
