import {guard,failure,readJson} from '../../../../../visualmaker/core/http.ts';
import {searchWiseSources} from '../../../../../visualmaker/core/wise-bridge.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,3_000);
    const keys=['projectId','baseRevision','requirementId','scriptSha256','query'];
    if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))throw new StoreError('WISE 검색 요청 필드가 올바르지 않습니다.');
    return Response.json(await searchWiseSources(body as Parameters<typeof searchWiseSources>[0],{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('WISE 자료를 검색하지 못했습니다.',502));}
}
