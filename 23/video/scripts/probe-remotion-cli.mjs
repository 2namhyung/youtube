import {access, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {QA_ENTRY, REMOTION_CLI, renderStill} from './qa-runtime.mjs';

const temp = await mkdtemp(path.join(os.tmpdir(), '23jung-remotion-probe-'));
try {
  const output = path.join(temp, 'qa-probe.png');
  renderStill({composition: 'ManifestCutProvisionalStill', output, propsFile: '{}'});
  await access(output);
  console.log(JSON.stringify({ok: true, command: process.execPath, cli: REMOTION_CLI, entry: QA_ENTRY, output_created: true}, null, 2));
} finally {
  await rm(temp, {recursive: true, force: true});
}
