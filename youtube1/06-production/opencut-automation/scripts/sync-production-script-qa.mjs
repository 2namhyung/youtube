#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUniqueScriptBindings, evaluateScriptQa, sha256 } from './script-sync-qa-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const requestedSlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
const configPath = path.join(root, 'production', 'newsroom', 'script-bindings.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const configuredBindings = assertUniqueScriptBindings(config.bindings);
const entries = requestedSlug ? configuredBindings.filter((item) => item.newsroomSlug === requestedSlug) : configuredBindings;
if (!entries.length) throw new Error(`No production script binding configured for ${requestedSlug ?? 'request'}.`);

const relative = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const readJsonText = async (file) => { const text = await fs.readFile(file, 'utf8'); return { text, value: JSON.parse(text) }; };
const hashFile = async (file) => sha256(await fs.readFile(file));
async function writeAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function findAlternativeAuthorities(slug, selectedPath) {
  const projectsRoot = path.join(root, 'production', 'projects');
  const alternatives = [];
  for (const entry of await fs.readdir(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(projectsRoot, entry.name, 'script.final.json');
    if (!fsSync.existsSync(candidate) || path.resolve(candidate) === path.resolve(selectedPath)) continue;
    try {
      const value = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (value.slug === slug) alternatives.push({ projectId: entry.name, path: relative(candidate), status: value.status ?? null, finalizedAt: value.finalizedAt ?? null, draftSha256: typeof value.draft === 'string' ? sha256(value.draft.replace(/\r\n/g, '\n').trim()) : null });
    } catch { /* Invalid alternatives are not authorities. */ }
  }
  return alternatives;
}

async function latestPrivateHandoff(projectId) {
  const directory = path.join(root, 'out', '.private', projectId);
  const candidates = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.handoff')) continue;
    const file = path.join(directory, entry.name, 'handoff.json');
    if (!fsSync.existsSync(file)) continue;
    const stat = await fs.stat(file);
    candidates.push({ file, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file));
  if (!candidates.length) throw new Error(`No private handoff found for ${projectId}.`);
  return candidates[0].file;
}

for (const entry of entries) {
  const authorityPath = path.resolve(root, entry.authoritativeScript);
  const projectPath = path.resolve(root, entry.projectAuthority);
  const [{ text: authorityText, value: authority }, { text: projectText, value: project }] = await Promise.all([readJsonText(authorityPath), readJsonText(projectPath)]);
  if (authority.slug !== entry.newsroomSlug || authority.status !== 'final' || typeof authority.finalizedAt !== 'string' || typeof authority.draft !== 'string') throw new Error(`Configured authority is not a finalized script for ${entry.newsroomSlug}.`);
  if (path.basename(path.dirname(projectPath)) !== entry.productionProjectId) throw new Error('productionProjectId does not match projectAuthority directory.');
  const draft = authority.draft.replace(/\r\n/g, '\n').trim();
  const draftSha256 = sha256(draft);
  const restorationStatus = authority.revision?.schemaVersion === 'authoritative-script-revision-v1' && authority.revision?.draftSha256 === draftSha256
    ? 'editorial-revised'
    : authority.restoration?.exactCharacterRestoration === true && authority.restoration?.restoredDraftSha256 === draftSha256 ? 'restored-exact' : authority.restoration ? 'invalid-restoration' : 'not-restored';
  const workflowPath = path.join(root, 'production', 'newsroom', 'projects', `${entry.newsroomSlug}.workflow.json`);
  const workflowText = fsSync.existsSync(workflowPath) ? await fs.readFile(workflowPath, 'utf8') : null;
  const workflow = workflowText ? JSON.parse(workflowText) : null;
  const workflowDraft = workflow?.draft?.sections ? ['hook', 'incident', 'timeline', 'frustrating', 'solution', 'legal', 'confirmation'].map((key) => String(workflow.draft.sections[key] ?? '').trim()).filter(Boolean).join('\n\n') : '';
  const alternatives = await findAlternativeAuthorities(entry.newsroomSlug, authorityPath);
  const bindingBase = {
    schemaVersion: 'production-script-binding-v1',
    newsroomSlug: entry.newsroomSlug,
    productionProjectId: entry.productionProjectId,
    precedence: 'explicit-binding-wins; workflow and alternative authorities are never overwritten',
    authority: { path: relative(authorityPath), status: authority.status, finalizedAt: authority.finalizedAt, generatedAt: authority.generatedAt ?? null, selectedDraftId: authority.selectedDraftId ?? null, draft, draftSha256, fileSha256: sha256(authorityText), restorationStatus, restoration: authority.restoration ?? null, revision: authority.revision ?? null },
    projectAuthority: relative(projectPath),
    workflow: { path: relative(workflowPath), exists: Boolean(workflowText), draftFinalized: workflow?.draftFinalized === true, updatedAt: workflow?.updatedAt ?? null, draftSha256: workflowDraft ? sha256(workflowDraft) : null, matchesAuthority: workflowDraft ? sha256(workflowDraft) === draftSha256 : null },
    conflicts: alternatives,
    handoffSelection: entry.handoffSelection,
    creator: 'scripts/sync-production-script-qa.mjs',
    verifier: 'scripts/script-sync-qa-lib.mjs',
  };
  const binding = { ...bindingBase, bindingSha256: sha256(JSON.stringify(bindingBase)) };
  const handoffPath = await latestPrivateHandoff(entry.productionProjectId);
  const { text: handoffText, value: handoff } = await readJsonText(handoffPath);
  let bgmSourceSha256 = null;
  if (typeof handoff?.bgm?.sourcePath === 'string' && fsSync.existsSync(handoff.bgm.sourcePath)) bgmSourceSha256 = await hashFile(handoff.bgm.sourcePath);
  let profileManifestSha256 = null;
  const profileId = handoff?.narrationProvider?.promptBankProvenance?.profileId;
  if (typeof profileId === 'string') {
    const manifest = path.resolve(root, '..', '..', '03-script-voice', 'voice-clone', 'profiles', profileId, 'prompt-bank', 'manifest.json');
    if (fsSync.existsSync(manifest)) profileManifestSha256 = await hashFile(manifest);
  }
  const qaBase = evaluateScriptQa({ binding, handoff, handoffPath: relative(handoffPath), handoffSha256: sha256(handoffText), project, projectText, projectDirectory: path.dirname(projectPath), alternativeAuthorities: alternatives, bgmSourceSha256, profileManifestSha256 });
  const generatedAt = new Date(Math.max((await fs.stat(authorityPath)).mtimeMs, (await fs.stat(handoffPath)).mtimeMs)).toISOString();
  const qaWithTime = { ...qaBase, generatedAt };
  const qa = { ...qaWithTime, qaSha256: sha256(JSON.stringify(qaWithTime)) };
  const outputRoot = path.join(root, 'production', 'newsroom', 'projects');
  await Promise.all([
    writeAtomic(path.join(outputRoot, `${entry.newsroomSlug}.script-binding.json`), binding),
    writeAtomic(path.join(outputRoot, `${entry.newsroomSlug}.script-qa.json`), qa),
  ]);
  console.log(JSON.stringify({ slug: entry.newsroomSlug, projectId: entry.productionProjectId, draftSha256, versionId: handoff.versionId, status: qa.summary.status, failures: qa.summary.failures, warnings: qa.summary.warnings }));
}
