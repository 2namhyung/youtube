'use client';

import {useEffect,useRef,useState} from 'react';
import type {NarrationTake,Plan} from '../../../visualmaker/core/model';
import type {NarrationScope} from './narration-client';
import {currentSubtitleDownload,parseTimingInputs,validateSubtitleDownload,validateTimingExport,validateTimingReport,validateTimingSave} from './narration-timing-client';
import type {SubtitleFormat,TimingInput,TimingReport} from './narration-timing-client';

type EditableRow={segmentId:string;text:string;startSeconds:string;endSeconds:string};
type Props={plan:Plan;take:NarrationTake;token:string;scope:NarrationScope;busy:boolean;
  isCurrent:(scope:NarrationScope)=>boolean;beginMutation:()=>null|(()=>void);
  onSaved:(plan:Plan,scope:NarrationScope,takeId:string)=>void;
  onPreview:(take:NarrationTake,range:TimingInput)=>void};

async function apiError(response:Response,fallback:string){
  try{const payload:unknown=await response.json();if(payload && typeof payload==='object' && 'error' in payload && typeof payload.error==='string')return payload.error;}catch{}
  return fallback;
}
function errorText(error:unknown){return error instanceof Error?error.message:'시간 초안을 처리하지 못했습니다.';}

export default function NarrationTiming({plan,take,token,scope,busy,isCurrent,beginMutation,onSaved,onPreview}:Props){
  const [report,setReport]=useState<TimingReport|null>(null);
  const [rows,setRows]=useState<EditableRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [manualConfirmed,setManualConfirmed]=useState(false);
  const [reload,setReload]=useState(0);
  const readRef=useRef<AbortController|null>(null);
  const writeRef=useRef<AbortController|null>(null);
  const exportRef=useRef<AbortController|null>(null);
  const aliveRef=useRef(true);
  const projectId=scope.projectId,revision=scope.revision,scriptSha256=scope.scriptSha256,epoch=scope.epoch;
  const rangesValid=(()=>{try{return rows.length>0&&parseTimingInputs(rows,take.durationSeconds).length===rows.length;}
    catch{return false;}})();

  useEffect(()=>{
    aliveRef.current=true;
    const controller=new AbortController();readRef.current=controller;
    setLoading(true);setReport(null);setRows([]);setManualConfirmed(false);setError('');setNotice('');
    (async()=>{try{
      const query=new URLSearchParams({id:projectId,takeId:take.id});
      const response=await fetch(`/api/studio/narration/timing?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(await apiError(response,'시간 초안을 읽지 못했습니다.'));
      const next=validateTimingReport(await response.json(),plan,take,{projectId,revision,scriptSha256,epoch});
      if(!controller.signal.aborted && aliveRef.current && isCurrent({projectId,revision,scriptSha256,epoch})){
        setReport(next);
        setRows((next.current?.segments??next.estimate?.segments??[]).map(item=>({segmentId:item.segmentId,text:item.text,startSeconds:String(item.startSeconds),endSeconds:String(item.endSeconds)})));
      }
    }catch(cause){if(!controller.signal.aborted && aliveRef.current && isCurrent({projectId,revision,scriptSha256,epoch}))setError(errorText(cause));}
    finally{if(!controller.signal.aborted && aliveRef.current)setLoading(false);}})();
    return()=>{controller.abort();if(readRef.current===controller)readRef.current=null;};
  },[plan,take,token,projectId,revision,scriptSha256,epoch,reload,isCurrent]);
  useEffect(()=>()=>{aliveRef.current=false;readRef.current?.abort();writeRef.current?.abort();exportRef.current?.abort();},[]);

  function updateRow(index:number,field:'startSeconds'|'endSeconds',value:string){
    setRows(current=>current.map((row,rowIndex)=>rowIndex===index?{...row,[field]:value}:row));
    setManualConfirmed(false);
    setError('');setNotice('');
  }
  function preview(index:number){
    if(loading)return;
    try{
      const [range]=parseTimingInputs([rows[index]],take.durationSeconds);
      onPreview(take,range);setError('');
    }catch(cause){setError(errorText(cause));}
  }
  async function save(){
    if(busy||loading||saving||!report?.currentScriptMatch||!manualConfirmed)return;
    let segments:TimingInput[];
    try{segments=parseTimingInputs(rows,take.durationSeconds);}catch(cause){setError(errorText(cause));return;}
    const release=beginMutation();if(!release)return;
    const controller=new AbortController();writeRef.current=controller;setSaving(true);setError('');setNotice('');
    try{
      const body={id:projectId,baseRevision:revision,takeId:take.id,scriptSha256,audioSha256:take.sha256,segments,manualReviewConfirmed:true};
      const response=await fetch('/api/studio/narration/timing',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(await apiError(response,response.status===409?'대본·녹음 또는 프로젝트가 바뀌었습니다. 최신 내용을 다시 읽어주세요.':'시간 초안을 저장하지 못했습니다.'));
      const saved=validateTimingSave(await response.json(),plan,take,{projectId,revision,scriptSha256,epoch});
      if(!controller.signal.aborted && aliveRef.current && isCurrent({projectId,revision,scriptSha256,epoch}))onSaved(saved.plan,{projectId,revision,scriptSha256,epoch},take.id);
    }catch(cause){if(!controller.signal.aborted && aliveRef.current && isCurrent({projectId,revision,scriptSha256,epoch}))setError(errorText(cause));}
    finally{if(writeRef.current===controller)writeRef.current=null;release();if(aliveRef.current)setSaving(false);}
  }
  async function download(timingId:string,format:'json'|SubtitleFormat){
    if(busy||saving)return;
    exportRef.current?.abort();const controller=new AbortController();exportRef.current=controller;setError('');setNotice('');
    try{
      const query=new URLSearchParams({id:projectId,baseRevision:String(revision),takeId:take.id,timingId,format});
      const response=await fetch(`/api/studio/narration/timing?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(await apiError(response,'저장된 시간 초안을 내보내지 못했습니다.'));
      let blob:Blob;
      if(format==='json'){
        const content=validateTimingExport(await response.json(),plan,take,timingId);
        blob=new Blob([JSON.stringify(content,null,2)],{type:'application/json'});
      }else{
        const timing=report?.history.find(item=>item.id===timingId);
        if(!timing||!timing.currentScriptMatch||timing.manualReviewConfirmed!==true)throw new Error('현재 대본에 확인된 시간 초안이 아닙니다.');
        const contentLength=Number(response.headers.get('content-length'));
        if(!Number.isSafeInteger(contentLength)||contentLength<1||contentLength>1_000_000)throw new Error('자막 응답 크기를 확인할 수 없습니다.');
        const reader=response.body?.getReader();if(!reader)throw new Error('자막 응답 본문이 없습니다.');
        const chunks:Uint8Array[]=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>1_000_000){await reader.cancel();throw new Error('자막 응답이 허용 크기를 넘습니다.');}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        validateSubtitleDownload(response,bytes,plan,take,timing,{projectId,revision,scriptSha256,epoch},format);
        blob=new Blob([bytes],{type:format==='srt'?'application/x-subrip;charset=utf-8':'text/vtt;charset=utf-8'});
      }
      if(!aliveRef.current||!currentSubtitleDownload({projectId,revision,scriptSha256,epoch},scope,controller.signal.aborted)||
        !isCurrent({projectId,revision,scriptSha256,epoch}))return;
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=format==='json'?`visualmaker-${timingId}.json`:`subtitle-draft-${timingId}.${format}`;anchor.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('저장된 작업용 시간 초안을 내보냈습니다.');
    }catch(cause){if(!controller.signal.aborted && aliveRef.current && isCurrent({projectId,revision,scriptSha256,epoch}))setError(errorText(cause));}
    finally{if(exportRef.current===controller)exportRef.current=null;}
  }

  return <section className="vm-narration-timing" aria-label={`${take.originalName} 문단별 시간 초안`} aria-busy={loading||saving}>
    <div className="vm-narration-timing-heading"><h4>문단별 시간 초안 · {take.originalName}</h4><button type="button" disabled={loading||saving||busy} onClick={()=>{setLoading(true);setReport(null);setRows([]);setReload(value=>value+1);}}>서버 내용 다시 읽기</button></div>
    <p>녹음 측정 길이 {take.durationSeconds.toFixed(3)}초. 첫 구간은 글자 수로 나눈 추정치이며 발화를 관찰하거나 자동 정렬한 결과가 아닙니다. 직접 들으며 시작·끝 초를 조정하세요.</p>
    {loading?<p role="status">시간 초안을 읽는 중…</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {report?<>
      {!report.currentScriptMatch?<p className="vm-narration-timing-stale">이 녹음은 이전 대본에 연결되어 있습니다. 현재 대본의 시간 초안은 저장할 수 없습니다.</p>:null}
      {report.current?<p className="vm-narration-timing-status">현재 대본에 저장된 수동 시간 초안입니다. 수정해 저장하면 새 이력이 추가됩니다.</p>:report.estimate?<p className="vm-narration-timing-status">아래 값은 저장되지 않은 글자 수 비례 추정치입니다.</p>:null}
      {report.currentScriptMatch?<><div className="vm-narration-timing-rows">{rows.map((row,index)=><div className="vm-narration-timing-row" key={row.segmentId}>
        <strong>{index+1}번 문단</strong><p>{row.text}</p>
        <div className="vm-narration-timing-controls"><label>시작 초<input type="number" min="0" max={take.durationSeconds} step="any" inputMode="decimal" aria-label={`${index+1}번 문단 시작 초`} value={row.startSeconds} disabled={loading||saving||busy} onChange={event=>updateRow(index,'startSeconds',event.target.value)}/></label>
          <label>끝 초<input type="number" min="0" max={take.durationSeconds} step="any" inputMode="decimal" aria-label={`${index+1}번 문단 끝 초`} value={row.endSeconds} disabled={loading||saving||busy} onChange={event=>updateRow(index,'endSeconds',event.target.value)}/></label>
          <button type="button" disabled={loading||saving} onClick={()=>preview(index)} aria-label={`${index+1}번 문단 구간 듣기`}>구간 듣기</button></div>
      </div>)}</div><label className="vm-narration-confirm"><input type="checkbox" checked={manualConfirmed} disabled={loading||saving||busy||!rows.length} onChange={event=>setManualConfirmed(event.target.checked)}/> 녹음을 직접 들으며 표시된 문단별 시작·끝 구간을 수동 확인했습니다. 작업용 초안 확인이며 최종 음성·자막·제작 승인이 아닙니다.</label><div className="vm-narration-timing-actions"><button type="button" disabled={loading||saving||busy||!rangesValid||!manualConfirmed} onClick={()=>void save()}>{saving?'시간 초안 저장 중…':'수동 시간 초안 저장'}</button></div></>:null}
      <details className="vm-narration-timing-history"><summary>저장된 시간 초안 이력 {report.history.length}개</summary>
        {!report.history.length?<p>저장된 기록이 없습니다.</p>:<ol>{report.history.map(item=><li key={item.id}>
          <span>{new Date(item.createdAt).toLocaleString('ko-KR')} · 리비전 {item.capturedRevision} · {item.currentScriptMatch?'현재 대본과 일치':'이전 대본의 초안'} · {item.manualReviewConfirmed?'수동 구간 확인 기록':'기존 미확인 이력'} · 문단 {item.segments.length}개</span>
          <button type="button" disabled={busy||saving} onClick={()=>void download(item.id,'json')} aria-label={`${item.id} 시간 초안 JSON 내보내기`}>JSON 내보내기</button>
          <button type="button" disabled={busy||saving||!item.currentScriptMatch||item.manualReviewConfirmed!==true} onClick={()=>void download(item.id,'srt')} aria-label={`${item.id} 수동 자막 초안 SRT 받기`}>SRT 받기</button>
          <button type="button" disabled={busy||saving||!item.currentScriptMatch||item.manualReviewConfirmed!==true} onClick={()=>void download(item.id,'vtt')} aria-label={`${item.id} 수동 자막 초안 VTT 받기`}>VTT 받기</button>
        </li>)}</ol>}
      </details>
      <p className="vm-help">SRT/VTT는 현재 대본과 일치하고 수동 확인 기록이 있는 저장본에서만 받습니다. 이 기록은 작업용 수동 시간 초안입니다. 단어 정렬·자막 승인·제작 영상 타이밍 변경은 수행하지 않습니다.</p>
    </>:null}
  </section>;
}
