import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {STYLE_FRAME_LAYOUT_CONTRACT_VERSION, STYLE_FRAME_LAYOUT_RULES, bbox, estimateConservativeInkWidth, validateStyleFrameGeometry} from './style-frame-layout-contract.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outputRoot = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'reference-style-families-v02');
const backgroundPath = path.join(repoRoot, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png');
const newsRoot = path.join(repoRoot, 'video', 'source-intake', 'episode-001', 'news');
const officialRoot = path.join(repoRoot, 'video', 'source-intake', 'episode-001', 'official');
const sh003Root = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-work-v01', 'cuts', 'SH003', 'assets');
const sh006Root = path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-editorial-v01', 'assets');
const historicOmniRoot = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-v03', 'cuts');

const W = 1920;
const H = 1080;
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';
const INK = '#172a34';
const MUTED = '#405058';
const RED = '#9f3f35';
const TEAL = '#2f756e';
const BLUE = '#294f61';
const PAPER = '#f4ecdf';
const STATUS = 'pending-user-style-frame-review';
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const svg = (body, width = W, height = H) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#172a34" flood-opacity=".18"/></filter><marker id="arrow" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M0 0L14 7L0 14Z" fill="${TEAL}"/></marker></defs><g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g></svg>`);
const text = (x, y, value, size, fill = INK, weight = 800, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="-1">${esc(value)}</text>`;
const label = (box, value, fill = INK, size = 46) => `${text(box.left + box.width / 2, box.top + size, value, size, fill, 850, 'middle')}`;
const header = (kicker, title) => `${text(96, 104, kicker, 29, RED, 850)}${text(96, 164, title, 54, INK, 900)}`;
const footer = (value) => `<rect x="0" y="986" width="1920" height="94" fill="#efe7d9" fill-opacity=".97"/><line x1="80" y1="986" x2="1840" y2="986" stroke="${MUTED}" stroke-opacity=".22" stroke-width="2"/>${text(1840, 1041, value, 27, MUTED, 750, 'end')}`;
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" marker-end="url(#arrow)"/>`;

async function makePlate(source, asset) {
  let image = sharp(source);
  if (asset.extract) image = image.extract(asset.extract);
  return image.resize({width: asset.bbox.width, height: asset.bbox.height, fit: asset.fit ?? 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
}

async function writeFrame(familyRoot, spec) {
  const reviewSpec = {...spec, layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION};
  const failures = validateStyleFrameGeometry(reviewSpec);
  if (failures.length) throw new Error(`${spec.frame_id}\n${failures.join('\n')}`);
  const outputDir = path.join(familyRoot, 'outputs');
  await mkdir(outputDir, {recursive: true});
  const output = path.join(outputDir, `${spec.frame_id}.png`);
  const mobile = path.join(outputDir, `${spec.frame_id}-360x203.png`);
  const background = await sharp(backgroundPath).resize(W, H, {fit: 'fill'}).png().toBuffer();
  const composites = [];
  for (const asset of spec.assets) composites.push({input: await makePlate(asset.file, asset), left: asset.bbox.left, top: asset.bbox.top});
  await sharp(background).composite([...composites, {input: svg(spec.overlay), left: 0, top: 0}]).png({compressionLevel: 9}).toFile(output);
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  return {
    frame_id: spec.frame_id,
    layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION,
    output: rel(output), output_sha256: await sha256(output),
    mobile: rel(mobile), mobile_sha256: await sha256(mobile),
    dimensions: {width: W, height: H},
    inputs: await Promise.all([...new Set(spec.assets.map((asset) => asset.file))].map(async (file) => ({path: rel(file), sha256: await sha256(file)}))),
    geometry: {assets: spec.geometry.assets, texts: spec.geometry.texts, connectors: spec.geometry.connectors ?? [], intentional_overlaps: spec.geometry.intentional_overlaps ?? []},
  };
}

async function writeContact(familyRoot, familyId, records, captions) {
  const output = path.join(familyRoot, 'outputs', `${familyId}-contact.png`);
  const thumbs = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(560, 315).png().toBuffer()));
  await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite([
    {input: svg(`${text(60, 54, `${familyId} · SPATIAL REVIEW ONLY`, 31, INK, 900)}${captions.map((caption, i) => text(80 + i * 600, 108, caption, 25, i === 2 ? TEAL : BLUE, 850)).join('')}`, 1920, 520), left: 0, top: 0},
    ...thumbs.map((input, i) => ({input, left: 60 + i * 600, top: 140})),
  ]).png({compressionLevel: 9}).toFile(output);
  return {path: rel(output), sha256: await sha256(output), dimensions: {width: 1920, height: 520}};
}

async function writeManifest(familyRoot, family) {
  const manifestPath = path.join(familyRoot, 'manifest.json');
  const manifest = {
    schema_version: 2, episode_id: 'episode-001', candidate_id: family.id,
    supersedes_for_style_review: family.id.replace('-v02', '-v01'),
    supersession_reason: 'V01 used unbound labels and arbitrary overlapping coordinates. V02 rebuilds every frame with external horizontal label lanes and measured asset spacing.',
    status: STATUS, production_visible: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false,
    review_profile: family.reviewProfile, representative_shots: family.shots, reference_basis: family.references,
    typography_surface_contract_version: 2,
    typography_semantic_roles: {
      'asset-label': 'Asset explanation only; horizontal, externally reserved, target-bound, and non-overlapping.',
      'surface-content': 'Words with placement on-surface on one named visual surface; angle-matched to that surface, contained by it, and overlapping no other asset.',
      'screen-chrome': 'Title, general explanation, and source rail; horizontal and outside every asset.',
    },
    layout_contract: STYLE_FRAME_LAYOUT_RULES,
    source_boundary: family.boundary,
    frames: family.records,
    contact: family.contact,
    prohibited_rules_post_cut_recheck: ['no-asset-label-on-or-over-any-asset', 'no-screen-chrome-on-or-over-any-asset', 'no-rotation-for-asset-label-or-screen-chrome', 'no-surface-content-without-on-surface-placement', 'no-surface-content-angle-mismatch-or-non-target-overlap', 'no-arbitrary-asset-coordinates-without-geometry-record', 'no-undeclared-asset-overlap', 'no-connector-through-asset-or-label-lane', 'no-explanatory-text-box-as-focal', 'no-source-ui-as-reading-screen', 'no-omni-video-before-all-cut-pass'],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {path: rel(manifestPath), sha256: await sha256(manifestPath), candidate_id: family.id};
}

function asset(id, file, left, top, width, height, extra = {}) { return {id, file, bbox: bbox(left, top, width, height), ...extra}; }
function cue(id, role, box, font, target, content, textAlign = 'center') { return {id, semantic_role: role, target_id: target, bbox: box, rotation_deg: 0, font_size_px: font, text_align: textAlign, lines: [{text: content, font_size_px: font}]}; }
function multiCue(id, role, box, lines, textAlign = 'left') { return {id, semantic_role: role, bbox: box, rotation_deg: 0, font_size_px: Math.max(...lines.map((line) => line.font_size_px)), text_align: textAlign, lines}; }
const headerCue = (id, box, kicker, title, titleSize = 54) => multiCue(id, 'screen-chrome', box, [{text: kicker, font_size_px: 29}, {text: title, font_size_px: titleSize}]);
const footerCue = (content) => cue('source', 'screen-chrome', bbox(80, 1000, 1760, 42), 27, undefined, content, 'right');
const centeredLabelBox = (target, labelText, fontSize, top, minimumWidth = target.width) => {
  const targetBox = target.bbox ?? target;
  const resolvedMinimumWidth = Number.isFinite(minimumWidth) ? minimumWidth : targetBox.width;
  const width = Math.max(resolvedMinimumWidth, estimateConservativeInkWidth([{text: labelText, font_size_px: fontSize}]));
  return bbox(targetBox.left + targetBox.width / 2 - width / 2, top, width, 64);
};

async function buildFamily({id, profile, shots, captions, references, boundary, specs}) {
  const root = path.join(outputRoot, id);
  const records = [];
  for (const spec of specs) records.push(await writeFrame(root, spec));
  const contact = await writeContact(root, id, records, captions);
  return writeManifest(root, {id, reviewProfile: profile, shots, records, contact, references, boundary});
}

const yna1 = path.join(newsRoot, 'news-yna-20260729-title-and-qa.png');
const yna2 = path.join(newsRoot, 'news-yna-20260804-title-and-effective-date.png');
const ytn = path.join(newsRoot, 'news-ytn-20260804-title-and-one-month.png');
const law = path.join(officialRoot, 'law-196-delete.png');
const newsExtract = {left: 112, top: 230, width: 760, height: 205};

const hookSpecs = [
  (() => { const kicker='도입 · 보도에서 원문으로'; const title='말이 많을수록 원문까지 따라갑니다'; const source='출처 후보 · 연합뉴스 2026.7.29 / 국가법령정보센터 · 권리 검토 전'; const a=asset('first-report',yna1,120,260,760,360,{fit:'contain',extract:newsExtract,row_id:'sources',baseline_group:'sources'}); const b=asset('official-law',law,1040,260,760,360,{fit:'contain',row_id:'sources',baseline_group:'sources'}); const la=bbox(260,660,480,64); const lb=bbox(1180,660,480,64); return {frame_id:'SH001-H01-opening-v02',assets:[a,b],geometry:{assets:[a,b],texts:[cue('first-report-label','asset-label',la,46,'first-report','처음 확인한 보도'),cue('law-label','asset-label',lb,46,'official-law','공식 개정문'),headerCue('title',bbox(96,72,1300,110),kicker,title),footerCue(source)]},overlay:`${header(kicker,title)}${label(la,'처음 확인한 보도',RED)}${label(lb,'공식 개정문',BLUE)}${footer(source)}`}; })(),
  (() => { const kicker='보도 축적 · 날짜를 분리'; const title='같은 쟁점도 시점을 나눠 봅니다'; const source='출처 후보 · 연합뉴스·YTN 기사 제목 crop · 재배포 권리 검토 전'; const labels=['7월 29일','8월 4일','같은 날 다른 보도']; const files=[yna1,yna2,ytn]; const ids=['july-report','aug-report','same-day-report']; const xs=[120,720,1320]; const assets=files.map((file,i)=>asset(ids[i],file,xs[i],270,480,340,{fit:'contain',extract:i===2?{left:20,top:264,width:900,height:185}:newsExtract,row_id:'reports',baseline_group:'reports'})); const boxes=xs.map(x=>bbox(x+30,650,420,64)); return {frame_id:'SH001-H02-evidence-v02',assets,geometry:{assets,texts:[...boxes.map((box,i)=>cue(`${ids[i]}-label`,'asset-label',box,46,ids[i],labels[i])),headerCue('title',bbox(96,72,1400,110),kicker,title),footerCue(source)]},overlay:`${header(kicker,title)}${label(boxes[0],labels[0],BLUE)}${label(boxes[1],labels[1],RED)}${label(boxes[2],labels[2],TEAL)}${footer(source)}`}; })(),
  (() => { const kicker='자료 흐름 · 세 칸으로 분리'; const title='기사 → 공식 원문 → 시행 보도'; const source='자료 흐름 설명 · 각 출처는 독립 칸과 독립 라벨을 유지'; const a=asset('report',yna1,120,280,480,320,{fit:'contain',extract:newsExtract,row_id:'route',baseline_group:'route'}); const b=asset('law',law,720,280,480,320,{fit:'contain',row_id:'route',baseline_group:'route'}); const c=asset('follow-up',yna2,1320,280,480,320,{fit:'contain',extract:newsExtract,row_id:'route',baseline_group:'route'}); const boxes=[bbox(150,640,420,64),bbox(750,640,420,64),bbox(1350,640,420,64)]; const connectors=[{id:'report-to-law',bbox:bbox(630,410,60,40),endpoint_asset_ids:['report','law']},{id:'law-to-follow',bbox:bbox(1230,410,60,40),endpoint_asset_ids:['law','follow-up']}]; return {frame_id:'SH005-H03-summary-v02',assets:[a,b,c],geometry:{assets:[a,b,c],texts:[cue('report-label','asset-label',boxes[0],46,'report','기사'),cue('law-label','asset-label',boxes[1],46,'law','공식 원문'),cue('follow-label','asset-label',boxes[2],46,'follow-up','시행 보도'),headerCue('title',bbox(96,72,1400,110),kicker,title),footerCue(source)],connectors},overlay:`${header(kicker,title)}${arrow(625,440,690,440)}${arrow(1225,440,1290,440)}${label(boxes[0],'기사',RED)}${label(boxes[1],'공식 원문',BLUE)}${label(boxes[2],'시행 보도',TEAL)}${footer(source)}`}; })(),
];

const rearWall = path.join(sh003Root, 'assembly-rear-wall-v01.png');
const podium = path.join(sh003Root, 'assembly-speaker-podium-v01.png');
const kim = path.join(sh003Root, 'assembly-speaker-photo-kim-v01.png');
const park = path.join(sh003Root, 'assembly-speaker-photo-park-v01.png');
const bill = path.join(sh003Root, 'assembly-bill-card-v01.svg');
const assemblyContext = () => [asset('chamber',rearWall,320,430,1280,410,{role:'context'}),asset('podium',podium,805,620,310,220,{role:'context'})];
const assemblySpecs = [
  (()=>{const kicker='장소 anchor';const title='국회 본회의장 구조';const source='설명용 2.5D 구조 · 공식 국회 영상 프레임이 아님';const assets=assemblyContext();const lb=bbox(700,890,520,60);return{frame_id:'SH003-A01-place-v02',assets,geometry:{assets,texts:[cue('place-label','asset-label',lb,46,'chamber','국회 본회의장'),headerCue('title',bbox(96,72,1000,110),kicker,title),footerCue(source)]},overlay:`${header(kicker,title)}${label(lb,'국회 본회의장',BLUE)}${footer(source)}`};})(),
  (()=>{const kicker='인물 누적';const title='장소를 유지한 채 인물만 진입';const source='출처 후보 · 국회 공식 프로필 사진 · 권리 검토 전';const context=assemblyContext();const person=asset('kim',kim,120,300,360,540,{baseline_group:'people',eye_line_group:'people',eye_line_y:410});const lb=bbox(150,890,300,60);const place=bbox(700,890,520,60);return{frame_id:'SH003-A02-person-v02',assets:[...context,person],geometry:{assets:[...context,person],texts:[cue('kim-label','asset-label',lb,46,'kim','김승원 의원'),cue('place-label','asset-label',place,46,'chamber','국회 본회의장'),headerCue('title',bbox(96,72,1100,110),kicker,title),footerCue(source)]},overlay:`${header(kicker,title)}${label(lb,'김승원 의원',RED)}${label(place,'국회 본회의장',BLUE)}${footer(source)}`};})(),
  (()=>{const kicker='본회의 · 인물과 법안';const title='누가 무엇을 냈나';const source='출처 후보 · 국회 공식 프로필 / 의안 2220257 · 권리 검토 전';const context=assemblyContext();const k=asset('kim',kim,120,330,340,510,{baseline_group:'people',eye_line_group:'people',eye_line_y:430});const p=asset('park',park,1460,330,340,510,{baseline_group:'people',eye_line_group:'people',eye_line_y:430});const b=asset('bill',bill,760,105,400,200);const billBox=centeredLabelBox(b,'형사소송법 일부개정법률안',44,350);const boxes=[bbox(140,890,300,60),billBox,bbox(1480,890,300,60)];return{frame_id:'SH003-A03-issue-v02',assets:[...context,k,p,b],geometry:{assets:[...context,k,p,b],texts:[cue('kim-label','asset-label',boxes[0],46,'kim','김승원 의원'),cue('bill-label','asset-label',boxes[1],44,'bill','형사소송법 일부개정법률안'),cue('park-label','asset-label',boxes[2],46,'park','박형수 의원'),headerCue('title',bbox(96,72,600,110),kicker,title,48),footerCue(source)]},overlay:`${text(96,104,kicker,29,RED,850)}${text(96,160,title,48,INK,900)}${label(boxes[0],'김승원 의원',RED)}${label(boxes[1],'형사소송법 일부개정법률안',INK,44)}${label(boxes[2],'박형수 의원',BLUE)}${footer(source)}`};})(),
];

const prosecutor = path.join(sh006Root,'sh006-prosecutor-editorial.png');
const request = path.join(sh006Root,'sh006-request-card-editorial.png');
const agency = path.join(sh006Root,'sh006-public-office-building-editorial.png');
const suspect = path.join(sh006Root,'sh006-suspect-dossier-editorial.png');
const facts = path.join(sh006Root,'sh006-facts-folder-editorial.png');
const evidence = path.join(sh006Root,'sh006-alley-photo-editorial.png');
const deleted = path.join(sh006Root,'sh006-deleted-document-editorial.png');

function routeSpec(frameId, items, title, sub, source) {
  const commonBottom=Math.max(...items.map((item)=>item.y+item.h));
  const alignedItems=items.map((item)=>({...item,y:commonBottom-item.h}));
  const assets=alignedItems.map((item)=>asset(item.id,item.file,item.x,item.y,item.w,item.h,{row_id:'route',baseline_group:'route',eye_line_group:item.eye_line_group,eye_line_y:item.eye_line_y}));
  const boxes=alignedItems.map((item)=>centeredLabelBox(bbox(item.x,item.y,item.w,item.h),item.label,item.font??46,item.labelY));
  const texts=[...alignedItems.map((item,i)=>cue(`${item.id}-label`,'asset-label',boxes[i],item.font??46,item.id,item.label)),headerCue('title',bbox(96,72,1500,110),sub,title),footerCue(source)];
  const connectors=[];
  for(let i=0;i<alignedItems.length-1;i+=1){const x1=alignedItems[i].x+alignedItems[i].w+24;const x2=alignedItems[i+1].x-24;const y=alignedItems[i].y+alignedItems[i].h/2;connectors.push({id:`route-${i}`,bbox:bbox(x1,y-20,x2-x1,40),endpoint_asset_ids:[alignedItems[i].id,alignedItems[i+1].id]});}
  return {frame_id:frameId,assets,geometry:{assets,texts,connectors},overlay:`${header(sub,title)}${connectors.map((_,i)=>{const left=alignedItems[i];const right=alignedItems[i+1];return arrow(left.x+left.w+28,left.y+left.h/2,right.x-28,left.y+left.h/2)}).join('')}${alignedItems.map((item,i)=>label(boxes[i],item.label,item.color??INK,item.font??46)).join('')}${footer(source)}`};
}

const processSpecs=[
  routeSpec('SH019-P01-converge-v02',[{id:'account',file:suspect,x:100,y:300,w:280,h:360,labelY:730,label:'계좌 정보',color:BLUE},{id:'cctv',file:evidence,x:560,y:300,w:280,h:360,labelY:730,label:'CCTV',color:BLUE},{id:'delivery',file:facts,x:1020,y:300,w:280,h:360,labelY:730,label:'배송 기록',color:BLUE},{id:'request',file:request,x:1480,y:280,w:320,h:400,labelY:730,label:'구체적 요구서',color:RED}], '확인할 항목이 요구서가 됩니다','절차 · 항목을 분리','설명 도식 · 계좌·CCTV·배송 기록 → 구체적 요구서'),
  routeSpec('SH030-P02-transfer-v02',[{id:'prosecutor',file:prosecutor,x:140,y:270,w:340,h:500,labelY:830,label:'검사',color:RED},{id:'request',file:request,x:790,y:300,w:340,h:430,labelY:830,label:'보완수사요구',color:INK},{id:'agency',file:agency,x:1430,y:300,w:360,h:430,labelY:830,label:'수사기관',color:BLUE}], '검사에서 수사기관으로','절차 · 전달 경로','관계 설명 · 검사 → 구체적 요구서 → 수사기관'),
  routeSpec('SH048-P03-summary-v02',[{id:'deleted',file:deleted,x:168,y:300,w:320,h:430,labelY:780,label:'직접 수사 근거 삭제',color:RED},{id:'prosecutor',file:prosecutor,x:600,y:300,w:280,h:430,labelY:780,label:'검사',color:RED},{id:'request',file:request,x:1040,y:320,w:280,h:390,labelY:780,label:'구체적 요구',color:TEAL},{id:'agency',file:agency,x:1495,y:320,w:300,h:390,labelY:780,label:'수사기관',color:BLUE}], '없어진 길과 남은 길','정리 · 삭제와 존속','최종 관계 · 직접 수사 근거 삭제 / 구체적 요구 경로 존속'),
];

async function createTimeAssets() {
  const dir=path.join(outputRoot,'time-data-editorial-v02','input','assets');await mkdir(dir,{recursive:true});
  const files={calendar:path.join(dir,'one-month.png'),date:path.join(dir,'effective-date.png'),folder:path.join(dir,'case-folder.png')};
  await sharp(svg(`<rect x="25" y="55" width="550" height="445" rx="18" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><rect x="25" y="55" width="550" height="105" rx="18" fill="${RED}"/>${text(300,130,'한 달',60,'#fff',900,'middle')}${Array.from({length:28},(_,i)=>`<rect x="${70+(i%7)*68}" y="${195+Math.floor(i/7)*64}" width="42" height="34" rx="4" fill="#fff" stroke="${MUTED}" stroke-width="3"/>`).join('')}`,600,540)).png().toFile(files.calendar);
  await sharp(svg(`<path d="M70 30H510L565 85V490H35V85Z" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><rect x="35" y="85" width="530" height="110" fill="${BLUE}"/>${text(300,158,'2026년',48,'#fff',900,'middle')}${text(300,330,'10월 2일',86,RED,900,'middle')}${text(300,420,'주요 규정 시행',42,INK,850,'middle')}`,600,520)).png().toFile(files.date);
  await sharp(svg(`<path d="M30 115H175L230 55H530L575 115V440H30Z" fill="#d5ad70" stroke="${INK}" stroke-width="8"/><path d="M30 155H575" stroke="#9a6934" stroke-width="8"/>`,600,480)).png().toFile(files.folder);
  return files;
}

const timeAssets=await createTimeAssets();
const timeSpecs=[
  routeSpec('SH024-T01-month-v02',[{id:'request',file:request,x:120,y:300,w:320,h:410,labelY:760,label:'요구받은 날',color:RED},{id:'month',file:timeAssets.calendar,x:780,y:280,w:360,h:420,labelY:760,label:'한 달',color:INK,font:50},{id:'result',file:timeAssets.folder,x:1480,y:320,w:300,h:360,labelY:760,label:'결과 송부',color:TEAL}], '한 달은 결과 송부의 기준','시간 · 시작과 끝','제197조의2 · 한 달은 결과 송부의 원칙적 기준'),
  (()=>{const kicker='시간 · 공포와 시행';const title='두 날짜를 같은 의미로 보면 안 됩니다';const source='법률 제21857호 부칙 · 공포일과 주요 규정 시행일을 분리';const a=asset('law',timeAssets.folder,220,280,400,370,{row_id:'dates',baseline_group:'dates'});const b=asset('date',timeAssets.date,1250,250,460,400,{row_id:'dates',baseline_group:'dates'});const la=bbox(250,690,340,64);const lb=bbox(1280,690,400,64);return{frame_id:'SH038-T02-effective-date-v02',assets:[a,b],geometry:{assets:[a,b],texts:[cue('law-label','asset-label',la,46,'law','8월 4일 공포'),cue('date-label','asset-label',lb,46,'date','10월 2일 시행'),headerCue('title',bbox(96,72,1300,110),kicker,title),cue('timeline-copy','screen-chrome',bbox(520,835,880,80),42,undefined,'공포 뒤 주요 규정 시행','center'),footerCue(source)],connectors:[{id:'date-line',bbox:bbox(550,840,820,30),endpoint_asset_ids:['law','date']}]},overlay:`${header(kicker,title)}${label(la,'8월 4일 공포',RED)}${label(lb,'10월 2일 시행',TEAL)}<line x1="570" y1="855" x2="1350" y2="855" stroke="${INK}" stroke-width="8"/><circle cx="570" cy="855" r="18" fill="${RED}"/><circle cx="1350" cy="855" r="18" fill="${TEAL}"/>${text(960,925,'공포 뒤 주요 규정 시행',42,INK,850,'middle')}${footer(source)}`};})(),
  (()=>{const kicker='경과조치 · 적용 범위';const title='시행 중인 일부 사건만 따로 봅니다';const source='부칙 제12조 · 시행 당시 이미 수사 중인 일부 사건의 경과조치';const xs=[180,780,1380];const labels=xs.map((_,i)=>`전환기 사건 ${i+1}`);const assets=xs.map((x,i)=>asset(`case-${i+1}`,timeAssets.folder,x,330,360,330,{row_id:'cases',baseline_group:'cases'}));const boxes=assets.map((item,i)=>centeredLabelBox(item,labels[i],44,710));return{frame_id:'SH040-T03-transition-v02',assets,geometry:{assets,texts:[...boxes.map((box,i)=>cue(`case-${i+1}-label`,'asset-label',box,44,`case-${i+1}`,labels[i])),headerCue('title',bbox(96,72,1400,110),kicker,title),cue('duration','screen-chrome',bbox(700,210,520,80),58,undefined,'최대 90일','center'),footerCue(source)],connectors:[{id:'duration-bracket',bbox:bbox(260,250,1400,50),endpoint_asset_ids:assets.map(a=>a.id)}]},overlay:`${header(kicker,title)}<path d="M260 285V255H1660V285" fill="none" stroke="${RED}" stroke-width="9"/>${text(960,235,'최대 90일',58,RED,900,'middle')}${boxes.map((box,i)=>label(box,labels[i],i===1?RED:BLUE,44)).join('')}${footer(source)}`};})(),
];

await mkdir(outputRoot,{recursive:true});
const manifests=[];
manifests.push(await buildFamily({id:'hook-source-collage-v02',profile:'source-photo-treatment',shots:['SH001','SH001','SH005'],captions:['H01 출처 두 칸','H02 보도 세 칸','H03 출처 흐름'],references:['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12','wiki/sources/vox-style-claude-remotion-reference.md'],boundary:'News and law captures are intake candidates for style review only; no rights approval is implied.',specs:hookSpecs}));
manifests.push(await buildFamily({id:'assembly-editorial-v02',profile:'remotion-motion',shots:['SH003','SH003','SH003'],captions:['A01 장소 고정','A02 인물 누적','A03 인물·법안 균형'],references:['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12','wiki/sources/mo-sidd-remotion-production-series.md §2–§6'],boundary:'Official profile photos require rights review. The chamber is a designed spatial anchor, not an official frame.',specs:assemblySpecs}));
manifests.push(await buildFamily({id:'process-route-editorial-v02',profile:'remotion-motion',shots:['SH019','SH030','SH048'],captions:['P01 항목 분리','P02 전달 경로','P03 삭제·존속'],references:['wiki/sources/mo-sidd-remotion-production-series.md §5–§7'],boundary:'Designed props explain relationships and do not substitute for statutory evidence.',specs:processSpecs}));
manifests.push(await buildFamily({id:'time-data-editorial-v02',profile:'remotion-motion',shots:['SH024','SH038','SH040'],captions:['T01 한 달','T02 공포·시행','T03 90일 범위'],references:['wiki/sources/mo-sidd-remotion-production-series.md §7'],boundary:'Dates and durations require exact source binding in production; designed props are explanatory only.',specs:timeSpecs}));

const omniRoot=path.join(outputRoot,'omni-fiction-continuity-v02');
const omniInputs=['SH008','SH011','SH014'].map(id=>path.join(historicOmniRoot,id,'assets','start.png'));
const omniSpecs=omniInputs.map((file,i)=>{const a=asset(`still-${i+1}`,file,0,0,W,H,{full_bleed:true});return{frame_id:[`SH008-O01-payment-v02`,`SH011-O02-wrong-item-v02`,`SH014-O03-report-v02`][i],assets:[a],geometry:{assets:[a],texts:[]},overlay:''};});
manifests.push(await buildFamily({id:'omni-fiction-continuity-v02',profile:'omni-keyframe-input',shots:['SH008','SH011','SH014'],captions:['O01 결제 행동','O02 다른 물건','O03 신고 행동'],references:['wiki/sources/action-driven-ai-video-generation.md'],boundary:'Historical stills are continuity-only review inputs, not production keyframes or generated motion.',specs:omniSpecs}));

const lawManifestPath=path.join(repoRoot,'video','qa','style-frames','episode-001','SH006-editorial-v05','manifest.json');
const lawManifest=JSON.parse(await readFile(lawManifestPath,'utf8'));
const familyManifests=await Promise.all(manifests.map(async record=>JSON.parse(await readFile(path.join(repoRoot,record.path),'utf8'))));
const all=[lawManifest,...familyManifests];
const boardPath=path.join(outputRoot,'EP001-reference-style-family-review-board-v02.png');
const rowWidth=1800;const contactHeight=488;const bandHeight=46;const rowHeight=contactHeight+bandHeight+24;
const boardRows=await Promise.all(all.map(async manifest=>({contact:await sharp(path.join(repoRoot,manifest.contact.path)).resize(rowWidth,contactHeight,{fit:'fill'}).png().toBuffer(),band:svg(`<rect width="${rowWidth}" height="${bandHeight}" fill="${INK}"/>${text(rowWidth-20,32,`PENDING USER PASS · ${manifest.candidate_id}`,24,'#fff',850,'end')}`,rowWidth,bandHeight)})));
await sharp({create:{width:1920,height:160+all.length*rowHeight+30,channels:4,background:'#eee7da'}}).composite([{input:svg(`${text(70,68,'EP001 · SPATIAL LAYOUT GATE V02',42,INK,900)}${text(70,118,'라벨 외부 분리 · 회전 금지 · 자산 간격/기준선/연결선 여백 검증',29,RED,850)}`,1920,160),left:0,top:0},...boardRows.flatMap((row,i)=>[{input:row.band,left:60,top:160+i*rowHeight},{input:row.contact,left:60,top:160+i*rowHeight+bandHeight}])]).png({compressionLevel:9}).toFile(boardPath);

const indexPath=path.join(outputRoot,'family-index.json');
const index={schema_version:2,episode_id:'episode-001',status:'pending-user-review-for-six-families',production_visible:false,layout_contract_version:2,layout_contract:STYLE_FRAME_LAYOUT_RULES,superseded_candidate_root:{path:'video/qa/style-frames/episode-001/reference-style-families-v01',status:'rejected-historical',reason:'Unbound labels, text/asset collisions, irregular spacing, and status bands drawn over contact content.'},approved_existing_family:null,pending_families:[{path:rel(lawManifestPath),sha256:await sha256(lawManifestPath),candidate_id:lawManifest.candidate_id},...manifests],review_board:{path:rel(boardPath),sha256:await sha256(boardPath),dimensions:{width:1920,height:160+all.length*rowHeight+30}},unlock_rule:'All six visual families require exact user style-frame PASS. This index grants no cut PASS, rights approval, active-root promotion, Omni generation, or stage advance.'};
await writeFile(indexPath,`${JSON.stringify(index,null,2)}\n`,'utf8');
console.log(JSON.stringify({index:rel(indexPath),index_sha256:await sha256(indexPath),board:index.review_board,pending_families:index.pending_families},null,2));
