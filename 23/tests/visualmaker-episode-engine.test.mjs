import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,statSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderEpisodeEngine} from '../visualmaker/renderer/episode-runner.ts';
import {streamedFileFingerprint} from '../visualmaker/core/episode-provisional.ts';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('real Remotion engine renders and decodes a short isolated provisional composition', {timeout:240_000}, async()=>{
  const cache=path.join(projectRoot,'node_modules','.cache');mkdirSync(cache,{recursive:true});
  const work=realpathSync(mkdtempSync(path.join(cache,'vm-episode-engine-'))),publicDir=path.join(work,'public');mkdirSync(publicDir);
  const entry=path.join(work,'synthetic-entry.tsx');
  writeFileSync(entry,`import React from 'react';
import {AbsoluteFill,Composition,interpolate,registerRoot,useCurrentFrame} from 'remotion';
const ShortEpisode=()=>{const frame=useCurrentFrame();const x=interpolate(frame,[0,11],[20,400]);return <AbsoluteFill style={{backgroundColor:frame<6?'#163a6b':'#74213a'}}><div style={{position:'absolute',left:x,top:100,width:90,height:90,backgroundColor:'#fff'}} /></AbsoluteFill>;};
const Root=()=> <Composition id="EP001-Episode-Provisional" component={ShortEpisode} durationInFrames={12} fps={12} width={640} height={360}/>;
registerRoot(Root);
`,{flag:'wx'});
  const stages=[];const composition={id:'EP001-Episode-Provisional',width:640,height:360,fps:12,durationFrames:12};
  const result=await renderEpisodeEngine({entry,publicDir,rootDir:projectRoot,work,composition,signal:new AbortController().signal,onStage:stage=>stages.push(stage)});
  assert.deepEqual(stages,['bundle','open','select','render','probe','decode','publish']);
  assert.equal(result.output.name,'provisional-episode.mp4');assert.equal(result.output.bytes,statSync(path.join(work,result.output.name)).size);
  assert.deepEqual(streamedFileFingerprint(path.join(work,result.output.name)),{sha256:result.output.sha256,bytes:result.output.bytes});
  assert.deepEqual([result.measured.width,result.measured.height,result.measured.fps,result.measured.frames,result.measured.codec,result.measured.audioStreams],[640,360,12,12,'h264',0]);
  assert.equal(result.measured.frameSha256.length,3);assert.notEqual(result.measured.frameSha256[0],result.measured.frameSha256[2]);
});
