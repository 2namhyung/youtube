import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {measureProbeSample,probeFramesRequired} from '../video/scripts/motion-reverse-suite-measurements.mjs';
import {suiteSpecs} from '../video/scripts/motion-reverse-suite-config.mjs';
import {validateSuite} from '../video/scripts/validate-motion-reverse-engineering-suite-v01.mjs';

const ROOT=process.cwd(),SOURCE=path.join(ROOT,'video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json');
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const shaFile=async(file)=>sha(await readFile(file));
const rel=(file)=>path.relative(ROOT,file).replaceAll('\\','/');
let scratch,fakeVideo,fakeRaws;

function ffmpeg(args){const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{cwd:ROOT,windowsHide:true,stdio:'ignore'});if(result.status!==0)throw new Error(`ffmpeg failed ${result.status}`);}
async function rawImage(file){return sharp(file).removeAlpha().raw().toBuffer();}

before(async()=>{
  scratch=await mkdtemp(path.join(ROOT,'video/qa/reference-study/motion-reverse-suite-test-'));
  fakeVideo=path.join(scratch,'hash-rebound-static-probe.mp4');
  ffmpeg(['-f','lavfi','-i','color=c=black:s=1920x1080:r=30:d=10','-frames:v','300','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',fakeVideo]);
  const frames=[...new Set(Object.values(probeFramesRequired).flat())].sort((a,b)=>a-b),dir=path.join(scratch,'raw');await mkdir(dir,{recursive:true});
  const pattern=path.join(dir,'frame-%06d.png'),select=frames.map(frame=>`eq(n\\,${frame})`).join('+');ffmpeg(['-i',fakeVideo,'-vf',`select='${select}'`,'-vsync','0','-start_number','0',pattern]);
  fakeRaws=new Map();for(let i=0;i<frames.length;i++)fakeRaws.set(frames[i],await rawImage(path.join(dir,`frame-${String(i).padStart(6,'0')}.png`)));
});
after(async()=>{if(scratch)await rm(scratch,{recursive:true,force:true});});

async function writeManifest(manifest,name){const dir=path.join(scratch,name);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);return dir;}
function recalcBundle(manifest){manifest.artifact_count=manifest.artifacts.length;manifest.artifact_bundle_sha256=sha(Buffer.from(manifest.artifacts.map(a=>`${a.kind}|${a.path}|${a.sha256}`).sort().join('\n')));}
async function measuredRaws(video,sampleNumber,name){const frames=[...new Set([...probeFramesRequired[sampleNumber],suiteSpecs.find(s=>s.number===sampleNumber).actionEnd,240,299])].sort((a,b)=>a-b),dir=path.join(scratch,`${name}-raw`);await mkdir(dir,{recursive:true});const pattern=path.join(dir,'frame-%06d.png'),select=frames.map(frame=>`eq(n\\,${frame})`).join('+');ffmpeg(['-i',video,'-vf',`select='${select}'`,'-vsync','0','-start_number','0',pattern]);const raws=new Map();for(let i=0;i<frames.length;i++)raws.set(frames[i],await rawImage(path.join(dir,`frame-${String(i).padStart(6,'0')}.png`)));return raws;}
async function reboundProbe(sampleNumber,video,name){const manifest=JSON.parse(await readFile(SOURCE,'utf8')),sample=manifest.new_samples.find(row=>row.sample_number===sampleNumber),measurement=measureProbeSample(sampleNumber,await measuredRaws(video,sampleNumber,name)),measurementFile=path.join(scratch,`${name}-measurement.json`);await writeFile(measurementFile,`${JSON.stringify(measurement,null,2)}\n`);const oldPaths=new Set([sample.probe.path,sample.probe_measurements.path]);manifest.artifacts=manifest.artifacts.filter(item=>!oldPaths.has(item.path));const videoInfo=await stat(video),measurementInfo=await stat(measurementFile),fakeProbe={kind:'remotion-probe',path:rel(video),sha256:await shaFile(video),bytes:videoInfo.size},fakeMeasurement={kind:'probe-render-measurements',path:rel(measurementFile),sha256:await shaFile(measurementFile),bytes:measurementInfo.size};manifest.artifacts.push(fakeProbe,fakeMeasurement);sample.probe={...sample.probe,...fakeProbe};sample.probe_measurements=fakeMeasurement;recalcBundle(manifest);return writeManifest(manifest,name);}
async function alteredProbe(sampleNumber,name,filter){const manifest=JSON.parse(await readFile(SOURCE,'utf8')),sample=manifest.new_samples.find(row=>row.sample_number===sampleNumber),video=path.join(scratch,`${name}.mp4`);ffmpeg(['-i',path.join(ROOT,sample.probe.path),'-vf',filter,'-frames:v','300','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',video]);return {video,dir:await reboundProbe(sampleNumber,video,name)};}
async function coverTile(file,width,height,label){const img=await sharp(file).resize(width,height,{fit:'cover'}).png().toBuffer(),svg=Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="17" fill="#000" fill-opacity=".76"/><text x="4" y="12" font-family="Arial" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);return sharp(img).composite([{input:svg,left:0,top:0}]).png().toBuffer();}

