import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { isArchivedNewsroomProject, loadNewsroomRegistry } from "@/newsroom/registry";
import styles from "@/app/newsroom/newsroom.module.css";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
	const registry = await loadNewsroomRegistry();
	const projects = registry.projects.filter(isArchivedNewsroomProject);
	return (
		<main className={styles.newsroom}>
			<header className={styles.topbar}>
				<Link href="/news" className={styles.wordmark}><span className={styles.wordmarkStamp}>OC</span><span><b>OpenCut</b><small>investigation desk</small></span></Link>
				<nav className={styles.mainNav} aria-label="Newsroom navigation">
					<Link href="/news">News</Link><Link href="/archive" className={styles.navActive}>Archive</Link>
				</nav>
			</header>
			<section className={styles.board} aria-labelledby="archive-heading">
				<div className={styles.sectionHeading}><div><p className={styles.eyebrow}>ARCHIVE / {String(projects.length).padStart(2, "0")}</p><h1 id="archive-heading">Story archive</h1><p>공개 업로드까지 끝난 사건과 최종 제작 증거입니다.</p></div></div>
				<div className={styles.projectGrid}>
					{projects.map((project) => <article key={project.slug} className={styles.secondaryProject}>
						<div className={styles.secondaryProjectMeta}><span>PUBLIC ARCHIVE</span><span>ARCHIVED</span></div>
						<h2>{project.title}</h2>
						<p>{project.archive?.upload.title}</p>
						<div><Link href={`/stories/${encodeURIComponent(project.slug)}/research`}>사건 기록</Link><a href={project.archive?.upload.postUrl} target="_blank" rel="noreferrer">YouTube <ExternalLink size={14} /></a></div>
					</article>)}
				</div>
			</section>
		</main>
	);
}
