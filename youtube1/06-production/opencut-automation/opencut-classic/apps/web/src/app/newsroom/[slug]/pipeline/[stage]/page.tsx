import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, LockKeyhole } from "lucide-react";
import { newsroomProject } from "@/newsroom/project";
import { isCanonicalNewsroomProject } from "@/newsroom/project-runtime";
import { openCutEditorHref, pipelineStages, stageByNumber } from "@/newsroom/pipeline";
import { NewsroomShell } from "../../../newsroom-shell";
import styles from "../../../newsroom.module.css";
import { BgmDesk } from "./bgm-desk";
import { OpenCutEmbed } from "./opencut-embed";
import { ThumbnailReview } from "./thumbnail-review";
import { QualityDesk } from "./quality-desk";
import { PublishingDesk } from "./publishing-desk";
import { GenericPipelineWorkbench } from "../../generic-pipeline-workbench";

export const dynamic = "force-dynamic";

export async function renderPipelineStage({ slug, stageNumber }: { slug: string; stageNumber: string }) {
	if (!(await isCanonicalNewsroomProject(slug))) {
		if (!["02", "05", "06", "07", "08"].includes(stageNumber)) notFound();
		return <GenericPipelineWorkbench slug={slug} stageNumber={stageNumber} />;
	}
	const stage = stageByNumber(stageNumber);
	if (!stage || !["02", "05", "06", "07", "08", "09"].includes(stage.number)) notFound();
	const index = pipelineStages.findIndex((item) => item.number === stage.number);
	const previous = pipelineStages[index - 1];
	const next = pipelineStages[index + 1];

	return (
		<NewsroomShell activeStep={index} projectSlug={slug} caseTitle={newsroomProject.title}>
			<section className={styles.stagePage}>
				<header className={styles.stageHero}>
					<div><p className={styles.eyebrow}>{stage.number} / {stage.slug.toUpperCase()}</p><h1>{stage.label}</h1><p>{stage.purpose}</p></div>
					<aside data-status={stage.status}><span>JEJU / CURRENT</span><b>{stage.statusLabel}</b><p>{stage.jeju}</p></aside>
				</header>

				<div className={styles.stageLedger}>
					<section><span>EXIT GATE</span><h2>다음 단계로 넘기기 전</h2><p>{stage.gate}</p></section>
					<section><span>EVIDENCE ON FILE</span><h2>현재 확인 가능한 근거</h2><ul>{stage.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
				</div>

				{stage.number === "02" && (
					<section className={styles.legalGapDesk}>
						<div><p className={styles.eyebrow}>WHY THE FEAR REMAINS</p><h2>행동의 기괴함과 법이 바로 포착하는 혐의는 같지 않습니다.</h2></div>
						<p>제주 사건은 피해 물건에 성적 오염이 있었다는 사실만으로 특정 성범죄가 자동 성립한다고 단정할 수 없습니다. 적용 요건과 증거가 별도로 필요하고, 공개 자료만으로 최종 죄명·처분도 확정할 수 없습니다.</p>
						<div>{newsroomProject.chargeGapResearch.map((item) => <article key={item.id}><span>{item.id}</span><h3>{item.title}</h3><p><b>피해자가 느끼는 간극</b>{item.victimImpact}</p><p><b>더 확인할 것</b>{item.missingElementsOrEvidence}</p><small>{item.caution}</small></article>)}</div>
					</section>
				)}

				{stage.number === "05" && <BgmDesk slug={slug} />}

				{stage.number === "06" && (
					<section className={styles.openCutContract}>
						<div><p className={styles.eyebrow}>EDITABLE HANDOFF</p><h2>완성 MP4가 아니라 편집 가능한 재료를 넘깁니다.</h2></div>
						<ul><li>대본 원본 JSON과 SHA-256</li><li>내레이션 오디오 트랙</li><li>장면별 이미지·영상 클립</li><li>자막 cue와 타이밍</li><li>BGM 별도 오디오 트랙 또는 pending 계약</li></ul>
						<Link href={openCutEditorHref} target="_blank" rel="noreferrer">OpenCut 편집기 열기 <ExternalLink size={15} /></Link>
					</section>
				)}

				{stage.number === "06" && <ThumbnailReview />}

				{stage.number === "06" && <OpenCutEmbed src={openCutEditorHref} />}

				{stage.number === "07" && <QualityDesk slug={slug} />}

				{stage.number === "08" && <PublishingDesk slug={slug} />}

				{stage.status === "blocked" && <div className={styles.stageBlocker}><LockKeyhole size={18} /><div><b>승격 차단</b><p>{stage.jeju}</p></div></div>}

				<footer className={styles.stageNavigation}>
					{previous ? <Link href={previous.href}><ArrowLeft size={15} /> {previous.number} {previous.shortLabel}</Link> : <span />}
					{next ? <Link href={next.href}>{next.number} {next.shortLabel} <ArrowRight size={15} /></Link> : <Link href="/">대시보드로 <ArrowRight size={15} /></Link>}
				</footer>
			</section>
		</NewsroomShell>
	);
}

export default async function PipelineStagePage({ params }: { params: Promise<{ slug: string; stage: string }> }) {
	const { slug, stage: stageNumber } = await params;
	return renderPipelineStage({ slug, stageNumber });
}
