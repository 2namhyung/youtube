'use server';

import { revalidatePath } from 'next/cache';
import { deleteRecord as deleteRecordDb, insertRecord, updateRecord, updateRecordPosition, type RecordInput } from '@/lib/db';
import { transitionReview } from '@/lib/graph';
import { syncAssemblyRoster } from '@/lib/roster';
import { syncAssemblyMemberPhotos } from '@/lib/assembly-media';
import { syncPexelsMedia } from '@/lib/pexels-media';
import { syncLocMedia, syncNasaMedia, syncWikimediaMedia } from '@/lib/keyless-media';
import { syncLocVideo, syncNasaVideo, syncWikimediaVideo } from '@/lib/keyless-video';
import { syncKoglMedia } from '@/lib/kogl-media';
import { syncDigitalCulture } from '@/lib/digital-culture';
import { runEp001KoreanRoute, type KoreanRouteMode } from '@/lib/ep001-korean-routes';
import { syncAssemblyMinutes } from '@/lib/assembly-minutes';
import { startIngestRun } from '@/lib/sources';
import { buildNamInsunPilot } from '@/lib/pilot';
import { collectAssemblyBills, collectComplaintSignals, collectLawmakingPolicies } from '@/lib/policy-collector';

const MAX = { title: 160, body: 8000, type: 40, date: 40, sourceTitle: 240, sourceUrl: 2000, publisher: 160, publishedAt: 40, license: 160, status: 40, note: 2000 };

function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string') throw new Error(`${label}을(를) 입력해 주세요.`);
  const next = value.trim();
  if (next.length > max) throw new Error(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return next;
}

function clean(input: RecordInput): RecordInput {
  if (!input || typeof input !== 'object') throw new Error('카드 입력값이 올바르지 않습니다.');
  if (!Number.isSafeInteger(input.politicianId) || input.politicianId < 1) throw new Error('인물 ID가 올바르지 않습니다.');
  const sourceUrl = text(input.sourceUrl, '출처 URL', MAX.sourceUrl);
  if (sourceUrl && !/^https?:\/\/[^\s]+$/i.test(sourceUrl)) throw new Error('출처 URL은 http(s) 주소만 사용할 수 있습니다.');
  if (!/^#[\da-f]{6}$/i.test(input.color)) throw new Error('카드 색상이 올바르지 않습니다.');
  const positionX = input.positionX === undefined ? undefined : input.positionX;
  const positionY = input.positionY === undefined ? undefined : input.positionY;
  if (positionX !== undefined && (!Number.isFinite(positionX) || positionX < 0 || positionX > 1400)) throw new Error('카드 X 위치가 올바르지 않습니다.');
  if (positionY !== undefined && (!Number.isFinite(positionY) || positionY < 0 || positionY > 800)) throw new Error('카드 Y 위치가 올바르지 않습니다.');
  return {
    politicianId: input.politicianId,
    title: text(input.title, '카드 제목', MAX.title),
    body: text(input.body, '내용', MAX.body),
    type: text(input.type, '분류', MAX.type),
    eventDate: text(input.eventDate, '기준일', MAX.date),
    color: input.color,
    sourceTitle: text(input.sourceTitle, '출처 제목', MAX.sourceTitle),
    sourceUrl,
    publisher: text(input.publisher, '발행처', MAX.publisher),
    publishedAt: text(input.publishedAt, '발행일', MAX.publishedAt),
    license: text(input.license, '라이선스', MAX.license),
    verificationStatus: text(input.verificationStatus, '검증 상태', MAX.status),
    sourceNote: text(input.sourceNote, '출처 메모', MAX.note),
    positionX,
    positionY,
  };
}

export async function createRecord(input: RecordInput) {
  const record = insertRecord(clean(input));
  revalidatePath('/');
  return record;
}

export async function editRecord(id: number, input: RecordInput) {
  updateRecord(id, clean(input));
  revalidatePath('/');
}

export async function removeRecord(id: number) {
  deleteRecordDb(id);
  revalidatePath('/');
}

export async function saveRecordPosition(id: number, x: number, y: number) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1400 || y < 0 || y > 800) throw new Error('카드 위치가 올바르지 않습니다.');
  updateRecordPosition(id, x, y);
  revalidatePath('/');
}

