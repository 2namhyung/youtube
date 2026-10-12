import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, Clock3, LockKeyhole } from "lucide-react";
import { pipelineStages } from "@/newsroom/pipeline";
import styles from "./newsroom.module.css";

const statusIcon = {
	ready: <CircleCheck size={15} />,
	partial: <Clock3 size={15} />,
	blocked: <LockKeyhole size={15} />,
	pending: <CircleAlert size={15} />,
};

export function PipelineBoard() {
	return (
		<section className={styles.pipelineBoard} id="pipeline" aria-labelledby="pipeline-heading">
			<div className={styles.pipelineBoardHeader}>
				<div><p className={styles.eyebrow}>NINE-STAGE EDITORIAL LINE</p><h2 id="pipeline-heading">조사에서 보관까지, 한 칸도 건너뛰지 않습니다.</h2></div>
				<p>제주 교실 침입 사건의 현재 상태를 기준으로 표시합니다. 파일이 존재하는 것과 다음 단계로 승격 가능한 것은 다릅니다.</p>
			</div>
			<div className={styles.pipelineRail}>
				{pipelineStages.map((stage) => (
					<Link key={stage.number} href={stage.href} id={`pipeline-${stage.number}`} className={styles.pipelineStage} data-status={stage.status}>
						<div className={styles.pipelineStageTop}><span>{stage.number}</span><em>{statusIcon[stage.status]} {stage.statusLabel}</em></div>
						<h3>{stage.label}</h3>
						<p>{stage.purpose}</p>
						<div className={styles.pipelineJeju}><b>JEJU / NOW</b>{stage.jeju}</div>
						<footer><span>게이트 보기</span><ArrowUpRight size={15} /></footer>
					</Link>
				))}
			</div>
		</section>
	);
}
