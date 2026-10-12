"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Download, ExternalLink, Image as ImageIcon, RefreshCcw } from "lucide-react";
import type { RenderMetadata } from "@/app/api/renders/registry";
import styles from "../../../newsroom.module.css";

type ThumbnailRenderMetadata = Pick<RenderMetadata, "versionId"> & Partial<Pick<RenderMetadata, "title" | "thumbnail" | "duration" | "resolution">>;

function isRenderMetadata(value: unknown): value is ThumbnailRenderMetadata {
	if (!value || typeof value !== "object") return false;
	const metadata = value as Partial<ThumbnailRenderMetadata>;
	return typeof metadata.versionId === "string" && metadata.versionId.length > 0;
}

export function ThumbnailReview() {
	const [metadata, setMetadata] = useState<ThumbnailRenderMetadata | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [imageError, setImageError] = useState(false);
	const [imageRevision, setImageRevision] = useState(0);

	const loadLatest = useCallback(async () => {
		setLoading(true);
		setError("");
		setImageError(false);
		try {
			const response = await fetch("/api/renders/meta", { cache: "no-store" });
			const body: unknown = await response.json();
			if (!response.ok) {
				const apiMessage = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "최신 등록 렌더를 불러오지 못했습니다.";
				throw new Error(apiMessage);
			}
			if (!isRenderMetadata(body)) throw new Error("최신 렌더 메타데이터가 올바르지 않습니다.");
			setMetadata(body);
			setImageRevision((revision) => revision + 1);
		} catch (loadError) {
			setMetadata(null);
			setError(loadError instanceof Error ? loadError.message : "최신 렌더를 불러오지 못했습니다.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const request = async () => { await loadLatest(); };
		void request();
	}, [loadLatest]);

	const thumbnailUrl = metadata ? `/api/renders/final/thumbnail?versionId=${encodeURIComponent(metadata.versionId)}` : "";
	const renderUrl = metadata ? `/api/renders/final?versionId=${encodeURIComponent(metadata.versionId)}` : "";
	const resolution = metadata?.resolution?.width && metadata.resolution.height ? `${metadata.resolution.width} × ${metadata.resolution.height}` : "9:16 세로 렌더";

	return (
		<section className={styles.thumbnailReview} aria-labelledby="thumbnail-review-heading">
			<header className={styles.thumbnailReviewHeader}>
				<div>
					<p className={styles.eyebrow}>FINAL RENDER / THUMBNAIL CHECK</p>
					<h2 id="thumbnail-review-heading">영상 표지 검수</h2>
					<p>최신 등록 렌더에 지정된 전용 세로형 썸네일을 확인하고 원본을 열거나 PNG로 내려받습니다.</p>
				</div>
				<button type="button" className={styles.thumbnailReviewRefresh} onClick={() => void loadLatest()} disabled={loading}>
					<RefreshCcw size={14} /> {loading ? "불러오는 중" : "새로고침"}
				</button>
			</header>

			{loading && <div className={styles.thumbnailReviewLoading} role="status" aria-live="polite"><ImageIcon size={18} /> 최신 렌더 메타데이터를 불러오는 중…</div>}
			{!loading && error && (
				<div className={styles.thumbnailReviewError} role="alert">
					<AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => void loadLatest()}>다시 시도</button>
				</div>
			)}
			{!loading && metadata && (
				<div className={styles.thumbnailReviewBody}>
					<div className={styles.thumbnailReviewPreview}>
						{imageError ? <div className={styles.thumbnailReviewImageError} role="alert"><AlertTriangle size={18} /><span>썸네일을 불러오지 못했습니다.</span></div> : <Image key={`${metadata.versionId}-${imageRevision}`} src={thumbnailUrl} alt={`${metadata.title || "최신 등록 렌더"} 영상 표지`} width={1080} height={1920} unoptimized onError={() => setImageError(true)} />}
					</div>
					<div className={styles.thumbnailReviewDetails}>
						<p className={styles.thumbnailReviewLabel}>REGISTERED VERSION</p>
						<h3>{metadata.title || "최신 등록 렌더"}</h3>
						<dl>
							<div><dt>버전</dt><dd><code>{metadata.versionId}</code></dd></div>
							<div><dt>비율</dt><dd>{resolution}</dd></div>
							{metadata.duration ? <div><dt>길이</dt><dd>{metadata.duration.toFixed(1)}초</dd></div> : null}
						</dl>
						<div className={styles.thumbnailReviewActions}>
							<a href={renderUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> 원본 열기</a>
							<a href={thumbnailUrl} download={`${metadata.versionId}.png`}><Download size={14} /> PNG 다운로드</a>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
