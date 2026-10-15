'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {TimelineInspection} from '../../../visualmaker/core/timeline-inspection.ts';
import {currentTimeline,timelineResponseScope} from './timeline-client';

const MAX_REPORT_BYTES=1_000_000;
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown>{
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>MAX_REPORT_BYTES)throw new Error('타임라인 응답 크기가 제한을 넘었습니다.');
  const reader=response.body?.getReader();if(!reader)throw new Error('타임라인 응답이 비어 있습니다.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_REPORT_BYTES){await reader.cancel();throw new Error('타임라인 응답 크기가 제한을 넘었습니다.');}
    chunks.push(value);if(signal.aborted)throw new Error('요청이 취소되었습니다.');}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function clock(seconds:number){const whole=Math.floor(seconds);return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}`;}

export default function TimelineInspectionPanel({plan,token,selectedSceneId,onSelectScene}:{plan:Plan;token:string;selectedSceneId:string;onSelectScene:(sceneId:string)=>void}){
  const [report,setReport]=useState<TimelineInspection|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [epoch,setEpoch]=useState(0),[downloading,setDownloading]=useState(false);
  const downloadRef=useRef<AbortController|null>(null);
  const planRef=useRef(plan);planRef.current=plan;
  const scopeRef=useRef({id:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256});
  scopeRef.current={id:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256};
  const url=`/api/studio/timeline?${new URLSearchParams({id:plan.id,baseRevision:String(plan.revision)})}`;
  const load=useCallback(async(signal:AbortSignal)=>{
    const expected=planRef.current;
    const response=await fetch(url,{headers:{'x-visualmaker-token':token},cache:'no-store',signal});
    if(!response.ok){const message=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(message?.error??'타임라인을 읽지 못했습니다.');}
    const value=await boundedJson(response,signal);const next=await currentTimeline(value,expected);
    if(!next||!timelineResponseScope(response,expected,next))throw new Error('다른 계획 또는 제작 명세의 타임라인 응답입니다.');
    return next;
  },[plan.id,plan.revision,plan.script.rawSha256,token,url]);
  useEffect(()=>{const controller=new AbortController();let live=true;setReport(null);setLoading(true);setError('');downloadRef.current?.abort();
    setDownloading(false);
    void load(controller.signal).then(next=>{if(live&&!controller.signal.aborted)setReport(next);})
      .catch(reason=>{if(live&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'타임라인을 읽지 못했습니다.');})
      .finally(()=>{if(live&&!controller.signal.aborted)setLoading(false);});
    return()=>{live=false;controller.abort();downloadRef.current?.abort();};
  },[load,epoch]);
  async function download(){if(!report||downloading)return;const controller=new AbortController();downloadRef.current=controller;setDownloading(true);setError('');
    const initial={...scopeRef.current};
    try{const response=await fetch(`${url}&format=download`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok){const value=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(value?.error??'타임라인 파일을 받지 못했습니다.');}
      if(!timelineResponseScope(response,plan,report)||!/^attachment; filename="timeline-inspection-episode-001-r\d+\.json"$/.test(response.headers.get('content-disposition')??''))
        throw new Error('다른 범위의 타임라인 다운로드 응답입니다.');
      const value=await boundedJson(response,controller.signal),current=await currentTimeline(value,plan);
      if(!current||JSON.stringify(current)!==JSON.stringify(report))throw new Error('화면에서 확인한 타임라인이 변경됐습니다. 새로고침하세요.');
      const scope=scopeRef.current;
      if(controller.signal.aborted||scope.id!==initial.id||scope.revision!==initial.revision||scope.scriptSha256!==initial.scriptSha256)return;
      const blobUrl=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)+'\n'],{type:'application/json'}));
      const anchor=document.createElement('a');anchor.href=blobUrl;anchor.download=`timeline-inspection-episode-001-r${plan.revision}.json`;anchor.click();
      setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'타임라인 파일을 받지 못했습니다.');}
    finally{if(downloadRef.current===controller){downloadRef.current=null;setDownloading(false);}}
  }
  return <section className="vm-readiness" aria-label="에피소드 타임라인 점검"><div className="vm-section-heading"><h2>에피소드 타임라인 점검</h2><div><button type="button" onClick={()=>setEpoch(value=>value+1)} disabled={loading}>새로고침</button><button type="button" onClick={()=>void download()} disabled={!report||loading||downloading}>점검 정보 JSON 받기</button></div></div>
    <p className="vm-help">컷 구간은 현재 명세의 임시 프레임 창입니다. 녹음 문단 시간은 별도 초안이며, 두 축의 정렬이나 제작 승인을 뜻하지 않습니다.</p>
    {loading?<p role="status">현재 명세와 컷 결과 확인 중…</p>:null}{error?<p role="alert">{error}</p>:null}
    {report?<><p>EP001 · {report.rows.length}컷 · 이 점검에서 검증한 영상 0개 · 단계 {report.stage}</p>
      {report.blockers.length?<ul>{report.blockers.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}
      <div className="vm-timeline-list">{report.rows.map(row=><div key={row.cutId} className="vm-timeline-row"><button type="button" disabled={!row.sceneId} aria-current={row.sceneId===selectedSceneId?'true':undefined} onClick={()=>row.sceneId&&onSelectScene(row.sceneId)}>{String(row.order).padStart(2,'0')} · {row.cutId}</button><span>{clock(row.windowStartSeconds)}–{clock(row.windowEndSeconds)} · {row.durationFrames}프레임</span><span>{row.preview.available?'검증된 임시 영상 있음':row.preview.reason}</span></div>)}</div>
      <div className="vm-timeline-narration"><h3>녹음 문단 시간 초안</h3><p>{report.narration.reason}</p>{report.narration.status==='current-draft'?<><p>녹음 {report.narration.durationSeconds?.toFixed(2)}초 · 수동 구간 확인 {report.narration.manualReviewConfirmed?'기록됨':'이전 이력'}</p><ol>{report.narration.segments.map(segment=><li key={segment.segmentId}>{segment.startSeconds.toFixed(3)}–{segment.endSeconds.toFixed(3)}초 · {segment.text}</li>)}</ol></>:null}</div>
      <p className="vm-help">전체 컷 영상 검증은 이 화면에서 수행하지 않습니다. 조회 범위: 최근 작업 최대 {report.inspectionLimits.recentJobs}개, 장면당 후보 최대 {report.inspectionLimits.candidatesPerScene}개. 영상과 녹음의 최종 조립은 아직 수행되지 않았습니다.</p></>:null}
  </section>;
}
