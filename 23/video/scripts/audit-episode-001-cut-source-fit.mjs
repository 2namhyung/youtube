import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const boardPath = 'video/qa/source-review/episode-001-source-selection-v02/all-cuts-manifest.json';
const outputPath = 'video/qa/source-review/episode-001-source-selection-v02/source-fit-audit.json';
const reviewPath = 'video/qa/source-review/episode-001-source-selection-v02/source-fit-audit.html';
const bytes = await fs.readFile(boardPath);
const board = JSON.parse(bytes);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const originalUses = new Map();
for (const cut of board.cuts) {
  const inputs = cut.assignment ? [{kind:'single-source', brief_id:null, candidate:cut.selected_candidate}] :
    cut.remotion_assets.map(asset => ({kind:'remotion-layer', brief_id:asset.brief_id, candidate:asset.candidate}));
  for (const input of inputs) {
    const hash = input.candidate?.sha256;
    if (hash) originalUses.set(hash, [...(originalUses.get(hash) ?? []), {shot_id:cut.shot_id, kind:input.kind, brief_id:input.brief_id}]);
  }
}
const cuts = board.cuts.map(cut => {
  const issues = [];
  const selected = cut.selected_candidate;
  const selectedBriefs = cut.briefs.flatMap(brief => brief.candidates.map(option => ({brief_id:brief.brief_id, ...option})))
    .filter(option => option.candidate_id === cut.assignment?.candidate_id);
  if (cut.assignment) {
    if (!selected?.original_path || !selected?.sha256) issues.push('selected-original-not-byte-bound');
    if (cut.mode === 'source-video' && selected?.media_type !== 'video') issues.push('photo-assigned-to-video-cut');
    if (cut.mode === 'source-photo' && selected?.media_type !== 'photo') issues.push('video-assigned-to-photo-cut');
    if (cut.mode === 'source-video' && !cut.assignment.use_window_seconds) issues.push('video-window-missing');
    if (!selectedBriefs.length) issues.push('selected-original-not-bound-to-cut-brief');
    if (!selectedBriefs.some(option => option.exact_fit && option.evidence_complete)) issues.push('selected-original-not-exact-brief-fit');
    const uses = originalUses.get(selected?.sha256) ?? [];
    if (uses.length > 1 && !cut.assignment.reuse_reason) issues.push('reused-original-without-cut-reason');
  }
  for (const asset of cut.remotion_assets) {
    if (!asset.original_path || !asset.sha256) issues.push(`remotion-layer-not-byte-bound:${asset.brief_id}`);
    if (!asset.source_observation?.trim()) issues.push(`remotion-layer-unobserved:${asset.brief_id}`);
    if (!(cut.briefs.find(b => b.brief_id === asset.brief_id)?.candidates.some(o => o.candidate_id === asset.candidate_id && o.exact_fit && o.evidence_complete)))
      issues.push(`remotion-layer-not-exact-brief-fit:${asset.brief_id}`);
  }
  const kind = cut.mode === 'omni' ? 'continuity-keyframes-and-cut-review-pending' :
    cut.mode === 'remotion' ? 'external-originals-selected-but-layer-fit-and-materialization-pending' :
    issues.includes('photo-assigned-to-video-cut') ? 'replace-with-action-video' :
    'verify-exact-brief-and-source-rights';
  return {shot_id:cut.shot_id, mode:cut.mode, narration:cut.narration, selected_candidate_id:cut.assignment?.candidate_id ?? null,
    selected_original_sha256:selected?.sha256 ?? null, selected_media_type:selected?.media_type ?? null,
    selected_brief_ids:selectedBriefs.map(o => o.brief_id), remotion_layer_count:cut.remotion_assets.length,
    issues:[...new Set(issues)], next_action:kind, source_ready:false, user_approved:false};
});
const totals = {
  cuts:cuts.length,
  single_source_assignments:cuts.filter(c => c.selected_candidate_id).length,
  remotion_layers:cuts.reduce((n,c) => n+c.remotion_layer_count,0),
  photo_on_video_cuts:cuts.filter(c => c.issues.includes('photo-assigned-to-video-cut')).map(c => c.shot_id),
  single_source_without_exact_fit:cuts.filter(c => c.selected_candidate_id && c.issues.includes('selected-original-not-exact-brief-fit')).length,
  reused_original_sha256:[...originalUses].filter(([,uses]) => uses.length > 1).length,
  source_ready_cuts:0
};
const audit = {schema_version:1, artifact_kind:'episode-001-provisional-source-fit-audit', board:{path:boardPath,sha256:sha(bytes)},
  decision_rule:'Assignment and file presence do not prove narration-specific subject, action, place, viewpoint, exact window or production rights.',
  totals, cuts, production_authority:false};
await fs.writeFile(outputPath, JSON.stringify(audit,null,2)+'\n');
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const issueLabel = {
  'photo-assigned-to-video-cut':'영상 컷에 사진 배정',
  'selected-original-not-bound-to-cut-brief':'컷 검색 명세와 선택 원본 연결 없음',
  'selected-original-not-exact-brief-fit':'대본 대상·행동·장소·구간의 정확 일치 미확인',
  'reused-original-without-cut-reason':'원본 반복 이유 미기록'
};
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EP001 컷별 실사 적합성 감사</title><style>body{margin:0;background:#eae7e1;color:#152a30;font:15px/1.55 system-ui,'Malgun Gothic',sans-serif}main{max-width:1280px;margin:auto;padding:25px}header,article{background:white;border-radius:10px;padding:20px;margin:14px 0}header{background:#193d47;color:white}h1{margin:0}a{color:#166477}article{border-left:5px solid #af7546}article.video-mismatch{border-color:#b43131}small{color:#58666b}ul{margin:8px 0}li{margin:3px 0}.count{font-weight:bold;color:#802f26}</style><main><header><h1>EP001 컷별 실사 적합성 감사</h1><p>배정은 화면 적합성이나 사용 승인이 아닙니다. 대본과 실제 원본 구간을 확인하기 전 production 사용을 차단합니다.</p></header>
<p><a href="all-cuts.html#cuts">전체 후보 보드</a> · <a href="source-fit-audit.json">감사 원장 JSON</a></p>
<p class="count">64컷 · 실사 단일 배정 23 · MG 실사 레이어 51 · 영상 컷에 사진 배정 ${totals.photo_on_video_cuts.length} · 정확 일치 검증 없는 단일 실사 ${totals.single_source_without_exact_fit}</p>
${cuts.map(c => `<article id="${escape(c.shot_id)}" class="${c.issues.includes('photo-assigned-to-video-cut')?'video-mismatch':''}"><h2>${escape(c.shot_id)} · ${escape(c.mode)}</h2><p>${escape(c.narration)}</p><small>선택 원본: ${escape(c.selected_candidate_id ?? '해당 없음')} · ${escape(c.selected_media_type ?? '')} · MG 독립 레이어 ${c.remotion_layer_count}개</small><ul>${c.issues.map(i => `<li>${escape(issueLabel[i] ?? i)}</li>`).join('')}</ul><strong>다음 작업: ${escape(c.next_action)}</strong> · <a href="all-cuts.html#${escape(c.shot_id)}">후보 비교</a></article>`).join('')}</main></html>`;
await fs.writeFile(reviewPath, html);
console.log(JSON.stringify({output:outputPath,review:reviewPath,totals}));
