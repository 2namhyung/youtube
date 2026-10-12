"use client";

import { useEffect, useState } from "react";
import styles from "../../../newsroom.module.css";

type BgmState = { status?: string; reason?: string; provider?: string; prompt?: string; audio?: string };

export function BgmDesk({ slug }: { slug: string }) {
	const [provider, setProvider] = useState("stable-audio-3");
	const [prompt, setPrompt] = useState("restrained investigative news background music, subtle tension, no vocals");
	const [audio, setAudio] = useState("");
	const [state, setState] = useState<BgmState | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		void fetch(`/api/newsroom/projects/${slug}/media`).then((response) => response.json()).then((body) => setState(body.bgm || null)).catch(() => undefined);
	}, [slug]);

	async function save() {
		setBusy(true); setMessage("");
		try {
			const response = await fetch(`/api/newsroom/projects/${slug}/media`, {
				method: "POST", headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "bgm", provider, prompt, audio: audio || undefined }),
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || "BGM 설정을 저장하지 못했습니다.");
			setState(body.bgm || null);
			setMessage(body.bgm?.status === "unavailable" ? body.bgm.reason : "BGM 생성 설정을 저장했습니다.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally { setBusy(false); }
	}

	return (
		<section className={styles.bgmDesk} aria-labelledby="bgm-desk-heading">
			<div><p className={styles.eyebrow}>MOOD TO MUSIC CONTRACT</p><h2 id="bgm-desk-heading">대본과 화면의 긴장을 음향 설계로 고정</h2></div>
			<p className={styles.bgmIntro}>이 단계는 음악을 즉시 생성하지 않습니다. 생성 모델·프롬프트·seed·권리 정보를 먼저 고정하고, 승인된 음원이 생기면 OpenCut의 내레이션과 분리된 오디오 트랙으로 인계합니다.</p>
			<div className={styles.bgmForm}>
				<label>생성 방식<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="stable-audio-3">Stable Audio 3</option><option value="ace-step-1.5">ACE-Step 1.5</option><option value="local-file">검증된 로컬 음원</option></select></label>
				<label>분위기 프롬프트<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
				<label>로컬 음원 경로 <small>local-file일 때만</small><input value={audio} onChange={(event) => setAudio(event.target.value)} placeholder="workspace 안의 승인된 음원" /></label>
				<button type="button" onClick={() => void save()} disabled={busy}>{busy ? "저장 중…" : "BGM 계약 저장"}</button>
			</div>
			<div className={styles.bgmStatus} data-ready={state?.status === "ready"}><b>현재 상태</b><span>{state?.status || "pending"}</span><p>{state?.reason || message || "제주 사건은 아직 BGM 파일이 없어 별도 트랙이 pending입니다."}</p></div>
		</section>
	);
}
