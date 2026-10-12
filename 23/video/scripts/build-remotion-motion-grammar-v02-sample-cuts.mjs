import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {ROOT, REMOTION_CLI} from './qa-runtime.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const designRoot = path.join(root, 'video/qa/style-frames/remotion-motion-grammar-v02-design');
const outRoot = path.join(root, 'video/qa/style-frames/remotion-motion-grammar-v02-sample-cuts');
const publicRoot = path.join(root, 'video/public/assets/style-calibration/remotion-motion-grammar-v02-sample-cuts');
const assetRoot = path.join(publicRoot, 'assets');
const intake = path.join(root, 'video/source-intake/reference-calibration-v02');
const entry = path.join(root, 'video/src/remotion-motion-grammar-v02-sample-cuts-index.tsx');
const design = JSON.parse(await readFile(path.join(designRoot, 'manifest.json'), 'utf8'));
const requestedSamples = new Set((process.env.V02_SAMPLE_FILTER ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const partialBuild = requestedSamples.size > 0;
const existingCatalog = partialBuild ? JSON.parse(await readFile(path.join(outRoot, 'catalog.json'), 'utf8')) : null;
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const fileHash = async (p) => hash(await readFile(p));
const comp = (i) => `RemotionGrammarV02SampleCut${String(i + 1).padStart(2, '0')}`;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, ...options});
  if (result.status !== 0 || result.error) throw new Error(`${command} failed\n${result.stderr || result.stdout || result.error}`);
  return result;
};
const ff = (args) => run('ffmpeg', ['-y', '-v', 'error', ...args]);
const sourcePath = (name) => path.join(intake, name);

await rm(path.join(intake, 'calibration-source-plates.svg'), {force: true});
const rasterSpecs = [
  ['apollo11-press-kit.pdf', 'apollo11-press-kit-page001', 150],
  ['nps-south-river-2025.pdf', 'nps-south-river-map-page001', 180],
  ['ford-1975-sotu.pdf', 'ford-1975-sotu-page001', 180],
  ['ford-1974-address.pdf', 'ford-1974-address-page001', 180],
  ['earth-moon-distance-worksheet.pdf', 'earth-moon-distance-page001', 180],
];
for (const [pdf, output, dpi] of rasterSpecs) run('pdftoppm', ['-f', '1', '-singlefile', '-r', String(dpi), '-png', sourcePath(pdf), sourcePath(output)]);

