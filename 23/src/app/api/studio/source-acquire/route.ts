import {guard,failure,readJson} from '../../../../../visualmaker/core/http.ts';
import {acquireLiveSource} from '../../../../../visualmaker/core/live-source.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,12_000);
    const keys=['projectId','baseRevision','requirementId','provider','query','page','mediaType','providerId','metadataSha256','semanticNote','evidenceOnly'];
    if(Object.keys(body).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(body,key)))throw new StoreError('자료 수집 요청 필드가 올바르지 않습니다.');
    return Response.json(await acquireLiveSource(body as Parameters<typeof acquireLiveSource>[0],{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('자료 수집에 실패했습니다.',502));}
}
