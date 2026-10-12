import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const study = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(study, '..', '..', 'out', 'studies', 'civilian-jacket-front-v1');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = path.join(study, 'skin-manifest.json');
const trace = path.join(out, 'runtime-trace.json');
const report = {schema: 'private-civilian-jacket-front-runtime-report-v1', status: 'private-review-only', productionAuthority: false, uploadAllowed: false, manifest: fs.existsSync(manifest) ? {path: path.relative(study, manifest).replaceAll(path.sep, '/'), sha256: hash(manifest), slots: 16, attachments: 25} : null, runtimeTrace: fs.existsSync(trace) ? {path: path.relative(out, trace).replaceAll(path.sep, '/'), sha256: hash(trace), fps: 24, durationSeconds: 3, frameCount: JSON.parse(fs.readFileSync(trace, 'utf8')).samples.length} : null, visualQa: {status: 'pending-human-review', seams: 'not-admitted', contactSheet: 'not-admitted', reason: 'headless dummy movie backend is not visual evidence'}};
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
