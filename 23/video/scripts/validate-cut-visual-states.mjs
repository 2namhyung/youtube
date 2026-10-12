import {spawnSync} from 'node:child_process';
import path from 'node:path';

import {loadProductionContext, readJson, ROOT, STAGES, valueFor} from './qa-runtime.mjs';
import {previewFrames, validateManifestTimingAuthority, validateVisualStateManifest} from './visual-state-lib.mjs';

const args = process.argv.slice(2);
const context = await loadProductionContext(args);
const failures = [];
const cuts = [];
if (context.stageIndex >= STAGES.indexOf('cut-previews-ready') && !context.activeRoot) failures.push('cut-previews-ready and later require active_cut_root for visual-state QA');
for (const cut of context.cuts) {
  const manifest = await readJson(path.join(cut.root, 'manifest.json'));
  failures.push(...validateVisualStateManifest(manifest));
  cuts.push({shot_id: manifest.shot_id, production_mode: manifest.production_mode, frames: previewFrames(manifest)});
}
if (context.stageIndex >= STAGES.indexOf('cut-previews-ready') && context.cuts.length > 0) {
  const planValue = valueFor(args, '--plan', context.state.draft_inputs?.narration_plan);
  if (typeof planValue !== 'string' || planValue.trim() === '') failures.push('active production requires draft_inputs.narration_plan timing authority');
  else {
    const planPath = path.resolve(ROOT, planValue);
    const plan = await readJson(planPath);
    const manifests = await Promise.all(context.cuts.map((cut) => readJson(path.join(cut.root, 'manifest.json'))));
    let measuredReport = null;
    const finalVoice = context.stageIndex >= STAGES.indexOf('final-voice-locked');
    if (finalVoice) {
      const narrationArgs = [path.resolve(ROOT, 'video/scripts/validate-narration-plan.mjs'), '--strict', '--plan', planPath];
      const audioDir = valueFor(args, '--audio-dir', null);
      if (audioDir) narrationArgs.push('--audio-dir', audioDir);
      const result = spawnSync(process.execPath, narrationArgs, {cwd: ROOT, encoding: 'utf8', windowsHide: true});
      try { measuredReport = JSON.parse(result.stdout); } catch { failures.push('strict narration measurement did not return JSON'); }
      if (result.status !== 0) failures.push('strict narration measurement failed before final timing comparison');
    }
    failures.push(...validateManifestTimingAuthority({manifests, plan, measuredReport, finalVoice}));
  }
}
const report = {ok: failures.length === 0, stage: context.state.stage, active_cut_root: context.state.active_cut_root, skipped: context.cuts.length === 0, cuts, failures};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
