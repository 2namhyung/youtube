import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Archive ${label} is required`);
  return value.trim();
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isSuccessfulPublicYoutubeJob(job) {
  return Boolean(job
    && job.provider === "youtube"
    && job.state === "published"
    && job.privacy === "public"
    && typeof job.projectSlug === "string"
    && typeof job.versionId === "string"
    && typeof job.platformId === "string"
    && /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=/.test(job.postUrl || "")
    && isSha256(job.videoSha256));
}

function jobTime(job) {
  return requiredText(job.updatedAt || job.createdAt, "job timestamp");
}

/** Build one immutable archive entry per story from its latest successful public upload. */
export function buildNewsroomArchive({ jobs, storyTitles, versionEvidence }) {
  const selected = new Map();
  for (const source of jobs) {
    const job = source?.job;
    if (!isSuccessfulPublicYoutubeJob(job)) continue;
    const current = selected.get(job.projectSlug);
    if (!current || jobTime(job).localeCompare(jobTime(current.job)) > 0 || (jobTime(job) === jobTime(current.job) && job.id.localeCompare(current.job.id) > 0)) {
      selected.set(job.projectSlug, source);
    }
  }

  const entries = [...selected.values()].map(({ job, bytes, relativePath }) => {
    const evidence = versionEvidence.get(job.versionId);
    if (!evidence) throw new Error(`Archive version evidence is unavailable: ${job.versionId}`);
    if (evidence.videoSha256 !== job.videoSha256) throw new Error(`Archive video hash mismatch: ${job.versionId}`);
    const storyTitle = storyTitles.get(job.projectSlug);
    if (!storyTitle) throw new Error(`Archive story title is unavailable: ${job.projectSlug}`);
    return {
      slug: requiredText(job.projectSlug, "story slug"),
      storyTitle: requiredText(storyTitle, "story title"),
      status: "archived",
      archivedAt: jobTime(job),
      upload: {
        provider: "youtube",
        jobId: requiredText(job.id, "job id"),
        jobPath: requiredText(relativePath, "job path"),
        jobSha256: sha256(bytes),
        versionId: requiredText(job.versionId, "version id"),
        platformId: requiredText(job.platformId, "platform id"),
        postUrl: requiredText(job.postUrl, "post URL"),
        title: requiredText(job.title, "upload title"),
        privacy: "public",
        providerStatus: requiredText(job.providerStatus, "provider status"),
        videoSha256: job.videoSha256,
      },
      production: evidence,
    };
  }).sort((left, right) => right.archivedAt.localeCompare(left.archivedAt) || left.slug.localeCompare(right.slug));

  const generatedAt = entries.reduce((latest, entry) => entry.archivedAt > latest ? entry.archivedAt : latest, "1970-01-01T00:00:00.000Z");
  return {
    schemaVersion: "newsroom-archive-v1",
    generatedAt,
    creator: "scripts/create-newsroom-archive.mjs",
    selection: {
      provider: "youtube",
      state: "published",
      privacy: "public",
      dedupe: "latest-successful-public-upload-per-story-slug",
    },
    entryCount: entries.length,
    entries,
  };
}
