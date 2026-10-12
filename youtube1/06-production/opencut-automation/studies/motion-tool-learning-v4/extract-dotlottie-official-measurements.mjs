import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const automationRoot=path.resolve(here,'../..');
const authorityRoot=path.join(automationRoot,'out/studies/motion-tool-learning-v4-authority-b');
const outputRoot=path.join(automationRoot,'out/studies/motion-tool-learning-v4-dotlottie-pilot-d');
const ffmpeg='C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const sha256=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
try{statSync(outputRoot);throw new Error(`append-only target exists ${outputRoot}`);}catch(error){if(error.code!=='ENOENT')throw error;}
mkdirSync(outputRoot,{recursive:true});
const authority=JSON.parse(readFileSync(path.join(authorityRoot,'creator.manifest.json'),'utf8'));
const verified=JSON.parse(readFileSync(path.join(authorityRoot,'verifier.json'),'utf8'));
if(!verified.verified)throw new Error('authority-b not verified');
const tool=authority.tools.find(item=>item.toolId==='dotlottie-web-v1');
const reference=tool?.officialVisualReference;
if(!reference)throw new Error('no official pre-rendered dotLottie reference');
const gif=path.join(authorityRoot,...reference.localFile.split('/'));
if(sha256(gif)!==reference.sha256)throw new Error('official GIF drift');
const raw=execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-i',gif,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:200*200*3*200});
const width=200,height=200,frameBytes=width*height*3,frames=[];
if(raw.length%frameBytes)throw new Error('decoded raw byte mismatch');
for(let offset=0;offset<raw.length;offset+=frameBytes){
  let minX=width,minY=height,maxX=-1,maxY=-1,count=0,sumX=0,sumY=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=offset+(y*width+x)*3; const r=raw[i],g=raw[i+1],b=raw[i+2];
    if(Math.max(r,g,b)>28 && Math.max(r,g,b)-Math.min(r,g,b)>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;sumX+=x;sumY+=y;}
  }
  frames.push(count?{visible:true,bbox:{x:minX/width,y:minY/height,w:(maxX-minX+1)/width,h:(maxY-minY+1)/height},centroid:{x:sumX/count/width,y:sumY/count/height},occupancy:count/(width*height)}:{visible:false,bbox:null,centroid:null,occupancy:0});
}
const visibleIndices=frames.map((frame,index)=>frame.visible?index:null).filter(index=>index!==null);
const centers=frames.map(frame=>frame.centroid).filter(Boolean);
const velocities=centers.slice(1).map((center,index)=>Math.hypot(center.x-centers[index].x,center.y-centers[index].y));
const measurement={
  schema:'layout-motion-reference-measurement-v1',
  referenceId:'dotlottie-web-node-demo-gif-605e8c7-v1',toolId:'dotlottie-web-v1',
  authorityManifestSha256:sha256(path.join(authorityRoot,'creator.manifest.json')),
  referenceArtifact:{sha256:reference.sha256,bytes:reference.bytes,sourceCommit:tool.sourceCommit,rawUrl:reference.rawUrl},
  decoder:{executable:ffmpeg,sha256:sha256(ffmpeg),pixelFormat:'rgb24',segmentation:'non-dark chromatic pixels: max(channel)>28 and chroma range>8'},
  canvas:{width,height},fps:50,frameCount:frames.length,
  trackedElements:['primary-non-dark-chromatic-silhouette'],
  normalizedBboxesByFrame:frames.map(frame=>frame.bbox),centroidsByFrame:frames.map(frame=>frame.centroid),visibilityByFrame:frames.map(frame=>frame.visible),occupancyByFrame:frames.map(frame=>frame.occupancy),
  pathSamples:frames.map((frame,index)=>frame.centroid?{t:index/(frames.length-1),...frame.centroid}:null),
  phaseMarkers:{firstVisible:visibleIndices[0]/(frames.length-1),lastVisible:visibleIndices.at(-1)/(frames.length-1),maximumArea:frames.findIndex(frame=>frame.occupancy===Math.max(...frames.map(item=>item.occupancy)))/(frames.length-1)},
  velocityProfile:velocities,easingClassification:'measured-discrete-profile-no-agent-label',
  extractionBoundary:'This record contains numeric measurements only and no decoded pixels, branding, artwork, text, source code, or palette.',
};
const serialized=`${JSON.stringify(measurement,null,2)}\n`;
measurement.recordSha256=createHash('sha256').update(serialized).digest('hex');
writeFileSync(path.join(outputRoot,'official-measurements.json'),`${JSON.stringify(measurement,null,2)}\n`,{flag:'wx'});
process.stdout.write(`${JSON.stringify({frames:frames.length,visibleFrames:visibleIndices.length,measurementSha256:sha256(path.join(outputRoot,'official-measurements.json'))},null,2)}\n`);
