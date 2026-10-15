import {guard, failure, readJson} from '../../../../../visualmaker/core/http';
import {importArchiveCandidate} from '../../../../../visualmaker/core/archive-candidates';
import {reviewStates} from '../../../../../visualmaker/core/director';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    guard(request);
    const result=await importArchiveCandidate(await readJson(request,16_000));
    return Response.json({...result,sourceReviewStates:reviewStates(result.plan)});
  }catch(error){return failure(error);}
}
