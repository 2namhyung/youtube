import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const authority=path.join(root,'out/studies/motion-tool-learning-v4-authority-b');
const out=path.join(root,'out/studies/motion-tool-learning-v4-dotlottie-pilot-d');
const ffmpeg='C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const ffprobe='C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const verifier=JSON.parse(readFileSync(path.join(out,'verifier.json'),'utf8'));
if(!verifier.verified)throw new Error('pilot not verified');
const authorityManifest=JSON.parse(readFileSync(path.join(authority,'creator.manifest.json'),'utf8'));
const dot=authorityManifest.tools.find(item=>item.toolId==='dotlottie-web-v1');
const left=path.join(authority,...dot.officialVisualReference.localFile.split('/'));
const right=path.join(out,'learned-neutral-output.mkv');
const target=path.join(out,'official-vs-learned.mp4');
const font='C\\\\:/Windows/Fonts/arial.ttf';
const graph=[
  'color=c=0x030712:s=1280x720:r=50:d=3.6[bg]',
  '[0:v]scale=520:520:flags=lanczos[left]',
  '[1:v]scale=520:520:flags=lanczos[right]',
  '[bg][left]overlay=80:110[tmp]',
  '[tmp][right]overlay=680:110[tmp2]',
  `[tmp2]drawtext=fontfile=${font}:text='LEFT  OFFICIAL REFERENCE  commit 605e8c7':fontcolor=0x93c5fd:fontsize=24:x=80:y=42,drawtext=fontfile=${font}:text='RIGHT  LEARNED NEUTRAL GEOMETRY':fontcolor=0x86efac:fontsize=24:x=680:y=42,drawtext=fontfile=${font}:text='SCORE ${verifier.score.weightedPercent}  geometry ${verifier.score.geometryPoints}/45  motion ${verifier.score.motionPoints}/55':fontcolor=white:fontsize=23:x=(w-text_w)/2:y=670[out]`,
].join(';');
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-i',left,'-i',right,'-filter_complex',graph,'-map','[out]','-frames:v','180','-r','50','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',target]);
const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames','-of','json',target],{encoding:'utf8'})).streams[0];
const manifest={schema:'motion-tool-learning-v4-comparison-pilot-d',truthBoundary:{left:'actual locally preserved official pre-rendered demo.gif',right:'neutral learned dotLottie output created from numeric geometry/motion measurements only'},reference:{sha256:sha(left),commit:dot.sourceCommit,rawUrl:dot.officialVisualReference.rawUrl},learned:{sha256:sha(right)},score:verifier.score,artifact:{file:'official-vs-learned.mp4',sha256:sha(target),bytes:statSync(target).size,probe},promotionEligible:false};
writeFileSync(path.join(out,'comparison.json'),`${JSON.stringify(manifest,null,2)}\n`,{flag:'wx'});
process.stdout.write(`${JSON.stringify(manifest.artifact,null,2)}\n`);
