import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentDiagnosticResponse} from '../src/components/studio/diagnostic-client.ts';

test('authenticated blob response is scoped to exact project/job/attempt and MP4',()=>{
  const scope={projectId:'plan-a',jobId:'job-a',attempt:2};
  const response=(projectId,jobId,attempt,type='video/mp4',status=200)=>new Response('movie',{status,headers:{'content-type':type,'x-visualmaker-project-id':projectId,'x-visualmaker-job-id':jobId,'x-visualmaker-attempt':String(attempt)}});
  assert.equal(isCurrentDiagnosticResponse(response('plan-a','job-a',2),scope),true);
  assert.equal(isCurrentDiagnosticResponse(response('plan-b','job-a',2),scope),false);
  assert.equal(isCurrentDiagnosticResponse(response('plan-a','job-b',2),scope),false);
  assert.equal(isCurrentDiagnosticResponse(response('plan-a','job-a',1),scope),false);
  assert.equal(isCurrentDiagnosticResponse(response('plan-a','job-a',2,'application/json'),scope),false);
  assert.equal(isCurrentDiagnosticResponse(response('plan-a','job-a',2,'video/mp4',409),scope),false);
});
