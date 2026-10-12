"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import {
	importRegisteredRender,
	registeredRenderMarker,
} from "@/automation/newsroom-handoff";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

const CANONICAL_NEWSROOM_PROJECT_ID = "0986312f-e8a4-4354-8725-9134e71e247c";
const renderSyncPromises = new Map<string, Promise<void>>();

type LatestRenderMetadata = {
	versionId: string;
	title?: string;
	duration?: number;
	resolution?: { width: number; height: number };
};

function appliedRenderKey(projectId: string) {
	return `opencut:project-render-version:${projectId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseLatestRenderMetadata(value: unknown): LatestRenderMetadata | null {
	if (!isRecord(value) || typeof value.versionId !== "string") return null;
	const resolution = isRecord(value.resolution)
		&& typeof value.resolution.width === "number"
		&& typeof value.resolution.height === "number"
		? { width: value.resolution.width, height: value.resolution.height }
		: undefined;
	return {
		versionId: value.versionId,
		...(typeof value.title === "string" ? { title: value.title } : {}),
		...(typeof value.duration === "number" ? { duration: value.duration } : {}),
		...(resolution ? { resolution } : {}),
	};
}

async function syncLatestRegisteredRender({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	const latestResponse = await fetch("/api/renders/meta", { cache: "no-store" });
	if (!latestResponse.ok) return;
	const latest = parseLatestRenderMetadata(await latestResponse.json());
	if (!latest) throw new Error("Invalid latest render metadata");
	if (!/^[A-Za-z0-9_-]+$/.test(latest.versionId)) return;

	const marker = registeredRenderMarker(latest.versionId);
	if (window.localStorage.getItem(appliedRenderKey(projectId)) === marker) return;
	const syncKey = `${projectId}:${marker}`;
	let sync = renderSyncPromises.get(syncKey);
	if (!sync) {
		sync = (async () => {
			const imported = await importRegisteredRender({
				editor,
				versionId: latest.versionId,
				title: latest.title,
				duration: latest.duration,
				resolution: latest.resolution,
			});
			window.localStorage.setItem(appliedRenderKey(imported.projectId), marker);
		})();
		renderSyncPromises.set(syncKey, sync);
	}
	await sync;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());
				await editor.project.loadProject({ id: projectId });
				if (projectId === CANONICAL_NEWSROOM_PROJECT_ID) {
					await syncLatestRegisteredRender({ editor, projectId });
				}

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const isCanonicalNewsroomProject = projectId === CANONICAL_NEWSROOM_PROJECT_ID;
						const newProjectId = await editor.project.createNewProject({
							name: isCanonicalNewsroomProject ? "제주 초등학교 교실 침입 사건" : "Untitled Project",
							...(isCanonicalNewsroomProject ? { id: projectId } : {}),
						});
						router.replace(`/editor/${newProjectId}`);
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
