import { getLatestRender, hasExplicitRegistry } from "../registry";

export const runtime = "nodejs";

export async function GET() {
	const latest = await getLatestRender();
	if (!latest && hasExplicitRegistry()) return Response.json({ error: "Configured render registry is invalid or unavailable." }, { status: 503 });
	if (!latest) return Response.json({ error: "No registered render is available." }, { status: 404 });
	const publicMetadata = Object.fromEntries(Object.entries(latest.metadata).filter(([key]) => key !== "path" && key !== "thumbnailPath"));
	return Response.json(
		publicMetadata,
		{ headers: { "Cache-Control": "no-store" } },
	);
}
