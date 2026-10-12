import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

export const PACKAGE_ROOT = 'video/qa/source-review/episode-001-official-recapture-v03';
const RECAPTURE_ROOT = 'video/source-intake/episode-001/official/recapture-v03';
const REGISTRY_PATH = 'video/source-intake/episode-001/official/intake-registry.json';
const SCHEMA_PATH = 'video/contracts/official-recapture-human-review-v1.schema.json';
const IDS = ['LAW-195', 'LAW-196', 'LAW-1972'];
const DECISIONS = ['source_identity', 'content_scope', 'locator', 'visual_readability', 'rights', 'use_of_ui'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (value) => value.replaceAll('\\', '/');
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const mimeFor = (format) => format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
const policySources = {
  copyright_act_article_7: {
    title: '저작권법 제7조(보호받지 못하는 저작물)',
    official_url: 'https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769',
    accessed_on: '2026-09-06',
    observation: '헌법·법률·조약·명령·조례 및 규칙은 저작권법상 보호받지 못하는 저작물로 열거된다.',
    scope_limit: '법률 텍스트에 관한 근거일 뿐 웹페이지 UI, 로고, 아이콘 또는 화면 전체의 이용허락이 아니다.'
  },
  moleg_copyright_policy: {
    title: '법제처 저작권정책',
    official_url: 'https://www.moleg.go.kr/menu.es?mid=a10205040000',
    accessed_on: '2026-09-06',
    observation: '법제처가 저작재산권 전부를 보유한 자료의 자유이용과 제3자 권리·공공누리 미표시 자료의 별도 확인 필요성을 구분한다.',
    scope_limit: '이 일반 정책만으로 특정 law.go.kr 캡처의 UI·로고·아이콘 재사용 조건을 확정할 수 없다.'
  },
  moleg_logo_page: {
    title: '법제처 로고',
    official_url: 'https://www.moleg.go.kr/board.es?act=view&bid=0012&list_no=78066&mid=a10701030000',
    accessed_on: '2026-09-06',
    observation: '법제처 상징과 내려받기 파일을 제공한다.',
    scope_limit: '페이지에 표시된 설명만으로 영상 내 로고 사용허락 또는 상표·상징 사용범위를 단정하지 않는다.'
  }
};

const textSvg = ({title, subtitle, footer, width=1920, height=1080}) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f3efe6"/>
  <rect x="0" y="0" width="100%" height="118" fill="#17212b"/>
  <text x="60" y="54" font-family="Arial, Noto Sans KR, sans-serif" font-size="34" font-weight="700" fill="#fff">${escapeXml(title)}</text>
  <text x="60" y="91" font-family="Arial, Noto Sans KR, sans-serif" font-size="20" fill="#d7e0e8">${escapeXml(subtitle)}</text>
  <text x="60" y="1050" font-family="Arial, Noto Sans KR, sans-serif" font-size="18" fill="#34414d">${escapeXml(footer)}</text>
</svg>`);

async function sourceRecord(root, relativePath) {
  const file = path.resolve(root, relativePath);
  const bytes = fs.readFileSync(file);
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error(`undecodable comparison source: ${relativePath}`);
  return {file, bytes, record:{path:normalize(relativePath),sha256:sha256(bytes),bytes:bytes.byteLength,extension:path.extname(relativePath).toLowerCase(),actual_mime:mimeFor(metadata.format),dimensions:{width:metadata.width,height:metadata.height}}};
}

async function comparisonBoard({oldSource, newSource, item}) {
  const oldImage = await sharp(oldSource.bytes).resize(820, 500, {fit:'contain', background:'#ffffff'}).png().toBuffer();
  const newImage = await sharp(newSource.bytes).resize(820, 500, {fit:'contain', background:'#ffffff'}).png().toBuffer();
  const rect = item.new_candidate.locator_evidence.target_rect;
  const cropTop = Math.max(0, Math.min(newSource.record.dimensions.height - 330, Math.floor(rect.top - 140)));
  const locatorCrop = await sharp(newSource.bytes).extract({left:0,top:cropTop,width:newSource.record.dimensions.width,height:330}).resize(1740, 398, {fit:'contain', background:'#ffffff'}).png().toBuffer();
  const chrome = textSvg({title:`${item.old_candidate.source_id} old ↔ recapture-v03`,subtitle:`exact locator: ${item.new_candidate.locator} · decision status: PENDING`,footer:'법률 텍스트와 law.go.kr UI·로고 권리는 분리 검토한다. 이 보드는 승인·교체·materialization 증거가 아니다.'});
  const labels = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <text x="60" y="150" font-family="Arial, Noto Sans KR, sans-serif" font-size="24" font-weight="700">OLD REGISTERED CANDIDATE</text>
    <text x="1040" y="150" font-family="Arial, Noto Sans KR, sans-serif" font-size="24" font-weight="700">V03 UNREGISTERED RECAPTURE</text>
    <text x="60" y="675" font-family="Arial, Noto Sans KR, sans-serif" font-size="24" font-weight="700">V03 LOCATOR CROP — ${escapeXml(item.new_candidate.matched_text)}</text>
  </svg>`);
  return sharp(chrome).composite([
    {input:oldImage,left:60,top:165},{input:newImage,left:1040,top:165},{input:locatorCrop,left:90,top:695},{input:labels,left:0,top:0}
  ]).png().toBuffer();
}

