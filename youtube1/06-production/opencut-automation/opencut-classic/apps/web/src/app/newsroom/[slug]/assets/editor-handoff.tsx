"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Scissors } from "lucide-react";
import { EditorCore } from "@/core";
import { importRegisteredRender } from "@/automation/newsroom-handoff";
import { CANONICAL_EDITOR_PROJECT_ID } from "@/newsroom/project";
import styles from "../../newsroom.module.css";

type LatestRender = { versionId: string; title?: string; duration?: number; resolution?: { width: number; height: number } };

export function EditorHandoff({ latest }: { latest: LatestRender | null }) {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");

	async function openEditor() {
		if (loading) return;
		if (!latest) {
			router.push(`/editor/${CANONICAL_EDITOR_PROJECT_ID}`);
			return;
		}
		setLoading(true);
		setMessage("최종 렌더와 편집 자산을 연결하는 중…");
		try {
			window.localStorage.setItem(`opencut:render-project:${latest.versionId}`, CANONICAL_EDITOR_PROJECT_ID);
			window.localStorage.setItem("opencut:render-project:latest", CANONICAL_EDITOR_PROJECT_ID);
			const result = await importRegisteredRender({
				editor: EditorCore.getInstance(),
				versionId: latest.versionId,
				title: latest.title,
				duration: latest.duration,
				resolution: latest.resolution,
				onProgress: setMessage,
			});
			router.push(`/editor/${result.projectId}`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "OpenCut 연결에 실패했습니다.");
			setLoading(false);
		}
	}

	return (
		<div>
			<button type="button" className={styles.editorButton} onClick={() => void openEditor()} disabled={loading}>
				{loading ? <LoaderCircle className={styles.spin} size={17} /> : <Scissors size={17} />} OpenCut에서 편집 <ArrowRight size={17} />
			</button>
			{message && <p className={styles.handoffMessage} aria-live="polite">{message}</p>}
		</div>
	);
}
