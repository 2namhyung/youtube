import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	Download04Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { getLatestRender } from "../api/renders/registry";

const VIDEO_URL = "/api/renders/final";
export const dynamic = "force-dynamic";

export default async function RendersPage() {
	const latest = await getLatestRender();
	const metadata = latest?.metadata;
	if (!latest || !metadata) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-[#080b12] px-6 text-white">
				<section
					aria-labelledby="render-unavailable-heading"
					data-testid="render-unavailable"
					className="max-w-lg rounded-2xl border border-white/12 bg-white/5 p-8 text-center"
				>
					<div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
						<HugeiconsIcon icon={Video01Icon} className="size-5" />
					</div>
					<h1 id="render-unavailable-heading" className="text-2xl font-semibold">
						Final render unavailable
					</h1>
					<p className="mt-3 text-sm leading-6 text-white/55">
						Run the production command to create and register a render, then
						reload this page.
					</p>
					<Button asChild variant="outline" className="mt-6 border-white/15 bg-transparent text-white hover:bg-white/10">
						<Link href="/projects">
							<HugeiconsIcon icon={ArrowLeft01Icon} />
							Back to projects
						</Link>
					</Button>
				</section>
			</main>
		);
	}
	const fileName = metadata?.fileName || "final-render.mp4";
	const videoUrl = metadata?.versionId ? `${VIDEO_URL}?versionId=${encodeURIComponent(metadata.versionId)}` : VIDEO_URL;
	return (
		<main className="min-h-screen bg-[#080b12] text-white">
			<div className="mx-auto grid min-h-screen max-w-6xl gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:px-10">
				<section className="flex min-h-0 items-center justify-center">
					<div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[min(100%,27rem)] overflow-hidden rounded-[1.6rem] border border-white/12 bg-black shadow-[0_32px_90px_rgba(0,0,0,0.55)]">
						<video
							data-testid="final-render-video"
							className="aspect-[9/16] max-h-[calc(100vh-3rem)] w-full bg-black object-contain"
							src={videoUrl}
							controls
							preload="metadata"
							playsInline
						>
							<track kind="captions" />
							브라우저가 HTML5 비디오를 지원하지 않습니다.
						</video>
					</div>
				</section>

				<aside className="flex flex-col gap-7 pb-4 lg:pb-0">
					<div className="flex items-center justify-between">
						<Button asChild variant="ghost" className="text-white hover:bg-white/10">
							<Link href="/projects">
								<HugeiconsIcon icon={ArrowLeft01Icon} />
								프로젝트
							</Link>
						</Button>
						<span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
							레퍼런스 스타일 V3
						</span>
					</div>

					<div className="space-y-3">
						<div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
							<HugeiconsIcon icon={Video01Icon} className="size-5" />
						</div>
						<h1 className="text-3xl font-semibold tracking-[-0.035em]">
							{metadata?.title || "Final render"}
						</h1>
						<p className="text-sm leading-6 text-white/55">
							OpenCut 자동 편집 파이프라인에서 생성한 세로형 쇼츠 최종본입니다.
						</p>
					</div>

					<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-sm">
						<div className="bg-[#0d111a] p-4">
							<dt className="text-white/40">화면</dt>
							<dd className="mt-1 font-medium">{metadata?.resolution ? `${metadata.resolution.width} × ${metadata.resolution.height}` : "1080 × 1920"}</dd>
						</div>
						<div className="bg-[#0d111a] p-4">
							<dt className="text-white/40">재생 시간</dt>
							<dd className="mt-1 font-medium">{metadata?.duration ? `${Math.floor(metadata.duration / 60).toString().padStart(2, "0")}:${Math.floor(metadata.duration % 60).toString().padStart(2, "0")}` : "—"}</dd>
						</div>
						<div className="bg-[#0d111a] p-4">
							<dt className="text-white/40">프레임</dt>
							<dd className="mt-1 font-medium">30 fps</dd>
						</div>
						<div className="bg-[#0d111a] p-4">
							<dt className="text-white/40">포맷</dt>
							<dd className="mt-1 font-medium">MP4 · H.264</dd>
						</div>
					</dl>

					<Button asChild size="lg" className="h-12 w-full">
						<a
							href={videoUrl}
							download={fileName}
						>
							<HugeiconsIcon icon={Download04Icon} />
							최종 영상 다운로드
						</a>
					</Button>
				</aside>
			</div>
		</main>
	);
}