export async function reviewItem(id: number, state: 'approved' | 'hold' | 'rejected', note: string) {
  if (!['approved', 'hold', 'rejected'].includes(state)) throw new Error('검토 상태가 올바르지 않습니다.');
  if (typeof note !== 'string' || note.length > 2000) throw new Error('검토 메모는 2,000자 이하로 입력해 주세요.');
  transitionReview(id, state, note);
  revalidatePath('/review'); revalidatePath('/graph');
}

export async function reviewQueueForm(formData: FormData) {
  const id = Number(formData.get('id'));
  const state = formData.get('state');
  const note = formData.get('note');
  if (!['approved', 'hold', 'rejected'].includes(String(state))) throw new Error('검토 상태가 올바르지 않습니다.');
  await reviewItem(id, String(state) as 'approved' | 'hold' | 'rejected', typeof note === 'string' ? note : '');
}

export async function runAssemblyRosterSync() {
  const result = await syncAssemblyRoster();
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runAssemblyRosterSyncAction(_formData: FormData) {
  await runAssemblyRosterSync();
}

export async function runAssemblyMediaBatch() {
  const result = await syncAssemblyMemberPhotos({ batchSize: 10 });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runAssemblyMediaBatchAction(_formData: FormData) {
  await runAssemblyMediaBatch();
}

export async function runPexelsPhotoBatch() {
  const result = await syncPexelsMedia({ mediaType: 'photo', query: '서울 일상', batchSize: 3 });
  revalidatePath('/sources');
  return result;
}

export async function runPexelsPhotoBatchAction(_formData: FormData) {
  await runPexelsPhotoBatch();
}

export async function runPexelsVideoBatch() {
  const result = await syncPexelsMedia({ mediaType: 'video', query: '서울 일상', batchSize: 2 });
  revalidatePath('/sources');
  return result;
}

export async function runPexelsVideoBatchAction(_formData: FormData) {
  await runPexelsVideoBatch();
}

export async function runWikimediaBatch() {
  const result = await syncWikimediaMedia({ query: 'Seoul', batchSize: 2 });
  revalidatePath('/sources');
  return result;
}

export async function runWikimediaBatchAction(_formData: FormData) {
  await runWikimediaBatch();
}

export async function runNasaBatch() {
  const result = await syncNasaMedia({ query: 'Earth', batchSize: 2 });
  revalidatePath('/sources');
  return result;
}

export async function runNasaBatchAction(_formData: FormData) {
  await runNasaBatch();
}

export async function runLocBatch() {
  const result = await syncLocMedia({ query: 'Seoul', batchSize: 2 });
  revalidatePath('/sources');
  return result;
}

export async function runLocBatchAction(_formData: FormData) {
  await runLocBatch();
}

export async function runWikimediaVideoBatch() {
  const result = await syncWikimediaVideo({ query: 'Seoul', batchSize: 1 });
  revalidatePath('/sources');
  return result;
}

export async function runWikimediaVideoBatchAction(_formData: FormData) {
  await runWikimediaVideoBatch();
}

export async function runNasaVideoBatch() {
  const result = await syncNasaVideo({ query: 'Earth', batchSize: 1 });
  revalidatePath('/sources');
  return result;
}

export async function runNasaVideoBatchAction(_formData: FormData) {
  await runNasaVideoBatch();
}

export async function runLocVideoBatch() {
  const result = await syncLocVideo({ query: 'trailer', batchSize: 1 });
  revalidatePath('/sources');
  return result;
}

export async function runLocVideoBatchAction(_formData: FormData) {
  await runLocVideoBatch();
}

export async function runKoglPhotoBatch() {
  const result = await syncKoglMedia({ batchSize: 1, mediaType: 'photo', query: '국회' });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runKoglPhotoBatchAction(_formData: FormData) {
  await runKoglPhotoBatch();
}

export async function runKoglVideoBatch() {
  const result = await syncKoglMedia({ batchSize: 1, mediaType: 'video', query: '경찰' });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runKoglVideoBatchAction(_formData: FormData) {
  await runKoglVideoBatch();
}

/** Backward-compatible alias for callers that used the original generic action. */
export async function runKoglMediaBatch() {
  return runKoglPhotoBatch();
}

export async function runKoglMediaBatchAction(_formData: FormData) {
  await runKoglPhotoBatch();
}

export async function runDigitalCultureBatch() {
  const result = await syncDigitalCulture({ numOfRows: 10 });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runDigitalCultureBatchAction(_formData: FormData) {
  await runDigitalCultureBatch();
}

export async function runEp001KoreanRouteAction(formData: FormData) {
  const routeId = formData.get('routeId');
  const mode = formData.get('mode');
  if (typeof routeId !== 'string' || routeId.length > 100 || typeof mode !== 'string' || !['dry-run', 'search', 'acquire', 'manual-registration'].includes(mode)) throw new Error('EP001 한국 미디어 route 입력이 올바르지 않습니다.');
  await runEp001KoreanRoute(routeId, mode as KoreanRouteMode);
  revalidatePath('/sources'); revalidatePath('/review');
}

export async function runAssemblyPlenaryMinutesBatch() {
  const result = await syncAssemblyMinutes({ kind: 'plenary', year: new Date().getFullYear(), meetingLimit: 1 });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runAssemblyPlenaryMinutesBatchAction(_formData: FormData) {
  await runAssemblyPlenaryMinutesBatch();
}

export async function runAssemblyCommitteeMinutesBatch() {
  const result = await syncAssemblyMinutes({ kind: 'committee', year: new Date().getFullYear(), meetingLimit: 1 });
  revalidatePath('/sources'); revalidatePath('/review');
  return result;
}

export async function runAssemblyCommitteeMinutesBatchAction(_formData: FormData) {
  await runAssemblyCommitteeMinutesBatch();
}

export async function runSourceDryRun(input: FormData | string) {
  const slug = typeof input === 'string' ? input : input.get('slug');
  if (typeof slug !== 'string' || !slug.trim()) throw new Error('수집원 식별자가 올바르지 않습니다.');
  const runId = startIngestRun(slug, 'dry_run', 'blocked', 'fixture 또는 API 키를 준비한 뒤 실행하세요.');
  revalidatePath('/sources');
  return { runId, status: 'blocked' as const };
}

export async function runSourceDryRunAction(formData: FormData) {
  await runSourceDryRun(formData);
}

export async function runNamInsunPilot() {
  const result = await buildNamInsunPilot();
  revalidatePath('/'); revalidatePath('/sources'); revalidatePath('/review'); revalidatePath('/graph');
  return result;
}

export async function runNamInsunPilotAction(_formData: FormData) {
  await runNamInsunPilot();
}

export async function runPolicyCollection() {
  const result = await collectLawmakingPolicies();
  revalidatePath('/issues'); revalidatePath('/sources');
  return result;
}

export async function runPolicyCollectionAction(_formData: FormData) {
  await runPolicyCollection();
}

export async function runComplaintCollection() {
  const result = await collectComplaintSignals();
  revalidatePath('/issues'); revalidatePath('/sources');
  return result;
}

export async function runComplaintCollectionAction(_formData: FormData) {
  await runComplaintCollection();
}

export async function runAssemblyBillsCollection() {
  const result = await collectAssemblyBills();
  revalidatePath('/issues'); revalidatePath('/sources');
  return result;
}

export async function runAssemblyBillsCollectionAction(_formData: FormData) {
  await runAssemblyBillsCollection();
}
