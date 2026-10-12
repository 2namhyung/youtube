import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const authorityRoot=path.join(root,'out/studies/motion-tool-learning-v4-authority-b');
const out=path.join(root,'out/studies/motion-tool-learning-v4-research-feasibility-a');
if(fs.existsSync(out)) throw new Error(`append-only output exists: ${out}`);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const authority=JSON.parse(fs.readFileSync(path.join(authorityRoot,'creator.manifest.json'),'utf8'));
const integrityErrors=[];
for(const tool of authority.tools) for(const f of tool.files){const p=path.join(authorityRoot,f.localFile); if(!fs.existsSync(p)||sha(p)!==f.sha256||fs.statSync(p).size!==f.bytes) integrityErrors.push(`${tool.toolId}:${f.sourcePath}`);}
if(integrityErrors.length) throw new Error(`authority drift: ${integrityErrors.join(',')}`);
let cc=null; for(const exe of ['clang','gcc','cl']) try{cc=execFileSync('where.exe',[exe],{encoding:'utf8'}).trim().split(/\r?\n/)[0];break;}catch{}
const runtimePackage=JSON.parse(fs.readFileSync(path.join(root,'production/motion-engines/nonhuman-runtime-v1/package.json'),'utf8'));
const decisions=[
 {toolId:'gsap-html-v1',status:'blocked',officialCommit:'a80d23f971128766629c3baed3c7564a8c4edf5e',reason:'Official main.js imports GSAP 3.14.2 from jsDelivr; the contained runtime is 3.15.0, so an exact same-version local dependency closure is absent. No source executed.'},
 {toolId:'motion-canvas-v1',status:'blocked',officialCommit:'5f4c6c93cfd747169729d7c5f4719b13d8010f3c',reason:'The preserved subset lacks the complete project/scenes, required @motion-canvas/2d/ui/vite-plugin and three closure, and confirmed Git LFS asset completeness. No source executed.'},
 {toolId:'canvas-d3-v1',status:'blocked',officialCommit:'c4c94c421e2ef9e9ffc253fab33ccf99f1434901',reason:'The exact official d3-transition revision preserves source/tests but no revision-bound runnable visual example. An authored harness would not be an official original. No source executed.'},
 {toolId:'lottie-web-v1',status:'blocked',officialCommit:'507be7fa7fbf748962dd7b1b190d99cc9cf6079b',reason:'Exact demo/player/data bytes are preserved, but approved-for-isolated-research-render license review and a hash-complete browser execution dependency closure are not sealed. No source executed.'},
 {toolId:'ffmpeg-layer-keyframes-v1',status:'blocked',officialCommit:'ca821e458aabe2fa211d9e94eac38cd69fe2ea09',reason:`Exact encode_video.c is preserved, but a commit-matched FFmpeg development header/library closure and usable C compiler are not sealed (compiler probe: ${cc||'none'}). Reimplementing its algorithm would not be the official original. No source executed.`}
];
fs.mkdirSync(out,{recursive:true});
const report={schema:'motion-tool-learning-v4-research-feasibility-a',createdAt:new Date().toISOString(),authority:{file:'../motion-tool-learning-v4-authority-b/creator.manifest.json',sha256:sha(path.join(authorityRoot,'creator.manifest.json')),verifiedFileCount:authority.tools.reduce((n,t)=>n+t.files.length,0),integrityErrors},containedRuntimeVersions:{gsap:runtimePackage.dependencies?.gsap||null,lottieWeb:runtimePackage.dependencies?.['lottie-web']||null,motionCanvasCore:runtimePackage.dependencies?.['@motion-canvas/core']||null},policy:{sourceExecuted:false,officialOriginalRendered:false,comparisonCreated:false,promotionEligible:false,productionEligible:false},decisions};
fs.writeFileSync(path.join(out,'feasibility.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'BLOCKED.md'),'# Research official-render feasibility A\n\nAll five candidates fail closed before source execution. No official-original or comparison MP4 was created.\n\n'+decisions.map(x=>`- **${x.toolId}** — ${x.reason}`).join('\n')+'\n');
for(const p of [path.join(out,'feasibility.json'),path.join(out,'BLOCKED.md')]) fs.chmodSync(p,0o444);
console.log(JSON.stringify({out,reportSha256:sha(path.join(out,'feasibility.json')),blocked:decisions.length},null,2));
