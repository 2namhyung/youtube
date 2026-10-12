#!/usr/bin/env node
import fsp from "node:fs/promises";
import path from "node:path";
import { collectResearchRadar, NEWSROOM_ROOT, RESEARCH_SCHEDULER_STATUS_PATH } from "./newsroom-lib.mjs";
import { writeAtomic } from "./production-lib.mjs";

const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const once = args.includes("--once");
const intervalMinutes = Math.max(15, Math.min(1_440, Number(value("--interval-minutes") || 60)));
if (!Number.isFinite(intervalMinutes)) throw new Error("--interval-minutes must be a number between 15 and 1440");
const schedulerLock = path.join(NEWSROOM_ROOT, "research-scheduler.lock");
await fsp.mkdir(NEWSROOM_ROOT, { recursive: true });
let lock;
try { lock = await fsp.open(schedulerLock, "wx"); }
catch (error) {
  if (error?.code === "EEXIST") throw new Error("Research collection scheduler is already running");
  throw error;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
async function status(value) { await writeAtomic(RESEARCH_SCHEDULER_STATUS_PATH, `${JSON.stringify(value, null, 2)}\n`); }
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  do {
    const startedAt = new Date().toISOString();
    await status({ state: "collecting", optIn: true, semanticSelectionAutomatic: false, intervalMinutes, startedAt, pid: process.pid });
    try {
      const result = await collectResearchRadar();
      const nextRunAt = once ? null : new Date(Date.now() + intervalMinutes * 60_000).toISOString();
      await status({ state: once ? "completed" : "waiting", optIn: true, semanticSelectionAutomatic: false, intervalMinutes, startedAt, completedAt: result.completedAt, nextRunAt, lastCollection: result.collection, pid: process.pid });
    } catch (error) {
      const nextRunAt = once ? null : new Date(Date.now() + intervalMinutes * 60_000).toISOString();
      await status({ state: once ? "failed" : "waiting-after-error", optIn: true, semanticSelectionAutomatic: false, intervalMinutes, startedAt, completedAt: new Date().toISOString(), nextRunAt, error: String(error?.message || error).slice(0, 500), pid: process.pid });
      if (once) throw error;
    }
    if (!once && !stopping) await sleep(intervalMinutes * 60_000);
  } while (!once && !stopping);
  if (stopping) await status({ state: "stopped", optIn: true, semanticSelectionAutomatic: false, intervalMinutes, stoppedAt: new Date().toISOString() });
} finally {
  await lock?.close().catch(() => {});
  await fsp.rm(schedulerLock, { force: true }).catch(() => {});
}
