import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { authoritativeScriptText, ensureAutomationOutput, isCanonicalNewsroomProject, qualityFile, readProjectContext, readWorkflow, renderBindingSha256, renderPayload } from "@/newsroom/project-runtime";
import { findYoutubeWorkspace } from "@/newsroom/workspace-server";
import { acquirePublishingClaim, findReusablePublishingJob, initialYoutubePrivacy, parsePublishingJobFile, persistUploadBeforeThumbnail } from "@/newsroom/publishing-policy";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, opencut/prefer-object-params */

export type PublishingProviderId = "youtube" | "tiktok";
type TokenSet = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	refreshExpiresAt?: number;
	scope: string;
	accountId: string;
	accountLabel: string;
};

type StoredConnection = TokenSet & { provider: PublishingProviderId; connectedAt: string };
type EncryptedPayload = { version: 1; iv: string; tag: string; ciphertext: string };
type Audit = {
	status?: string;
	versionId?: string;
	publishable?: boolean;
	uploadBlocked?: boolean;
	renderRegistrySha256?: string;
	renderSha256?: string;
	thumbnailSha256?: string;
	handoffSha256?: string | null;
	scriptSha256?: string;
};
type RenderMetadata = {
	versionId: string;
	path: string;
	thumbnailPath: string;
	thumbnailUrl?: string;
	duration: number;
	resolution: { width: number; height: number };
	handoffFile?: string;
	sourceIntegrity?: { scriptSha256?: string; [key: string]: unknown };
};

export type CreatorInfo = {
	creatorUsername: string;
	creatorNickname: string;
	creatorAvatarUrl?: string;
	privacyLevelOptions: string[];
	commentDisabled: boolean;
	duetDisabled: boolean;
	stitchDisabled: boolean;
	maxVideoPostDurationSec: number;
};

export type PublishingJob = {
	id: string;
	idempotencyKey: string;
	provider: PublishingProviderId;
	projectSlug?: string;
	versionId: string;
	accountId: string;
	accountLabel: string;
	state: "draft" | "consented" | "uploading" | "processing" | "published" | "failed" | "deleted";
	createdAt: string;
	updatedAt: string;
	title: string;
	privacy: string;
	videoSha256: string;
	platformId?: string;
	postUrl?: string;
	error?: string;
	providerStatus?: string;
};

export type PublishRequest = {
	versionId: string;
	platforms: PublishingProviderId[];
	title: string;
	description: string;
	consent: {
		exactFileReviewed: boolean;
		metadataReviewed: boolean;
		rightsConfirmed: boolean;
		aiDisclosureConfirmed: boolean;
	};
	youtube?: { privacyStatus: "private" | "unlisted" | "public" };
	tiktok?: {
		privacyLevel: string;
		allowComment: boolean;
		allowDuet: boolean;
		allowStitch: boolean;
	};
};

export type YouTubeRepairRequest = {
	jobId: string;
	title: string;
	description: string;
	retryThumbnail?: boolean;
};

const requiredEnvironment: Record<string, string[]> = {
	youtube: [],
	tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "PUBLISHING_TOKEN_ENCRYPTION_KEY", "PUBLISHING_PUBLIC_BASE_URL"],
	instagram: ["META_APP_ID", "META_APP_SECRET", "PUBLISHING_TOKEN_ENCRYPTION_KEY", "PUBLISHING_MEDIA_BASE_URL"],
};

type YouTubeClientCredentials = { clientId: string; clientSecret: string };

function youtubeClientCredentials(): YouTubeClientCredentials {
	const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
	const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
	if (clientId && clientSecret) return { clientId, clientSecret };
	const credentialsFile = process.env.YOUTUBE_OAUTH_CREDENTIALS_FILE?.trim();
	if (!credentialsFile) throw new Error("Configure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, or YOUTUBE_OAUTH_CREDENTIALS_FILE.");
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path.resolve(credentialsFile), "utf8"));
	} catch {
		throw new Error("YOUTUBE_OAUTH_CREDENTIALS_FILE could not be read as Google OAuth JSON.");
	}
	const web = (parsed as { web?: { client_id?: unknown; client_secret?: unknown } }).web;
	if (typeof web?.client_id !== "string" || typeof web.client_secret !== "string" || !web.client_id || !web.client_secret) {
		throw new Error("YOUTUBE_OAUTH_CREDENTIALS_FILE does not contain web.client_id and web.client_secret.");
	}
	return { clientId: web.client_id, clientSecret: web.client_secret };
}

function publishingConfigurationErrors(provider: string) {
	if (provider === "youtube") {
		const errors: string[] = [];
		try { youtubeClientCredentials(); } catch (error) { errors.push(error instanceof Error ? error.message : "YouTube OAuth credentials are invalid."); }
		try { encryptionKey(); } catch (error) { errors.push(error instanceof Error ? error.message : "Publishing encryption key is invalid."); }
		return errors;
	}
	return (requiredEnvironment[provider] || []).filter((name) => !process.env[name]);
}

