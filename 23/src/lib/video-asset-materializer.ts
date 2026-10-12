import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type {CutAsset, SourceAssetLayerDerivative, SourceAssetMaterialization, SourceVideoTimecode} from '../../video/src/cut-manifest.ts';
import {openArchiveDb} from './db.ts';

type SubjectKind = 'person' | 'building' | 'object' | 'interior';
type LayerRole = CutAsset['role'];

export type MaterializeLayerRequest = {
  asset_id: string;
  layer_name: string;
  subject_kind: SubjectKind;
  role: LayerRole;
  z_index: number;
  input: {
    type: 'alpha-mask' | 'transparent-png';
    path: string;
    method: 'manual-mask' | 'external-segmentation';
    provider?: string | null;
    note: string;
  };
};

export type MaterializeMediaRequest = {
  media_asset_id: number;
  cut_dir: string;
  route: 'source' | 'transparent-layers' | 'scoped-document-derivatives';
  usage: 'documentary-evidence' | 'context' | 'explanation';
  source_asset?: {asset_id: string; role: LayerRole; z_index: number};
  layers?: MaterializeLayerRequest[];
  authorization_id?: string;
  output_ids?: string[];
};

type ScopedOutput = {
  output_id: string; source_path: string; destination_file: `assets/${string}` | `source-photo/${string}`; asset_id: string;
  role: LayerRole; z_index: number; mime_type: 'image/png'; sha256: string; bytes: number;
  allowed_usage: MaterializeMediaRequest['usage']; website_ui_excluded: true;
  derivation_recipe_sha256?: string; source_crop_applied?: true; screenshot_pixels_used?: false;
};
type ScopedAuthorization = {
  schema_version: 1; state: 'approved'; authorization_id: string; route: 'scoped-document-derivatives';
  parent_source_sha256: string; approval_marker_path: string; approval_marker_sha256: string;
  reviewed_crop_sha256?: string; reviewed_contact_sha256?: string;
  exact_deletion_text?: string; exact_retained_text?: string;
  whole_screenshot_materialization_allowed: false;
  outputs: ScopedOutput[];
};

type MediaRow = {
  id: number;
  media_type: 'photo' | 'video' | 'audio' | 'document';
  path: string;
  original_url: string;
  sha256: string | null;
  mime_type: string;
  bytes: number | null;
  duration_seconds: number | null;
  license: string;
  attribution: string;
  source_id: string;
  review_state: string | null;
  review_note: string | null;
  properties_json: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
  'video/mpeg': '.mpeg',
};
const MEDIA_MIME: Record<string, CutAsset['media_type']> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'video/mp4': 'video/mp4',
  'video/webm': 'video/webm',
  'video/quicktime': 'video/quicktime',
  'video/x-m4v': 'video/x-m4v',
  'video/mpeg': 'video/mpeg',
};

const sha256 = (buffer: Buffer | Uint8Array) => crypto.createHash('sha256').update(buffer).digest('hex');
const portable = (value: string) => value.replaceAll('\\', '/');

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function realPathWithMissing(target: string) {
  const missing: string[] = [];
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(fs.realpathSync.native(current), ...missing);
}

function assertCutContained(cutRoot: string, candidate: string, label: string) {
  const root = fs.realpathSync.native(cutRoot);
  if (!inside(root, path.resolve(candidate))) throw new Error(`${label} escapes cut_dir`);
  let resolved;
  try { resolved = realPathWithMissing(candidate); } catch { throw new Error(`${label} cannot be resolved safely`); }
  if (!inside(root, resolved)) throw new Error(`${label} escapes cut_dir through a link`);
  return resolved;
}

