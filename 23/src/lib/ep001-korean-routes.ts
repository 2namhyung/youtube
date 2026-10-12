import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { syncAssemblyMemberPhotos } from './assembly-media.ts';
import { syncDigitalCulture } from './digital-culture.ts';
import { syncKoglMedia } from './kogl-media.ts';
import { syncLocMedia, syncWikimediaMedia } from './keyless-media.ts';
import { syncPexelsMedia } from './pexels-media.ts';

export type KoreanRouteStatus = 'live-operational' | 'implemented-awaiting-key' | 'manual-intake-ready' | 'rights-contract-required';
export type KoreanRouteMode = 'status' | 'dry-run' | 'search' | 'acquire' | 'manual-registration';
export type KoreanRouteMediaType = 'photo' | 'video';
export type KoreanRouteRunOptions = { query?: string; page?: number; batchSize?: number; mediaType?: KoreanRouteMediaType };

export type KoreanMediaRoute = {
  id: string;
  label: string;
  priority: number;
  status: KoreanRouteStatus;
  modes: KoreanRouteMode[];
  sourceKind: 'official' | 'public' | 'domestic-media' | 'direct' | 'paid-stock' | 'fallback';
  hosts: string[];
  defaultQuery?: string;
  credential?: { environment: string; configured: boolean; scope: string };
  rights: string;
  semanticRole: string;
  blocker?: string;
};

const configured = (name: string) => Boolean(process.env[name]?.trim());

/**
 * The single route registry for EP001 source acquisition. A status is route readiness only:
 * it never grants rights review, semantic approval, materialization, or production authority.
 */
