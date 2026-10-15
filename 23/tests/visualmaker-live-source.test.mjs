import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {dataRoot,getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {acquireLiveSource,searchLiveSources} from '../visualmaker/core/live-source.ts';
import {fixedHttpsUrl} from '../src/lib/live-source-providers.ts';
import {GET as searchGet} from '../src/app/api/studio/source-search/route.ts';
import {POST as acquirePost} from '../src/app/api/studio/source-acquire/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';

const base='http://127.0.0.1:8138',headers={'x-visualmaker-token':studioToken()};
const image=await sharp({create:{width:16,height:16,channels:3,background:'#274263'}}).png().toBuffer();
function isolated(type='image'){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-live-source-'));
  const plan=insertProject(importEpisode());const requirement=plan.requirements.find(row=>row.mediaType===type&&['external','official'].includes(row.acquisition)&&row.assetId===null);
  assert.ok(requirement);return {plan,requirement,input:{projectId:plan.id,baseRevision:plan.revision,requirementId:requirement.id,provider:'wikimedia',query:'Seoul building',page:1,mediaType:type}};
}
function reply(url,body,mime='application/json',status=200,headers={}){
  const response=new Response(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body),{status,headers:{'content-type':mime,...headers}});
  Object.defineProperty(response,'url',{value:url});return response;
}
const commons={query:{pages:[{pageid:101,title:'File:Example.png',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.png',thumburl:'https://upload.wikimedia.org/thumb/example.png',mime:'image/png',width:16,height:16,extmetadata:{Artist:{value:'Creator'},LicenseShortName:{value:'CC BY 4.0'},UsageTerms:{value:'Attribution'}}}]},{pageid:102,title:'File:Unused.png',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Unused.png',mime:'image/png',width:16,height:16}]}]}};
const nasa={collection:{items:[{data:[{nasa_id:'PIA12235',media_type:'image',title:'Planet',creator:'NASA/JPL'}],links:[{rel:'preview',href:'https://images-assets.nasa.gov/preview.jpg'}]}]}};
const nasaManifest={collection:{items:[{href:'http://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.jpg'},{href:'http://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png'}]}};
const loc={results:[{id:'http://www.loc.gov/pictures/item/123/',title:'Archive view',contributor:['Unknown artist'],rights:'Rights and Access review required',image_url:['https://tile.loc.gov/storage-services/service/pnp/example-small.jpg','https://tile.loc.gov/storage-services/service/pnp/example-large.png']}]};
function fixtureFetch(log=[]){return async(url,init)=>{const target=String(url);log.push({url:target,init});
  if(target.startsWith('https://commons.wikimedia.org/w/api.php'))return reply(target,commons);
  if(target==='https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.png')return reply(target,image,'image/png');
  if(target.startsWith('https://images-api.nasa.gov/search'))return reply(target,nasa);
  if(target==='https://images-api.nasa.gov/asset/PIA12235')return reply(target,nasaManifest);
  if(target==='https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png')return reply(target,image,'image/png');
  if(target.startsWith('https://www.loc.gov/photos/'))return reply(target,loc);
  if(target==='https://tile.loc.gov/storage-services/service/pnp/example-large.png')return reply(target,image,'image/png');
  throw new Error('unexpected fixture URL');};}

test('all three providers search metadata only and disclose truthful variants',async()=>{
  const {input}=isolated(),log=[];
  for(const provider of ['wikimedia','nasa','loc']){
    const result=await searchLiveSources({...input,provider},{fetcher:fixtureFetch(log)});
    assert.equal(result.candidates.length>=1,true);assert.equal(result.productionAuthority,false);
    assert.equal(result.scope.revision,input.baseRevision);
    assert.equal(JSON.stringify(result).includes('upload.wikimedia.org'),false);
    assert.equal(JSON.stringify(result).includes('images-assets.nasa.gov'),false);
    assert.equal(JSON.stringify(result).includes('tile.loc.gov'),false);
    assert.equal(result.candidates[0].variant.kind,provider==='wikimedia'?'original':provider==='nasa'?'published-asset':'derivative-or-unknown');
  }
  assert.equal(log.every(item=>item.url.includes('/w/api.php')||item.url.includes('/search?')||item.url.includes('/photos/?')),true);
});

test('only selected Commons original is acquired into pending review with receipt',async()=>{
  const {plan,requirement,input}=isolated(),log=[],fetcher=fixtureFetch(log);
  const search=await searchLiveSources(input,{fetcher});const chosen=search.candidates[0];
  const acquired=await acquireLiveSource({...input,providerId:chosen.providerId,metadataSha256:chosen.metadataSha256,semanticNote:'건물 외관 맥락',evidenceOnly:false},{fetcher});
  assert.equal(acquired.productionAuthority,false);assert.equal(acquired.variant.kind,'original');
  const asset=acquired.plan.assets.find(row=>row.id===acquired.assetId);assert.equal(asset.status,'pending-review');assert.equal(asset.evidenceOnly,false);
  assert.equal(asset.width,16);assert.equal(asset.height,16);assert.equal(acquired.plan.requirements.find(row=>row.id===requirement.id).assetId,asset.id);
  const receipt=JSON.parse(readFileSync(path.join(dataRoot(),'receipts',`${asset.id}.json`),'utf8'));
  assert.equal(receipt.liveSourceProvenance.selectedAssetUrl,'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.png');
  assert.equal(receipt.liveSourceProvenance.downloadSha256,asset.sha256);
  assert.equal(log.some(item=>item.url.includes('thumb/example')),false);assert.equal(log.some(item=>item.url.includes('Unused.png')),false);
  assert.equal(Object.values(acquired.sourceReviewStates.find(row=>row.requirementId===requirement.id).current).every(row=>row.decision==='pending'),true);
  await assert.rejects(acquireLiveSource({...input,baseRevision:2,providerId:chosen.providerId,metadataSha256:chosen.metadataSha256,semanticNote:'again',evidenceOnly:false},{fetcher}),error=>error.status===409);
  assert.equal(getProject(plan.id).assets.length,1);
});

test('NASA selected file comes from asset manifest; LOC remains derivative/unknown',async()=>{
  for(const provider of ['nasa','loc']){
    const {input}=isolated(),log=[],fetcher=fixtureFetch(log),request={...input,provider};
    const card=(await searchLiveSources(request,{fetcher})).candidates[0];
    const result=await acquireLiveSource({...request,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'대상 맥락',evidenceOnly:false},{fetcher});
    assert.equal(result.variant.kind,provider==='nasa'?'published-asset':'derivative-or-unknown');
    assert.equal(result.plan.assets[0].status,'pending-review');
    if(provider==='nasa'){
      assert.equal(log.some(row=>row.url.endsWith('/asset/PIA12235')),true);assert.equal(log.some(row=>row.url.includes('preview.jpg')),false);
      assert.equal(log.some(row=>row.url.includes('~orig.png')),true);assert.equal(log.every(row=>row.url.startsWith('https://')),true);
      const receipt=JSON.parse(readFileSync(path.join(dataRoot(),'receipts',`${result.assetId}.json`),'utf8'));
      assert.equal(receipt.liveSourceProvenance.providerAssetHref,'http://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png');
      assert.equal(receipt.liveSourceProvenance.selectedAssetUrl,'https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.png');
    }
  }
});

test('wrong scope, fingerprint, unsupported mode, lock and extra route fields fail before acquisition',async()=>{
  const {plan,requirement,input}=isolated(),log=[],fetcher=fixtureFetch(log);
  await assert.rejects(searchLiveSources({...input,provider:'nasa',mediaType:'video'},{fetcher}),error=>error.status===400);
  await assert.rejects(searchLiveSources({...input,provider:['wikimedia']},{fetcher}),error=>error.status===400);
  await assert.rejects(searchLiveSources({...input,mediaType:['image']},{fetcher}),error=>error.status===400);
  await assert.rejects(searchLiveSources({...input,baseRevision:99},{fetcher}),error=>error.status===409);
  assert.equal(log.length,0);
  const candidate=(await searchLiveSources(input,{fetcher})).candidates[0];
  const count=log.length;
  await assert.rejects(acquireLiveSource({...input,providerId:candidate.providerId,metadataSha256:'0'.repeat(64),semanticNote:'note',evidenceOnly:false},{fetcher}),error=>error.status===409);
  assert.equal(log.length,count+1);assert.equal(log.some(row=>row.url.includes('Example.png')),false);
  const scene=plan.scenes.find(row=>row.candidates.some(option=>option.requirementIds.includes(requirement.id)));
  const selected=updateProject(plan.id,1,{type:'select',sceneId:scene.id,candidateId:scene.candidates[0].id});updateProject(plan.id,selected.revision,{type:'lock',sceneId:scene.id,locked:true});
  const before=log.length;await assert.rejects(searchLiveSources({...input,baseRevision:3},{fetcher}),error=>error.status===423);assert.equal(log.length,before);
  const query=new URLSearchParams({...input,baseRevision:'3',page:'1',extra:'bad'});
  assert.equal((await searchGet(new Request(`${base}/api/studio/source-search?${query}`,{headers}))).status,400);
  assert.equal((await searchGet(new Request(`${base}/api/studio/source-search?${query}`))).status,403);
  assert.equal((await acquirePost(new Request(`${base}/api/studio/source-acquire`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...input,providerId:candidate.providerId,metadataSha256:candidate.metadataSha256,semanticNote:'note',evidenceOnly:false,downloadUrl:'https://evil.test/file'})}))).status,400);
});

test('fixed hosts, redirects, oversized streamed bodies and MIME mismatch fail closed',async()=>{
  assert.equal(fixedHttpsUrl('https://upload.wikimedia.org:444/a.png',['upload.wikimedia.org']),null);
  assert.equal(fixedHttpsUrl('https://user@upload.wikimedia.org/a.png',['upload.wikimedia.org']),null);
  assert.equal(fixedHttpsUrl('https://upload.wikimedia.org/%2e%2e/a.png',['upload.wikimedia.org']),null);
  assert.equal(fixedHttpsUrl('https://upload.wikimedia.org/a.png?q=NASA%2FESA',['upload.wikimedia.org']),'https://upload.wikimedia.org/a.png?q=NASA%2FESA');
  const {input}=isolated(),card=(await searchLiveSources(input,{fetcher:fixtureFetch()})).candidates[0];
  const altered=(response)=>async(url)=>String(url).startsWith('https://commons.wikimedia.org/')?reply(String(url),commons):response(String(url));
  await assert.rejects(acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:altered(url=>reply(url,'','text/plain',302,{location:'https://evil.test/a.png'}))}),error=>error.status===502);
  await assert.rejects(acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:altered(url=>reply(url,image,'text/html'))}),error=>error.status===415);
  const huge=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40_000_001));controller.close();}});
  await assert.rejects(acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:altered(url=>{const response=new Response(huge,{headers:{'content-type':'image/png'}});Object.defineProperty(response,'url',{value:url});return response;})}),error=>error.status===413);
  assert.equal(getProject(input.projectId).assets.length,0);
});

