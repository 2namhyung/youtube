import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const workspace = path.resolve(import.meta.dirname, '..', '..');
const sourcePath = path.join(workspace, 'data', 'raw', 'episode-media', 'episode-001', 'LAW-REVISION-21857', 'law-revision-21857-full.png');
const outputDir = path.join(workspace, 'video', 'qa', 'episode-001-work-v01', 'source-lock', 'SH006');
const expectedSourceSha256 = '118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b';

const law = {
  source_id: 'LAW-REVISION-21857',
  official_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all',
  title: '형사소송법 일부개정법률',
  law_number: '법률 제21857호',
  promulgation_date: '2026. 8. 4.',
  main_effective_date: '2026. 10. 2.',
  status: '일부개정',
};

const crop = {
  normalized: {left: 0.25, top: 0.0902777778, width: 0.5, height: 0.1222222222},
  pixels: {left: 320, top: 65, width: 640, height: 88},
  locator: '공식 화면 중앙의 형사소송법 제목·대괄호 시행일·법률번호·공포일·개정 상태 줄; blue header/logo와 gray 검색 UI/control 제외',
};

const quote = {
  lines: ['⊙법률 제21857호', '형사소송법 일부개정법률'],
  source_locator: '개정문 본문에서 연속해 표시되는 법률번호 줄과 법률명 줄; 날짜는 별도 metadata로 표시',
  font_size_px: 76,
  line_count: 2,
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

function text(x, y, value, size, fill = '#20252d', weight = 500, anchor = 'start') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Malgun Gothic, Noto Sans KR, Arial, sans-serif" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function fittedText(x, y, value, size, scaleX, fill = '#20252d', weight = 500) {
  return `<text transform="translate(${x} ${y}) scale(${scaleX} 1)" fill="${fill}" font-family="Malgun Gothic, Noto Sans KR, Arial, sans-serif" font-size="${size}px" font-weight="${weight}">${escapeXml(value)}</text>`;
}

