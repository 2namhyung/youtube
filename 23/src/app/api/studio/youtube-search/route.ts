import {guard,failure,readJson} from '../../../../../visualmaker/core/http.ts';
import {searchYouTubeSources} from '../../../../../visualmaker/core/youtube-discovery.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,3_000);
    const keys=['projectId','baseRevision','requirementId','scriptSha256','query'];
    if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))throw new StoreError('YouTube 검색 요청 필드가 올바르지 않습니다.');
    return Response.json(await searchYouTubeSources(body as Parameters<typeof searchYouTubeSources>[0],{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('YouTube 영상을 검색하지 못했습니다.',502));}
}