test('provider JSON is bounded before parse and body abort does not attach media',async()=>{
  const {input}=isolated();
  await assert.rejects(searchLiveSources(input,{fetcher:async(url)=>reply(String(url),' '.repeat(1_000_001))}),error=>error.status===413);
  const card=(await searchLiveSources(input,{fetcher:fixtureFetch()})).candidates[0],controller=new AbortController();
  const fetcher=async(url)=>String(url).startsWith('https://commons.wikimedia.org/')?reply(String(url),commons):(()=>{
    const response=new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{headers:{'content-type':'image/png'}});
    Object.defineProperty(response,'url',{value:String(url)});return response;
  })();
  const pending=acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher,signal:controller.signal});
  setTimeout(()=>controller.abort(),20);
  await assert.rejects(pending,error=>error.status===502);
  assert.equal(getProject(input.projectId).assets.length,0);
});

test('revision race, duplicate bytes and decoded MIME mismatch do not attach another source',async()=>{
  const {input,plan}=isolated(),card=(await searchLiveSources(input,{fetcher:fixtureFetch()})).candidates[0];
  const race=async(url)=>{
    if(String(url).startsWith('https://commons.wikimedia.org/'))return reply(String(url),commons);
    updateProject(plan.id,1,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
    return reply(String(url),image,'image/png');
  };
  await assert.rejects(acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:race}),error=>error.status===409);
  assert.equal(getProject(plan.id).assets.length,0);
  const fresh={...input,baseRevision:2};
  await assert.rejects(acquireLiveSource({...fresh,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:async(url)=>String(url).startsWith('https://commons.wikimedia.org/')?reply(String(url),commons):reply(String(url),image,'image/jpeg')}),error=>error.status===409);
  assert.equal(getProject(plan.id).assets.length,0);
  const attached=await acquireLiveSource({...fresh,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:fixtureFetch()});
  const second=attached.plan.requirements.find(row=>row.id!==input.requirementId&&row.mediaType==='image'&&['external','official'].includes(row.acquisition)&&row.assetId===null&&
    !attached.plan.scenes.some(scene=>scene.locked&&scene.candidates.some(option=>option.requirementIds.includes(row.id))));
  assert.ok(second);
  const duplicate={...fresh,baseRevision:attached.plan.revision,requirementId:second.id};
  await assert.rejects(acquireLiveSource({...duplicate,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'note',evidenceOnly:false},{fetcher:fixtureFetch()}),error=>error.status===409);
  assert.equal(getProject(plan.id).assets.length,1);
});

