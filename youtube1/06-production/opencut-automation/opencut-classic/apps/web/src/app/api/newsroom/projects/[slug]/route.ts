import { NextResponse } from "next/server";
import { loadScriptState } from "@/newsroom/store";
import { assertNewsroomSlug } from "@/newsroom/project-runtime";

/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional Request and context parameters. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { slug } = await context.params;
	try {
		return NextResponse.json(await loadScriptState(assertNewsroomSlug(slug)), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Canonical newsroom script unavailable" }, { status: 500 });
	}
}


export async function PATCH(_request: Request, context: RouteContext) {
	const { slug } = await context.params;
	try { assertNewsroomSlug(slug); } catch { return NextResponse.json({ error: "Invalid newsroom project" }, { status: 404 }); }
	return NextResponse.json({ error: "Use the project workflow endpoint to edit scripts." }, { status: 405 });
}

export async function POST(_request: Request, context: RouteContext) {
	const { slug } = await context.params;
	try { assertNewsroomSlug(slug); } catch { return NextResponse.json({ error: "Invalid newsroom project" }, { status: 404 }); }
	return NextResponse.json({ error: "Use the project workflow endpoint to edit scripts." }, { status: 405 });
}
