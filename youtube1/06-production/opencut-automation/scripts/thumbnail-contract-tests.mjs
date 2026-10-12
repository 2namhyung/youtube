import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateProject, validateThumbnailContract } from './production-lib.mjs';

const root = path.resolve('.');
const projectDir = path.join(root, 'production', 'projects', 'coffee-pesticide-hospital-short-v1');
const manifestPath = path.join(projectDir, 'thumbnail-reference-v3-v1.manifest.json');
const projectPath = path.join(projectDir, 'project-editorial-cartoon.json');
const contractPath = path.join(projectDir, 'pipeline-contract-editorial-cartoon.json');
const configPath = path.join(projectDir, 'thumbnail.config.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

assert.doesNotThrow(() => validateThumbnailContract(manifest, projectDir, { title: project.title, thumbnail: project.thumbnail, aiDisclosureText: project.scenes[0].label }));
assert.doesNotThrow(() => validateProject(project, projectDir));
assert.equal(project.thumbnail.sha256, manifest.output.sha256);
assert.deepEqual(project.title, { line1: '동료의 커피에', line2: '살충제를 넣었다' });
assert.equal(manifest.spokenCaptions, false);
assert.equal(manifest.aiDisclosure.text, '사건 내용 기반 AI 재구성');
assert.notEqual(manifest.output.sha256, 'a4e0fef092e536da20d74623ca278b59a9ffc067c6df976a3bc48949a1779f02', 'plain full-bleed scene must not remain the production thumbnail');

const mutatedHeadline = structuredClone(manifest);
mutatedHeadline.headline.line2 = '다른 제목';
assert.throws(() => validateThumbnailContract(mutatedHeadline, projectDir, { title: project.title, thumbnail: project.thumbnail, aiDisclosureText: project.scenes[0].label }), /headline must equal project.title|locked renderer config/);
const spokenCaptionLeak = structuredClone(manifest);
spokenCaptionLeak.spokenCaptions = true;
assert.throws(() => validateThumbnailContract(spokenCaptionLeak, projectDir), /omit spoken captions/);
const plainOverride = structuredClone(manifest);
const oldPath = path.join(projectDir, 'assets', 'images', 'thumbnail-caption-free.png');
const oldBytes = fs.readFileSync(oldPath);
plainOverride.output = { ...plainOverride.output, image: 'assets/images/thumbnail-caption-free.png', sha256: crypto.createHash('sha256').update(oldBytes).digest('hex'), bytes: oldBytes.length };
assert.throws(() => validateThumbnailContract(plainOverride, projectDir), /locked renderer config/);

const verify = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-editorial-thumbnail.mjs'), '--config', configPath, '--verify'], { cwd: root, encoding: 'utf8' }));
assert.equal(verify.status, 'verified');
execFileSync(process.execPath, [path.join(root, 'scripts', 'verify-editorial-cartoon-project.mjs'), projectPath, contractPath], { cwd: root, stdio: 'pipe' });
console.log('thumbnail contract tests passed (semantic policy, hashes, deterministic reproduction, plain-frame rejection)');
