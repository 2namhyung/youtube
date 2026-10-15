import {guard,failure,readJson} from '../../../../../visualmaker/core/http.ts';
import {importWiseSource} from '../../../../../visualmaker/core/wise-bridge.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,6_000);
    const keys=['projectId','baseRevision','requirementId','scriptSha256','sourceId','wiseMediaId','sha256','metadataSha256',
      'selectedSpan','selectionToken','semanticNote','evidenceOnly'];
    if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))throw new StoreError('WISE 등록 요청 필드가 올바르지 않습니다.');
    return Response.json(await importWiseSource(body as Parameters<typeof importWiseSource>[0],{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('WISE 원본을 등록하지 못했습니다.',502));}
}