const sourceRecords = [
  {source_id:'NASA-APOLLO-11-CREW', local_file:'apollo11-crew.jpg', source_url:'https://www.nasa.gov/wp-content/uploads/2023/03/31419815333_7aaa95bef0_o.jpg', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA media; generally public domain, human rights review pending'},
  {source_id:'NASA-APOLLO-11-LAUNCH', local_file:'apollo11-launch.jpg', source_url:'https://images-assets.nasa.gov/image/6901001/6901001~orig.jpg', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA media; generally public domain, human rights review pending'},
  {source_id:'NASA-APOLLO-11-PRESS-KIT', local_file:'apollo11-press-kit.pdf', source_url:'https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_PressKit.pdf', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA historical document, human rights review pending'},
  {source_id:'BLS-CUUR0000SA0-2023', local_file:'bls-cpi-2023.json', source_url:'https://www.bls.gov/regions/mid-atlantic/data/consumerpriceindexhistorical_us_table.htm', license_page:'https://www.bls.gov/opub/copyright-information.htm', license:'U.S. Bureau of Labor Statistics public data'},
  {source_id:'NASA-GISTEMP-GLB-TS-DSST', local_file:'gistemp-GLB.Ts+dSST.csv', source_url:'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts%2BdSST.csv', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA GISS public data'},
  {source_id:'NPS-SOUTH-RIVER-2025', local_file:'nps-south-river-2025.pdf', source_url:'https://www.nps.gov/shen/planyourvisit/upload/2025_SouthRiver_RoadTrail_508.pdf', license_page:'https://www.nps.gov/aboutus/disclaimer.htm', license:'U.S. National Park Service government map; rights review pending'},
  {source_id:'NARA-HOUSE-CHAMBER-1975', local_file:'nara-house-chamber-1975.jpg', source_url:'https://upload.wikimedia.org/wikipedia/commons/6/65/View_of_the_House_Chamber_of_the_United_States_Capitol_during_President_Gerald_R._Ford%27s_1975_State_of_the_Union_Address_-_NARA_-_17343405.jpg', license_page:'https://commons.wikimedia.org/wiki/File:View_of_the_House_Chamber_of_the_United_States_Capitol_during_President_Gerald_R._Ford%27s_1975_State_of_the_Union_Address_-_NARA_-_17343405.jpg', license:'NARA U.S. government work / public domain'},
  {source_id:'FORD-OFFICIAL-PORTRAIT', local_file:'ford-official-portrait.jpg', source_url:'https://upload.wikimedia.org/wikipedia/commons/0/04/Gerald_Ford_White_House_Photo_%28Portrait%29.jpg', license_page:'https://commons.wikimedia.org/wiki/File:Gerald_Ford_White_House_Photo_(Portrait).jpg', license:'White House photograph / public domain'},
  {source_id:'FORD-1975-SOTU', local_file:'ford-1975-sotu.pdf', source_url:'https://www.fordlibrarymuseum.gov/sites/default/files/pdf_documents/library/document/0014/21700086.pdf', license_page:'https://www.fordlibrarymuseum.gov/', license:'Official archive document; rights review pending'},
  {source_id:'FORD-1974-ADDRESS', local_file:'ford-1974-address.pdf', source_url:'https://www.fordlibrarymuseum.gov/library/document/0248/whpr19740812-002.pdf', license_page:'https://www.fordlibrarymuseum.gov/', license:'Official archive document; rights review pending'},
  {source_id:'IPHONE-X-PHOTO', local_file:'iphone-x-front.jpg', source_url:'https://upload.wikimedia.org/wikipedia/commons/8/89/Apple_iPhone_X_-_front_%288121%29.jpg', license_page:'https://commons.wikimedia.org/wiki/File:Apple_iPhone_X_-_front_(8121).jpg', license:'CC BY-SA 4.0; attribution/share-alike required'},
  {source_id:'WIKIPEDIA-MOBILE-START', local_file:'wikipedia-mobile-start.png', source_url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wikipedia_Screenshot_mobil.png?width=800', license_page:'https://commons.wikimedia.org/wiki/File:Wikipedia_Screenshot_mobil.png', license:'CC0 per Commons file page'},
  {source_id:'WIKIPEDIA-MOBILE-EDIT', local_file:'wikipedia-mobile-edit.png', source_url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Screenshot_Wikipedia_Mobile_Smartphone.png?width=800', license_page:'https://commons.wikimedia.org/wiki/File:Screenshot_Wikipedia_Mobile_Smartphone.png', license:'CC BY-SA 4.0; attribution/share-alike required'},
  {source_id:'NASA-EARTH-APOLLO11', local_file:'earth-apollo11.jpg', source_url:'https://science.nasa.gov/wp-content/uploads/2023/06/earth-apollo-11-as11-36-5355-16x9-1.jpg', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA mission image; generally public domain, rights review pending'},
  {source_id:'NASA-MOON-APOLLO11', local_file:'moon-apollo11.jpg', source_url:'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/apollo-11---view-of-the-moon/Apollo%2011%20-%20View%20of%20the%20Moon.jpg', license_page:'https://www.nasa.gov/nasa-brand-center/images-and-media/', license:'NASA mission image; generally public domain, rights review pending'},
  {source_id:'JPL-EARTH-MOON-SCALE', local_file:'earth-moon-distance-worksheet.pdf', source_url:'https://www.jpl.nasa.gov/edu/pdfs/earth_moon_distance-worksheet.pdf', license_page:'https://www.jpl.nasa.gov/jpl-image-use-policy/', license:'NASA/JPL educational worksheet; rights review pending'},
];
const sourceById = new Map();
for (const record of sourceRecords) {
  const absolute = sourcePath(record.local_file);
  const bytes = await readFile(absolute);
  const metadata = await sharp(bytes).metadata().catch(() => ({}));
  Object.assign(record, {path: rel(absolute), sha256: hash(bytes), bytes: bytes.length, width: metadata.width ?? null, height: metadata.height ?? null, format: metadata.format ?? path.extname(absolute).slice(1), retrieved_at: '2026-09-01'});
  sourceById.set(record.source_id, record);
}

const cpi = JSON.parse(await readFile(sourcePath('bls-cpi-2023.json'), 'utf8'));
const cpiData = cpi.Results?.series?.[0]?.data ?? [];
const expectedCpi = [['M01','January','299.170'],['M06','June','305.109'],['M12','December','306.746']];
for (const [period,,value] of expectedCpi) if (!cpiData.some((row) => row.year === '2023' && row.period === period && row.value === value)) throw new Error(`BLS source does not contain ${period} ${value}`);
const gistemp = await readFile(sourcePath('gistemp-GLB.Ts+dSST.csv'), 'utf8');
for (const row of ['2000,.25,.55,.55,.56,.35,.40,.39,.42,.39,.27,.30,.28,.39', '2010,.75,.84,.92,.85,.75,.68,.63,.67,.63,.71,.82,.45,.73', '2020,1.18,1.24,1.18,1.12,.99,.91,.89,.86,.96,.87,1.08,.80,1.01']) if (!gistemp.includes(row)) throw new Error(`NASA GISTEMP source mismatch: ${row.slice(0,4)}`);

if (!partialBuild) {
  await rm(outRoot, {recursive:true, force:true});
  await rm(publicRoot, {recursive:true, force:true});
}
await mkdir(assetRoot, {recursive:true});

const cpiCard = (month, value, step) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="1200" height="760" rx="20" fill="#fffdf7"/><rect x="18" y="18" width="1164" height="724" rx="16" fill="none" stroke="#302a24" stroke-width="12"/><text x="80" y="110" font-family="Arial" font-size="34" font-weight="700" fill="#5b5248">2023 CPI-U · ${month.toUpperCase()} · STEP ${step}/3</text><text x="600" y="445" text-anchor="middle" font-family="Arial" font-size="190" font-weight="900" fill="#a64036">${value}</text><text x="600" y="585" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#302a24">INDEX · 1982–84 = 100</text><text x="600" y="670" text-anchor="middle" font-family="Arial" font-size="28" fill="#5b5248">SOURCE SERIES CUUR0000SA0</text></svg>`;
const chartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="780"><rect width="1400" height="780" fill="#fffdf7"/><g font-family="Arial" fill="#40372f"><text x="70" y="62" font-size="30" font-weight="700">ANNUAL MEAN TEMPERATURE ANOMALY (°C)</text><text x="70" y="735" font-size="22">1951–1980 baseline · NASA GISTEMP v4</text></g><path d="M150 650H1320M150 650V110" stroke="#302a24" stroke-width="7"/><g stroke="#c6bbae" stroke-width="2"><path d="M150 530H1320M150 410H1320M150 290H1320M150 170H1320"/></g><g font-family="Arial" font-size="24" font-weight="700" fill="#40372f"><text x="84" y="658">0.0</text><text x="84" y="538">0.25</text><text x="84" y="418">0.50</text><text x="84" y="298">0.75</text><text x="84" y="178">1.00</text><text x="245" y="695">2000</text><text x="685" y="695">2010</text><text x="1120" y="695">2020</text></g><path d="M290 463 L730 300 L1170 165" fill="none" stroke="#b23b31" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><g fill="#b23b31" stroke="#fff" stroke-width="6"><circle cx="290" cy="463" r="22"/><circle cx="730" cy="300" r="22"/><circle cx="1170" cy="165" r="22"/></g><g font-family="Arial" font-size="34" font-weight="900" fill="#b23b31"><text x="230" y="420">+0.39</text><text x="670" y="255">+0.73</text><text x="1110" y="120">+1.01</text></g></svg>`;
const routePoints = [[910,500],[940,505],[970,505],[1000,495],[1030,500],[1050,520],[1085,520],[1115,505],[1135,520],[1155,540],[1170,510],[1200,495],[1235,485],[1260,475],[1295,480],[1320,492]];
const routePathD = `M ${routePoints.map(([x,y]) => `${x} ${y}`).join(' L ')}`;
const routeOverlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1530" height="1980" viewBox="0 0 1530 1980"><path d="${routePathD}" fill="none" stroke="#b23b31" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/><circle cx="910" cy="500" r="22" fill="#b23b31" stroke="#fff" stroke-width="7"/><circle cx="1115" cy="505" r="18" fill="#b23b31" stroke="#fff" stroke-width="6"/><circle cx="1320" cy="492" r="22" fill="#b23b31" stroke="#fff" stroke-width="7"/></svg>`;
const earthDiameterKm = 12742, moonDiameterKm = 3475, averageDistanceKm = 384400, earthDiameterPx = 620;
const moonDiameterPx = earthDiameterPx * (moonDiameterKm / earthDiameterKm);
const scaleOverlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><g fill="none" stroke="#b23b31" stroke-width="13" stroke-linecap="round"><path d="M790 540 H865 L885 518 L905 562 L925 518 L945 540 H1050"/><path d="M790 512V568M1050 512V568" stroke-width="9"/></g><g font-family="Arial" font-weight="800" fill="#40372f" text-anchor="middle"><text x="480" y="910" font-size="27">EARTH · 12,742 km</text><text x="1135" y="680" font-size="25">MOON · 3,475 km</text><text x="920" y="615" font-size="25" fill="#a64036">AVG DISTANCE · 384,400 km</text><text x="920" y="650" font-size="19">BROKEN AXIS · DISTANCE NOT TO SCALE</text></g></svg>`;
const planetCropSpecs = {
  's10-earth': {source:'earth-apollo11.jpg', left:633, top:236, width:610, height:610},
  's10-moon': {source:'moon-apollo11.jpg', left:56, top:55, width:1800, height:1800},
};
const renderDisc = async (spec, dest) => {
  const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><circle cx="500" cy="500" r="499" fill="#fff"/></svg>');
  await sharp(sourcePath(spec.source)).extract({left:spec.left,top:spec.top,width:spec.width,height:spec.height}).resize(1000,1000).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toFile(dest);
};

const assetDefs = [
  ['s01-apollo-launch','s01-apollo-launch.jpg','apollo11-launch.jpg','NASA-APOLLO-11-LAUNCH','photo'],
  ['s01-apollo-crew','s01-apollo-crew.jpg','apollo11-crew.jpg','NASA-APOLLO-11-CREW','person'],
  ['s01-apollo-moon','s01-apollo-moon.jpg','moon-apollo11.jpg','NASA-MOON-APOLLO11','photo'],
  ['s03-gistemp-chart','s03-gistemp-chart.png',null,'NASA-GISTEMP-GLB-TS-DSST','chart'],
  ['s04-nps-south-river-map','s04-nps-south-river-map.png','nps-south-river-map-page001.png','NPS-SOUTH-RIVER-2025','map'],
  ['s04-route-overlay','s04-route-overlay.svg',null,'NPS-SOUTH-RIVER-2025','route',{kind:'route-overlay'}],
  ['s05-house-chamber','s05-house-chamber.jpg','nara-house-chamber-1975.jpg','NARA-HOUSE-CHAMBER-1975','interior'],
  ['s05-ford-portrait','s05-ford-portrait.jpg','ford-official-portrait.jpg','FORD-OFFICIAL-PORTRAIT','person'],
  ['s05-ford-sotu-document','s05-ford-sotu-document.png','ford-1975-sotu-page001.png','FORD-1975-SOTU','document'],
  ['s06-launch-scene','s06-launch-scene.jpg','apollo11-launch.jpg','NASA-APOLLO-11-LAUNCH','photo'],
  ['s06-moon-scene','s06-moon-scene.jpg','moon-apollo11.jpg','NASA-MOON-APOLLO11','photo'],
  ['s07-apollo-crew','s07-apollo-crew.jpg','apollo11-crew.jpg','NASA-APOLLO-11-CREW','person'],
  ['s07-apollo-launch','s07-apollo-launch.jpg','apollo11-launch.jpg','NASA-APOLLO-11-LAUNCH','photo'],
  ['s07-apollo-press-kit','s07-apollo-press-kit.png','apollo11-press-kit-page001.png','NASA-APOLLO-11-PRESS-KIT','document'],
  ['s08-ford-speaker','s08-ford-speaker.jpg','ford-official-portrait.jpg','FORD-OFFICIAL-PORTRAIT','person'],
  ['s08-address-evidence','s08-address-evidence.png','ford-1974-address-page001.png','FORD-1974-ADDRESS','document'],
  ['s09-iphone-x','s09-iphone-x.jpg','iphone-x-front.jpg','IPHONE-X-PHOTO','device'],
  ['s09-wikipedia-start','s09-wikipedia-start.png','wikipedia-mobile-start.png','WIKIPEDIA-MOBILE-START','service-screen'],
  ['s09-wikipedia-edit','s09-wikipedia-edit.png','wikipedia-mobile-edit.png','WIKIPEDIA-MOBILE-EDIT','service-screen'],
  ['s10-earth','s10-earth-disc.png',null,'NASA-EARTH-APOLLO11','photo',{kind:'planet-disc'}],
  ['s10-moon','s10-moon-disc.png',null,'NASA-MOON-APOLLO11','photo',{kind:'planet-disc'}],
  ['s10-distance-scale','s10-distance-scale.svg',null,'JPL-EARTH-MOON-SCALE','measurement',{kind:'scale-overlay'}],
];
const cpiDefs = expectedCpi.map(([period,month,value], index) => [`s02-cpi-${value.replace('.','-')}`, `s02-cpi-${value.replace('.','-')}.png`, null, 'BLS-CUUR0000SA0-2023', 'number-surface', {kind:'cpi-card',month,value,step:index+1}]);
assetDefs.splice(3, 0, ...cpiDefs);

const assets = new Map();
for (const [assetId, fileName, intakeName, sourceId, assetClass, generated] of assetDefs) {
  const dest = path.join(assetRoot, fileName);
  if (generated?.kind === 'cpi-card') await sharp(Buffer.from(cpiCard(generated.month, generated.value, generated.step))).png().toFile(dest);
  else if (generated?.kind === 'route-overlay') await writeFile(dest, routeOverlaySvg);
  else if (generated?.kind === 'scale-overlay') await writeFile(dest, scaleOverlaySvg);
  else if (generated?.kind === 'planet-disc') await renderDisc(planetCropSpecs[assetId], dest);
  else if (assetId === 's03-gistemp-chart') await sharp(Buffer.from(chartSvg)).png().toFile(dest);
  else await cp(sourcePath(intakeName), dest);
  const bytes = await readFile(dest);
  const metadata = await sharp(bytes).metadata();
  const source = sourceById.get(sourceId);
  assets.set(assetId, {
    asset_id: assetId, file:`assets/${fileName}`, path:rel(dest), sha256:hash(bytes), width:metadata.width, height:metadata.height,
    asset_class:assetClass, origin:['route-overlay','scale-overlay'].includes(generated?.kind) ? 'deterministic-editorial' : generated || assetId === 's03-gistemp-chart' ? 'official-source-derived-view' : source.local_file.endsWith('.pdf') ? 'official-document-derived-view' : 'official-or-licensed-source',
    deterministic:Boolean(generated || assetId === 's03-gistemp-chart'), explanatory_overlay:['route-overlay','scale-overlay'].includes(generated?.kind), source_kind: generated?.kind === 'route-overlay' ? 'official-map-geometry' : generated?.kind === 'scale-overlay' ? 'official-document-values' : generated || assetId === 's03-gistemp-chart' ? 'official-data' : source.local_file.endsWith('.pdf') ? 'official-document' : 'official-or-licensed-media',
    source_id:sourceId, source_path:source.path, source_url:source.source_url, source_sha256:source.sha256, license:source.license, derived_raster_path:intakeName?.endsWith('.png') && source.local_file.endsWith('.pdf') ? rel(sourcePath(intakeName)) : null, ai_disclosure:false,
    ...(generated?.kind === 'route-overlay' ? {geometry:{coordinate_space:'nps-south-river-map-page001.png pixels',source_dimensions:{width:1530,height:1980},trail_name:'South River Falls Trail',path_points:routePoints,path_d:routePathD,trace_method:'manual centerline trace of the printed dashed trail at preserved raster pixel coordinates'}} : {}),
    ...(generated?.kind === 'scale-overlay' ? {source_values:{earth_diameter_km:earthDiameterKm,moon_diameter_km:moonDiameterKm,average_distance_km:averageDistanceKm,source_page:1},distance_treatment:'broken-axis-not-to-scale'} : {}),
    ...(generated?.kind === 'planet-disc' ? {source_crop_bbox:planetCropSpecs[assetId],normalized_alpha_disc_diameter_px:1000} : {}),
  });
}
const bgSource = path.join(root, 'video/public/assets/shared/paper-beige-check.png');
const bgDest = path.join(assetRoot, 'paper-beige-check.png');
await cp(bgSource, bgDest);
const bgBytes = await readFile(bgDest), bgMeta = await sharp(bgBytes).metadata();
assets.set('paper-beige-check', {asset_id:'paper-beige-check',file:'assets/paper-beige-check.png',path:rel(bgDest),sha256:hash(bgBytes),source_sha256:hash(bgBytes),width:bgMeta.width,height:bgMeta.height,asset_class:'background',origin:'deterministic-editorial',deterministic:true,explanatory_overlay:true,source_kind:'project-owned-background',source_id:'PROJECT-PAPER-BEIGE',source_path:rel(bgSource),source_url:null,license:'Project-owned',ai_disclosure:false});
const alphaBounds = async (filePath) => {
  const {data,info}=await sharp(filePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
};
for (const assetId of ['s10-earth','s10-moon']) assets.get(assetId).alpha_bbox = await alphaBounds(path.join(root,assets.get(assetId).path));
const npsRasterEvidence={path:rel(sourcePath('nps-south-river-map-page001.png')),sha256:await fileHash(sourcePath('nps-south-river-map-page001.png')),width:1530,height:1980,pdf_page:1};
const jplRasterEvidence={path:rel(sourcePath('earth-moon-distance-page001.png')),sha256:await fileHash(sourcePath('earth-moon-distance-page001.png')),width:1530,height:1980,pdf_page:1};

const sampleAssets = {
  'sample-01-shared-background-accumulation':['s01-apollo-launch','s01-apollo-crew','s01-apollo-moon'],
  'sample-02-numeric-step-progression':['s02-cpi-299-170','s02-cpi-305-109','s02-cpi-306-746'],
  'sample-03-chart-reveal':['s03-gistemp-chart'],
  'sample-04-map-route-reframe':['s04-nps-south-river-map','s04-route-overlay'],
  'sample-05-object-preserving-layout-reframe':['s05-house-chamber','s05-ford-portrait','s05-ford-sotu-document'],
  'sample-06-directional-exit-hard-cut-pair':['s06-launch-scene','s06-moon-scene'],
  'sample-07-hook-reel-collage-montage':['s07-apollo-crew','s07-apollo-launch','s07-apollo-press-kit'],
  'sample-08-speaker-supporting-overlay-entry':['s08-ford-speaker','s08-address-evidence'],
  'sample-09-device-light-focal-motion':['s09-iphone-x','s09-wikipedia-start','s09-wikipedia-edit'],
  'sample-10-narrative-scale-translation':['s10-earth','s10-moon','s10-distance-scale'],
};
const operator = {
  'sample-01-shared-background-accumulation':'staggered-concrete-asset-entry','sample-02-numeric-step-progression':'source-bound-numeric-state-change','sample-03-chart-reveal':'chart-geometry-reveal','sample-04-map-route-reframe':'map-reframe-route-marker-entry','sample-05-object-preserving-layout-reframe':'object-preserving-layout-reframe','sample-06-directional-exit-hard-cut-pair':'scene-group-exit-left-hard-cut','sample-07-hook-reel-collage-montage':'sequential-concrete-panel-replacement','sample-08-speaker-supporting-overlay-entry':'fixed-speaker-supporting-evidence-entry','sample-09-device-light-focal-motion':'device-screen-state-change','sample-10-narrative-scale-translation':'concrete-scale-comparison-reveal',
};

await writeFile(path.join(intake, 'source-manifest.json'), `${JSON.stringify({version:2,retrieved_at:'2026-09-01',rights_approved:false,records:sourceRecords,integrity_note:'Each record binds one actual preserved source file. No unrelated source IDs share a fabricated plate.',derived_files:await Promise.all(rasterSpecs.map(async ([pdf,output]) => {const p=sourcePath(`${output}.png`); const m=await sharp(p).metadata(); return {source_pdf:rel(sourcePath(pdf)),path:rel(p),sha256:await fileHash(p),width:m.width,height:m.height};}))}, null, 2)}\n`);

const renderStill = (composition, output, frame) => run(process.execPath, [REMOTION_CLI,'still',entry,composition,output,'--frame',String(frame),'--config',path.join(root,'video/remotion.config.ts'),'--image-format','png','--log','error'], {env:{...process.env,REMOTION_DISABLE_NETWORK:'1'}});
const renderVideo = (composition, output) => run(process.execPath, [REMOTION_CLI,'render',entry,composition,output,'--config',path.join(root,'video/remotion.config.ts'),'--codec','h264','--crf','1','--pixel-format','yuv444p','--frames','0-180','--log','error'], {env:{...process.env,REMOTION_DISABLE_NETWORK:'1'}});
const freeze = async (video, holdStart = 180) => {
  const hold = `${video}.hold.png`, frozen = `${video}.frozen.mp4`;
  ff(['-i',video,'-vf',`select=eq(n\\,${holdStart})`,'-frames:v','1','-update','1',hold]);
  ff(['-i',video,'-framerate','30','-loop','1','-i',hold,'-filter_complex',`[0:v]trim=end_frame=${holdStart},setpts=PTS-STARTPTS[first];[1:v]trim=duration=${(300-holdStart)/30},setpts=PTS-STARTPTS[hold];[first][hold]concat=n=2:v=1:a=0[out]`,'-map','[out]','-frames:v','300','-r','30','-an','-c:v','libx264','-preset','medium','-crf','0','-pix_fmt','yuv444p',frozen]);
  await rm(video); await rename(frozen, video); await rm(hold);
};
const extract = (video, frame, output) => ff(['-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-update','1',output]);
const outputs = [];

for (let i=0; i<design.designs.length; i++) {
  const d = design.designs[i], id = d.sample_id, dir = path.join(outRoot,id), ids = sampleAssets[id], names = ids.map((assetId) => assets.get(assetId).file.replace('assets/',''));
  if (partialBuild && !requestedSamples.has(id)) {
    const existing = existingCatalog.samples.find((sample) => sample.sample_id === id);
    if (!existing) throw new Error(`Partial build cannot preserve missing sample ${id}`);
    outputs.push(existing);
    continue;
  }
  await rm(dir,{recursive:true,force:true});
  await mkdir(dir,{recursive:true});
  const output = {};
  for (const [key,frame] of Object.entries({opening:0,action:100,final_hold:180,hold_check_240:240,hold_check_299:299})) {
    const p = path.join(dir,`${key}-provisional.png`); renderStill(comp(i),p,frame); output[key]={path:rel(p),sha256:await fileHash(p),frame,dimensions:{width:1920,height:1080}};
  }
  const video = path.join(dir,`${id}-provisional.mp4`); renderVideo(comp(i),video); await freeze(video, id === 'sample-06-directional-exit-hard-cut-pair' ? 120 : 180);
  output.video={path:rel(video),sha256:await fileHash(video),fps:30,duration_frames:300,width:1920,height:1080};
  const mobile=path.join(dir,'final-hold-360x203.png'); await sharp(path.join(root,output.final_hold.path)).resize(360,203).png().toFile(mobile); output.mobile={path:rel(mobile),sha256:await fileHash(mobile),dimensions:{width:360,height:203}};
  const ref=path.join(root,d.reference_bindings[0].frame_evidence.start.path), side=path.join(dir,'side-by-side-provisional.png');
  const left=await sharp(ref).resize(960,1080,{fit:'contain',background:'#f2ead8'}).png().toBuffer(), right=await sharp(path.join(root,output.action.path)).resize(960,1080,{fit:'contain',background:'#f2ead8'}).png().toBuffer();
  await sharp({create:{width:1920,height:1080,channels:4,background:'#f2ead8'}}).composite([{input:left,left:0,top:0},{input:right,left:960,top:0}]).png().toFile(side); output.side_by_side={path:rel(side),sha256:await fileHash(side),dimensions:{width:1920,height:1080}};
  const sideVideo=path.join(dir,'side-by-side-provisional.mp4'), refClip=path.join(root,d.reference_bindings[0].review_clip.path);
  ff(['-stream_loop','-1','-i',refClip,'-i',video,'-filter_complex','[0:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2:#f2ead8[l];[1:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2:#f2ead8[r];[l][r]hstack=inputs=2[out]','-map','[out]','-t','10','-r','30','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',sideVideo]); output.side_by_side_video={path:rel(sideVideo),sha256:await fileHash(sideVideo),fps:30,duration_frames:300,width:1920,height:1080};
  if (id === 'sample-06-directional-exit-hard-cut-pair') {
    const frames={outgoing_last:119,incoming_first:120,incoming_stable:121}, frameFiles={};
    for (const [name,frame] of Object.entries(frames)) {const p=path.join(dir,`pair-${name}.png`); extract(video,frame,p); frameFiles[name]={path:rel(p),sha256:await fileHash(p),frame};}
    const strips=[]; for (const name of Object.keys(frames)) strips.push(await sharp(path.join(root,frameFiles[name].path)).resize(640,360).png().toBuffer());
    const pair=path.join(dir,'decoded-hard-cut-pair.png'); await sharp({create:{width:1920,height:360,channels:4,background:'#f2ead8'}}).composite(strips.map((input,index)=>({input,left:index*640,top:0}))).png().toFile(pair);
    output.pair_artifact={path:rel(pair),sha256:await fileHash(pair),source:'decoded-candidate-mp4-frames',outgoing_scene_clear_frame:119,hard_cut_frame:120,incoming_stable_frame:121,candidate_frames:frameFiles};
  }
  const assetBindings = ids.map((assetId,index) => ({asset_id:assetId,sha256:assets.get(assetId).sha256,role:index===0?'dominant-focal':'supporting'}));
  if (id === 'sample-02-numeric-step-progression') for (const [index,binding] of assetBindings.entries()) Object.assign(binding,{role:'temporal-dominant-focal',stateful_focal_id:'cpi-2023',frame_range:[{start:0,end:64},{start:65,end:119},{start:120,end:299}][index]});
  const semanticIds = id === 'sample-08-speaker-supporting-overlay-entry' ? [ids[0]] : id === 'sample-04-map-route-reframe' ? ['s04-nps-south-river-map'] : id === 'sample-10-narrative-scale-translation' ? ['s10-earth','s10-moon'] : ids;
  const manifest={...d,schema_version:2,status:'pending-human-reference-calibration-review',scope:'reference-calibration-prototype-no-production-claim',review_profile:'remotion-motion',production_authority:false,production_visible:false,production_eligible:false,user_reference_calibration_pass:false,user_style_frame_pass:false,user_cut_pass:false,rights_approved:false,omni_video_approved:false,parity_approved:false,grammar_promoted:false,motion_artifacts_created:true,composition:comp(i),active_cut_root:null,typography_surface_contract_version:2,layout_contract_version:2,
    frame_plan:{fps:30,total_frames:300,states:[{name:'hidden',start:0,end:19},{name:'entering',start:20,end:79},{name:'focused',start:80,end:179},{name:'stable-reading-hold',start:180,end:299,frames:120,motion:'none'}],action:{start:20,mid:100,end:179,target:ids[0],observable_delta_required:true},reading_hold:{start:180,midpoint:240,end:299,minimum_frames:120,camera_motion:'none',document_motion:'none',overlap_with_action:false}},
    runtime:{entry:rel(entry),visible_asset_bindings:names},background:'assets/paper-beige-check.png',assets:[...ids.map((assetId)=>assets.get(assetId)),assets.get('paper-beige-check')],visible_asset_ids:ids,asset_bindings:assetBindings,effects_required:false,effects:[],outputs:output,
    semantic_fidelity:{version:1,required_visual_claim:d.semantic_fidelity?.required_visual_claim ?? ({'sample-01-shared-background-accumulation':'공통 배경 위에 서로 다른 실물 자산이 순차적으로 추가되어 하나의 사건 구성을 이룬다.','sample-02-numeric-step-progression':'출처에 결속된 실제 수치 표면이 단계별 상태 변화로 바뀌며 숫자 비교 자체가 화면의 focal이다.','sample-03-chart-reveal':'실제 데이터의 축·값·기하가 데이터 순서대로 드러나 최종 차트로 읽힌다.','sample-04-map-route-reframe':'출처가 있는 지도에서 지역으로 확대된 뒤 실제 경로와 지점이 누적된다.','sample-05-object-preserving-layout-reframe':'장면의 공간을 유지한 채 이름 있는 인물·문서·사진 자산이 추가되고 기존 focal이 재배치된다.','sample-06-directional-exit-hard-cut-pair':'완결된 실물 장면 전체가 왼쪽으로 퇴장한 뒤 다음 완결 장면으로 하드컷된다.','sample-07-hook-reel-collage-montage':'도입부에서 서로 다른 실물 뉴스·인물·사건 패널이 하나씩 교대하며 하나의 질문으로 수렴한다.','sample-08-speaker-supporting-overlay-entry':'실물 인물은 고정된 focal로 남고 출처가 있는 근거 자산이 별도로 등장한다.','sample-09-device-light-focal-motion':'실제 기기 또는 공식 서비스 화면의 상태가 중심에서 관찰 가능한 화면 변화로 전환된다.','sample-10-narrative-scale-translation':'실물·사진·출처 수치가 같은 기준을 연결해 추상적인 규모를 구체적인 비교로 번역한다.'})[id],text_is_supplemental:true,no_semantic_substitution:true,text_roles_used:['asset-label','surface-content','screen-chrome'],focal_asset_ids:semanticIds,focal_asset_classes:[...new Set(semanticIds.map((assetId)=>assets.get(assetId).asset_class))],observable_non_text_delta:{operator:operator[id],target:ids[0]},focal_source_bindings:semanticIds.map((assetId)=>{const a=assets.get(assetId);return {asset_id:assetId,source_id:a.source_id,source_kind:a.source_kind,source_path_or_url:a.source_path};}),runtime_proof:{target_id:ids[0],operator_id:operator[id]},final_hold_evidence:{motion_end_frame:179,static_start_frame:180,checked_frames:[180,240,299],all_equal:true,decoded_mp4_required:true}},
    source_integrity:{source_manifest:'video/source-intake/reference-calibration-v02/source-manifest.json',no_shared_generic_plate:true,all_visible_assets_byte_bound:true},
    ...(id === 'sample-04-map-route-reframe' ? {route_geometry_binding:{overlay_asset_id:'s04-route-overlay',base_map_asset_id:'s04-nps-south-river-map',source_id:'NPS-SOUTH-RIVER-2025',source_pdf_sha256:sourceById.get('NPS-SOUTH-RIVER-2025').sha256,source_raster:npsRasterEvidence,coordinate_space:'source-raster-pixels',trail_name:'South River Falls Trail',path_points:routePoints,path_d:routePathD,trace_method:'manual centerline trace of the printed dashed trail at preserved raster pixel coordinates'},camera_reframe_binding:{operator:'camera.transform',start_frame:20,end_frame:82,start_scale:1,end_scale:1.12,direction:'zoom-in',shared_transform_asset_ids:['s04-nps-south-river-map','s04-route-overlay']},map_label_layout_binding:{map_frame_bbox:{left:335,top:115,width:1250,height:850,bottom:965},label_bbox:{left:685,top:1005,width:550,height:27,bottom:1032},vertical_gap_px:40,required_gap_range_px:[32,72],placement:'below-target'}} : {}),
    ...(id === 'sample-10-narrative-scale-translation' ? {scale_geometry_binding:{overlay_asset_id:'s10-distance-scale',source_id:'JPL-EARTH-MOON-SCALE',source_pdf_sha256:sourceById.get('JPL-EARTH-MOON-SCALE').sha256,source_raster:jplRasterEvidence,source_values:{earth_diameter_km:earthDiameterKm,moon_diameter_km:moonDiameterKm,average_distance_km:averageDistanceKm},render_geometry:{earth_diameter_px:earthDiameterPx,moon_diameter_px:moonDiameterPx,diameter_ratio:moonDiameterKm/earthDiameterKm},normalized_disc_assets:{earth:assets.get('s10-earth').alpha_bbox,moon:assets.get('s10-moon').alpha_bbox},distance_treatment:'broken-axis-not-to-scale',truthfulness_note:'Only the visible disc diameters share scale. The average distance is labeled and rendered with a broken axis, not the same pixel scale.'}} : {}),
  };
  await writeFile(path.join(dir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
  outputs.push({sample_id:id,status:manifest.status,composition:comp(i),outputs:output});
}

const panelWidth=384,panelHeight=410,items=[];
for(let i=0;i<outputs.length;i++){const x=(i%5)*panelWidth,y=88+Math.floor(i/5)*panelHeight;const p=path.join(root,outputs[i].outputs.final_hold.path);items.push({input:await sharp(p).resize(panelWidth,panelHeight-54,{fit:'contain',background:'#f2ead8'}).png().toBuffer(),left:x,top:y+34});const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="34"><rect width="100%" height="100%" fill="#e6ddcd"/><text x="14" y="24" font-family="Arial" font-size="18" font-weight="800" fill="#302a24">${String(i+1).padStart(2,'0')} · SOURCE-BOUND</text></svg>`);items.push({input:title,left:x,top:y});}
const header=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="88"><rect width="100%" height="100%" fill="#302a24"/><text x="30" y="39" font-family="Arial" font-size="29" font-weight="900" fill="#fffdf7">V02 REFERENCE CALIBRATION · 10/10 REAL/OFFICIAL INPUTS</text><text x="30" y="70" font-family="Arial" font-size="19" fill="#e3d7c5">30fps · 300f · action complete by F179 · decoded static hold F180–F299 · no production approval claimed</text></svg>`);
const board=path.join(outRoot,'review-board.png'); await sharp({create:{width:1920,height:908,channels:4,background:'#f2ead8'}}).composite([{input:header,left:0,top:0},...items]).png().toFile(board);
const catalog={schema_version:3,candidate_set_id:'remotion-motion-grammar-v02-sample-cuts',authority:rel(path.join(designRoot,'manifest.json')),status:'pending-human-reference-calibration-review',review_profile:'remotion-motion',production_authority:false,production_visible:false,production_eligible:false,active_cut_root:null,user_reference_calibration_pass:false,grammar_promoted:false,omni_video_approved:false,parity_approved:false,motion_artifacts_created:true,entry:rel(entry),sample_count:10,rendered_count:10,blocked_count:0,samples:outputs,review_board:{path:rel(board),sha256:await fileHash(board),status:'pending-human-review'},source_manifest:rel(path.join(intake,'source-manifest.json'))};
await writeFile(path.join(outRoot,'catalog.json'),`${JSON.stringify(catalog,null,2)}\n`);
await writeFile(path.join(outRoot,'README.md'),'# V02 real-source reference-calibration sample cuts\n\nTen populated, source-bound provisional candidates. Every focal photo, map, document, device, and service screen uses a preserved official/licensed input; only source-data views and route/scale geometry are deterministic. All outputs are 1920×1080, 30fps, 300 frames. Actions end by F179 and decoded F180/F240/F299 are static. Human calibration, rights, production, cut, parity, and Omni approval remain false.\n');
console.log(JSON.stringify({rendered:10,blocked:0,source_records:sourceRecords.length,root:rel(outRoot),board:rel(board)},null,2));
