import {guard, failure} from '../../../../../visualmaker/core/http';
import {attachUpload} from '../../../../../visualmaker/core/upload';
import {reviewStates} from '../../../../../visualmaker/core/director';

export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    guard(request);
    // Read through a bounded stream before parsing multipart data.
    const reader=request.body?.getReader(); if(!reader) throw new Error('파일이 없습니다.');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>40_100_000){await reader.cancel();return Response.json({error:'40MB 이하 파일을 선택하세요.'},{status:413});}chunks.push(value);}
    const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
    const file=form.get('file');if(!(file instanceof File))throw new Error('파일을 선택하세요.');
    const fields=Object.fromEntries(['sourceUrl','creator','rightsNote','semanticNote','evidenceOnly'].map(k=>[k,String(form.get(k)||'')]));
    const plan=await attachUpload(String(form.get('id')),Number(form.get('baseRevision')),String(form.get('requirementId')),Buffer.from(await file.arrayBuffer()),{...fields,originalName:file.name});
    return Response.json({plan,sourceReviewStates:reviewStates(plan)});
  }catch(error){return failure(error);}
}
