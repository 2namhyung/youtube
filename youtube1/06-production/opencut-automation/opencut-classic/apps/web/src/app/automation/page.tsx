"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorCore } from "@/core";
import { importAutomationManifest, parseAutomationManifest } from "@/automation/manifest";

type AutomationStatus = "idle" | "importing" | "ready" | "error";

export default function AutomationPage() {
	const router = useRouter();
	const [manifestFile, setManifestFile] = useState<File | null>(null);
	const [assets, setAssets] = useState<File[]>([]);
	const [status, setStatus] = useState<AutomationStatus>("idle");
	const [message, setMessage] = useState("Select a manifest and its assets.");

	const handleImport = async () => {
		if (!manifestFile) return;
		setStatus("importing");
		try {
			const manifest = parseAutomationManifest(await manifestFile.text());
			const result = await importAutomationManifest({
				editor: EditorCore.getInstance(),
				manifest,
				files: assets,
				onProgress: (progress) => {
					setMessage(progress);
					(window as Window & { __OPENCUT_AUTOMATION__?: unknown }).__OPENCUT_AUTOMATION__ = {
						status: "importing",
						progress,
					};
				},
			});
			setStatus("ready");
			setMessage(`Project ${result.projectId} is ready.`);
			(document.body as HTMLElement).dataset.automationProjectId = result.projectId;
			(window as Window & { __OPENCUT_AUTOMATION__?: unknown }).__OPENCUT_AUTOMATION__ = {
				status: "ready",
				projectId: result.projectId,
			};
			router.push(`/editor/${result.projectId}`);
		} catch (error) {
			setStatus("error");
			setMessage(error instanceof Error ? error.message : "Import failed");
			(window as Window & { __OPENCUT_AUTOMATION__?: unknown }).__OPENCUT_AUTOMATION__ = {
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-8">
			<section className="flex w-full max-w-xl flex-col gap-5 rounded-xl border p-6 shadow-sm">
				<h1 className="text-xl font-semibold">OpenCut automation importer</h1>
				<p className="text-sm text-muted-foreground">Manifest-driven local import. Files are stored through OpenCut&apos;s media manager and OPFS.</p>
				<label className="flex flex-col gap-2 text-sm font-medium">
					Manifest JSON
					<input data-testid="manifest-input" type="file" accept="application/json,.json" onChange={(event) => setManifestFile(event.target.files?.[0] ?? null)} />
				</label>
				<label className="flex flex-col gap-2 text-sm font-medium">
					Assets (video, audio, image, SRT)
					<input data-testid="asset-input" type="file" multiple onChange={(event) => setAssets(Array.from(event.target.files ?? []))} />
				</label>
				<button data-testid="import-button" type="button" disabled={!manifestFile || status === "importing"} onClick={handleImport} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
					{status === "importing" ? "Importing..." : "Create project"}
				</button>
				<Link
					href="/renders"
					className="rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-accent"
				>
					최종 영상 미리보기
				</Link>
				<p data-testid="automation-status" className="text-sm text-muted-foreground">{message}</p>
			</section>
		</main>
	);
}
