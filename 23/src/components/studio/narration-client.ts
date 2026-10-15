import type {NarrationTake, Plan} from '../../../visualmaker/core/model';

export type NarrationScope = {projectId:string; revision:number; scriptSha256:string; epoch:number};
export type NarrationUploadResult = {plan:Plan; take:NarrationTake; currentScriptMatch:true};

export function isCurrentNarrationScope(expected:NarrationScope, current:NarrationScope):boolean {
  return expected.projectId===current.projectId && expected.revision===current.revision &&
    expected.scriptSha256===current.scriptSha256 && expected.epoch===current.epoch;
}

export function beginNarrationReload(current:NarrationScope,busy:boolean):NarrationScope|null {
  return busy ? null : {...current,epoch:current.epoch+1};
}

export type IntervalAudio={currentTime:number;paused:boolean;seeking:boolean;pause:()=>void};
export class IntervalEndMonitor {
  private frame:number|null=null;
  private active=false;
  private requestFrame:(callback:FrameRequestCallback)=>number;
  private cancelFrame:(frame:number)=>void;
  private onEnd:()=>void;
  constructor(requestFrame:(callback:FrameRequestCallback)=>number,cancelFrame:(frame:number)=>void,onEnd:()=>void){
    this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.onEnd=onEnd;
  }
  start(audio:IntervalAudio,endSeconds:number){
    this.stop();this.active=true;
    const tick=()=>{
      this.frame=null;
      if(!this.active)return;
      if(audio.paused){this.stop();return;}
      if(this.check(audio,endSeconds))return;
      this.frame=this.requestFrame(tick);
    };
    this.frame=this.requestFrame(tick);
  }
  check(audio:IntervalAudio,endSeconds:number){
    if(!this.active || audio.seeking || audio.currentTime<endSeconds)return false;
    audio.pause();audio.currentTime=endSeconds;this.stop();this.onEnd();return true;
  }
  stop(){this.active=false;if(this.frame!==null){this.cancelFrame(this.frame);this.frame=null;}}
}

export function validateNarrationUploadResult(value:unknown, expected:NarrationScope):NarrationUploadResult {
  if(!value || typeof value!=='object') throw new Error('녹음 저장 응답을 확인할 수 없습니다. 최신 내용을 다시 불러오세요.');
  const result=value as Partial<NarrationUploadResult>;
  const plan=result.plan;
  const take=result.take;
  if(result.currentScriptMatch!==true || !plan || !take || plan.productionAuthority!==false ||
     plan.id!==expected.projectId || plan.revision!==expected.revision+1 ||
     plan.script?.rawSha256!==expected.scriptSha256 || take.productionAuthority!==false ||
     take.projectId!==expected.projectId || take.scriptSha256!==expected.scriptSha256 ||
     !Array.isArray(plan.narrationTakes) || !plan.narrationTakes.some(item=>item.id===take.id && item.sha256===take.sha256)) {
    throw new Error('녹음 저장 응답이 현재 프로젝트·대본과 맞지 않습니다. 최신 내용을 다시 불러오세요.');
  }
  return result as NarrationUploadResult;
}
