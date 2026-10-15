'use client';

import {useEffect,useRef,useState} from 'react';
import {readAIConnectionStatus,type AIConnectionStatus} from './ai-connection-client.ts';

type State={token:string;status:AIConnectionStatus|null;loading:boolean;error:string};

export default function AIConnectionPanel({token}:{token:string}){
  const [refresh,setRefresh]=useState(0);
  const [state,setState]=useState<State>({token,status:null,loading:true,error:''});
  const epoch=useRef(0);
  useEffect(()=>{
    const current=++epoch.current,controller=new AbortController();
    setState({token,status:null,loading:true,error:''});
    void readAIConnectionStatus(token,controller.signal).then(status=>{
      if(!controller.signal.aborted&&current===epoch.current)setState({token,status,loading:false,error:''});
    }).catch(()=>{
      if(!controller.signal.aborted&&current===epoch.current)
        setState({token,status:null,loading:false,error:'AI 설정 상태를 확인하지 못했습니다. 서버 설정과 접속 상태를 확인한 뒤 다시 시도하세요.'});
    });
    return()=>{controller.abort();++epoch.current;};
  },[token,refresh]);
  const shown=state.token===token?state:{token,status:null,loading:true,error:''};
  const checks=shown.status?.checks;
  return <section className="vm-readiness" aria-label="AI 모델 연결 준비">
    <div className="vm-section-heading"><h2>AI 모델 연결 준비</h2><span>Codex CLI</span></div>
    <p className="vm-help">로컬 실행 파일과 설정만 확인합니다. CLI 로그인, 실제 모델 접속과 응답 품질은 아직 검증하지 않았습니다.</p>
    <div className="vm-tools"><button type="button" disabled={shown.loading} onClick={()=>setRefresh(value=>value+1)}>설정 상태 다시 확인</button></div>
    {shown.loading?<p role="status">AI 설정 확인 중…</p>:null}
    {shown.error?<p role="alert">{shown.error}</p>:null}
    {checks?<><p role="status">{shown.status?.ready?'설정 형식 확인 · 연결 미검증':'설정 필요 · 연결 미검증'}</p>
      <ul>
        <li>기능 사용 설정: {checks.enabled?'형식 확인':'설정 필요'}</li>
        <li>Codex CLI 실행 파일: {checks.cliAvailable?'발견':'설치 또는 경로 설정 필요'}</li>
        <li>모델 설정: {checks.modelConfigured?'형식 확인 (기본 모델 허용)':'설정 확인 필요'}</li>
      </ul></>:null}
    <p className="vm-help">서버 컴퓨터에 Codex CLI를 설치하고 터미널에서 codex login으로 로그인하세요. 서버 실행 환경에서 아래 이름을 설정한 뒤 서버를 재시작하세요. 실행 파일이 PATH에 있다면 경로를 생략할 수 있습니다. 모델도 생략하면 CLI의 기본 모델을 사용합니다.</p>
    <pre>VISUALMAKER_AI_ENABLED=0{'\n'}VISUALMAKER_CODEX_CLI_PATH={'\n'}VISUALMAKER_AI_MODEL=</pre>
    <p className="vm-help">모델을 직접 지정할 때는 codex/모델이름 형식을 사용하세요. <a href="https://developers.openai.com/codex/noninteractive" target="_blank" rel="noopener noreferrer">Codex CLI 실행 안내</a>에서 설치와 비대화형 실행을 확인할 수 있습니다.</p>
    <p className="vm-help">설정 확인에서는 로그인 토큰을 읽거나 외부 모델에 접속하지 않습니다. AI 분석 실행 시 대본은 로그인한 계정의 모델 서비스로 전송되며 계정 사용량이나 비용이 발생할 수 있습니다.</p>
    <p className="vm-help">AI 대본 분석은 별도 전송 및 비용 동의 후 실행합니다. 이 상태 확인은 외부 모델을 호출하지 않으며 제작 승인도 부여하지 않습니다.</p>
  </section>;
}