test('baseline aggregate is structurally fail-closed',async()=>{const result=await validateSuite({verifySource:false,verifyMedia:false});assert.equal(result.samples,8);assert.equal(result.inherited,2);});

test('rejects changing the inherited 02/03 pilot binding',async()=>{const manifest=JSON.parse(await readFile(SOURCE,'utf8'));manifest.inherited_pilot.manifest_sha256='0'.repeat(64);const dir=await writeManifest(manifest,'bad-inherited');await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:false}),/inherited 02\/03 pilot binding mismatch/);});

for(const spec of suiteSpecs){
  test(`sample ${String(spec.number).padStart(2,'0')} rejects a hash-rebound rendered substitute`,async()=>{
    const manifest=JSON.parse(await readFile(SOURCE,'utf8')),sample=manifest.new_samples.find(row=>row.sample_number===spec.number);
    const measurement=measureProbeSample(spec.number,fakeRaws),measurementFile=path.join(scratch,`fake-measurement-${spec.number}.json`);await writeFile(measurementFile,`${JSON.stringify(measurement,null,2)}\n`);
    const videoInfo=await stat(fakeVideo),measurementInfo=await stat(measurementFile),oldPaths=new Set([sample.probe.path,sample.probe_measurements.path]);manifest.artifacts=manifest.artifacts.filter(item=>!oldPaths.has(item.path));
    const fakeProbe={kind:'remotion-probe',path:rel(fakeVideo),sha256:await shaFile(fakeVideo),bytes:videoInfo.size};const fakeMeasurement={kind:'probe-render-measurements',path:rel(measurementFile),sha256:await shaFile(measurementFile),bytes:measurementInfo.size};manifest.artifacts.push(fakeProbe,fakeMeasurement);
    sample.probe={...sample.probe,...fakeProbe};sample.probe_measurements=fakeMeasurement;recalcBundle(manifest);const dir=await writeManifest(manifest,`fake-${spec.number}`);
    await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[spec.number]}),new RegExp(`sample-${String(spec.number).padStart(2,'0')}:`));
  });
}