export function getEp001KoreanMediaRoutes(): KoreanMediaRoute[] {
  const assemblyKey = configured('ASSEMBLY_API_KEY');
  const cultureKey = configured('DATA_GO_KR_SERVICE_KEY');
  return [
    { id: 'assembly-member-photos', label: '국회 의원 사진', priority: 1, status: assemblyKey ? 'live-operational' : 'implemented-awaiting-key', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'official', hosts: ['open.assembly.go.kr', 'www.assembly.go.kr'], credential: { environment: 'ASSEMBLY_API_KEY', configured: assemblyKey, scope: '국회 Open API 의원정보·사진 응답' }, rights: '공식 원문·수집일·파일별 이용조건과 인물 맥락을 보존한다.', semanticRole: '국회·의정 활동 일반 맥락. 특정 회의·발언의 증거로 표기하지 않는다.', blocker: assemblyKey ? undefined : 'ASSEMBLY_API_KEY가 없어 수집을 시작하지 않는다.' },
    { id: 'assembly-image-attachments', label: '국회 이미지자료실·보도자료 첨부', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.assembly.go.kr', 'assembly.go.kr', 'img.assembly.go.kr'], rights: '첨부 파일별 이용조건·촬영자·행사명·게시 페이지를 기록하고, 공공 이용 허용을 확인하기 전에는 pending으로 둔다.', semanticRole: '국회 전경·본회의·위원회·기관행사 일반 맥락.', blocker: '공식 첨부 URL은 페이지별 구조가 달라 자동 일괄 다운로드하지 않는다. 허용 호스트와 원문 페이지를 가진 수동 등록만 허용한다.' },
    { id: 'kogl-photo', label: '공공누리(KOGL) 사진 CSV', priority: 1, status: 'live-operational', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'public', hosts: ['www.data.go.kr', 'www.kogl.or.kr'], defaultQuery: '국회', rights: 'CSV의 파일별 공공누리 유형·출처표시·제3자 권리를 item-level pending으로 보존한다.', semanticRole: '한국 기관·업무·생활 일반 맥락. 제목·원본파일명 쿼리 일치 항목만 수집한다.' },
    { id: 'kogl-video', label: '공공누리(KOGL) 영상 CSV', priority: 1, status: 'live-operational', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'public', hosts: ['www.data.go.kr', 'www.kogl.or.kr'], defaultQuery: '경찰', rights: 'CSV의 파일별 공공누리 유형·출처표시·제3자 권리를 item-level pending으로 보존한다.', semanticRole: '한국 기관·업무 일반 맥락. 제목·원본파일명 쿼리 일치 항목만 수집한다.' },
    { id: 'digital-culture-metadata', label: '디지털문화자원 API 메타데이터', priority: 1, status: cultureKey ? 'live-operational' : 'implemented-awaiting-key', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'public', hosts: ['apis.data.go.kr'], credential: { environment: 'DATA_GO_KR_SERVICE_KEY', configured: cultureKey, scope: 'B553457 디지털문화자원 메타데이터 API' }, rights: 'API 메타데이터는 발견용이다. thumb/original URL과 저작권 유형은 item-level 검토 전 production 사용 금지.', semanticRole: '한국 문화·기관 배경 자료 후보 발견.', blocker: cultureKey ? '현재 adapter는 메타데이터만 stage한다. 원본 URL이 있으면 허용 호스트·MIME·권리 검토 후 별도 수동 intake한다.' : 'DATA_GO_KR_SERVICE_KEY가 없어 메타데이터 호출을 시작하지 않는다.' },
    { id: 'national-archives-api', label: '국가기록원 사진·문화영화 API', priority: 1, status: 'implemented-awaiting-key', modes: ['status', 'dry-run', 'search'], sourceKind: 'public', hosts: ['www.archives.go.kr', 'theme.archives.go.kr', 'apis.data.go.kr'], credential: { environment: 'NATIONAL_ARCHIVES_API_KEY', configured: configured('NATIONAL_ARCHIVES_API_KEY'), scope: '국가기록원 대상 API 등록·권한' }, rights: '기록물별 공공누리·초상·제3자 권리를 확인한다.', semanticRole: '한국 공공기관·역사 영상/사진 맥락.', blocker: '국가기록원 대상 endpoint 등록과 전용 키가 확인되지 않아 probe/download를 실행하지 않는다. 범용 DATA_GO 키 존재만으로 권한을 가정하지 않는다.' },
    { id: 'national-police-official', label: '경찰청 공식 첨부', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.police.go.kr', 'police.go.kr'], rights: '페이지·첨부 파일의 재이용 조건, 사진·영상 속 인물·장소·행사 맥락을 기록한다.', semanticRole: '경찰서·업무·상담·문서 검토 일반 맥락.', blocker: '공식 게시물별 첨부와 이용조건이 달라 허용 원문 URL 기반의 수동 intake만 제공한다.' },
    { id: 'prosecution-official', label: '검찰청 공식 첨부', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.spo.go.kr', 'spo.go.kr'], rights: '페이지·첨부 파일별 재이용 조건과 문맥을 기록한다.', semanticRole: '검찰 기관·업무 일반 맥락.', blocker: '공식 게시물별 첨부와 이용조건이 달라 허용 원문 URL 기반의 수동 intake만 제공한다.' },
    { id: 'moj-official', label: '법무부 공식 첨부', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.moj.go.kr', 'moj.go.kr'], rights: '페이지·첨부 파일별 재이용 조건과 문맥을 기록한다.', semanticRole: '법무 행정·문서 업무 일반 맥락.', blocker: '공식 게시물별 첨부와 이용조건이 달라 허용 원문 URL 기반의 수동 intake만 제공한다.' },
    { id: 'policy-briefing-official', label: '정책브리핑 공식 페이지', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.korea.kr', 'korea.kr'], rights: '정책브리핑의 사진·영상 재이용 조건을 item-level로 확인한다. 제3자 저작물은 제외한다.', semanticRole: '정부 기관·브리핑 일반 맥락.', blocker: '페이지에 포함된 사진·영상의 권리자가 혼재할 수 있어 자동 추출하지 않는다.' },
    { id: 'ktv-official', label: 'KTV 공식 영상', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['www.ktv.go.kr', 'ktv.go.kr'], rights: '영상별 이용허락·음원·초상·제3자 권리를 item-level로 확인한다.', semanticRole: '한국 공공기관·생활 현장 일반 맥락.', blocker: '방송 영상의 항목별 재이용 범위를 확인해야 하므로 자동 다운로드하지 않는다.' },
    { id: 'e-briefing-official', label: 'e-브리핑 공식 영상', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'official', hosts: ['ebriefing.go.kr', 'www.ebriefing.go.kr'], rights: '영상별 이용허락·초상·제3자 권리를 item-level로 확인한다.', semanticRole: '정부 브리핑·기관 업무 일반 맥락.', blocker: '페이지별 영상 전달 URL과 재이용 조건을 확인해야 하므로 자동 다운로드하지 않는다.' },
    { id: 'yna-licensed', label: '연합뉴스 라이선스 수동 intake', priority: 2, status: 'rights-contract-required', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'domestic-media', hosts: ['www.yna.co.kr', 'yna.co.kr'], rights: '기사·사진·영상은 라이선스 계약 또는 명시 허락의 계약 식별자와 사용 범위를 기록해야 한다.', semanticRole: '한국 뉴스 현장 일반 맥락.', blocker: '무단 다운로드 금지. 메타데이터와 라이선스 증빙이 있는 수동 등록만 허용한다.' },
    { id: 'ytn-licensed', label: 'YTN 라이선스 수동 intake', priority: 2, status: 'rights-contract-required', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'domestic-media', hosts: ['www.ytn.co.kr', 'ytn.co.kr'], rights: '영상은 라이선스 계약 또는 명시 허락의 계약 식별자와 사용 범위를 기록해야 한다.', semanticRole: '한국 뉴스 현장 일반 맥락.', blocker: '무단 다운로드 금지. 메타데이터와 라이선스 증빙이 있는 수동 등록만 허용한다.' },
    { id: 'direct-shoot', label: '직접 촬영 로컬 등록', priority: 1, status: 'manual-intake-ready', modes: ['status', 'dry-run', 'manual-registration'], sourceKind: 'direct', hosts: [], rights: '촬영자·촬영일·장소 허가·출연자 동의·음원 권리와 원본 SHA-256을 기록한다.', semanticRole: '한국 생활 속 휴대전화·택배·상자 개봉·상담 등 일반 맥락.', blocker: '원본은 source-intake 전용 폴더에 보존한 뒤 template의 local path와 hash로 등록한다.' },
    { id: 'paid-stock', label: '유료 스톡 수동 intake', priority: 2, status: 'rights-contract-required', modes: ['status', 'dry-run', 'search', 'manual-registration'], sourceKind: 'paid-stock', hosts: ['artgrid.io', 'www.storyblocks.com'], rights: '구독/단품 라이선스, 프로젝트 사용 범위, 다운로드 영수증·asset ID·인물/상표 제한을 기록한다.', semanticRole: '한국 위치/장소 metadata가 명시된 일반 맥락 B-roll.', blocker: '로그인·구매·다운로드를 자동화하지 않는다. 계약 증빙 후 수동 등록만 허용한다.' },
    { id: 'wikimedia-korea-fallback', label: 'Wikimedia Commons 한국 위치 fallback', priority: 3, status: 'live-operational', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'fallback', hosts: ['commons.wikimedia.org', 'upload.wikimedia.org'], defaultQuery: 'National Assembly of the Republic of Korea', rights: '파일별 라이선스·저작자·원문 페이지·한국 위치 metadata를 확인한다.', semanticRole: '국내 공식/공공 route에 적합 원본이 없을 때만 한국 장소 metadata가 명시된 맥락 화면.', blocker: '국적·정체성을 외모에서 추정하지 않는다.' },
    { id: 'loc-korea-fallback', label: 'Library of Congress 한국 위치 fallback', priority: 3, status: 'live-operational', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'fallback', hosts: ['www.loc.gov', 'tile.loc.gov'], defaultQuery: 'Seoul Korea', rights: 'Rights and Access와 item-level location/rights를 확인한다.', semanticRole: '국내 route 공백 시 Seoul/Korea metadata가 명시된 역사·장소 맥락.', blocker: '현대 한국 정책의 직접 증거로 표기하지 않는다.' },
    { id: 'pexels-generic-last', label: 'Pexels 일반 스톡 최후 fallback', priority: 4, status: 'implemented-awaiting-key', modes: ['status', 'dry-run', 'search', 'acquire'], sourceKind: 'fallback', hosts: ['api.pexels.com', 'images.pexels.com', 'player.vimeo.com'], credential: { environment: 'PEXELS_API_KEY', configured: configured('PEXELS_API_KEY'), scope: 'Pexels Search API' }, rights: '콘텐츠별 Pexels 조건·인물·상표·음원 권리를 확인한다.', semanticRole: '한국 장소 metadata를 확인할 수 있을 때만 마지막 후보. generic foreign stock은 EP001 한국 맥락 대체재가 아니다.', blocker: configured('PEXELS_API_KEY') ? '국내/공공/국내매체 route가 먼저 검토되어야 한다.' : '현재 실행 환경에 PEXELS_API_KEY가 없어 수집을 시작하지 않는다. 과거 runtime token 사용은 현재 route readiness를 보장하지 않는다.' },
  ];
}

export function routeById(id: string) {
  return getEp001KoreanMediaRoutes().find((route) => route.id === id) ?? null;
}

export type ManualKoreanMediaRegistration = {
  routeId: string; sourceUrl: string; creatorOrShooter: string; publisherOrOwner: string; retrievedAt: string;
  rightsStatus: string; rightsEvidence: string; semanticRole: 'general-context-b-roll' | 'specific-event-evidence';
  specificEventEvidence: boolean; localOriginalPath: string; sha256: string; mimeType: string; durationOrDimensions: string;
  locationOrInstitutionMetadata: string; editorialLimits: string;
};

/** Validate a manual local-original registration before any review queue can consume it.
 * The caller retains the original byte file; this does not grant approval or copy it. */
export function validateManualKoreanMediaRegistration(input: ManualKoreanMediaRegistration, options: { intakeRoot?: string } = {}) {
  const route = routeById(input.routeId);
  if (!route || !route.modes.includes('manual-registration')) throw new Error('수동 등록을 지원하지 않는 route입니다.');
  const required = [input.creatorOrShooter, input.publisherOrOwner, input.retrievedAt, input.rightsStatus, input.localOriginalPath, input.sha256, input.mimeType, input.durationOrDimensions, input.locationOrInstitutionMetadata, input.editorialLimits];
  if (required.some((value) => typeof value !== 'string' || !value.trim())) throw new Error('수동 등록의 필수 provenance·rights·media metadata가 비어 있습니다.');
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('수동 등록 SHA-256 형식이 올바르지 않습니다.');
  if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(input.mimeType)) throw new Error('수동 등록 MIME은 image/* 또는 video/*여야 합니다.');
  if (!Number.isFinite(Date.parse(input.retrievedAt))) throw new Error('수동 등록 수집 시각은 ISO 날짜여야 합니다.');
  if (!['general-context-b-roll', 'specific-event-evidence'].includes(input.semanticRole) || input.specificEventEvidence !== (input.semanticRole === 'specific-event-evidence')) throw new Error('일반 맥락 화면과 특정 사건 증거의 표기가 일치하지 않습니다.');
  if (route.status === 'rights-contract-required' && !input.rightsEvidence.trim()) throw new Error('국내 뉴스·유료 스톡은 라이선스 계약 또는 명시 허락 증빙이 필요합니다.');
  if (route.id === 'direct-shoot') {
    if (input.sourceUrl !== 'local://direct-shoot') throw new Error('직접 촬영은 sourceUrl에 local://direct-shoot를 기록합니다.');
  } else {
    let url: URL;
    try { url = new URL(input.sourceUrl); } catch { throw new Error('수동 등록 source URL이 올바르지 않습니다.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !route.hosts.includes(url.hostname.toLowerCase())) throw new Error('수동 등록 source URL이 route 허용 호스트 밖입니다.');
  }
  const intakeRoot = path.resolve(options.intakeRoot ?? path.join(process.cwd(), 'video', 'source-intake', 'episode-001'));
  const localPath = path.resolve(input.localOriginalPath);
  if (localPath !== intakeRoot && !localPath.startsWith(`${intakeRoot}${path.sep}`)) throw new Error('수동 등록 원본은 EP001 source-intake 경로 아래에 있어야 합니다.');
  const bytes = fs.readFileSync(localPath); const actualSha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha !== input.sha256.toLowerCase()) throw new Error('수동 등록 SHA-256이 원본 바이트와 다릅니다.');
  return { ...input, route, localOriginalPath: localPath, bytes: bytes.byteLength, production_authority: false as const };
}

/** Persist validated manual-registration metadata beside the route registry, without moving,
 * transforming, or approving the original bytes. Existing registrations are immutable. */
export function registerManualKoreanMedia(input: ManualKoreanMediaRegistration, options: { intakeRoot?: string; registrationRoot?: string; registrationId?: string } = {}) {
  const registration = validateManualKoreanMediaRegistration(input, options);
  const registrationId = (options.registrationId ?? `${registration.routeId}-${registration.sha256.slice(0, 12)}`).replace(/[^a-z0-9._-]/gi, '-').replace(/^-+|-+$/g, '');
  if (!registrationId || registrationId.length > 120) throw new Error('수동 등록 식별자가 올바르지 않습니다.');
  const root = path.resolve(options.registrationRoot ?? path.join(process.cwd(), 'video', 'source-intake', 'episode-001', 'korean-routes-v01', 'manual-registrations'));
  const output = path.join(root, `${registrationId}.json`); fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(output)) throw new Error('같은 수동 등록 식별자가 이미 있습니다. 기존 provenance를 덮어쓰지 않습니다.');
  const workspace = path.resolve(process.cwd()); const localPath = registration.localOriginalPath.startsWith(`${workspace}${path.sep}`) ? path.relative(workspace, registration.localOriginalPath).replaceAll('\\', '/') : registration.localOriginalPath;
  const record = { schema_version: 1, registration_id: registrationId, registered_at: new Date().toISOString(), production_authority: false, route: { id: registration.route.id, status: registration.route.status, hosts: registration.route.hosts }, item: { ...input, localOriginalPath: localPath }, verified: { sha256: registration.sha256.toLowerCase(), bytes: registration.bytes, mime_type: registration.mimeType, general_context_only: !registration.specificEventEvidence } };
  const temporary = `${output}.tmp-${crypto.randomUUID()}`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, output); } catch (error) { try { fs.unlinkSync(temporary); } catch { /* noop */ } throw error; }
  return { path: output, sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'), production_authority: false as const };
}

export async function runEp001KoreanRoute(routeId: string, mode: KoreanRouteMode, options: KoreanRouteRunOptions = {}) {
  const route = routeById(routeId);
  if (!route) throw new Error('EP001 한국 미디어 route 식별자가 올바르지 않습니다.');
  if (!route.modes.includes(mode)) throw new Error('선택한 route는 이 실행 모드를 지원하지 않습니다.');
  const page = options.page ?? 1;
  const batchSize = options.batchSize ?? (route.id === 'digital-culture-metadata' ? 10 : 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('검색 페이지는 1 이상의 정수여야 합니다.');
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('검색 배치는 1 이상의 정수여야 합니다.');
  if (options.mediaType !== undefined && !['photo', 'video'].includes(options.mediaType)) throw new Error('미디어 유형은 photo 또는 video여야 합니다.');
  if (mode === 'status' || mode === 'dry-run' || mode === 'search' || mode === 'manual-registration') {
    return { route, mode, query: options.query ?? route.defaultQuery ?? '', page, batchSize, mediaType: options.mediaType ?? null, execution: mode === 'manual-registration' ? 'manual-template-ready' : 'no-network', production_authority: false };
  }
  if (route.status !== 'live-operational') return { route, mode, execution: 'blocked', production_authority: false, blocker: route.blocker ?? 'route가 live operational 상태가 아니다.' };
  const queryRoutes = ['kogl-photo', 'kogl-video', 'wikimedia-korea-fallback', 'loc-korea-fallback', 'pexels-generic-last'];
  const pageRoutes = ['kogl-photo', 'kogl-video', 'wikimedia-korea-fallback', 'loc-korea-fallback', 'pexels-generic-last', 'digital-culture-metadata'];
  const mediaTypeRoutes = ['kogl-photo', 'kogl-video', 'wikimedia-korea-fallback', 'pexels-generic-last'];
  if (options.query !== undefined && !queryRoutes.includes(route.id)) throw new Error(`${route.id} route는 query 검색을 지원하지 않습니다.`);
  if (options.page !== undefined && !pageRoutes.includes(route.id)) throw new Error(`${route.id} route는 page 검색을 지원하지 않습니다.`);
  if (options.mediaType !== undefined && !mediaTypeRoutes.includes(route.id)) throw new Error(`${route.id} route는 미디어 유형 선택을 지원하지 않습니다.`);
  if (route.id === 'assembly-member-photos') return { route, mode, execution: 'collector-run', result: await syncAssemblyMemberPhotos({ batchSize }), production_authority: false };
  if (route.id === 'kogl-photo' || route.id === 'kogl-video') return { route, mode, execution: 'collector-run', result: await syncKoglMedia({ batchSize, page, mediaType: options.mediaType ?? (route.id === 'kogl-photo' ? 'photo' : 'video'), query: options.query ?? route.defaultQuery }), production_authority: false };
  if (route.id === 'digital-culture-metadata') return { route, mode, execution: 'collector-run', result: await syncDigitalCulture({ pageNo: page, numOfRows: batchSize }), production_authority: false };
  if (route.id === 'wikimedia-korea-fallback') return { route, mode, execution: 'collector-run', result: await syncWikimediaMedia({ query: options.query ?? route.defaultQuery, page, batchSize, mediaType: options.mediaType ?? 'photo' }), production_authority: false };
  if (route.id === 'loc-korea-fallback') {
    if (options.mediaType === 'video') throw new Error('Library of Congress route는 photo만 지원합니다.');
    return { route, mode, execution: 'collector-run', result: await syncLocMedia({ query: options.query ?? route.defaultQuery, page, batchSize }), production_authority: false };
  }
  if (route.id === 'pexels-generic-last') return { route, mode, execution: 'collector-run', result: await syncPexelsMedia({ query: options.query ?? 'Seoul Korea', page, batchSize, mediaType: options.mediaType ?? 'photo' }), production_authority: false };
  return { route, mode, execution: 'blocked', production_authority: false, blocker: route.blocker ?? 'collector가 구현되지 않았다.' };
}