test('NASA thumbnail-only manifest remains a labelled thumbnail with a selection fingerprint',async()=>{
  const {input}=isolated(),request={...input,provider:'nasa'};
  const fetcher=async(url)=>{
    const target=String(url);
    if(target.includes('/search?'))return reply(target,nasa);
    if(target.endsWith('/asset/PIA12235'))return reply(target,{collection:{items:[{href:'https://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.png'}]}});
    if(target.includes('~thumb.png'))return reply(target,image,'image/png');
    throw new Error('unexpected');
  };
  const card=(await searchLiveSources(request,{fetcher})).candidates[0];
  const result=await acquireLiveSource({...request,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'맥락',evidenceOnly:false},{fetcher});
  assert.match(result.variant.label,/썸네일/);assert.doesNotMatch(result.variant.label,/원본 표시/);
  assert.match(result.selectionSha256,/^[a-f0-9]{64}$/);
});

test('NASA only upgrades exact fixed-host manifest hrefs; other HTTP assets are rejected',async()=>{
  const {input}=isolated(),request={...input,provider:'nasa'},card=(await searchLiveSources(request,{fetcher:fixtureFetch()})).candidates[0];
  for(const href of ['http://user@images-assets.nasa.gov/a~orig.png','http://images-assets.nasa.gov:444/a~orig.png','http://images-assets.nasa.gov/%2e%2e/a~orig.png','http://evil.test/a~orig.png']){
    const log=[];const fetcher=async(url)=>{const target=String(url);log.push(target);
      if(target.includes('/search?'))return reply(target,nasa);
      if(target.endsWith('/asset/PIA12235'))return reply(target,{collection:{items:[{href}]}});
      throw new Error('unsafe download attempted');};
    await assert.rejects(acquireLiveSource({...request,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'메모',evidenceOnly:false},{fetcher}),error=>error.status===409);
    assert.equal(log.length,2);assert.equal(log.every(url=>url.startsWith('https://')),true);
  }
});