async function render() {
  const source = await readFile(sourcePath);
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== expectedSourceSha256) {
    throw new Error(`SH006 source hash drift: expected ${expectedSourceSha256}, got ${sourceSha256}`);
  }
  const sourceMeta = await sharp(source).metadata();
  if (sourceMeta.format !== 'jpeg' || sourceMeta.width !== 1280 || sourceMeta.height !== 720) {
    throw new Error(`SH006 source dimensions/MIME drift: ${sourceMeta.format} ${sourceMeta.width}x${sourceMeta.height}`);
  }

  await mkdir(outputDir, {recursive: true});
  const cropPath = path.join(outputDir, 'SH006-official-header-crop.png');
  const contactPath = path.join(outputDir, 'SH006-source-lock-contact.png');
  const metadataPath = path.join(outputDir, 'SH006-source-lock.json');

  await sharp(source)
    .extract(crop.pixels)
    .resize({width: 1600, height: 220, fit: 'fill'})
    .png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
    .toFile(cropPath);

  const canvas = svg(1920, 1080, [
    '<rect width="1920" height="1080" fill="#f4f0e8"/>',
    '<rect x="72" y="54" width="1776" height="972" rx="24" fill="#fffdf8" stroke="#d7d0c3" stroke-width="3"/>',
    text(120, 118, 'SH006 SOURCE-LOCK QA', 34, '#7c4d2d', 700),
    text(120, 160, '공식 개정문 확인용 / 컷·PASS 승인 아님', 24, '#765f4e', 500),
    '<rect x="120" y="205" width="760" height="427" rx="12" fill="#ffffff" stroke="#d7d0c3" stroke-width="2"/>',
    text(120, 674, 'A. 원본 전체 overview (출처 위치 확인용)', 24, '#20252d', 700),
    '<rect x="980" y="205" width="820" height="188" rx="12" fill="#ffffff" stroke="#d7d0c3" stroke-width="2"/>',
    text(980, 435, 'B. normalized crop (제목·시행·법률번호 영역)', 24, '#20252d', 700),
    '<rect x="980" y="484" width="820" height="390" rx="12" fill="#fffaf0" stroke="#d7d0c3" stroke-width="2"/>',
    text(1020, 538, 'C. exact candidate retype', 24, '#7c4d2d', 700),
    fittedText(1020, 642, quote.lines[0], quote.font_size_px, 0.92, '#20252d', 700),
    fittedText(1020, 750, quote.lines[1], quote.font_size_px, 0.84, '#20252d', 700),
    text(120, 810, '원본 해시·crop 좌표·전사 후보·이용조건을 함께 검토해야 제작 컷으로 전환 가능', 23, '#765f4e', 500),
    text(120, 918, '공식 출처: 국가법령정보센터 / 법률 제21857호 / 2026. 8. 4. 공포 / 주된 시행 2026. 10. 2.', 22, '#20252d', 500),
    text(120, 964, '상태: pending-human-review · production cut: not approved · user PASS: not recorded', 22, '#a33d30', 700),
  ].join(''));

  const overview = await sharp(source).resize({width: 760, height: 427, fit: 'fill'}).png().toBuffer();
  const cropPreview = await sharp(cropPath).resize({width: 800, height: 110, fit: 'fill'}).png().toBuffer();
  await sharp(canvas)
    .composite([
      {input: overview, left: 120, top: 205},
      {input: cropPreview, left: 990, top: 232},
    ])
    .png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
    .toFile(contactPath);

  const cropMeta = await sharp(cropPath).metadata();
  const contactMeta = await sharp(contactPath).metadata();
  const bundle = {
    schema_version: 1,
    bundle_id: 'EP001-SH006-source-lock-v01',
    stage: 'source-lock-qa',
    status: 'pending-human-review',
    approval: {
      user_pass: false,
      production_cut_approved: false,
      omni_video_approved: false,
      rights_approved: false,
      note: '이 묶음은 SH006 컷 검수 전의 공식 원문·crop·전사 후보 확인용이며, 컷/PASS를 기록하지 않는다.',
    },
    source: {
      ...law,
      local_path: path.relative(workspace, sourcePath).replaceAll('\\', '/'),
      mime: 'image/jpeg',
      extension_note: '파일 확장자는 .png이나 실제 디코딩 MIME은 image/jpeg',
      width: sourceMeta.width,
      height: sourceMeta.height,
      sha256: sourceSha256,
      capture_locator: '개정문 전체 화면; 중앙 제목·시행일·법률번호·공포일·개정 상태 및 본문 영역',
    },
    crop,
    exact_retype_candidate: quote,
    rights_boundary: {
      statutory_text: '저작권법 제7조 제1호에 따라 헌법·법률·조약·명령·조례·규칙은 저작권법상 보호받지 못한다. 이 판단은 법률 원문에 한정한다.',
      official_legal_basis: {
        statute: '저작권법',
        article: '제7조 제1호 (보호받지 못하는 저작물)',
        official_url: 'https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769',
        verified_status: 'official-source-verified',
      },
      website_ui: '국가법령정보센터의 사이트 UI·로고·아이콘·화면 구성은 법률 원문과 분리된 요소로 이용조건을 검토한다.',
      database_asset_approval: 'pending',
      current_decision: 'pending-human-review',
    },
    outputs: {
      normalized_header_crop: {
        path: path.relative(workspace, cropPath).replaceAll('\\', '/'),
        mime: 'image/png',
        width: cropMeta.width,
        height: cropMeta.height,
        sha256: sha256(await readFile(cropPath)),
      },
      source_lock_contact: {
        path: path.relative(workspace, contactPath).replaceAll('\\', '/'),
        mime: 'image/png',
        width: contactMeta.width,
        height: contactMeta.height,
        sha256: sha256(await readFile(contactPath)),
      },
    },
  };
  await writeFile(metadataPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return {metadataPath, cropPath, contactPath, bundle};
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await render();
  console.log(JSON.stringify({
    status: result.bundle.status,
    source_sha256: result.bundle.source.sha256,
    crop: result.bundle.outputs.normalized_header_crop,
    contact: result.bundle.outputs.source_lock_contact,
    metadata: path.relative(workspace, result.metadataPath).replaceAll('\\', '/'),
  }, null, 2));
}

export {render, expectedSourceSha256, sourcePath, outputDir};
