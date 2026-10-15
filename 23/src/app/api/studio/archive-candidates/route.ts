import {guard, failure} from '../../../../../visualmaker/core/http';
import {listArchiveCandidates} from '../../../../../visualmaker/core/archive-candidates';

export const runtime='nodejs';
export async function GET(request:Request){
  try{
    guard(request);
    const params=new URL(request.url).searchParams;
    return Response.json(listArchiveCandidates({id:params.get('id'),baseRevision:params.get('baseRevision'),
      requirementId:params.get('requirementId'),q:params.get('q')??'',cursor:params.get('cursor')??''}));
  }catch(error){return failure(error);}
}
