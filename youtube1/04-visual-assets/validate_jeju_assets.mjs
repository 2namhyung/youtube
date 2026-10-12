#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = path.join(workspace, '06-production', 'opencut-automation');
const projectDir = path.join(production, 'production', 'projects', 'school-case-production');
const project = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8'));
const mediaReviewPath = path.join(production, 'production', 'newsroom', 'projects', 'jeju-school-intrusion.media.json');
const mediaReview = JSON.parse(await fs.readFile(mediaReviewPath, 'utf8'));
const digest = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

const imageDir = path.join(projectDir, 'assets', 'images-v2');
const imageNames = (await fs.readdir(imageDir)).filter((name) => /\.(?:png|jpe?g)$/i.test(name)).sort();
assert.equal(imageNames.length, 12, 'exactly 12 AI reenactment images are required');
const images = [];
for (const name of imageNames) {
  const file = path.join(imageDir, name);
  const stat = await fs.stat(file);
  assert.ok(stat.size > 0, `${name} is empty`);
  images.push({ path: path.relative(workspace, file).replaceAll(path.sep, '/'), size: stat.size, sha256: await digest(file), generated: true, disclosure: '사건 내용 기반 AI 재구성' });
}

assert.equal(project.media?.clips?.length, 4, 'exactly four bounded KCTV clips are required');
const approved = mediaReview.candidates?.find((candidate) => candidate.videoId === project.media.source.candidateVideoId);
assert.equal(approved?.reviewStatus, 'approved', 'KCTV source must retain human approval');
assert.equal(approved?.rightsReview?.status, 'completed', 'KCTV rights review must be completed');
assert.equal(approved?.license, 'creativeCommon', 'KCTV YouTube license snapshot must be Creative Commons');
const attested = mediaReview.clips?.filter((clip) => clip.rightsAttested === true) || [];
const clips = [];
for (const clip of project.media.clips) {
  const file = path.join(projectDir, clip.path);
  const actual = await digest(file);
  assert.equal(actual, clip.sha256, `${clip.path} checksum drift`);
  assert.equal(clip.muted, true, `${clip.path} must remain muted`);
  assert.ok(clip.end > clip.start && clip.end - clip.start <= 3.001, `${clip.path} must remain a bounded three-second excerpt`);
  assert.ok(attested.some((item) => item.startSeconds === clip.start && item.endSeconds === clip.end), `${clip.path} has no matching rights-attested extraction record`);
  const stat = await fs.stat(file);
  clips.push({ path: path.relative(workspace, file).replaceAll(path.sep, '/'), size: stat.size, sha256: actual, startSeconds: clip.start, endSeconds: clip.end, muted: true, rightsAttested: true, attribution: project.media.source.attribution });
}

const result = {
  status: 'passed',
  checkedAt: new Date().toISOString(),
  source: { publisher: project.media.source.publisher, candidateVideoId: project.media.source.candidateVideoId, sourceSha256: project.media.source.sha256, license: approved.license, reviewStatus: approved.reviewStatus, rightsReviewStatus: approved.rightsReview.status, attribution: project.media.source.attribution },
  imageCount: images.length,
  clipCount: clips.length,
  images,
  clips,
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const output = path.resolve(process.argv[outputIndex + 1]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(result));
