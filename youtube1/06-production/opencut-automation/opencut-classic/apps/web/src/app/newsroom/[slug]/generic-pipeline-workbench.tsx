"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowLeft,
	ArrowRight,
	CheckCircle2,
	CircleAlert,
	ExternalLink,
	Film,
	Image,
	LoaderCircle,
	LockKeyhole,
	Mic2,
	Play,
	Save,
	Search,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import { NewsroomShell } from "../newsroom-shell";
import { QualityDesk } from "./pipeline/[stage]/quality-desk";
import { PublishingDesk } from "./pipeline/[stage]/publishing-desk";
import { OpenCutEmbed } from "./pipeline/[stage]/opencut-embed";
import styles from "../newsroom.module.css";

type JsonRecord = Record<string, unknown>;
type DraftSectionKey =
	| "hook"
	| "incident"
	| "timeline"
	| "frustrating"
	| "solution"
	| "legal"
	| "confirmation";
type DraftSections = Partial<Record<DraftSectionKey, string>>;
type DraftVariant = {
	id: "documentary" | "direct" | "suspense" | "empathy";
	label: string;
	description: string;
	sections: DraftSections;
	length?: { compactLength?: number; withinTarget?: boolean };
};
type AutonomousBeat = { role: string; summary: string; claimRefs: string[] };
type AutonomousSentence = {
	text: string;
	claimRefs: string[];
	legalQualification?: string;
};
type ProvisionalCut = {
	cutId: string;
	sentenceRefs: number[];
	narrationText: string;
	semanticClass: "human-action" | "information-motion";
	cameraActionKorean: string;
	videoPromptEnglish: string;
	risks: string[];
	estimatedDurationSeconds: number;
};
type AutonomousNarration = {
	schema:
		| "newsroom-autonomous-narration-v1"
		| "newsroom-autonomous-narration-v2"
		| "newsroom-autonomous-narration-v3"
		| "newsroom-autonomous-narration-v4"
		| "newsroom-autonomous-narration-v5"
		| "newsroom-autonomous-narration-v6"
		| "newsroom-autonomous-narration-v7"
		| "newsroom-autonomous-narration-v8";
	modality?: string;
	narrativeEngine?: string;
	narration: string;
	sentences?: AutonomousSentence[];
	provisionalCutPlan?: {
		schema: "newsroom-stage03-provisional-cut-plan-v1";
		status: string;
		narrationSha256: string;
		cuts: ProvisionalCut[];
	};
	beats?: AutonomousBeat[];
	editorialDecision?: { approach: string; rationale: string };
	evidenceLineage: {
		schema: string;
		packageSha256: string;
		eventDossierSha256: string;
		legalReportSha256: string;
		caseBriefSha256?: string;
		usedClaimRefs: string[];
	};
};
type EditorialIntent = {
	schema: "newsroom-stage03-editorial-intent-v1";
	direction: string;
	openingDisclosure: "model-choice" | "opening" | "defer";
	priorityClaimRefs: string[];
	sha256?: string;
};
type IndependentCritique = {
	schema?: string;
	decision?: "pass" | "revise" | "reject";
	findings?: Array<{
		category?: string;
		status?: string;
		detail?: string;
		exactQuote?: string;
	}>;
	authoritySha256?: string;
	timing?: { estimatedSeconds?: number; withinAdvisoryTarget?: boolean };
};
type DraftGeneration = {
	provider?: string;
	model?: string;
	reasoning?: string;
	promptContractVersion?: string;
	cliVersion?: string;
	attemptCount?: number;
	generatedAt?: string;
	userEdited?: boolean;
} & JsonRecord;
type DraftRejection = {
	schema?: string;
	decision?: "reject";
	reasons?: Array<{ code: string; detail: string }>;
	packageSha256?: string;
	generationSha256?: string;
	critiqueSha256?: string;
	attemptedAuthoritySha256?: string;
	timing?: JsonRecord;
};
type LegalReviewSection = {
	status?: string;
	assessment?: string;
	decision?: string;
	limitations?: string[];
	conditions?: string[];
	reasons?: string[];
	required?: string[];
	avoid?: string[];
	safePhrasing?: string[];
	similarCases?: JsonRecord[];
};
type LegalContextReport = {
	confirmedFacts?: JsonRecord[];
	reportedFacts?: JsonRecord[];
	unverifiedFacts?: string[];
	possibleLegalIssues?: JsonRecord[];
	missingFacts?: string[];
	safePhrasing?: string[];
	verdict?: "usable" | "conditional" | "do-not-use";
	verdictLabel?: string;
	reasons?: string[];
	requiredEdits?: string[];
	allowedMaterials?: string[];
	restrictedMaterials?: string[];
	requiredConditions?: Array<{ id: string; label: string }>;
	scriptPolicy?: {
		allowedFacts?: string[];
		prohibitedClaims?: string[];
		requiredQualifications?: JsonRecord[];
		safePhrasing?: string[];
		identityRestrictions?: string[];
		footageRestrictions?: string[];
	};
	videoDecision?: {
		decision?: "allow" | "conditional" | "block";
		reasons?: string[];
	};
	caseDispositionReview?: LegalReviewSection;
	videoUseReview?: LegalReviewSection;
	scriptWritingReview?: LegalReviewSection;
	reviewCompletion?: {
		caseDisposition?: boolean;
		videoUse?: boolean;
		scriptWriting?: boolean;
		allComplete?: boolean;
	};
};
type Workflow = JsonRecord & {
	slug: string;
	title: string;
	candidate: JsonRecord;
	draft?: {
		schema?: string;
		generator?: string;
		generation?: DraftGeneration;
		critique?: IndependentCritique;
		storyReview?: { schema?: string; decision?: string; factualGrounding?: string; narrativeContinuity?: string; detail?: string };
		flowStoryScript?: Workflow["flowStoryScript"];
		authority?: AutonomousNarration;
		editorialDirection?: string | null;
		editorialIntent?: EditorialIntent | null;
		sections?: DraftSections;
		policyBinding?: JsonRecord;
		variants?: DraftVariant[];
		selectedDraftId?: string | null;
	};
	draftRejectionHistory?: Array<{
		schema?: string;
		reasons?: Array<{ code: string; detail: string }>;
		recordedAt?: string;
		entrySha256?: string;
	}>;
	draftFinalized?: boolean;
	flowStoryScript?: {
		schema?: string;
		status?: string;
		plainText?: string;
		storyText?: string;
		scriptSha256?: string;
		narrationSha256?: string;
		units?: JsonRecord[];
		review?: {
			schema?: string;
			decision?: string;
			narrationFaithfulness?: string;
			sequenceContinuity?: string;
			factualGrounding?: string;
			narrativeContinuity?: string;
		};
	};
	sceneBatch?: {
		schema?: string;
		status?: string;
		scriptSha256?: string;
		narrationSha256?: string;
		cuts?: JsonRecord[];
	};
	media?: JsonRecord | null;
	bgm?: JsonRecord | null;
	render?: JsonRecord | null;
	qa?: { approved?: boolean };
	productionOrchestration?: {
		jobId?: string;
		authorityHash?: string;
		state?: string;
		stage?: string;
		privateOnly?: boolean;
	};
	productionApproval?: {
		headline?: { approved?: boolean; line1?: string; line2?: string };
		ownerVoiceAuthority?: {
			approved?: boolean;
			profileId?: string;
			profileSha256?: string;
		};
		approvedNarrationAuthority?: JsonRecord;
		visualAuthorityId?: string;
	};
	v9Planning?: {
		entryAuthority?: JsonRecord;
		fullVisualStoryline?: JsonRecord;
		imagegenReferenceCatalog?: JsonRecord;
		geminiMultishotPromptBatch?: JsonRecord;
	};
	videoDesignAuthorship?: {
		storyline?: JsonRecord;
		semanticCutPlan?: JsonRecord;
	};
	videoReferences?: {
		summary?: {
			referenceCount?: number;
			requiredCount?: number;
			assetCount?: number;
			recipeCount?: number;
		};
	};
	legalContextReport?: LegalContextReport;
	stages?: JsonRecord;
};

