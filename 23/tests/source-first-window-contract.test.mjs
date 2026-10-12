import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceFirstWindowContracts} from '../video/scripts/source-first-window-contract.mjs';

const sha = 'a'.repeat(64);
const video = {id:'V',media_type:'video',path:'v.webm',sha256:sha,width:1920,height:1080,fps:'30/1',duration_seconds:10,license:'CC BY 4.0',commercial_use_allowed:true,derivative_use_allowed:true};
const photo = {id:'P',media_type:'photo',path:'p.jpg',sha256:sha,width:1920,height:1080,license:'CC0',commercial_use_allowed:true,derivative_use_allowed:true};
const videoSegment = (start,end,startFrame,endFrame)=>({kind:'video-window',segment_index:1,start_frame:0,end_frame_exclusive:90,output_frames:90,source_id:'V',source_start_seconds:start,source_end_seconds:end,source_start_frame:startFrame,source_end_frame_exclusive:endFrame,source_fps:'30/1',original_duration_seconds:10,original_width:1920,original_height:1080,source_path:'v.webm',source_sha256:sha,verified_edl_binding:{path:'edl.json',start_seconds:start,end_seconds:end}});
const sourceCut = (id,segments,requirements=[])=>({shot_id:id,production_mode:'source-video',timing:{provisional_duration_frames:segments.reduce((n,s)=>n+s.output_frames,0)},requirements,internal_presentation_segments:segments.map((s,index)=>({...s,segment_index:index+1,start_frame:segments.slice(0,index).reduce((n,x)=>n+x.output_frames,0),end_frame_exclusive:segments.slice(0,index+1).reduce((n,x)=>n+x.output_frames,0)}))});

test('a reviewed source action may stay continuous beyond four seconds without artificial splits',()=>{
  const segment={...videoSegment(0,6,0,180),output_frames:180,end_frame_exclusive:180};
  const result=validateSourceFirstWindowContracts({cuts:[sourceCut('SH001',[segment])]}, {green_inventory:[video],amber_locators:[]});
  assert.deepEqual(result,[]);
});
const matrix = {green_inventory:[video,photo],amber_locators:[]};

test('accepts exact non-overlapping Green windows',()=>{
  const spec={cuts:[sourceCut('SH001',[videoSegment(0,3,0,90)]),sourceCut('SH002',[videoSegment(3,6,90,180)])]};
  assert.deepEqual(validateSourceFirstWindowContracts(spec,matrix),[]);
});

test('rejects repeated or overlapping Green source windows',()=>{
  const spec={cuts:[sourceCut('SH001',[videoSegment(0,3,0,90)]),sourceCut('SH002',[videoSegment(2,5,60,150)])]};
  assert.ok(validateSourceFirstWindowContracts(spec,matrix).some((item)=>item.includes('overlaps or repeats')));
});

test('rejects out-of-range windows and disallowed licenses',()=>{
  const badMatrix={...matrix,green_inventory:[{...video,license:'unknown'},photo]};
  const spec={cuts:[sourceCut('SH001',[videoSegment(9,12,270,360)])]};
  const failures=validateSourceFirstWindowContracts(spec,badMatrix);
  assert.ok(failures.some((item)=>item.includes('allowlist')));
  assert.ok(failures.some((item)=>item.includes('out-of-range')));
});

test('rejects photo holds without exact crop and treatment',()=>{
  const segment={kind:'photo-hold',segment_index:1,start_frame:0,end_frame_exclusive:90,output_frames:90,source_id:'P',source_path:'p.jpg',source_sha256:sha,source_width:1920,source_height:1080,hold_frames:90,hold_seconds:3};
  const spec={cuts:[{...sourceCut('SH001',[segment]),production_mode:'source-photo'}]};
  assert.ok(validateSourceFirstWindowContracts(spec,matrix).some((item)=>item.includes('exact hold, crop and treatment')));
});

test('rejects Amber reuse and quoted output beyond locator amount',()=>{
  const requirement={source_id:'A',item_url:'https://youtube.test/a',rights_lane:'amber-direct-quotation-locator-only',local_acquisition_authorization:false,production_use:'direct quotation candidate only; no local clip acquired'};
  const segment={kind:'amber-video-locator',segment_index:1,start_frame:0,end_frame_exclusive:100,output_frames:100,source_id:'A',source_start_seconds:1,source_end_seconds:3,local_acquisition_authorization:false,local_video_file:null};
  const spec={cuts:[sourceCut('SH001',[segment],[requirement]),sourceCut('SH002',[segment],[requirement])]};
  const amberMatrix={...matrix,amber_locators:[{url:'https://youtube.test/a',timecode:{start:'00:00:01.000',end:'00:00:03.000'}}]};
  const failures=validateSourceFirstWindowContracts(spec,amberMatrix);
  assert.ok(failures.some((item)=>item.includes('exceeds')));
  assert.ok(failures.some((item)=>item.includes('exactly once')));
});
