import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const candidateRoot = path.join(repoRoot, 'video/qa/production-assets/episode-001/SH006-editorial-v01');
const assetRoot = path.join(candidateRoot, 'assets');
const outputRoot = path.join(candidateRoot, 'outputs');
const approvalRelative = 'video/qa/style-frames/episode-001/SH006-editorial-v03/style-frame-approval.json';
const approvalPath = path.join(repoRoot, approvalRelative);
const expectedApprovalSha = '43b32f709a7cc6441f96e710a269e2f5896a73853e615025867c859447ee3a08';
const expectedApprovedInputsSha = 'c59999fc4fc440c89c8b5aa27be53026e62699e9bcd6ba9e92207e5c2a0a623a';

const assetPlan = [
  {
    id: 'prosecutor-role',
    file: 'sh006-prosecutor-editorial.png',
    beat: 'B01',
    label: '검사 역할 인물',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 0,
    promptSummary: '승인 스타일의 남성 검사 역할 인물과 서류 폴더만 보존한 투명 배경 편집 컷아웃',
    evidenceUse: 'fictional-explanatory-role-only',
    generationSourceId: 'exec-5e4fc537-dda4-48ea-b57f-baf6310be695.png',
  },
  {
    id: 'suspect-dossier',
    file: 'sh006-suspect-dossier-editorial.png',
    beat: 'B01',
    label: '피의자 기록',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 1,
    promptSummary: '승인 스타일의 피의자 실루엣 도시에와 종이 클립을 독립 투명 PNG로 생성',
    evidenceUse: 'fictional-explanatory-prop-only',
    generationSourceId: 'exec-54dbdbe8-af49-4769-8d1f-4a82716524d3.png',
  },
  {
    id: 'facts-folder',
    file: 'sh006-facts-folder-editorial.png',
    beat: 'B01',
    label: '범죄사실 폴더',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 7,
    promptSummary: '승인 스타일의 열린 사건 서류 폴더를 독립 투명 PNG로 생성',
    evidenceUse: 'fictional-explanatory-prop-only',
    generationSourceId: 'exec-0d36b563-2c01-4802-adf9-93734c77c0ae.png',
  },
  {
    id: 'alley-photo',
    file: 'sh006-alley-photo-editorial.png',
    beat: 'B01',
    label: '가상 현장 사진',
    kind: 'imagegen-photo-card',
    alphaRequired: false,
    restingRotationDeg: -3,
    promptSummary: '실제 사건 자료가 아닌 가상의 한국 골목 야간 장면을 흑백 다큐 사진 카드로 생성',
    evidenceUse: 'fictional-reconstruction-only',
    generationSourceId: 'exec-9c8ad224-0b4e-4c89-aa48-0e40d55358b8.png',
  },
  {
    id: 'magnifier',
    file: 'sh006-magnifier-editorial.png',
    beat: 'B01',
    label: '증거 돋보기',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: -3,
    promptSummary: '황동 테두리와 나무 손잡이의 돋보기만 독립 투명 PNG로 생성',
    evidenceUse: 'fictional-explanatory-prop-only',
    generationSourceId: 'exec-565b9b4b-f9af-4c70-9a0d-73a636efed29.png',
  },
  {
    id: 'blank-law-document',
    file: 'sh006-blank-law-document-editorial.png',
    beat: 'B03',
    label: '법률 문서 표면',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: -0.5,
    promptSummary: '정확한 법률 문구를 Remotion으로 얹기 위한 무문자 아이보리 문서와 남색 받침 종이를 투명 PNG로 생성',
    evidenceUse: 'explanatory-surface-not-source-evidence',
    generationSourceId: 'exec-b9ba538f-454c-401f-a56d-cacde4f569aa.png',
  },
  {
    id: 'amendment-paper',
    file: 'sh006-amendment-paper-editorial.png',
    beat: 'B03',
    label: '개정안 종이',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: -7,
    promptSummary: '붉은 개정 종이와 남색 받침을 독립 투명 PNG로 생성',
    evidenceUse: 'explanatory-surface-not-source-evidence',
    generationSourceId: 'exec-8da670e5-e9f7-4eab-8e10-4c0d864f338d.png',
  },
  {
    id: 'deletion-stroke',
    file: 'sh006-deletion-stroke-editorial.svg',
    beat: 'B03',
    label: '삭제선',
    kind: 'designed-vector',
    alphaRequired: true,
    restingRotationDeg: -0.5,
    promptSummary: null,
    evidenceUse: 'self-created-explanatory-mark',
    generationSourceId: null,
  },
  {
    id: 'deleted-document',
    file: 'sh006-deleted-document-editorial.png',
    beat: 'B05',
    label: '삭제된 조문',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 0.8,
    promptSummary: '취소된 오래된 문서 오브젝트를 독립 투명 PNG로 생성',
    evidenceUse: 'explanatory-surface-not-source-evidence',
    generationSourceId: 'exec-182afcb1-8849-4f88-8319-70a9ae7d1f54.png',
  },
  {
    id: 'request-card',
    file: 'sh006-request-card-editorial.png',
    beat: 'B05',
    label: '보완수사요구',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: -10.5,
    promptSummary: '나중에 정확한 한글을 얹을 수 있는 무문자 요청 카드를 독립 투명 PNG로 생성',
    evidenceUse: 'explanatory-surface-not-source-evidence',
    generationSourceId: 'exec-fad57486-1955-4e17-8607-6f83d47fcf52.png',
  },
  {
    id: 'retained-document',
    file: 'sh006-retained-document-editorial.png',
    beat: 'B05',
    label: '남아 있는 조문',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 0,
    promptSummary: '정확한 법률 문구를 Remotion으로 얹기 위한 세로 문서를 독립 투명 PNG로 생성',
    evidenceUse: 'explanatory-surface-not-source-evidence',
    generationSourceId: 'exec-a488a670-e0b6-4df7-a7f7-8dbfdfdad1f4.png',
  },
  {
    id: 'public-office-building',
    file: 'sh006-public-office-building-editorial.png',
    beat: 'B05',
    label: '수사기관 맥락',
    kind: 'imagegen-cutout',
    alphaRequired: true,
    restingRotationDeg: 0,
    promptSummary: '특정 실제 기관이 아닌 가상의 한국 공공청사 건물을 독립 투명 PNG로 생성',
    evidenceUse: 'fictional-context-only',
    generationSourceId: 'exec-b83115f6-5c68-4d29-a485-c57f38e9d401.png',
  },
  {
    id: 'request-route',
    file: 'sh006-request-route-editorial.svg',
    beat: 'B05',
    label: '요구 전달 경로',
    kind: 'designed-vector',
    alphaRequired: true,
    restingRotationDeg: 0,
    promptSummary: null,
    evidenceUse: 'self-created-explanatory-path',
    generationSourceId: null,
  },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function inspectAsset(plan) {
  const absolute = path.join(assetRoot, plan.file);
  const bytes = await readFile(absolute);
  const metadata = await sharp(bytes).metadata();
  const row = {
    id: plan.id,
    path: path.relative(repoRoot, absolute).replaceAll('\\', '/'),
    sha256: sha256(bytes),
    dimensions: {width: metadata.width, height: metadata.height},
    beat_id: plan.beat,
    object_label: plan.label,
    asset_kind: plan.kind,
    independent_render_target: true,
    text_baked_in: false,
    alpha_required: plan.alphaRequired,
    resting_surface_rotation_deg: plan.restingRotationDeg,
    prompt_summary: plan.promptSummary,
    generation_source_id: plan.generationSourceId,
    evidence_use: plan.evidenceUse,
    rights_review_status: plan.kind.startsWith('imagegen') ? 'ai-self-generated-disclosure-required' : 'self-created',
  };

  if (plan.file.endsWith('.png')) {
    const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    let zero = 0;
    let partial = 0;
    let opaque = 0;
    for (let index = 3; index < data.length; index += 4) {
      const alpha = data[index];
      if (alpha === 0) zero += 1;
      else if (alpha === 255) opaque += 1;
      else partial += 1;
    }
    row.alpha = {zero_pixels: zero, partial_pixels: partial, opaque_pixels: opaque};
    if (plan.alphaRequired && zero === 0) throw new Error(`${plan.file} requires genuine transparent pixels`);
    if (zero === info.width * info.height) throw new Error(`${plan.file} is fully transparent`);
  }

  return {row, bytes};
}

async function renderContact(inspected) {
  const width = 1920;
  const height = 1080;
  const columns = 4;
  const rows = 4;
  const gap = 18;
  const left = 42;
  const top = 94;
  const cellWidth = 446;
  const cellHeight = 226;
  const background = await sharp(path.join(candidateRoot, 'background.png'))
    .resize(width, height, {fit: 'cover'})
    .png()
    .toBuffer();
  const composites = [];

  composites.push({
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="48" y="58" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#173f5f">SH006 independent production assets · QA contact</text>
      <text x="1870" y="58" text-anchor="end" font-family="Arial, sans-serif" font-size="22" fill="#8c2733">NOT CUT PASS</text>
    </svg>`),
    left: 0,
    top: 0,
  });

  for (let index = 0; index < inspected.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + column * (cellWidth + gap);
    const y = top + row * (cellHeight + gap);
    const label = `${inspected[index].row.beat_id} · ${inspected[index].row.object_label}`;
    const panel = Buffer.from(`<svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="${cellWidth - 2}" height="${cellHeight - 2}" rx="12" fill="#fbf5e9" fill-opacity="0.72" stroke="#173f5f" stroke-opacity="0.32" stroke-width="2"/>
      <text x="${cellWidth / 2}" y="${cellHeight - 16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" font-weight="700" fill="#173f5f">${escapeXml(label)}</text>
    </svg>`);
    composites.push({input: panel, left: x, top: y});
    const assetVisual = await sharp(inspected[index].bytes)
      .resize({width: cellWidth - 34, height: cellHeight - 54, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
      .png()
      .toBuffer();
    const assetMeta = await sharp(assetVisual).metadata();
    composites.push({
      input: assetVisual,
      left: x + Math.round((cellWidth - assetMeta.width) / 2),
      top: y + 8,
    });
  }

  const contact = await sharp(background).composite(composites).png().toBuffer();
  const contactPath = path.join(outputRoot, 'SH006-editorial-production-assets-contact.png');
  await writeFile(contactPath, contact);
  const mobile = await sharp(contact).resize(360, 203, {fit: 'fill'}).png().toBuffer();
  const mobilePath = path.join(outputRoot, 'SH006-editorial-production-assets-contact-360x203.png');
  await writeFile(mobilePath, mobile);
  return {
    contact: {
      path: path.relative(repoRoot, contactPath).replaceAll('\\', '/'),
      sha256: sha256(contact),
      dimensions: {width, height},
    },
    mobile: {
      path: path.relative(repoRoot, mobilePath).replaceAll('\\', '/'),
      sha256: sha256(mobile),
      dimensions: {width: 360, height: 203},
    },
  };
}

await mkdir(outputRoot, {recursive: true});
const approvalBytes = await readFile(approvalPath);
const approval = JSON.parse(approvalBytes.toString('utf8'));
if (sha256(approvalBytes) !== expectedApprovalSha) throw new Error('Style approval marker hash changed');
if (approval.status !== 'approved-style-direction-only') throw new Error('Style direction is not approved');
if (approval.approved_inputs_sha256 !== expectedApprovedInputsSha) throw new Error('Approved style input bundle changed');
if (!approval.approved_scope.independent_production_asset_decomposition) throw new Error('Asset decomposition is not authorized');

const inspected = [];
for (const plan of assetPlan) inspected.push(await inspectAsset(plan));
const backgroundBytes = await readFile(path.join(candidateRoot, 'background.png'));
const outputs = await renderContact(inspected);
const sortedAssetHashRows = inspected
  .map(({row}) => `${row.id}|${row.path}|${row.sha256}`)
  .sort()
  .join('\n');
const manifest = {
  schema_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_id: 'SH006-editorial-production-assets-v01',
  status: 'superseded-asset-decomposition-history',
  review_scope: 'independent-production-assets-only',
  review_profile: 'remotion-motion',
  derived_from_style_approval: {
    path: approvalRelative,
    sha256: expectedApprovalSha,
    approved_inputs_sha256: expectedApprovedInputsSha,
  },
  production_authority: false,
  superseded_by_style_candidate: 'SH006-editorial-v04',
  rebuild_blocked_until_current_style_pass: true,
  supersession_reason: 'The v03 approval rotated detached B01 labels. The current rule allows rotation only for text actually overlaid on a named PNG surface.',
  background: {
    path: 'video/qa/production-assets/episode-001/SH006-editorial-v01/background.png',
    sha256: sha256(backgroundBytes),
  },
  typography_surface_contract_version: 1,
  exact_legal_text_rendering: 'source-locked-remotion-text-only',
  independent_motion_assets: true,
  effects_required: false,
  effects: [],
  ai_disclosure_required: true,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  production_visible: false,
  stage_advanced: false,
  asset_count: inspected.length,
  asset_bundle_sha256: sha256(Buffer.from(sortedAssetHashRows)),
  assets: inspected.map(({row}) => row),
  outputs,
};
await writeFile(path.join(candidateRoot, 'asset-decomposition.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${manifest.candidate_id}`);
console.log(`Assets: ${manifest.asset_count}`);
console.log(`Bundle SHA-256: ${manifest.asset_bundle_sha256}`);
console.log(`Contact SHA-256: ${manifest.outputs.contact.sha256}`);
