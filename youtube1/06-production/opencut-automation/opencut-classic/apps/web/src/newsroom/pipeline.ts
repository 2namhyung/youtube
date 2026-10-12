import { CANONICAL_EDITOR_PROJECT_ID, newsroomProject } from "./project";

export type PipelineStageStatus = "ready" | "partial" | "blocked" | "pending";

export type PipelineStage = {
	number: string;
	slug: string;
	label: string;
	shortLabel: string;
	purpose: string;
	gate: string;
	status: PipelineStageStatus;
	statusLabel: string;
	jeju: string;
	evidence: string[];
	href: string;
};

const caseRoot = `/newsroom/${newsroomProject.slug}`;

export const pipelineStages: PipelineStage[] = [
	{
		number: "01",
		slug: "research",
		label: "조사",
		shortLabel: "조사",
		purpose: "사건의 공개 보도와 서로 다른 진술을 분리해 확인합니다.",
		gate: "출처와 확인되지 않은 사실을 구분해야 합니다.",
		status: "ready",
		statusLabel: "근거 정리 완료",
		jeju: "공개 기사와 확인이 더 필요한 쟁점을 뉴스룸 조사 화면에 정리했습니다.",
		evidence: ["jeju-school-intrusion.research.json", "source ledger", "conflict log"],
		href: caseRoot,
	},
	{
		number: "02",
		slug: "context-legal",
		label: "법률 간극",
		shortLabel: "법률 간극",
		purpose: "공개된 잠정 혐의와 피해자가 느끼는 공포 사이의 간극을 검토합니다.",
		gate: "확인되지 않은 영장 사유나 최종 처분을 단정하지 않습니다.",
		status: "partial",
		statusLabel: "법률 검토 필요",
		jeju: "공개 보도만으로 성범죄 성립 또는 불성립을 단정하지 않으며, 문제 문장은 공개 전 별도 검토가 필요합니다.",
		evidence: ["chargeGapResearch", "legalResearch", "fearAnalysis"],
		href: `${caseRoot}/pipeline?stage=02`,
	},
	{
		number: "03",
		slug: "script-voice",
		label: "대본·음성",
		shortLabel: "대본·음성",
		purpose: "확정 대본과 승인된 Qwen 내레이션을 단일 기준으로 유지합니다.",
		gate: "확정 대본 해시와 음성 승인 기록이 일치해야 합니다.",
		status: "ready",
		statusLabel: "확정본 잠금",
		jeju: "확정 대본 한 개와 승인된 Qwen3-TTS 내레이션만 사용합니다.",
		evidence: ["final script", "locked Qwen narration", "dual-ASR acceptance"],
		href: `${caseRoot}/script`,
	},
	{
		number: "04",
		slug: "visual-assets",
		label: "이미지·클립",
		shortLabel: "이미지·클립",
		purpose: "사용 가능한 자체 생성 이미지와 격리된 외부 자산을 분리합니다.",
		gate: "현재 렌더에는 승인된 자체 생성 이미지 외의 자산을 넣지 않습니다.",
		status: "ready",
		statusLabel: "12개 승인",
		jeju: "canonical-v2 AI 재연 PNG 12개만 현재 렌더와 OpenCut 프로젝트에 사용합니다.",
		evidence: ["12 canonical-v2 PNG scenes", "no external clips", "generation manifest"],
		href: `${caseRoot}/assets`,
	},
	{
		number: "05",
		slug: "bgm",
		label: "BGM",
		shortLabel: "BGM",
		purpose: "내레이션을 방해하지 않는 음악을 별도 검수합니다.",
		gate: "승인된 BGM이 내레이션을 가리지 않고 별도 트랙으로 전달되어야 합니다.",
		status: "ready",
		statusLabel: "승인·삽입 완료",
		jeju: "승인된 BGM A를 -16dB로 믹스하고 내레이션 구간 덕킹을 적용했습니다.",
		evidence: ["editable BGM track", "duck under narration", "final mix verified"],
		href: `${caseRoot}/pipeline?stage=05`,
	},
	{
		number: "06",
		slug: "production",
		label: "OpenCut 영상 제작",
		shortLabel: "OpenCut",
		purpose: "이미지·음성·자막을 각각 편집 가능한 트랙으로 인계합니다.",
		gate: "렌더와 OpenCut 타임라인이 같은 자산과 타이밍을 사용해야 합니다.",
		status: "ready",
		statusLabel: "편집 가능",
		jeju: "50.8초 등록 렌더에 AI 재연 장면 21개, 내레이션 1개, 편집 자막 36개, 승인 BGM과 전용 썸네일이 있습니다.",
		evidence: ["registered render", "OpenCut handoff", "editable track contract", "custom thumbnail"],
		href: `${caseRoot}/pipeline?stage=06`,
	},
	{
		number: "07",
		slug: "quality-assurance",
		label: "최종 검수",
		shortLabel: "QA",
		purpose: "영상·음성·자막·사실 표현을 공개 전 검사합니다.",
		gate: "아래 버전 결합 감사 보고서와 사람 승인 상태를 확인해 공개 가능 여부를 결정합니다.",
		status: "partial",
		statusLabel: "최종 감사 결과",
		jeju: "기술·법률·사람 검수 결과는 아래 버전 결합 감사 보고서에서 확인합니다.",
		evidence: ["version-bound QA report", "technical and legal findings", "human playback approval state"],
		href: `${caseRoot}/pipeline?stage=07`,
	},
	{
		number: "08",
		slug: "upload-delivery",
		label: "업로드",
		shortLabel: "업로드",
		purpose: "승인된 완성본만 외부 플랫폼으로 전달합니다.",
		gate: "최신 버전 결합 QA 보고서가 승인된 경우에만 계정 연결과 업로드를 진행합니다.",
		status: "partial",
		statusLabel: "QA 승인 결과",
		jeju: "최신 감사가 승인되어야 계정 연결과 외부 업로드를 진행할 수 있습니다.",
		evidence: ["version-bound QA report"],
		href: `${caseRoot}/pipeline?stage=08`,
	},
	{
		number: "09",
		slug: "archive",
		label: "아카이브",
		shortLabel: "아카이브",
		purpose: "승인 기록과 산출물 해시를 함께 보존합니다.",
		gate: "최종 manifest와 검수 결과가 완전해야 합니다.",
		status: "ready",
		statusLabel: "공개본 아카이브 완료",
		jeju: "공개 YouTube job과 canonical 렌더·handoff 해시를 사건 slug 하나에 결합해 보존합니다.",
		evidence: ["production/newsroom/archive.json", "public YouTube job", "version-bound render and handoff hashes"],
		href: `${caseRoot}/pipeline?stage=09`,
	},
];

export function stageByNumber(number: string) {
	return pipelineStages.find((stage) => stage.number === number);
}

export const openCutEditorHref = `/editor/${CANONICAL_EDITOR_PROJECT_ID}`;
