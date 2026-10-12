import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { candidateFromRow, matchesKoglQuery, parseKoglCsvSelected } from '../../src/lib/kogl-media.ts';
import { resolvePexelsApiKey } from '../../src/lib/pexels-media.ts';
import { planKoreanOfficialRoute } from './korean-official-route-planner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, 'video', 'source-intake', 'episode-001', 'broad-discovery-v01');
const SPEC_PATH = path.join(ROOT, 'video', 'episodes', 'episode-001', 'episode-spec.json');
const DATA_GO_ORIGIN = 'https://www.data.go.kr';
const KOGL_ORIGIN = 'https://www.kogl.or.kr';
const KOGL_DATASET = { publicDataPk: '15133902', publicDataDetailPk: 'uddi:3d1025f1-11e0-4061-8bd8-ca3fd95da874', fileDetailSn: '1', url: '/tcs/dss/selectFileDataDownload.do', datasetPage: 'https://www.data.go.kr/data/15133902/fileData.do' };
const MAX_CATALOG_BYTES = 90 * 1024 * 1024;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_AUTO_QUERY_WINDOWS = 1000;
const COMMONS_ROUTES = new Set(['commons', 'commons-object', 'wikimedia-korea-fallback']);
const KOGL_ROUTES = new Set(['kogl-photo', 'kogl-video']);
const PEXELS_ROUTE = 'pexels-generic-last';
const KOREAN_OFFICIAL_ROUTE = 'korean-official-open-item';
const EXEC = promisify(execFile);
const USER_AGENT = '23jung-episode-media-discovery/1.0';
const QUERY_STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with', 'image', 'photo', 'picture', 'video', 'footage', 'media', 'file', 'commons', 'object', 'thing', '사물']);

