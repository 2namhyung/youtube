import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export const SH006_DOCUMENT_OFFICIAL_URL = 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all';
export const SH006_DOCUMENT_METADATA = '[시행 2026. 10. 2.] [법률 제21857호, 2026. 8. 4., 일부개정]';
export const SH006_DOCUMENT_LAW_NUMBER = '⊙법률 제21857호';
export const SH006_DOCUMENT_TITLE = '형사소송법 일부개정법률';
export const SH006_DOCUMENT_BODY_LINE = '형사소송법 일부를 다음과 같이 개정한다.';
export const SH006_DOCUMENT_DELETION_EXCERPT = '제196조를 삭제한다.';
export const SH006_DOCUMENT_RETAINED_EXCERPT = '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.';
export const SH006_DOCUMENT_DERIVATIVE_LABEL = '공식 원문 기반 재조판 · 화면 캡처 아님';

export const SH006_DOCUMENT_FONT = {
  family: 'Noto Sans KR',
  path: 'C:/Windows/Fonts/NotoSansKR-VF.ttf',
  sha256: '018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0',
} as const;

export const SH006_DOCUMENT_OUTPUTS = {
  authentication: {
    output_id: 'source-authentication-v04', width: 2400, height: 720,
    file: 'SH006-source-authentication-v04.png', destination_file: 'source-photo/sh006-source-authentication.png', asset_id: 'sh006-source-authentication',
    sha256: '2e4a210aa411a735e233c0c7a8239722f6310f1da6611cccc9bd6cd0a9dcc1d6',
  },
  deletion: {
    output_id: 'article-196-deletion-v04', width: 1600, height: 720,
    file: 'SH006-article-196-deletion-v04.png', destination_file: 'source-photo/sh006-article-196-deletion.png', asset_id: 'sh006-article-196-deletion',
    sha256: 'b69082320643a3236f1e36d3959b0a2bf49b91bbafc59398634e21e06bfd3793',
  },
  retained: {
    output_id: 'article-195-retained-v04', width: 1600, height: 720,
    file: 'SH006-article-195-retained-v04.png', destination_file: 'source-photo/sh006-article-195-retained.png', asset_id: 'sh006-article-195-retained',
    sha256: '487bfdfc23c564849bb8e033608ce9e9902351a34261245988cd7cfe02a424ed',
  },
} as const;

export const SH006_DOCUMENT_FACSIMILE_RECIPE = {
  schema_version: 3,
  recipe_id: 'SH006-paired-statutory-change-v06',
  source: {
    official_url: SH006_DOCUMENT_OFFICIAL_URL,
    parent_capture_sha256: '118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b',
    source_kind: 'official-html-text-transcribed-and-source-compared',
  },
  exact_text: {
    metadata: SH006_DOCUMENT_METADATA,
    law_number: SH006_DOCUMENT_LAW_NUMBER,
    title: SH006_DOCUMENT_TITLE,
    body_line: SH006_DOCUMENT_BODY_LINE,
    deletion_excerpt: SH006_DOCUMENT_DELETION_EXCERPT,
    retained_excerpt: SH006_DOCUMENT_RETAINED_EXCERPT,
  },
  derivative_label: SH006_DOCUMENT_DERIVATIVE_LABEL,
  editorial_takeaway: '검사의 직접수사 일반 근거 삭제 / 보완수사요구·재수사요구 존속',
  excluded_from_this_cut: ['상세 서면 사유', '요구 내용', '1개월 기한'],
  mobile_disclosure_contract: {authentication_source_font_px: 58, minimum_rendered_mobile_font_px: 10, mobile_frame: {width: 360, height: 203}},
  safe_card_layout_contract: {
    canvas: {width: 1600, height: 720},
    card_bottom_y: 688,
    underline_y: 570,
    provenance_baseline_y: 650,
    provenance_font_px: 68,
    retained_badge: {x: 76, width: 400, text_anchor_x: 276},
  },
  website_ui_excluded: true,
  screenshot_pixels_used: false,
  font: SH006_DOCUMENT_FONT,
  outputs: {
    authentication: {width: SH006_DOCUMENT_OUTPUTS.authentication.width, height: SH006_DOCUMENT_OUTPUTS.authentication.height, format: 'png', layout: 'official-source-authentication-v06'},
    deletion: {width: SH006_DOCUMENT_OUTPUTS.deletion.width, height: SH006_DOCUMENT_OUTPUTS.deletion.height, format: 'png', layout: 'article-196-exact-deletion-safe-provenance-v06'},
    retained: {width: SH006_DOCUMENT_OUTPUTS.retained.width, height: SH006_DOCUMENT_OUTPUTS.retained.height, format: 'png', layout: 'article-195-exact-retained-safe-badge-provenance-v06'},
  },
} as const;

