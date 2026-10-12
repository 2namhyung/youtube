import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNewsroomArchive, isSuccessfulPublicYoutubeJob } from "./newsroom-archive-lib.mjs";

const hash = "a".repeat(64);
const publicJob = (overrides = {}) => ({ provider: "youtube", id: "job-1", projectSlug: "story-one", versionId: "version-1", state: "published", privacy: "public", providerStatus: "succeeded", platformId: "youtube-1", postUrl: "https://www.youtube.com/watch?v=youtube-1", title: "Public title", videoSha256: hash, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:01:00.000Z", ...overrides });
const source = (job) => ({ job, bytes: Buffer.from(JSON.stringify(job)), relativePath: `08-upload-delivery/runtime/jobs/${job.id}.json` });
const evidence = (videoSha256 = hash) => ({ versionRegistryPath: "version.json", versionRegistrySha256: hash, handoffPath: "handoff.json", handoffSha256: hash, videoPath: "video.mp4", videoSha256 });

assert.equal(isSuccessfulPublicYoutubeJob(publicJob()), true);
assert.equal(isSuccessfulPublicYoutubeJob(publicJob({ privacy: "private" })), false);
assert.equal(isSuccessfulPublicYoutubeJob(publicJob({ state: "deleted", privacy: "removed" })), false);

const older = publicJob();
const newer = publicJob({ id: "job-2", versionId: "version-2", platformId: "youtube-2", postUrl: "https://www.youtube.com/watch?v=youtube-2", updatedAt: "2026-08-02T00:00:00.000Z" });
const archive = buildNewsroomArchive({
  jobs: [source(older), source(newer), source(publicJob({ id: "private", privacy: "private" }))],
  storyTitles: new Map([["story-one", "Story one"]]),
  versionEvidence: new Map([["version-1", evidence()], ["version-2", evidence()]]),
});
assert.equal(archive.entryCount, 1);
assert.equal(archive.entries[0].upload.jobId, "job-2");
assert.equal(archive.entries[0].status, "archived");
assert.equal(archive.entries[0].storyTitle, "Story one");
assert.throws(() => buildNewsroomArchive({ jobs: [source(older)], storyTitles: new Map([["story-one", "Story one"]]), versionEvidence: new Map([["version-1", evidence("b".repeat(64))]]) }), /video hash mismatch/);

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(automationRoot, "..", "..");
const liveArchive = JSON.parse(await readFile(path.join(automationRoot, "production", "newsroom", "archive.json"), "utf8"));
const successfulSlugs = new Set();
for (const name of await readdir(path.join(workspaceRoot, "08-upload-delivery", "runtime", "jobs"))) {
  if (!name.endsWith(".json")) continue;
  try {
    const job = JSON.parse(await readFile(path.join(workspaceRoot, "08-upload-delivery", "runtime", "jobs", name), "utf8"));
    if (isSuccessfulPublicYoutubeJob(job)) successfulSlugs.add(job.projectSlug);
  } catch { /* unrelated job */ }
}
assert.equal(liveArchive.entryCount, liveArchive.entries.length);
assert.deepEqual(new Set(liveArchive.entries.map((entry) => entry.slug)), successfulSlugs);
assert.equal(new Set(liveArchive.entries.map((entry) => entry.slug)).size, liveArchive.entries.length);
for (const entry of liveArchive.entries) {
  assert.equal(entry.status, "archived");
  assert.equal(entry.upload.privacy, "public");
  assert.equal(entry.production.videoSha256, entry.upload.videoSha256);
}
const maintenanceSource = await readFile(path.join(workspaceRoot, "08-upload-delivery", "scripts", "youtube-maintenance.mjs"), "utf8");
assert.match(maintenanceSource, /make-public[\s\S]+await refreshNewsroomArchive\(\)/);
assert.match(maintenanceSource, /command === 'sync' \? await refreshNewsroomArchive\(\)/);
assert.match(maintenanceSource, /command === 'delete'[\s\S]+await refreshNewsroomArchive\(\)/);

console.log("newsroom archive tests passed");
