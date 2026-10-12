import {access, readFile} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'video', 'public', 'assets', 'shared', 'effects', 'catalog.json');
const failures = [];
const kinds = new Set(['visual-overlay', 'transition-matte', 'visual-vfx', 'texture', 'sfx']);
const statuses = new Set(['candidate', 'catalogued', 'downloaded', 'approved', 'rejected']);
const blends = new Set(['normal', 'screen', 'lighten', 'multiply', 'overlay', null]);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.schema_version !== 2) failures.push('schema_version must be 2');
if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.verified_at ?? '')) failures.push('verified_at must be YYYY-MM-DD');
if (!Array.isArray(catalog.effects) || catalog.effects.length === 0) failures.push('effects must contain at least one item');

const ids = new Set();
for (const [index, effect] of (catalog.effects ?? []).entries()) {
  const label = `effects[${index}]`;
  if (typeof effect.effect_id !== 'string' || !/^[a-z0-9][a-z0-9-]+$/.test(effect.effect_id)) failures.push(`${label}: invalid effect_id`);
  if (ids.has(effect.effect_id)) failures.push(`${label}: duplicate effect_id ${effect.effect_id}`);
  ids.add(effect.effect_id);
  if (typeof effect.title !== 'string' || !effect.title.trim()) failures.push(`${label}: title is required`);
  if (!kinds.has(effect.kind)) failures.push(`${label}: invalid kind`);
  if (typeof effect.category !== 'string' || !effect.category.trim()) failures.push(`${label}: category is required`);
  if (typeof effect.provider !== 'string' || !effect.provider.trim()) failures.push(`${label}: provider is required`);
  if (!httpsUrl(effect.item_url)) failures.push(`${label}: item_url must be an HTTPS item page`);
  if (!httpsUrl(effect.license?.url)) failures.push(`${label}: license.url must be HTTPS`);
  if (typeof effect.license?.name !== 'string' || !effect.license.name.trim()) failures.push(`${label}: license.name is required`);
  if (typeof effect.license?.commercial_use !== 'boolean') failures.push(`${label}: license.commercial_use must be boolean`);
  if (typeof effect.license?.attribution_required !== 'boolean') failures.push(`${label}: license.attribution_required must be boolean`);
  if (!statuses.has(effect.acquisition?.status)) failures.push(`${label}: invalid acquisition.status`);
  if (typeof effect.acquisition?.account_required !== 'boolean') failures.push(`${label}: acquisition.account_required must be boolean`);
  if (typeof effect.acquisition?.api_key_required !== 'boolean') failures.push(`${label}: acquisition.api_key_required must be boolean`);
  if (!blends.has(effect.remotion?.blend_mode ?? null)) failures.push(`${label}: invalid remotion.blend_mode`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effect.verified_at ?? '')) failures.push(`${label}: verified_at must be YYYY-MM-DD`);
  if (!['low', 'medium', 'high'].includes(effect.editorial_risk)) failures.push(`${label}: invalid editorial_risk`);

  if (['downloaded', 'approved'].includes(effect.acquisition?.status)) {
    if (typeof effect.local_file !== 'string' || !effect.local_file.startsWith('files/')) {
      failures.push(`${label}: downloaded items require local_file inside files/`);
    } else {
      try { await access(path.join(path.dirname(catalogPath), effect.local_file)); } catch { failures.push(`${label}: local_file does not exist`); }
    }
    if (typeof effect.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(effect.sha256)) failures.push(`${label}: downloaded items require SHA-256`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const counts = Object.fromEntries([...statuses].map((status) => [status, catalog.effects.filter((effect) => effect.acquisition.status === status).length]));
console.log(`Validated ${catalog.effects.length} effect catalog items: ${JSON.stringify(counts)}`);
