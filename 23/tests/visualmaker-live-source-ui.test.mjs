import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {currentLiveRequest,liveAcquireBody,liveProviderSupports,validLiveAcquire,validLiveSearch} from '../src/components/studio/live-source-client.ts';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject} from '../visualmaker/core/store.ts';
import {acquireLiveSource,searchLiveSources} from '../visualmaker/core/live-source.ts';

const hash='a'.repeat(64),inputHash='b'.repeat(64),selectionHash='c'.repeat(64);
const scope={projectId:'plan_01',revision:4,requirementId:'req_01',scriptSha256:hash};
const query={provider:'wikimedia',mediaType:'image',query:'  public building  ',page:1};
const candidate={providerId:'123',itemUrl:'https://commons.wikimedia.org/wiki/File%3ABuilding.jpg',title:'Building',creator:'Photographer',
  publisher:'Wikimedia Commons',license:'CC BY',rightsStatus:'check attribution',mediaType:'image',width:300,height:200,
  variant:{kind:'original',label:'Commons imageinfo.url 원본'},metadataSha256:hash};
const listing={schemaVersion:'visualmaker-live-source-v1',scope,provider:query.provider,mediaType:query.mediaType,query:query.query.trim(),
  page:1,candidates:[candidate],productionAuthority:false};
const asset={id:'asset_01',sha256:inputHash,status:'pending-review',mediaType:'image'};
const sourceReviews=['source','rights','semantic'].map(dimension=>({id:`review_${dimension}`,requirementId:scope.requirementId,
  assetId:asset.id,assetSha256:inputHash,contextSha256:selectionHash,dimension,decision:'pending',rationale:'자료 연결 뒤 검토 대기',
  recordedAt:'2026-10-14T00:00:00.000Z',recordedBy:'local-session',productionAuthority:false}));
const plan={id:scope.projectId,revision:scope.revision+1,script:{rawSha256:scope.scriptSha256},productionAuthority:false,
  requirements:[{id:scope.requirementId,assetId:asset.id}],assets:[asset],sourceReviews};
const review={requirementId:scope.requirementId,assetId:asset.id,contextSha256:selectionHash,productionAuthority:false,
  current:Object.fromEntries(sourceReviews.map(row=>[row.dimension,row])),history:sourceReviews};
const acquired={schemaVersion:'visualmaker-live-source-v1',scope:{...scope,revision:scope.revision+1},assetId:asset.id,inputSha256:inputHash,
  metadataSha256:candidate.metadataSha256,selectionSha256:selectionHash,variant:candidate.variant,productionAuthority:false,
  plan,sourceReviewStates:[review]};

test('search cards require exact scope, provider, type, bounded metadata and false authority',()=>{
  assert.equal(validLiveSearch(listing,scope,query),true);
  assert.equal(validLiveSearch({...listing,scope:{...scope,revision:5}},scope,query),false);
  assert.equal(validLiveSearch({...listing,scope:{...scope,scriptSha256:inputHash}},scope,query),false);
  assert.equal(validLiveSearch({...listing,productionAuthority:true},scope,query),false);
  assert.equal(validLiveSearch({...listing,provider:'nasa'},scope,query),false);
  assert.equal(validLiveSearch({...listing,candidates:[{...candidate,downloadUrl:'https://upload.wikimedia.org/file.jpg'}]},scope,query),false);
  assert.equal(validLiveSearch({...listing,candidates:[{...candidate,itemUrl:'https://attacker.example/file'}]},scope,query),false);
  assert.equal(validLiveSearch({...listing,candidates:[{...candidate,variant:{kind:'original',label:'x',productionAuthority:true}}]},scope,query),false);
  assert.equal(validLiveSearch({...listing,candidates:Array(13).fill(candidate)},scope,query),false);
  assert.equal(validLiveSearch({...listing,candidates:[candidate,candidate]},scope,query),false);
});

test('unsupported provider and type combinations remain explicit',()=>{
  assert.equal(liveProviderSupports('wikimedia','video'),true);
  assert.equal(liveProviderSupports('nasa','video'),false);
  assert.equal(liveProviderSupports('loc','video'),false);
  assert.equal(validLiveSearch({...listing,provider:'nasa',candidates:[candidate]},scope,{...query,provider:'nasa'}),false);
});

test('only selected identity and fingerprint enter the acquisition body',()=>{
  const body=liveAcquireBody(scope,query,candidate,'  shows the building entrance  ',false);
  assert.deepEqual(Object.keys(body).sort(),['projectId','baseRevision','requirementId','provider','query','page','mediaType',
    'providerId','metadataSha256','semanticNote','evidenceOnly'].sort());
  assert.equal(body.providerId,candidate.providerId);
  assert.equal(body.metadataSha256,candidate.metadataSha256);
  assert.equal(body.semanticNote,'shows the building entrance');
  assert.equal(JSON.stringify(body).includes(candidate.itemUrl),false);
  assert.equal(JSON.stringify(body).includes('downloadUrl'),false);
});

