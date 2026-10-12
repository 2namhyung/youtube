import { NextResponse } from "next/server";
import { createOAuthAuthorization, isPublishingProvider } from "@/newsroom/publishing-server";

/* eslint-disable opencut/prefer-object-params */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string; provider: string }> }) {
	const { slug, provider } = await context.params;
	if (!isPublishingProvider(provider)) return NextResponse.json({ error: "Unsupported provider." }, { status: 404 });
	try {
		return NextResponse.redirect(await createOAuthAuthorization(request, slug, provider));
	} catch (error) {
		const message = error instanceof Error ? error.message : "OAuth initialization failed.";
		return NextResponse.redirect(new URL(`/newsroom/${encodeURIComponent(slug)}/pipeline?stage=08&publishingError=${encodeURIComponent(message)}`, request.url));
	}
}
