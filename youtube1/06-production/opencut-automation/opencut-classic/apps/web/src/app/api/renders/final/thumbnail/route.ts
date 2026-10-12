import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { fallbackRenderPath, getLatestRender, hasExplicitRegistry } from "../../registry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	try {
		const requestedVersion = request.nextUrl.searchParams.get("versionId");
		const latest = await getLatestRender(requestedVersion ?? undefined);
		if (!latest && requestedVersion !== null) return Response.json({ error: "Requested render version is not available." }, { status: 404 });
		if (!latest && hasExplicitRegistry()) return Response.json({ error: "Configured render registry is invalid or unavailable." }, { status: 503 });
		const fallback = fallbackRenderPath();
		if (!latest && !fallback) return Response.json({ error: "No registered render is available." }, { status: 404 });
		const image = await readFile(latest?.thumbnailPath || `${path.join(path.dirname(fallback!), path.basename(fallback!, ".mp4"))}-0_5.png`);
		return new Response(image, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "image/png",
			},
		});
	} catch {
		return Response.json(
			{ error: "Final render thumbnail is not available." },
			{ status: 404 },
		);
	}
}
