import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

export type IdempotentPublishingJob = { idempotencyKey: string; state: string; providerStatus?: string };

export function findReusablePublishingJob<T extends IdempotentPublishingJob>({ jobs, idempotencyKey }: { jobs: T[]; idempotencyKey: string }): T | undefined {
	return jobs.find((job) => job.idempotencyKey === idempotencyKey
		&& !["failed", "deleted", "removed"].includes(job.state)
		&& !["deleted", "removed"].includes(job.providerStatus || ""));
}

export type ThumbnailRetryBinding = {
	job: { provider: string; state: string; privacy: string; accountId: string; projectSlug?: string; versionId: string; videoSha256: string; platformId?: string; providerStatus?: string };
	audit: { status?: string; publishable?: boolean; uploadBlocked?: boolean; projectSlug?: string; versionId?: string; renderRegistrySha256?: string; renderSha256?: string; thumbnailSha256?: string };
	registry: { versionId?: string };
	actual: { accountId: string; renderRegistrySha256: string; renderSha256: string; thumbnailSha256: string };
};

export function assertThumbnailRetryBinding({ job, audit, registry, actual }: ThumbnailRetryBinding) {
	if (job.provider !== "youtube" || !["processing", "published"].includes(job.state) || ["deleted", "removed"].includes(job.providerStatus || "")) throw new Error("The job is not eligible for thumbnail repair.");
	if (job.privacy !== "private") throw new Error("Thumbnail repair is restricted to private YouTube jobs.");
	if (!job.accountId || !job.projectSlug || !job.platformId) throw new Error("The job lacks exact account/project/video identity.");
	if (job.accountId !== actual.accountId) throw new Error("The connected account does not own this job binding.");
	if (audit.status !== "approved" || audit.publishable !== true || audit.uploadBlocked !== false || audit.projectSlug !== job.projectSlug || audit.versionId !== job.versionId || registry.versionId !== job.versionId) throw new Error("The exact job version/project does not have an approved Stage 07 report.");
	if (audit.renderRegistrySha256 !== actual.renderRegistrySha256 || audit.renderSha256 !== actual.renderSha256 || audit.thumbnailSha256 !== actual.thumbnailSha256 || job.videoSha256 !== actual.renderSha256) throw new Error("The approved registry, video, thumbnail, or job hash binding changed.");
}

export function initialYoutubePrivacy(requested: "private" | "unlisted" | "public" | undefined): "private" {
	if ((requested || "private") !== "private") throw new Error("YouTube uploads must start private; public visibility requires a later exact-ID approval step.");
	return "private";
}

export function parsePublishingJobFile<T extends { id?: unknown; createdAt?: unknown }>(text: string): T | null {
	try {
		// Persistence boundary: callers supply the complete validated job type.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const value = JSON.parse(text) as T;
		return typeof value?.id === "string" && typeof value.createdAt === "string" ? value : null;
	} catch { return null; }
}

export async function acquirePublishingClaim<T>({ claimPath, readExisting, attempts = 40 }: { claimPath: string; readExisting: () => Promise<T | null>; attempts?: number }) {
	await mkdir(path.dirname(claimPath), { recursive: true });
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const handle = await open(claimPath, "wx", 0o600);
			await handle.close();
			return { acquired: true as const, release: async () => rm(claimPath, { force: true }) };
		} catch (error) {
			const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
			if (code !== "EEXIST") throw error;
			const existing = await readExisting();
			if (existing) return { acquired: false as const, existing };
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw new Error("An identical publishing upload is already being claimed.");
}

export async function persistUploadBeforeThumbnail({ platformId, persistUploaded, uploadThumbnail }: { platformId: string; persistUploaded: (platformId: string) => Promise<void>; uploadThumbnail: () => Promise<void> }) {
	await persistUploaded(platformId);
	try {
		await uploadThumbnail();
		return { platformId, thumbnailWarning: undefined };
	} catch (error) {
		return { platformId, thumbnailWarning: `Video uploaded, but thumbnail upload failed: ${error instanceof Error ? error.message : "unknown error"}` };
	}
}
