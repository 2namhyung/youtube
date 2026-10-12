import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {openBrowser} from '@remotion/renderer';
import sharp from 'sharp';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = 'video/source-intake/episode-001/official/recapture-v03';
const VIEWPORT = {width: 1440, height: 1080, deviceScaleFactor: 1};
const TOOL = '@remotion/renderer openBrowser + Chromium CDP Page.captureScreenshot';
const SCHEMA_PATH = 'video/contracts/official-page-recapture-v1.schema.json';
const TARGETS = [
  {replacement_for:'LAW-195', source_id:'LAW-195-RECAPTURE-V01', needle:'제195조제1항에 후단을 다음과 같이 신설한다.', locator:'개정문 중 제195조제1항 후단 신설문'},
  {replacement_for:'LAW-196', source_id:'LAW-196-RECAPTURE-V01', needle:'제196조를 삭제한다.', locator:'개정문 중 제196조 삭제문'},
  {replacement_for:'LAW-1972', source_id:'LAW-1972-RECAPTURE-V01', needle:'제197조의2제4항(종전의 제2항)', locator:'개정문 중 제197조의2 제4항 및 1개월 기한 문단'},
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; };

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/source-intake/episode-001/official/intake-registry.json'), 'utf8'));
const byId = new Map(registry.entries.map((entry) => [entry.source_id, entry]));
const outputRelative = arg('--output-dir', DEFAULT_OUTPUT);
if (!outputRelative || path.isAbsolute(outputRelative) || outputRelative.split(/[\\/]/u).includes('..')) throw new Error('--output-dir must be a safe workspace-relative path');
const output = path.resolve(ROOT, outputRelative);
if (!output.startsWith(path.resolve(ROOT, 'video/source-intake/episode-001/official') + path.sep)) throw new Error('output must remain under the EP001 official intake root');
if (fs.existsSync(output)) throw new Error(`refusing to overwrite recapture evidence: ${outputRelative}`);

const browser = await openBrowser('chrome', {chromiumOptions:{headless:true}, logLevel:'warn'});
const captured = [];
try {
  const pages = await browser.pages();
  const page = pages[0] ?? await browser.newPage({context:()=>null, logLevel:'warn', indent:false, pageIndex:0, onBrowserLog:null, onLog:()=>{}});
  await page.setViewport(VIEWPORT);
  page.setDefaultNavigationTimeout(45000);
  for (const target of TARGETS) {
    const entry = byId.get(target.replacement_for);
    if (!entry) throw new Error(`registry source is missing: ${target.replacement_for}`);
    await page.goto({url:entry.canonical_url, timeout:45000, options:{timeout:45000}});
    let match = null;
    const deadline = Date.now() + 25000;
    while (!match && Date.now() < deadline) {
      match = await page.evaluate((needle) => {
        const container = document.querySelector('#viewwrapCenter');
        if (!(container instanceof HTMLElement)) return null;
        container.style.height = `${Math.max(480, window.innerHeight - container.getBoundingClientRect().top - 36)}px`;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        const matches = [];
        while ((node = walker.nextNode())) {
          const text = node.nodeValue?.replace(/\s+/gu, ' ').trim() ?? '';
          if (text.includes(needle)) matches.push({node, text});
        }
        matches.sort((left, right) => left.text.length - right.text.length);
        const selected = matches[0];
        if (!selected) return null;
        const range = document.createRange();
        range.selectNodeContents(selected.node);
        const before = range.getBoundingClientRect();
        const containerBefore = container.getBoundingClientRect();
        container.scrollTop = Math.max(0, container.scrollTop + before.top - containerBefore.top - 180);
        const targetRect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return {
          text:selected.text.slice(0, 240), title:document.title,
          selector:'#viewwrapCenter', scroll_top:container.scrollTop,
          target_rect:{top:targetRect.top,left:targetRect.left,width:targetRect.width,height:targetRect.height},
          container_rect:{top:containerRect.top,left:containerRect.left,width:containerRect.width,height:containerRect.height},
        };
      }, target.needle);
      if (!match) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!match) throw new Error(`${target.replacement_for}: exact locator text was not found; no evidence written`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await page._client().send('Page.captureScreenshot', {format:'png', fromSurface:true, captureBeyondViewport:false});
    const bytes = Buffer.from(response.value.data, 'base64');
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png' || metadata.width !== VIEWPORT.width || metadata.height !== VIEWPORT.height) throw new Error(`${target.replacement_for}: screenshot is not exact ${VIEWPORT.width}x${VIEWPORT.height} PNG`);
    const filename = `${target.source_id}.png`;
    const digest = sha256(bytes);
    captured.push({target, bytes, record:{source_id:target.source_id,replacement_for:target.replacement_for,captured_at:new Date().toISOString(),requested_url:entry.canonical_url,exact_url:page.url(),locator:target.locator,locator_evidence:{selector:match.selector,matched_text:match.text,scroll_top:match.scroll_top,target_rect:match.target_rect,container_rect:match.container_rect},matched_text:match.text,file:filename,actual_mime:'image/png',actual_extension:'.png',sha256:digest,bytes:bytes.byteLength,source_candidate_status:'unapproved-source-candidate',byte_preserved_copy:{relationship:'planned-byte-identical-copy-of-capture-on-registration',relative_path:`episode-media/episode-001/${target.source_id}/${filename}`,sha256:digest,status:'not-created-pending-registration'},human_approval:false,rights_approved:false,materialized:false}});
  }
} finally {
  await browser.close({silent:true});
}

fs.mkdirSync(output, {recursive:false});
for (const item of captured) fs.writeFileSync(path.join(output, item.record.file), item.bytes);
const schemaBytes = fs.readFileSync(path.join(ROOT, SCHEMA_PATH));
const manifest = {schema_version:1,schema:{path:SCHEMA_PATH,sha256:sha256(schemaBytes)},status:'unregistered-source-candidate-evidence',capture_tool:TOOL,viewport:{width:VIEWPORT.width,height:VIEWPORT.height,device_scale_factor:VIEWPORT.deviceScaleFactor},captures:captured.map((item)=>item.record),production_authority:false};
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({output:outputRelative,captures:manifest.captures.map(({source_id,sha256,bytes,exact_url})=>({source_id,sha256,bytes,exact_url})),registered:false,materialized:false,production_authority:false}, null, 2));
