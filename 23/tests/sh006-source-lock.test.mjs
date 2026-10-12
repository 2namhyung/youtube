import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();
const sourcePath = path.join(root, 'data/raw/episode-media/episode-001/LAW-REVISION-21857/law-revision-21857-full.png');
const bundleDir = path.join(root, 'video/qa/episode-001-work-v01/source-lock/SH006');
const metadataPath = path.join(bundleDir, 'SH006-source-lock.json');
const expectedSourceSha256 = '118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('SH006 source-lock bundle is tied to the immutable official candidate', async () => {
  const source = await readFile(sourcePath);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.equal(sha256(source), expectedSourceSha256);
  assert.equal(metadata.source.sha256, expectedSourceSha256);
  assert.equal(metadata.source.mime, 'image/jpeg');
  assert.equal(metadata.source.width, 1280);
  assert.equal(metadata.source.height, 720);
  assert.equal(metadata.source.official_url, 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all');
});

test('SH006 source-lock outputs are decodable PNGs at review dimensions', async () => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  for (const output of Object.values(metadata.outputs)) {
    const outputPath = path.join(root, output.path);
    const bytes = await readFile(outputPath);
    const probe = await sharp(bytes).metadata();
    assert.equal(probe.format, 'png', output.path);
    assert.equal(probe.width, output.width, output.path);
    assert.equal(probe.height, output.height, output.path);
    assert.equal(sha256(bytes), output.sha256, output.path);
  }
  assert.deepEqual(metadata.outputs.source_lock_contact && {
    width: metadata.outputs.source_lock_contact.width,
    height: metadata.outputs.source_lock_contact.height,
  }, {width: 1920, height: 1080});
  assert.deepEqual({
    width: metadata.outputs.normalized_header_crop.width,
    height: metadata.outputs.normalized_header_crop.height,
  }, {width: 1600, height: 220});
});

test('SH006 exact candidate retype preserves the requested two contiguous lines', async () => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.deepEqual(metadata.exact_retype_candidate.lines, ['⊙법률 제21857호', '형사소송법 일부개정법률']);
  assert.equal(metadata.exact_retype_candidate.line_count, 2);
  assert.ok(metadata.exact_retype_candidate.font_size_px >= 72);
  assert.match(metadata.exact_retype_candidate.source_locator, /날짜는 별도 metadata/u);
  assert.deepEqual(metadata.crop.pixels, {left: 320, top: 65, width: 640, height: 88});
  assert.equal(metadata.crop.normalized.left, 0.25);
  assert.equal(metadata.crop.normalized.top, 0.0902777778);
  assert.match(metadata.crop.locator, /gray 검색 UI\/control 제외/u);
});

test('SH006 source-lock remains pending and cannot be mistaken for a production PASS', async () => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.equal(metadata.status, 'pending-human-review');
  assert.equal(metadata.approval.user_pass, false);
  assert.equal(metadata.approval.production_cut_approved, false);
  assert.equal(metadata.approval.omni_video_approved, false);
  assert.equal(metadata.approval.rights_approved, false);
  assert.match(metadata.approval.note, /컷\/PASS를 기록하지 않는다/u);
  assert.equal(metadata.rights_boundary.official_legal_basis.article, '제7조 제1호 (보호받지 못하는 저작물)');
  assert.equal(metadata.rights_boundary.official_legal_basis.official_url, 'https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769');
  assert.equal(metadata.rights_boundary.official_legal_basis.verified_status, 'official-source-verified');
  assert.equal(metadata.rights_boundary.database_asset_approval, 'pending');
  assert.match(metadata.rights_boundary.website_ui, /UI·로고·아이콘/u);
});
