import fs from 'node:fs';
import path from 'node:path';
import { applyAuthoritativeRevision } from './authoritative-script-revision-lib.mjs';

const root = path.resolve(import.meta.dirname, '..');
const slugIndex = process.argv.indexOf('--slug');
const slug = slugIndex >= 0 ? process.argv[slugIndex + 1] : null;
if (!slug || !/^[a-z0-9][a-z0-9-]{5,80}$/u.test(slug)) throw new Error('Usage: node scripts/revise-authoritative-script.mjs --slug <newsroom-slug>');
const config = JSON.parse(fs.readFileSync(path.join(root, 'production', 'newsroom', 'script-revisions.json'), 'utf8'));
const revisions = config.revisions.filter((item) => item.newsroomSlug === slug);
if (revisions.length !== 1) throw new Error(`Expected exactly one configured revision for ${slug}.`);
const revision = revisions[0];
const bindings = JSON.parse(fs.readFileSync(path.join(root, 'production', 'newsroom', 'script-bindings.json'), 'utf8')).bindings;
const binding = bindings.find((item) => item.newsroomSlug === slug);
if (!binding || binding.productionProjectId !== revision.productionProjectId) throw new Error('Revision does not match the configured production binding.');
const authorityPath = path.resolve(root, binding.authoritativeScript);
const relative = path.relative(root, authorityPath);
if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Authoritative revision path escapes the automation workspace.');
const script = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const revised = applyAuthoritativeRevision(script, revision);
const target = `${JSON.stringify(revised, null, 2)}\n`;
const existing = fs.readFileSync(authorityPath, 'utf8');
if (existing !== target) {
  const temporary = `${authorityPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, target, 'utf8');
    fs.renameSync(temporary, authorityPath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}
console.log(JSON.stringify({ status: existing === target ? 'current' : 'revised', slug, projectId: revision.productionProjectId, revision: revised.revision }, null, 2));
