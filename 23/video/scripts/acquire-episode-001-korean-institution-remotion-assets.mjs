import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = 'video/source-intake/episode-001/source-selection-v02/remotion-institution-assets-v01';
const categories = [
  ['prosecution', 'Category:Prosecutor offices in South Korea'],
  ['police', 'Category:Police stations in South Korea'],
];
const api = 'https://commons.wikimedia.org/w/api.php';
const clean = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const records = [];
await fs.mkdir(`${root}/originals`, { recursive: true });
await fs.mkdir(`${root}/thumbs`, { recursive: true });

for (const [family, category] of categories) {
  const url = new URL(api);
  url.search = new URLSearchParams({ action: 'query', generator: 'categorymembers', gcmtitle: category, gcmtype: 'file', gcmlimit: '40', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', format: 'json', origin: '*' });
  const response = await fetch(url, { headers: { 'user-agent': '23jung-source-research/1.0' } });
  if (!response.ok) throw new Error(`Commons ${response.status}: ${category}`);
  const payload = await response.json();
  for (const page of Object.values(payload.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/jpeg$/i.test(info.mime ?? '')) continue;
    const sourceUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`;
    const id = `commons-${page.pageid}`;
    const imageResponse = await fetch(info.url, { headers: { 'user-agent': '23jung-source-research/1.0' } });
    if (!imageResponse.ok || !/^image\//i.test(imageResponse.headers.get('content-type') ?? '')) continue;
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const originalPath = `${root}/originals/${id}.jpg`;
    const thumbnailPath = `${root}/thumbs/${id}.jpg`;
    try { await sharp(bytes).metadata(); } catch { continue; }
    await fs.writeFile(originalPath, bytes);
    await sharp(bytes).rotate().resize({ width: 768, height: 500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(thumbnailPath);
    const meta = info.extmetadata ?? {};
    records.push({ candidate_id: id, title: page.title.replace(/^File:/, ''), provider: 'commons', provider_id: String(page.pageid), original_path: originalPath, thumbnail_path: thumbnailPath, source_url: sourceUrl, original_url: info.url, creator: clean(meta.Artist?.value), license: clean(meta.LicenseShortName?.value), license_url: meta.LicenseUrl?.value ?? '', sha256, bytes: bytes.length, width: info.width, height: info.height, media_type: 'photo', review_profile: 'source-photo-treatment', subject_family: `korean-${family}-building`, visual_observation: `${category}에 분류된 대한민국 ${family === 'prosecution' ? '검찰청' : '경찰서'} 건물 사진. 정확한 건물명과 화각은 제목 및 원본 페이지에서 확인한다.`, disposition: 'candidate-pending-human-visual-review', limitations: '기관 외관 맥락용이며 특정 사건·행동의 증거가 아니다.', decode_valid: true, source_approval: false, rights_approval: false, user_approval: false, production_authority: false });
  }
}
await fs.writeFile(`${root}/candidates.json`, `${JSON.stringify({ schema_version: 1, artifact_kind: 'remotion-korean-institution-live-asset-candidates', categories: categories.map(([, value]) => value), candidates: records, production_authority: false }, null, 2)}\n`);
console.log(JSON.stringify({ output: `${root}/candidates.json`, candidates: records.length, prosecution: records.filter((x) => x.subject_family.includes('prosecution')).length, police: records.filter((x) => x.subject_family.includes('police')).length }, null, 2));

