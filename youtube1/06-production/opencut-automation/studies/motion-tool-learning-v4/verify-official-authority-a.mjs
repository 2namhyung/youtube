import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const automationRoot=path.resolve(here,'../..');
const outputRoot=path.join(automationRoot,'out/studies/motion-tool-learning-v4-authority-b');
const manifestPath=path.join(outputRoot,'creator.manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const sha256Bytes=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha256=file=>sha256Bytes(readFileSync(file));
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
check(manifest.schema==='motion-tool-learning-v4-official-source-authority-b','wrong schema');
check(manifest.tools.length===6,'six tools required');
check(manifest.summary.toolsWithOfficialPreRenderedVisual===1 && manifest.summary.trainingReady===false && manifest.summary.promotionEligible===false,'authority summary must remain fail closed');
check(sha256(path.join(automationRoot,manifest.implementation.creator.file))===manifest.implementation.creator.sha256,'authority creator implementation drift');
const remoteChecks=[];
for(const tool of manifest.tools){
  check(/^[0-9a-f]{40}$/.test(tool.sourceCommit),`${tool.toolId} commit not exact`);
  check(tool.sourceCommitUrl===`${tool.officialRepository}/commit/${tool.sourceCommit}`,`${tool.toolId} commit URL mismatch`);
  check(tool.sourceExecution.allowed===false,`${tool.toolId} downloaded source execution incorrectly allowed`);
  check(tool.files.some(file=>file.localFile===tool.license.localFile && file.sha256===tool.license.sha256),`${tool.toolId} license binding missing`);
  for(const record of tool.files){
    const local=path.join(outputRoot,...record.localFile.split('/'));
    check(!lstatSync(local).isSymbolicLink(),`${tool.toolId} symlink ${record.localFile}`);
    check(realpathSync(local).startsWith(`${realpathSync(path.join(outputRoot,'originals'))}${path.sep}`),`${tool.toolId} escapes originals ${record.localFile}`);
    check(sha256(local)===record.sha256 && statSync(local).size===record.bytes,`${tool.toolId} local drift ${record.localFile}`);
    const expectedPrefix=`https://raw.githubusercontent.com/${new URL(tool.officialRepository).pathname.slice(1)}/${tool.sourceCommit}/`;
    check(record.rawUrl.startsWith(expectedPrefix),`${tool.toolId} mutable or foreign raw URL ${record.rawUrl}`);
    const response=await fetch(record.rawUrl,{redirect:'error',headers:{'User-Agent':'Codex-motion-v4-authority-verifier'}});
    const bytes=Buffer.from(await response.arrayBuffer());
    const match=response.ok&&response.url===record.rawUrl&&sha256Bytes(bytes)===record.sha256&&bytes.length===record.bytes;
    check(match,`${tool.toolId} remote exact-byte verification failed ${record.sourcePath}`);
    remoteChecks.push({toolId:tool.toolId,sourcePath:record.sourcePath,httpStatus:response.status,exactUrl:response.url===record.rawUrl,sha256Match:sha256Bytes(bytes)===record.sha256,bytesMatch:bytes.length===record.bytes});
  }
}
const dot=manifest.tools.find(tool=>tool.toolId==='dotlottie-web-v1');
if(dot?.officialVisualReference){
  const visual=path.join(outputRoot,...dot.officialVisualReference.localFile.split('/'));
  const ffprobe='C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
  const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames','-of','json',visual],{encoding:'utf8'})).streams[0];
  check(probe.codec_name==='gif'&&Number(probe.width)>0&&Number(probe.height)>0&&Number(probe.nb_read_frames)>1,'dotLottie official GIF is not valid motion media');
  dot.officialVisualReferenceProbe=probe;
}
const report={schema:'motion-tool-learning-v4-official-source-authority-verifier-b',verifiedAt:new Date().toISOString(),creatorManifestSha256:sha256(manifestPath),verifierImplementationSha256:sha256(fileURLToPath(import.meta.url)),remoteChecks,failures,verified:failures.length===0,visualReferenceReadyTools:failures.length?0:1,trainingReady:false,promotionEligible:false};
writeFileSync(path.join(outputRoot,'verifier.json'),`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});
if(failures.length){process.stderr.write(`${JSON.stringify(report,null,2)}\n`);process.exitCode=1;}else process.stdout.write(`${JSON.stringify({verified:true,visualReferenceReadyTools:1,trainingReady:false,creatorManifestSha256:report.creatorManifestSha256},null,2)}\n`);
