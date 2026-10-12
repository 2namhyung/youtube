import Link from "next/link";
import { ArrowLeft, CircleDot } from "lucide-react";
import styles from "./newsroom.module.css";

/** Shared six-page newsroom chrome. Internal production desks stay addressable by their old routes, but are not primary IA. */
export function NewsroomShell({ activeStep, children, caseTitle = "Story workspace", caseCode = "STORY", projectSlug = "" }: { activeStep: number; children: React.ReactNode; caseTitle?: string; caseCode?: string; projectSlug?: string }) {
	const storyHref = (section: string) => projectSlug ? `/stories/${encodeURIComponent(projectSlug)}/${section}` : "/news";
	const activeSection = activeStep <= 1 ? "research" : activeStep === 2 ? "script" : activeStep <= 5 ? "editor" : "publish";
	const navProps = (section: string) => ({ className: activeSection === section ? styles.navActive : undefined, "aria-current": activeSection === section ? "page" as const : undefined });
	return (
		<main className={styles.newsroom}>
			<header className={styles.topbar}>
				<Link href="/news" className={styles.wordmark} aria-label="OpenCut newsroom home">
					<span className={styles.wordmarkStamp}>OC</span><span><b>OpenCut</b><small>investigation desk</small></span>
				</Link>
				<nav className={styles.mainNav} aria-label="Newsroom navigation">
					<Link href="/news">News</Link>
					<Link {...navProps("research")} href={storyHref("research")}>Research</Link>
					<Link {...navProps("script")} href={storyHref("script")}>Script</Link>
					<Link {...navProps("editor")} href={storyHref("editor")}>Editor</Link>
					<Link {...navProps("publish")} href={storyHref("publish")}>Publish</Link>
					<Link href="/archive">Archive</Link>
				</nav>
				<div className={styles.localStatus}><CircleDot size={13} /> Local desk</div>
			</header>
			<div className={styles.caseBar}>
				<Link href="/news" className={styles.backLink}><ArrowLeft size={15} /> Stories</Link>
				<div><span>{caseCode}</span><b>{caseTitle}</b></div>
				<span className={styles.caseConfidential}>EDITORIAL / LOCAL</span>
			</div>
			{children}
		</main>
	);
}
