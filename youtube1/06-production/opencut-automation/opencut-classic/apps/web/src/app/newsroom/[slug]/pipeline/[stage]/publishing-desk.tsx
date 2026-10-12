"use client";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, CircleAlert, ExternalLink, LoaderCircle, LockKeyhole, PlugZap, RefreshCw, Send, Unplug, Youtube } from "lucide-react";
import styles from "../../../newsroom.module.css";

type CreatorInfo = {
	creatorUsername: string;
	creatorNickname: string;
	privacyLevelOptions: string[];
	commentDisabled: boolean;
	duetDisabled: boolean;
	stitchDisabled: boolean;
	maxVideoPostDurationSec: number;
};

type Provider = {
	id: string;
	label: string;
	availability: "official-api" | "manual-only";
	accountRequirement: string;
	workflow: string;
	publicGate: string;
	aiDisclosure: string;
	officialDocs: string;
	configured: boolean;
	connected: boolean;
	canUpload: boolean;
	connectUrl: string | null;
	missingEnvironment: string[];
	account: { id: string; label: string; scope: string; connectedAt: string } | null;
	creatorInfo: CreatorInfo | null;
};

type Job = {
	id: string;
	provider: "youtube" | "tiktok";
	state: "draft" | "consented" | "uploading" | "processing" | "published" | "failed" | "deleted";
	accountLabel: string;
	title: string;
	privacy: string;
	createdAt: string;
	providerStatus?: string;
	postUrl?: string;
	error?: string;
};

type PublishingOverview = {
	audit: { versionId?: string; publishable?: boolean; uploadBlocked?: boolean } | null;
	release: { versionId: string; duration: number; resolution: { width: number; height: number }; thumbnailUrl: string } | null;
	defaults: { title: string; description: string };
	providers: Provider[];
	jobs: Job[];
};

const privacyLabels: Record<string, string> = {
	private: "비공개",
	unlisted: "일부 공개",
	public: "공개",
	SELF_ONLY: "나만 보기",
	MUTUAL_FOLLOW_FRIENDS: "맞팔 친구",
	FOLLOWER_OF_CREATOR: "팔로워",
	PUBLIC_TO_EVERYONE: "전체 공개",
};

function providerIcon(id: string) {
	if (id === "youtube") return <Youtube size={19} />;
	if (id === "tiktok") return <span className={styles.tiktokMark}>♪</span>;
	return <PlugZap size={18} />;
}

