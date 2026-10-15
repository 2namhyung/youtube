import {guard,failure} from '../../../../../visualmaker/core/http.ts';
import {searchLiveSources} from '../../../../../visualmaker/core/live-source.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    guard(request);const params=new URL(request.url).searchParams;
    const keys=['projectId','baseRevision','requirementId','provider','query','page','mediaType'];
    if([...params.keys()].some(key=>!keys.includes(key))||keys.some(key=>params.getAll(key).length!==1))throw new StoreError('자료 탐색 요청 필드가 올바르지 않습니다.');
    const baseRevision=Number(params.get('baseRevision')),page=Number(params.get('page'));
    return Response.json(await searchLiveSources({projectId:params.get('projectId'),baseRevision,requirementId:params.get('requirementId'),provider:params.get('provider'),query:params.get('query'),page,mediaType:params.get('mediaType')},{signal:request.signal}));
  }catch(error){return failure(error instanceof StoreError?error:new StoreError('자료 탐색에 실패했습니다.',502));}
}
