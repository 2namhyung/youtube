'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {CanonicalReport} from '../../../visualmaker/core/canonical-cut-render.ts';
import {currentCanonicalEnqueue,currentCanonicalReport} from './canonical-client';

export default function CanonicalPanel({plan,sceneId,token,busy,onQueued}:{plan:Plan;sceneId:string;token:string;busy:boolean;onQueued:()=>Promise<void>}){
  const [report,setReport]=useState<CanonicalReport|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [posting,setPosting]=useState(false);
  const postRef=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();let live=true;setReport(null);setLoading(true);setError('');
    void(async()=>{try{const response=await fetch(`/api/studio/cut-render-contract?${new URLSearchParams({id:plan.id,baseRevision:String(plan.revision),sceneId})}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('계약 확인 요청이 실패했습니다.');
      const json=await response.json();const next=await currentCanonicalReport(json.report,plan,sceneId);
      if(!next)throw new Error('현재 장면과 일치하는 컷 계약 응답이 아닙니다.');
      if(live&&!controller.signal.aborted)setReport(next);
    }catch(e){if(live&&!controller.signal.aborted)setError(e instanceof Error?e.message:'컷 계약을 확인하지 못했습니다.');}
    finally{if(live&&!controller.signal.aborted)setLoading(false);}})();
    return()=>{live=false;controller.abort();postRef.current?.abort();};
  },[plan,sceneId,token]);
  async function enqueue(){if(!report?.renderEligible||posting||busy)return;setPosting(true);setError('');
    const controller=new AbortController();postRef.current=controller;
    try{const response=await fetch('/api/studio/jobs',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({action:'enqueue',kind:'canonical-cut-preview',projectId:plan.id,baseRevision:plan.revision,sceneId,idempotencyKey:crypto.randomUUID()})});
      if(!response.ok)throw new Error('컷 실행 요청을 저장하지 못했습니다.');const data=await response.json();
      if(controller.signal.aborted)return;
      const job=await currentCanonicalEnqueue(data,report,plan,sceneId);
      if(!job)throw new Error('확인한 컷 계약과 다른 작업 응답입니다. 계약을 다시 확인하세요.');
      if(!controller.signal.aborted)await onQueued();
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'컷 실행 요청에 실패했습니다.');}finally{if(postRef.current===controller)postRef.current=null;if(!controller.signal.aborted)setPosting(false);}}
  return <section className="vm-readiness" aria-label="정식 컷 렌더 계약"><div className="vm-section-heading"><h2>정식 컷 미리보기 계약</h2><span>현재 장면</span></div><p className="vm-help">영상 내용은 Studio 대안이 아니라 채택된 episode-spec에서 옵니다. 이 화면은 제작 승인이나 컷 PASS가 아닙니다.</p>
    {loading?<p role="status">현재 제작 계약 확인 중…</p>:error?<p role="alert">{error}</p>:null}
    {report?<><p>대응 컷: {report.scope.cutId||'확인 불가'} · 정식 composition: {report.composition?.id||'없음'}</p>{report.blockers.length?<ul>{report.blockers.map((b,i)=><li key={`${b.code}-${i}`}>{b.detail}</li>)}</ul>:<p role="status">정식 렌더 사전 검증을 통과했습니다. 사람의 시각·권리·컷 승인과는 별개입니다.</p>}<button type="button" disabled={!report.renderEligible||posting||busy} onClick={()=>void enqueue()}>이 컷 임시 미리보기 작업 만들기</button></>:null}
  </section>;
}
