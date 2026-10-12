"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Maximize2, RefreshCcw } from "lucide-react";
import styles from "../../../newsroom.module.css";

type OpenCutEmbedProps = {
	src: string;
	title?: string;
};

export function OpenCutEmbed({ src, title = "OpenCut 편집기" }: OpenCutEmbedProps) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [frameKey, setFrameKey] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	const reload = useCallback(() => {
		setLoading(true);
		setError(false);
		setFrameKey((key) => key + 1);
	}, []);

	const enterFullscreen = useCallback(() => {
		const frame = frameRef.current;
		if (frame?.requestFullscreen) {
			void frame.requestFullscreen().catch(() => {
				window.open(src, "_blank", "noopener,noreferrer");
			});
			return;
		}
		window.open(src, "_blank", "noopener,noreferrer");
	}, [src]);

	return (
		<section className={styles.openCutEmbed} aria-labelledby="opencut-embed-heading">
			<header className={styles.openCutEmbedHeader}>
				<div>
					<p className={styles.eyebrow}>LIVE EDITOR / SAME ORIGIN</p>
					<h2 id="opencut-embed-heading">OpenCut 편집 데스크</h2>
					<p>이 파이프라인 화면에서 프로젝트를 바로 확인하고 편집할 수 있습니다.</p>
				</div>
				<div className={styles.openCutEmbedActions}>
					<a href={src} target="_blank" rel="noreferrer" className={styles.openCutEmbedAction}>
						<ExternalLink size={14} /> 새 창
					</a>
					<button type="button" className={styles.openCutEmbedAction} onClick={enterFullscreen}>
						<Maximize2 size={14} /> 전체 화면
					</button>
					<button type="button" className={styles.openCutEmbedAction} onClick={reload} disabled={loading}>
						<RefreshCcw size={14} /> 새로고침
					</button>
				</div>
			</header>

			<div className={styles.openCutEmbedFrame} data-loading={loading} data-error={error}>
				<iframe
					key={frameKey}
					ref={frameRef}
					src={src}
					title={title}
					onLoad={() => { setLoading(false); setError(false); }}
					onError={() => { setLoading(false); setError(true); }}
				/>
				{loading && !error && <div className={styles.openCutEmbedOverlay} role="status" aria-live="polite">OpenCut 편집기 불러오는 중…</div>}
				{error && (
					<div className={styles.openCutEmbedOverlay} role="alert">
						<AlertTriangle size={18} />
						<div><b>편집기를 불러오지 못했습니다.</b><p>잠시 후 다시 시도하거나 새 창에서 열어 주세요.</p><button type="button" onClick={reload}>다시 시도</button></div>
					</div>
				)}
			</div>
		</section>
	);
}
