import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {assertPlainCaptionText} from '../visualmaker/core/finalization-mix.ts';
import {auditPlainMovText} from '../visualmaker/renderer/finalization-subtitle-audit.ts';

// Captured from an actual successful FFmpeg WebVTT -> mov_text mux.
const extra='0000000001ff000000ff00000000000000000000000000010010ffffffff00000012667461620001000105417269616c0000001462747274000000000000008400000084';
const text='원본 사진입니다.';
const segment={start_frame:0,end_frame:49,text};
function dump(hex){return `\n00000000: ${hex.match(/.{1,4}/gu).join(' ')}  .\n`;}
function probe(packetHex=`0017${Buffer.from(text).toString('hex')}`,extradata=extra){return {streams:[{codec_name:'mov_text',time_base:'1/1000000',extradata:dump(extradata)}],packets:[{pts:0,duration:1_633_000,data:dump(packetHex)}]};}

test('actual plain mux packet and default Arial16/white style are accepted',()=>{
  assert.doesNotThrow(()=>auditPlainMovText(probe(),[segment],30));
});
test('failed nondeterministic SRT mux styl run is rejected even when text is exact',()=>{
  const failed=`0017${Buffer.from(text).toString('hex')}000000167374796c0001000000090000000000000000`;
  assert.throws(()=>auditPlainMovText(probe(failed),[segment],30),/finalization-subtitle-packet-shape/u);
});
test('packet byte length, unknown suffix, truncation, omission, duplicate and time drift are rejected',()=>{
  const correct=`0017${Buffer.from(text).toString('hex')}`;
  for(const bad of [`0018${correct.slice(4)}`,`${correct}01`,correct.slice(0,-2)])assert.throws(()=>auditPlainMovText(probe(bad),[segment],30));
  const missing=probe();missing.packets=[];assert.throws(()=>auditPlainMovText(missing,[segment],30),/packet-count/u);
  const duplicate=probe();duplicate.packets.push({...duplicate.packets[0],pts:2_000_000});assert.throws(()=>auditPlainMovText(duplicate,[segment],30));
  const drift=probe();drift.packets[0].pts=3000;assert.throws(()=>auditPlainMovText(drift,[segment],30),/packet-time/u);
});
test('default style color, size, font ID and ftab length are immutable',()=>{
  const mutate=(offset,hex)=>`${extra.slice(0,offset*2)}${hex}${extra.slice(offset*2+hex.length)}`;
  for(const variant of [mutate(27,'11'),mutate(25,'00'),mutate(22,'0002'),mutate(30,'00000011')])assert.throws(()=>auditPlainMovText(probe(undefined,variant),[segment],30),/default-style/u);
});
test('v2 rejects potentially reinterpreted literal markup and ASS characters',()=>{
  assert.doesNotThrow(()=>assertPlainCaptionText([{...segment,text:'한글 😀'}]));
  for(const value of ['<b>','&amp;','a>b','{\\an8}','a\\b'])assert.throws(()=>assertPlainCaptionText([{...segment,text:value}]),/v2 자막/u);
});
test('real FFmpeg WebVTT mux retains two UTF-8 cues including emoji as plain packets and exact SRT',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'vm-caption-audit-'));
  try{
    const vtt=path.join(dir,'input.vtt'),mp4=path.join(dir,'out.mp4');
    writeFileSync(vtt,'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n한글 😀\n\n00:00:01.200 --> 00:00:02.000\n두 번째 문장.\n');
    const mux=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=64x64:r=30:d=2.5','-f','webvtt','-i',vtt,'-map','0:v:0','-map','1:0','-c:v','mpeg4','-c:s','mov_text',mp4],{encoding:'utf8',timeout:30_000});
    assert.equal(mux.status,0,mux.stderr);
    const raw=spawnSync('ffprobe',['-v','error','-select_streams','s:0','-show_streams','-show_packets','-show_data','-show_entries','stream=codec_name,time_base,extradata:packet=pts,duration,data','-of','json',mp4],{encoding:'utf8',timeout:30_000});
    assert.equal(raw.status,0,raw.stderr);
    const cues=[{start_frame:0,end_frame:30,text:'한글 😀'},{start_frame:36,end_frame:60,text:'두 번째 문장.'}];
    auditPlainMovText(JSON.parse(raw.stdout),cues,30);
    const decoded=spawnSync('ffmpeg',['-v','error','-i',mp4,'-map','0:s:0','-f','srt','pipe:1'],{encoding:'utf8',timeout:30_000});
    assert.equal(decoded.status,0,decoded.stderr);
    assert.match(decoded.stdout,/한글 😀/u);assert.match(decoded.stdout,/두 번째 문장\./u);
    assert.doesNotMatch(decoded.stdout,/<font/iu);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
