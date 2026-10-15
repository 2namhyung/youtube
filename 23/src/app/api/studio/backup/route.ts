import {guard} from '../../../../../visualmaker/core/http.ts';
import {BACKUP_LIMITS,exportProjectBackup,restoreProjectBackup} from '../../../../../visualmaker/core/backup.ts';
import {ContractError} from '../../../../../visualmaker/core/director.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function errorReply(error:unknown){
  const status=error instanceof StoreError||error instanceof ContractError?error.status:500;
  const safe:{[key:number]:string}={400:'백업 요청 또는 ZIP 형식이 올바르지 않습니다.',403:'이 작업을 사용할 권한이 없습니다.',
    404:'프로젝트 또는 백업 입력을 찾을 수 없습니다.',409:'프로젝트나 백업 입력이 변경되었거나 충돌합니다.',
    413:'백업 크기 제한을 넘었습니다.',423:'잠긴 작업을 변경할 수 없습니다.'};
  const code=Object.hasOwn(safe,status)?status:500;
  return Response.json({error:safe[code]??'백업 요청을 처리할 수 없습니다.'},{status:code,headers});
}
export async function GET(request:Request){
  try{
    guard(request);
    const url=new URL(request.url);
    if(url.searchParams.size!==2||[...url.searchParams.keys()].some(key=>!['projectId','baseRevision'].includes(key))||
      url.searchParams.getAll('projectId').length!==1||url.searchParams.getAll('baseRevision').length!==1)throw new StoreError('프로젝트와 버전만 지정하세요.');
    const projectId=url.searchParams.get('projectId')!,revisionText=url.searchParams.get('baseRevision')!;
    if(!/^[-a-zA-Z0-9_]{1,200}$/.test(projectId)||!/^[1-9][0-9]{0,8}$/.test(revisionText))throw new StoreError('프로젝트와 버전을 확인하세요.');
    const {bytes,filename}=exportProjectBackup(projectId,Number(revisionText));
    return new Response(new Uint8Array(bytes),{status:200,headers:{...headers,'Content-Type':'application/zip','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${filename}"`}});
  }catch(error){return errorReply(error);}
}
export async function POST(request:Request){
  try{
    guard(request);
    if(new URL(request.url).search||request.headers.get('x-visualmaker-restore-copy')!=='1'||
      request.headers.get('content-type')?.toLowerCase()!=='application/zip')throw new StoreError('새 사본 복원 확인과 ZIP 형식을 확인하세요.');
    const sizeHeader=request.headers.get('content-length');
    if(sizeHeader&&(!/^[0-9]+$/.test(sizeHeader)||Number(sizeHeader)>BACKUP_LIMITS.archive))throw new StoreError('백업 ZIP이 허용 크기를 넘었습니다.',413);
    const reader=request.body?.getReader();if(!reader)throw new StoreError('백업 ZIP이 비었습니다.');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>BACKUP_LIMITS.archive){await reader.cancel();throw new StoreError('백업 ZIP이 허용 크기를 넘었습니다.',413);}chunks.push(value);}
    const result=await restoreProjectBackup(Buffer.concat(chunks,size));
    return Response.json(result,{status:201,headers});
  }catch(error){return errorReply(error);}
}
