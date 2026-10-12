import { createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, "..", "..");
const valueOf = (name) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
};
const jobId = valueOf("--job");
const auditArgIndex = process.argv.indexOf("--audit");
if (!process.argv.includes("--confirm-thumbnail") || auditArgIndex < 0 || !process.argv[auditArgIndex + 1]) throw new Error("Thumbnail repair requires --job, --audit, and --confirm-thumbnail.");
const auditPath = path.resolve(process.argv[auditArgIndex + 1]);

if (!/^youtube-[a-f0-9]{16}$/.test(jobId || "")) {
	throw new Error("Usage: node retry-youtube-thumbnail.mjs --job <youtube-job-id> --audit <exact-stage07-report.json> --confirm-thumbnail");
}
const job = JSON.parse(await readFile(path.join(workspace, "08-upload-delivery", "runtime", "jobs", `${jobId}.json`), "utf8"));
if (job.id !== jobId || job.provider !== "youtube" || !["processing", "published"].includes(job.state) || ["deleted", "removed"].includes(job.providerStatus) || job.privacy !== "private" || !job.accountId || !job.projectSlug || !/^[A-Za-z0-9_-]{6,32}$/.test(job.platformId || "")) throw new Error("The local job is not an eligible exact private YouTube job.");
const videoId = job.platformId;

const credentialsFile = process.env.YOUTUBE_OAUTH_CREDENTIALS_FILE?.trim();
if (!credentialsFile) throw new Error("YOUTUBE_OAUTH_CREDENTIALS_FILE is not configured.");

const credentialsJson = JSON.parse(await readFile(path.resolve(credentialsFile), "utf8"));
const credentials = credentialsJson.web;
if (!credentials?.client_id || !credentials?.client_secret) throw new Error("Google OAuth web credentials are invalid.");

const configuredKey = process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY?.trim()
	|| `${credentials.client_id}:${credentials.client_secret}`;
const key = createHash("sha256").update(configuredKey, "utf8").digest();
const encrypted = JSON.parse(await readFile(path.join(workspace, "08-upload-delivery", "runtime", "connections", "youtube.json.enc"), "utf8"));
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
const connection = JSON.parse(Buffer.concat([
	decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
	decipher.final(),
]).toString("utf8"));

let accessToken = connection.accessToken;
if (!accessToken || Number(connection.expiresAt) <= Date.now() + 60_000) {
	const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: credentials.client_id,
			client_secret: credentials.client_secret,
			refresh_token: connection.refreshToken,
			grant_type: "refresh_token",
		}),
	});
	if (!tokenResponse.ok) throw new Error(`OAuth token refresh failed: ${tokenResponse.status}`);
	accessToken = (await tokenResponse.json()).access_token;
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
if (audit.status !== "approved" || audit.publishable !== true || audit.uploadBlocked !== false || audit.projectSlug !== job.projectSlug || audit.versionId !== job.versionId || !audit.renderRegistrySha256 || !audit.renderSha256 || !audit.thumbnailSha256) throw new Error("The exact job version/project does not have an approved Stage 07 report.");
const registryPath = path.join(workspace, "06-production", "opencut-automation", "out", "registry", "versions", `${audit.versionId}.json`);
const registryBytes = await readFile(registryPath);
if (createHash("sha256").update(registryBytes).digest("hex") !== audit.renderRegistrySha256) throw new Error("The approved registry metadata changed after Stage 07.");
const registry = JSON.parse(registryBytes.toString("utf8"));
if (registry.versionId !== job.versionId) throw new Error("Registry version does not match the job.");
const [video, thumbnail] = await Promise.all([readFile(path.resolve(registry.path)), readFile(path.resolve(registry.thumbnailPath))]);
const videoSha256 = createHash("sha256").update(video).digest("hex");
if (videoSha256 !== audit.renderSha256 || videoSha256 !== job.videoSha256) throw new Error("The approved video or job video hash changed after Stage 07.");
if (createHash("sha256").update(thumbnail).digest("hex") !== audit.thumbnailSha256) throw new Error("The approved thumbnail changed after Stage 07.");
if (connection.accountId !== job.accountId) throw new Error("The connected YouTube account does not match the job.");

const remoteResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
if (!remoteResponse.ok) throw new Error(`YouTube video preflight failed: ${remoteResponse.status}`);
const remote = await remoteResponse.json();
const remoteVideo = remote.items?.[0];
if (!remoteVideo || remoteVideo.id !== videoId || remoteVideo.status?.privacyStatus !== "private" || ["deleted", "rejected", "failed"].includes(remoteVideo.status?.uploadStatus)) throw new Error("Remote video is missing, non-private, or ineligible.");

const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "image/png",
		"Content-Length": String(thumbnail.byteLength),
	},
	body: thumbnail,
});

const responseText = await response.text();
if (!response.ok) {
	let message = responseText;
	try { message = JSON.parse(responseText)?.error?.message || responseText; } catch { /* preserve response text */ }
	console.log(JSON.stringify({ ok: false, status: response.status, videoId, message }, null, 2));
	process.exitCode = 1;
} else {
	const result = responseText ? JSON.parse(responseText) : {};
	const verifyResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!verifyResponse.ok) throw new Error(`YouTube thumbnail post-verification failed: ${verifyResponse.status}`);
	const verified = await verifyResponse.json();
	const verifiedVideo = verified.items?.[0];
	if (!verifiedVideo || verifiedVideo.id !== videoId || verifiedVideo.status?.privacyStatus !== "private" || !verifiedVideo.snippet?.thumbnails) throw new Error("YouTube did not confirm the private video's thumbnail metadata after upload.");
	console.log(JSON.stringify({ ok: true, status: response.status, videoId, thumbnailCount: Object.keys(verifiedVideo.snippet.thumbnails).length || result.items?.length || 0 }, null, 2));
}
