/* eslint-disable opencut/prefer-object-params */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { persistNewsroomResearch } from "@/newsroom/registry";
import { acquireProjectMutationLock, releaseProjectMutationLock, type ProjectMutationLock } from "@/newsroom/project-mutation-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/;
function assertSlug(slug: string) { if (!SAFE_SLUG.test(slug)) throw new Error("Invalid newsroom project slug"); return slug; }
function rootDir() {
  let cursor = path.resolve(process.cwd());
  for (let i = 0; i < 8; i += 1) { if (existsSync(path.join(cursor, "scripts", "research-pipeline.mjs"))) return cursor; const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent; }
  return path.resolve(process.cwd());
}
function snapshotPath(slug: string) { return path.join(rootDir(), "production", "newsroom", "projects", `${slug}.research.json`); }
function workflowPath(slug: string) { return path.join(rootDir(), "production", "newsroom", "projects", `${slug}.workflow.json`); }
async function load(slug: string) { try { return JSON.parse(await readFile(snapshotPath(slug), "utf8")); } catch { return null; } }
function refresh(slug: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir(), "scripts", "research-pipeline.mjs"), "--slug", slug], { cwd: rootDir(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let error = "";
    child.stdout.on("data", (chunk) => { out += String(chunk); }); child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(error.slice(-600) || `research exited ${code}`)));
  });
}
export async function GET(_request: Request, context: Context) {
  try { const { slug } = await context.params; return NextResponse.json({ snapshot: await load(assertSlug(slug)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); return NextResponse.json({ error: message }, { status: message === "Invalid newsroom project slug" ? 400 : 500 }); }
}
export async function POST(_request: Request, context: Context) {
  let mutationLock: ProjectMutationLock | null = null;
  try { const { slug } = await context.params; const safeSlug = assertSlug(slug); mutationLock = await acquireProjectMutationLock({ workflowFile: workflowPath(safeSlug), leaseMs: 2 * 60 * 60_000 }); await refresh(safeSlug); const snapshot = await load(safeSlug); if (!snapshot) throw new Error("Research pipeline returned no snapshot"); await persistNewsroomResearch(safeSlug, snapshot); return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); return NextResponse.json({ error: message }, { status: message === "Invalid newsroom project slug" ? 400 : 502 }); }
  finally { if (mutationLock) await releaseProjectMutationLock(mutationLock); }
}