function sha256(value: string | Buffer) {
	return createHash("sha256").update(value).digest("hex");
}

function workspacePaths() {
	const root = findYoutubeWorkspace();
	const runtimeRoot = path.join(root, "08-upload-delivery", "runtime");
	return {
		root,
		runtimeRoot,
		connections: path.join(runtimeRoot, "connections"),
		oauthStates: path.join(runtimeRoot, "oauth-states"),
		jobs: path.join(runtimeRoot, "jobs"),
		registry: path.join(root, "06-production", "opencut-automation", "out", "registry", "versions"),
	};
}

async function writeJsonAtomic(file: string, value: unknown) {
	await mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined);
	}
}

function encryptionKey() {
	const keyFile = process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY_FILE?.trim();
	let configured = process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY?.trim();
	if (!configured && keyFile) {
		try { configured = readFileSync(path.resolve(keyFile), "utf8").trim(); } catch { throw new Error("PUBLISHING_TOKEN_ENCRYPTION_KEY_FILE could not be read."); }
	}
	if (!configured && process.env.YOUTUBE_OAUTH_CREDENTIALS_FILE) {
		const credentials = youtubeClientCredentials();
		configured = `${credentials.clientId}:${credentials.clientSecret}`;
	}
	if (!configured || configured.length < 32) throw new Error("Configure a publishing encryption key or a valid YouTube OAuth credentials file.");
	return createHash("sha256").update(configured, "utf8").digest();
}

