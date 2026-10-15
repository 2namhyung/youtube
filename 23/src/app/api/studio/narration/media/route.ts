import {guard, failure} from '../../../../../../visualmaker/core/http';
import {readNarrationTake} from '../../../../../../visualmaker/core/narration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    guard(request);
    const query = new URL(request.url).searchParams;
    const {take, bytes} = readNarrationTake(query.get('id') ?? '', query.get('takeId') ?? '');
    const common = {'Content-Type':take.mimeType, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox", 'Accept-Ranges':'bytes'};
    const range = request.headers.get('range');
    if (!range) return new Response(bytes, {headers:{...common, 'Content-Length':String(bytes.length)}});
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start: number; let end: number;
    if (match && (match[1] || match[2])) {
      if (!match[1]) {
        const suffix = Number(match[2]);
        start = Number.isSafeInteger(suffix) && suffix > 0 ? Math.max(0, bytes.length - suffix) : bytes.length;
        end = bytes.length - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : bytes.length - 1;
        end = Math.min(end, bytes.length - 1);
      }
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < bytes.length)
        return new Response(bytes.subarray(start, end + 1), {status:206,
          headers:{...common, 'Content-Range':`bytes ${start}-${end}/${bytes.length}`, 'Content-Length':String(end - start + 1)}});
    }
    return new Response(null, {status:416, headers:{...common, 'Content-Range':`bytes */${bytes.length}`}});
  } catch (error) { return failure(error); }
}
