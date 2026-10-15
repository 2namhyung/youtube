'use client';

import {useEffect,useRef,useState} from 'react';
import type {BackupScope,RestoredBackup} from './backup-client';
import {downloadProjectBackup,MAX_BACKUP_BYTES,restoreProjectBackup,sameBackupScope} from './backup-client';

type Props={scope:BackupScope;currentScope:()=>BackupScope;busy:boolean;beginMutation:()=>null|(()=>void);
  onRestored:(result:RestoredBackup,scope:BackupScope)=>Promise<'installed'|'saved-warning'|'scope-changed'>};
export default function BackupPanel({scope,currentScope,busy,beginMutation,onRestored}:Props){
  const [file,setFile]=useState<File|null>(null),[ack,setAck]=useState(false),[pending,setPending]=useState<'download'|'restore'|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[summary,setSummary]=useState<RestoredBackup['summary']|null>(null);
  const controllers=useRef(new Set<AbortController>()),urls=useRef(new Set<string>()),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const controller of controllers.current)controller.abort();
    for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();};},[]);
  useEffect(()=>()=>{for(const controller of controllers.current)controller.abort();},
    [scope.projectId,scope.revision,scope.scriptSha256,scope.token]);
  function capture(){const release=beginMutation();if(!release)return null;setError('');setNotice('');setSummary(null);return release;}
  async function download(){if(!scope.projectId||busy||pending)return;const release=capture();if(!release)return;
    const started={...scope},controller=new AbortController();controllers.current.add(controller);setPending('download');
    try{const result=await downloadProjectBackup(started,currentScope,controller.signal);
      if(!result||!mounted.current||!sameBackupScope(started,currentScope()))return;
      const url=URL.createObjectURL(result.blob);urls.current.add(url);
      try{const link=document.createElement('a');link.href=url;link.download=result.filename;link.click();
        setNotice('ZIP 다운로드를 시작했습니다. 브라우저의 저장 상태를 확인하세요.');
      }finally{window.setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1000);}
    }catch(cause){if(mounted.current&&!controller.signal.aborted)setError(cause instanceof Error&&cause.message.startsWith('프로젝트 리비전이 바뀌었습니다.')?
      '프로젝트 리비전이 바뀌었습니다. 최신 내용을 불러오세요.':'백업 ZIP 다운로드에 실패했습니다. 현재 프로젝트 리비전을 확인하세요.');}
    finally{controllers.current.delete(controller);if(mounted.current)setPending(null);release();}
  }
  async function restore(){if(!file||!ack||busy||pending)return;const release=capture();if(!release)return;
    const selected=file,started={...scope},controller=new AbortController();controllers.current.add(controller);setPending('restore');
    try{
      if(!/^.+\.zip$/iu.test(selected.name)||selected.size<1||selected.size>MAX_BACKUP_BYTES){setError('128 MiB 이하의 ZIP 파일 하나를 선택하세요.');return;}
      const result=await restoreProjectBackup(selected,started,currentScope,controller.signal);
      if(!result||!mounted.current){if(mounted.current)setNotice('프로젝트 목록을 새로고침해 새 사본이 있는지 확인하세요.');return;}
      setSummary(result.summary);setAck(false);setFile(null);
      const installed=await onRestored(result,started);
      if(!mounted.current)return;
      setNotice(installed==='installed'?'새 계획 사본을 저장하고 열었습니다. 자료와 제작 승인은 다시 검토하세요.':
        installed==='saved-warning'?'새 계획 사본은 저장됐습니다. 목록 갱신에 실패했으니 프로젝트 목록을 다시 확인하세요.':
          '새 계획 사본은 저장됐습니다. 화면이 바뀌어 자동으로 열지 않았으니 목록을 새로고침해 확인하세요.');
    }catch(cause){if(mounted.current&&!controller.signal.aborted)setError(cause instanceof Error&&cause.message==='ZIP 크기 제한을 넘었습니다.'?
      'ZIP 크기 제한을 넘었습니다.':
      '복원 결과를 확인하지 못했습니다. 프로젝트 목록을 새로고침해 새 사본이 있는지 확인한 뒤 재시도하세요.');}
    finally{controllers.current.delete(controller);if(mounted.current)setPending(null);release();}
  }
  return <section className="vm-backup" aria-labelledby="vm-backup-title">
    <div className="vm-backup-heading"><div><span className="vm-eyebrow">PORTABLE BACKUP</span><h2 id="vm-backup-title">프로젝트 ZIP 백업과 새 사본 복원</h2></div>
      <button type="button" disabled={busy||!!pending||!scope.projectId} onClick={()=>void download()}>현재 프로젝트 ZIP 받기</button></div>
    <p>현재 계획과 연결된 로컬 자료·녹음을 담습니다. 전체 데이터베이스, 작업 이력, 생성 영상이나 PC 전체 백업은 포함하지 않습니다.</p>
    <p className="vm-help">제한: ZIP 128 MiB · 내용물 120 MiB · 항목 512개 · 개별 미디어 50 MiB · 계획 3 MiB · 영수증/목록 256 KiB</p>
    <div className="vm-backup-restore"><strong>ZIP으로 새 계획 사본 만들기</strong><p>기존 프로젝트는 덮어쓰지 않습니다. 방향 잠금, 대본 이력과 미디어는 보존됩니다. 자료 검토 승인, 에피소드 연결, AI 반영 출처, 수동 타이밍 확인은 해제됩니다.</p>
      <label>복원할 프로젝트 ZIP<input type="file" accept=".zip,application/zip" disabled={busy||!!pending} onChange={event=>{
        const selected=event.currentTarget.files?.[0]??null;setFile(selected);setAck(false);
        setError(selected&&(!/^.+\.zip$/iu.test(selected.name)||selected.size<1||selected.size>MAX_BACKUP_BYTES)?
          '128 MiB 이하의 ZIP 파일 하나를 선택하세요.':'');setNotice('');setSummary(null);
        event.currentTarget.value='';
      }}/></label>
      {file?<p className="vm-help">선택: {file.name} ({(file.size/1024/1024).toFixed(2)} MiB)</p>:null}
      <label className="vm-backup-ack"><input type="checkbox" checked={ack} disabled={busy||!!pending||!file||file.size<1||file.size>MAX_BACKUP_BYTES||!/^.+\.zip$/iu.test(file.name)}
        onChange={event=>setAck(event.target.checked)}/> 새 사본을 만들고 위 검토·연결 기록이 해제되는 것을 확인했습니다.</label>
      <button type="button" disabled={busy||!!pending||!file||!ack} onClick={()=>void restore()}>새 사본 복원</button></div>
    {pending?<p role="status">{pending==='download'?'프로젝트 ZIP을 확인하고 있습니다…':'ZIP을 검증해 새 계획 사본을 만들고 있습니다…'}</p>:null}
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {summary?<p role="status">원본 리비전 {summary.sourceRevision} · 자료 {summary.assets}개 · 녹음 {summary.recordings}개 · 시간 초안 {summary.timingDrafts}개를 가져왔습니다. 자료 검토 {summary.clearedSourceReviews}건, AI 반영 기록 {summary.clearedAIAdoption}건을 해제했습니다.</p>:null}
  </section>;
}