function encrypt(value: unknown): EncryptedPayload {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
	return { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

function decrypt<T>(value: EncryptedPayload): T {
	if (value.version !== 1) throw new Error("Unsupported publishing token store version.");
	const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
	decipher.setAuthTag(Buffer.from(value.tag, "base64"));
	return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8")) as T;
}

async function saveConnection(connection: StoredConnection) {
	const { connections } = workspacePaths();
	await writeJsonAtomic(path.join(connections, `${connection.provider}.json.enc`), encrypt(connection));
}

async function loadConnection(provider: PublishingProviderId): Promise<StoredConnection | null> {
	const { connections } = workspacePaths();
	try {
		const payload = JSON.parse(await readFile(path.join(connections, `${provider}.json.enc`), "utf8")) as EncryptedPayload;
		return decrypt<StoredConnection>(payload);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function disconnectProvider(provider: PublishingProviderId) {
	const connection = await loadConnection(provider);
	if (connection && provider === "tiktok") {
		const body = new URLSearchParams({ client_key: required("TIKTOK_CLIENT_KEY"), client_secret: required("TIKTOK_CLIENT_SECRET"), token: connection.accessToken });
		await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }).catch(() => undefined);
	}
	const { connections } = workspacePaths();
	await rm(path.join(connections, `${provider}.json.enc`), { force: true });
}

function required(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not configured.`);
	return value;
}

function publicBaseUrl(request: Request) {
	return new URL(process.env.PUBLISHING_PUBLIC_BASE_URL || new URL(request.url).origin);
}

function callbackUrl(request: Request, slug: string, provider: PublishingProviderId) {
	return new URL(`/api/newsroom/projects/${encodeURIComponent(slug)}/publishing/oauth/${provider}/callback`, publicBaseUrl(request)).toString();
}

export async function createOAuthAuthorization(request: Request, slug: string, provider: PublishingProviderId) {
	await readProjectContext(slug);
	const missing = publishingConfigurationErrors(provider);
	if (missing.length) throw new Error(`Missing environment: ${missing.join(", ")}`);
	const redirectUri = callbackUrl(request, slug, provider);
	if (provider === "tiktok" && new URL(redirectUri).protocol !== "https:") throw new Error("TikTok web OAuth requires an HTTPS PUBLISHING_PUBLIC_BASE_URL.");
	const state = randomBytes(24).toString("base64url");
	const { oauthStates } = workspacePaths();
	await writeJsonAtomic(path.join(oauthStates, `${state}.json`), { provider, slug, redirectUri, expiresAt: Date.now() + 10 * 60_000 });
	if (provider === "youtube") {
		const credentials = youtubeClientCredentials();
		const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
		url.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl", state }).toString();
		return url;
	}
	const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
	url.search = new URLSearchParams({ client_key: required("TIKTOK_CLIENT_KEY"), redirect_uri: redirectUri, response_type: "code", scope: "user.info.basic,video.publish", state }).toString();
	return url;
}

async function consumeOAuthState(state: string, provider: PublishingProviderId) {
	if (!/^[A-Za-z0-9_-]{20,80}$/.test(state)) throw new Error("Invalid OAuth state.");
	const { oauthStates } = workspacePaths();
	const file = path.join(oauthStates, `${state}.json`);
	const parsed = JSON.parse(await readFile(file, "utf8")) as { provider: PublishingProviderId; slug: string; redirectUri: string; expiresAt: number };
	await rm(file, { force: true });
	if (parsed.provider !== provider || parsed.expiresAt < Date.now()) throw new Error("Expired or mismatched OAuth state.");
	return parsed;
}

async function jsonResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	let body: unknown;
	try { body = JSON.parse(text); } catch { throw new Error(`Provider returned HTTP ${response.status}.`); }
	if (!response.ok) {
		const record = body as Record<string, unknown>;
		throw new Error(String(record.error_description || record.message || record.error || `Provider HTTP ${response.status}`));
	}
	return body as T;
}

export async function completeOAuth(request: Request, slug: string, provider: PublishingProviderId) {
	const query = new URL(request.url).searchParams;
	if (query.get("error")) throw new Error(query.get("error_description") || query.get("error") || "OAuth authorization failed.");
	const code = query.get("code");
	const state = query.get("state");
	if (!code || !state) throw new Error("OAuth callback is missing code or state.");
	const stored = await consumeOAuthState(state, provider);
	if (stored.slug !== slug) throw new Error("OAuth project mismatch.");
	if (provider === "youtube") {
		const credentials = youtubeClientCredentials();
		const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code, grant_type: "authorization_code", redirect_uri: stored.redirectUri }) });
		const token = await jsonResponse<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(response);
		if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and grant consent again.");
		const channels = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", { headers: { Authorization: `Bearer ${token.access_token}` } });
		const channelData = await jsonResponse<{ items?: Array<{ id: string; snippet?: { title?: string } }> }>(channels);
		const channel = channelData.items?.[0];
		await saveConnection({ provider, connectedAt: new Date().toISOString(), accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope || "", accountId: channel?.id || "youtube-channel", accountLabel: channel?.snippet?.title || "YouTube channel" });
		return;
	}
	const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: required("TIKTOK_CLIENT_KEY"), client_secret: required("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: stored.redirectUri }) });
	const token = await jsonResponse<{ access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; scope: string; open_id: string }>(response);
	const provisional: StoredConnection = { provider, connectedAt: new Date().toISOString(), accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000, refreshExpiresAt: Date.now() + token.refresh_expires_in * 1000, scope: token.scope, accountId: token.open_id, accountLabel: "TikTok account" };
	await saveConnection(provisional);
	const creator = await queryTikTokCreatorInfo(provisional);
	await saveConnection({ ...provisional, accountLabel: creator.creatorNickname || creator.creatorUsername || "TikTok account" });
}

async function validConnection(provider: PublishingProviderId) {
	const connection = await loadConnection(provider);
	if (!connection) throw new Error(`${provider} account is not connected.`);
	if (connection.expiresAt > Date.now() + 5 * 60_000) return connection;
	if (!connection.refreshToken) throw new Error(`${provider} refresh token is missing.`);
	if (provider === "youtube") {
		const credentials = youtubeClientCredentials();
		const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: connection.refreshToken, grant_type: "refresh_token" }) });
		const token = await jsonResponse<{ access_token: string; expires_in: number; scope?: string }>(response);
		const refreshed = { ...connection, accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope || connection.scope };
		await saveConnection(refreshed);
		return refreshed;
	}
	const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: required("TIKTOK_CLIENT_KEY"), client_secret: required("TIKTOK_CLIENT_SECRET"), refresh_token: connection.refreshToken, grant_type: "refresh_token" }) });
	const token = await jsonResponse<{ access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; scope: string; open_id: string }>(response);
	const refreshed = { ...connection, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000, refreshExpiresAt: Date.now() + token.refresh_expires_in * 1000, scope: token.scope, accountId: token.open_id };
	await saveConnection(refreshed);
	return refreshed;
}

async function queryTikTokCreatorInfo(connection?: StoredConnection): Promise<CreatorInfo> {
	const active = connection || await validConnection("tiktok");
	const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers: { Authorization: `Bearer ${active.accessToken}`, "Content-Type": "application/json; charset=UTF-8" } });
	const result = await jsonResponse<{ data?: Record<string, unknown>; error?: { code?: string; message?: string } }>(response);
	if (result.error?.code && result.error.code !== "ok") throw new Error(result.error.message || result.error.code);
	const data = result.data || {};
	return {
		creatorUsername: String(data.creator_username || ""),
		creatorNickname: String(data.creator_nickname || ""),
		creatorAvatarUrl: data.creator_avatar_url ? String(data.creator_avatar_url) : undefined,
		privacyLevelOptions: Array.isArray(data.privacy_level_options) ? data.privacy_level_options.map(String) : [],
		commentDisabled: data.comment_disabled === true,
		duetDisabled: data.duet_disabled === true,
		stitchDisabled: data.stitch_disabled === true,
		maxVideoPostDurationSec: Number(data.max_video_post_duration_sec || 0),
	};
}

async function approvedRelease(slug: string) {
	const paths = workspacePaths();
	if (!(await isCanonicalNewsroomProject(slug))) {
		const [workflow, auditText] = await Promise.all([readWorkflow(slug), readFile(qualityFile(slug), "utf8")]);
		const audit = JSON.parse(auditText) as Audit & { renderSha256?: string };
		const { status, metadata: rawMetadata } = renderPayload(workflow);
		if (audit.status !== "approved" || audit.publishable !== true || audit.uploadBlocked !== false || !audit.versionId || !audit.renderRegistrySha256 || !audit.renderSha256 || !audit.thumbnailSha256 || !audit.scriptSha256) throw new Error("Stage 07 has not approved this project release for upload.");
		if (status?.state !== "completed" || typeof rawMetadata?.renderPath !== "string" || typeof rawMetadata.thumbnailPath !== "string") throw new Error("Approved project render metadata is unavailable.");
		const renderPath = await ensureAutomationOutput(rawMetadata.renderPath);
		const thumbnailPath = await ensureAutomationOutput(rawMetadata.thumbnailPath);
		const handoffPath = typeof rawMetadata.handoffPath === "string" && rawMetadata.handoffPath ? await ensureAutomationOutput(rawMetadata.handoffPath) : null;
		const [video, thumbnail, handoff] = await Promise.all([readFile(renderPath), readFile(thumbnailPath), handoffPath ? readFile(handoffPath) : Promise.resolve(null)]);
		const renderSha256 = sha256(video);
		const thumbnailSha256 = sha256(thumbnail);
		const handoffSha256 = handoff ? sha256(handoff) : null;
		const registrySha256 = renderBindingSha256({ versionId: audit.versionId, renderPath, thumbnailPath, handoffPath, renderSha256, thumbnailSha256, handoffSha256 });
		const authoritativeScript = await authoritativeScriptText(slug, workflow);
		if (renderSha256 !== audit.renderSha256 || thumbnailSha256 !== audit.thumbnailSha256 || handoffSha256 !== (audit.handoffSha256 ?? null) || registrySha256 !== audit.renderRegistrySha256 || sha256(authoritativeScript.text) !== audit.scriptSha256 || rawMetadata.versionId !== audit.versionId) throw new Error("Approved project assets, handoff, binding, or script changed after Stage 07 approval.");
		const metadata: RenderMetadata = {
			versionId: audit.versionId,
			path: renderPath,
			thumbnailPath,
			thumbnailUrl: typeof status?.jobId === "string" ? `/api/newsroom?asset=thumbnail&job=${encodeURIComponent(status.jobId)}` : undefined,
			duration: Number(rawMetadata.duration || 0),
			resolution: { width: Number(rawMetadata.width || 1080), height: Number(rawMetadata.height || 1920) },
		};
		return { audit, metadata };
	}
	const auditPath = path.join(paths.root, "07-quality-assurance", "runs", "latest-stage07-audit.json");
	const audit = JSON.parse(await readFile(auditPath, "utf8")) as Audit;
	if (audit.status !== "approved" || audit.publishable !== true || audit.uploadBlocked !== false || !audit.versionId || !audit.renderRegistrySha256 || !audit.renderSha256 || !audit.thumbnailSha256 || !audit.handoffSha256 || !audit.scriptSha256) throw new Error("Stage 07 has not approved this release for upload.");
	const registryFile = path.join(paths.registry, `${audit.versionId}.json`);
	const registryText = await readFile(registryFile, "utf8");
	const actualRegistryHash = sha256(registryText);
	const expected = Buffer.from(audit.renderRegistrySha256, "hex");
	const actual = Buffer.from(actualRegistryHash, "hex");
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Approved render registry hash no longer matches Stage 07.");
	const metadata = JSON.parse(registryText) as RenderMetadata;
	if (metadata.versionId !== audit.versionId) throw new Error("Approved render metadata is invalid.");
	if (typeof metadata.handoffFile !== "string" || metadata.handoffFile !== `${audit.versionId}.handoff.json`) throw new Error("Approved registry handoff binding is invalid.");
	const [renderPath, thumbnailPath, handoffPath] = await Promise.all([
		ensureAutomationOutput(metadata.path),
		ensureAutomationOutput(metadata.thumbnailPath),
		ensureAutomationOutput(path.join(paths.registry, metadata.handoffFile)),
	]);
	const [videoBytes, thumbnailBytes, handoffBytes] = await Promise.all([readFile(renderPath), readFile(thumbnailPath), readFile(handoffPath)]);
	const sourceIntegrity = metadata.sourceIntegrity;
	if (sha256(videoBytes) !== audit.renderSha256 || sha256(thumbnailBytes) !== audit.thumbnailSha256 || sha256(handoffBytes) !== audit.handoffSha256 || sourceIntegrity?.scriptSha256 !== audit.scriptSha256) throw new Error("Approved video, thumbnail, handoff, or script binding changed after Stage 07 approval.");
	return { audit, metadata: { ...metadata, path: renderPath, thumbnailPath } };
}

async function listJobs() {
	const { jobs } = workspacePaths();
	if (!existsSync(jobs)) return [] as PublishingJob[];
	const { readdir } = await import("node:fs/promises");
	const files = (await readdir(jobs)).filter((name) => name.endsWith(".json"));
	const values = await Promise.all(files.map(async (name) => {
		try { return parsePublishingJobFile<PublishingJob>(await readFile(path.join(jobs, name), "utf8")); }
		catch { return null; }
	}));
	return values.filter((value): value is PublishingJob => value !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveJob(job: PublishingJob) {
	const { jobs } = workspacePaths();
	await writeJsonAtomic(path.join(jobs, `${job.id}.json`), job);
}

async function refreshJob(job: PublishingJob) {
	if (job.state !== "processing" || !job.platformId) return job;
	try {
		const connection = await validConnection(job.provider);
		if (job.provider === "youtube") {
			const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(job.platformId)}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
			const result = await jsonResponse<{ items?: Array<{ snippet?: { title?: string }; status?: { uploadStatus?: string }; processingDetails?: { processingStatus?: string; processingFailureReason?: string } }> }>(response);
			const video = result.items?.[0];
			const status = video?.processingDetails?.processingStatus || video?.status?.uploadStatus || "processing";
			const next: PublishingJob = { ...job, ...(video?.snippet?.title ? { title: video.snippet.title } : {}), providerStatus: status, updatedAt: new Date().toISOString() };
			if (status === "succeeded" || status === "processed") {
				next.state = "published";
				next.postUrl = `https://www.youtube.com/watch?v=${job.platformId}`;
				if (job.error?.startsWith("Video uploaded, but thumbnail upload failed:") && job.projectSlug) {
					try {
						const { metadata } = await approvedRelease(job.projectSlug);
						if (metadata.versionId === job.versionId) {
							const thumbnail = await readFile(metadata.thumbnailPath);
							const retry = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(job.platformId)}&uploadType=media`, {
								method: "POST",
								headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "image/png", "Content-Length": String(thumbnail.byteLength) },
								body: thumbnail,
							});
							if (retry.ok) {
								delete next.error;
								next.providerStatus = "succeeded-with-thumbnail";
							}
						}
					} catch {
						// Keep the original warning. The upload itself remains valid and private.
					}
				}
			}
			if (status === "failed" || status === "rejected") { next.state = "failed"; next.error = video?.processingDetails?.processingFailureReason || status; }
			await saveJob(next);
			return next;
		}
		const response = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ publish_id: job.platformId }) });
		const result = await jsonResponse<{ data?: Record<string, unknown>; error?: { code?: string; message?: string } }>(response);
		if (result.error?.code && result.error.code !== "ok") throw new Error(result.error.message || result.error.code);
		const status = String(result.data?.status || "processing");
		const next: PublishingJob = { ...job, providerStatus: status, updatedAt: new Date().toISOString() };
		if (status === "PUBLISH_COMPLETE") {
			next.state = "published";
			const ids = result.data?.publicaly_available_post_id;
			const postId = Array.isArray(ids) ? ids[0] : undefined;
			if (postId) next.postUrl = `https://www.tiktok.com/@${encodeURIComponent(connection.accountLabel)}/video/${String(postId)}`;
		}
		if (status === "FAILED") { next.state = "failed"; next.error = String(result.data?.fail_reason || "TikTok publishing failed."); }
		await saveJob(next);
		return next;
	} catch (error) {
		return { ...job, providerStatus: `poll-error: ${error instanceof Error ? error.message : "unknown"}` };
	}
}

export async function getPublishingOverview(slug: string) {
	const paths = workspacePaths();
	const project = await readProjectContext(slug);
	const canonical = project.canonical;
	const auditPath = canonical
		? path.join(paths.root, "07-quality-assurance", "runs", "latest-stage07-audit.json")
		: qualityFile(slug);
	const [platformFile, auditFile, allJobs] = await Promise.all([
		readFile(path.join(paths.root, "08-upload-delivery", "platforms.json"), "utf8"),
		readFile(auditPath, "utf8").catch(() => "null"),
		listJobs(),
	]);
	const existingJobs = allJobs.filter((job) => job.projectSlug === slug || (canonical && !job.projectSlug));
	const platformConfig = JSON.parse(platformFile) as { providers: Array<Record<string, unknown> & { id: string; availability: string }> };
	const audit = JSON.parse(auditFile) as Audit | null;
	const uploadDescription = `확인된 보도와 공개 자료를 바탕으로 ${project.title}을 정리했습니다.\n\n※ 사건 내용 기반 AI 재구성 화면이 포함되어 있습니다.\n\n#내무습다 #사건뉴스 #shorts`;
	const refreshedJobs = await Promise.all(existingJobs.map(refreshJob));
	const release = await approvedRelease(slug).catch(() => null);
	const providers = await Promise.all(platformConfig.providers.map(async (provider) => {
		const missing = publishingConfigurationErrors(provider.id);
		const supported = provider.id === "youtube" || provider.id === "tiktok";
		let connection: StoredConnection | null = null;
		let creatorInfo: CreatorInfo | null = null;
		if (supported && missing.length === 0) {
			connection = await loadConnection(provider.id as PublishingProviderId).catch(() => null);
			if (connection && provider.id === "tiktok") creatorInfo = await queryTikTokCreatorInfo().catch(() => null);
		}
		return {
			...provider,
			configured: provider.availability === "official-api" && supported && missing.length === 0,
			missingEnvironment: missing,
			connected: Boolean(connection),
			account: connection ? { id: connection.accountId, label: connection.accountLabel, scope: connection.scope, connectedAt: connection.connectedAt } : null,
			creatorInfo,
			canUpload: Boolean(release && connection),
			connectUrl: supported && missing.length === 0 ? `/api/newsroom/projects/${slug}/publishing/oauth/${provider.id}/start` : null,
		};
	}));
	return {
		audit,
		release: release ? { versionId: release.metadata.versionId, duration: release.metadata.duration, resolution: release.metadata.resolution, thumbnailUrl: release.metadata.thumbnailUrl || `/api/renders/final/thumbnail?versionId=${encodeURIComponent(release.metadata.versionId)}` } : null,
		defaults: {
			title: project.title,
			description: uploadDescription,
		},
		providers,
		jobs: refreshedJobs.slice(0, 12),
	};
}

function assertPublishRequest(body: PublishRequest) {
	if (!body || !Array.isArray(body.platforms) || body.platforms.length === 0) throw new Error("Select at least one connected platform.");
	if (body.platforms.some((value) => value !== "youtube" && value !== "tiktok")) throw new Error("Unsupported publishing provider.");
	if (!body.title?.trim() || body.title.length > 100) throw new Error("Title must contain 1-100 characters.");
	if (body.description.length > 5000) throw new Error("Description is too long.");
	if (!body.consent || !Object.values(body.consent).every(Boolean)) throw new Error("All release confirmations are required before upload.");
}

async function createJob(slug: string, provider: PublishingProviderId, request: PublishRequest, connection: StoredConnection, metadata: RenderMetadata) {
	const videoBuffer = await readFile(metadata.path);
	const videoSha256 = sha256(videoBuffer);
	const privacy = provider === "youtube" ? initialYoutubePrivacy(request.youtube?.privacyStatus) : request.tiktok?.privacyLevel || "SELF_ONLY";
	const metadataHash = sha256(JSON.stringify({ title: request.title.trim(), description: request.description.trim(), privacy, ai: true }));
	const idempotencyKey = sha256(`${slug}\n${videoSha256}\n${metadataHash}\n${provider}\n${connection.accountId}`);
	const existing = findReusablePublishingJob({ jobs: await listJobs(), idempotencyKey });
	if (existing) return { job: existing, videoBuffer, reused: true };
	const { jobs } = workspacePaths();
	await mkdir(jobs, { recursive: true });
	const jobId = `${provider}-${idempotencyKey.slice(0, 16)}`;
	const claimPath = path.join(jobs, `${jobId}.claim`);
	const claim = await acquirePublishingClaim({ claimPath, readExisting: async () => {
		try {
			const claimed = parsePublishingJobFile<PublishingJob>(await readFile(path.join(jobs, `${jobId}.json`), "utf8"));
			return claimed && findReusablePublishingJob({ jobs: [claimed], idempotencyKey }) ? claimed : null;
		} catch { return null; }
	} });
	if (!claim.acquired) return { job: claim.existing, videoBuffer, reused: true };
	const now = new Date().toISOString();
	const job: PublishingJob = { id: jobId, idempotencyKey, provider, projectSlug: slug, versionId: metadata.versionId, accountId: connection.accountId, accountLabel: connection.accountLabel, state: "consented", createdAt: now, updatedAt: now, title: request.title.trim(), privacy, videoSha256 };
	try {
		await saveJob(job);
		return { job, videoBuffer, reused: false, claimPath };
	} catch (error) {
		await claim.release();
		throw error;
	}
}

async function publishYouTube(slug: string, request: PublishRequest, metadata: RenderMetadata) {
	const connection = await validConnection("youtube");
	const created = await createJob(slug, "youtube", request, connection, metadata);
	if (created.reused) return created.job;
	let job: PublishingJob = { ...created.job, state: "uploading", updatedAt: new Date().toISOString() };
	await saveJob(job);
	try {
		const privacyStatus = initialYoutubePrivacy(request.youtube?.privacyStatus);
		const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
			method: "POST",
			headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(created.videoBuffer.byteLength), "X-Upload-Content-Type": "video/mp4" },
			body: JSON.stringify({ snippet: { title: request.title.trim(), description: request.description.trim(), categoryId: "25" }, status: { privacyStatus, selfDeclaredMadeForKids: false, containsSyntheticMedia: true } }),
		});
		if (!init.ok) throw new Error(`YouTube upload initialization failed: ${init.status} ${await init.text()}`);
		const uploadUrl = init.headers.get("location");
		if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
		const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(created.videoBuffer.byteLength) }, body: created.videoBuffer });
		const result = await jsonResponse<{ id: string }>(upload);
		if (!result.id) throw new Error("YouTube upload did not return a video ID.");
		const finalized = await persistUploadBeforeThumbnail({
			platformId: result.id,
			persistUploaded: async (platformId) => {
				job = { ...job, state: "processing", platformId, privacy: privacyStatus, providerStatus: "uploaded-thumbnail-pending", updatedAt: new Date().toISOString() };
				await saveJob(job);
			},
			uploadThumbnail: async () => {
			const thumbnail = await readFile(metadata.thumbnailPath);
			const thumbnailResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(result.id)}&uploadType=media`, { method: "POST", headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "image/png", "Content-Length": String(thumbnail.byteLength) }, body: thumbnail });
			if (!thumbnailResponse.ok) throw new Error(`${thumbnailResponse.status} ${await thumbnailResponse.text()}`);
			},
		});
		const thumbnailWarning = finalized.thumbnailWarning;
		job = { ...job, providerStatus: thumbnailWarning ? "uploaded-with-thumbnail-warning" : "uploaded", ...(thumbnailWarning ? { error: thumbnailWarning } : {}), updatedAt: new Date().toISOString() };
		await saveJob(job);
		return job;
	} catch (error) {
		const message = error instanceof Error ? error.message : "YouTube upload failed.";
		job = job.platformId
			? { ...job, state: "processing", providerStatus: "uploaded-with-local-warning", error: `Video uploaded; local finalization failed: ${message}`, updatedAt: new Date().toISOString() }
			: { ...job, state: "failed", error: message, updatedAt: new Date().toISOString() };
		await saveJob(job);
		return job;
	} finally {
		if ("claimPath" in created && typeof created.claimPath === "string") await rm(created.claimPath, { force: true });
	}
}

function tiktokChunkPlan(size: number) {
	const max = 32 * 1024 * 1024;
	const count = Math.max(1, Math.ceil(size / max));
	return { chunkSize: Math.ceil(size / count), totalChunkCount: count };
}

async function publishTikTok(slug: string, request: PublishRequest, metadata: RenderMetadata) {
	const connection = await validConnection("tiktok");
	const creatorInfo = await queryTikTokCreatorInfo(connection);
	if (creatorInfo.maxVideoPostDurationSec > 0 && metadata.duration > creatorInfo.maxVideoPostDurationSec) throw new Error(`TikTok account allows at most ${creatorInfo.maxVideoPostDurationSec} seconds.`);
	const requestedPrivacy = request.tiktok?.privacyLevel || "SELF_ONLY";
	if (!creatorInfo.privacyLevelOptions.includes(requestedPrivacy)) throw new Error("Selected TikTok privacy level is not currently available for this account.");
	const created = await createJob(slug, "tiktok", request, connection, metadata);
	if (created.reused) return created.job;
	let job: PublishingJob = { ...created.job, state: "uploading", updatedAt: new Date().toISOString() };
	await saveJob(job);
	try {
		const { chunkSize, totalChunkCount } = tiktokChunkPlan(created.videoBuffer.byteLength);
		const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
			method: "POST",
			headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
			body: JSON.stringify({
				post_info: {
					title: `${request.title.trim()}\n${request.description.trim()}`.trim().slice(0, 2200),
					privacy_level: requestedPrivacy,
					disable_comment: creatorInfo.commentDisabled || request.tiktok?.allowComment !== true,
					disable_duet: creatorInfo.duetDisabled || request.tiktok?.allowDuet !== true,
					disable_stitch: creatorInfo.stitchDisabled || request.tiktok?.allowStitch !== true,
					video_cover_timestamp_ms: 1000,
					brand_content_toggle: false,
					brand_organic_toggle: false,
					is_aigc: true,
				},
				source_info: { source: "FILE_UPLOAD", video_size: created.videoBuffer.byteLength, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
			}),
		});
		const initResult = await jsonResponse<{ data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } }>(init);
		if (initResult.error?.code && initResult.error.code !== "ok") throw new Error(initResult.error.message || initResult.error.code);
		const publishId = initResult.data?.publish_id;
		const uploadUrl = initResult.data?.upload_url;
		if (!publishId || !uploadUrl) throw new Error("TikTok did not return publish_id and upload_url.");
		for (let index = 0; index < totalChunkCount; index += 1) {
			const start = index * chunkSize;
			const endExclusive = Math.min(created.videoBuffer.byteLength, start + chunkSize);
			const chunk = created.videoBuffer.subarray(start, endExclusive);
			const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${start}-${endExclusive - 1}/${created.videoBuffer.byteLength}` }, body: chunk });
			if (!upload.ok) throw new Error(`TikTok chunk ${index + 1}/${totalChunkCount} failed: ${upload.status} ${await upload.text()}`);
		}
		job = { ...job, state: "processing", platformId: publishId, providerStatus: "uploaded", updatedAt: new Date().toISOString() };
		await saveJob(job);
		return job;
	} catch (error) {
		job = { ...job, state: "failed", error: error instanceof Error ? error.message : "TikTok upload failed.", updatedAt: new Date().toISOString() };
		await saveJob(job);
		return job;
	} finally {
		if ("claimPath" in created && typeof created.claimPath === "string") await rm(created.claimPath, { force: true });
	}
}

