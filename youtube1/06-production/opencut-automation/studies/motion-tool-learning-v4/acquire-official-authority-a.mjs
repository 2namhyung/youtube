import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const automationRoot=path.resolve(here,'../..');
const outputRoot=path.join(automationRoot,'out/studies/motion-tool-learning-v4-authority-b');
const originalsRoot=path.join(outputRoot,'originals');
const sha256Bytes=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha256=file=>sha256Bytes(readFileSync(file));
const posix=value=>value.replaceAll('\\','/');

const sources=[
  {toolId:'gsap-html-v1',owner:'greensock',repo:'gsap-skills',commit:'a80d23f971128766629c3baed3c7564a8c4edf5e',licensePath:'LICENSE',files:['LICENSE','examples/vanilla/index.html','examples/vanilla/main.js'],visualReference:null},
  {toolId:'motion-canvas-v1',owner:'motion-canvas',repo:'examples',commit:'5f4c6c93cfd747169729d7c5f4719b13d8010f3c',licensePath:'LICENSE',files:['LICENSE','examples/smooth-parallax/package.json','examples/smooth-parallax/src/scenes/parallax.tsx','examples/smooth-parallax/src/components/Parallax.tsx','examples/smooth-parallax/src/styles.ts','examples/smooth-parallax/src/images/layers/a-foreground.png','examples/smooth-parallax/src/images/layers/b-central.png','examples/smooth-parallax/src/images/layers/b-light.png','examples/smooth-parallax/src/images/layers/c-background.png','examples/smooth-parallax/src/images/layers/d-background.png','examples/smooth-parallax/src/images/layers/d-light.png'],visualReference:null},
  {toolId:'canvas-d3-v1',owner:'d3',repo:'d3-transition',commit:'c4c94c421e2ef9e9ffc253fab33ccf99f1434901',licensePath:'LICENSE',files:['LICENSE','README.md','src/transition/schedule.js','src/transition/duration.js','src/transition/ease.js','test/transition/duration-test.js','test/transition/ease-test.js'],visualReference:null},
  {toolId:'lottie-web-v1',owner:'airbnb',repo:'lottie-web',commit:'507be7fa7fbf748962dd7b1b190d99cc9cf6079b',licensePath:'LICENSE.md',files:['LICENSE.md','demo/bodymovin/index.html','demo/bodymovin/data.json','build/player/lottie.js'],visualReference:null},
  {toolId:'dotlottie-web-v1',owner:'LottieFiles',repo:'dotlottie-web',commit:'605e8c7b7cc620c030d239c815bc83f16265ba96',licensePath:'LICENSE',files:['LICENSE','examples/web-node/README.md','examples/web-node/demo.gif','examples/web-node/index.ts','examples/web-node/package.json','examples/web-node/tsconfig.json'],visualReference:'examples/web-node/demo.gif'},
  {toolId:'ffmpeg-layer-keyframes-v1',owner:'FFmpeg',repo:'FFmpeg',commit:'ca821e458aabe2fa211d9e94eac38cd69fe2ea09',licensePath:'LICENSE.md',files:['LICENSE.md','COPYING.GPLv2','COPYING.GPLv3','COPYING.LGPLv2.1','COPYING.LGPLv3','doc/examples/README','doc/examples/Makefile','doc/examples/encode_video.c'],visualReference:null},
];

try{statSync(outputRoot);throw new Error(`append-only target already exists: ${outputRoot}`);}catch(error){if(error.code!=='ENOENT')throw error;}
mkdirSync(originalsRoot,{recursive:true});
const acquired=[];
for(const source of sources){
  if(!/^[0-9a-f]{40}$/.test(source.commit))throw new Error(`non-exact commit ${source.toolId}`);
  const records=[];
  for(const sourcePath of source.files){
    const rawUrl=`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.commit}/${sourcePath}`;
    const response=await fetch(rawUrl,{redirect:'error',headers:{'User-Agent':'Codex-motion-v4-authority'}});
    if(!response.ok||response.url!==rawUrl)throw new Error(`raw fetch failed or redirected ${response.status} ${rawUrl}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length)throw new Error(`empty official source ${rawUrl}`);
    const target=path.join(originalsRoot,source.toolId,...sourcePath.split('/'));
    mkdirSync(path.dirname(target),{recursive:true});
    writeFileSync(target,bytes,{flag:'wx'});
    chmodSync(target,0o444);
    if(process.platform==='win32')execFileSync('attrib',['+R',target]);
    records.push({sourcePath,localFile:posix(path.relative(outputRoot,target)),rawUrl,commitUrl:`https://github.com/${source.owner}/${source.repo}/commit/${source.commit}`,sha256:sha256Bytes(bytes),bytes:bytes.length,contentType:response.headers.get('content-type'),readOnly:true});
  }
  const license=records.find(record=>record.sourcePath===source.licensePath);
  if(!license)throw new Error(`license not acquired ${source.toolId}`);
  const visual=source.visualReference?records.find(record=>record.sourcePath===source.visualReference):null;
  acquired.push({
    toolId:source.toolId,
    officialRepository:`https://github.com/${source.owner}/${source.repo}`,
    sourceCommit:source.commit,
    sourceCommitUrl:`https://github.com/${source.owner}/${source.repo}/commit/${source.commit}`,
    files:records,
    license:{sourcePath:license.sourcePath,localFile:license.localFile,rawUrl:license.rawUrl,sha256:license.sha256,bytes:license.bytes,reviewStatus:'pending-human-license-review'},
    officialVisualReference:visual?{kind:'official-pre-rendered-motion-media',sourcePath:visual.sourcePath,localFile:visual.localFile,rawUrl:visual.rawUrl,sha256:visual.sha256,bytes:visual.bytes,sourceCodeExecuted:false,status:'candidate'}:null,
    sourceExecution:{allowed:false,reason:'Canonical contract keeps downloaded examples, fixtures, templates and animation data source-only.'},
    visualAdmission:visual?'candidate-needs-independent-media-and-license-verification':'blocked-no-official-pre-rendered-visual',
  });
}

const manifest={
  schema:'motion-tool-learning-v4-official-source-authority-b',
  createdAt:new Date().toISOString(),
  scope:'official commit-pinned GitHub source preservation; no example source execution',
  acquisitionNetwork:{allowed:true,hosts:['raw.githubusercontent.com'],redirectsAllowed:false},
  originalsRoot:'originals',
  physicalNonSymlink:!lstatSync(originalsRoot).isSymbolicLink(),
  containedRealpath:realpathSync(originalsRoot).startsWith(`${realpathSync(outputRoot)}${path.sep}`),
  tools:acquired,
  implementation:{creator:{file:'studies/motion-tool-learning-v4/acquire-official-authority-a.mjs',sha256:sha256(fileURLToPath(import.meta.url))}},
  summary:{tools:acquired.length,toolsWithOfficialPreRenderedVisual:acquired.filter(item=>item.officialVisualReference).length,toolsBlockedWithoutVisual:acquired.filter(item=>!item.officialVisualReference).length,trainingReady:false,promotionEligible:false},
};
writeFileSync(path.join(outputRoot,'creator.manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,{flag:'wx'});
process.stdout.write(`${JSON.stringify(manifest.summary,null,2)}\n`);