test('sample 04 rejects hash-rebound persistent opening overlays over the continuous map',async()=>{const {dir}=await alteredProbe(4,'sample04-all-in-one',"drawbox=x=720:y=560:w=300:h=130:color=0x7651b5:t=fill:enable='gte(n,76)',drawbox=x=780:y=260:w=250:h=470:color=0x2b9b68:t=fill:enable='gte(n,76)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[4]}),/sample-04: opening person\/US marker must fade by source F205/);});

test('sample 04 rejects opening person and US marker delayed through probe F49',async()=>{const {dir}=await alteredProbe(4,'sample04-delayed-opening-overlay',"drawbox=x=500:y=250:w=250:h=470:color=0x2b9b68:t=fill:enable='between(n,18,49)',drawbox=x=480:y=610:w=300:h=130:color=0x7651b5:t=fill:enable='between(n,18,49)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[4]}),/sample-04: opening person\/US marker must fade by source F205/);});

test('sample 04 rejects a hash-rebound hard reset at the measured continuous-pan boundary',async()=>{const {dir}=await alteredProbe(4,'sample04-false-hard-reset',"drawbox=x=0:y=0:w=iw:h=ih:color=0x102d50:t=fill:enable='eq(n,50)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[4]}),/sample-04: continuous map landmark registration disappeared|hard reset\/global replacement/);});

test('sample 04 rejects a global replacement masquerading as the F394 local flash',async()=>{const {dir}=await alteredProbe(4,'sample04-global-flash',"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,188)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[4]}),/sample-04: continuous map landmark registration disappeared|F394 flash became a global/);});

test('sample 06 rejects hash-rebound chrome left behind after exhaustive parent exit',async()=>{const {dir}=await alteredProbe(6,'sample06-lingering-chrome',"drawbox=x=34:y=26:w=520:h=40:color=yellow:t=fill:enable='eq(n,15)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[6]}),/sample-06: visible background\/chrome\/label residue/);});

test('sample 09 rejects hash-rebound post-cut montage after mapped F155 endpoint',async()=>{const {dir}=await alteredProbe(9,'sample09-postcut-montage',"drawbox=x=0:y=0:w=iw:h=ih:color=0x244a76:t=fill:enable='gte(n,96)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[9]}),/sample-09: phone wrapper must remain fixed|sample-09: endpoint support\/hold includes post-cut montage|motion during declared stable hold/);});

test('sample 09 rejects a coarse single-state phone surface even after hashes and measurements are rebound',async()=>{const {dir}=await alteredProbe(9,'sample09-coarse-surface',"drawbox=x=930:y=140:w=440:h=740:color=0xdbe5e0:t=fill:enable='lte(n,95)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[9]}),/sample-09: continuous source-bound value\/percentage\/chart progression/);});

test('sample 09 rejects support icons delayed beyond source F90/probe F30',async()=>{const {dir}=await alteredProbe(9,'sample09-delayed-icons',"drawbox=x=1450:y=120:w=340:h=590:color=0xcfd6da:t=fill:enable='lte(n,59)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[9]}),/sample-09: both support icons must be visible by source F90/);});

test('sample 10 rejects hash-rebound end value visible at the first-value frame',async()=>{const {dir}=await alteredProbe(10,'sample10-early-end-value',"drawbox=x=1500:y=700:w=240:h=40:color=0xc13b8a:t=fill:enable='between(n,123,198)'");await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[10]}),/sample-10: phone must show first value only/);});

test('rejects a hash-rebound cover-cropped contact even with honest dimensions',async()=>{const manifest=JSON.parse(await readFile(SOURCE,'utf8')),sample=manifest.new_samples.find(row=>row.sample_number===1),layers=[];for(let i=0;i<sample.contact_inputs.length;i++){const row=sample.contact_inputs[i];layers.push({input:await coverTile(path.join(ROOT,row.source_path),120,101,`REF F${row.source_frame}`),left:i*120,top:0},{input:await coverTile(path.join(ROOT,row.probe_path),120,102,`PROBE F${row.probe_frame}`),left:i*120,top:101});}const bad=path.join(scratch,'cover-cropped-contact.png');await sharp({create:{width:360,height:203,channels:3,background:'#111'}}).composite(layers).png().toFile(bad);const old=sample.mobile_contact.path;manifest.artifacts=manifest.artifacts.filter(item=>item.path!==old);const info=await stat(bad),replacement={kind:'reference-vs-probe-contact-360x203',path:rel(bad),sha256:await shaFile(bad),bytes:info.size,width:360,height:203};manifest.artifacts.push(replacement);sample.mobile_contact=replacement;recalcBundle(manifest);const dir=await writeManifest(manifest,'bad-cover-contact');await assert.rejects(()=>validateSuite({packageRoot:dir,verifySource:false,verifyMedia:true,sampleNumbers:[1]}),/contact pixels are cropped/);});
