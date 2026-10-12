import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export const SH006_VIEWER_TEXT = {
  currentArticleTitle: '제196조(검사의 수사)',
  currentArticleQuote: '검사는 범죄의 혐의가 있다고 사료하는 때에는\n범인, 범죄사실과 증거를 수사한다.',
  deletionQuote: '제196조를 삭제한다.',
  retainedTitle: '새 제195조제2항',
  retainedQuote: '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.',
} as const;

export const SH006_VIEWER_ASSET_RECIPE = {
  schema_version: 1,
  recipe_id: 'SH006-viewer-first-remotion-assets-v01',
  canvas: {width: 1920, height: 1080},
  style: 'editorial-cutout-with-transparent-background',
  palette: {
    ink: '#282621', navy: '#315f76', red: '#a54035', gold: '#e2b24d',
    cream: '#fffdf7', paper: '#fffaf0', teal: '#4f8f84', muted: '#776d62',
  },
  source_text_contract: 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-viewer-first-text-contract.json',
  source_text_contract_sha256: '9988051e6ddab7399117695b24b626768a3209baaf680dce1321bb01654972c3',
  exact_text: SH006_VIEWER_TEXT,
  website_ui_excluded: true,
  screenshot_pixels_used: false,
} as const;

export const SH006_VIEWER_ASSET_RECIPE_SHA256 = crypto
  .createHash('sha256')
  .update(JSON.stringify(SH006_VIEWER_ASSET_RECIPE))
  .digest('hex');

export const SH006_VIEWER_ASSETS = {
  prosecutor: {file: 'sh006-prosecutor.png', width: 520, height: 720, source_id: null},
  person: {file: 'sh006-person.png', width: 420, height: 520, source_id: null},
  facts: {file: 'sh006-facts-folder.png', width: 560, height: 380, source_id: null},
  evidence: {file: 'sh006-evidence-magnifier.png', width: 520, height: 420, source_id: null},
  currentArticle: {file: 'sh006-current-article-196.png', width: 1600, height: 720, source_id: 'LAW-196'},
  deletion: {file: 'sh006-article-196-deletion-viewer.png', width: 1600, height: 620, source_id: 'LAW-REVISION-21857'},
  deleteMark: {file: 'sh006-delete-mark.png', width: 1200, height: 520, source_id: null},
  retained: {file: 'sh006-article-195-retained-viewer.png', width: 1600, height: 720, source_id: 'LAW-REVISION-21857'},
  request: {file: 'sh006-request-sheet.png', width: 560, height: 640, source_id: null},
  police: {file: 'sh006-police-building.png', width: 640, height: 600, source_id: null},
} as const;

type AssetKey = keyof typeof SH006_VIEWER_ASSETS;

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const shadow = '<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#3a3027" flood-opacity=".22"/></filter>';

function prosecutorSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="720" viewBox="0 0 520 720">
    <defs>${shadow}</defs><ellipse cx="260" cy="678" rx="178" ry="27" fill="#6b5d4e" opacity=".18"/>
    <g filter="url(#shadow)"><path d="M128 632c6-144 29-266 132-266s126 122 132 266z" fill="#315f76"/>
    <path d="M210 373l50 67 50-67 37 34-28 225H201l-28-225z" fill="#233f50"/>
    <path d="M235 413l25 27 25-27 12 219h-74z" fill="#f5efe2"/>
    <circle cx="260" cy="244" r="112" fill="#e8b98f"/><path d="M150 244c0-88 49-139 117-139 73 0 119 55 112 147-30-15-66-42-95-79-29 43-75 72-134 83z" fill="#2d2925"/>
    <path d="M214 271c13 12 79 12 92 0" fill="none" stroke="#9c6952" stroke-width="8" stroke-linecap="round"/>
    <rect x="302" y="500" width="158" height="116" rx="18" fill="#c98c3d" stroke="#7a4f22" stroke-width="8"/><path d="M342 500v-28h78v28" fill="none" stroke="#7a4f22" stroke-width="11"/>
    <circle cx="381" cy="555" r="24" fill="#fff5d8"/><path d="M381 536v38M362 555h38" stroke="#a54035" stroke-width="7" stroke-linecap="round"/></g>
  </svg>`;
}

function personSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520" viewBox="0 0 420 520">
    <defs>${shadow}</defs><ellipse cx="210" cy="490" rx="145" ry="21" fill="#6b5d4e" opacity=".16"/><g filter="url(#shadow)">
    <circle cx="210" cy="143" r="86" fill="#e8b98f"/><path d="M126 146c0-79 42-116 91-116 61 0 92 47 86 125-35-17-65-44-80-72-25 31-57 52-97 63z" fill="#4b392e"/>
    <path d="M80 457c10-143 50-220 130-220s120 77 130 220z" fill="#d56d55"/><path d="M170 237l40 54 40-54 24 28-20 192h-88l-20-192z" fill="#f4e6d2"/></g>
  </svg>`;
}

function factsFolderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="380" viewBox="0 0 560 380">
    <defs>${shadow}</defs><g filter="url(#shadow)"><path d="M50 108h179l51 50h230v166H50z" fill="#d29a37" stroke="#835f27" stroke-width="8"/><path d="M50 108V66h196l48 50h216v62H50z" fill="#efc66b" stroke="#835f27" stroke-width="8"/>
    <rect x="137" y="180" width="286" height="105" rx="12" fill="#fffaf0"/><path d="M178 219h204M178 250h150" stroke="#6e6258" stroke-width="11" stroke-linecap="round"/></g>
  </svg>`;
}

function evidenceSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420">
    <defs>${shadow}</defs><g filter="url(#shadow)"><rect x="52" y="45" width="322" height="264" rx="20" fill="#fffdf7" stroke="#6d6258" stroke-width="8"/><rect x="86" y="79" width="254" height="151" rx="10" fill="#b9d8d2"/>
    <path d="M102 207l64-66 48 47 45-58 65 77" fill="none" stroke="#4f8f84" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="292" cy="108" r="19" fill="#e2b24d"/>
    <circle cx="340" cy="257" r="88" fill="#fff" fill-opacity=".2" stroke="#315f76" stroke-width="22"/><path d="M405 323l72 66" stroke="#315f76" stroke-width="34" stroke-linecap="round"/></g>
  </svg>`;
}

function lawCardSvg({title, quote, accent, width = 1600, height = 720}: {title: string; quote: string; accent: string; width?: number; height?: number}) {
  const lines = quote.split('\n');
  const fontSize = lines.length === 1 ? 126 : 82;
  const firstY = lines.length === 1 ? height / 2 + 50 : height / 2 - 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>${shadow}</defs><g filter="url(#shadow)"><rect x="35" y="35" width="${width - 70}" height="${height - 70}" rx="30" fill="#fffdf7" stroke="#d2c3ae" stroke-width="6"/>
    <rect x="78" y="72" width="560" height="88" rx="44" fill="${accent}"/><text x="358" y="134" text-anchor="middle" font-family="Noto Sans KR" font-size="54" font-weight="900" fill="#fff">${escapeXml(title)}</text>
    <line x1="80" y1="196" x2="${width - 80}" y2="196" stroke="#d2c3ae" stroke-width="4"/>
    ${lines.map((line, index) => `<text x="${width / 2}" y="${firstY + index * 132}" text-anchor="middle" font-family="Noto Sans KR" font-size="${fontSize}" font-weight="850" letter-spacing="-3" fill="#282621">${escapeXml(line)}</text>`).join('')}
    <line x1="180" y1="${height - 102}" x2="${width - 180}" y2="${height - 102}" stroke="${accent}" stroke-width="12" stroke-linecap="round"/></g>
  </svg>`;
}

function deleteMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520"><path d="M135 85C390 218 771 343 1072 453" fill="none" stroke="#a54035" stroke-width="44" stroke-linecap="round"/><path d="M1067 78C790 222 421 338 128 458" fill="none" stroke="#a54035" stroke-width="44" stroke-linecap="round"/></svg>`;
}

function requestSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="640" viewBox="0 0 560 640"><defs>${shadow}</defs><g filter="url(#shadow)">
    <path d="M80 38h302l98 98v458H80z" fill="#fffdf7" stroke="#315f76" stroke-width="9"/><path d="M382 38v104h98" fill="#d7e7e3" stroke="#315f76" stroke-width="9"/>
    <rect x="130" y="168" width="300" height="78" rx="18" fill="#315f76"/><path d="M170 297h220M170 352h220M170 407h150" stroke="#776d62" stroke-width="16" stroke-linecap="round"/>
    <circle cx="397" cy="477" r="70" fill="#e2b24d"/><path d="M367 476l21 22 43-49" fill="none" stroke="#fffdf7" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

function policeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="600" viewBox="0 0 640 600"><defs>${shadow}</defs><g filter="url(#shadow)">
    <path d="M64 226L320 64l256 162z" fill="#315f76"/><rect x="92" y="226" width="456" height="282" rx="8" fill="#eef1ee" stroke="#315f76" stroke-width="10"/>
    <rect x="142" y="286" width="82" height="92" rx="8" fill="#9cc4cf"/><rect x="279" y="286" width="82" height="92" rx="8" fill="#9cc4cf"/><rect x="416" y="286" width="82" height="92" rx="8" fill="#9cc4cf"/>
    <rect x="264" y="408" width="112" height="100" fill="#315f76"/><rect x="55" y="508" width="530" height="42" rx="18" fill="#293f4c"/>
    <path d="M320 122l19 38 42 6-31 29 8 42-38-20-38 20 8-42-31-29 42-6z" fill="#e2b24d"/></g></svg>`;
}

const svgByKey: Record<AssetKey, () => string> = {
  prosecutor: prosecutorSvg,
  person: personSvg,
  facts: factsFolderSvg,
  evidence: evidenceSvg,
  currentArticle: () => lawCardSvg({title: SH006_VIEWER_TEXT.currentArticleTitle, quote: SH006_VIEWER_TEXT.currentArticleQuote, accent: '#315f76'}),
  deletion: () => lawCardSvg({title: '개정문', quote: SH006_VIEWER_TEXT.deletionQuote, accent: '#a54035', height: 620}),
  deleteMark: deleteMarkSvg,
  retained: () => lawCardSvg({title: SH006_VIEWER_TEXT.retainedTitle, quote: SH006_VIEWER_TEXT.retainedQuote, accent: '#4f8f84'}),
  request: requestSvg,
  police: policeSvg,
};

export async function deriveSh006ViewerAssets() {
  return Object.fromEntries(await Promise.all((Object.keys(SH006_VIEWER_ASSETS) as AssetKey[]).map(async (key) => {
    const spec = SH006_VIEWER_ASSETS[key];
    const bytes = await sharp(Buffer.from(svgByKey[key](), 'utf8')).png().toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== spec.width || metadata.height !== spec.height) throw new Error(`SH006 ${key} dimensions mismatch`);
    return [key, bytes];
  }))) as Record<AssetKey, Buffer>;
}

export async function writeSh006ViewerAssets(outputDir: string) {
  const absolute = path.resolve(outputDir);
  await fs.mkdir(absolute, {recursive: true});
  const buffers = await deriveSh006ViewerAssets();
  const records = [];
  for (const key of Object.keys(SH006_VIEWER_ASSETS) as AssetKey[]) {
    const spec = SH006_VIEWER_ASSETS[key];
    const bytes = buffers[key];
    const output = path.join(absolute, spec.file);
    await fs.writeFile(output, bytes);
    records.push({
      key,
      file: spec.file,
      path: path.relative(process.cwd(), output).replaceAll('\\', '/'),
      width: spec.width,
      height: spec.height,
      source_id: spec.source_id,
      bytes: bytes.byteLength,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      derivation_recipe_sha256: SH006_VIEWER_ASSET_RECIPE_SHA256,
    });
  }
  return records;
}
