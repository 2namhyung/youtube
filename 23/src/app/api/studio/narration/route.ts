import {guard, failure} from '../../../../../visualmaker/core/http';
import {attachNarrationUpload, MAX_NARRATION_REQUEST_BYTES} from '../../../../../visualmaker/core/narration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    guard(request);
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_NARRATION_REQUEST_BYTES)
      return Response.json({error:'녹음 파일은 40MB 이하여야 합니다.'}, {status:413});
    const reader = request.body?.getReader();
    if (!reader) return Response.json({error:'녹음 파일을 선택하세요.'}, {status:400});
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_NARRATION_REQUEST_BYTES) {
        await reader.cancel();
        return Response.json({error:'녹음 파일은 40MB 이하여야 합니다.'}, {status:413});
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({error:'녹음 파일을 선택하세요.'}, {status:400});
    const result = attachNarrationUpload(String(form.get('id') ?? ''), Number(form.get('baseRevision')),
      String(form.get('scriptSha256') ?? ''), file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json(result, {status:201, headers:{'Cache-Control':'no-store'}});
  } catch (error) { return failure(error); }
}