const OWNER_VOICE_V1_SHA256 =
	"e1fbc1dc0d482cd9fa52b5fe63b545a30858b40602782cf9c9f7f2f2b5b08ff7";

const stageMeta: Record<
	string,
	{ index: number; eyebrow: string; title: string; description: string }
> = {
	"02": {
		index: 1,
		eyebrow: "CONTEXT / RIGHTS",
		title: "편집·영상 이용권 검토",
		description:
			"출처·표현·식별·영상 권리를 점검하고, 사용 가능한 자료와 조건을 명시합니다.",
	},
	"03": {
		index: 2,
		eyebrow: "SCRIPT / V9 PREFLIGHT",
		title: "65–80초 영상 설계 출발점",
		description:
			"검증된 사건으로 최종 대본과 2줄 제목만 확정합니다. 음성 타이밍과 모든 시각 설계는 이후 권위가 순서대로 잠급니다.",
	},
	"04": {
		index: 3,
		eyebrow: "VISUAL ASSETS",
		title: "이미지·자료 수집",
		description:
			"기사에서 사용할 수 있는 이미지 후보를 찾고, 실제 제작에 넘길 자료 묶음을 저장합니다.",
	},
	"05": {
		index: 4,
		eyebrow: "BGM",
		title: "배경음악 설계",
		description:
			"내레이션을 방해하지 않는 보도형 BGM 설정을 프로젝트에 연결합니다.",
	},
	"06": {
		index: 5,
		eyebrow: "PRODUCTION",
		title: "영상 생성과 OpenCut 인계",
		description:
			"확정 대본과 승인 자료로 영상을 생성하고 편집 가능한 인계 자료를 만듭니다.",
	},
	"07": {
		index: 6,
		eyebrow: "QUALITY ASSURANCE",
		title: "최종 품질 감사",
		description:
			"영상·음성·자막·사실 표현을 확인한 뒤 업로드 가능 상태로 승인합니다.",
	},
	"08": {
		index: 7,
		eyebrow: "UPLOAD",
		title: "업로드 준비",
		description:
			"승인된 완성 영상과 썸네일을 확인하고 플랫폼 업로드 단계로 넘깁니다.",
	},
};

function errorMessage(value: unknown, fallback: string) {
	return value &&
		typeof value === "object" &&
		"error" in value &&
		typeof value.error === "string"
		? value.error
		: fallback;
}

function fitTextareaToContent(textarea: HTMLTextAreaElement | null) {
	if (!textarea) return;
	textarea.style.height = "0px";
	textarea.style.height = `${textarea.scrollHeight}px`;
}

function hasSchema(value: unknown, schema: string) {
	return Boolean(
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		(value as JsonRecord).schema === schema,
	);
}