function decisionSet() {
  return Object.fromEntries(DECISIONS.map((field) => [field,{status:'pending',pass:false,reviewer:null,note:null}]));
}

export async function buildOfficialRecaptureReview({root=process.cwd(), write=true} = {}) {
  const registryBytes = fs.readFileSync(path.resolve(root, REGISTRY_PATH));
  const registry = JSON.parse(registryBytes);
  const recaptureBytes = fs.readFileSync(path.resolve(root, RECAPTURE_ROOT, 'manifest.json'));
  const recapture = JSON.parse(recaptureBytes);
  const schemaBytes = fs.readFileSync(path.resolve(root, SCHEMA_PATH));
  const items = [];
  const sourcePairs = [];
  for (const oldId of IDS) {
    const oldEntry = registry.entries.find((entry) => entry.source_id === oldId);
    const newEntry = recapture.captures.find((entry) => entry.replacement_for === oldId);
    if (!oldEntry || !newEntry) throw new Error(`${oldId}: comparison input missing`);
    const oldRelative = `video/source-intake/episode-001/official/${oldEntry.relative_path}`;
    const newRelative = `${RECAPTURE_ROOT}/${newEntry.file}`;
    const oldSource = await sourceRecord(root, oldRelative);
    const newSource = await sourceRecord(root, newRelative);
    if (newSource.record.sha256 !== newEntry.sha256) throw new Error(`${oldId}: recapture hash drift`);
    const item = {
      review_id:`${oldId}-RECAPTURE-V03-REVIEW`,
      old_candidate:{source_id:oldId,status:'registered-candidate-pending-human-review',...oldSource.record,canonical_url:oldEntry.canonical_url,capture_locator:oldEntry.capture_locator,capture_provenance:oldEntry.capture_provenance,captured_at:null,capture_tool:null,viewport:null,mime_extension_consistent:oldSource.record.actual_mime === 'image/png'},
      new_candidate:{source_id:newEntry.source_id,status:newEntry.source_candidate_status,registered:false,...newSource.record,captured_at:newEntry.captured_at,capture_tool:recapture.capture_tool,exact_url:newEntry.exact_url,viewport:recapture.viewport,locator:newEntry.locator,matched_text:newEntry.matched_text,locator_evidence:newEntry.locator_evidence,mime_extension_consistent:newSource.record.actual_mime === 'image/png'},
      comparison:{same_bytes:oldSource.record.sha256 === newSource.record.sha256,old_is_legacy_capture:true,new_has_structured_provenance:true,locator_visible_in_v03:true},
      content_rights_boundary:{legal_text:{present:true,basis_id:'copyright_act_article_7',status:'pending-human-content-scope-review',may_not_cover:['law.go.kr UI','법제처·국가법령정보센터 로고','아이콘','페이지 레이아웃']},law_go_kr_ui_and_logo:{present:true,basis_ids:['moleg_copyright_policy','moleg_logo_page'],status:'rights-uncertain-pending-human-review',cleared_for_use:false},whole_screenshot:{rights_approved:false,status:'not-approved-for-production-use'}},
      recommended_use_boundary:{legal_text:'evidence for human transcription verification only; production text must be raster-free native DOM/vector',ui_and_logo:'permanently excluded from production pixels',whole_screenshot:'evidence/provenance review only; never style-frame or production-visible'},
      human_decisions:decisionSet(),human_pass:false,source_approved:false,rights_approved:false,registry_replacement:false,materialized:false,production_authority:false
    };
    items.push(item);
    sourcePairs.push({item,oldSource,newSource});
  }
  const boardBuffers = [];
  for (const pair of sourcePairs) boardBuffers.push(await comparisonBoard(pair));
  const thumbs = await Promise.all(boardBuffers.map((bytes) => sharp(bytes).resize(560,315).png().toBuffer()));
  const contactChrome = textSvg({title:'EP001 official recapture-v03 — human review contact sheet',subtitle:'LAW-195 · LAW-196 · LAW-1972 | all six decisions per item remain PENDING / false',footer:'No source approval, rights approval, registry replacement, materialization, production authority, or motion claim.'});
  const contact = await sharp(contactChrome).composite(thumbs.map((input,index)=>({input,left:70+index*610,top:260}))).png().toBuffer();
  const boardNames = [...IDS.map((id)=>`compare-${id}.png`),'contact-sheet.png'];
  const allBoards = [...boardBuffers,contact];
  const boards = boardNames.map((name,index)=>({path:`${PACKAGE_ROOT}/${name}`,sha256:sha256(allBoards[index]),dimensions:{width:1920,height:1080},kind:index===3?'contact-sheet':'old-vs-v03-locator-comparison'}));
  const manifest = {
    schema_version:1,package_id:'episode-001-official-recapture-v03-human-review-v1',status:'historical-evidence-only',
    production_eligibility:'permanently-ineligible-capture-containing-rendered-text',capture_pixels_evidence_only:true,
    style_frame_pixel_input_allowed:false,production_visible_allowed:false,motion_target_allowed:false,
    schema:{path:SCHEMA_PATH,sha256:sha256(schemaBytes)},
    inputs:{official_registry:{path:REGISTRY_PATH,sha256:sha256(registryBytes)},recapture_manifest:{path:`${RECAPTURE_ROOT}/manifest.json`,sha256:sha256(recaptureBytes)}},
    rights_research:{status:'official-primary-sources-reviewed-rights-still-pending',legal_advice:false,sources:policySources,conclusion:'법률 텍스트와 사이트 UI·로고를 분리해야 한다. 공식 자료만으로 화면 전체의 재사용 권리를 확정하지 않았으며 human rights decision 전에는 production use를 금지한다.'},
    required_human_decision_fields:DECISIONS,items,boards,
    human_approval:false,source_approved:false,rights_approved:false,registry_replacement:false,materialized:false,production_authority:false
  };
  const readme = `# EP001 official recapture-v03 evidence review (historical)\n\nStatus: **HISTORICAL EVIDENCE ONLY — permanently ineligible for production pixels**\n\n이 package의 웹 캡처와 locator crop은 rendered text를 포함하므로 source identity·전사·provenance 확인에만 쓴다. style-frame pixel input, focal/supporting visual, production-visible asset, motion target이 될 수 없다. 이전 capture-pixel style/parity 방향은 무효다.\n\n여섯 human decision은 역사적 검토 필드로 보존하며 모두 \`status=pending\`, \`pass=false\`다. PASS로 바뀌어도 캡처 픽셀의 production eligibility를 복구하지 않는다. 정확한 법률 문구는 별도 검증 뒤 래스터 배경이 없는 native DOM/vector text surface로만 조판한다. UI·logo는 영구 제외한다.\n\n- [LAW-195 비교](compare-LAW-195.png)\n- [LAW-196 비교](compare-LAW-196.png)\n- [LAW-1972 비교](compare-LAW-1972.png)\n- [contact sheet](contact-sheet.png)\n\n법률 텍스트 근거는 [저작권법 제7조](${policySources.copyright_act_article_7.official_url}), 사이트 자료 조건은 [법제처 저작권정책](${policySources.moleg_copyright_policy.official_url}), 로고 식별 근거는 [법제처 로고](${policySources.moleg_logo_page.official_url})다. 이 package는 source/rights 승인, materialization, cut PASS, production authority가 아니다.\n`;
  if (write) {
    const out = path.resolve(root, PACKAGE_ROOT);
    fs.mkdirSync(out,{recursive:true});
    allBoards.forEach((bytes,index)=>{const file=path.join(out,boardNames[index]); if(!fs.existsSync(file)||sha256(fs.readFileSync(file))!==sha256(bytes)) fs.writeFileSync(file,bytes);});
    fs.writeFileSync(path.join(out,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
    fs.writeFileSync(path.join(out,'README.md'),readme);
  }
  return {manifest,boardBuffers:allBoards,readme};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildOfficialRecaptureReview();
  console.log(JSON.stringify({status:result.manifest.status,boards:result.manifest.boards.map((board)=>board.path),human_approval:false,rights_approved:false,registry_replacement:false},null,2));
}