function plain(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/(?:&#39;|&apos;)/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 4000);
}
function rawMeta(value) {
  if (typeof value === 'string') return value.slice(0, 4000);
  if (value && typeof value === 'object' && typeof value.value === 'string') return value.value.slice(0, 4000);
  return '';
}
function safeText(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 240) : ''; }
function safeHttps(value, hosts) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && hosts.includes(url.hostname.toLowerCase()) ? url.toString() : null; }
  catch { return null; }
}
function boundedInt(value, name, min, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
}
function readBriefs(spec) {
  const perCut = Array.isArray(spec?.cuts) ? spec.cuts.flatMap((cut) => (Array.isArray(cut?.production_decision?.asset_search_briefs) ? cut.production_decision.asset_search_briefs.map((brief) => ({ brief, cut })) : [])) : [];
  const standalone = Array.isArray(spec?.production_decision?.asset_search_briefs) ? spec.production_decision.asset_search_briefs.map((brief) => ({ brief, cut: null })) : [];
  const entries = perCut.length ? perCut : standalone;
  if (!entries.length) throw new Error('episode-spec.json has no production_decision.asset_search_briefs in its cuts');
  return entries.map(({ brief, cut }, index) => {
    const queriesKo = Array.isArray(brief?.queries_ko) ? brief.queries_ko.map(safeText).filter(Boolean) : [];
    const queriesEn = Array.isArray(brief?.queries_en) ? brief.queries_en.map(safeText).filter(Boolean) : [];
    const routes = Array.isArray(brief?.provider_routes) ? [...new Set(brief.provider_routes.map(safeText).filter(Boolean))] : [];
    if (!safeText(brief?.brief_id) || !safeText(brief?.subject) || !routes.length) throw new Error(`asset_search_briefs[${index}] is missing brief_id, subject, or provider_routes`);
    const explicitMediaTypes = Array.isArray(brief?.media_types) ? brief.media_types.map(safeText) : brief?.media_type ? [safeText(brief.media_type)] : [];
    if (explicitMediaTypes.some((type) => !['photo', 'video'].includes(type))) throw new Error(`asset_search_briefs[${index}] has unsupported media_type`);
    return {
      brief_id: safeText(brief.brief_id), cut_id: safeText(cut?.shot_id), production_mode: safeText(cut?.production_mode), selected_mode: safeText(cut?.production_decision?.mode),
      subject: safeText(brief.subject), action: safeText(brief.action), role: safeText(brief.role), specificity: safeText(brief.specificity),
      subject_family: safeText(brief.subject_family), place_context: safeText(brief.place_context ?? brief.place ?? brief.location ?? brief.setting),
      viewpoint: safeText(brief.viewpoint ?? brief.viewpoint_or_scale ?? brief.required_view ?? brief.shot_scale ?? brief.camera_angle ?? brief.framing),
      observed_gap_queries: brief.observed_gap_queries ?? [], required_evidence: brief.required_evidence ?? [],
      explicit_media_types: [...new Set(explicitMediaTypes)], queries: [...new Set([...queriesKo, ...queriesEn])], provider_routes: routes,
      exclusions: Array.isArray(brief.exclusions) ? brief.exclusions.map(safeText).filter(Boolean) : [],
    };
  });
}
function routeMatchesProvider(route, filter) {
  if (filter === 'commons') return COMMONS_ROUTES.has(route);
  if (filter === 'pexels') return route === PEXELS_ROUTE;
  if (filter === 'korean-official') return route === KOREAN_OFFICIAL_ROUTE;
  return route === filter;
}
function taskKey(task) { return `${task.provider}\0${task.query.toLocaleLowerCase('en-US').trim()}\0${task.media_type}`; }
function briefMediaTypes(brief) {
  if (brief.explicit_media_types.length) return brief.explicit_media_types;
  const mode = brief.selected_mode || brief.production_mode;
  if (mode === 'source-video') return ['video'];
  if (mode === 'source-photo' || mode === 'remotion' || mode === 'motion-graphics') return ['photo'];
  if (mode === 'omni') return [];
  return ['photo', 'video'];
}
function explicitQueryVariants(value, baseStrategy) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const variants = [];
  const dimensionStrategy = (dimension) => baseStrategy.startsWith('observed-gap-')
    ? `observed-gap-${dimension}`
    : baseStrategy.endsWith(`-${dimension}`) ? baseStrategy : `${baseStrategy}-${dimension}`;
  const add = (query, strategy = baseStrategy) => {
    const normalized = safeText(query);
    if (normalized) variants.push({ query: normalized, strategy });
  };
  for (const item of values) {
    if (typeof item === 'string') { add(item); continue; }
    if (!item || typeof item !== 'object') continue;
    const direct = item.query ?? item.phrase ?? item.text ?? item.value;
    if (typeof direct === 'string') {
      const dimension = safeText(item.dimension ?? item.type ?? item.kind ?? item.priority).toLocaleLowerCase('en-US');
      const strategy = /view|frame|scale|angle|shot/.test(dimension) ? dimensionStrategy('viewpoint') : /place|location|setting/.test(dimension) ? dimensionStrategy('place') : /action|motion|behavior/.test(dimension) ? dimensionStrategy('action') : baseStrategy;
      add(direct, strategy);
      continue;
    }
    const subject = safeText(item.subject ?? item.observed_subject);
    const action = safeText(item.action ?? item.observed_action);
    const place = safeText(item.place_context ?? item.observed_place_context ?? item.place ?? item.location ?? item.setting);
    const viewpoint = safeText(item.viewpoint ?? item.viewpoint_or_scale ?? item.required_view ?? item.shot_scale ?? item.camera_angle ?? item.framing);
    if (subject && action) add([subject, action].join(' '), dimensionStrategy('action'));
    else if (action) add(action, dimensionStrategy('action'));
    if (subject && place) add([subject, place].join(' '), dimensionStrategy('place'));
    if (subject && viewpoint) add([subject, viewpoint].join(' '), dimensionStrategy('viewpoint'));
    if (!subject && !action && !place && !viewpoint) {
      for (const [key, nested] of Object.entries(item)) {
        if (!['action', 'motion', 'behavior', 'viewpoint', 'frame', 'scale', 'angle', 'shot', 'place', 'location', 'setting'].some((token) => key.toLocaleLowerCase('en-US').includes(token))) continue;
        for (const query of Array.isArray(nested) ? nested : [nested]) if (typeof query === 'string') add(query, /view|frame|scale|angle|shot/i.test(key) ? dimensionStrategy('viewpoint') : /place|location|setting/i.test(key) ? dimensionStrategy('place') : dimensionStrategy('action'));
      }
    }
  }
  return variants;
}
function expandedQueries(brief) {
  const variants = [
    ...explicitQueryVariants(brief.observed_gap_queries, 'observed-gap-action'),
    ...explicitQueryVariants(brief.required_evidence, 'required-evidence'),
  ];
  const subject = brief.subject;
  const action = brief.action;
  const add = (parts, strategy) => {
    const query = [...new Set(parts.map(safeText).filter(Boolean))].join(' ').slice(0, 240).trim();
    if (query) variants.push({ query, strategy });
  };
  // Action and viewpoint are the useful gap dimensions; query them before
  // broad script terms and place-only context.
  if (subject && action) add([subject, action], 'subject-action');
  if (subject && brief.viewpoint) add([subject, brief.viewpoint], 'subject-viewpoint');
  if (brief.subject_family && action) add([brief.subject_family, action], 'family-action');
  if (subject && brief.place_context) add([subject, brief.place_context], 'subject-place');
  if (subject && action && brief.place_context) add([subject, action, brief.place_context], 'subject-action-place');
  variants.push(...brief.queries.map((query) => ({ query, strategy: 'script-query' })));
  const seen = new Set();
  return variants.filter(({ query }) => {
    const key = query.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function createTasks(briefs, providerFilters, maxQueries, queryOffset, allQueryWindows = false) {
  const requested = []; const taskMap = new Map();
  for (const brief of briefs) {
    const mediaTypes = briefMediaTypes(brief);
    const queries = expandedQueries(brief);
    const add = (route, provider, query, mediaType) => {
      const queryInfo = queries.find((item) => item.query === query);
      const declaration = { brief, route, provider, query, query_strategy: queryInfo?.strategy ?? 'script-query', media_type: mediaType };
      requested.push(declaration);
      const key = taskKey(declaration);
      let task = taskMap.get(key);
      if (!task) { task = { ...declaration, origins: [] }; taskMap.set(key, task); }
      if (!task.origins.some((origin) => origin.brief.brief_id === brief.brief_id && origin.route === route)) task.origins.push({ brief, route });
    };
    if (!mediaTypes.length) continue;
    for (const route of brief.provider_routes) {
      if (providerFilters.length && !providerFilters.some((filter) => routeMatchesProvider(route, filter))) continue;
      if (COMMONS_ROUTES.has(route)) {
        for (const { query } of queries) for (const mediaType of mediaTypes) add(route, 'commons', query, mediaType);
      } else if (route === 'kogl-photo' || route === 'kogl-video') {
        const mediaType = route === 'kogl-photo' ? 'photo' : 'video';
        if (mediaTypes.includes(mediaType)) for (const { query } of queries) add(route, 'kogl', query, mediaType);
      } else if (route === PEXELS_ROUTE) {
        for (const mediaType of mediaTypes) for (const { query } of queries) add(route, 'pexels', query, mediaType);
      } else if (route === KOREAN_OFFICIAL_ROUTE) {
        for (const mediaType of mediaTypes) for (const { query } of queries) add(route, 'korean-official', query, mediaType);
      }
    }
  }
  const uniqueTasks = [...taskMap.values()];
  const subjectGroups = new Map();
  for (const task of uniqueTasks) {
    const subject = task.brief.subject.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
    if (!subjectGroups.has(subject)) subjectGroups.set(subject, []);
    subjectGroups.get(subject).push(task);
  }
  const groups = [...subjectGroups.values()];
  const firstWindowCount = Math.min(24, groups.length);
  const spreadIndexes = Array.from({ length: firstWindowCount }, (_, index) => Math.floor(index * groups.length / firstWindowCount));
  const groupOrder = [...spreadIndexes.map((index) => groups[index]), ...groups.filter((_, index) => !spreadIndexes.includes(index))];
  const orderedTasks = []; const selectedKeys = new Set(); const routeTypeCounts = new Map();
  let remainingCount = uniqueTasks.length;
  while (remainingCount > 0) {
    let madeProgress = false;
    for (const group of groupOrder) {
      const available = group.filter((task) => !selectedKeys.has(taskKey(task)));
      if (!available.length) continue;
      available.sort((left, right) => {
        const leftType = `${left.provider}:${left.media_type}`; const rightType = `${right.provider}:${right.media_type}`;
        return (routeTypeCounts.get(leftType) ?? 0) - (routeTypeCounts.get(rightType) ?? 0)
          || uniqueTasks.indexOf(left) - uniqueTasks.indexOf(right);
      });
      const task = available[0]; const routeType = `${task.provider}:${task.media_type}`;
      orderedTasks.push(task); selectedKeys.add(taskKey(task)); routeTypeCounts.set(routeType, (routeTypeCounts.get(routeType) ?? 0) + 1);
      remainingCount -= 1; madeProgress = true;
    }
    if (!madeProgress) break;
  }
  const selectedLimit = allQueryWindows ? Math.min(orderedTasks.length - queryOffset, maxQueries * MAX_AUTO_QUERY_WINDOWS) : maxQueries;
  const selected = orderedTasks.slice(queryOffset, queryOffset + selectedLimit);
  return { requested, uniqueTasks, orderedTasks, selected, skippedCount: Math.max(0, orderedTasks.length - selected.length) };
}
function hasKoreaInstitutionMetadata(text) {
  const value = text.toLocaleLowerCase('en-US');
  const korea = /\b(korea|korean|south korea|seoul)\b|한국|대한민국|서울/.test(value);
  const institution = /assembly|parliament|police|prosecut|justice ministry|court|국회|경찰|검찰|법무부|법원|헌법재판소/.test(value);
  return korea && institution;
}
function validateBriefMetadataMatch(brief, title, description) {
  if (brief.specificity !== 'korea-institution') return { required: false, matched: null };
  return { required: true, matched: hasKoreaInstitutionMetadata(`${title} ${description} ${brief.subject}`) && hasKoreaInstitutionMetadata(`${title} ${description}`) };
}
function creatorColumn(row) {
  for (const [key, value] of Object.entries(row)) if (/(creator|artist|photographer|producer|author|촬영자|저작자|제작자|작가)/i.test(key) && String(value ?? '').trim()) return String(value).slice(0, 4000);
  return '';
}
function licenseColumn(row) {
  for (const [key, value] of Object.entries(row)) if (/(license|rights|copyright|kogl|공공누리|저작권|이용조건)/i.test(key) && String(value ?? '').trim()) return String(value).slice(0, 4000);
  return '';
}
function candidateId(provider, id, originalUrl) { return crypto.createHash('sha256').update(`${provider}\0${id || ''}\0${originalUrl || ''}`).digest('hex').slice(0, 24); }
function commonsMetaCandidate(task, page) {
  const info = page?.imageinfo?.[0] ?? {};
  const mime = safeText(info.mime).toLowerCase();
  const actualType = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : null;
  if (actualType !== task.media_type) return null;
  const originalUrl = safeHttps(info.url, ['upload.wikimedia.org', 'commons.wikimedia.org']);
  const pageId = Number(page.pageid);
  const title = safeText(page.title);
  if (!originalUrl || !Number.isSafeInteger(pageId) || !title) return null;
  const itemUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/^File:/i, 'File:').replaceAll(' ', '_'))}`;
  const meta = info.extmetadata ?? {};
  const rawCreator = rawMeta(meta.Artist);
  const rawLicense = rawMeta(meta.LicenseShortName);
  const rawUsage = rawMeta(meta.UsageTerms);
  const description = plain(rawMeta(meta.ImageDescription));
  const categories = Array.isArray(page.categories) ? page.categories.map((item) => safeText(item?.title)).filter(Boolean) : [];
  const match = validateBriefMetadataMatch(task.brief, title, description);
  return {
    candidate_id: candidateId('commons', String(pageId), originalUrl), provider: 'commons', provider_id: String(pageId), brief_id: task.brief.brief_id, provider_route: task.route,
    title, item_url: itemUrl, original_url: originalUrl, original_host: new URL(originalUrl).hostname, media_type: actualType, mime_type: mime,
    creator: plain(rawCreator), creator_raw_label: rawCreator, license: plain(rawLicense) || plain(rawUsage) || 'license label missing', license_raw_label: rawLicense, usage_terms_raw_label: rawUsage,
    license_url: plain(rawMeta(meta.LicenseUrl)), width: Number.isSafeInteger(info.width) ? info.width : null, height: Number.isSafeInteger(info.height) ? info.height : null,
    bytes: Number.isSafeInteger(info.size) ? info.size : null, description, categories, semantic_review: 'pending', rights_review: 'pending', korea_institution_metadata_required: match.required, korea_institution_metadata_matched: match.matched,
    status: match.matched ? 'candidate-pending-review' : 'excluded-missing-required-korea-institution-metadata', provenance_matches: [], asset_acquisition: { status: 'metadata-only', local_path: null, sha256: null, decoded: false },
  };
}
async function requestCommons(task, maxResults, fetchImpl, rateGate, sleepImpl) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [key, value] of Object.entries({ action: 'query', generator: 'search', gsrsearch: `${task.query} filetype:${task.media_type === 'photo' ? 'bitmap' : 'video'}`, gsrnamespace: '6', gsrlimit: String(maxResults), maxlag: '5', prop: 'imageinfo|categories', cllimit: '20', iiprop: 'url|mime|size|dimensions|extmetadata', format: 'json', formatversion: '2' })) url.searchParams.set(key, value);
  const terms = requestedQueryTerms(task.query);
  let retryCount = 0;
  while (true) {
    await rateGate();
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (response.status === 429 && retryCount < 2) {
      const retryAfter = response.headers.get('retry-after');
      const retrySeconds = retryAfter?.trim() ? Number(retryAfter) : Number.NaN;
      const retryDate = retryAfter && !Number.isFinite(retrySeconds) ? Date.parse(retryAfter) : Number.NaN;
      const backoff = Number.isFinite(retrySeconds) ? retrySeconds * 1000 : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 1000 * (2 ** retryCount);
      await sleepImpl(Math.min(10000, Math.max(250, backoff)));
      retryCount += 1;
      continue;
    }
    if (!response.ok) { const error = new Error(`http_${response.status}`); error.retryCount = retryCount; throw error; }
    if (response.url && safeHttps(response.url, ['commons.wikimedia.org']) === null) throw new Error('redirect_not_allowed');
    const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > 15 * 1024 * 1024) throw new Error('metadata_response_oversize');
    let payload; try { payload = JSON.parse(new TextDecoder().decode(body)); } catch { throw new Error('invalid_api_response'); }
    const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : Object.values(payload?.query?.pages ?? {});
    const validCandidates = pages.map((page) => commonsMetaCandidate(task, page)).filter(Boolean);
    const candidates = []; const queryMismatchItems = [];
    for (const candidate of validCandidates) {
      const match = matchRequestedQuery(terms, `${candidate.title} ${candidate.description} ${(candidate.categories ?? []).join(' ')}`);
      if (match.matched) { candidate.query_match = match; candidates.push(candidate); }
      else queryMismatchItems.push({ title: candidate.title, item_url: candidate.item_url, original_url: candidate.original_url, matching_terms: match.matching_terms, required_terms: terms });
    }
    return { candidates: candidates.slice(0, maxResults), provider_result_count: pages.length, query_mismatch_count: queryMismatchItems.length, query_mismatch_items: queryMismatchItems, retry_count: retryCount };
  }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function createCommonsRateGate(intervalMs, sleepImpl) {
  let nextRequestAt = 0;
  let queue = Promise.resolve();
  return async () => {
    let release;
    const previous = queue;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const delayMs = Math.max(0, nextRequestAt - Date.now());
      if (delayMs) await sleepImpl(delayMs);
      nextRequestAt = Date.now() + intervalMs;
    } finally { release(); }
  };
}
function requestedQueryTerms(query) {
  return [...new Set(String(query).normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((term) => [...term].length >= 2 && !QUERY_STOP_WORDS.has(term));
}
function matchRequestedQuery(terms, metadata) {
  const normalized = String(metadata).normalize('NFKC').toLocaleLowerCase('en-US');
  const matchingTerms = terms.filter((term) => normalized.includes(term));
  return { matched: terms.length === 0 || matchingTerms.length > 0, matching_terms: matchingTerms };
}
function headerKey(value) { return value.replace(/^\uFEFF/, '').replace(/[\s_-]/g, '').toLowerCase(); }
function rowValue(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find((candidate) => headerKey(candidate) === headerKey(alias));
    if (key && String(row[key] ?? '').trim()) return String(row[key]).slice(0, 4000);
  }
  return '';
}
async function fetchKoglCatalog(fetchImpl, cache) {
  if (cache.value) return cache.value;
  if (!cache.promise) cache.promise = (async () => {
    const endpoint = new URL(KOGL_DATASET.url, DATA_GO_ORIGIN);
    const form = new URLSearchParams({ publicDataDetailPk: KOGL_DATASET.publicDataDetailPk, publicDataPk: KOGL_DATASET.publicDataPk, atchFileId: '', fileDetailSn: KOGL_DATASET.fileDetailSn, url: KOGL_DATASET.url });
    const resolvedResponse = await fetchImpl(endpoint, { method: 'POST', body: form.toString(), cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (!resolvedResponse.ok) throw new Error(`catalog_resolution_http_${resolvedResponse.status}`);
    const resolved = await resolvedResponse.json();
    const nested = resolved?.fileDataRegistVO ?? resolved?.dataSetFileDetailInfo ?? {};
    const atchFileId = safeText(resolved?.atchFileId ?? nested.atchFileId);
    const fileDetailSn = safeText(resolved?.fileDetailSn ?? nested.fileDetailSn ?? KOGL_DATASET.fileDetailSn);
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(atchFileId) || !/^\d{1,12}$/.test(fileDetailSn)) throw new Error('invalid_catalog_resolution');
    const catalogUrl = new URL('/cmm/cmm/fileDownload.do', DATA_GO_ORIGIN);
    catalogUrl.searchParams.set('atchFileId', atchFileId); catalogUrl.searchParams.set('fileDetailSn', fileDetailSn); catalogUrl.searchParams.set('insertDataPrcus', 'N');
    const catalogResponse = await fetchImpl(catalogUrl, { cache: 'no-store', redirect: 'error', headers: { Accept: 'text/csv,application/octet-stream;q=0.9,*/*;q=0.1', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (!catalogResponse.ok) throw new Error(`catalog_http_${catalogResponse.status}`);
    const length = Number(catalogResponse.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_CATALOG_BYTES) throw new Error('catalog_oversize');
    const bytes = new Uint8Array(await catalogResponse.arrayBuffer()); if (bytes.byteLength > MAX_CATALOG_BYTES) throw new Error('catalog_oversize');
    const rows = parseKoglCsvSelected(new TextDecoder('euc-kr').decode(bytes), [
      '웹파일경로', 'webfilepath', '파일경로', 'filepath', '파일명', 'filename', 'title', '제목',
      '원본파일명', 'originalfilename', '파일확장자', '확장자', 'extension', '파일크기', 'filesize', '파일용량',
      '기관명', '제공기관', '저작자', 'creator', '작성자', '공공누리 유형', '라이선스', 'license', '이용조건', '저작권 이용조건',
      '설명', 'description', '내용', '비고',
    ], (row) => {
      const candidate = candidateFromRow(row, KOGL_DATASET.datasetPage);
      return candidate !== null && cache.queries.some((query) => matchesKoglQuery(candidate, query));
    });
    cache.value = rows; return rows;
  })();
  return cache.promise;
}
async function requestKogl(task, maxResults, fetchImpl, cache) {
  const rows = await fetchKoglCatalog(fetchImpl, cache);
  const matches = rows.flatMap((row) => {
    const candidate = candidateFromRow(row, KOGL_DATASET.datasetPage);
    if (!candidate || candidate.mediaType !== task.media_type || !matchesKoglQuery(candidate, task.query)) return [];
    const title = safeText(rowValue(row, ['파일명', 'filename', 'title', '제목'])) || candidate.title;
    const creatorRaw = creatorColumn(row);
    const licenseRaw = licenseColumn(row);
    const description = rowValue(row, ['설명', 'description', '내용', '비고']);
    const match = validateBriefMetadataMatch(task.brief, `${title} ${candidate.originalFileName}`, `${description} ${JSON.stringify(row)}`);
    return [{
      candidate_id: candidateId('kogl', candidate.id, candidate.url), provider: 'kogl', provider_id: candidate.id, brief_id: task.brief.brief_id, provider_route: task.route,
      title, item_url: candidate.itemUrl, original_url: candidate.url, original_host: new URL(candidate.url).hostname, media_type: candidate.mediaType,
      mime_type: candidate.mediaType === 'photo' ? null : `video/${candidate.extension}`, creator: plain(creatorRaw), creator_raw_label: creatorRaw,
      license: plain(licenseRaw) || 'KOGL item-level license label missing', license_raw_label: licenseRaw, usage_terms_raw_label: rowValue(row, ['이용조건', '공공누리 유형', '저작권 이용조건']),
      width: null, height: null, bytes: candidate.declaredBytes, description: plain(description), semantic_review: 'pending', rights_review: 'pending',
      korea_institution_metadata_required: match.required, korea_institution_metadata_matched: match.matched,
      status: match.matched ? 'candidate-pending-review' : 'excluded-missing-required-korea-institution-metadata', provenance_matches: [],
      asset_acquisition: { status: 'metadata-only', local_path: null, sha256: null, decoded: false }, raw_provider_record: row,
    }];
  }).slice(0, maxResults);
  return matches;
}
function pexelsPhotoMime(originalUrl) {
  const extension = path.extname(new URL(originalUrl).pathname).toLowerCase();
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[extension] ?? null;
}
function pexelsCandidate(task, item) {
  const id = Number(item?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  let originalUrl; let mimeType; let itemUrl; let creator; let creatorUrl = ''; let width = null; let height = null; let duration = null; let declaredBytes = null; let description = '';
  if (task.media_type === 'photo') {
    originalUrl = safeHttps(item?.src?.original, ['images.pexels.com']);
    itemUrl = safeHttps(item?.url, ['www.pexels.com', 'pexels.com']);
    mimeType = originalUrl ? pexelsPhotoMime(originalUrl) : null;
    width = Number.isSafeInteger(item?.width) && item.width > 0 ? item.width : null;
    height = Number.isSafeInteger(item?.height) && item.height > 0 ? item.height : null;
    description = safeText(item?.alt);
    creator = safeText(item?.photographer) || 'Pexels creator not identified';
    creatorUrl = safeHttps(item?.photographer_url, ['www.pexels.com', 'pexels.com']) ?? '';
  } else {
    const files = Array.isArray(item?.video_files) ? item.video_files : [];
    const validFiles = files.map((file) => ({
      file,
      url: safeHttps(file?.link, ['videos.pexels.com']),
      mime: file?.file_type === 'video/mp4' || file?.file_type === 'video/webm' ? file.file_type : null,
      fileSize: Number.isSafeInteger(file?.file_size) && file.file_size > 0 ? file.file_size : null,
      fileWidth: Number.isSafeInteger(file?.width) && file.width > 0 ? file.width : 0,
    })).filter((entry) => entry.url && entry.mime && (entry.fileSize === null || entry.fileSize <= MAX_ASSET_BYTES));
    validFiles.sort((left, right) => {
      const leftPreferred = left.fileWidth >= 1280 && left.fileWidth <= 1920 ? 1 : 0;
      const rightPreferred = right.fileWidth >= 1280 && right.fileWidth <= 1920 ? 1 : 0;
      return rightPreferred - leftPreferred || right.fileWidth - left.fileWidth;
    });
    const selected = validFiles[0];
    originalUrl = selected?.url;
    mimeType = selected?.mime;
    declaredBytes = selected?.fileSize ?? null;
    itemUrl = safeHttps(item?.url, ['www.pexels.com', 'pexels.com']);
    width = Number.isSafeInteger(item?.width) && item.width > 0 ? item.width : null;
    height = Number.isSafeInteger(item?.height) && item.height > 0 ? item.height : null;
    duration = Number.isFinite(item?.duration) && item.duration > 0 ? item.duration : null;
    const user = item?.user && typeof item.user === 'object' ? item.user : {};
    creator = safeText(user.name) || 'Pexels creator not identified';
    creatorUrl = safeHttps(user.url, ['www.pexels.com', 'pexels.com']) ?? '';
  }
  if (!originalUrl || !mimeType || !itemUrl) return null;
  const title = description || `Pexels ${task.media_type} ${id}`;
  const match = validateBriefMetadataMatch(task.brief, title, description);
  const terms = requestedQueryTerms(task.query);
  return {
    candidate_id: candidateId('pexels', String(id), originalUrl), provider: 'pexels', provider_id: String(id), brief_id: task.brief.brief_id, provider_route: task.route,
    title, item_url: itemUrl, original_url: originalUrl, original_host: new URL(originalUrl).hostname, media_type: task.media_type, mime_type: mimeType,
    creator, creator_raw_label: creator, creator_url: creatorUrl, license: 'Pexels License; item-level rights review pending', license_raw_label: 'Pexels License',
    license_url: 'https://www.pexels.com/legal-pages/license/', width, height, bytes: declaredBytes, duration_seconds: duration, description,
    semantic_review: 'pending', rights_review: 'pending', korea_institution_metadata_required: match.required, korea_institution_metadata_matched: match.matched,
    status: match.matched ? 'candidate-pending-review' : 'excluded-missing-required-korea-institution-metadata', provenance_matches: [],
    query_match: { matched: true, matching_terms: terms, match_basis: 'Pexels API search response; semantic match pending human review' },
    asset_acquisition: { status: 'metadata-only', local_path: null, sha256: null, decoded: false, production_authority: false },
  };
}
async function requestPexels(task, maxResults, fetchImpl, apiKey, rateGate, sleepImpl) {
  if (!apiKey) throw new Error('pexels_api_key_missing');
  const endpoint = new URL(`https://api.pexels.com/v1/${task.media_type === 'photo' ? 'search' : 'videos/search'}`);
  endpoint.searchParams.set('query', task.query);
  endpoint.searchParams.set('page', '1');
  endpoint.searchParams.set('per_page', String(maxResults));
  endpoint.searchParams.set('locale', 'ko-KR');
  endpoint.searchParams.set('orientation', 'landscape');
  let response; let retryCount = 0;
  while (true) {
    await rateGate();
    response = await fetchImpl(endpoint, { cache: 'no-store', redirect: 'error', headers: { Authorization: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (response.status !== 429 || retryCount >= 4) break;
    const retryAfter = response.headers.get('retry-after');
    const retrySeconds = retryAfter?.trim() ? Number(retryAfter) : Number.NaN;
    const retryDate = retryAfter && !Number.isFinite(retrySeconds) ? Date.parse(retryAfter) : Number.NaN;
    const backoff = Number.isFinite(retrySeconds) ? retrySeconds * 1000 : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 1000 * (2 ** retryCount);
    await sleepImpl(Math.min(30000, Math.max(500, backoff)));
    retryCount += 1;
  }
  if (!response.ok) { const error = new Error(`pexels_http_${response.status}`); error.retryCount = retryCount; throw error; }
  if (response.url && safeHttps(response.url, ['api.pexels.com']) === null) throw new Error('pexels_redirect_not_allowed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('pexels_metadata_response_oversize');
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('pexels_invalid_api_response'); }
  const key = task.media_type === 'photo' ? 'photos' : 'videos';
  const rows = Array.isArray(payload?.[key]) ? payload[key] : [];
  const candidates = rows.map((item) => pexelsCandidate(task, item)).filter(Boolean).slice(0, maxResults);
  return { candidates, provider_result_count: rows.length, query_mismatch_count: 0, query_mismatch_items: [], retry_count: retryCount };
}
function provenanceFor(task, origin = { brief: task.brief, route: task.route }, executed = true) {
  return { brief_id: origin.brief.brief_id, cut_id: origin.brief.cut_id, production_mode: origin.brief.production_mode, selected_mode: origin.brief.selected_mode, provider_route: origin.route, provider: task.provider, requested_query: task.query, query_strategy: task.query_strategy ?? 'script-query', executed_query: executed ? task.query : null, media_type: task.media_type };
}
function refreshCandidateEligibility(candidate) {
  const required = candidate.provenance_matches.filter((match) => match.korea_institution_metadata_required);
  candidate.korea_institution_metadata_required = required.length > 0;
  candidate.korea_institution_metadata_matched = required.length ? required.every((match) => match.korea_institution_metadata_matched) : null;
  candidate.status = candidate.provenance_matches.some((match) => !match.korea_institution_metadata_required || match.korea_institution_metadata_matched)
    ? 'candidate-pending-review'
    : 'excluded-missing-required-korea-institution-metadata';
}
function mergeCandidate(map, candidate, task, origin = { brief: task.brief, route: task.route }) {
  const keys = [`url:${candidate.original_url}`, `id:${candidate.provider}:${candidate.provider_id}`].filter((key) => !key.endsWith(':'));
  const existing = keys.map((key) => map.get(key)).find(Boolean);
  const match = validateBriefMetadataMatch(origin.brief, candidate.title, candidate.description ?? '');
  const provenance = { ...provenanceFor(task, origin), korea_institution_metadata_required: match.required, korea_institution_metadata_matched: match.matched };
  if (existing) {
    if (!existing.provenance_matches.some((item) => item.brief_id === provenance.brief_id && item.provider_route === provenance.provider_route && item.requested_query === task.query && item.media_type === task.media_type)) existing.provenance_matches.push(provenance);
    refreshCandidateEligibility(existing);
    return existing;
  }
  candidate.provenance_matches.push(provenance);
  refreshCandidateEligibility(candidate);
  for (const key of keys) map.set(key, candidate);
  return candidate;
}
function isSensitiveOrPersonContext(text) {
  const normalized = text.toLocaleLowerCase('en-US');
  const namedPeople = /\b(person|portrait|man|woman|child|official|politician|police|officer|victim|witness|suspect|prosecutor|judge|minister|president|assembly member|meeting|rally|protest|arrest|crime|injury|face|handshake|document|paper|scan|scanned|book|form|certificate|court record|newspaper|screenshot|screen capture)\b|\b(?:people|persons|crowd|individuals)\s+(?:pictured|shown|visible|standing|sitting|walking|attending|protesting|marching|gathered|in the scene)\b|사람|인물|초상|남성|여성|아동|공무원|정치인|경찰|피해자|증인|피의자|검사|판사|장관|대통령|의원|회의|집회|시위|체포|범죄|부상|얼굴|문서|서류|종이|스캔|책|양식|증명서|판결문|신문|화면 캡처/.test(normalized);
  return namedPeople;
}
function safeObjectMetadata(candidate) {
  const metadata = `${candidate.title} ${candidate.description} ${(candidate.categories ?? []).join(' ')}`;
  const hasPersonCategory = /category:\s*(?:people(?:\s+(?:at|in|of|on|from|gathered|walking|standing|sitting)\b)?|persons?(?:\s+(?:at|in|of|on|from)\b)?|portraits?(?:\s+of\b)?|politicians|presidents|ministers|police officers|victims|witnesses|personnel)\b/i.test(metadata);
  const objectCue = /\b(box|boxes|package|parcel|envelope|smartphone|mobile phone|telephone|wallet|banknote|atm|camera|cctv|desk|calendar|clock|notification bell|folder|shelf|shelves|cabinet)\b|상자|택배|포장|봉투|휴대전화|스마트폰|지갑|현금|카메라|CCTV|책상|달력|시계|알림|서류함|선반|보관함/i.test(metadata);
  return { safe: (candidate.categories?.length ?? 0) > 0 && !hasPersonCategory && objectCue, has_person_category: hasPersonCategory, has_object_cue: objectCue };
}
function explicitReusableLicense(candidate) {
  const label = plain(candidate.license_raw_label).toUpperCase().replace(/\s+/g, ' ').trim();
  return /^CC0(?:\s+1\.0(?:\s+UNIVERSAL)?)?$/.test(label)
    || /^PUBLIC DOMAIN(?:\s*\([^)]*\))?$/.test(label)
    || /^CC BY(?:-SA)?\s+[1-4]\.\d(?:\s+INTERNATIONAL)?$/.test(label);
}
function downloadBlockers(candidate, brief) {
  const blockers = [];
  if (candidate.provider !== 'commons') blockers.push('provider-not-commons');
  if (brief.specificity !== 'generic-object' || brief.role === 'off-canvas-evidence') blockers.push('not-generic-object-visual');
  if (isSensitiveOrPersonContext(`${brief.subject} ${brief.action} ${brief.queries.join(' ')} ${candidate.title} ${candidate.description}`)) blockers.push('person-or-sensitive-context');
  const objectCheck = safeObjectMetadata(candidate);
  if (!objectCheck.safe) blockers.push(objectCheck.has_person_category ? 'person-category-present' : !objectCheck.has_object_cue ? 'no-explicit-object-metadata' : 'missing-categories');
  if (!explicitReusableLicense(candidate)) blockers.push('license-not-explicitly-allowed');
  if (candidate.original_host !== 'upload.wikimedia.org') blockers.push('original-host-not-allowed');
  if (!['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'].includes(candidate.mime_type)) blockers.push('mime-not-allowed');
  return blockers;
}
function semanticTokens(candidate) {
  return [...new Set(`${candidate.title ?? ''} ${candidate.description ?? ''} ${(candidate.categories ?? []).join(' ')}`
    .normalize('NFKC').toLocaleLowerCase('ko-KR').match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((token) => [...token].length > 1 && !QUERY_STOP_WORDS.has(token));
}
function jaccardSimilarity(left, right) {
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection || 1);
}
export function rankCandidatesForAcquisition(items, limit) {
  const remaining = items.map((item) => ({ ...item, tokens: new Set(semanticTokens(item.candidate)) }));
  const selected = []; const coveredBriefs = new Set();
  while (remaining.length && selected.length < limit) {
    const scored = remaining.map((item) => {
      const briefIds = new Set(item.candidate.provenance_matches.map((match) => match.brief_id));
      const newlyCoveredBriefs = [...briefIds].filter((id) => !coveredBriefs.has(id)).length;
      const semanticNovelty = selected.length ? 1 - Math.max(...selected.map((chosen) => jaccardSimilarity(item.tokens, chosen.tokens))) : 1;
      return { item, briefIds, newlyCoveredBriefs, semanticNovelty, score: newlyCoveredBriefs * 100 + semanticNovelty * 10 };
    }).sort((left, right) => right.score - left.score || String(left.item.candidate.candidate_id).localeCompare(String(right.item.candidate.candidate_id)));
    const winner = scored[0];
    selected.push({ ...winner.item, selection_rank: selected.length + 1, newly_covered_brief_count: winner.newlyCoveredBriefs, semantic_novelty_score: Number(winner.semanticNovelty.toFixed(4)) });
    for (const id of winner.briefIds) coveredBriefs.add(id);
    remaining.splice(remaining.indexOf(winner.item), 1);
  }
  return selected;
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeCandidatePath(outputRoot, candidate, mime) {
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/webm': '.webm', 'video/mp4': '.mp4' })[mime];
  const providerDirectory = ({ commons: 'commons', pexels: 'pexels' })[candidate.provider];
  if (!extension || !providerDirectory || !/^[a-f0-9]{24}$/.test(candidate.candidate_id)) throw new Error('unsafe_candidate_path');
  const directory = path.resolve(outputRoot, 'originals', providerDirectory);
  const target = path.resolve(directory, `${candidate.candidate_id}${extension}`);
  if (!target.startsWith(`${directory}${path.sep}`)) throw new Error('unsafe_candidate_path');
  return { directory, target };
}
function hasExistingCandidateFile(outputRoot, candidate) {
  const providerDirectory = ({ commons: 'commons', pexels: 'pexels' })[candidate.provider];
  if (!providerDirectory || !/^[a-f0-9]{24}$/.test(candidate.candidate_id)) return false;
  const directory = path.resolve(outputRoot, 'originals', providerDirectory);
  return ['.jpg', '.png', '.webp', '.webm', '.mp4'].some((extension) => fs.existsSync(path.join(directory, `${candidate.candidate_id}${extension}`)));
}
async function verifyDownloadedCandidate(filePath, mimeType, ffprobePath) {
  if (mimeType.startsWith('image/')) {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(filePath).metadata();
    const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    const expectedMime = expected[`image/${metadata.format}`] === undefined ? null : `image/${metadata.format}`;
    if (!metadata.width || !metadata.height || !metadata.format || !expectedMime) throw new Error('image_decode_failed');
    await sharp(filePath).rotate().resize({ width: 2, height: 2, fit: 'inside' }).toBuffer();
    return { decoded: true, width: metadata.width, height: metadata.height, codec: metadata.format, detected_mime_type: expectedMime };
  }
  const { stdout } = await EXEC(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,width,height,codec_name', '-of', 'json', filePath], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  const probe = JSON.parse(stdout); const stream = (probe.streams ?? []).find((item) => item.codec_type === 'video'); const duration = Number(probe.format?.duration); const format = String(probe.format?.format_name ?? '');
  if (!stream || !Number.isFinite(duration) || duration <= 0) throw new Error('video_decode_failed');
  if (mimeType === 'video/webm' && !format.includes('webm') || mimeType === 'video/mp4' && !format.includes('mp4')) throw new Error('video_mime_mismatch');
  return { decoded: true, width: stream.width ?? null, height: stream.height ?? null, duration_seconds: duration, codec: stream.codec_name ?? null, format_name: format };
}
async function acquireCommonsCandidate(candidate, brief, outputRoot, fetchImpl, ffprobePath, shaToCandidate) {
  const blockers = downloadBlockers(candidate, brief);
  if (blockers.length) { candidate.asset_acquisition = { status: 'not-downloaded-rejected-precondition', local_path: null, sha256: null, decoded: false, blockers }; return; }
  const { directory, target } = safeCandidatePath(outputRoot, candidate, candidate.mime_type);
  fs.mkdirSync(directory, { recursive: true });
  const resolvedDirectory = fs.realpathSync(directory);
  if (!path.resolve(target).startsWith(`${resolvedDirectory}${path.sep}`)) throw new Error('unsafe_candidate_path');
  let temporary = null;
  try {
    let bytes; let existingFile = false;
    if (fs.existsSync(target)) {
      const actualPath = fs.realpathSync(target);
      if (!actualPath.startsWith(`${resolvedDirectory}${path.sep}`)) throw new Error('unsafe_candidate_path');
      bytes = fs.readFileSync(actualPath); existingFile = true;
    } else {
      const response = await fetchImpl(candidate.original_url, { cache: 'no-store', redirect: 'error', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`download_http_${response.status}`);
      if (response.url && safeHttps(response.url, ['upload.wikimedia.org']) === null) throw new Error('download_redirect_not_allowed');
      if ((response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '') !== candidate.mime_type) throw new Error('download_mime_mismatch');
      const declaredBytes = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ASSET_BYTES) throw new Error('download_oversize');
      bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('download_oversize');
    }
    const digest = sha256(bytes);
    const duplicate = shaToCandidate.get(digest);
    if (duplicate && duplicate.candidate_id !== candidate.candidate_id) {
      candidate.asset_acquisition = { status: 'deduplicated-by-sha256', local_path: null, sha256: digest, decoded: true, deduplicated_to: duplicate.candidate_id };
      return;
    }
    if (!existingFile) {
      temporary = `${target}.tmp-${crypto.randomUUID()}`;
      fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    }
    const decoded = candidate.media_type === 'photo'
      ? await (async () => {
          const sharp = (await import('sharp')).default;
          const metadata = await sharp(bytes).metadata();
          const mimeForFormat = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format];
          if (!metadata.width || !metadata.height || mimeForFormat !== candidate.mime_type) throw new Error('image_mime_or_decode_mismatch');
          await sharp(bytes).rotate().resize({ width: 2, height: 2, fit: 'inside' }).toBuffer();
          return { decoded: true, width: metadata.width, height: metadata.height, codec: metadata.format, detected_mime_type: mimeForFormat };
        })()
      : await verifyDownloadedCandidate(existingFile ? target : temporary, candidate.mime_type, ffprobePath);
    if (temporary) { fs.renameSync(temporary, target); temporary = null; }
    shaToCandidate.set(digest, candidate);
    const localPath = path.relative(ROOT, target).replaceAll('\\', '/');
    candidate.asset_acquisition = { status: 'downloaded-candidate-pending-human-review', local_path: localPath, sha256: digest, bytes: bytes.byteLength, decoded: true, verification: decoded, production_authority: false };
  } catch (error) {
    if (temporary) try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    candidate.asset_acquisition = { status: 'download-failed', local_path: null, sha256: null, decoded: false, error: error instanceof Error ? error.message : 'download_failed' };
  }
}
function pexelsDownloadBlockers(candidate, brief) {
  const blockers = [];
  const gapActionVideo = candidate.media_type === 'video' && candidate.provenance_matches?.some((match) => match.brief_id === brief.brief_id && match.query_strategy === 'observed-gap-action');
  if (candidate.provider !== 'pexels' || candidate.provider_route !== PEXELS_ROUTE) blockers.push('not-pexels-generic-last-route');
  if (brief.specificity !== 'generic-object' || brief.role === 'off-canvas-evidence') blockers.push('not-generic-object-visual');
  if (!gapActionVideo && isSensitiveOrPersonContext(`${brief.subject} ${brief.action} ${brief.queries.join(' ')} ${candidate.title} ${candidate.description}`)) blockers.push('person-or-sensitive-context');
  if (!gapActionVideo && !/\b(box|boxes|package|parcel|envelope|smartphone|mobile phone|telephone|wallet|banknote|atm|camera|cctv|desk|calendar|clock|folder|shelf|shelves|cabinet)\b|상자|택배|포장|봉투|휴대전화|스마트폰|지갑|현금|카메라|CCTV|책상|달력|시계|서류함|선반|보관함/i.test(`${candidate.title} ${candidate.description}`)) blockers.push('no-explicit-object-metadata');
  if (candidate.license_raw_label !== 'Pexels License' || candidate.license_url !== 'https://www.pexels.com/legal-pages/license/') blockers.push('pexels-license-provenance-missing');
  const allowedHost = candidate.media_type === 'photo' ? 'images.pexels.com' : 'videos.pexels.com';
  if (candidate.original_host !== allowedHost) blockers.push('original-host-not-allowed');
  if (!['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'].includes(candidate.mime_type)) blockers.push('mime-not-allowed');
  return blockers;
}
async function acquirePexelsCandidate(candidate, brief, outputRoot, fetchImpl, ffprobePath, shaToCandidate) {
  const blockers = pexelsDownloadBlockers(candidate, brief);
  if (blockers.length) { candidate.asset_acquisition = { status: 'not-downloaded-rejected-precondition', local_path: null, sha256: null, decoded: false, blockers, production_authority: false }; return; }
  const { directory, target } = safeCandidatePath(outputRoot, candidate, candidate.mime_type);
  fs.mkdirSync(directory, { recursive: true });
  const resolvedDirectory = fs.realpathSync(directory);
  if (!path.resolve(target).startsWith(`${resolvedDirectory}${path.sep}`)) throw new Error('unsafe_candidate_path');
  let temporary = null;
  try {
    const response = await fetchImpl(candidate.original_url, { cache: 'no-store', redirect: 'error', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`download_http_${response.status}`);
    const host = candidate.media_type === 'photo' ? 'images.pexels.com' : 'videos.pexels.com';
    if (response.url && safeHttps(response.url, [host]) === null) throw new Error('download_redirect_not_allowed');
    if ((response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '') !== candidate.mime_type) throw new Error('download_mime_mismatch');
    const declaredBytes = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ASSET_BYTES) throw new Error('download_oversize');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('download_oversize');
    const digest = sha256(bytes);
    const duplicate = shaToCandidate.get(digest);
    if (duplicate && duplicate.candidate_id !== candidate.candidate_id) {
      candidate.asset_acquisition = { status: 'deduplicated-by-sha256', local_path: null, sha256: digest, decoded: true, deduplicated_to: duplicate.candidate_id, production_authority: false };
      return;
    }
    temporary = `${target}.tmp-${crypto.randomUUID()}`;
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    const decoded = candidate.media_type === 'photo'
      ? await (async () => {
          const sharp = (await import('sharp')).default;
          const metadata = await sharp(bytes).metadata();
          const mimeForFormat = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format];
          if (!metadata.width || !metadata.height || mimeForFormat !== candidate.mime_type) throw new Error('image_mime_or_decode_mismatch');
          await sharp(bytes).rotate().resize({ width: 2, height: 2, fit: 'inside' }).toBuffer();
          return { decoded: true, width: metadata.width, height: metadata.height, codec: metadata.format, detected_mime_type: mimeForFormat };
        })()
      : await verifyDownloadedCandidate(temporary, candidate.mime_type, ffprobePath);
    fs.renameSync(temporary, target); temporary = null;
    shaToCandidate.set(digest, candidate);
    candidate.asset_acquisition = { status: 'downloaded-candidate-pending-human-review', local_path: path.relative(ROOT, target).replaceAll('\\', '/'), sha256: digest, bytes: bytes.byteLength, decoded: true, verification: decoded, production_authority: false };
  } catch (error) {
    if (temporary) try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    candidate.asset_acquisition = { status: 'download-failed', local_path: null, sha256: null, decoded: false, error: error instanceof Error ? error.message : 'download_failed', production_authority: false };
  }
}
async function mapBounded(items, concurrency, callback) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++; if (index >= items.length) return;
      try { results[index] = await callback(items[index], index); }
      catch (error) { results[index] = { error: error instanceof Error ? error.message : 'search_failed', retry_count: Number.isSafeInteger(error?.retryCount) ? error.retryCount : 0 }; }
    }
  }));
  return results;
}
function atomicJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true }); const temporary = `${target}.tmp-${crypto.randomUUID()}`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, target); }
  catch (error) { try { fs.unlinkSync(temporary); } catch { /* best effort */ } throw error; }
}
function outputFilePath(outputRoot, generatedAt) {
  const stamp = generatedAt.replace(/[:.]/g, '-');
  return path.join(outputRoot, `broad-discovery-${stamp}.json`);
}
function latestDiscoveryLedger(outputRoot) {
  if (!fs.existsSync(outputRoot)) return null;
  const entries = fs.readdirSync(outputRoot).filter((name) => /^broad-discovery-.*\.json$/.test(name)).map((name) => {
    try { return { name, ledger: JSON.parse(fs.readFileSync(path.join(outputRoot, name), 'utf8')) }; }
    catch { return null; }
  }).filter(Boolean).sort((left, right) => String(right.ledger.generated_at ?? right.name).localeCompare(String(left.ledger.generated_at ?? left.name)));
  return entries[0] ?? null;
}
function taskSetHash(tasks) {
  const serialized = tasks.map((task) => ({ provider: task.provider, query: task.query, media_type: task.media_type, origins: (task.origins ?? []).map((origin) => ({ brief_id: origin.brief.brief_id, route: origin.route })) }));
  return sha256(Buffer.from(JSON.stringify(serialized)));
}
export async function runEpisodeMediaDiscovery(options = {}) {
  const mode = options.mode ?? 'plan';
  if (!['plan', 'execute'].includes(mode)) throw new Error('mode must be plan or execute');
  const specText = options.spec ? null : fs.readFileSync(options.specPath ?? SPEC_PATH, 'utf8');
  const spec = options.spec ?? JSON.parse(specText);
  const sourceSpecSha256 = sha256(Buffer.from(specText ?? JSON.stringify(spec)));
  const cutIds = [...new Set((options.cutIds ?? []).map(safeText).filter(Boolean))];
  const allBriefs = readBriefs(spec);
  const briefs = cutIds.length ? allBriefs.filter((brief) => cutIds.includes(brief.cut_id)) : allBriefs;
  if (!briefs.length) throw new Error(`no asset search briefs matched --cut-id ${cutIds.join(',')}`);
  const maxQueries = boundedInt(options.maxQueries ?? 24, 'maxQueries', 1, 24);
  const maxResults = boundedInt(options.maxResults ?? 8, 'maxResults', 1, 8);
  const downloadLimit = boundedInt(options.downloadCandidates ?? 0, 'downloadCandidates', 0, 8);
  if (mode !== 'execute' && downloadLimit) throw new Error('--download-candidates requires --execute');
  const providerFilters = options.providers ?? [];
  const validFilters = new Set(['commons', 'kogl-photo', 'kogl-video', 'pexels', PEXELS_ROUTE, 'korean-official', KOREAN_OFFICIAL_ROUTE]);
  if (providerFilters.some((filter) => !validFilters.has(filter))) throw new Error(`Unsupported provider filter: ${providerFilters.find((filter) => !validFilters.has(filter))}`);
  const queryOffset = boundedInt(options.queryOffset ?? 0, 'queryOffset', 0, 1000000);
  const allQueryWindows = options.allQueryWindows === true;
  const { requested: requestedTasks, uniqueTasks, orderedTasks, selected: tasks, skippedCount } = createTasks(briefs, providerFilters, maxQueries, queryOffset, allQueryWindows);
  if (allQueryWindows && orderedTasks.length - queryOffset > maxQueries * MAX_AUTO_QUERY_WINDOWS) throw new Error(`automatic query traversal is bounded to ${MAX_AUTO_QUERY_WINDOWS} windows per run`);
  const orderedTaskSetSha256 = taskSetHash(orderedTasks);
  const outputRoot = options.outputRoot ?? DEFAULT_OUTPUT_ROOT;
  if (queryOffset > 0) {
    const previous = latestDiscoveryLedger(outputRoot)?.ledger;
    if (!previous?.source_binding?.episode_spec_sha256 || !previous?.source_binding?.ordered_task_set_sha256
      || previous.source_binding.episode_spec_sha256 !== sourceSpecSha256
      || previous.source_binding.ordered_task_set_sha256 !== orderedTaskSetSha256) {
      throw new Error('query offset cursor is unbound or stale because the episode spec or provider task set changed; restart with --query-offset 0');
    }
  }
  const supportedRoutes = (route) => COMMONS_ROUTES.has(route) || KOGL_ROUTES.has(route) || route === PEXELS_ROUTE || route === KOREAN_OFFICIAL_ROUTE;
  const unsupportedRoutes = briefs.flatMap((brief) => brief.provider_routes.filter((route) => !supportedRoutes(route)).map((route) => ({ brief_id: brief.brief_id, route, error: 'provider-route-not-implemented-in-broad-discovery-v01' })));
  const officialRoutePlans = tasks.filter((task) => task.provider === 'korean-official').map((task) => ({
    brief_id: task.brief.brief_id,
    cut_id: task.brief.cut_id,
    requested_query: task.query,
    ...planKoreanOfficialRoute(task.brief, task.media_type),
  }));
  const searches = []; const candidateMap = new Map(); const koglCache = { value: null, promise: null, queries: [...new Set(tasks.filter((task) => task.provider === 'kogl').map((task) => task.query))] }; const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? wait;
  const pexelsApiKey = Object.hasOwn(options, 'pexelsApiKey') ? String(options.pexelsApiKey ?? '').trim() : resolvePexelsApiKey();
  const commonsRateGate = createCommonsRateGate(boundedInt(options.commonsMinIntervalMs ?? 1000, 'commonsMinIntervalMs', 0, 60000), sleepImpl);
  const pexelsRateGate = createCommonsRateGate(boundedInt(options.pexelsMinIntervalMs ?? 1200, 'pexelsMinIntervalMs', 0, 60000), sleepImpl);
  const searchOutcomes = mode === 'execute' ? await mapBounded(tasks, 4, async (task) => {
    if (task.provider === 'commons') return requestCommons(task, maxResults, fetchImpl, commonsRateGate, sleepImpl);
    if (task.provider === 'pexels') return requestPexels(task, maxResults, fetchImpl, pexelsApiKey, pexelsRateGate, sleepImpl);
    if (task.provider === 'korean-official') return { candidates: [], provider_result_count: 0, query_mismatch_count: 0, query_mismatch_items: [], retry_count: 0, official_plan: planKoreanOfficialRoute(task.brief, task.media_type) };
    return requestKogl(task, maxResults, fetchImpl, koglCache).then((candidates) => ({ candidates, provider_result_count: candidates.length, query_mismatch_count: 0, query_mismatch_items: [], retry_count: 0 }));
  }) : [];
  for (const [index, task] of tasks.entries()) {
    const origins = task.origins ?? [{ brief: task.brief, route: task.route }];
    const base = { ...provenanceFor(task, { brief: task.brief, route: task.route }, mode === 'execute'), brief_ids: [...new Set(origins.map((origin) => origin.brief.brief_id))], provider_routes: [...new Set(origins.map((origin) => origin.route))], merged_origins: origins.map((origin) => provenanceFor(task, origin, mode === 'execute')), status: mode === 'plan' ? 'planned-not-executed' : 'pending', result_count: 0, provider_result_count: null, query_mismatch_count: 0, query_mismatch_items: [], retry_count: 0, error: null };
    if (mode === 'plan') { searches.push(base); continue; }
    const outcome = searchOutcomes[index];
    if (outcome?.error) { searches.push({ ...base, status: outcome.error === 'pexels_api_key_missing' ? 'blocked' : 'error', error: outcome.error, retry_count: outcome.retry_count ?? 0 }); continue; }
    if (outcome?.official_plan) { searches.push({ ...base, status: outcome.official_plan.status, official_plan: outcome.official_plan }); continue; }
    const found = outcome?.candidates ?? [];
    for (const candidate of found) for (const origin of origins) mergeCandidate(candidateMap, candidate, task, origin);
    searches.push({ ...base, status: found.length ? 'success' : outcome?.provider_result_count ? 'filtered-query-mismatch' : 'empty', result_count: found.length, provider_result_count: outcome?.provider_result_count ?? found.length, query_mismatch_count: outcome?.query_mismatch_count ?? 0, query_mismatch_items: outcome?.query_mismatch_items ?? [], retry_count: outcome?.retry_count ?? 0 });
  }
  const candidates = [...new Set(candidateMap.values())];
  const candidateDownloadChecks = [];
  let eligibleDownloads = [];
  if (mode === 'execute' && downloadLimit) {
    const briefById = new Map(briefs.map((brief) => [brief.brief_id, brief]));
    for (const candidate of candidates) {
      if (!['commons', 'pexels'].includes(candidate.provider) || candidate.status !== 'candidate-pending-review') continue;
      if (hasExistingCandidateFile(outputRoot, candidate)) {
        candidateDownloadChecks.push({ candidate_id: candidate.candidate_id, provider: candidate.provider, eligible: false, status: 'already-downloaded-in-corpus', blockers: [] });
        continue;
      }
      const expectedRoute = candidate.provider === 'commons' ? 'commons-object' : PEXELS_ROUTE;
      const objectOrigins = candidate.provenance_matches.filter((match) => match.provider_route === expectedRoute).map((match) => briefById.get(match.brief_id)).filter((brief) => brief?.specificity === 'generic-object' && brief.role !== 'off-canvas-evidence');
      if (!objectOrigins.length) {
        candidateDownloadChecks.push({ candidate_id: candidate.candidate_id, provider: candidate.provider, eligible: false, status: 'outside-generic-object-download-scope', blockers: [`no-generic-object-${candidate.provider}-origin`] });
        continue;
      }
      const blockersFor = candidate.provider === 'commons' ? downloadBlockers : pexelsDownloadBlockers;
      const testedOrigins = objectOrigins.map((brief) => ({ brief, blockers: blockersFor(candidate, brief) }));
      const accepted = testedOrigins.find((item) => item.blockers.length === 0);
      if (accepted) eligibleDownloads.push({ candidate, brief: accepted.brief });
      else {
        const blockers = [...new Set(testedOrigins.flatMap((item) => item.blockers))];
        candidate.asset_acquisition = { status: 'not-downloaded-rejected-precondition', local_path: null, sha256: null, decoded: false, blockers, production_authority: false };
        candidateDownloadChecks.push({ candidate_id: candidate.candidate_id, provider: candidate.provider, eligible: false, status: 'rejected-precondition', blockers });
      }
    }
    const rankedDownloads = rankCandidatesForAcquisition(eligibleDownloads, downloadLimit);
    const selectedIds = new Set(rankedDownloads.slice(0, downloadLimit).map((item) => item.candidate.candidate_id));
    for (const item of rankedDownloads) candidateDownloadChecks.push({ candidate_id: item.candidate.candidate_id, eligible: selectedIds.has(item.candidate.candidate_id), status: selectedIds.has(item.candidate.candidate_id) ? 'selected-for-bounded-download' : 'skipped-download-limit', blockers: [], selection_rank: item.selection_rank, newly_covered_brief_count: item.newly_covered_brief_count, semantic_novelty_score: item.semantic_novelty_score });
    const rankedIds = new Set(rankedDownloads.map((item) => item.candidate.candidate_id));
    for (const item of eligibleDownloads) if (!rankedIds.has(item.candidate.candidate_id)) candidateDownloadChecks.push({ candidate_id: item.candidate.candidate_id, eligible: false, status: 'skipped-download-limit', blockers: [] });
    eligibleDownloads = rankedDownloads;
    const shaToCandidate = new Map();
    for (const { candidate, brief } of eligibleDownloads) {
      if (candidate.provider === 'commons') await acquireCommonsCandidate(candidate, brief, outputRoot, fetchImpl, options.ffprobePath ?? 'ffprobe', shaToCandidate);
      else await acquirePexelsCandidate(candidate, brief, outputRoot, fetchImpl, options.ffprobePath ?? 'ffprobe', shaToCandidate);
    }
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceModeSnapshot = Array.isArray(spec?.cuts) ? spec.cuts.map((cut) => ({ cut_id: safeText(cut?.shot_id), production_mode: safeText(cut?.production_mode), selected_mode: safeText(cut?.production_decision?.mode), purpose: safeText(cut?.production_decision?.purpose) })) : [];
  const ledger = {
    schema_version: 1, episode_id: 'episode-001', revision: 'broad-discovery-v01', generated_at: generatedAt,
    source_binding: { episode_spec_sha256: sourceSpecSha256, ordered_task_set_sha256: orderedTaskSetSha256, cut_filter: cutIds },
    run_mode: mode === 'plan' ? 'plan-no-network' : 'execute-metadata-only', query_limits: { max_executed_queries: maxQueries, requested_query_declarations: requestedTasks.length, distinct_query_requests: uniqueTasks.length, query_offset: queryOffset, selected_queries: tasks.length, automatic_window_traversal: allQueryWindows, query_windows_traversed: tasks.length ? Math.ceil(((queryOffset % maxQueries) + tasks.length) / maxQueries) : 0, total_query_windows: Math.ceil(uniqueTasks.length / maxQueries), next_query_offset: Math.min(queryOffset + tasks.length, orderedTasks.length), remaining_queries: Math.max(0, orderedTasks.length - queryOffset - tasks.length), queries_outside_this_window: skippedCount, max_results_per_query: maxResults },
    production_decision: { source_mode_preserved: true, missing_results_disposition: 'leave-original-production_decision-unchanged', authority: 'metadata-discovery-only', production_authority: false, source_mode_snapshot: sourceModeSnapshot },
    requested_queries: requestedTasks.map((task) => provenanceFor(task, { brief: task.brief, route: task.route }, false)),
    not_executed_this_run: orderedTasks.map((task, index) => ({ task, index })).filter(({ index }) => index < queryOffset || index >= queryOffset + tasks.length).map(({ task, index }) => ({ ...provenanceFor(task, { brief: task.brief, route: task.route }, false), reason: index < queryOffset ? 'before-query-offset' : 'after-current-query-window' })), searches, official_route_plans: officialRoutePlans, unsupported_routes: unsupportedRoutes, candidates, candidate_download_checks: candidateDownloadChecks,
    acquisition_summary: { requested_candidate_download_limit: downloadLimit, eligible_candidates_before_limit: candidateDownloadChecks.filter((item) => item.status === 'selected-for-bounded-download' || item.status === 'skipped-download-limit').length, blocked_candidates: candidateDownloadChecks.filter((item) => item.status === 'rejected-precondition').length, downloaded_candidates: candidates.filter((candidate) => candidate.asset_acquisition.status === 'downloaded-candidate-pending-human-review').length, production_eligible: false },
  };
  if (mode === 'execute') ledger.run_mode = downloadLimit ? 'execute-metadata-and-bounded-candidate-download' : 'execute-metadata-only';
  const ledgerPath = outputFilePath(outputRoot, generatedAt);
  if (options.writeLedger !== false) atomicJson(ledgerPath, ledger);
  return { ledger, ledgerPath };
}
function parseArgs(argv) {
  const result = { mode: 'plan', providers: [], cutIds: [], maxQueries: 24, maxResults: 8, downloadCandidates: 0, queryOffset: 0, allQueryWindows: false };
  const bools = new Set(['--plan', '--execute']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all-query-windows') { result.allQueryWindows = true; continue; }
    if (bools.has(arg)) { const nextMode = arg.slice(2); if (result.modeExplicit && result.mode !== nextMode) throw new Error('Use either --plan or --execute'); result.mode = nextMode; result.modeExplicit = true; continue; }
    const [flag, inline] = arg.split('=', 2);
    const value = inline ?? argv[++index]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--provider') result.providers = value.split(',').map((item) => item.trim()).filter(Boolean);
    else if (flag === '--cut-id') result.cutIds = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    else if (flag === '--max-queries') result.maxQueries = boundedInt(value, flag, 1, 24);
    else if (flag === '--max-results') result.maxResults = boundedInt(value, flag, 1, 8);
    else if (flag === '--query-offset') result.queryOffset = boundedInt(value, flag, 0, 1000000);
    else if (flag === '--download-candidates') result.downloadCandidates = boundedInt(value, flag, 1, 8);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (result.downloadCandidates && result.mode !== 'execute') throw new Error('--download-candidates requires --execute');
  return result;
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const { ledger, ledgerPath } = await runEpisodeMediaDiscovery(options);
    process.stdout.write(`${JSON.stringify({ ledger: path.relative(ROOT, ledgerPath).replaceAll('\\', '/'), mode: ledger.run_mode, requested_queries: ledger.requested_queries.length, selected_queries: ledger.searches.length, next_query_offset: ledger.query_limits.next_query_offset, remaining_queries: ledger.query_limits.remaining_queries, results: ledger.candidates.length, errors: ledger.searches.filter((search) => search.status === 'error').length, downloaded_candidates: ledger.acquisition_summary.downloaded_candidates, production_authority: false }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'discovery_failed'}\n`); process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
