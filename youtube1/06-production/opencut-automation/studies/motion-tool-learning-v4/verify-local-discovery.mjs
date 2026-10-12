import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const automationRoot=path.resolve(here,'../..');
const outputRoot=path.join(automationRoot,'out/studies/motion-tool-learning-v4-local-discovery-a');
const manifestPath=path.join(outputRoot,'local-discovery.manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const sha256=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
check(manifest.schema==='motion-tool-learning-v4-local-discovery-v1','wrong schema');
check(manifest.noNetwork===true && manifest.providersInvoked.length===0,'network/provider boundary failed');
check(manifest.tools.length===6,'six tools required');
check(manifest.summary.readyTools===0 && manifest.summary.blockedTools===6 && manifest.summary.v4TrainingReady===false,'local-only discovery must currently fail closed');
check(sha256(path.join(automationRoot,manifest.packageLock.file))===manifest.packageLock.sha256,'package-lock drift');
for(const design of manifest.designFiles) check(sha256(path.join(automationRoot,design.file))===design.sha256,`design drift ${design.file}`);
if(manifest.existingSourceOnlyCatalog) check(sha256(path.join(automationRoot,manifest.existingSourceOnlyCatalog.file))===manifest.existingSourceOnlyCatalog.sha256,'source-only catalog drift');
for(const tool of manifest.tools){
  check(tool.discoveryStatus==='blocked',`${tool.toolId} incorrectly admitted`);
  check(tool.blockers.length>0,`${tool.toolId} missing blockers`);
  if(tool.package){
    const packageJson=path.join(automationRoot,tool.package.packageJson.file);
    check(sha256(packageJson)===tool.package.packageJson.sha256,`${tool.toolId} package drift`);
    check(tool.package.physicalNonSymlink===true && tool.package.containedRealpath===true,`${tool.toolId} package containment failed`);
    check(['passed','failed'].includes(tool.package.runtimeProbe.status) && tool.package.runtimeProbe.networkAllowed===false,`${tool.toolId} runtime probe evidence invalid`);
    if(tool.license.file) check(sha256(path.join(automationRoot,tool.license.file))===tool.license.sha256,`${tool.toolId} license drift`);
    const packageRoot=path.dirname(packageJson);
    for(const candidate of tool.distributedCandidates){
      const file=path.join(packageRoot,...candidate.file.split('/'));
      check(!lstatSync(file).isSymbolicLink(),`${tool.toolId} candidate symlink ${candidate.file}`);
      check(realpathSync(file).startsWith(`${realpathSync(packageRoot)}${path.sep}`),`${tool.toolId} candidate escapes root ${candidate.file}`);
      check(sha256(file)===candidate.sha256 && statSync(file).size===candidate.bytes,`${tool.toolId} candidate drift ${candidate.file}`);
    }
    const hasCommit=typeof tool.package.gitHead==='string' && /^[0-9a-f]{40}$/.test(tool.package.gitHead);
    const hasMedia=tool.distributedCandidates.some(candidate=>candidate.kind==='pre-rendered-motion-media');
    check(!(hasCommit && hasMedia && tool.license.file) || tool.discoveryStatus!=='blocked',`${tool.toolId} may need admission review rather than unconditional block`);
  }
}
const report={schema:'motion-tool-learning-v4-local-discovery-verifier-v1',verifiedAt:new Date().toISOString(),manifestSha256:sha256(manifestPath),verifierImplementationSha256:sha256(fileURLToPath(import.meta.url)),failures,verified:failures.length===0,v4TrainingReady:false};
writeFileSync(path.join(outputRoot,'verifier.json'),`${JSON.stringify(report,null,2)}\n`);
if(failures.length){process.stderr.write(`${JSON.stringify(report,null,2)}\n`);process.exitCode=1;}else process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
