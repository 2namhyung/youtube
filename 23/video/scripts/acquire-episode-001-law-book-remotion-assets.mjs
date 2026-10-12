import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const pageIds = ['71323490', '72184420', '72565811', '135623799'];
const root = 'video/source-intake/episode-001/source-selection-v02/remotion-law-book-assets-v01';
const clean = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const candidates = [];
await fs.mkdir(`${root}/originals`, { recursive: true });
await fs.mkdir(`${root}/thumbs`, { recursive: true });
for (const pageId of pageIds) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', pageids: pageId, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1600', format: 'json', origin: '*' });
  const response = await fetch(api, { headers: { 'user-agent': '23jung-source-research/1.0' } });
  if (!response.ok) continue;
  const payload = await response.json();
  const page = payload.query?.pages?.[pageId];
  const info = page?.imageinfo?.[0];
  if (!info || !/\.jpe?g$/i.test(page.title)) continue;
  const assetUrl = info.thumburl ?? info.url;
  const image = await fetch(assetUrl, { headers: { 'user-agent': '23jung-source-research/1.0' } });
  if (!image.ok) continue;
  const bytes = Buffer.from(await image.arrayBuffer());
  await sharp(bytes).metadata();
  const id = `commons-${pageId}`;
  const originalPath = `${root}/originals/${id}.jpg`;
  const thumbnailPath = `${root}/thumbs/${id}.jpg`;
  await fs.writeFile(originalPath, bytes);
  await sharp(bytes).rotate().resize({ width: 768, height: 500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(thumbnailPath);
  const meta = info.extmetadata ?? {};
  candidates.push({ candidate_id: id, title: page.title.replace(/^File:/, ''), provider: 'commons', provider_id: pageId, original_path: originalPath, thumbnail_path: thumbnailPath, source_url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`, original_url: info.url, downloaded_representation: info.thumburl ? `Commons 1600px derivative of original ${info.width}×${info.height}` : `Commons original`, creator: clean(meta.Artist?.value), license: clean(meta.LicenseShortName?.value), license_url: meta.LicenseUrl?.value ?? '', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width: info.width, height: info.height, media_type: 'photo', review_profile: 'source-photo-treatment', subject_family: 'physical-law-library-books', visual_observation: '실제 법학도서관의 법률서적 실물 사진. 책등의 외국 기관명이나 법령명이 읽히는 영역은 production crop에서 제외해야 한다.', disposition: 'candidate-pending-human-crop-review', limitations: '대한민국 법전 자체의 증거가 아니다. 정확한 한국 법률 정체성과 조문은 별도의 래스터 없는 native text surface로만 표시한다.', decode_valid: true, source_approval: false, rights_approval: false, user_approval: false, production_authority: false });
}
await fs.writeFile(`${root}/candidates.json`, `${JSON.stringify({ schema_version: 1, artifact_kind: 'remotion-law-book-live-asset-candidates', candidates, production_authority: false }, null, 2)}\n`);
console.log(JSON.stringify({ output: `${root}/candidates.json`, downloaded: candidates.length, unique_sha256: new Set(candidates.map((x) => x.sha256)).size }, null, 2));



