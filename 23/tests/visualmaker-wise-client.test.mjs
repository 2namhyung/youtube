import test from 'node:test';
import assert from 'node:assert/strict';
import {currentWiseRequest,validWiseImport,validWiseSearch} from '../src/components/studio/wise-source-client.ts';

const hash='a'.repeat(64),scope={projectId:'project',revision:4,requirementId:'requirement',scriptSha256:hash};
const candidate={sourceId:'source',wiseMediaId:'source.mp4',sha256:hash,metadataSha256:'b'.repeat(64),kind:'video',
  title:'Local source',creator:'Creator',sourceUrl:'https://example.test/original',license:'CC BY',licenseUrl:'',
  rightsEvidence:'Library note',rightsConfirmed:true,durationSeconds:10,
  rawSpan:{startSeconds:2,endSeconds:4},selectedSpan:{startSeconds:2,endSeconds:4},selectionToken:'c'.repeat(48)};
const search={schemaVersion:'visualmaker-wise-bridge-v1',scope,query:'local source',status:'available',
  candidates:[candidate],counts:{hits:1,verified:1,unresolved:0},productionAuthority:false};

test('WISE client accepts only the exact current scope, query and matching modality',()=>{
  assert.equal(validWiseSearch(search,scope,'local source','video'),true);
  assert.equal(validWiseSearch(search,{...scope,revision:5},'local source','video'),false);
  assert.equal(validWiseSearch(search,scope,'different query','video'),false);
  assert.equal(validWiseSearch(search,scope,'local source','image'),false);
  assert.equal(currentWiseRequest(scope,scope,2,2,false),true);
  assert.equal(currentWiseRequest(scope,{...scope,revision:5},2,2,false),false);
  assert.equal(currentWiseRequest(scope,scope,2,3,false),false);
  assert.equal(currentWiseRequest(scope,scope,2,2,true),false);
});

test('WISE browser response rejects malformed counts, spans, token and unsafe links',()=>{
  const changed=(field,value)=>({...search,candidates:[{...candidate,[field]:value}]});
  assert.equal(validWiseSearch({...search,counts:{hits:1,verified:2,unresolved:0}},scope,search.query,'video'),false);
  assert.equal(validWiseSearch(changed('selectedSpan',{startSeconds:2,endSeconds:12}),scope,search.query,'video'),false);
  assert.equal(validWiseSearch(changed('selectionToken',''),scope,search.query,'video'),false);
  assert.equal(validWiseSearch(changed('sourceUrl','file:///tmp/source.mp4'),scope,search.query,'video'),false);
  assert.equal(validWiseSearch(changed('licenseUrl','javascript:alert(1)'),scope,search.query,'video'),false);
  assert.equal(validWiseSearch(changed('sha256','not-a-hash'),scope,search.query,'video'),false);
  assert.equal(validWiseSearch({...search,productionAuthority:true},scope,search.query,'video'),false);
});

test('WISE import response cannot install a changed revision, hash or missing plan',()=>{
  const response={schemaVersion:'visualmaker-wise-bridge-v1',scope:{...scope,revision:5},assetId:'asset',
    inputSha256:hash,metadataSha256:candidate.metadataSha256,productionAuthority:false,plan:{},sourceReviewStates:[]};
  assert.equal(validWiseImport(response,scope,candidate),false);
  assert.equal(validWiseImport({...response,scope:{...scope,revision:6}},scope,candidate),false);
  assert.equal(validWiseImport({...response,inputSha256:'d'.repeat(64)},scope,candidate),false);
});