export function PublishingDesk({ slug }: { slug: string }) {
	const [data, setData] = useState<PublishingOverview | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [selected, setSelected] = useState<Record<string, boolean>>({ youtube: true, tiktok: true });
	const youtubePrivacy = "private" as const;
	const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
	const [allowComment, setAllowComment] = useState(false);
	const [allowDuet, setAllowDuet] = useState(false);
	const [allowStitch, setAllowStitch] = useState(false);
	const [consent, setConsent] = useState({ exactFileReviewed: false, metadataReviewed: false, rightsConfirmed: false, aiDisclosureConfirmed: false });
	const [initialized, setInitialized] = useState(false);

	const load = useCallback(async () => {
		setError("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/publishing`, { cache: "no-store" });
			const value = await response.json() as PublishingOverview & { error?: string };
			if (!response.ok) throw new Error(value.error || `Publishing preflight HTTP ${response.status}`);
			setData(value);
			if (!initialized) {
				setTitle(value.defaults.title);
				setDescription(value.defaults.description);
				const tiktok = value.providers.find((provider) => provider.id === "tiktok");
				if (tiktok?.creatorInfo?.privacyLevelOptions.includes("SELF_ONLY")) setTiktokPrivacy("SELF_ONLY");
				else if (tiktok?.creatorInfo?.privacyLevelOptions[0]) setTiktokPrivacy(tiktok.creatorInfo.privacyLevelOptions[0]);
				setInitialized(true);
			}
		} catch (value) {
			setError(value instanceof Error ? value.message : "업로드 상태를 불러오지 못했습니다.");
		}
	}, [initialized, slug]);

	useEffect(() => { void load(); }, [load]);

	const connectedProviders = useMemo(() => data?.providers.filter((provider) => provider.connected && (provider.id === "youtube" || provider.id === "tiktok")) || [], [data]);
	const selectedProviders = connectedProviders.filter((provider) => selected[provider.id]);
	const allConsented = Object.values(consent).every(Boolean);
	const canPublish = Boolean(data?.release && selectedProviders.length > 0 && allConsented && title.trim() && !busy);

	async function disconnect(id: string) {
		setBusy(true);
		setError("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/publishing?provider=${encodeURIComponent(id)}`, { method: "DELETE" });
			const value = await response.json() as { error?: string };
			if (!response.ok) throw new Error(value.error || "연결 해제에 실패했습니다.");
			await load();
		} catch (value) { setError(value instanceof Error ? value.message : "연결 해제에 실패했습니다."); }
		finally { setBusy(false); }
	}

	async function publish() {
		if (!data?.release || !canPublish) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/publishing`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					versionId: data.release.versionId,
					platforms: selectedProviders.map((provider) => provider.id),
					title,
					description,
					consent,
					youtube: { privacyStatus: youtubePrivacy },
					tiktok: { privacyLevel: tiktokPrivacy, allowComment, allowDuet, allowStitch },
				}),
			});
			const value = await response.json() as { error?: string; jobs?: Job[] };
			if (!response.ok && response.status !== 207) throw new Error(value.error || `Upload HTTP ${response.status}`);
			if (value.jobs?.some((job) => job.state === "failed")) setError(value.jobs.filter((job) => job.error).map((job) => `${job.provider}: ${job.error}`).join(" / "));
			setConsent({ exactFileReviewed: false, metadataReviewed: false, rightsConfirmed: false, aiDisclosureConfirmed: false });
			await load();
		} catch (value) { setError(value instanceof Error ? value.message : "업로드 요청에 실패했습니다."); }
		finally { setBusy(false); }
	}

	return (
		<section className={styles.publishingDesk} aria-labelledby="publishing-desk-heading">
			<header>
				<div><p className={styles.eyebrow}>ONE-CLICK DISTRIBUTION</p><h2 id="publishing-desk-heading">한 번 검수하고, 두 채널에 보냅니다.</h2><p>최초 한 번 OAuth로 계정을 연결하면 이후에는 승인된 영상과 메타데이터를 확인한 뒤 YouTube와 TikTok에 함께 업로드할 수 있습니다.</p></div>
				<div data-ready={data?.audit?.publishable === true && data?.audit?.uploadBlocked === false}>{data?.audit?.publishable && data?.audit?.uploadBlocked === false ? "QA APPROVED" : "QA BLOCKED"}</div>
			</header>

			{!data && !error && <div className={styles.qualityNotice}><LoaderCircle className={styles.spin} size={16} /> 플랫폼 연결 상태를 확인하는 중…</div>}
			{error && <div className={styles.qualityError}><CircleAlert size={16} /><span>{error}</span><button type="button" onClick={() => void load()}>다시 확인</button></div>}

			{data?.release && <div className={styles.releaseTicket}>
				<Image src={data.release.thumbnailUrl} alt="업로드할 최종 영상 표지" width={1080} height={1920} unoptimized />
				<div><span>APPROVED MASTER</span><strong>{data.release.versionId}</strong><p>{data.release.resolution.width}×{data.release.resolution.height} · {data.release.duration.toFixed(1)}초 · Stage 07 해시 검증 완료</p></div>
				<Check size={20} />
			</div>}

			{data && <div className={styles.providerGrid}>{data.providers.map((provider) => <article key={provider.id} data-availability={provider.availability} data-connected={provider.connected}>
				<div className={styles.providerTop}><span>{providerIcon(provider.id)} {provider.id.toUpperCase()}</span><em>{provider.availability === "manual-only" ? "수동만 지원" : provider.connected ? "연결됨" : provider.configured ? "연결 가능" : "앱 설정 필요"}</em></div>
				<h3>{provider.label}</h3>
				{provider.connected && provider.account ? <div className={styles.connectedAccount}><Check size={14} /><div><b>{provider.account.label}</b><span>{provider.account.id}</span></div></div> : <p>{provider.accountRequirement}</p>}
				<dl><div><dt>흐름</dt><dd>{provider.workflow}</dd></div><div><dt>공개 조건</dt><dd>{provider.publicGate}</dd></div><div><dt>AI 표시</dt><dd>{provider.aiDisclosure}</dd></div></dl>
				{!!provider.missingEnvironment.length && <div className={styles.providerMissing}><LockKeyhole size={14} /><span>{provider.missingEnvironment.join(", ")}</span></div>}
				<footer>
					<a href={provider.officialDocs} target="_blank" rel="noreferrer">공식 규정 <ExternalLink size={13} /></a>
					{provider.connected ? <button type="button" className={styles.disconnectButton} disabled={busy} onClick={() => void disconnect(provider.id)}><Unplug size={13} /> 연결 해제</button> : provider.connectUrl ? <a className={styles.connectButton} href={provider.connectUrl}><PlugZap size={13} /> 계정 연결</a> : <button type="button" disabled><LockKeyhole size={13} /> 연결 대기</button>}
				</footer>
			</article>)}</div>}

			{data && <div className={styles.publishComposer}>
				<div className={styles.publishComposerHeader}><div><span>UPLOAD MANIFEST</span><h3>업로드 내용 최종 확인</h3></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={14} /> 상태 새로고침</button></div>
				<div className={styles.publishComposerGrid}>
					<div className={styles.metadataFields}>
						<label><span>제목 <b>{title.length}/100</b></span><input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></label>
						<label><span>설명 <b>{description.length}/5000</b></span><textarea value={description} maxLength={5000} rows={8} onChange={(event) => setDescription(event.target.value)} /></label>
					</div>
					<div className={styles.destinationControls}>
						<h4>보낼 채널</h4>
						{connectedProviders.length === 0 && <p className={styles.noConnection}>먼저 YouTube 또는 TikTok 계정을 연결하세요.</p>}
						{connectedProviders.map((provider) => <div className={styles.destinationCard} key={provider.id} data-selected={selected[provider.id] === true}>
							<label className={styles.destinationToggle}><input type="checkbox" checked={selected[provider.id] === true} onChange={(event) => setSelected((current) => ({ ...current, [provider.id]: event.target.checked }))} /><span>{providerIcon(provider.id)} {provider.label}</span></label>
							{provider.id === "youtube" && <label><span>공개 범위</span><select value={youtubePrivacy} disabled><option value="private">비공개</option></select><small>모든 업로드는 비공개로 시작하며 공개 전환은 별도 승인이 필요합니다.</small></label>}
							{provider.id === "tiktok" && <><label><span>공개 범위</span><select value={tiktokPrivacy} onChange={(event) => setTiktokPrivacy(event.target.value)}>{(provider.creatorInfo?.privacyLevelOptions || ["SELF_ONLY"]).map((value) => <option key={value} value={value}>{privacyLabels[value] || value}</option>)}</select><small>{provider.creatorInfo ? `최대 ${provider.creatorInfo.maxVideoPostDurationSec}초 업로드 가능` : "계정 권한을 확인하는 중"}</small></label><div className={styles.interactionToggles}><label><input type="checkbox" checked={allowComment} disabled={provider.creatorInfo?.commentDisabled} onChange={(event) => setAllowComment(event.target.checked)} /> 댓글 허용</label><label><input type="checkbox" checked={allowDuet} disabled={provider.creatorInfo?.duetDisabled} onChange={(event) => setAllowDuet(event.target.checked)} /> 듀엣 허용</label><label><input type="checkbox" checked={allowStitch} disabled={provider.creatorInfo?.stitchDisabled} onChange={(event) => setAllowStitch(event.target.checked)} /> 이어붙이기 허용</label></div></>}
						</div>)}
					</div>
				</div>

				<div className={styles.publishConsent}>
					<div><span>RELEASE CONSENT</span><h4>업로드 버튼을 누르기 전 네 가지를 확인하세요.</h4></div>
					<div className={styles.consentGrid}>
						<label><input type="checkbox" checked={consent.exactFileReviewed} onChange={(event) => setConsent((current) => ({ ...current, exactFileReviewed: event.target.checked }))} /><span>Stage 07에서 승인한 정확한 영상 파일을 확인했습니다.</span></label>
						<label><input type="checkbox" checked={consent.metadataReviewed} onChange={(event) => setConsent((current) => ({ ...current, metadataReviewed: event.target.checked }))} /><span>제목·설명·공개 범위를 직접 확인했습니다.</span></label>
						<label><input type="checkbox" checked={consent.rightsConfirmed} onChange={(event) => setConsent((current) => ({ ...current, rightsConfirmed: event.target.checked }))} /><span>Stage 07의 권리 검토와 경고를 확인했습니다.</span></label>
						<label><input type="checkbox" checked={consent.aiDisclosureConfirmed} onChange={(event) => setConsent((current) => ({ ...current, aiDisclosureConfirmed: event.target.checked }))} /><span>AI 재구성 표시를 두 플랫폼에 함께 전송합니다.</span></label>
					</div>
					<button type="button" className={styles.oneClickPublish} disabled={!canPublish} onClick={() => void publish()}>{busy ? <LoaderCircle className={styles.spin} size={17} /> : <Send size={17} />} {busy ? "업로드 중…" : `${selectedProviders.length || 0}개 채널에 원클릭 업로드`}</button>
				</div>
			</div>}

			{!!data?.jobs.length && <div className={styles.publishJobs}>
				<div><span>DELIVERY LOG</span><h3>최근 업로드</h3></div>
				<ul>{data.jobs.map((job) => <li key={job.id} data-state={job.state}><span>{job.provider.toUpperCase()}</span><div><b>{job.title}</b><small>{job.accountLabel} · {privacyLabels[job.privacy] || job.privacy} · {new Date(job.createdAt).toLocaleString("ko-KR")}</small>{job.error && <em>{job.error}</em>}</div><strong>{job.providerStatus || job.state}</strong>{job.postUrl && <a href={job.postUrl} target="_blank" rel="noreferrer">열기 <ExternalLink size={12} /></a>}</li>)}</ul>
			</div>}

			<div className={styles.publishingPolicy}><CircleAlert size={17} /><p>YouTube는 API 프로젝트 감사를 통과하기 전 비공개 업로드만 허용될 수 있습니다. TikTok은 매번 최신 creator_info를 조회하고 앱 심사 전에는 나만 보기로 제한됩니다. 업로드 후에는 플랫폼 처리·검수 완료까지 상태를 계속 확인합니다.</p></div>
		</section>
	);
}