const sha256 = (value: Buffer | Uint8Array | string) => crypto.createHash('sha256').update(value).digest('hex');
export const SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256 = sha256(JSON.stringify(SH006_DOCUMENT_FACSIMILE_RECIPE));
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function assertFont() {
  const bytes = await fs.readFile(path.resolve(SH006_DOCUMENT_FONT.path));
  const actual = sha256(bytes);
  if (actual !== SH006_DOCUMENT_FONT.sha256) throw new Error(`SH006 document font hash mismatch: expected ${SH006_DOCUMENT_FONT.sha256}, got ${actual}`);
}

function authenticationSvg() {
  const {metadata, law_number: lawNumber, title} = SH006_DOCUMENT_FACSIMILE_RECIPE.exact_text;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="720" viewBox="0 0 2400 720">
    <rect width="2400" height="720" fill="#ffffff"/><rect x="44" y="44" width="2312" height="632" rx="22" fill="#fffdf9" stroke="#d5c4a8" stroke-width="4"/>
    <rect x="118" y="78" width="760" height="76" rx="38" fill="#f2ead8"/><text x="498" y="132" text-anchor="middle" font-family="Noto Sans KR" font-size="46" font-weight="820" letter-spacing="-1" fill="#5b4f43">${escapeXml(SH006_DOCUMENT_DERIVATIVE_LABEL)}</text>
    <text x="2280" y="132" text-anchor="end" font-family="Noto Sans KR" font-size="50" font-weight="700" letter-spacing="-1" fill="#554d45">${escapeXml(metadata)}</text><line x1="112" y1="194" x2="2288" y2="194" stroke="#bcb2a4" stroke-width="3"/>
    <text x="1200" y="376" text-anchor="middle" font-family="Noto Sans KR" font-size="104" font-weight="680" fill="#282520">${escapeXml(lawNumber)}</text>
    <text x="1200" y="578" text-anchor="middle" font-family="Noto Sans KR" font-size="146" font-weight="850" letter-spacing="-5" fill="#211f1c">${escapeXml(title)}</text><line x1="510" y1="628" x2="1890" y2="628" stroke="#9f332d" stroke-width="11"/>
  </svg>`;
}

function excerptSvg(kind: 'deletion' | 'retained') {
  const deletion = kind === 'deletion';
  const excerpt = deletion ? SH006_DOCUMENT_DELETION_EXCERPT : SH006_DOCUMENT_RETAINED_EXCERPT;
  const lines = excerpt.split('\n');
  const accent = deletion ? '#a13b32' : '#315f76';
  const article = deletion ? '제196조' : '제195조제2항';
  const badgeWidth = deletion ? 276 : 400;
  const badgeCenter = 76 + badgeWidth / 2;
  const fontSize = deletion ? 132 : 96;
  const firstY = deletion ? 416 : 356;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="720" viewBox="0 0 1600 720">
    <rect width="1600" height="720" fill="#ffffff"/><rect x="32" y="32" width="1536" height="656" rx="24" fill="#fffdf9" stroke="#d5c4a8" stroke-width="4"/>
    <rect x="76" y="70" width="${badgeWidth}" height="82" rx="41" fill="${accent}"/><text x="${badgeCenter}" y="129" text-anchor="middle" font-family="Noto Sans KR" font-size="56" font-weight="900" fill="#fff">${article}</text>
    <text x="1510" y="130" text-anchor="end" font-family="Noto Sans KR" font-size="45" font-weight="720" fill="#655b51">${escapeXml(SH006_DOCUMENT_LAW_NUMBER)}</text><line x1="76" y1="190" x2="1524" y2="190" stroke="#c2b6a4" stroke-width="3"/>
    ${lines.map((line, index) => `<text x="800" y="${firstY + index * 142}" text-anchor="middle" font-family="Noto Sans KR" font-size="${fontSize}" font-weight="880" letter-spacing="-4" fill="#24211e">${escapeXml(line)}</text>`).join('')}
    <line x1="190" y1="570" x2="1410" y2="570" stroke="${accent}" stroke-width="12"/>
    <text x="800" y="650" text-anchor="middle" font-family="Noto Sans KR" font-size="68" font-weight="760" letter-spacing="-2" fill="#756a60">${escapeXml(SH006_DOCUMENT_DERIVATIVE_LABEL)}</text>
  </svg>`;
}

