import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve('C:/Users/User/Desktop/app/youtube');
const opencut = path.join(root, '06-production', 'opencut-automation');
const planPath = path.join(opencut, 'out', 'prototypes', 'research-6b1a8af9b4143acb-next-stage-v1', 'agent-authored-video-design-plan-v1.json');
const narrationManifestPath = path.join(opencut, 'out', 'newsroom', 'narration-revisions', 'research-6b1a8af9b4143acb', 'partial-qa-v1-eb9b25b00f5e200f', 'manifest.json');
const narrationAudioPath = path.join(opencut, 'out', 'newsroom', 'narration-revisions', 'research-6b1a8af9b4143acb', 'partial-qa-v1-eb9b25b00f5e200f', 'narration-final.m4a');
const outDir = path.join(opencut, 'out', 'studies', 'research-6b1a8af9b4143acb', 'motion-design-preproduction-v1');
const animaticDir = path.join(outDir, 'animatic');
const styleDir = path.join(outDir, 'cut001-styleframe');
fs.mkdirSync(animaticDir, { recursive: true });
fs.mkdirSync(styleDir, { recursive: true });

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const narration = JSON.parse(fs.readFileSync(narrationManifestPath, 'utf8'));
const fps = 24;
const durationSeconds = 55.016;
const title = { line1: '경찰 아버지가', line2: '부순 휴대전화', safeWidth: 920, x: 540, y1: 201, y2: 326, size1: 120, size2: 143 };
const geometry = { canvas: { width: 1080, height: 1920, fps }, media: { x: 54, y: 474, width: 972, height: 972 }, title, captions: { x: 540, y: 1400, size: 88, safeWidth: 920, maxLines: 2 } };
const references = [
  { id: 'ref-relationship-network', url: 'https://www.youtube.com/watch?v=PSHQ_MuxxNw&t=925s', observed: 'nodes, connectors and terminal settle', inferredUse: 'responsibility-chain grammar only; no source footage or labels' },
  { id: 'ref-document-highlight', url: 'https://www.youtube.com/watch?v=V6d8Yy7Ji68&t=500s', observed: 'highlight mask sweeps across a document line', inferredUse: 'evidence-record emphasis timing' },
  { id: 'ref-digital-record-build', url: 'https://www.youtube.com/watch?v=dNGUiWKn6Qs&t=308s', observed: 'typed lines and resolved result label', inferredUse: 'audit/discovery progression' },
  { id: 'ref-node-population', url: 'https://www.youtube.com/watch?v=Eo0JQLIG6hA&t=90s', observed: 'nodes populate and density increases', inferredUse: 'bounded investigation map population' }
];
const engineBundle = { authorityBundleId: 'newsroom-deterministic-motion-engines-v1', authorityBundleSha256: '63b989bab30c0ee07634a8cd0b32ae7d0615d59b32c5415efae6b9831089fe18', adapterSha256: 'ed1f1820ecd1c061c97e4e434b18527ffa9464de45c24d232738aa5bfbd4b59c' };
const cueCounts = [2, 3, 4, 2, 3, 3, 1];
const cueMap = new Map();
let cutIndex = 0;
for (let cueIndex = 0; cueIndex < narration.cues.length; cueIndex += 1) {
  for (let n = 0; n < cueCounts[cueIndex]; n += 1) cueMap.set(plan.cuts[cutIndex++].cutId, cueIndex);
}
const graphicLabels = {
  'evidence-comparison': 'EVIDENCE COMPARISON', 'spatial-search-map': 'SPATIAL SEARCH MAP', 'investigation-flow': 'INVESTIGATION FLOW',
  'timeline-gap': 'TIMELINE GAP', 'audit-grid': 'AUDIT GRID', 'document-highlight': 'DOCUMENT HIGHLIGHT', 'track-gap': 'LEGAL / TRACK GAP', 'legal-barrier': 'LEGAL BARRIER'
};
const layerNames = ['background field', 'media square frame', 'focal evidence object', 'context card', 'relationship connector', 'state marker', 'emphasis mask', 'disclosure strip'];
const pathsByType = {
  'evidence-comparison': ['focal object: (270,350) → (486,350)', 'divider: x=486 → x=720', 'emphasis mask: opacity 0.25 → 1.0'],
  'spatial-search-map': ['route: (170,680) → (480,390) → (800,270)', 'pin: scale 0.75 → 1.0', 'camera crop: y=620 → y=430'],
  'investigation-flow': ['evidence token: (180,480) → (480,480) → (780,480)', 'connector: width 0 → 540', 'result marker: opacity 0 → 1'],
  'timeline-gap': ['timeline rail: x=160 → x=812', 'late-confirmation marker: x=740 → x=812', 'gap bracket: width 0 → 260'],
  'audit-grid': ['grid scan: row 1 → row 4', 'folder focus: (330,300) → (650,650)', 'late-discovery marker: opacity 0 → 1'],
  'document-highlight': ['document card: (210,280) → (250,280)', 'highlight sweep: x=250 → x=760', 'annotation tag: scale 0.7 → 1.0'],
  'track-gap': ['investigation lane: x=180 → x=720', 'barrier: y=620 → y=420', 'punishment marker: opacity 0.2 → 1'],
  'legal-barrier': ['family token: (180,560) → (380,560)', 'legal wall: y=720 → y=420', 'blocked lane: x=380 → x=760']
};
function esc(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function svgFrame(cut, idx, totalCuts, frameSeconds, timeline) {
  const w = 1080, h = 1920, mx = 54, my = 474, ms = 972;
  const accent = idx % 3 === 0 ? '#63c6c8' : (idx % 3 === 1 ? '#d58a70' : '#c6b36b');
  const type = cut.motionGraphics?.graphicType || 'grok-placeholder';
  const label = cut.implementationMode === 'image_to_video_animation' ? 'GROK PLACEHOLDER ONLY' : (graphicLabels[type] || 'DETERMINISTIC MOTION GRAPHICS');
  const fill = Math.round(70 + (idx % 4) * 4);
  const objectW = Math.round(ms * fill / 100);
  const cue = narration.cues[cueMap.get(cut.cutId)];
  const phase = ((frameSeconds - timeline.startSeconds) / Math.max(0.001, timeline.durationSeconds));
  const xShift = Math.round(18 * Math.min(1, Math.max(0, phase)));
  const shape = cut.implementationMode === 'image_to_video_animation'
    ? `<rect x="${mx + 160 + xShift}" y="${my + 280}" width="${ms - 320}" height="360" rx="24" fill="#30343a" stroke="${accent}" stroke-width="8"/><circle cx="${mx + 486}" cy="${my + 460}" r="104" fill="#f1efe9"/><path d="M${mx + 360} ${my + 620} Q${mx + 486} ${my + 520} ${mx + 612} ${my + 620}" fill="none" stroke="#f1efe9" stroke-width="22"/><text x="${mx + 486}" y="${my + 720}" text-anchor="middle" fill="${accent}" font-size="28" font-family="Arial">ARTICULATED REACH / OCCLUSION DEFERRED TO GROK</text>`
    : `<rect x="${mx + 486 - objectW / 2 + xShift}" y="${my + 290}" width="${objectW}" height="360" rx="18" fill="#f1efe9" stroke="#1d2024" stroke-width="5"/><rect x="${mx + 160}" y="${my + 730}" width="${ms - 320}" height="34" fill="#262a30"/><rect x="${mx + 160}" y="${my + 730}" width="${Math.round((ms - 320) * Math.min(1, Math.max(0, phase)))}" height="34" fill="${accent}"/><line x1="${mx + 180}" y1="${my + 690}" x2="${mx + 792}" y2="${my + 290}" stroke="${accent}" stroke-width="8"/><circle cx="${mx + 792}" cy="${my + 290}" r="22" fill="${accent}"/><text x="${mx + 486}" y="${my + 510}" text-anchor="middle" fill="#1d2024" font-size="36" font-family="Arial">CODE-NATIVE PLACEHOLDER</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#090a0c"/>
  <text x="540" y="82" text-anchor="middle" fill="#f1efe9" font-size="30" font-family="Arial" letter-spacing="4">PREPRODUCTION ANIMATIC • NOT FINAL MEDIA</text>
  <text x="540" y="201" text-anchor="middle" fill="#f1efe9" font-size="120" font-family="Arial">${esc(title.line1)}</text>
  <text x="540" y="326" text-anchor="middle" fill="#f1efe9" font-size="143" font-family="Arial">${esc(title.line2)}</text>
  <rect x="${mx}" y="${my}" width="${ms}" height="${ms}" fill="#15181c" stroke="#f1efe9" stroke-width="4"/>
  <text x="${mx + 36}" y="${my + 56}" fill="${accent}" font-size="28" font-family="Arial" letter-spacing="2">CUT ${String(idx + 1).padStart(2, '0')} / ${totalCuts} • ${esc(label)}</text>
  ${shape}
  <text x="${mx + 36}" y="${my + 850}" fill="#f1efe9" font-size="26" font-family="Arial">START → MID → FINAL</text>
  <text x="${mx + 36}" y="${my + 888}" fill="#c4c7cb" font-size="23" font-family="Arial">${esc(cut.preproduction.states.start)} → ${esc(cut.preproduction.states.mid)} → ${esc(cut.preproduction.states.final)}</text>
  <rect x="54" y="1320" width="972" height="156" fill="#101216" stroke="#3c4148" stroke-width="2"/>
  <text x="540" y="1372" text-anchor="middle" fill="#f1efe9" font-size="28" font-family="Arial">NARRATION CUE ${cueMap.get(cut.cutId) + 1} • ${timeline.startSeconds.toFixed(3)}–${timeline.endSeconds.toFixed(3)}s</text>
  <text x="540" y="1422" text-anchor="middle" fill="${accent}" font-size="26" font-family="Arial">ACTION: ${esc(cut.preproduction.reviewAnnotation)}</text>
  <text x="540" y="1530" text-anchor="middle" fill="#7f858d" font-size="24" font-family="Arial">Caption-safe center x=540 / y=1400 • media 972×972 • 24fps</text>
  <text x="540" y="1600" text-anchor="middle" fill="#8d939b" font-size="22" font-family="Arial">${esc(cut.preproduction.prohibitedVisuals.join(' • '))}</text>
  <text x="540" y="1770" text-anchor="middle" fill="#5d646d" font-size="22" font-family="Arial">STUDY OUTPUT — review geometry, timing and state change only</text>
  </svg>`;
}

// Timeline: each narration cue gets its assigned cuts; cue pauses are held in its first cut.
let cursor = 0;
const cutRecords = [];
for (let i = 0; i < plan.cuts.length; i += 1) {
  const cut = plan.cuts[i];
  const cueIndex = cueMap.get(cut.cutId);
  const cue = narration.cues[cueIndex];
  const inCue = plan.cuts.slice(0, i + 1).filter((x) => cueMap.get(x.cutId) === cueIndex).length;
  const count = cueCounts[cueIndex];
  const pause = inCue === 1 ? Math.max(0, cue.start - cursor) : 0;
  const activeShare = (cue.end - cue.start) / count;
  const start = cursor;
  const end = Math.min(durationSeconds, start + pause + activeShare);
  cursor = end;
  const type = cut.motionGraphics?.graphicType || 'grok-placeholder';
  const claimId = cut.claimIds?.[0] || 'unbound-claim';
  const exactText = cut.motionGraphics?.claim || cut.captionAnchor || '';
  const engine = cut.motionGraphics?.engineId || 'grok-placeholder';
  const pre = {
    claim: { claimId, exactText, status: 'observed-from-authoritative-plan', evidenceStatus: cut.evidenceStatus, spanIds: cut.spanBindings.map((s) => s.spanId) },
    states: {
      start: cut.implementationMode === 'image_to_video_animation' ? 'phone and reaching roles are staged but action is not rendered' : 'bound evidence token is quiet / low emphasis',
      mid: cut.implementationMode === 'image_to_video_animation' ? 'Grok action beat is reserved for provider review' : 'focal object and relationship path enter with bounded emphasis',
      final: cut.implementationMode === 'image_to_video_animation' ? 'placeholder ends on occlusion outcome; no provider output admitted' : 'one evidence claim is legible and held before exit'
    },
    focalObjectOccupancyPercent: 70 + (i % 4) * 4,
    functionalLayers: layerNames.slice(0, 6 + (i % 3)),
    objectPaths: pathsByType[type] || ['focal placeholder: centered hold', 'occlusion boundary: deferred to Grok', 'exit: hard cut to next evidence state'],
    transition: { in: i === 0 ? 'fade from black (0.18s)' : (i % 2 ? 'hard-cut' : 'match-on-object'), out: 'hard-cut', rationale: 'preserve one-claim-per-screen and adjacent-mechanic diversity' },
    timing: { easing: cut.implementationMode === 'image_to_video_animation' ? 'provider-authored; meaningful action complete by 4s' : (i % 2 ? 'ease-out' : 'ease-in-out'), effects: ['opacity emphasis', 'bounded scale 1.00→1.02', 'no particle or lighting simulation'], beats: [{ name: 'enter', seconds: 0.6 }, { name: 'emphasize', seconds: 0.6 }, { name: 'hold', seconds: Math.max(0.4, end - start - 1.8) }, { name: 'exit', seconds: 0.6 }] },
    geometry,
    engineAssignment: cut.implementationMode === 'image_to_video_animation' ? { kind: 'image_to_video_animation', engine: 'Grok', status: 'placeholder-only', sourceContract: '1:1 480x480 / 6s / action complete by 4s', productionAuthorized: false } : { kind: 'deterministic_motion_graphics', engine, status: 'study-assignment-only', productionAuthorized: false, ...engineBundle, rendererContract: cut.motionGraphics?.engineAuthority?.rendererContract || null },
    prohibitedVisuals: ['no final ImageGen/provider output', 'no human movement in deterministic layers', 'no names, faces, logos or identifying marks'],
    reviewAnnotation: cut.implementationMode === 'image_to_video_animation' ? 'GROK PLACEHOLDER — articulated reach + occlusion' : `${graphicLabels[type] || 'NON-HUMAN GRAPHIC'} — reveal one claim`,
    referenceProvenance: references.map((r) => ({ ...r, label: 'observed reference / inferred transfer' }))
  };
  cutRecords.push({ cutId: cut.cutId, cueIndex: cueIndex + 1, narrationCue: { start: cue.start, end: cue.end, text: cue.text }, timeline: { startSeconds: Number(start.toFixed(6)), endSeconds: Number(end.toFixed(6)), durationSeconds: Number((end - start).toFixed(6)), startFrame: Math.round(start * fps), endFrameExclusive: Math.round(end * fps) }, implementationMode: cut.implementationMode, sourcePlanFields: { sceneRole: cut.sceneRole, sourceKind: cut.sourceKind, libraryPatternId: cut.motionGraphics?.libraryPatternId || null }, preproduction: pre });
}
cutRecords.at(-1).timeline.endSeconds = durationSeconds;
cutRecords.at(-1).timeline.durationSeconds = Number((durationSeconds - cutRecords.at(-1).timeline.startSeconds).toFixed(6));

const artifact = {
  schema: 'motion-design-preproduction-v1', version: 1, status: 'study-only-not-production-authority', createdAt: new Date().toISOString(), slug: 'research-6b1a8af9b4143acb', durationSeconds, fps,
  inputBindings: { authoredPlanPath: path.relative(root, planPath).replaceAll('\\', '/'), authoredPlanSha256: sha(planPath), narrationManifestPath: path.relative(root, narrationManifestPath).replaceAll('\\', '/'), narrationManifestSha256: sha(narrationManifestPath), narrationAudioSha256: narration.audioSha256, approvedNarrationDurationSeconds: narration.durationSeconds, titleAuthority: title },
  geometry, reviewHistory: { userDecision: 'reject', userScore: 10, userScoreMax: 100, v1: { path: '06-production/opencut-automation/out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1', status: 'non-promoted; bytes preserved' }, v2: { path: '06-production/opencut-automation/out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2', status: 'non-promoted; nonAuthoritative=true; bytes preserved' }, mgPreviewV1: { path: '06-production/opencut-automation/out/prototypes/research-6b1a8af9b4143acb-mg-preview-v1', status: 'non-promoted; private study only' }, decisionNote: 'This v1 preproduction study records the rejection and does not modify any prior artifact.' },
  referenceProvenance: references, cuts: cutRecords
};
const artifactPath = path.join(outDir, 'motion-design-preproduction-v1.json');
fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

// Render frame cards at 24fps; the final frame count intentionally covers the 55.016s audio target.
const totalFrames = Math.ceil(durationSeconds * fps);
for (let frame = 0; frame < totalFrames; frame += 1) {
  const t = frame / fps;
  const cut = cutRecords.find((c) => t >= c.timeline.startSeconds && t < c.timeline.endSeconds) || cutRecords.at(-1);
  const svg = svgFrame({ ...plan.cuts.find((p) => p.cutId === cut.cutId), preproduction: cut.preproduction }, cutRecords.indexOf(cut), cutRecords.length, t, cut.timeline);
  fs.writeFileSync(path.join(animaticDir, `frame-${String(frame).padStart(4, '0')}.svg`), svg, 'utf8');
}
const style = `<svg xmlns="http://www.w3.org/2000/svg" width="972" height="972" viewBox="0 0 972 972"><rect width="972" height="972" fill="#15181c"/><rect x="34" y="34" width="904" height="904" fill="#f1efe9" stroke="#1d2024" stroke-width="6"/><rect x="80" y="92" width="812" height="128" fill="#d7d2c7"/><rect x="118" y="266" width="736" height="310" rx="24" fill="#f7f5ee" stroke="#1d2024" stroke-width="8"/><rect x="118" y="626" width="736" height="42" fill="#262a30"/><rect x="118" y="626" width="610" height="42" fill="#63c6c8"/><path d="M170 760 L430 600 L790 350" fill="none" stroke="#d58a70" stroke-width="14"/><circle cx="790" cy="350" r="26" fill="#d58a70"/><rect x="138" y="736" width="180" height="80" fill="#c6b36b"/><rect x="344" y="736" width="180" height="80" fill="#63c6c8"/><rect x="550" y="736" width="180" height="80" fill="#d58a70"/><text x="486" y="160" text-anchor="middle" font-family="Arial" font-size="34" fill="#1d2024">CUT 001 • FINAL-STATE STUDY</text><text x="486" y="460" text-anchor="middle" font-family="Arial" font-size="42" fill="#1d2024">FOCAL PHONE EVIDENCE</text><text x="486" y="886" text-anchor="middle" font-family="Arial" font-size="24" fill="#1d2024">occupancy 74% • 8 functional layers • grayscale + limited accent</text></svg>`;
const styleSvgPath = path.join(styleDir, 'cut001-styleframe.svg');
fs.writeFileSync(styleSvgPath, style, 'utf8');
fs.writeFileSync(path.join(styleDir, 'cut001-styleframe-spec.json'), JSON.stringify({ schema: 'cut001-styleframe-spec-v1', status: 'layout-study-not-final-asset', canvas: { width: 972, height: 972 }, focalObjectOccupancyPercent: 74, functionalLayers: layerNames, colorTreatment: 'black/white/limited accent', prohibited: ['ImageGen/provider output', 'human movement', 'final asset admission'], sourceBindings: { authoredPlanSha256: sha(planPath), narrationAudioSha256: narration.audioSha256 } }, null, 2) + '\n', 'utf8');

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('python', [path.join(opencut, 'scripts', 'render_motion_preproduction_frames.py'), outDir]);
const silent = path.join(animaticDir, 'animatic-silent.mp4');
run('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(animaticDir, 'frame-%04d.png'), '-t', String(durationSeconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'format=yuv420p', silent]);
const finalVideo = path.join(animaticDir, 'animatic-1080x1920-24fps.mp4');
run('ffmpeg', ['-y', '-i', silent, '-i', narrationAudioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-t', String(durationSeconds), '-movflags', '+faststart', finalVideo]);
const contactSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1080" viewBox="0 0 1800 1080"><rect width="1800" height="1080" fill="#090a0c"/><text x="900" y="42" text-anchor="middle" font-family="Arial" font-size="28" fill="#f1efe9">18-CUT PREPRODUCTION ANIMATIC CONTACT SHEET • NOT FINAL</text>${cutRecords.map((c, i) => { const x = 30 + (i % 6) * 295; const y = 75 + Math.floor(i / 6) * 330; const a = i % 3 === 0 ? '#63c6c8' : (i % 3 === 1 ? '#d58a70' : '#c6b36b'); return `<rect x="${x}" y="${y}" width="275" height="285" fill="#15181c" stroke="${a}" stroke-width="4"/><rect x="${x + 18}" y="${y + 40}" width="239" height="180" fill="#f1efe9"/><line x1="${x + 35}" y1="${y + 190}" x2="${x + 220}" y2="${y + 70}" stroke="${a}" stroke-width="7"/><text x="${x + 18}" y="${y + 28}" font-family="Arial" font-size="20" fill="#f1efe9">CUT ${String(i + 1).padStart(2, '0')} • ${c.implementationMode === 'image_to_video_animation' ? 'GROK PLACEHOLDER' : 'MG'}</text><text x="${x + 18}" y="${y + 250}" font-family="Arial" font-size="17" fill="#c4c7cb">${c.timeline.startSeconds.toFixed(2)}–${c.timeline.endSeconds.toFixed(2)}s</text><text x="${x + 18}" y="${y + 272}" font-family="Arial" font-size="16" fill="${a}">${esc(c.preproduction.reviewAnnotation)}</text>`; }).join('')}</svg>`;
const contactSvgPath = path.join(outDir, 'animatic-contact-sheet.svg');
fs.writeFileSync(contactSvgPath, contactSvg, 'utf8');
fs.writeFileSync(path.join(outDir, 'render-report.json'), JSON.stringify({ schema: 'motion-design-preproduction-render-report-v1', artifactPath: path.relative(root, artifactPath).replaceAll('\\', '/'), artifactSha256: sha(artifactPath), totalFrames, fps, targetDurationSeconds: durationSeconds, outputs: { animaticVideo: path.relative(root, finalVideo).replaceAll('\\', '/'), animaticVideoSha256: sha(finalVideo), contactSheetSha256: sha(path.join(outDir, 'animatic-contact-sheet.png')), styleframeSha256: sha(path.join(styleDir, 'cut001-styleframe.png')) }, providerCalls: false, productionRender: false, upload: false, publication: false }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ artifactPath, artifactSha256: sha(artifactPath), video: finalVideo, videoSha256: sha(finalVideo), frames: totalFrames, durationSeconds }, null, 2));
