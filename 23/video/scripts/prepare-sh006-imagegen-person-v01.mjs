import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const candidateRoot = path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-person-imagegen-v01');
const sourceV01 = path.join(candidateRoot, 'assets', 'sh006-prosecutor-role-imagegen-v01.png');
const sourceV02 = path.join(candidateRoot, 'assets', 'sh006-prosecutor-role-imagegen-v02.png');
const derivedRoot = path.join(candidateRoot, 'derived');
const output = path.join(derivedRoot, 'sh006-prosecutor-role-imagegen-clean-v01.png');
const prompt = 'fictional generic Korean male legal professional, dark suit, burgundy tie, navy folder, transparent, no real person/official likeness';
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

await mkdir(derivedRoot, {recursive: true});
const {data: rgb, info: rgbInfo} = await sharp(sourceV01).removeAlpha().raw().toBuffer({resolveWithObject: true});
const {data: alpha, info: alphaInfo} = await sharp(sourceV01).extractChannel('alpha').threshold(192).raw().toBuffer({resolveWithObject: true});
if (rgbInfo.width !== alphaInfo.width || rgbInfo.height !== alphaInfo.height || rgbInfo.channels !== 3 || alphaInfo.channels !== 1) throw new Error('unexpected RGB/alpha source dimensions');
const rgba = Buffer.alloc(rgbInfo.width * rgbInfo.height * 4);
for (let pixel = 0; pixel < rgbInfo.width * rgbInfo.height; pixel += 1) {
  rgba[pixel * 4] = rgb[pixel * 3]; rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1]; rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2]; rgba[pixel * 4 + 3] = alpha[pixel];
}
await sharp(rgba, {raw: {width: rgbInfo.width, height: rgbInfo.height, channels: 4}}).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
const metadata = await sharp(output).metadata();
const raw = await sharp(output).ensureAlpha().raw().toBuffer();
let opaque = 0; let transparent = 0; let partial = 0;
for (let index = 3; index < raw.length; index += 4) { if (raw[index] === 255) opaque += 1; else if (raw[index] === 0) transparent += 1; else partial += 1; }
const manifest = {
  schema_version: 1,
  candidate_id: 'SH006-person-imagegen-v01',
  status: 'pending-user-asset-review',
  policy: {asset_class: 'person', origin: 'imagegen-person', identity_scope: 'fictional-generic', ai_disclosure: true},
  prompt: {text: prompt, final_prompt: `${prompt}; built-in image_gen, generated 2026-08-30.`, provider: 'built-in image_gen', generated_at: '2026-08-30', negative_constraints: ['no real person likeness', 'no official likeness', 'transparent background']},
  candidates: {
    v01: {path: rel(sourceV01), sha256: await sha256(sourceV01), decision: 'source-for-deterministic-alpha-cleanup', note: 'RGBA source with translucent halo; alpha thresholded at 192'},
    v02: {path: rel(sourceV02), sha256: await sha256(sourceV02), decision: 'rejected', note: 'Opaque baked checkerboard; never used'},
  },
  derived: {path: rel(output), sha256: await sha256(output), dimensions: {width: metadata.width, height: metadata.height}, alpha_stats: {opaque_pixels: opaque, transparent_pixels: transparent, partial_pixels: partial}, operation: 'remove-alpha -> alpha threshold >=192 -> join alpha; canvas retained for deterministic placement', decision: 'clean candidate pending human review'},
  production_authority: false,
  rights_approved: false,
};
await writeFile(path.join(candidateRoot, 'prompt.md'), `# SH006 imagegen person prompt\n\n${prompt}; built-in image_gen, generated 2026-08-30.\n\n- Scope: fictional generic role only; not a named or identifiable person.\n`, 'utf8');
await writeFile(path.join(candidateRoot, 'person-asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
