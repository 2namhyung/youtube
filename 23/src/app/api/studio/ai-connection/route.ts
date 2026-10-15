import {guard} from '../../../../../visualmaker/core/http.ts';
import {aiConnectionStatus} from '../../../../../visualmaker/core/ai-connection.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export async function GET(request:Request){
  try{
    guard(request);
    if(new URL(request.url).search)throw new StoreError('AI 연결 상태 조회 옵션이 올바르지 않습니다.');
    const status=aiConnectionStatus({
      enabled:process.env.VISUALMAKER_AI_ENABLED,
      cliPath:process.env.VISUALMAKER_CODEX_CLI_PATH,
      modelId:process.env.VISUALMAKER_AI_MODEL
    });
    return Response.json(status,{headers});
  }catch(error){
    const code=error instanceof StoreError&&error.status===403?403:error instanceof StoreError&&error.status===400?400:500;
    return Response.json({error:'AI 연결 상태를 확인할 수 없습니다.'},{status:code,headers});
  }
}
