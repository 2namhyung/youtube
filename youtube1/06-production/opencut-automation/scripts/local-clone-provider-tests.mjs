import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LOCAL_CLONE_MODEL_ID,
  LOCAL_CLONE_MODEL_REVISION,
  attachNarrationProvenance,
  runLocalCloneProvider,
} from './local-clone-provider.mjs';

const root = path.resolve('.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-clone-provider-unit-'));
const cloneRoot = path.join(temp, 'voice-clone');
const prompt = Buffer.from('private-reference-fixture');
const style = 'hook';
const scriptPath = path.join(temp, 'script.txt');

function outputArg(argv) {
  return argv[argv.indexOf('--output') + 1];
}

async function prepareCloneFixture() {
  await fsp.mkdir(path.join(cloneRoot, 'refs'), { recursive: true });
  await fsp.writeFile(scriptPath, '테스트 문장', 'utf8');
  await fsp.writeFile(path.join(cloneRoot, 'refs', 'hook.wav'), prompt);
  await fsp.writeFile(path.join(cloneRoot, 'manifest.json'), JSON.stringify({
    styles: { hook: { promptAudio: 'refs/hook.wav' } },
  }));
  await fsp.writeFile(path.join(cloneRoot, 'model-lock.json'), JSON.stringify({
    repository: LOCAL_CLONE_MODEL_ID,
    revision: LOCAL_CLONE_MODEL_REVISION,
  }));
}

try {
  await prepareCloneFixture();
  const expectedReferenceSha = crypto.createHash('sha256').update(prompt).digest('hex');

  {
    const calls = [];
    const stem = path.join(temp, 'success', 'narration');
    await fsp.mkdir(path.dirname(stem), { recursive: true });
    const result = await runLocalCloneProvider({
      narration: { mode: 'local-clone', style },
      scriptPath,
      stem,
      root,
      cloneRoot,
      platform: 'win32',
      runCommand: async (command, argv) => {
        calls.push({ command, argv });
        if (argv.some((value) => value.endsWith('synthesize.py'))) {
          await fsp.writeFile(outputArg(argv), 'wav');
        } else {
          await fsp.writeFile(argv[2], '1\n00:00:00,000 --> 00:00:01,000\n테스트\n');
        }
      },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(result.provenance, {
      requestedProvider: 'local-clone',
      actualProvider: 'local-clone',
      fallbackUsed: false,
      fallbackReason: null,
      modelId: LOCAL_CLONE_MODEL_ID,
      modelRevision: LOCAL_CLONE_MODEL_REVISION,
      style,
      referenceSha256: expectedReferenceSha,
    });
    const metadata = attachNarrationProvenance({ versionId: 'v1' }, result.provenance);
    const handoff = attachNarrationProvenance({ versionId: 'v1', tracks: [] }, result.provenance);
    assert.deepEqual(metadata.narrationProvider, result.provenance);
    assert.deepEqual(handoff.narrationProvider, result.provenance);
  }

  {
    const calls = [];
    const warnings = [];
    const stem = path.join(temp, 'fallback-synthesis', 'narration');
    await fsp.mkdir(path.dirname(stem), { recursive: true });
    const partialAudio = `${stem}.wav`;
    const result = await runLocalCloneProvider({
      narration: { mode: 'local-clone', style, fallback: 'edge-tts' },
      scriptPath,
      stem,
      root,
      cloneRoot,
      platform: 'win32',
      warn: (message) => warnings.push(message),
      runCommand: async (command, argv) => {
        calls.push({ command, argv });
        if (argv.some((value) => value.endsWith('synthesize.py'))) {
          await fsp.writeFile(partialAudio, 'partial');
          throw new Error('C:\\private\\voice\\secret.wav token=secret');
        }
        if (command === 'edge-tts') {
          await fsp.writeFile(argv[argv.indexOf('--write-media') + 1], 'mp3');
          await fsp.writeFile(argv[argv.indexOf('--write-subtitles') + 1], 'srt');
        }
      },
    });
    assert.equal(result.provenance.actualProvider, 'edge-tts');
    assert.equal(result.provenance.fallbackUsed, true);
    assert.equal(result.provenance.fallbackReason, 'local-synthesis-failed');
    assert.equal(result.provenance.referenceSha256, expectedReferenceSha);
    assert.equal(fs.existsSync(partialAudio), false);
    assert.equal(calls.at(-1).command, 'edge-tts');
    assert.deepEqual(warnings, ['[narration] explicit edge-tts fallback used (local-synthesis-failed)']);
    assert.doesNotMatch(JSON.stringify(result.provenance), /private|secret|token/i);
  }

  {
    const stem = path.join(temp, 'fallback-transcription', 'narration');
    await fsp.mkdir(path.dirname(stem), { recursive: true });
    const result = await runLocalCloneProvider({
      narration: { mode: 'local-clone', style, fallback: 'edge-tts' },
      scriptPath,
      stem,
      root,
      cloneRoot,
      platform: 'win32',
      warn: () => {},
      runCommand: async (command, argv) => {
        if (argv.some((value) => value.endsWith('synthesize.py'))) {
          await fsp.writeFile(outputArg(argv), 'wav');
        } else if (command === 'python') {
          await fsp.writeFile(argv[2], 'partial-srt');
          throw new Error('transcriber failed at C:\\private');
        } else {
          await fsp.writeFile(argv[argv.indexOf('--write-media') + 1], 'mp3');
          await fsp.writeFile(argv[argv.indexOf('--write-subtitles') + 1], 'srt');
        }
      },
    });
    assert.equal(result.provenance.fallbackReason, 'local-transcription-failed');
    assert.equal(result.provenance.actualProvider, 'edge-tts');
    assert.equal(fs.existsSync(`${stem}.wav`), false);
  }

  {
    let edgeCalled = false;
    await assert.rejects(
      runLocalCloneProvider({
        narration: { mode: 'local-clone', style },
        scriptPath,
        stem: path.join(temp, 'no-fallback', 'narration'),
        root,
        cloneRoot,
        platform: 'win32',
        runCommand: async (command, argv) => {
          if (command === 'edge-tts') edgeCalled = true;
          if (argv.some((value) => value.endsWith('synthesize.py'))) throw new Error('local failed');
        },
      }),
      /local failed/,
    );
    assert.equal(edgeCalled, false);
  }

  console.log('local-clone provider unit tests passed');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
