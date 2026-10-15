'use client';

import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {NarrationTake,Plan} from '../../../visualmaker/core/model';
import {IntervalEndMonitor,validateNarrationUploadResult} from './narration-client';
import type {NarrationScope,NarrationUploadResult} from './narration-client';
import type {TimingInput} from './narration-timing-client';
import NarrationTiming from './narration-timing';

type Props={plan:Plan;token:string;busy:boolean;scope:NarrationScope;
  isCurrent:(scope:NarrationScope)=>boolean;
  onUploaded:(result:NarrationUploadResult,scope:NarrationScope)=>void;
  onTimingSaved:(plan:Plan,scope:NarrationScope,takeId:string)=>void;
  selectedTimingTakeId:string|null;onSelectTimingTake:(takeId:string|null)=>void;
  onRefresh:()=>void;beginMutation:()=>null|(()=>void)};

function messageOf(error:unknown,fallback:string){return error instanceof Error ? error.message : fallback;}
async function responseError(response:Response,fallback:string){
  try{const payload:unknown=await response.json();if(payload && typeof payload==='object' && 'error' in payload && typeof payload.error==='string') return payload.error;}catch{}
  return fallback;
}
function seconds(value:number){return `${value.toFixed(2)}초`;}

export default function NarrationIntake({plan,token,busy,scope,isCurrent,onUploaded,onTimingSaved,selectedTimingTakeId,onSelectTimingTake,onRefresh,beginMutation}:Props){
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  const [playback,setPlayback]=useState<{takeId:string;url:string}|null>(null);
  const [loadingTake,setLoadingTake]=useState<string|null>(null);
  const [playbackError,setPlaybackError]=useState('');
  const fileRef=useRef<HTMLInputElement>(null);
  const uploadRef=useRef<AbortController|null>(null);
  const mediaRef=useRef<AbortController|null>(null);
  const urlRef=useRef('');
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const intervalRef=useRef<{takeId:string;startSeconds:number;endSeconds:number}|null>(null);
  const monitorRef=useRef<IntervalEndMonitor|null>(null);
  const aliveRef=useRef(true);
  useEffect(()=>{aliveRef.current=true;
    monitorRef.current=new IntervalEndMonitor(callback=>requestAnimationFrame(callback),frame=>cancelAnimationFrame(frame),()=>{intervalRef.current=null;});
    return()=>{
    aliveRef.current=false;uploadRef.current?.abort();mediaRef.current?.abort();
    monitorRef.current?.stop();monitorRef.current=null;audioRef.current?.pause();intervalRef.current=null;
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  };},[]);

  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(uploading || busy)return;
    const file=fileRef.current?.files?.[0];
    if(!file){setUploadError('녹음 파일을 선택하세요.');return;}
    if(!file.size || file.size>40_000_000){setUploadError('녹음 파일은 40MB 이하여야 합니다.');return;}
    const release=beginMutation();if(!release)return;
    const controller=new AbortController();uploadRef.current=controller;
    setUploading(true);setUploadError('');
    const form=new FormData();form.set('id',scope.projectId);form.set('baseRevision',String(scope.revision));
    form.set('scriptSha256',scope.scriptSha256);form.set('file',file);
    try{
      const response=await fetch('/api/studio/narration',{method:'POST',headers:{'x-visualmaker-token':token},body:form,cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(await responseError(response,response.status===409?'대본이나 프로젝트가 바뀌었습니다. 최신 내용을 불러와 다시 등록하세요.':'녹음을 등록하지 못했습니다.'));
      const result=validateNarrationUploadResult(await response.json(),scope);
      if(!controller.signal.aborted && aliveRef.current && isCurrent(scope)){
        onUploaded(result,scope);
        if(fileRef.current)fileRef.current.value='';
      }
    }catch(error){if(!controller.signal.aborted && aliveRef.current && isCurrent(scope))setUploadError(messageOf(error,'녹음을 등록하지 못했습니다.'));}
    finally{if(uploadRef.current===controller)uploadRef.current=null;release();if(aliveRef.current)setUploading(false);}
  }

  function clearPlayback(){
    mediaRef.current?.abort();mediaRef.current=null;
    monitorRef.current?.stop();
    audioRef.current?.pause();intervalRef.current=null;
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current='';}
    setPlayback(null);setLoadingTake(null);setPlaybackError('');
  }
  function seekInterval(){
    const range=intervalRef.current, audio=audioRef.current;
    if(!range||!audio||playback?.takeId!==range.takeId||audio.readyState<1)return;
    audio.currentTime=range.startSeconds;
    void audio.play().then(()=>{if(aliveRef.current && isCurrent(scope) && intervalRef.current===range)monitorRef.current?.start(audio,range.endSeconds);})
      .catch(()=>{if(aliveRef.current && isCurrent(scope) && intervalRef.current===range)setPlaybackError('이 브라우저에서 녹음을 재생하지 못했습니다. 원본 형식의 지원 여부를 확인하세요.');});
  }
  async function play(take:NarrationTake,range?:TimingInput){
    if(range && playback?.takeId===take.id && audioRef.current?.readyState && audioRef.current.readyState>=1){
      intervalRef.current={takeId:take.id,startSeconds:range.startSeconds,endSeconds:range.endSeconds};seekInterval();return;
    }
    clearPlayback();
    if(range)intervalRef.current={takeId:take.id,startSeconds:range.startSeconds,endSeconds:range.endSeconds};
    const controller=new AbortController();mediaRef.current=controller;
    setLoadingTake(take.id);
    try{
      const query=new URLSearchParams({id:scope.projectId,takeId:take.id});
      const response=await fetch(`/api/studio/narration/media?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(await responseError(response,'녹음 파일을 읽지 못했습니다.'));
      const blob=await response.blob();
      if(!controller.signal.aborted && aliveRef.current && isCurrent(scope)){
        const url=URL.createObjectURL(blob);
        urlRef.current=url;setPlayback({takeId:take.id,url});setLoadingTake(null);
      }
    }catch(error){if(!controller.signal.aborted && aliveRef.current && isCurrent(scope)){setPlaybackError(messageOf(error,'녹음 파일을 읽지 못했습니다.'));setLoadingTake(null);}}
    finally{if(mediaRef.current===controller)mediaRef.current=null;}
  }

  const takes=[...(plan.narrationTakes??[])].reverse();
  return <section className="vm-narration-intake" aria-labelledby="vm-narration-title" aria-busy={uploading}>
    <div className="vm-narration-heading"><div><span className="vm-eyebrow">04 / VOICE INTAKE</span><h2 id="vm-narration-title">녹음 음성</h2><p>대본과 함께 보관할 녹음 파일의 실제 길이를 측정합니다. 영상 타이밍은 아직 맞추지 않습니다.</p></div></div>
    <form onSubmit={event=>void upload(event)}>
      <label htmlFor="vm-narration-file">녹음 파일 (WAV·MP3·M4A, 최대 40MB)</label>
      <input id="vm-narration-file" ref={fileRef} type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" required disabled={busy||uploading}/>
      <button type="submit" disabled={busy||uploading}>{uploading?'길이 측정 및 저장 중…':'녹음 등록·길이 측정'}</button>
    </form>
    {uploading?<p role="status">음성 파일을 검사하고 길이를 측정하는 중…</p>:null}
    {uploadError?<div role="alert"><p>{uploadError}</p><button type="button" disabled={busy||uploading} onClick={onRefresh}>최신 내용 불러오기</button></div>:null}
    <div className="vm-narration-history"><h3>녹음 기록 {takes.length}개</h3>
      {!takes.length?<p>아직 등록된 녹음이 없습니다.</p>:<ul>{takes.map(take=>{
        const matches=take.scriptSha256===plan.script.rawSha256;
        return <li key={take.id}><div><strong>{take.originalName}</strong><span className={matches?'vm-narration-current':'vm-narration-stale'}>{matches?'현재 대본과 일치':'이전 대본의 녹음'}</span></div>
          <p>측정 길이 {seconds(take.durationSeconds)} · {take.format.toUpperCase()} · 등록 당시 리비전 {take.capturedRevision}</p>
          <button type="button" disabled={loadingTake!==null} onClick={()=>void play(take)} aria-label={`${take.originalName} 녹음 듣기`}>{loadingTake===take.id?'녹음 읽는 중…':'녹음 듣기'}</button>
          <button type="button" disabled={busy||uploading} onClick={()=>onSelectTimingTake(selectedTimingTakeId===take.id?null:take.id)} aria-expanded={selectedTimingTakeId===take.id}>{selectedTimingTakeId===take.id?'시간 초안 닫기':'문단별 시간 편집'}</button>
          {playback?.takeId===take.id?<div className="vm-narration-player"><audio ref={audioRef} controls preload="metadata" src={playback.url} onLoadedMetadata={seekInterval}
            onPlaying={event=>{const range=intervalRef.current;if(range?.takeId===take.id)monitorRef.current?.start(event.currentTarget,range.endSeconds);}}
            onTimeUpdate={event=>{const range=intervalRef.current;if(range?.takeId===take.id)monitorRef.current?.check(event.currentTarget,range.endSeconds);}}
            onPause={()=>{monitorRef.current?.stop();intervalRef.current=null;}}
            onEnded={()=>{monitorRef.current?.stop();intervalRef.current=null;}}
            onSeeking={event=>{const range=intervalRef.current;if(range?.takeId===take.id && Math.abs(event.currentTarget.currentTime-range.startSeconds)>0.001){monitorRef.current?.stop();intervalRef.current=null;}}}
            onError={()=>setPlaybackError('이 브라우저에서 녹음을 재생하지 못했습니다. 원본 형식의 지원 여부를 확인하세요.')} aria-label={`${take.originalName} 녹음 재생`}/><button type="button" onClick={clearPlayback}>재생 닫기</button></div>:null}
        </li>;
      })}</ul>}
      {selectedTimingTakeId && takes.some(take=>take.id===selectedTimingTakeId)?<NarrationTiming key={`${scope.projectId}:${scope.revision}:${scope.epoch}:${selectedTimingTakeId}`} plan={plan} take={takes.find(take=>take.id===selectedTimingTakeId)!} token={token} scope={scope} busy={busy} isCurrent={isCurrent} beginMutation={beginMutation} onSaved={onTimingSaved} onPreview={(take,range)=>void play(take,range)}/>:null}
      {playbackError?<p role="alert">{playbackError}</p>:null}
      <p className="vm-help">길이와 대본 일치 여부는 작업용 기록입니다. 음성 정렬·최종 녹음 승인·제작 승인을 뜻하지 않습니다.</p>
    </div>
  </section>;
}
