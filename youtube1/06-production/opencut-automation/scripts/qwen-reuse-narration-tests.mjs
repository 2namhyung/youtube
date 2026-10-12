import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const projectPath = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1', 'project.json');
const projectBase = path.dirname(projectPath);
const projectSourceText = await fsp.readFile(projectPath, 'utf8');
const project = JSON.parse(projectSourceText);
const source = JSON.parse(await fsp.readFile(path.resolve(projectBase, project.scriptSource), 'utf8'));
assert.equal(source.status, 'final');
assert.ok(source.finalizedAt);
const scriptText = source.draft.replace(/\r\n/g, '\n').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const scriptSha256 = sha256(scriptText);
const narrationConfigSha256 = sha256(JSON.stringify({ scriptSha256, narration: project.narration }));
const handoffDir = path.join(root, 'out', '.private', 'jeju-school-intrusion-short-v1', 'msa88n03-34276-4w0ivx.handoff');
const handoffPath = path.join(handoffDir, 'handoff.json');
const handoff = JSON.parse(await fsp.readFile(handoffPath, 'utf8'));

assert.equal(handoff.sourceIntegrity?.scriptSha256, scriptSha256);
assert.equal(handoff.sourceIntegrity?.narrationConfigSha256, narrationConfigSha256);
assert.equal(handoff.narrationProvider?.actualProvider, 'qwen3-tts');
assert.equal(handoff.narrationProvider?.fallbackUsed, false);
assert.equal(handoff.narrationProvider?.speechAcceptance?.accepted, true);
assert.equal(handoff.narrationProvider?.speechAcceptance?.final?.accepted, true);
assert.equal(fs.existsSync(path.join(handoffDir, 'narration-retimed.m4a')), true);
assert.ok(Array.isArray(handoff.cues) && handoff.cues.length > 0);
const normalizeText = (value) => String(value || '').replace(/\s+/g, '').trim();
assert.equal(normalizeText(handoff.cues.map((cue) => cue.text).join('')), normalizeText(scriptText));

console.log(`Qwen reusable narration handoff passed (${handoff.cues.length} cues, final acceptance verified)`);
