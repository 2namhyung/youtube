import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { loadProductionScriptDesk } from "@/newsroom/production-script-desk";
import { assertNewsroomSlug, automationRoot } from "@/newsroom/project-runtime";

/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request/context parameters. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const executeFile = promisify(execFile);
type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { slug } = await context.params;
		const state = await loadProductionScriptDesk(assertNewsroomSlug(slug));
		return NextResponse.json(state ?? { error: "Production script binding is not configured." }, { status: state ? 200 : 404, headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Production script QA is unavailable." }, { status: 500 });
	}
}

export async function POST(_request: Request, context: RouteContext) {
	try {
		const { slug } = await context.params;
		assertNewsroomSlug(slug);
		await executeFile(process.execPath, [path.join(automationRoot(), "scripts", "sync-production-script-qa.mjs"), "--slug", slug], { cwd: automationRoot(), timeout: 30_000, windowsHide: true });
		return NextResponse.json(await loadProductionScriptDesk(slug), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Production script QA refresh failed." }, { status: 500 });
	}
}
