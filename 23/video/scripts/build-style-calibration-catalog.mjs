import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

import {ROOT, safeEpisodeId} from './qa-runtime.mjs';

const statePath = path.resolve(ROOT, process.env.STYLE_CALIBRATION_STATE ?? 'video/episodes/episode-001/production-state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
safeEpisodeId(state);
const calibration = state.style_calibration;
const candidateRelative = typeof calibration?.candidate_root === 'string' ? calibration.candidate_root.replaceAll('\\', '/') : '';
const expectedShots = Array.isArray(calibration?.shot_ids) ? calibration.shot_ids : [];
const playableShots = new Set(Array.isArray(calibration?.playable_shot_ids) ? calibration.playable_shot_ids : []);
const publicAssets = path.resolve(ROOT, 'video/public/assets');
const candidateRoot = path.resolve(ROOT, candidateRelative);

if (state.stage !== 'timing-draft' || state.active_cut_root !== null) throw new Error('style calibration Studio requires inactive timing-draft production state');
if (calibration?.status !== 'draft' || calibration?.user_approved === true || calibration?.approval_marker) throw new Error('style calibration Studio requires an unapproved draft calibration');
if (!/^video\/public\/assets\/[a-z0-9-]+$/u.test(candidateRelative)) throw new Error('unsafe style calibration candidate root');
const relativeToPublicAssets = path.relative(publicAssets, candidateRoot);
if (!relativeToPublicAssets || relativeToPublicAssets.startsWith('..') || path.isAbsolute(relativeToPublicAssets)) throw new Error('style calibration candidate root must be inside video/public/assets');
if (state.provisional_artifacts?.[candidateRelative] !== 'style-calibration-candidate') throw new Error('candidate root is not marked style-calibration-candidate');
if (!expectedShots.length || expectedShots.some((shotId) => !/^SH\d{3}$/u.test(shotId))) throw new Error('invalid calibration shot list');

const entries = [];
for (const shotId of [...expectedShots].sort()) {
  const shotRoot = path.join(candidateRoot, 'cuts', shotId);
  const manifest = JSON.parse(await readFile(path.join(shotRoot, 'manifest.json'), 'utf8'));
  // The JSON contract permits explicit null for a non-Omni cut. The runtime
  // type models this as an absent optional field, so normalize only the
  // generated catalog representation without changing the source manifest.
  if (manifest.omni === null) delete manifest.omni;
  if (manifest.shot_id !== shotId || manifest.episode_id !== state.episode_id) throw new Error(`${shotId}: manifest identity mismatch`);
  if (manifest.fps !== 30 || !Number.isInteger(manifest.duration_frames) || manifest.duration_frames <= 0) throw new Error(`${shotId}: invalid duration/fps`);
  if (manifest.schema_version !== 3) throw new Error(`${shotId}: v06 calibration candidates require schema_version=3`);
  if (manifest.approvals?.generation_input?.user_pass || manifest.approvals?.playable_cut?.user_pass) throw new Error(`${shotId}: calibration must remain pending`);
  if (manifest.production_mode === 'omni' && (manifest.omni?.video_status !== 'blocked_until_all_cuts_passed' || manifest.omni?.output !== null)) throw new Error(`${shotId}: Omni output is blocked until all cuts pass`);
  if (!playableShots.has(shotId)) continue;
  if (manifest.review_profile !== 'remotion-motion' || manifest.production_mode !== 'remotion') throw new Error(`${shotId}: Studio exposes remotion-motion profiles only`);
  entries.push({
    shotId,
    compositionId: `Calibration-${shotId}`,
    manifest,
    cutBasePath: path.relative(path.resolve(ROOT, 'video/public'), shotRoot).replaceAll('\\', '/'),
  });
}

const generatedDir = path.resolve(ROOT, 'video/src/generated');
await mkdir(generatedDir, {recursive: true});
const source = `import type {AnyCutManifest} from '../cut-manifest';\n\nexport type StyleCalibrationEntry = {\n  shotId: string;\n  compositionId: string;\n  manifest: AnyCutManifest;\n  cutBasePath: string;\n};\n\nexport const styleCalibrationCatalog: StyleCalibrationEntry[] = ${JSON.stringify(entries, null, 2)};\n`;
await writeFile(path.join(generatedDir, 'style-calibration-catalog.ts'), source, 'utf8');
console.log(JSON.stringify({ok: true, generated: 'video/src/generated/style-calibration-catalog.ts', compositions: entries.map((entry) => entry.compositionId)}, null, 2));