export function GenericPipelineWorkbench({
	slug,
	stageNumber,
	productionAuthority,
}: {
	slug: string;
	stageNumber: string;
	productionAuthority?: { path: string; draftSha256: string };
}) {
	const meta = stageMeta[stageNumber] || stageMeta["02"];
	const visibleStages = new Set(
		stageNumber === "03"
			? ["03"]
			: stageNumber === "06"
				? ["05", "06"]
				: stageNumber === "08"
					? ["07", "08"]
					: [stageNumber],
	);
	const router = useRouter();
	const [workflow, setWorkflow] = useState<Workflow | null>(null);
	const [sections, setSections] = useState<DraftSections | null>(null);
	const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([]);
	const [autonomousAuthority, setAutonomousAuthority] =
		useState<AutonomousNarration | null>(null);
	const [independentCritique, setIndependentCritique] =
		useState<IndependentCritique | null>(null);
	const [editorialDirection, setEditorialDirection] = useState("");
	const [authorityEditorialDirection, setAuthorityEditorialDirection] =
		useState("");
	const [authorityEditorialIntent, setAuthorityEditorialIntent] =
		useState<EditorialIntent | null>(null);
	const [policyBinding, setPolicyBinding] = useState<JsonRecord | null>(null);
	const [headlineLine1, setHeadlineLine1] = useState("");
	const [headlineLine2, setHeadlineLine2] = useState("");
	const [ownerVoiceApproved, setOwnerVoiceApproved] = useState(false);
	const visualAuthorityId = "paper-cut-grok-storyboard-v2";
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [productionStatus, setProductionStatus] = useState<JsonRecord | null>(
		null,
	);
	const legalGenerationAttempted = useRef(false);

	const refresh = useCallback(async () => {
		const response = await fetch(`/api/newsroom/projects/${slug}/workflow`, {
			cache: "no-store",
		});
		const body = (await response.json()) as Workflow & { error?: string };
		if (!response.ok)
			throw new Error(body.error || "프로젝트를 불러오지 못했습니다.");
		setWorkflow(body);
		const loadedVariants = Array.isArray(body.draft?.variants)
			? body.draft.variants
			: [];
		const loadedSelection =
			typeof body.draft?.selectedDraftId === "string"
				? body.draft.selectedDraftId
				: null;
		setDraftVariants(loadedVariants);
		setAutonomousAuthority(
			body.draft?.authority &&
				[
					"newsroom-autonomous-narration-v1",
					"newsroom-autonomous-narration-v2",
					"newsroom-autonomous-narration-v3",
					"newsroom-autonomous-narration-v4",
					"newsroom-autonomous-narration-v5",
					"newsroom-autonomous-narration-v6",
					"newsroom-autonomous-narration-v8",
				].includes(body.draft.authority.schema)
				? body.draft.authority
				: null,
		);
		setIndependentCritique(body.draft?.critique || null);
		setEditorialDirection(
			typeof body.draft?.editorialDirection === "string"
				? body.draft.editorialDirection
				: "",
		);
		setAuthorityEditorialDirection(
			typeof body.draft?.editorialDirection === "string"
				? body.draft.editorialDirection
				: "",
		);
		setAuthorityEditorialIntent(body.draft?.editorialIntent || null);
		setSections(
			loadedSelection
				? loadedVariants.find((item) => item.id === loadedSelection)
						?.sections ||
						body.draft?.sections ||
						null
				: loadedVariants.length
					? null
					: body.draft?.sections || null,
		);
		setPolicyBinding(body.draft?.policyBinding || null);
		setHeadlineLine1(body.productionApproval?.headline?.line1 || "");
		setHeadlineLine2(body.productionApproval?.headline?.line2 || "");
		setOwnerVoiceApproved(
			body.productionApproval?.ownerVoiceAuthority?.approved === true,
		);
		return body;
	}, [slug]);

	const patchWorkflow = useCallback(
		async (payload: JsonRecord) => {
			const response = await fetch(`/api/newsroom/projects/${slug}/workflow`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = (await response.json()) as Workflow & { error?: string };
			if (!response.ok)
				throw new Error(body.error || "프로젝트를 저장하지 못했습니다.");
			setWorkflow(body);
			return body;
		},
		[slug],
	);

	useEffect(() => {
		legalGenerationAttempted.current = false;
		void refresh()
			.then((body) => {
				if (stageNumber !== "02" || legalGenerationAttempted.current) return;
				const stage = body.stages?.["02"];
				const status =
					stage && typeof stage === "object" && !Array.isArray(stage)
						? (stage as JsonRecord).status
						: undefined;
				if (body.legalContextReport && status === "ready") return;
				legalGenerationAttempted.current = true;
				return patchWorkflow({ action: "generate-legal" }).then((next) => {
					setMessage("법률 검토 결과를 자동으로 갱신했습니다.");
					return next;
				});
			})
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : String(cause)),
			);
	}, [patchWorkflow, refresh, stageNumber]);

	const productionJobId =
		typeof workflow?.productionOrchestration?.jobId === "string"
			? workflow?.productionOrchestration.jobId
			: "";
	const migrationRequired =
		workflow?.draftFinalized === true && !productionJobId;
	useEffect(() => {
		if (!productionJobId) {
			setProductionStatus(null);
			return;
		}
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const poll = async () => {
			try {
				const response = await fetch(
					`/api/newsroom?job=${encodeURIComponent(productionJobId)}`,
					{ cache: "no-store" },
				);
				const status = (await response.json()) as JsonRecord;
				if (!response.ok)
					throw new Error(
						errorMessage(status, "자동 제작 작업 상태를 불러오지 못했습니다."),
					);
				if (cancelled) return;
				setProductionStatus(status);
				if (status.resumeEligible === true) {
					const resume = await fetch("/api/newsroom", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							action: "resume-production",
							slug,
							jobId: productionJobId,
						}),
					});
					if (!resume.ok) {
						const resumeBody = (await resume.json()) as JsonRecord;
						throw new Error(
							errorMessage(resumeBody, "자동 제작 작업을 재개하지 못했습니다."),
						);
					}
				}
				const terminalBlocked =
					status.state === "blocked" &&
					status.retryable !== true &&
					status.resumeEligible !== true;
				if (
					status.state !== "completed" &&
					status.state !== "failed" &&
					!terminalBlocked
				)
					timer = setTimeout(() => {
						void poll();
					}, 2_000);
			} catch (cause) {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
					timer = setTimeout(() => {
						void poll();
					}, 5_000);
				}
			}
		};
		void poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [productionJobId, slug]);

	const run = async (operation: () => Promise<void>) => {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await operation();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	const generateDraft = async () => {
		if (!workflow) return;
		if (workflow.draftFinalized === true)
			throw new Error("확정된 대본은 다시 생성하거나 덮어쓸 수 없습니다.");
		if (workflow.legalContextReport?.reviewCompletion?.allComplete !== true)
			throw new Error(
				"사건처리 판단·영상 활용 검토·대본 주의사항 검토가 모두 끝난 뒤 대본을 생성할 수 있습니다.",
			);
		const editorialIntent: EditorialIntent = {
			schema: "newsroom-stage03-editorial-intent-v1",
			direction: editorialDirection.trim(),
			openingDisclosure: "model-choice",
			priorityClaimRefs: [],
		};
		const generationPayload = { action: "draft", slug, editorialIntent };
		const response = await fetch("/api/newsroom", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(generationPayload),
		});
		const body = (await response.json()) as {
			decision?: "accept" | "reject";
			generator?: string;
			generation?: DraftGeneration;
			critique?: IndependentCritique;
			storyReview?: { schema?: string; decision?: string; factualGrounding?: string; narrativeContinuity?: string; detail?: string };
			rejection?: DraftRejection;
			authority?: AutonomousNarration;
			attemptedAuthority?: AutonomousNarration;
			flowStoryScript?: Workflow["flowStoryScript"];
			policyBinding?: JsonRecord;
			editorialDirection?: string;
			editorialIntent?: EditorialIntent;
			error?: string;
		};
		if (!response.ok)
			throw new Error(body.error || "독립 비평을 완료하지 못했습니다.");
		if (body.decision === "reject") {
			if (
				body.critique?.schema !==
					"newsroom-independent-narration-critique-v8" ||
				!["revise", "reject"].includes(String(body.critique.decision || "")) ||
				body.rejection?.schema !== "newsroom-script-admission-rejection-v6" ||
				!body.generation ||
				body.attemptedAuthority?.schema !== "newsroom-autonomous-narration-v8" ||
				body.flowStoryScript?.schema !== "newsroom-story-script-v1" ||
				!body.policyBinding ||
				!body.editorialIntent
			)
				throw new Error("거절 감사 응답이 완전하지 않습니다.");
			await patchWorkflow({
				action: "record-draft-rejection",
				generation: body.generation,
				critique: body.critique,
				attemptedAuthority: body.attemptedAuthority,
				flowStoryScript: body.flowStoryScript,
				rejection: body.rejection,
				policyBinding: body.policyBinding,
				editorialIntent: body.editorialIntent,
				editorialDirection: body.editorialIntent.direction,
			});
			const reasons = body.rejection.reasons || [];
			setMessage(
				`대본 후보 탈락 · ${reasons.map((reason) => reason.code).join(" · ") || "insufficient-narrative-material"}. 기존 대본은 변경하지 않았습니다.`,
			);
			return;
		}
		if (
			body.decision !== "accept" ||
			body.authority?.schema !== "newsroom-autonomous-narration-v8" ||
			body.critique?.schema !== "newsroom-independent-narration-critique-v8" ||
			body.critique.decision !== "pass" ||
			body.flowStoryScript?.schema !== "newsroom-story-script-v1" ||
			!body.editorialIntent
		)
			throw new Error(
				"독립 비평을 통과한 사건 브리프 근거 대본을 만들지 못했습니다.",
			);
		setDraftVariants([]);
		setAutonomousAuthority(body.authority);
		setIndependentCritique(body.critique);
		const resolvedEditorialDirection = body.editorialIntent.direction;
		setAuthorityEditorialDirection(resolvedEditorialDirection);
		setAuthorityEditorialIntent(body.editorialIntent);
		setSections(null);
		setPolicyBinding(body.policyBinding || null);
		await patchWorkflow({
			action: "save-draft",
			planningMode: "v21-narration-with-story-text",
			generator: body.generator,
			generation: body.generation,
			critique: body.critique,
			flowStoryScript: body.flowStoryScript,
			authority: body.authority,
			editorialDirection: body.editorialIntent.direction,
			editorialIntent: body.editorialIntent,
			policyBinding: body.policyBinding,
			finalized: false,
		});
		setMessage(
			"대본과 영화 줄거리형 스토리 스크립트를 함께 만들고 사실·법률 검토를 통과했습니다. 실제 길이는 owner narration timing에서 다시 확정됩니다.",
		);
	};
	const generateDraftAction = () => run(generateDraft);

	const saveDraft = (finalized: boolean) =>
		run(async () => {
			if (
				!autonomousAuthority ||
				autonomousAuthority.schema !== "newsroom-autonomous-narration-v8" ||
				independentCritique?.schema !==
					"newsroom-independent-narration-critique-v8" ||
				independentCritique.decision !== "pass" ||
				!authorityEditorialIntent
			)
				throw new Error(
					"대본과 storyText를 함께 반환한 generator 및 factual-legal critic 결과를 다시 생성하세요.",
				);
			if (workflow?.draftFinalized === true)
				throw new Error("확정된 대본 권위는 덮어쓸 수 없습니다.");
			if (finalized && !ownerVoiceApproved)
				throw new Error("owner-voice-v1 승인을 확인하세요.");
			const saved = await patchWorkflow({
				action: "save-draft",
				planningMode: "v21-narration-with-story-text",
				generator: workflow?.draft?.generator,
				generation: workflow?.draft?.generation,
				critique: independentCritique,
				flowStoryScript: workflow?.draft?.flowStoryScript || workflow?.flowStoryScript,
				authority: autonomousAuthority,
				editorialDirection: authorityEditorialDirection,
				editorialIntent: authorityEditorialIntent,
				policyBinding: policyBinding || workflow?.draft?.policyBinding,
				finalized,
				...(finalized
					? {
							headline: {
								approved: true,
								line1: headlineLine1,
								line2: headlineLine2,
							},
							ownerVoiceAuthority: {
								approved: true,
								profileId: "owner-voice-v1",
								profileSha256: OWNER_VOICE_V1_SHA256,
							},
							visualAuthorityId,
						}
					: {}),
			});
			if (finalized && saved.productionOrchestration?.jobId)
				setProductionStatus({
					jobId: saved.productionOrchestration.jobId,
					state: saved.productionOrchestration.state || "queued",
					stage: saved.productionOrchestration.stage || "finalized",
					progress: 2,
					privateOnly: true,
				});
			setMessage(
				finalized
					? saved.productionOrchestration?.jobId
						? "기존 제작 결합을 확인했습니다. 새 v9 경로의 provider 실행 권위는 여전히 없습니다."
						: "최종 대본·2줄 제목·owner voice profile을 확정했습니다. 다음 단계는 owner narration과 locked timing 승인입니다."
					: "대본을 저장했습니다.",
			);
		});

	const collectMedia = () =>
		run(async () => {
			if (!workflow) return;
			const response = await fetch("/api/newsroom", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "media", slug }),
			});
			const body = (await response.json()) as JsonRecord;
			if (!response.ok)
				throw new Error(errorMessage(body, "이미지 후보를 찾지 못했습니다."));
			await patchWorkflow({ action: "save-media", media: body });
			setMessage("이미지 후보를 수집해 프로젝트에 저장했습니다.");
		});
	const prepareFlowStoryScript = () =>
		run(async () => {
			if (
				autonomousAuthority?.schema !== "newsroom-autonomous-narration-v8" ||
				independentCritique?.schema !== "newsroom-independent-narration-critique-v8" ||
				independentCritique.decision !== "pass"
			)
				throw new Error("독립 검토를 통과한 현재 대본이 필요합니다.");
			const saved = await patchWorkflow({ action: "prepare-flow-story-script" });
			const count = Array.isArray(saved.flowStoryScript?.units)
				? saved.flowStoryScript.units.length
				: 0;
			setMessage(
				`대본 문장과 연결된 시각 전개 ${count}개를 만들고 독립 검토했습니다. 아직 컷·타이밍·제작 권위는 아닙니다.`,
			);
		});
	const copyFlowStoryScript = () =>
		run(async () => {
			const text = workflow?.flowStoryScript?.plainText || "";
			if (!text) throw new Error("먼저 Flow용 스토리 스크립트를 만드세요.");
			await navigator.clipboard.writeText(text);
			setMessage("Flow용 스토리 스크립트를 복사했습니다.");
		});
	const prepareSceneBatch = () =>
			run(async () => {
				if (!workflow?.draftFinalized) throw new Error("대본을 먼저 확정하세요.");
				if (workflow.flowStoryScript?.status !== "final-script-planning-only")
					throw new Error("확정 대본에서 Flow용 스토리 스크립트를 다시 만드세요.");
			const saved = await patchWorkflow({ action: "prepare-scene-batch" });
			const count = Array.isArray(saved.sceneBatch?.cuts)
				? saved.sceneBatch.cuts.length
				: 0;
			setMessage(`확정 대본 기준 장면 배치 ${count}개를 준비했습니다. 별도 장면 프롬프트 생성 단계에서 사용하세요.`);
		});

	const mediaImages = useMemo(() => {
		const images = workflow?.media?.images;
		return Array.isArray(images) ? (images as JsonRecord[]) : [];
	}, [workflow]);
	const render =
		(productionStatus?.render &&
		typeof productionStatus.render === "object" &&
		!Array.isArray(productionStatus.render)
			? (productionStatus.render as JsonRecord)
			: null) ||
		workflow?.render ||
		null;
	const jobId =
		productionJobId || (typeof render?.jobId === "string" ? render.jobId : "");
	const renderCompleted =
		productionStatus?.state === "completed" || render?.state === "completed";
	const scriptReady =
		workflow?.legalContextReport?.reviewCompletion?.allComplete === true;
	const productionStageLabels: Record<string, string> = {
		finalized: "최종 대본 권위 확정",
		evidence_bundle: "근거 번들 검증",
		narration: "잠긴 owner narration 검증",
		video_plan: "2단계 영상 설계 컴파일",
		editorial_story_plan: "스토리 계획 봉인",
		visual_treatment: "Grok-ready 시각 계약 봉인",
		animatic_plan: "authored duration animatic 봉인",
		assembly_ready: "provider continuation 보류",
		completed: "완료",
		failed: "실패",
	};
	const productionStage =
		typeof productionStatus?.stage === "string"
			? productionStatus.stage
			: workflow?.productionOrchestration?.stage || "finalized";
	const finalScriptReady =
		workflow?.draftFinalized === true &&
		workflow.productionApproval?.headline?.approved === true;
	const sceneBatchReady =
		workflow?.sceneBatch?.schema === "newsroom-script-scene-batch-v1" &&
		workflow.sceneBatch.status === "scene-prompts-generated-awaiting-semantic-cut-seal";
	const lockedNarrationReady = Boolean(
		workflow?.productionApproval?.approvedNarrationAuthority,
	);
	const storylineReady = hasSchema(
		workflow?.videoDesignAuthorship?.storyline,
		"newsroom-storyline-v2",
	);
	const cutPlanReady = hasSchema(
		workflow?.videoDesignAuthorship?.semanticCutPlan,
		"newsroom-semantic-cut-plan-v2",
	);
	const entryReady = hasSchema(
		workflow?.v9Planning?.entryAuthority,
		"newsroom-v9-entry-authority-v1",
	);
	const fullVisualReady = hasSchema(
		workflow?.v9Planning?.fullVisualStoryline,
		"newsroom-full-visual-storyline-v1",
	);
	const referenceCatalogReady = hasSchema(
		workflow?.v9Planning?.imagegenReferenceCatalog,
		"newsroom-imagegen-reference-catalog-v1",
	);
	const geminiBatchReady = hasSchema(
		workflow?.v9Planning?.geminiMultishotPromptBatch,
		"newsroom-gemini-multishot-prompt-batch-v1",
	);
	const v9Stages = [
		{
			id: "A",
			title: "뉴스·법률 검토",
			contract: "current research SHA + approved legal review",
			ready: scriptReady,
			unlocked: true,
			icon: ShieldCheck,
		},
		{
			id: "B",
			title: "최종 대본 + 2줄 제목",
			contract: "final script · approved two-line title",
			ready: finalScriptReady,
			unlocked: scriptReady,
			icon: Save,
		},
		{
			id: "C",
			title: "Owner narration + locked timing",
			contract: "owner voice only · exact narration/timing SHA",
			ready: lockedNarrationReady && entryReady,
			unlocked: finalScriptReady,
			icon: Mic2,
		},
		{
			id: "D",
			title: "전체 스토리와 의미 컷",
			contract: "newsroom-storyline-v2 → semantic-cut-plan-v2",
			ready: storylineReady && cutPlanReady,
			unlocked: lockedNarrationReady && entryReady,
			icon: Workflow,
		},
		{
			id: "E",
			title: "65–80초 전체 비주얼 설계",
			contract: "newsroom-full-visual-storyline-v1",
			ready: fullVisualReady,
			unlocked: storylineReady && cutPlanReady,
			icon: Film,
		},
		{
			id: "F",
			title: "ImageGen 참조 카탈로그",
			contract: "non-authoritative-reference-only",
			ready: referenceCatalogReady,
			unlocked: fullVisualReady,
			icon: Image,
		},
		{
			id: "G",
			title: "Gemini 멀티샷 프롬프트",
			contract: "newsroom-gemini-multishot-prompt-batch-v1",
			ready: geminiBatchReady,
			unlocked: fullVisualReady,
			icon: LockKeyhole,
		},
	];

	if (!workflow)
		return (
			<NewsroomShell
				activeStep={meta.index}
				caseTitle="프로젝트 불러오는 중"
				caseCode="NEW CASE"
				projectSlug={slug}
			>
				<div className={styles.intakeState}>
					{error ? (
						<>
							<CircleAlert size={18} /> {error}
						</>
					) : (
						<>
							<LoaderCircle className={styles.spin} size={18} /> 프로젝트 상태를
							불러오는 중…
						</>
					)}
				</div>
			</NewsroomShell>
		);

	return (
		<NewsroomShell
			activeStep={meta.index}
			caseTitle={workflow.title}
			caseCode="NEW CASE"
			projectSlug={slug}
		>
			{productionAuthority ? (
				<aside className={styles.workflowAuthorityNotice} role="note">
					<CircleAlert size={18} />
					<div>
						<b>워크플로 초안 편집 모드</b>
						<p>
							여기서 저장한 내용은 newsroom workflow에만 기록됩니다. 제작 권위
							대본 <code>{productionAuthority.draftSha256.slice(0, 12)}…</code>
							과 <code>{productionAuthority.path}</code>는 바뀌지 않으며, 저장
							뒤 production QA는 재동기화 전까지 stale로 표시됩니다.
						</p>
						<Link href={`/stories/${encodeURIComponent(slug)}/script`}>
							권위 대본·QA로 돌아가기
						</Link>
					</div>
				</aside>
			) : null}
			<section className={styles.stagePage}>
				<header
					className={`${styles.stageHero} ${stageNumber === "03" ? styles.stageHeroCompact : ""}`}
				>
					<div>
						<p className={styles.eyebrow}>
							{stageNumber} / {meta.eyebrow}
						</p>
						<h1>{meta.title}</h1>
						<p>{meta.description}</p>
					</div>
					{stageNumber !== "03" && (
						<aside data-status="partial">
							<span>SELECTED STORY</span>
							<b>같은 프로젝트로 연결됨</b>
							<p>이 단계의 결과는 다음 단계가 그대로 이어받습니다.</p>
						</aside>
					)}
				</header>

				{stageNumber === "02" && (
					<section className={styles.legalGapDesk}>
						<div>
							<p className={styles.eyebrow}>AUTOMATED LEGAL REVIEW</p>
							<h2>법률·권리 검토 결과</h2>
						</div>
						{workflow.legalContextReport ? (
							<div style={{ display: "grid", gap: 10, marginTop: 16 }}>
								<p>
									<strong>
										{workflow.legalContextReport.videoDecision?.decision ||
											"판정 대기"}
									</strong>
								</p>
								<p>
									<b>판정 이유</b>
								</p>
								<ul>
									{(
										workflow.legalContextReport.videoDecision?.reasons ||
										workflow.legalContextReport.reasons ||
										[]
									).map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
								<p>
									<b>위험·금지 주장</b>{" "}
									{(
										workflow.legalContextReport.scriptPolicy
											?.prohibitedClaims || []
									).join(" · ") || "없음"}
								</p>
								<p>
									<b>필수 한정 표현</b>{" "}
									{(
										workflow.legalContextReport.scriptPolicy
											?.requiredQualifications || []
									)
										.map((item) => String(item.qualifier || ""))
										.filter(Boolean)
										.join(" · ") || "없음"}
								</p>
								<p>
									<b>안전한 표현</b>{" "}
									{(
										workflow.legalContextReport.scriptPolicy?.safePhrasing || []
									).join(" · ") || "없음"}
								</p>
								<p>
									<b>신원 제한</b>{" "}
									{(
										workflow.legalContextReport.scriptPolicy
											?.identityRestrictions || []
									).join(" · ") || "없음"}
								</p>
								<p>
									<b>화면·영상 제한</b>{" "}
									{(
										workflow.legalContextReport.scriptPolicy
											?.footageRestrictions || []
									).join(" · ") || "없음"}
								</p>
							</div>
						) : (
							<div className={styles.intakeState}>
								<LoaderCircle className={styles.spin} size={16} /> 최신 사건
								자료를 기준으로 법률 검토를 생성하는 중입니다.
							</div>
						)}
						{workflow.legalContextReport?.videoDecision?.decision ===
						"block" ? (
							<div className={styles.intakeState} role="alert">
								<CircleAlert size={16} /> 법률 검토가 대본 생성을 차단했습니다.
								판정 이유를 해결한 뒤 연구 자료를 갱신하세요.
							</div>
						) : (
							<button
								className={styles.primaryAction}
								disabled={busy || !workflow.legalContextReport}
								onClick={() =>
									router.push(`/stories/${encodeURIComponent(slug)}/script`)
								}
							>
								<ShieldCheck size={16} /> 편집 방향 설정 후 대본 생성
							</button>
						)}
					</section>
				)}

				{visibleStages.has("03") && !scriptReady && (
					<section className={styles.legalGapDesk} role="alert">
						<div>
							<p className={styles.eyebrow}>SCRIPT GATE</p>
							<h2>법률 검토가 아직 완료되지 않았습니다</h2>
						</div>
						<p>
							유사사례 기반 사건처리 판단, 영상 소재 활용 검토, 대본 작성
							주의사항의 세 판단이 모두 완료되어야 대본 초안과 편집기가
							열립니다.
						</p>
						<Link
							className={styles.primaryAction}
							href={`/stories/${encodeURIComponent(slug)}/research`}
						>
							Research로 돌아가 검토 완료
						</Link>
					</section>
				)}

				{visibleStages.has("03") && scriptReady && (
					<section className={styles.scriptPage}>
						<p className={styles.scriptGeneratorContract}>
							REVIEWED AUTHORITY · 생성기는 caseBrief 안에서 대본을 자율 작성하고,
							별도 critic은 사실·법률 안전만 pass·reject로 판정합니다.
						</p>
						<header className={styles.scriptDraftToolbar}>
							<div>
								<span>AUTONOMOUS NARRATION</span>
								<h2>
									사건 근거 기반 자율 대본{" "}
									<small>
										모델의 편집 결정 → 연속 대본 검토 → 최종 대본·2줄 제목 확정
									</small>
								</h2>
							</div>
							<div className={styles.scriptDraftActions}>
								<span
									className={styles.scriptValidation}
									data-approved={Boolean(autonomousAuthority)}
								>
									{autonomousAuthority ? (
										<CheckCircle2 size={14} />
									) : (
										<CircleAlert size={14} />
									)}
									{autonomousAuthority
										? "자율 대본 준비 · timing 미확정"
										: draftVariants.length || sections
											? "legacy 읽기 전용"
											: "자율 대본 생성 전"}
								</span>
								<Link href={`/stories/${encodeURIComponent(slug)}/research`}>
									법률 근거
								</Link>
								<button
									className={styles.secondaryAction}
									disabled={busy || workflow.draftFinalized === true}
									onClick={() => void generateDraftAction()}
								>
									<Play size={14} />{" "}
									{busy
										? "자율 대본 생성 중…"
										: autonomousAuthority || draftVariants.length || sections
											? "명시적으로 다시 생성"
											: "자율 대본 생성"}
								</button>
							</div>
						</header>
						<p className={styles.scriptGeneratorContract}>
							Codex CLI · GPT-5.6 Sol · 대본+영화 줄거리 generator 1회 + factual-legal critic 1회 · 자동 재시도
					없음 · 내레이션 65–80초 예상값과 대본·줄거리의 factual-legal 검토를 통과한 결과만 채택합니다.
							실제 길이는 owner narration locked timing에서 다시 확정합니다.
						</p>
						<label className={styles.selectedDraftHeading}>
							<span>HASH-BOUND EDITORIAL INTENT</span>
							<b>이번 사건에서 원하는 편집 방향</b>
							<p>
								강조할 검증 사실과 정서를 적으세요. 표현·리듬·정보 순서는 사건
								근거에 맞춰 생성기가 자율적으로 결정합니다.
							</p>
							<textarea
								aria-label="선택 편집 방향"
								value={editorialDirection}
								disabled={workflow.draftFinalized === true}
								maxLength={2000}
								rows={3}
								onChange={(event) => setEditorialDirection(event.target.value)}
								placeholder="예: 보호자 역할의 충돌과 추격의 지속 시간을 강조"
							/>
						</label>
						{!autonomousAuthority && (draftVariants.length > 0 || sections) ? (
							<aside className={styles.intakeState} role="note">
								<LockKeyhole size={17} />
								<div>
									<b>Legacy v4 대본은 읽기 전용입니다.</b>
									<p>
										{draftVariants.length
											? `${draftVariants.length}개 비교안`
											: "섹션형 대본"}
										을 그대로 보존했습니다. 위 ‘명시적으로 다시 생성’을 눌러야만
										새 자율 대본으로 교체됩니다.
									</p>
								</div>
							</aside>
						) : null}
						{!autonomousAuthority && (draftVariants.length > 0 || sections) ? (
							<div
								className={styles.legacyDraftArchive}
								aria-label="읽기 전용 legacy 대본"
							>
								{(draftVariants.length
									? draftVariants
									: [
											{
												id: "legacy" as const,
												label: "기존 편집 대본",
												description: "저장된 섹션 산출물",
												sections: sections || {},
											},
										]
								).map((variant) => (
									<details key={variant.id}>
										<summary>
											<b>{variant.label}</b>
											<span>{variant.description}</span>
										</summary>
										<div>
											{Object.entries(variant.sections).map(([key, value]) => (
												<p key={key}>
													<small>{key}</small>
													{value}
												</p>
											))}
										</div>
									</details>
								))}
							</div>
						) : null}
						{workflow.draftRejectionHistory?.length ? (
							<aside className={styles.intakeState} role="status">
								<CircleAlert size={17} />
								<div>
									<b>최근 대본 후보는 채택되지 않았습니다.</b>
									<p>
										{workflow.draftRejectionHistory
											.at(-1)
											?.reasons?.map(
												(reason) => `${reason.code}: ${reason.detail}`,
											)
											.join(" · ")}
									</p>
									<small>
										기존 활성 대본과 확정 상태는 변경되지 않았습니다.
									</small>
								</div>
							</aside>
						) : null}
						{autonomousAuthority ? (
							<>
								<div className={styles.selectedDraftHeading}>
									<span>
										{autonomousAuthority.schema ===
										"newsroom-autonomous-narration-v8"
											? "SAFETY ADMISSION"
											: "LEGACY MODEL DECISION"}
									</span>
									<b>
										{(autonomousAuthority.schema === "newsroom-autonomous-narration-v8" ? "자율 작성 대본" : "") ||
											autonomousAuthority.narrativeEngine ||
											autonomousAuthority.modality ||
											autonomousAuthority.editorialDecision?.approach ||
											"legacy autonomous narration"}
									</b>
									<p>
										{autonomousAuthority.schema ===
										"newsroom-autonomous-narration-v8"
											? `읽기 전용 critic 통과 · 예상 ${independentCritique?.timing?.estimatedSeconds ?? "-"}초 · 실제 owner timing 미확정`
											: autonomousAuthority.editorialDecision?.rationale ||
											"기존 대본 권위는 읽기 전용이며 v23 재생성 전까지 저장할 수 없습니다."}
									</p>
								</div>
								{independentCritique?.schema ===
								"newsroom-independent-narration-critique-v8" ? (
									<aside className={styles.intakeState} role="status">
										<ShieldCheck size={17} />
										<div>
											<b>독립 critic · {independentCritique.decision}</b>
											<p>
												{(independentCritique.findings || [])
													.map(
														(finding) =>
															`${finding.category}: ${finding.status}`,
													)
													.join(" · ")}
											</p>
											<small>
												critic은 대본을 고치거나 최종 권위를 만들지 않습니다.
											</small>
										</div>
									</aside>
								) : null}
								<label className={styles.selectedDraftHeading}>
									<span>CONTINUOUS KOREAN NARRATION</span>
									<b>검토된 최종 대본</b>
									<p>
										문장별 claim lineage와 critic hash가 결합돼 직접 편집할 수
										없습니다. 변경은 편집 방향을 반영한 명시적 재생성으로
										수행합니다.
									</p>
									<textarea
										aria-label="연속 한국어 대본"
										value={autonomousAuthority.narration}
										disabled
										ref={fitTextareaToContent}
										readOnly
										rows={12}
									/>
								</label>
								<section className={styles.selectedDraftHeading} aria-label="Flow용 스토리 스크립트">
									<span>FLOW STORY SCRIPT · PLANNING</span>
									<b>내레이션과 연결된 시각적 사건 전개</b>
									<p>
										기존 내레이션 generator가 같은 사건 자료에서 한국어 대본과 별도 영어 storyText를 함께 씁니다. storyText는 배경·발단·갈등 고조·결과가 이어지는 영화 줄거리형 산문이며, 반복 등장인물은 로마자 이름과 나이 또는 나이 범위, 일관된 복장을 첫 등장에 설정합니다. 이름·추정 나이·복장은 내부 영상 설정으로만 관리하고 본문에는 제작용 설명을 표시하지 않습니다. Storyboard Studio에 수동으로 붙여 넣는 일반 텍스트이며 컷과 타이밍은 이후 단계에서 정합니다.
									</p>
									<div className={styles.pageActions}>
										{workflow.flowStoryScript?.plainText ? (
											<button className={styles.secondaryAction} disabled={busy} onClick={() => void copyFlowStoryScript()}>
												<Save size={15} /> 전체 복사
											</button>
										) : null}
									</div>
									{workflow.flowStoryScript?.plainText ? (
										<>
											<small>
												{workflow.flowStoryScript.status === "draft-preview" ? "초안 미리보기 · 동일 대본 확정 시 그대로 연결" : "확정 대본 기반 계획본"}
											</small>
											<textarea aria-label="Flow용 스토리 스크립트" readOnly rows={18} value={workflow.flowStoryScript.plainText} />
										</>
									) : null}
								</section>
								<div
									className={styles.draftVariantGrid}
									aria-label="문장별 근거"
								>
									{(
										autonomousAuthority.sentences ||
										autonomousAuthority.beats?.map<AutonomousSentence>(
											(beat) => ({
												text: beat.summary,
												claimRefs: beat.claimRefs,
											}),
										) ||
										[]
									).map((sentence, index) => (
										<article key={`${index}-${sentence.text.slice(0, 20)}`}>
											<span>{String(index + 1).padStart(2, "0")}</span>
											<p>{sentence.text}</p>
											<small>
												{sentence.claimRefs.length
													? `근거 ${sentence.claimRefs.join(" · ")}`
													: "연결 문장"}
												{sentence.legalQualification
													? ` · legacy 한정 ${sentence.legalQualification}`
													: ""}
											</small>
										</article>
									))}
								</div>
								{autonomousAuthority.provisionalCutPlan?.cuts?.length ? (
									<section className={styles.draftVariantGrid} aria-label="생성기 provisional 컷 제안">
										<div className={styles.selectedDraftHeading}>
											<span>PROVISIONAL CUT PLAN · ADVISORY</span>
											<b>대본과 함께 생성된 컷 제안</b>
											<p>전체 narration을 순서대로 덮는 검토용 제안입니다. owner timing과 semantic cut seal 전에는 최종 컷 권위나 provider 입력이 아닙니다.</p>
										</div>
										{autonomousAuthority.provisionalCutPlan.cuts.map((cut) => (
											<details key={cut.cutId}>
												<summary>
													<b>{cut.cutId} · {cut.semanticClass}</b>
													<span>{cut.estimatedDurationSeconds.toFixed(1)}초 advisory · 문장 {cut.sentenceRefs.join(", ")}</span>
												</summary>
												<p>{cut.narrationText}</p>
												<small><b>Camera / action</b> {cut.cameraActionKorean}</small>
												<small><b>English prompt</b> {cut.videoPromptEnglish}</small>
												{cut.risks.length ? <small><b>Risks</b> {cut.risks.join(" · ")}</small> : null}
											</details>
										))}
									</section>
								) : null}
								<div className={styles.headlineAuthorityEditor}>
									<div>
										<span>APPROVED TWO-LINE TITLE</span>
										<h3>영상 상단 제목</h3>
										<p>
											각 줄은 독립적으로 저장되며 이후 visual planning이 문구를
											바꿀 수 없습니다.
										</p>
									</div>
									<label>
										<b>1행</b>
										<input
											aria-label="승인 제목 첫째 줄"
											disabled={workflow.draftFinalized === true}
											maxLength={36}
											placeholder="첫째 줄 입력"
											value={headlineLine1}
											onChange={(event) => setHeadlineLine1(event.target.value)}
										/>
										<small>{headlineLine1.length}/36</small>
									</label>
									<label>
										<b>2행</b>
										<input
											aria-label="승인 제목 둘째 줄"
											disabled={workflow.draftFinalized === true}
											maxLength={36}
											placeholder="둘째 줄 입력"
											value={headlineLine2}
											onChange={(event) => setHeadlineLine2(event.target.value)}
										/>
										<small>{headlineLine2.length}/36</small>
									</label>
									<div className={styles.ownerVoiceCheck}>
										<input
											id="owner-voice-profile-confirmation"
											type="checkbox"
											disabled={workflow.draftFinalized === true}
											checked={ownerVoiceApproved}
											onChange={(event) =>
												setOwnerVoiceApproved(event.target.checked)
											}
										/>
										<label htmlFor="owner-voice-profile-confirmation">
											<b>owner-voice-v1 프로필 권위 확인</b>
											<small>
												실제 narration과 locked timing 승인은 다음 gate에서
												별도로 필요합니다.
											</small>
										</label>
									</div>
								</div>
							</>
						) : (
							<div className={styles.intakeState}>
								생성기는 caseBrief에서 대본·claim 연결만 자율 작성하고, 별도
								critic은 사실·법률 안전만 pass·reject로 판정합니다.
							</div>
						)}
						<div className={styles.pageActions}>
							<button
								className={styles.secondaryAction}
								disabled={
									busy ||
									autonomousAuthority?.schema !==
					"newsroom-autonomous-narration-v8" ||
									independentCritique?.schema !==
										"newsroom-independent-narration-critique-v8" ||
									independentCritique.decision !== "pass" ||
									workflow.draftFinalized === true
								}
								onClick={() => void saveDraft(false)}
							>
								<Save size={15} /> 검토 대본 저장
							</button>
							<button
								className={styles.primaryAction}
								disabled={
									busy ||
									autonomousAuthority?.schema !==
					"newsroom-autonomous-narration-v8" ||
									independentCritique?.schema !==
										"newsroom-independent-narration-critique-v8" ||
									independentCritique.decision !== "pass" ||
									workflow.draftFinalized === true ||
									!headlineLine1.trim() ||
									!headlineLine2.trim() ||
									!ownerVoiceApproved
								}
								onClick={() => void saveDraft(true)}
							>
								<CheckCircle2 size={15} /> 대본·2줄 제목 확정
							</button>
						</div>

						<section
							className={styles.v9AuthorityMap}
							aria-labelledby="v9-authority-heading"
						>
							<header>
								<div>
									<p className={styles.eyebrow}>
									V9 AUTHORITY MAP · 9:16 · 65–80 SEC
									</p>
									<h2 id="v9-authority-heading">확정 뒤 이어지는 영상 설계</h2>
									<p>
										각 단계는 바로 앞 권위의 exact SHA가 맞아야 열립니다. 아래
										단계는 이 화면에서 수정하거나 자동 실행하지 않습니다.
									</p>
								</div>
								<span>PLANNING ONLY</span>
							</header>
							<ol>
								{v9Stages.map((stage) => {
									const Icon = stage.icon;
									const state = stage.ready
										? "ready"
										: stage.unlocked
											? "current"
											: "locked";
									return (
										<li key={stage.id} data-state={state}>
											<div className={styles.v9StageIndex}>
												{stage.ready ? (
													<CheckCircle2 size={18} />
												) : stage.unlocked ? (
													<Icon size={18} />
												) : (
													<LockKeyhole size={17} />
												)}
												<span>{stage.id}</span>
											</div>
											<div>
												<h3>{stage.title}</h3>
												<code>{stage.contract}</code>
											</div>
											<strong>
												{stage.ready
													? "완료"
													: stage.unlocked
														? "다음 권위"
														: "선행 단계 잠금"}
											</strong>
										</li>
									);
								})}
							</ol>
							<div className={styles.multishotTimingRule}>
								<div>
									<span>GEMINI SOURCE INTENT</span>
									<b>
										<i>4s</i>
										<i>3s</i>
										<i>3s</i>
									</b>
									<p>한 batch 안의 비결정적 멀티샷 의도 · 6–10초 source</p>
								</div>
								<ArrowRight size={22} />
								<div>
									<span>SEALED FINAL CUT</span>
									<b>
										<i>2–3s</i>
										<i>2–3s</i>
										<i>2–3s</i>
									</b>
									<p>
										최종 컷 시간은 semantic cut plan과 locked narration이 결정
									</p>
								</div>
							</div>
							<footer>
								<LockKeyhole size={18} />
								<div>
									<b>실행 권위 없음</b>
									<p>
										Gemini 호출 · production source admission ·
										derivative/render · upload · publication · Stage 07 ·
										continuation은 모두 deferred / unauthorized입니다.
									</p>
								</div>
							</footer>
							<div className={styles.pageActions}>
								<button
									className={styles.primaryAction}
									disabled={busy || !workflow.draftFinalized || sceneBatchReady}
									onClick={() => void prepareSceneBatch()}
								>
									<Film size={15} />
									{sceneBatchReady ? "장면 프롬프트 생성 완료" : "장면 프롬프트 일괄 생성"}
								</button>
								{sceneBatchReady && (
									<>
										<small>
											실제 내레이션에 맞춰 컷 길이를 확정합니다.
										</small>
										<textarea
											aria-label="생성된 장면 프롬프트"
											readOnly
											rows={12}
											value={(workflow.sceneBatch.cuts || [])
												.map((cut, index) =>
													[
														`[${String(cut.cutId || String(index + 1).padStart(3, "0"))}] ${String(cut.narrationText || "").trim()}`,
														`Camera / action: ${String(cut.cameraActionKorean || "")}`,
														`Video prompt: ${String(cut.videoPromptEnglish || "")}`,
														`Risks: ${Array.isArray(cut.risks) ? cut.risks.join(" · ") || "없음" : "없음"}`,
													].join("\n"),
												)
												.join("\n\n")}
										/>
									</>
								)}
							</div>
						</section>
						{productionJobId && (
							<aside className={styles.intakeState} role="status">
								<LockKeyhole size={17} />
								<div>
									<b>기존 제작 결합은 읽기 전용입니다.</b>
									<p>
										{productionStageLabels[productionStage] || productionStage}{" "}
										· v9 provider continuation은 허가되지 않았습니다.
									</p>
								</div>
							</aside>
						)}
					</section>
				)}

				{visibleStages.has("04") && (
					<section className={styles.legalGapDesk}>
						<div>
							<p className={styles.eyebrow}>MEDIA DISCOVERY</p>
							<h2>기사 원문에서 이미지 후보 수집</h2>
						</div>
						{productionJobId ? (
							<p>
								봉인된 storyline·semantic cut plan·board admission을 기준으로
								Grok-ready assembly checkpoint를 준비합니다.
							</p>
						) : migrationRequired ? (
							<p>
								2단계 영상 권위 대기: primary agent가 storyline → semantic cut
								plan → board admission을 저장한 뒤 ‘최종 대본 확정’을 다시
								누르면 검증 작업을 시작합니다.
							</p>
						) : (
							<button
								className={styles.primaryAction}
								disabled={busy || !workflow.draftFinalized}
								onClick={() => void collectMedia()}
							>
								<Search size={16} /> 이미지 후보 찾기
							</button>
						)}
						{!workflow.draftFinalized && (
							<p>03 단계에서 대본을 먼저 확정해야 합니다.</p>
						)}
						{mediaImages.length > 0 && (
							<div>
								{mediaImages.map((image, index) => (
									<article key={String(image.url || index)}>
										<span>{String(index + 1).padStart(2, "0")}</span>
										<h3>
											{String(image.extractionMethod || "기사 이미지 후보")}
										</h3>
										<a
											href={String(image.url)}
											target="_blank"
											rel="noreferrer"
										>
											원본 확인 <ExternalLink size={13} />
										</a>
									</article>
								))}
							</div>
						)}
					</section>
				)}

				{visibleStages.has("05") && (
					<section className={styles.legalGapDesk}>
						<div>
							<p className={styles.eyebrow}>05 / MUSIC PREFLIGHT</p>
							<h2>보도형 BGM 기본 설정</h2>
						</div>
						<p>
							{productionJobId
								? "Grok-ready checkpoint는 provider/render를 자동 실행하지 않습니다."
								: migrationRequired
									? "2단계 영상 권위 admission이 완료되기 전에는 후속 제작을 시작하지 않습니다."
									: "최종 대본 확정 후 2단계 영상 권위를 별도로 봉인합니다."}
						</p>
					</section>
				)}

				{visibleStages.has("06") && (
					<section className={styles.openCutContract}>
						<div>
							<p className={styles.eyebrow}>RENDER + EDITABLE HANDOFF</p>
							<h2>확정 대본으로 영상 생성</h2>
						</div>
						{productionJobId ? (
							<p>
								검증된 계획은 assembly-ready에서 멈춥니다. 별도 provider gate
								전에는 Grok/render/Stage 07/업로드를 실행하지 않습니다.
							</p>
						) : (
							<p>
								{migrationRequired
									? "primary agent의 2단계 authority admission을 기다립니다."
									: "03 단계에서 대본 권위를 먼저 확정합니다."}
							</p>
						)}
						{render && (
							<p>
								작업 {jobId || "-"} · {String(render.state || "대기")} ·{" "}
								{String(render.progress || 0)}%
							</p>
						)}
						{renderCompleted && jobId && (
							<div className={styles.pageActions}>
								<a
									className={styles.secondaryAction}
									href={`/api/newsroom?asset=video&job=${encodeURIComponent(jobId)}`}
									target="_blank"
									rel="noreferrer"
								>
									완성 영상 보기 <ExternalLink size={14} />
								</a>
								<a
									className={styles.primaryAction}
									href={`/automation?job=${encodeURIComponent(jobId)}`}
									target="_blank"
									rel="noreferrer"
								>
									OpenCut에서 편집 <ExternalLink size={14} />
								</a>
							</div>
						)}
					</section>
				)}
				{visibleStages.has("06") && renderCompleted && jobId && (
					<OpenCutEmbed
						src={`/automation?job=${encodeURIComponent(jobId)}`}
						title={`${workflow.title} OpenCut 편집기`}
					/>
				)}

				{visibleStages.has("07") && (
					<>
						<section className={styles.legalGapDesk}>
							<div>
								<p className={styles.eyebrow}>07 / PUBLISH PREFLIGHT</p>
								<h2>최종 영상 재생 검수</h2>
							</div>
							{renderCompleted && jobId ? (
								<video
									controls
									preload="metadata"
									src={`/api/newsroom?asset=video&job=${encodeURIComponent(jobId)}`}
									style={{ width: "min(100%, 360px)", borderRadius: 12 }}
								>
									<track
										kind="captions"
										srcLang="ko"
										label="한국어"
										src={`/api/newsroom?handoffAsset=captions.srt&job=${encodeURIComponent(jobId)}`}
										default
									/>
								</video>
							) : (
								<p>06 단계의 영상 생성이 완료되어야 감사할 수 있습니다.</p>
							)}
						</section>
						<QualityDesk slug={slug} />
					</>
				)}

				{visibleStages.has("08") && <PublishingDesk slug={slug} />}

				{(message || error) && (
					<div className={styles.intakeState} role={error ? "alert" : "status"}>
						{error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
						{error || message}
					</div>
				)}

				<footer className={styles.stageNavigation}>
					{meta.index > 0 ? (
						<Link
							href={`/stories/${encodeURIComponent(slug)}/${meta.index <= 2 ? "research" : meta.index <= 4 ? "script" : meta.index <= 6 ? "editor" : "publish"}`}
						>
							<ArrowLeft size={15} /> 이전 단계
						</Link>
					) : (
						<span />
					)}
					{stageNumber === "03" ? (
						<span className={styles.lockedNextStep}>
							<LockKeyhole size={14} /> owner narration 승인 후 다음 권위
						</span>
					) : meta.index < 7 ? (
						<Link
							href={`/stories/${encodeURIComponent(slug)}/${meta.index <= 2 ? "script" : meta.index <= 6 ? "editor" : "publish"}`}
						>
							다음 단계 <ArrowRight size={15} />
						</Link>
					) : (
						<Link href="/news">
							뉴스룸 <ArrowRight size={15} />
						</Link>
					)}
				</footer>
			</section>
		</NewsroomShell>
	);
}
