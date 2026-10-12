import { NextResponse } from "next/server";
import { assertNewsroomSlug } from "@/newsroom/project-runtime";
import { disconnectProvider, getPublishingOverview, isPublishingProvider, publishApprovedRelease, repairYouTubePublishedJob, type PublishRequest, type YouTubeRepairRequest } from "@/newsroom/publishing-server";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorResponse(error: unknown, status = 400) {
	return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing request failed." }, { status });
}

function assertTrustedMutation(request: Request) {
	const requestUrl = new URL(request.url);
	const origin = request.headers.get("origin");
	if (origin && origin !== requestUrl.origin) throw new Error("Cross-origin publishing requests are blocked.");
	const isLoopback = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1" || requestUrl.hostname === "::1";
	if (!isLoopback && process.env.PUBLISHING_ALLOW_REMOTE_MUTATIONS !== "true") {
		throw new Error("Remote publishing mutations are disabled. Keep the operator UI local or explicitly enable authenticated remote mutations.");
	}
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
	const { slug } = await context.params;
	try {
		return NextResponse.json(await getPublishingOverview(assertNewsroomSlug(slug)), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return errorResponse(error, 500);
	}
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
	const { slug } = await context.params;
	try {
		assertNewsroomSlug(slug);
		assertTrustedMutation(request);
		const body = await request.json() as PublishRequest;
		const jobs = await publishApprovedRelease(slug, body);
		return NextResponse.json({ jobs }, { status: jobs.some((job) => job.state === "failed") ? 207 : 202 });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
	const { slug } = await context.params;
	try {
		assertTrustedMutation(request);
		const body = await request.json() as YouTubeRepairRequest;
		return NextResponse.json(await repairYouTubePublishedJob(assertNewsroomSlug(slug), body));
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
	const { slug } = await context.params;
	try {
		assertNewsroomSlug(slug);
		assertTrustedMutation(request);
		const provider = new URL(request.url).searchParams.get("provider") || "";
		if (!isPublishingProvider(provider)) return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
		await disconnectProvider(provider);
		return NextResponse.json({ disconnected: provider });
	} catch (error) {
		return errorResponse(error);
	}
}
