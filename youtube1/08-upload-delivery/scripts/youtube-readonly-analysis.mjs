import { createDecipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workspace = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/+/, '').replaceAll('/', path.sep));
const appEnv = path.join(workspace, '06-production', 'opencut-automation', 'opencut-classic', 'apps', 'web', '.env.local');
const runtimeRoot = path.join(workspace, '08-upload-delivery', 'runtime');

try {
  const envText = await readFile(appEnv, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
} catch { /* caller may provide environment explicitly */ }

const credentialsPath = process.env.YOUTUBE_OAUTH_CREDENTIALS_FILE;
if (!credentialsPath) throw new Error('YOUTUBE_OAUTH_CREDENTIALS_FILE is not configured.');
const credentials = JSON.parse(await readFile(path.resolve(credentialsPath), 'utf8'))?.web;
if (!credentials?.client_id || !credentials?.client_secret) throw new Error('YouTube OAuth web credentials are incomplete.');

const configuredKey = process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY?.trim() || `${credentials.client_id}:${credentials.client_secret}`;
const key = createHash('sha256').update(configuredKey, 'utf8').digest();
const encrypted = JSON.parse(await readFile(path.join(runtimeRoot, 'connections', 'youtube.json.enc'), 'utf8'));
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
const connection = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]).toString('utf8'));

let accessToken = connection.accessToken;
if (Number(connection.expiresAt || 0) < Date.now() + 60_000 && connection.refreshToken) {
  const refresh = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!refresh.ok) throw new Error(`YouTube token refresh failed: ${refresh.status}`);
  accessToken = (await refresh.json()).access_token;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}: ${body?.error?.message || 'request failed'}`);
  return body;
}

const channel = (await getJson('https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails,statistics&mine=true')).items?.[0];
if (!channel?.id) throw new Error('The connected account has no resolvable YouTube channel.');

const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
const uploadItems = [];
let pageToken = '';
do {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.search = new URLSearchParams({ part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: '50', ...(pageToken ? { pageToken } : {}) }).toString();
  const page = await getJson(url);
  uploadItems.push(...(page.items || []));
  pageToken = page.nextPageToken || '';
} while (pageToken && uploadItems.length < 200);

const videoIds = uploadItems.map((item) => item.contentDetails?.videoId).filter(Boolean);
const videos = [];
for (let index = 0; index < videoIds.length; index += 50) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search = new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', id: videoIds.slice(index, index + 50).join(',') }).toString();
  videos.push(...((await getJson(url)).items || []));
}

const todayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const todayPart = (type) => todayParts.find((part) => part.type === type)?.value;
const today = `${todayPart('year')}-${todayPart('month')}-${todayPart('day')}`;
const startDate = videos.map((video) => video.snippet?.publishedAt?.slice(0, 10)).filter(Boolean).sort()[0] || `${new Date().getUTCFullYear()}-01-01`;
const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
analyticsUrl.search = new URLSearchParams({
  ids: 'channel==MINE', startDate, endDate: today,
  metrics: 'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost',
  dimensions: 'video', sort: '-engagedViews', maxResults: '200',
}).toString();

let analytics = null;
let analyticsError = null;
try { analytics = await getJson(analyticsUrl); } catch (error) { analyticsError = error instanceof Error ? error.message : String(error); }

const retention = {};
if (analytics) {
  for (const video of videos) {
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    url.search = new URLSearchParams({
      ids: 'channel==MINE', startDate: video.snippet?.publishedAt?.slice(0, 10) || startDate, endDate: today,
      metrics: 'audienceWatchRatio,relativeRetentionPerformance', dimensions: 'elapsedVideoTimeRatio',
      filters: `video==${video.id};audienceType==ORGANIC`, sort: 'elapsedVideoTimeRatio',
    }).toString();
    try { retention[video.id] = await getJson(url); } catch (error) { retention[video.id] = { error: error instanceof Error ? error.message : String(error) }; }
  }
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  channel: { id: channel.id, title: channel.snippet?.title, statistics: channel.statistics },
  videos: videos.map((video) => ({
    id: video.id, title: video.snippet?.title, publishedAt: video.snippet?.publishedAt,
    duration: video.contentDetails?.duration, privacyStatus: video.status?.privacyStatus, statistics: video.statistics,
  })),
  analytics, analyticsError, retention,
}, null, 2));
