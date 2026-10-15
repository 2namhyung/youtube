import {guard,failure,readJson} from '../../../../../visualmaker/core/http.ts';
import {acquireYouTubeSource} from '../../../../../visualmaker/core/youtube-source.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,9_000);
    const keys=['projectId','baseRevision','requirementId','scriptSha256','url','metadataSha256','semanticNote','evidenceOnly'];
    if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))throw new StoreError('YouTube 수집 요청 필드가 올바르지 않습니다.');
    return Response.json(await acquireYouTubeSource(body as Parameters<typeof acquireYouTubeSource>[0],{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('YouTube 영상을 수집하지 못했습니다.',502));}
}