test('Commons video metadata and one selected synthetic MP4 acquire through actual decode',async()=>{
  const {input}=isolated('video');
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'vm-live-video-')),'synthetic.mp4');
  const rendered=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=32x32:r=10','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',file],{windowsHide:true,encoding:'utf8',timeout:15_000});
  assert.equal(rendered.status,0,rendered.stderr?.slice(-300));const bytes=readFileSync(file);
  const payload={query:{pages:[{pageid:303,title:'File:Synthetic.mp4',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Synthetic.mp4',mime:'video/mp4',width:32,height:32,extmetadata:{Artist:{value:'Synthetic test fixture'},LicenseShortName:{value:'Test only'}}}]}]}};
  const calls=[];const fetcher=async(url)=>{const target=String(url);calls.push(target);return target.includes('/w/api.php')?reply(target,payload):reply(target,bytes,'video/mp4');};
  const candidate=(await searchLiveSources(input,{fetcher})).candidates[0];assert.equal(candidate.mediaType,'video');assert.equal(candidate.variant.kind,'original');
  const result=await acquireLiveSource({...input,providerId:candidate.providerId,metadataSha256:candidate.metadataSha256,semanticNote:'합성 회귀 영상',evidenceOnly:false},{fetcher});
  const asset=result.plan.assets.find(row=>row.id===result.assetId);assert.equal(asset.mimeType,'video/mp4');assert.ok(asset.durationSeconds>0);assert.equal(asset.status,'pending-review');
  assert.equal(calls.filter(url=>url.endsWith('/Synthetic.mp4')).length,1);
  const unsupported={query:{pages:[{pageid:304,title:'File:Ogg.ogv',imageinfo:[{url:'https://upload.wikimedia.org/a.ogv',mime:'video/ogg'}]}]}};
  assert.equal((await searchLiveSources({...input,baseRevision:result.plan.revision,requirementId:result.plan.requirements.find(row=>row.assetId===null&&row.mediaType==='video')?.id??input.requirementId},{fetcher:async(url)=>reply(String(url),unsupported)})).candidates.length,0);
});

test('abort after download or before decode leaves no attached file',async()=>{
  const {input}=isolated(),card=(await searchLiveSources(input,{fetcher:fixtureFetch()})).candidates[0],controller=new AbortController();
  const fetcher=async(url)=>{
    const target=String(url);if(target.includes('/w/api.php'))return reply(target,commons);
    const response=reply(target,image,'image/png');queueMicrotask(()=>controller.abort());return response;
  };
  await assert.rejects(acquireLiveSource({...input,providerId:card.providerId,metadataSha256:card.metadataSha256,semanticNote:'메모',evidenceOnly:false},{fetcher,signal:controller.signal}),error=>error.status===409||error.status===502);
  assert.equal(getProject(input.projectId).assets.length,0);
});
