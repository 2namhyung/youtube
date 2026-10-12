import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256, verifyResearchOfficialRender} from './research-official-render-gate.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-v4-research-gate-'));
try {
  fs.mkdirSync(path.join(root, 'study'), {recursive: true});
  for (const f of ['LICENSE', 'source.js', 'dependency.js', 'creator.mjs', 'verifier.mjs', 'render.mp4']) fs.writeFileSync(path.join(root, 'study', f), f);
  const file = name => { const b = fs.readFileSync(path.join(root, 'study', name)); return {file:`study/${name}`, sha256:sha256(b), bytes:b.length, physicalNonSymlink:true, containedRealpath:true}; };
  const h = 'a'.repeat(64), commit = 'b'.repeat(40);
  const base = {
    schema:'motion-tool-learning-v4-research-official-render-v1', scope:'research-only',
    origin:{repository:'https://github.com/owner/repo', commit, commitUrl:`https://github.com/owner/repo/commit/${commit}`},
    license:{...file('LICENSE'), reviewStatus:'approved-for-isolated-research-render'},
    sourceFiles:[file('source.js')], dependencyClosure:[{...file('dependency.js'), name:'dep', version:'1.0.0', license:'MIT'}],
    urlAudit:{scannedFiles:2, executionRemoteUrls:[], allowlistedReplacements:[]},
    isolation:{root:'out/studies/motion-tool-learning-v4-research-test', network:'blocked', loopbackOnly:false, physicalNonSymlink:true, containedRealpath:true, forbiddenCapabilities:['secrets','raw-authority','provider','upload','publication','production-authority'], environmentNames:['PATH']},
    implementations:{creatorFile:'study/creator.mjs',creatorSha256:h,verifierFile:'study/verifier.mjs',verifierSha256:h},
    result:{status:'verified-research-render',promotionEligible:false,productionEligible:false,artifact:file('render.mp4')}
  };
  assert.equal(verifyResearchOfficialRender(base,{workspaceRoot:root}).ok,true);
  const rejects = [
    x => x.origin.commit='abc', x => x.origin.commitUrl='https://github.com/owner/repo/commit/main',
    x => x.license.reviewStatus='pending', x => x.urlAudit.executionRemoteUrls=['https://cdn.example/x.js'],
    x => x.dependencyClosure=[], x => x.isolation.network='enabled', x => x.isolation.environmentNames=['API_TOKEN'],
    x => x.result.productionEligible=true, x => x.result.promotionEligible=true, x => x.sourceFiles[0].file='../api.txt',
    x => x.sourceFiles[0].sha256='0'.repeat(64)
  ];
  for (const mutate of rejects) { const v=structuredClone(base); mutate(v); assert.equal(verifyResearchOfficialRender(v,{workspaceRoot:root}).ok,false); }
  console.log(`research official render gate: ${1 + rejects.length} cases passed`);
} finally { fs.rmSync(root,{recursive:true,force:true}); }
