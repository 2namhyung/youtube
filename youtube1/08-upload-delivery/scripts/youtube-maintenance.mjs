import { createDecipheriv, createHash } from 'node:crypto';
import fs from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const workspace = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/+/, '').replaceAll('/', path.sep));
const runtimeRoot = path.join(workspace, '08-upload-delivery', 'runtime');
const jobsRoot = path.join(runtimeRoot, 'jobs');
const appEnv = path.join(workspace, '06-production', 'opencut-automation', 'opencut-classic', 'apps', 'web', '.env.local');
const archiveCreator = path.join(workspace, '06-production', 'opencut-automation', 'scripts', 'create-newsroom-archive.mjs');
const execFileAsync = promisify(execFile);
const refreshNewsroomArchive = async () => {
  const { stdout } = await execFileAsync(process.execPath, [archiveCreator], { cwd: workspace, windowsHide: true });
  return JSON.parse(stdout.trim());
};
try {
  const envText = await readFile(appEnv, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
} catch { /* caller may provide environment explicitly */ }

const argv = process.argv.slice(2);
const command = argv[0] || 'status';
const values = (name) => argv.flatMap((item, index) => item === name && argv[index + 1] ? [argv[index + 1]] : []);
const value = (name) => values(name)[0] || null;
const jobId = value('--job');
const textFile = value('--text-file');
if (jobId && !/^youtube-[a-f0-9]{16}$/.test(jobId)) throw new Error('--job must be a local YouTube job id.');

const readJob = async (id) => {
  const job = JSON.parse(await readFile(path.join(jobsRoot, `${id}.json`), 'utf8'));
  if (job.id !== id || job.provider !== 'youtube' || !/^[A-Za-z0-9_-]{6,32}$/.test(job.platformId || '')) throw new Error(`Job ${id} is not an exact uploaded YouTube job.`);
  return job;
};
const writeJob = async (job) => {
  const target = path.join(jobsRoot, `${job.id}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
};
const allYoutubeJobs = async () => {
  if (!fs.existsSync(jobsRoot)) return [];
  const jobs = [];
  for (const name of fs.readdirSync(jobsRoot).filter((name) => /^youtube-[a-f0-9]{16}\.json$/.test(name))) {
    try {
      const job = JSON.parse(await readFile(path.join(jobsRoot, name), 'utf8'));
      if (job.provider === 'youtube' && /^[A-Za-z0-9_-]{6,32}$/.test(job.platformId || '')) jobs.push(job);
    } catch { /* malformed jobs are ignored by read-only inventory and never mutated */ }
  }
  return jobs;
};

const credentialsPath = process.env.YOUTUBE_OAUTH_CREDENTIALS_FILE;
if (!credentialsPath) throw new Error('YOUTUBE_OAUTH_CREDENTIALS_FILE is not configured.');
const credentials = JSON.parse(await readFile(path.resolve(credentialsPath), 'utf8'));
const web = credentials.web;
if (!web?.client_id || !web?.client_secret) throw new Error('YouTube OAuth web credentials are incomplete.');
const configuredKey = process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY?.trim() || `${web.client_id}:${web.client_secret}`;
const key = createHash('sha256').update(configuredKey, 'utf8').digest();
const encryptedPath = path.join(runtimeRoot, 'connections', 'youtube.json.enc');
const payload = JSON.parse(await readFile(encryptedPath, 'utf8'));
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
const connection = JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
let accessToken = connection.accessToken;
if (Number(connection.expiresAt || 0) < Date.now() + 60_000 && connection.refreshToken) {
  const refresh = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: web.client_id, client_secret: web.client_secret, refresh_token: connection.refreshToken, grant_type: 'refresh_token' }) });
  if (!refresh.ok) throw new Error(`YouTube token refresh failed: ${refresh.status}`);
  accessToken = (await refresh.json()).access_token;
}
const api = async (url, init = {}) => {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  if (!response.ok && response.status !== 404) throw new Error(`YouTube API ${init.method || 'GET'} ${response.status}: ${await response.text()}`);
  return response;
};
const resolve = async (id) => {
  const response = await api(`https://www.googleapis.com/youtube/v3/videos?part=id,snippet,status,processingDetails&id=${encodeURIComponent(id)}`);
  const body = await response.json();
  return body.items?.[0] || null;
};

if (command === 'status' || command === 'sync') {
  const explicitIds = values('--video-id');
  const jobs = jobId ? [await readJob(jobId)] : await allYoutubeJobs();
  const ids = [...new Set([...explicitIds, ...jobs.map((job) => job.platformId)])];
  if (ids.length === 0) throw new Error('No local YouTube jobs or --video-id values were found.');
  if (ids.some((id) => !/^[A-Za-z0-9_-]{6,32}$/.test(id))) throw new Error('A --video-id is invalid.');
  const results = [];
  for (const id of ids) {
    const item = await resolve(id);
    const job = jobs.find((candidate) => candidate.platformId === id);
    const result = { id, jobId: job?.id || null, exists: Boolean(item), title: item?.snippet?.title || null, privacyStatus: item?.status?.privacyStatus || null, uploadStatus: item?.status?.uploadStatus || null, processingStatus: item?.processingDetails?.processingStatus || null };
    results.push(result);
    if (command === 'sync' && job) {
      const synced = { ...job, ...(result.title ? { title: result.title } : {}), privacy: result.privacyStatus || job.privacy, providerStatus: result.privacyStatus === 'public' ? 'public-verified' : result.processingStatus || result.uploadStatus || (result.exists ? job.providerStatus : 'missing'), updatedAt: new Date().toISOString() };
      await writeJob(synced);
    }
  }
  const archive = command === 'sync' ? await refreshNewsroomArchive() : null;
  console.log(JSON.stringify({ synced: command === 'sync', results, ...(archive ? { archive } : {}) }, null, 2));
} else if (command === 'make-public') {
  if (!jobId || !argv.includes('--confirm-public')) throw new Error('make-public requires --job <youtube-job-id> --confirm-public after human approval.');
  const job = await readJob(jobId);
  if (job.state !== 'published' || job.privacy !== 'private') throw new Error('Only a fully processed private job can be made public.');
  const item = await resolve(job.platformId);
  if (!item || item.id !== job.platformId || item.status?.privacyStatus !== 'private') throw new Error('The exact private YouTube video could not be resolved.');
  const response = await api('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ id: job.platformId, status: { ...item.status, privacyStatus: 'public' } }) });
  if (!response.ok) throw new Error(`Public transition failed: ${response.status}`);
  const verified = await resolve(job.platformId);
  if (verified?.status?.privacyStatus !== 'public') throw new Error('Public transition verification failed.');
  const updated = { ...job, privacy: 'public', providerStatus: 'public-verified', updatedAt: new Date().toISOString() };
  await writeJob(updated);
  const archive = await refreshNewsroomArchive();
  console.log(JSON.stringify({ jobId, id: job.platformId, privacyStatus: 'public', localJobSynced: true, archive }, null, 2));
} else if (command === 'comment') {
  if (!jobId || !textFile || !argv.includes('--confirm-comment')) throw new Error('comment requires --job <youtube-job-id> --text-file <path> --confirm-comment after human approval.');
  const job = await readJob(jobId);
  if (job.state !== 'published' || job.privacy !== 'public' || !job.accountId || !job.projectSlug) throw new Error('Only an exact successful public YouTube job can receive a comment.');
  const resolvedTextFile = path.resolve(textFile);
  if (!resolvedTextFile.startsWith(`${workspace}${path.sep}`)) throw new Error('The comment text file must stay inside the workspace.');
  const text = (await readFile(resolvedTextFile, 'utf8')).trim();
  if (!text || text.length > 10_000) throw new Error('The comment text must contain 1 to 10,000 characters.');
  const textSha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const remoteVideo = await resolve(job.platformId);
  if (!remoteVideo || remoteVideo.id !== job.platformId || remoteVideo.status?.privacyStatus !== 'public') throw new Error('The exact public YouTube video could not be resolved.');

  const existingResponse = await api(`https://www.googleapis.com/youtube/v3/commentThreads?part=id,snippet&videoId=${encodeURIComponent(job.platformId)}&maxResults=100&order=time&textFormat=plainText`);
  const existingBody = await existingResponse.json();
  const existing = existingBody.items?.find((thread) => {
    const comment = thread?.snippet?.topLevelComment;
    return comment?.snippet?.authorChannelId?.value === job.accountId && comment?.snippet?.textOriginal === text;
  });

  let commentId = existing?.snippet?.topLevelComment?.id || null;
  let created = false;
  if (!commentId) {
    const response = await api('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ snippet: { channelId: job.accountId, videoId: job.platformId, topLevelComment: { snippet: { textOriginal: text } } } }),
    });
    const inserted = await response.json();
    commentId = inserted?.snippet?.topLevelComment?.id || null;
    created = true;
  }
  if (!commentId) throw new Error('YouTube did not return an exact top-level comment id.');
  const verification = await api(`https://www.googleapis.com/youtube/v3/comments?part=id,snippet&id=${encodeURIComponent(commentId)}&textFormat=plainText`);
  const verified = (await verification.json()).items?.[0];
  if (verified?.id !== commentId || verified?.snippet?.authorChannelId?.value !== job.accountId || verified?.snippet?.textOriginal !== text) throw new Error('The exact YouTube comment verification failed.');
  const updated = { ...job, comment: { commentId, text, textSha256, createdAt: new Date().toISOString(), createdBy: 'youtube-data-api-v3', pinned: false, pinnedAt: null }, updatedAt: new Date().toISOString() };
  await writeJob(updated);
  console.log(JSON.stringify({ jobId, videoId: job.platformId, commentId, textSha256, created, verified: true }, null, 2));
} else if (command === 'delete') {
  if (!jobId || !argv.includes('--confirm-delete')) throw new Error('delete requires --job <youtube-job-id> --confirm-delete after human approval.');
  const job = await readJob(jobId);
  if (job.state === 'deleted') throw new Error('The local job is already marked deleted.');
  const item = await resolve(job.platformId);
  if (item && item.id !== job.platformId) throw new Error('The deletion target did not resolve exactly.');
  if (item) {
    const response = await api(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(job.platformId)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) throw new Error(`Delete failed: ${response.status}`);
  }
  if (await resolve(job.platformId)) throw new Error('Deletion verification failed; the local job was not changed.');
  const updated = { ...job, state: 'deleted', providerStatus: 'deleted-verified', updatedAt: new Date().toISOString() };
  await writeJob(updated);
  const archive = await refreshNewsroomArchive();
  console.log(JSON.stringify({ jobId, id: job.platformId, deleted: true, localJobSynced: true, archive }, null, 2));
} else {
  throw new Error('Usage: youtube-maintenance.mjs status|sync [--job ID|--video-id ID] | make-public --job ID --confirm-public | comment --job ID --text-file PATH --confirm-comment | delete --job ID --confirm-delete');
}
