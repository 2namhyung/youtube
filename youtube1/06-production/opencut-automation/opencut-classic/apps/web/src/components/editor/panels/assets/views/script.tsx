"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeToSeconds } from "@/wasm";
import type { TScene, TextElement } from "@/timeline";

type ScriptCue = {
	trackId: string;
	element: TextElement;
	text: string;
};

function formatTimecode(time: number): string {
	const totalSeconds = Math.max(0, Math.floor(time));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getNarrationCues(scene: TScene | null): ScriptCue[] {
	if (!scene) return [];

	return scene.tracks.overlay
		.filter((track) => track.type === "text")
		.flatMap((track) =>
			track.elements.flatMap((element) => {
				const rawText = element.params.content;
				const text = typeof rawText === "string" ? rawText.trim() : "";
				// Automation text tracks use the stable `Title` element name. Keep the
				// localized fallback for projects created before that importer existed.
				const importedTitle =
					element.name === "Title" || track.name === "Title";
				const titleLike =
					importedTitle ||
					/(^|\s)(title|제목)(\s|\d|$)/i.test(`${track.name} ${element.name}`);
				if (!text || titleLike || element.duration <= 0) return [];
				return [{ trackId: track.id, element, text }];
			}),
		)
		.sort((a, b) => a.element.startTime - b.element.startTime);
}

export function ScriptView() {
	const scene = useEditor((editor) => editor.scenes.getActiveSceneOrNull());
	const editor = useEditor();
	const selectedElements = useEditor((currentEditor) =>
		currentEditor.selection.getSelectedElements(),
	);
	const [query, setQuery] = useState("");
	const [showFullText, setShowFullText] = useState(false);
	const [copied, setCopied] = useState(false);
	const cues = useMemo(() => getNarrationCues(scene), [scene]);
	const filteredCues = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) return cues;
		return cues.filter((cue) =>
			cue.text.toLocaleLowerCase().includes(normalizedQuery),
		);
	}, [cues, query]);
	const fullText = cues.map((cue) => cue.text).join("\n\n");
	const totalDuration = editor.timeline.getTotalDuration();

	const copyScript = async () => {
		if (!fullText) return;
		try {
			await navigator.clipboard.writeText(fullText);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	};

	return (
		<section
			className="flex h-full min-h-0 flex-col bg-background"
			data-testid="script-panel"
			aria-labelledby="script-panel-title"
		>
			<div className="border-b px-3 py-3">
				<div className="flex items-start justify-between gap-2">
					<div>
						<p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
							타임라인 / 나레이션
						</p>
						<h2
							id="script-panel-title"
							className="mt-1 text-sm font-semibold tracking-tight"
						>
							대본
						</h2>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-7 shrink-0 px-2 text-[11px]"
						onClick={copyScript}
						disabled={!fullText}
						data-testid="script-copy-button"
						aria-label="대본 전체 복사"
					>
						{copied ? "복사됨" : "복사"}
					</Button>
				</div>
				<div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
					<span className="rounded-sm border border-border/70 px-1.5 py-0.5 tabular-nums">
						{cues.length}개 큐
					</span>
					<span className="text-border">/</span>
					<span className="tabular-nums">
						{formatTimecode(mediaTimeToSeconds({ time: totalDuration }))}
					</span>
					<span className="ml-auto">
						{filteredCues.length !== cues.length
							? `${filteredCues.length} 표시`
							: "전체"}
					</span>
				</div>
				<div className="mt-2 flex gap-2">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="대본 검색"
						className="h-8 bg-muted/20 text-xs"
						aria-label="대본 검색"
						data-testid="script-search-input"
					/>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 shrink-0 px-2 text-[11px] text-muted-foreground"
						onClick={() => setShowFullText((visible) => !visible)}
						aria-expanded={showFullText}
						data-testid="script-full-text-toggle"
					>
						전체 텍스트 보기
					</Button>
				</div>
			</div>

			{showFullText && fullText ? (
				<div className="max-h-40 overflow-y-auto border-b bg-muted/10 px-3 py-3">
					<p
						className="whitespace-pre-wrap text-xs leading-5 text-foreground/85"
						data-testid="script-full-text"
					>
						{fullText}
					</p>
				</div>
			) : null}

			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{filteredCues.length > 0 ? (
					<div className="space-y-1">
						{filteredCues.map((cue, index) => {
							const startSeconds = mediaTimeToSeconds({
								time: cue.element.startTime,
							});
							const selected = selectedElements.some(
								(ref) =>
									ref.trackId === cue.trackId &&
									ref.elementId === cue.element.id,
							);
							return (
								<button
									key={cue.element.id}
									type="button"
									className={`group flex w-full gap-2 rounded-sm border px-2 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 ${selected ? "border-foreground/35 bg-muted/50" : "border-transparent"}`}
									onClick={() => {
										editor.playback.seek({ time: cue.element.startTime });
										editor.selection.setSelectedElements({
											elements: [
												{ trackId: cue.trackId, elementId: cue.element.id },
											],
										});
									}}
									data-testid="script-cue"
									aria-label={`${formatTimecode(startSeconds)} ${cue.text}`}
								>
									<span className="w-10 shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
										{formatTimecode(startSeconds)}
									</span>
									<span className="min-w-0 flex-1 text-xs leading-5 text-foreground/90">
										{cue.text}
									</span>
									<span className="pt-1 text-[9px] tabular-nums text-muted-foreground/60">
										{String(index + 1).padStart(2, "0")}
									</span>
								</button>
							);
						})}
					</div>
				) : (
					<div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
						<p className="text-sm font-medium">
							{query ? "검색 결과가 없습니다" : "아직 대본이 없습니다"}
						</p>
						<p className="mt-1 text-xs leading-5 text-muted-foreground">
							{query
								? "다른 단어로 검색해 보세요."
								: "타임라인에 나레이션 캡션을 추가하면 여기에 표시됩니다."}
						</p>
					</div>
				)}
			</div>
		</section>
	);
}