test('candidate selection control exposes title and unique provider ID to accessibility tree',()=>{
  const source=readFileSync(new URL('../src/components/studio/live-source.tsx',import.meta.url),'utf8');
  assert.match(source,/aria-label=\{`자료 요구 \$\{scope\.requirementId\} · 제공처에서 자료 찾기`\}/);
  assert.match(source,/aria-label=\{`자료 요구 \$\{scope\.requirementId\} · \$\{item\.title\|\|'제목 없음'\} · \$\{item\.providerId\} 후보 선택`\}/);
});

test('acquisition response must bind pending bytes and retain no source review approvals',()=>{
  assert.equal(validLiveAcquire(acquired,scope,candidate),true);
  assert.equal(validLiveAcquire({...acquired,metadataSha256:inputHash},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,productionAuthority:true},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,scope:{...scope,revision:4}},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,plan:{...plan,productionAuthority:true}},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,plan:{...plan,assets:[{...asset,sha256:hash}]}},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,sourceReviewStates:[{...review,current:{...review.current,rights:{decision:'acceptable'}}}]},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,sourceReviewStates:[{...review,productionAuthority:true}]},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,sourceReviewStates:[{...review,current:{...review.current,source:{...review.current.source,assetId:'another'}}}]},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,sourceReviewStates:[{...review,current:{...review.current,semantic:{...review.current.semantic,assetSha256:hash}}}]},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,sourceReviewStates:[{...review,contextSha256:hash}]},scope,candidate),false);
  assert.equal(validLiveAcquire({...acquired,plan:{...plan,sourceReviews:sourceReviews.map(row=>row.dimension==='rights'?{...row,decision:'acceptable'}:row)}},scope,candidate),false);
});

test('aborted, superseded or changed project scope cannot commit an async response',()=>{
  assert.equal(currentLiveRequest(scope,scope,7,7,false),true);
  assert.equal(currentLiveRequest(scope,scope,7,8,false),false);
  assert.equal(currentLiveRequest(scope,scope,7,7,true),false);
  assert.equal(currentLiveRequest(scope,{...scope,requirementId:'req_02'},7,7,false),false);
  assert.equal(currentLiveRequest(scope,{...scope,revision:5},7,7,false),false);
});

test('actual isolated core search and selected acquisition return UI-valid pending reviews',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-live-ui-'));
  const created=insertProject(importEpisode()),requirement=created.requirements.find(item=>item.mediaType==='image'&&
    ['external','official'].includes(item.acquisition)&&item.assetId===null);
  assert.ok(requirement);
  const actualScope={projectId:created.id,revision:created.revision,requirementId:requirement.id,scriptSha256:created.script.rawSha256};
  const actualQuery={provider:'nasa',mediaType:'image',query:'Mars rover',page:1};
  const input={projectId:created.id,baseRevision:created.revision,requirementId:requirement.id,...actualQuery};
  const image=await sharp({create:{width:16,height:16,channels:3,background:'#274263'}}).png().toBuffer();
  const fetcher=async url=>{const target=String(url);let body,mime='application/json';
    if(target.startsWith('https://images-api.nasa.gov/search'))body={collection:{items:[{data:[{nasa_id:'PIA12235',media_type:'image',title:'Mars Rover',creator:'NASA/JPL'}]}]}};
    else if(target==='https://images-api.nasa.gov/asset/PIA12235')body={collection:{items:[{href:'http://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png'}]}};
    else if(target==='https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png'){body=image;mime='image/png';}
    else throw new Error('unexpected provider fixture address');
    const response=new Response(Buffer.isBuffer(body)?body:JSON.stringify(body),{headers:{'content-type':mime}});
    Object.defineProperty(response,'url',{value:target});return response;};
  const search=await searchLiveSources(input,{fetcher});
  assert.equal(validLiveSearch(search,actualScope,actualQuery),true);
  const selected=search.candidates[0];assert.ok(selected);
  const result=await acquireLiveSource({...input,providerId:selected.providerId,metadataSha256:selected.metadataSha256,
    semanticNote:'탐사선 외관 확인',evidenceOnly:false},{fetcher});
  assert.equal(validLiveAcquire(result,actualScope,selected),true);
  const current=result.sourceReviewStates.find(item=>item.requirementId===requirement.id).current;
  assert.deepEqual(Object.values(current).map(row=>row.decision),['pending','pending','pending']);
  assert.equal(validLiveAcquire({...result,sourceReviewStates:result.sourceReviewStates.map(item=>item.requirementId===requirement.id?
    {...item,current:{...item.current,source:{...item.current.source,decision:'acceptable'}}}:item)},actualScope,selected),false);
});
