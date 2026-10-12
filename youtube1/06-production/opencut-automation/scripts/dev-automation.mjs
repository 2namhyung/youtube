#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const port = process.env.AUTOMATION_PORT ?? "3002";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: port,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${port}`,
  NEXT_PUBLIC_MARBLE_API_URL: process.env.NEXT_PUBLIC_MARBLE_API_URL ?? "https://api.marblecms.com",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://opencut:opencut@localhost:5432/opencut",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "local-automation-placeholder",
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? "local-automation-placeholder",
  MARBLE_WORKSPACE_KEY: process.env.MARBLE_WORKSPACE_KEY ?? "local-automation-placeholder",
  FREESOUND_CLIENT_ID: process.env.FREESOUND_CLIENT_ID ?? "local-automation-placeholder",
  FREESOUND_API_KEY: process.env.FREESOUND_API_KEY ?? "local-automation-placeholder",
  OPENCUT_RENDER_PATH:
    process.env.OPENCUT_RENDER_PATH ??
    fileURLToPath(new URL("../out/school-case-shorts-final-v3-reference.mp4", import.meta.url)),
  OPENCUT_RENDER_REGISTRY:
    process.env.OPENCUT_RENDER_REGISTRY ??
    fileURLToPath(new URL("../out/latest-render.json", import.meta.url)),
  OPENCUT_RENDER_ROOT:
    process.env.OPENCUT_RENDER_ROOT ??
    fileURLToPath(new URL("../out", import.meta.url)),
};

const child = spawn(npmCommand, ["--workspace", "@opencut/web", "run", "dev"], {
  cwd: fileURLToPath(new URL("../opencut-classic/", import.meta.url)),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
