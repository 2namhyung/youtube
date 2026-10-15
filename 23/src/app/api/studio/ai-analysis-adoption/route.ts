import {guard,readJson} from '../../../../../visualmaker/core/http.ts';
import {adoptAIAnalysis} from '../../../../../visualmaker/core/ai-analysis-adoption.ts';
import {ContractError} from '../../../../../visualmaker/core/director.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){try{
  guard(request);
  if(new URL(request.url).search)throw new StoreError('조회 옵션을 사용할 수 없습니다.');
  const body=await readJson(request,65_536);
  return reply(adoptAIAnalysis(body as Parameters<typeof adoptAIAnalysis>[0]));
}catch(error){
  const status=error instanceof StoreError||error instanceof ContractError?error.status:500;
  return reply({error:'AI 제안 반영을 완료하지 못했습니다. 요청 범위와 최신 계획을 확인하세요.'},[400,403,404,409,413,423].includes(status)?status:500);
}}
