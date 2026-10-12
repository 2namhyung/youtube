import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (v) => v.slice(1)));
const out = path.join(ROOT, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v29-common-masters-production-v4', 'assets', 'scene-001', 'preview-gsap-v1');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifestPath = path.join(out, 'cut-001-gsap-preview-v1.json'); const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); const clone = structuredClone(manifest); const claimed = clone.artifactSha256; delete clone.artifactSha256;
if (claimed !== sha(Buffer.from(JSON.stringify(clone), 'utf8'))) throw new Error('GSAP preview artifact hash drifted');
if (manifest.privateOnly !== true || manifest.providerCalls.imageGen !== false || manifest.composition.width !== 972 || manifest.composition.height !== 972 || manifest.composition.fps !== 24 || manifest.composition.frames !== 96 || manifest.composition.durationSeconds !== 4 || manifest.assets.length !== 3) throw new Error('GSAP preview contract invalid');
const htmlPath = path.join(ROOT, manifest.previewHtml.relativePath); const html = await fs.readFile(htmlPath); if (sha(html) !== manifest.previewHtml.sha256 || !html.toString().includes('gsap.timeline({paused:true')) throw new Error('GSAP preview HTML drifted or not paused timeline');
for (const beat of ['enter', 'marker-scan', 'hold', 'exit']) if (!manifest.choreography.some((item) => item.beatId === beat)) throw new Error(`missing choreography ${beat}`);
for (const asset of manifest.assets) { const bytes = await fs.readFile(path.join(ROOT, asset.relativePath)); if (sha(bytes) !== asset.admittedSha256) throw new Error(`preview asset drift ${asset.assetId}`); }
console.log(JSON.stringify({ verified: true, previewSha256: claimed, assetCount: manifest.assets.length, frames: manifest.composition.frames }));