function safeId(value: string, label: string) {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must use 1-64 lowercase letters, digits, dot, underscore or hyphen`);
  return value;
}

function fileHash(file: string) {
  return sha256(fs.readFileSync(file));
}

function reviewedMediaAsset(id: number, route: MaterializeMediaRequest['route']): MediaRow {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('media_asset_id must be a positive integer');
  const db = openArchiveDb();
  try {
    const row = db.prepare(`SELECT m.id,m.media_type,m.path,m.original_url,m.sha256,m.mime_type,m.bytes,m.duration_seconds,
      m.license,m.attribution,m.properties_json,g.external_key AS source_id,q.state AS review_state,q.note AS review_note
      FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id
      LEFT JOIN review_queue q ON q.entity_type='media_asset' AND q.entity_id=m.id
      WHERE m.id=?`).get(id) as MediaRow | undefined;
    if (!row) throw new Error(`media asset ${id} does not exist`);
    if (route === 'scoped-document-derivatives') {
      let properties: Record<string, unknown>;
      try { properties = JSON.parse(row.properties_json) as Record<string, unknown>; } catch { throw new Error(`media asset ${id} properties_json is invalid`); }
      const scoped = properties.scoped_materialization as ScopedAuthorization | undefined;
      if (row.review_state !== 'pending' || scoped?.state !== 'approved' || scoped.route !== route || scoped.whole_screenshot_materialization_allowed !== false) {
        throw new Error(`media asset ${id} has no approved scoped-document derivative authorization`);
      }
    } else {
      if (row.review_state !== 'approved') throw new Error(`media asset ${id} is not approved in review_queue`);
      if (!row.review_note?.trim()) throw new Error(`media asset ${id} approval has no rights/source review note`);
    }
    if (!['photo', 'video'].includes(row.media_type)) throw new Error(`media asset ${id} is not photo/video`);
    if (!SHA256.test(row.sha256 ?? '')) throw new Error(`media asset ${id} has no valid stored SHA-256`);
    if (!row.original_url || !/^https?:\/\//iu.test(row.original_url)) throw new Error(`media asset ${id} has no HTTP(S) original_url`);
    if (!row.license.trim() || !row.attribution.trim() || !row.source_id.trim()) throw new Error(`media asset ${id} has incomplete license/attribution/source id`);
    return row;
  } finally {
    db.close();
  }
}

function scopedAuthorization(row: MediaRow, request: MaterializeMediaRequest) {
  let properties: Record<string, unknown>;
  try { properties = JSON.parse(row.properties_json) as Record<string, unknown>; } catch { throw new Error(`media asset ${row.id} properties_json is invalid`); }
  const authorization = properties.scoped_materialization as ScopedAuthorization | undefined;
  if (!authorization || authorization.state !== 'approved' || authorization.route !== 'scoped-document-derivatives') throw new Error('scoped derivative authorization is missing');
  if (request.authorization_id !== authorization.authorization_id) throw new Error('scoped derivative authorization_id mismatch');
  if (authorization.parent_source_sha256 !== row.sha256 || authorization.whole_screenshot_materialization_allowed !== false) throw new Error('scoped derivative parent/source boundary is invalid');
  const legacyReviewBinding = SHA256.test(authorization.reviewed_crop_sha256 ?? '') && SHA256.test(authorization.reviewed_contact_sha256 ?? '');
  const pairedStatutoryBinding = authorization.authorization_id === 'SH006-statutory-document-content-v04'
    && authorization.exact_deletion_text === '제196조를 삭제한다.'
    && authorization.exact_retained_text === '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.'
    && authorization.outputs.length === 3
    && authorization.outputs.every((output) => SHA256.test(output.derivation_recipe_sha256 ?? '') && output.screenshot_pixels_used === false);
  if (!SHA256.test(authorization.approval_marker_sha256) || (!legacyReviewBinding && !pairedStatutoryBinding)) throw new Error('scoped derivative review hash binding is invalid');
  const markerPath = path.resolve(authorization.approval_marker_path);
  if (!fs.existsSync(markerPath) || fileHash(markerPath) !== authorization.approval_marker_sha256) throw new Error('scoped derivative approval marker hash mismatch');
  const requested = request.output_ids ?? [];
  if (!requested.length || new Set(requested).size !== requested.length) throw new Error('scoped derivative route requires unique output_ids');
  const outputs = requested.map((outputId) => {
    const output = authorization.outputs.find((candidate) => candidate.output_id === outputId);
    if (!output) throw new Error(`scoped derivative output is not authorized: ${outputId}`);
    if (output.allowed_usage !== request.usage || !output.website_ui_excluded || !['assets/', 'source-photo/'].some((prefix) => output.destination_file.startsWith(prefix))) throw new Error(`scoped derivative output scope is invalid: ${outputId}`);
    safeId(output.asset_id, `scoped output ${outputId} asset_id`);
    const input = path.resolve(output.source_path);
    if (!fs.existsSync(input) || !fs.statSync(input).isFile() || fileHash(input) !== output.sha256 || fs.statSync(input).size !== output.bytes) throw new Error(`scoped derivative output hash/bytes mismatch: ${outputId}`);
    return {...output, input_path: input};
  });
  return {authorization, outputs};
}

function resolveSource(row: MediaRow) {
  const rawRoot = fs.realpathSync(process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw'));
  const source = fs.realpathSync(path.resolve(row.path));
  if (!inside(rawRoot, source)) throw new Error(`media asset ${row.id} path is outside ARCHIVE_RAW_ROOT`);
  if (!fs.statSync(source).isFile()) throw new Error(`media asset ${row.id} path is not a file`);
  if (fileHash(source) !== row.sha256) throw new Error(`media asset ${row.id} source SHA-256 does not match the database`);
  if (fs.statSync(source).size !== row.bytes) throw new Error(`media asset ${row.id} byte count does not match the database`);
  return source;
}

async function validatePhoto(file: string) {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`image is not decodable: ${file}`);
  return {width: metadata.width, height: metadata.height};
}

function validateVideo(file: string) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  try {
    const report = JSON.parse(result.stdout || '{}') as {format?: {duration?: string}; streams?: Array<{codec_type?: string; codec_name?: string; width?: number; height?: number}>};
    const stream = report.streams?.find((item) => item.codec_type === 'video');
    const duration = Number(report.format?.duration);
    if (result.status !== 0 || !(duration > 0) || !stream?.codec_name || !stream.width || !stream.height) throw new Error();
    return {duration_seconds: duration, video_codec: stream.codec_name, width: stream.width, height: stream.height};
  } catch {
    throw new Error(`video is not decodable or has no positive-duration video stream: ${file}`);
  }
}

function videoMetadata(row: MediaRow, actual: ReturnType<typeof validateVideo>) {
  let properties: Record<string, unknown>;
  try { properties = JSON.parse(row.properties_json) as Record<string, unknown>; } catch { throw new Error(`media asset ${row.id} properties_json is invalid`); }
  const timecode = properties.source_timecode as SourceVideoTimecode | undefined;
  const recordedDuration = Number(properties.source_duration_seconds);
  const dimensions = properties.source_dimensions as {width?: number; height?: number} | undefined;
  if (!timecode || !(timecode.start_seconds >= 0) || !(timecode.end_seconds > timecode.start_seconds) || timecode.end_seconds > actual.duration_seconds + 0.001) throw new Error(`media asset ${row.id} has missing or out-of-bounds source timecode`);
  for (const key of ['start', 'end', 'speaker', 'context', 'locator', 'locator_basis'] as const) if (!String(timecode[key] ?? '').trim()) throw new Error(`media asset ${row.id} source timecode ${key} is missing`);
  if (!(row.duration_seconds && Math.abs(row.duration_seconds - actual.duration_seconds) <= 0.001) || Math.abs(recordedDuration - actual.duration_seconds) > 0.001) throw new Error(`media asset ${row.id} source video duration metadata does not match ffprobe`);
  if (properties.video_codec !== actual.video_codec || dimensions?.width !== actual.width || dimensions?.height !== actual.height || properties.whole_original_preserved !== true) throw new Error(`media asset ${row.id} source video metadata does not match ffprobe or whole-original contract`);
  return {timecode, ...actual};
}

function validateRequest(request: MaterializeMediaRequest, row: MediaRow, manifest: Record<string, unknown>) {
  if (!['source', 'transparent-layers', 'scoped-document-derivatives'].includes(request.route)) throw new Error('route must be source, transparent-layers or scoped-document-derivatives');
  if (!['documentary-evidence', 'context', 'explanation'].includes(request.usage)) throw new Error('usage is invalid');
  const review = manifest.review as {user_pass?: boolean} | undefined;
  const approvals = manifest.approvals as {generation_input?: {user_pass?: boolean}; playable_cut?: {user_pass?: boolean}} | undefined;
  if (review?.user_pass || approvals?.generation_input?.user_pass || approvals?.playable_cut?.user_pass) {
    throw new Error('reviewed/PASS manifests are immutable; invalidate review and create a new candidate first');
  }
  if (['approved', 'picture-locked', 'audio-locked'].includes(String(manifest.review_state))) throw new Error('locked manifest cannot receive materialized media');
  if (request.route === 'source') {
    if (!request.source_asset || request.layers?.length) throw new Error('source route requires source_asset and no layers');
    safeId(request.source_asset.asset_id, 'source_asset.asset_id');
    const expectedMode = row.media_type === 'photo' ? 'source-photo' : 'source-video';
    if (manifest.production_mode !== expectedMode) throw new Error(`source route requires manifest production_mode=${expectedMode}`);
  } else if (request.route === 'transparent-layers') {
    if (row.media_type !== 'photo') throw new Error('transparent layers can only be derived from photos');
    if (request.usage === 'documentary-evidence') throw new Error('transparent cutouts cannot replace documentary evidence; use route=source for evidence');
    if (manifest.production_mode !== 'remotion') throw new Error('transparent layers require manifest production_mode=remotion');
    if (!request.layers?.length) throw new Error('transparent-layers route requires at least one layer');
    const ids = new Set<string>();
    for (const layer of request.layers) {
      safeId(layer.asset_id, 'layer.asset_id');
      safeId(layer.layer_name, 'layer.layer_name');
      if (ids.has(layer.asset_id)) throw new Error(`duplicate layer asset_id ${layer.asset_id}`);
      ids.add(layer.asset_id);
      if (!['person', 'building', 'object', 'interior'].includes(layer.subject_kind)) throw new Error(`invalid subject_kind ${layer.subject_kind}`);
      if (!Number.isSafeInteger(layer.z_index)) throw new Error(`layer ${layer.asset_id} z_index must be an integer`);
      if (layer.input.type === 'alpha-mask' && layer.input.method !== 'manual-mask') throw new Error('alpha-mask input must be honestly recorded as manual-mask');
      if (layer.input.type === 'transparent-png' && layer.input.method !== 'external-segmentation') throw new Error('transparent-png input must be recorded as external-segmentation');
      if (!layer.input.note?.trim()) throw new Error(`layer ${layer.asset_id} requires a derivation note`);
      if (layer.input.method === 'external-segmentation' && !layer.input.provider?.trim()) throw new Error(`layer ${layer.asset_id} external segmentation requires provider`);
    }
  } else {
    if (row.media_type !== 'photo' || manifest.production_mode !== 'source-photo' || request.usage !== 'documentary-evidence') throw new Error('scoped document derivatives require a source-photo documentary-evidence cut');
    if (request.source_asset || request.layers?.length) throw new Error('scoped document derivatives reject source_asset/layers and whole-screenshot materialization');
    if (!request.authorization_id || !request.output_ids?.length) throw new Error('scoped document derivatives require authorization_id and output_ids');
  }
  const occupied = new Set(((manifest.assets as Array<{asset_id?: string}> | undefined) ?? []).map((item) => item.asset_id));
  const requested = request.route === 'source' ? [request.source_asset!.asset_id]
    : request.route === 'transparent-layers' ? request.layers!.map((item) => item.asset_id) : [];
  for (const id of requested) if (occupied.has(id)) throw new Error(`manifest already contains asset_id ${id}`);
}

async function alphaStats(file: string) {
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] < 255) transparentPixels += 1;
    if (data[index] > 0) visiblePixels += 1;
  }
  if (transparentPixels === 0 || visiblePixels === 0) throw new Error(`transparent PNG must contain both transparent and visible pixels: ${file}`);
  return {width: info.width, height: info.height, transparentPixels, visiblePixels};
}

async function buildMaskedPng(source: string, mask: string, output: string) {
  const sourceResult = await sharp(source).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject: true});
  const maskResult = await sharp(mask).greyscale().raw().toBuffer({resolveWithObject: true});
  if (sourceResult.info.width !== maskResult.info.width || sourceResult.info.height !== maskResult.info.height) {
    throw new Error('alpha mask dimensions must exactly match the source photo');
  }
  const pixels = sourceResult.info.width * sourceResult.info.height;
  const rgba = Buffer.allocUnsafe(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    rgba[index * 4] = sourceResult.data[index * sourceResult.info.channels];
    rgba[index * 4 + 1] = sourceResult.data[index * sourceResult.info.channels + 1];
    rgba[index * 4 + 2] = sourceResult.data[index * sourceResult.info.channels + 2];
    rgba[index * 4 + 3] = maskResult.data[index * maskResult.info.channels];
  }
  await sharp(rgba, {raw: {width: sourceResult.info.width, height: sourceResult.info.height, channels: 4}}).png().toFile(output);
}

function atomicJson(file: string, value: unknown, cutRoot: string) {
  assertCutContained(cutRoot, file, 'manifest destination');
  const temp = `${file}.tmp-${crypto.randomUUID()}`;
  assertCutContained(cutRoot, temp, 'manifest temporary destination');
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx'});
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* best effort */ }
    throw error;
  }
}

function copyExact(source: string, destination: string, cutRoot: string) {
  assertCutContained(cutRoot, destination, 'cut-local destination');
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  assertCutContained(cutRoot, destination, 'cut-local destination');
  if (fs.existsSync(destination)) {
    if (fileHash(source) !== fileHash(destination)) throw new Error(`destination collision: ${destination}`);
    return false;
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  return true;
}

export async function planMediaMaterialization(request: MaterializeMediaRequest) {
  const row = reviewedMediaAsset(request.media_asset_id, request.route);
  const source = resolveSource(row);
  const cutDir = fs.realpathSync(path.resolve(request.cut_dir));
  const manifestPath = path.join(cutDir, 'manifest.json');
  if (!inside(cutDir, manifestPath) || !fs.statSync(manifestPath).isFile()) throw new Error('cut_dir must contain manifest.json');
  assertCutContained(cutDir, manifestPath, 'manifest path');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  validateRequest(request, row, manifest);
  const scoped = request.route === 'scoped-document-derivatives' ? scopedAuthorization(row, request) : null;
  if (scoped) {
    for (const output of scoped.outputs) {
      const destination = path.join(cutDir, output.destination_file);
      assertCutContained(cutDir, destination, `scoped output ${output.output_id}`);
      const occupied = ((manifest.assets as CutAsset[] | undefined) ?? []).find((asset) => asset.asset_id === output.asset_id);
      if (occupied && (occupied.file !== output.destination_file || occupied.sha256 !== output.sha256 || occupied.source_id !== row.source_id)) throw new Error(`manifest asset_id collision for scoped output ${output.output_id}`);
    }
    return {row, source, cutDir, manifestPath, manifest, sourceRelative: scoped.outputs[0].destination_file, layers: [], video: null, scoped};
  }
  const video = row.media_type === 'photo' ? null : videoMetadata(row, validateVideo(source));
  const extension = MIME_EXTENSION[row.mime_type];
  if (!extension || !MEDIA_MIME[row.mime_type]) throw new Error(`unsupported media MIME type ${row.mime_type}`);
  const sourceFolder = row.media_type === 'photo' ? 'source-photo' : 'source-video';
  const sourceRelative = `${sourceFolder}/media-${row.id}-${row.sha256!.slice(0, 12)}${extension}`;
  const layers = [];
  for (const layer of request.layers ?? []) {
    const input = fs.realpathSync(path.resolve(layer.input.path));
    if (!fs.statSync(input).isFile()) throw new Error(`layer input is not a file: ${layer.input.path}`);
    if (path.extname(input).toLowerCase() !== '.png') throw new Error(`layer ${layer.asset_id} input must be PNG`);
    if (layer.input.type === 'alpha-mask') {
      const sourceSize = await validatePhoto(source);
      const maskSize = await validatePhoto(input);
      if (sourceSize.width !== maskSize.width || sourceSize.height !== maskSize.height) throw new Error(`layer ${layer.asset_id} mask dimensions do not match source`);
    } else {
      await alphaStats(input);
    }
    layers.push({...layer, input_path: input, input_sha256: fileHash(input), output: `assets/${layer.asset_id}.png`});
  }
  return {row, source, cutDir, manifestPath, manifest, sourceRelative, layers, video, scoped: null};
}

export async function materializeMediaAsset(request: MaterializeMediaRequest, options: {dryRun?: boolean} = {}) {
  const plan = await planMediaMaterialization(request);
  const summary = {
    dry_run: options.dryRun === true,
    media_asset_id: plan.row.id,
    source_id: plan.row.source_id,
    source_file: plan.sourceRelative,
    derivative_files: plan.scoped ? plan.scoped.outputs.map((item) => item.destination_file) : plan.layers.map((item) => item.output),
    state: request.route === 'source' ? 'source-ready' : request.route === 'scoped-document-derivatives' ? 'scoped-derivatives-ready' : 'asset-ready-presentation-pending',
  } as const;
  if (options.dryRun) return summary;

  const createdFiles: string[] = [];
  try {
    if (plan.scoped) {
      for (const output of plan.scoped.outputs) {
        const destination = path.join(plan.cutDir, output.destination_file);
        if (copyExact(output.input_path, destination, plan.cutDir)) createdFiles.push(destination);
        await validatePhoto(destination);
      }
      const manifest = structuredClone(plan.manifest) as Record<string, unknown>;
      const assets = (manifest.assets as CutAsset[] | undefined) ?? [];
      for (const output of plan.scoped.outputs) if (!assets.some((asset) => asset.asset_id === output.asset_id)) assets.push({
        asset_id: output.asset_id, file: output.destination_file, media_type: 'image/png', role: output.role, z_index: output.z_index,
        source_id: plan.row.source_id, sha256: output.sha256, ...(output.source_crop_applied === true || output.output_id === 'document-focus-hires' ? {source_crop_applied: true} : {}),
      });
      manifest.assets = assets;
      const sourceMaterials = (manifest.source_materials as Array<Record<string, unknown>> | undefined) ?? [];
      if (!sourceMaterials.some((item) => item.source_id === plan.row.source_id)) sourceMaterials.push({source_id: plan.row.source_id, original_url: plan.row.original_url,
        rights_status: 'scoped statutory-document derivatives only; full screenshot/UI rights unapproved', approval_status: 'pending'});
      manifest.source_materials = sourceMaterials;
      manifest.source_ids = [...new Set([...((manifest.source_ids as string[] | undefined) ?? []), plan.row.source_id])];
      const materializations = (manifest.source_asset_materializations as SourceAssetMaterialization[] | undefined) ?? [];
      const record: SourceAssetMaterialization = {
        media_asset_id: plan.row.id, source_id: plan.row.source_id, route: 'scoped-document-derivatives', usage: request.usage,
        review_state: 'scoped-approved',
        source: {file: plan.scoped.outputs[0].destination_file, original_url: plan.row.original_url, license: '법률 원문·법률명·법률번호·일자 문서 내용에 한정(저작권법 제7조 제1호); 국가법령정보센터 로고·UI·아이콘 사용 제외',
          attribution: '국가법령정보센터 형사소송법 일부개정법률 문서 내용', media_type: 'photo', mime_type: 'image/png', sha256: plan.scoped.outputs[0].sha256, bytes: plan.scoped.outputs[0].bytes},
        derivatives: [],
        scoped_authorization: {authorization_id: plan.scoped.authorization.authorization_id, parent_source_sha256: plan.scoped.authorization.parent_source_sha256,
          approval_marker_path: plan.scoped.authorization.approval_marker_path, approval_marker_sha256: plan.scoped.authorization.approval_marker_sha256,
          outputs: plan.scoped.outputs.map((output) => ({output_id: output.output_id, file: output.destination_file, sha256: output.sha256, bytes: output.bytes, asset_id: output.asset_id}))},
        state: 'scoped-derivatives-ready',
      };
      const prior = materializations.find((item) => item.media_asset_id === plan.row.id && item.route === record.route);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(record)) throw new Error('existing scoped materialization differs from authorized record');
      } else materializations.push(record);
      manifest.source_asset_materializations = materializations;
      atomicJson(plan.manifestPath, manifest, plan.cutDir);
      return summary;
    }
    const sourceDestination = path.join(plan.cutDir, plan.sourceRelative);
    if (copyExact(plan.source, sourceDestination, plan.cutDir)) createdFiles.push(sourceDestination);
    const derivatives: SourceAssetLayerDerivative[] = [];
    for (const layer of plan.layers) {
      const destination = path.join(plan.cutDir, layer.output);
      assertCutContained(plan.cutDir, destination, `layer ${layer.asset_id} destination`);
      if (fs.existsSync(destination)) throw new Error(`destination collision: ${destination}`);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      if (layer.input.type === 'alpha-mask') {
        createdFiles.push(destination);
        await buildMaskedPng(plan.source, layer.input_path, destination);
      } else if (copyExact(layer.input_path, destination, plan.cutDir)) {
        createdFiles.push(destination);
      }
      const alpha = await alphaStats(destination);
      const inputFile = layer.input.type === 'alpha-mask'
        ? `derivation-inputs/${layer.asset_id}-mask-${layer.input_sha256.slice(0, 12)}.png`
        : layer.output;
      if (layer.input.type === 'alpha-mask') {
        const inputDestination = path.join(plan.cutDir, inputFile);
        if (copyExact(layer.input_path, inputDestination, plan.cutDir)) createdFiles.push(inputDestination);
      }
      derivatives.push({
        asset_id: layer.asset_id,
        layer_name: layer.layer_name,
        subject_kind: layer.subject_kind,
        file: layer.output as `assets/${string}.png`,
        sha256: fileHash(destination),
        width: alpha.width,
        height: alpha.height,
        alpha: {transparent_pixels: alpha.transparentPixels, visible_pixels: alpha.visiblePixels},
        derivation_input: {
          type: layer.input.type,
          file: portable(inputFile),
          sha256: layer.input_sha256,
          method: layer.input.method,
          provider: layer.input.provider?.trim() || null,
          note: layer.input.note.trim(),
        },
      });
    }

    const manifest = structuredClone(plan.manifest) as Record<string, unknown>;
    const assets = (manifest.assets as CutAsset[] | undefined) ?? [];
    if (request.route === 'source') {
      assets.push({
        asset_id: request.source_asset!.asset_id,
        file: plan.sourceRelative,
        media_type: MEDIA_MIME[plan.row.mime_type],
        role: request.source_asset!.role,
        z_index: request.source_asset!.z_index,
        source_id: plan.row.source_id,
        sha256: plan.row.sha256!,
        ...(plan.video ? {source_duration_seconds: plan.video.duration_seconds, source_timecode: plan.video.timecode} : {}),
      });
    } else {
      for (const [index, derivative] of derivatives.entries()) {
        const layer = request.layers![index];
        assets.push({asset_id: derivative.asset_id, file: derivative.file, media_type: 'image/png', role: layer.role,
          z_index: layer.z_index, source_id: plan.row.source_id, sha256: derivative.sha256});
      }
    }
    manifest.assets = assets;
    const sourceMaterials = (manifest.source_materials as Array<Record<string, unknown>> | undefined) ?? [];
    sourceMaterials.push({source_id: plan.row.source_id, original_url: plan.row.original_url,
      rights_status: plan.row.license, approval_status: 'approved'});
    manifest.source_materials = sourceMaterials;
    manifest.source_ids = [...new Set([...((manifest.source_ids as string[] | undefined) ?? []), plan.row.source_id])];
    const materializations = (manifest.source_asset_materializations as SourceAssetMaterialization[] | undefined) ?? [];
    materializations.push({
      media_asset_id: plan.row.id,
      source_id: plan.row.source_id,
      route: request.route,
      usage: request.usage,
      review_state: 'approved',
      source: {
        file: plan.sourceRelative as SourceAssetMaterialization['source']['file'],
        original_url: plan.row.original_url,
        license: plan.row.license,
        attribution: plan.row.attribution,
        media_type: plan.row.media_type as 'photo' | 'video',
        mime_type: plan.row.mime_type,
        sha256: plan.row.sha256!,
        bytes: plan.row.bytes!,
        ...(plan.video ? {duration_seconds: plan.video.duration_seconds, video_codec: plan.video.video_codec, width: plan.video.width, height: plan.video.height, timecode: plan.video.timecode} : {}),
      },
      derivatives,
      state: request.route === 'source' ? 'source-ready' : 'asset-ready-presentation-pending',
    });
    manifest.source_asset_materializations = materializations;
    atomicJson(plan.manifestPath, manifest, plan.cutDir);
    return summary;
  } catch (error) {
    for (const file of createdFiles.reverse()) {
      try { fs.unlinkSync(file); } catch { /* exact-file rollback only */ }
    }
    throw error;
  }
}

export async function validateMaterializedSources(manifest: Record<string, unknown>, cutDir: string) {
  const failures: string[] = [];
  const root = fs.realpathSync(path.resolve(cutDir));
  const items = (manifest.source_asset_materializations as SourceAssetMaterialization[] | undefined) ?? [];
  const assets = (manifest.assets as CutAsset[] | undefined) ?? [];
  for (const [index, item] of items.entries()) {
    const label = `source_asset_materializations[${index}]`;
    if (item.route === 'scoped-document-derivatives') {
      const authorization = item.scoped_authorization;
      if (item.review_state !== 'scoped-approved' || item.state !== 'scoped-derivatives-ready' || !authorization || !SHA256.test(authorization.parent_source_sha256) || !SHA256.test(authorization.approval_marker_sha256)) {
        failures.push(`${label}: invalid scoped derivative authorization binding`);
        continue;
      }
      const marker = path.resolve(authorization.approval_marker_path);
      if (!fs.existsSync(marker) || fileHash(marker) !== authorization.approval_marker_sha256) failures.push(`${label}: scoped approval marker missing or hash-mismatched`);
      for (const output of authorization.outputs) {
        const outputPath = path.resolve(root, output.file);
        try { assertCutContained(root, outputPath, `${label}/${output.output_id}`); } catch { failures.push(`${label}/${output.output_id}: unsafe output path`); continue; }
        if (!fs.existsSync(outputPath) || fileHash(outputPath) !== output.sha256 || fs.statSync(outputPath).size !== output.bytes) failures.push(`${label}/${output.output_id}: output missing or hash/bytes mismatch`);
        if (!assets.some((asset) => asset.asset_id === output.asset_id && asset.file === output.file && asset.sha256 === output.sha256 && asset.source_id === item.source_id)) failures.push(`${label}/${output.output_id}: output is not bound to its manifest asset`);
      }
      continue;
    }
    const sourcePath = path.resolve(root, item.source?.file ?? '');
    try { assertCutContained(root, sourcePath, `${label} source`); } catch { failures.push(`${label}: missing, unsafe or link-escaped source file`); continue; }
    if (!fs.existsSync(sourcePath)) {
      failures.push(`${label}: missing or unsafe source file`);
      continue;
    }
    if (fileHash(sourcePath) !== item.source.sha256 || fs.statSync(sourcePath).size !== item.source.bytes) failures.push(`${label}: source hash/bytes mismatch`);
    if (item.route === 'transparent-layers' && item.usage === 'documentary-evidence') failures.push(`${label}: cutout cannot be documentary evidence`);
    if (item.route === 'source' && !assets.some((asset) => asset.file === item.source.file && asset.sha256 === item.source.sha256 && asset.source_id === item.source_id)) failures.push(`${label}: source route is not bound to a manifest asset`);
    if (item.source.media_type === 'video') {
      let actual;
      try { actual = validateVideo(sourcePath); } catch { failures.push(`${label}: source video is not decodable`); actual = null; }
      const timecode = item.source.timecode;
      if (!timecode || !(timecode.start_seconds >= 0) || !(timecode.end_seconds > timecode.start_seconds) || (actual && timecode.end_seconds > actual.duration_seconds + 0.001)) failures.push(`${label}: source video timecode is missing, invalid or out of bounds`);
      if (actual && (Math.abs((item.source.duration_seconds ?? 0) - actual.duration_seconds) > 0.001 || item.source.video_codec !== actual.video_codec || item.source.width !== actual.width || item.source.height !== actual.height)) failures.push(`${label}: source video ffprobe metadata mismatch`);
      if (!assets.some((asset) => asset.file === item.source.file && asset.source_timecode?.start_seconds === timecode?.start_seconds && asset.source_timecode?.end_seconds === timecode?.end_seconds && asset.source_duration_seconds === item.source.duration_seconds)) failures.push(`${label}: source video timecode is not preserved on the manifest asset`);
    }
    for (const derivative of item.derivatives ?? []) {
      const derivativePath = path.resolve(root, derivative.file);
      try { assertCutContained(root, derivativePath, `${label}/${derivative.asset_id} derivative`); } catch { failures.push(`${label}/${derivative.asset_id}: missing, unsafe or link-escaped derivative`); continue; }
      if (!fs.existsSync(derivativePath)) {
        failures.push(`${label}/${derivative.asset_id}: missing or unsafe derivative`);
        continue;
      }
      if (fileHash(derivativePath) !== derivative.sha256) failures.push(`${label}/${derivative.asset_id}: derivative hash mismatch`);
      if (!assets.some((asset) => asset.asset_id === derivative.asset_id && asset.file === derivative.file && asset.sha256 === derivative.sha256 && asset.source_id === item.source_id)) failures.push(`${label}/${derivative.asset_id}: derivative is not bound to the matching manifest asset`);
      try {
        const actual = await alphaStats(derivativePath);
        if (actual.width !== derivative.width || actual.height !== derivative.height
          || actual.transparentPixels !== derivative.alpha.transparent_pixels || actual.visiblePixels !== derivative.alpha.visible_pixels) {
          failures.push(`${label}/${derivative.asset_id}: alpha/decode metadata mismatch`);
        }
      } catch {
        failures.push(`${label}/${derivative.asset_id}: invalid transparent PNG`);
      }
      const inputPath = path.resolve(root, derivative.derivation_input.file);
      let inputSafe = true;
      try { assertCutContained(root, inputPath, `${label}/${derivative.asset_id} derivation input`); } catch { inputSafe = false; }
      if (!inputSafe || !fs.existsSync(inputPath) || fileHash(inputPath) !== derivative.derivation_input.sha256) {
        failures.push(`${label}/${derivative.asset_id}: derivation input missing, unsafe or hash-mismatched`);
      }
    }
  }
  return failures;
}
