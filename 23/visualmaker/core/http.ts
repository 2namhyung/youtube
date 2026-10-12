import {randomBytes, timingSafeEqual} from 'node:crypto';
import {StoreError} from './store.ts';

const state = globalThis as typeof globalThis & {visualmakerToken?: string};
export function studioToken() { return state.visualmakerToken ??= randomBytes(32).toString('hex'); }
export function isLocalHost(host: string) { return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host); }

export function guard(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  if (!isLocalHost(host) || !isLocalHost(url.host)) throw new StoreError('로컬 PC에서만 사용할 수 있습니다.', 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== `${url.protocol}//${host}`) throw new StoreError('다른 사이트의 요청은 허용하지 않습니다.', 403);
  const token = request.headers.get('x-visualmaker-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(studioToken()))) throw new StoreError('작업 화면을 새로고침해 연결을 갱신하세요.', 403);
}

export async function readJson(request: Request, max = 3_000_000): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new StoreError('요청 본문이 없습니다.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new StoreError('요청 파일이 너무 큽니다.', 413); }
    chunks.push(value);
  }
  try { const obj = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(); return obj; }
  catch { throw new StoreError('올바른 JSON 객체가 필요합니다.'); }
}

export function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 400;
  return Response.json({error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'}, {status});
}