async function renderSvg(svg: string, output: {width: number; height: number; sha256: string}, label: string) {
  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  const metadata = await sharp(png).metadata();
  if (metadata.width !== output.width || metadata.height !== output.height) throw new Error(`SH006 ${label} dimensions mismatch: expected ${output.width}x${output.height}, got ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'}`);
  const actual = sha256(png);
  if (actual !== output.sha256) throw new Error(`SH006 ${label} output hash mismatch: expected ${output.sha256}, got ${actual}`);
  return png;
}

export async function deriveSh006DocumentFacsimiles() {
  await assertFont();
  const [authentication, deletion, retained] = await Promise.all([
    renderSvg(authenticationSvg(), SH006_DOCUMENT_OUTPUTS.authentication, 'authentication'),
    renderSvg(excerptSvg('deletion'), SH006_DOCUMENT_OUTPUTS.deletion, 'deletion'),
    renderSvg(excerptSvg('retained'), SH006_DOCUMENT_OUTPUTS.retained, 'retained'),
  ]);
  return {authentication, deletion, retained};
}

export async function writeSh006DocumentFacsimiles(outputDir: string) {
  const absolute = path.resolve(outputDir);
  const outputs = await deriveSh006DocumentFacsimiles();
  await fs.mkdir(absolute, {recursive: true});
  const records = [];
  for (const kind of ['authentication', 'deletion', 'retained'] as const) {
    const spec = SH006_DOCUMENT_OUTPUTS[kind];
    const file = path.join(absolute, spec.file);
    const bytes = outputs[kind];
    await fs.writeFile(file, bytes);
    records.push({kind, source_path: path.relative(process.cwd(), file).replaceAll('\\', '/'), sha256: spec.sha256, bytes: bytes.byteLength, width: spec.width, height: spec.height, derivation_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256});
  }
  return records;
}

export async function verifySh006DocumentFacsimile(candidatePath: string, kind: 'authentication' | 'deletion' | 'retained') {
  const absolute = path.resolve(candidatePath);
  const spec = SH006_DOCUMENT_OUTPUTS[kind];
  const [outputs, candidate] = await Promise.all([deriveSh006DocumentFacsimiles(), fs.readFile(absolute)]);
  const actual = sha256(candidate);
  if (actual !== spec.sha256 || !candidate.equals(outputs[kind])) throw new Error(`SH006 deterministic ${kind} facsimile mismatch: ${absolute}`);
  return {source_path: path.relative(process.cwd(), absolute).replaceAll('\\', '/'), sha256: actual, bytes: candidate.byteLength, width: spec.width, height: spec.height, derivation_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256};
}

// Compatibility exports while prior raster/title-only derivatives remain provenance-only historical inputs.
export const SH006_DOCUMENT_OVERVIEW_EXPECTED_SOURCE_SHA256 = SH006_DOCUMENT_FACSIMILE_RECIPE.source.parent_capture_sha256;
export const SH006_DOCUMENT_OVERVIEW_EXPECTED_OUTPUT_SHA256 = 'a654e38afb57bf1001ab697eb12b27c1ffcee096393d53f1db28372cfc299943';
export const SH006_DOCUMENT_OVERVIEW_RECIPE = SH006_DOCUMENT_FACSIMILE_RECIPE;
export const SH006_DOCUMENT_OVERVIEW_RECIPE_SHA256 = SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256;
export const deriveSh006DocumentOverview = async (_sourcePath?: string) => (await deriveSh006DocumentFacsimiles()).authentication;
export const writeSh006DocumentOverview = async (_sourcePath: string, outputPath: string) => {
  const output = await deriveSh006DocumentOverview(); const absolute = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolute), {recursive: true}); await fs.writeFile(absolute, output);
  return {source_path: path.relative(process.cwd(), absolute).replaceAll('\\', '/'), sha256: SH006_DOCUMENT_OUTPUTS.authentication.sha256, bytes: output.byteLength, width: SH006_DOCUMENT_OUTPUTS.authentication.width, height: SH006_DOCUMENT_OUTPUTS.authentication.height, derivation_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256};
};
export const verifySh006DocumentOverview = async (_sourcePath: string, candidatePath: string) => verifySh006DocumentFacsimile(candidatePath, 'authentication');
