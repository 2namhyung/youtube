import {copyFile, mkdir, writeFile, access} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const publicDir = path.join(root, 'video', 'public', 'assets', 'episode-001-v03');
const renderDir = path.join(root, 'public', 'video', 'assets', 'episode-001-v03');
const renderSharedDir = path.join(root, 'public', 'video', 'assets', 'shared');
const plan = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(episodeDir, 'narration-plan.json'), 'utf8'));
const background = path.join(root, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png');
const officialDir = path.join(publicDir, 'official');

await mkdir(officialDir, {recursive: true});
await mkdir(renderSharedDir, {recursive: true});
await mkdir(path.join(renderDir, 'official'), {recursive: true});
await copyFile(path.join(root, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png'), path.join(renderSharedDir, 'paper-beige-check.png'));
for (const name of [
  'bill-2220257-full.png',
  'law-196-delete.png',
  'law-197-2-requirement-deadline.png',
  'law-revision-21857-full.png',
  'petition-2200332-minutes.png',
]) {
  const source = path.join(root, 'video', 'source-intake', 'episode-001', 'official', name);
  try {
    await access(source);
    await copyFile(source, path.join(officialDir, name));
    await copyFile(source, path.join(renderDir, 'official', name));
  } catch { /* source may be added later */ }
}

for (const cut of plan.cuts) {
  const cutDir = path.join(publicDir, 'cuts', cut.shot_id);
  await mkdir(path.join(cutDir, 'assets'), {recursive: true});
  // Effects are opt-in; never leave an empty effects/ directory in a cut.
  await mkdir(path.join(cutDir, 'omni'), {recursive: true});
  await copyFile(background, path.join(cutDir, 'background.png'));
  await writeFile(path.join(cutDir, 'manifest.json'), `${JSON.stringify({
    shot_id: cut.shot_id,
    episode_id: 'episode-001',
    status: 'rejected-provisional-visual',
    active: false,
    review_state: 'rejected-provisional-visual',
    production_mode: cut.production_mode,
    background: 'background.png',
    narration_chars_per_second: plan.draft_timing_assumption.compact_korean_chars_per_second,
    asset_policy: 'open on empty fixed background; animate assets in; end with all key elements visible',
    source_ids: cut.source_ids,
  }, null, 2)}\n`, 'utf8');
}

// The root-invoked render command does not discover video/remotion.config.ts.
// Mirror only the still inputs used by the current master into root public/;
// video/public/assets remains the canonical source tree.
for (const shotId of ['SH008', 'SH009', 'SH010', 'SH011', 'SH012', 'SH013', 'SH014']) {
  const source = path.join(publicDir, 'cuts', shotId, 'assets', 'start.png');
  try {
    await access(source);
    await mkdir(path.join(renderDir, 'cuts', shotId, 'assets'), {recursive: true});
    await copyFile(source, path.join(renderDir, 'cuts', shotId, 'assets', 'start.png'));
  } catch { /* generated keyframe may not exist yet */ }
}

console.log(JSON.stringify({cuts: plan.cuts.length, root: path.relative(root, publicDir)}, null, 2));
