import assert from 'node:assert/strict';
import { buildEditableTrackContract } from './production-lib.mjs';

const pending = buildEditableTrackContract({
  scriptAsset: 'script.json', scriptSha256: 'a'.repeat(64), narrationAsset: 'narration-retimed.m4a',
  visualTrackCount: 26, captionCueCount: 36, bgmAsset: null, bgmRequired: false,
});
assert.equal(pending.version, 'opencut-editable-tracks-v1');
assert.deepEqual(pending.script, { status: 'ready', asset: 'script.json', sha256: 'a'.repeat(64), representation: 'authoritative-json' });
assert.deepEqual(pending.narration, { status: 'ready', asset: 'narration-retimed.m4a', trackType: 'audio' });
assert.deepEqual(pending.visuals, { status: 'ready', trackType: 'video', trackCount: 26 });
assert.deepEqual(pending.captions, { status: 'ready', representation: 'editable-cues', cueCount: 36 });
assert.deepEqual(pending.bgm, { status: 'pending', asset: null, trackType: 'audio', required: false });

const ready = buildEditableTrackContract({
  scriptAsset: 'script.json', scriptSha256: 'b'.repeat(64), narrationAsset: 'narration-retimed.m4a',
  visualTrackCount: 12, captionCueCount: 18, bgmAsset: 'background-music.m4a', bgmRequired: true,
});
assert.deepEqual(ready.bgm, { status: 'ready', asset: 'background-music.m4a', trackType: 'audio', required: true });
assert.throws(() => buildEditableTrackContract({ scriptAsset: null, narrationAsset: '', visualTrackCount: 1, captionCueCount: 1 }), /narration/);
assert.throws(() => buildEditableTrackContract({ scriptAsset: null, narrationAsset: 'voice.m4a', visualTrackCount: 0, captionCueCount: 1 }), /visual/);

console.log('editable handoff contract tests passed (script, narration, visuals, captions, pending/ready BGM)');
