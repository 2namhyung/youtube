import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const {validateSourceVideoContract} = await import('../video/scripts/source-video-contract.mjs');
const {SequencedSourceVideo, SourceVideoMedia, sourceVideoPlaybackWindow, sourceVideoTrimRange} = await import('../video/src/vox/scene/source-video.ts');

const timecode = {start: '00:07:21.465', end: '00:07:28.887', start_seconds: 441.465, end_seconds: 448.887, speaker: '김승원', context: '제22대 국회 제437회 제3차 본회의', locator: 'official player', locator_basis: 'official player and minutes'};
const asset = {asset_id: 'statement', file: 'source-video/full.mp4', media_type: 'video/mp4', role: 'evidence', z_index: 10, source_id: 'ASSEMBLY-TEST', source_duration_seconds: 600, source_timecode: timecode};

test('source-video renderer converts exact seconds to @remotion/media trimBefore/trimAfter props', () => {
  assert.deepEqual(sourceVideoTrimRange(asset, 30), {trimBefore: 13244, trimAfter: 13467});
  assert.deepEqual(sourceVideoTrimRange({...asset, media_type: 'image/png'}, 30), {});
  const element = SourceVideoMedia({asset, src: '/full.mp4', fps: 30, style: {width: '100%'}});
  assert.equal(element.props.trimBefore, 13244);
  assert.equal(element.props.trimAfter, 13467);
  assert.equal('startFrom' in element.props, false);
  assert.equal('endAt' in element.props, false);
});

test('delayed source-video component starts its trimmed clip at its first active frame', () => {
  const delayed = {...asset, source_timecode: {...timecode, start: '00:02:08.102', end: '00:02:16.273', start_seconds: 128.102, end_seconds: 136.273}};
  assert.deepEqual(sourceVideoPlaybackWindow({asset: delayed, fps: 30, activationFrame: 149, activeEndFrame: 299}), {trimBefore: 3843, trimAfter: 4088, from: 149, durationInFrames: 150});
  const sequence = SequencedSourceVideo({asset: delayed, src: '/full.mp4', fps: 30, activationFrame: 149, activeEndFrame: 299, style: {width: '100%'}});
  assert.equal(sequence.props.from, 149);
  assert.equal(sequence.props.durationInFrames, 150);
  const mediaElement = sequence.props.children.type(sequence.props.children.props);
  assert.equal(mediaElement.props.trimBefore, 3843);
  assert.equal(mediaElement.props.trimAfter, 4088);
  assert.equal(149 - sequence.props.from, 0, 'global activation frame maps to local frame 0');
  assert.equal(150 - sequence.props.from, 1, 'next global frame maps to local frame 1');
  assert.equal(SequencedSourceVideo({asset: delayed, src: '/full.mp4', fps: 30, activationFrame: 149, activeEndFrame: 299, frameOverride: 148, style: {}}), null, 'preview stays hidden before activation');
  const activationPreview = SequencedSourceVideo({asset: delayed, src: '/full.mp4', fps: 30, activationFrame: 149, activeEndFrame: 299, frameOverride: 149, style: {}});
  assert.equal(activationPreview.props.frame, 0, 'frameOverride preview also maps activation to local frame 0');
});

test('source-video validator accepts complete metadata and rejects absent, mismatched, or out-of-bounds ranges', () => {
  assert.deepEqual(validateSourceVideoContract({assets: [asset]}), []);
  assert.match(validateSourceVideoContract({assets: [{...asset, source_timecode: undefined}]}).join('\n'), /requires exact source_timecode/u);
  assert.match(validateSourceVideoContract({assets: [{...asset, source_timecode: {...timecode, start_seconds: 1}}]}).join('\n'), /string\/seconds mismatch/u);
  assert.match(validateSourceVideoContract({assets: [{...asset, source_duration_seconds: 440}]}).join('\n'), /exceeds source_duration_seconds/u);
});

test('official Assembly locators remain metadata only and are not claimed by the current 36-cut source plan', () => {
  const evidence = JSON.parse(fs.readFileSync('video/source-intake/episode-001/official/source-video-evidence.json', 'utf8'));
  const spec = JSON.parse(fs.readFileSync('video/episodes/episode-001/episode-spec.json', 'utf8'));
  assert.equal(evidence.status, 'metadata-only-rights-review-required');
  assert.match(evidence.rights.reason, /상업적 이용 금지/u);
  assert.deepEqual(evidence.sources.map((item) => [item.source_id, item.timecode.start, item.timecode.end]), [
    ['ASSEMBLY-PLENARY-661510-KIM-SEUNG-WON', '00:07:21.465', '00:07:28.887'],
    ['ASSEMBLY-PLENARY-661559-PARK-HYEONG-SOO', '00:02:08.102', '00:02:16.273'],
  ]);
  const sh003 = spec.cuts.find((cut) => cut.shot_id === 'SH003');
  assert.equal(sh003.production_mode, 'omni');
  assert.equal(sh003.production_authority, false);
  assert.deepEqual(sh003.evidence_originals, []);
  assert.ok(sh003.source_ids.includes('FICTION-SH003'));
  const obsoleteLocators = new Set(evidence.sources.map((item) => item.source_id));
  assert.ok(spec.cuts.every((cut) => !cut.source_ids.some((sourceId) => obsoleteLocators.has(sourceId))));
  assert.ok(spec.cuts.every((cut) => !cut.requirements.some((item) => obsoleteLocators.has(item.source_id))));
});