export async function publishApprovedRelease(slug: string, request: PublishRequest) {
	assertPublishRequest(request);
	const { metadata } = await approvedRelease(slug);
	if (request.versionId !== metadata.versionId) throw new Error("The requested video is not the exact Stage 07 approved version.");
	const jobs: PublishingJob[] = [];
	for (const provider of [...new Set(request.platforms)]) {
		jobs.push(provider === "youtube" ? await publishYouTube(slug, request, metadata) : await publishTikTok(slug, request, metadata));
	}
	return jobs;
}

export async function repairYouTubePublishedJob(slug: string, request: YouTubeRepairRequest) {
	if (!/^youtube-[a-f0-9]{16}$/.test(request.jobId || "")) throw new Error("A valid YouTube publishing job is required.");
	if (!request.title?.trim() || request.title.length > 100) throw new Error("Title must contain 1-100 characters.");
	if (request.description.length > 5000) throw new Error("Description is too long.");
	const paths = workspacePaths();
	const jobPath = path.join(paths.jobs, `${request.jobId}.json`);
	const job = JSON.parse(await readFile(jobPath, "utf8")) as PublishingJob;
	if (job.provider !== "youtube" || job.projectSlug !== slug || !job.platformId) throw new Error("The publishing job does not belong to this YouTube project.");
	const { metadata } = await approvedRelease(slug);
	if (metadata.versionId !== job.versionId) throw new Error("Only the exact Stage 07 approved YouTube release can be repaired.");
	const connection = await validConnection("youtube");
	const lookup = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(job.platformId)}`, {
		headers: { Authorization: `Bearer ${connection.accessToken}` },
	});
	const current = await jsonResponse<{ items?: Array<{ snippet?: { categoryId?: string; tags?: string[]; defaultLanguage?: string; defaultAudioLanguage?: string }; status?: { uploadStatus?: string } }> }>(lookup);
	const item = current.items?.[0];
	if (!item) throw new Error("YouTube video metadata is not available yet.");
	const snippet = {
		title: request.title.trim(),
		description: request.description.trim(),
		categoryId: item.snippet?.categoryId || "25",
		...(item.snippet?.tags ? { tags: item.snippet.tags } : {}),
		...(item.snippet?.defaultLanguage ? { defaultLanguage: item.snippet.defaultLanguage } : {}),
		...(item.snippet?.defaultAudioLanguage ? { defaultAudioLanguage: item.snippet.defaultAudioLanguage } : {}),
	};
	const update = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
		method: "PUT",
		headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
		body: JSON.stringify({ id: job.platformId, snippet }),
	});
	if (!update.ok) throw new Error(`YouTube metadata repair failed: ${update.status} ${await update.text()}`);
	let thumbnailUpdated = false;
	let thumbnailWarning: string | undefined;
	if (request.retryThumbnail !== false) {
		const thumbnail = await readFile(metadata.thumbnailPath);
		const thumbnailResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(job.platformId)}&uploadType=media`, {
			method: "POST",
			headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "image/png", "Content-Length": String(thumbnail.byteLength) },
			body: thumbnail,
		});
		thumbnailUpdated = thumbnailResponse.ok;
		if (!thumbnailResponse.ok) thumbnailWarning = `Thumbnail retry failed: ${thumbnailResponse.status} ${await thumbnailResponse.text()}`;
	}
	const repaired: PublishingJob = {
		...job,
		title: request.title.trim(),
		providerStatus: thumbnailWarning ? "metadata-repaired-with-thumbnail-warning" : "metadata-and-thumbnail-repaired",
		...(thumbnailWarning ? { error: thumbnailWarning } : { error: undefined }),
		updatedAt: new Date().toISOString(),
	};
	await saveJob(repaired);
	return { job: repaired, thumbnailUpdated, uploadStatus: item.status?.uploadStatus || null };
}

export function isPublishingProvider(value: string): value is PublishingProviderId {
	return value === "youtube" || value === "tiktok";
}
