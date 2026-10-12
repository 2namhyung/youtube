import fs from 'node:fs/promises';

const reviewPath = 'video/qa/source-review/episode-001-source-selection-v02/manifest.json';
const specPath = 'video/episodes/episode-001/episode-spec.json';
const liveAssignmentPath = 'video/source-intake/episode-001/source-selection-v02/editorial-single-source-assignments.json';
const institutionPath = 'video/source-intake/episode-001/source-selection-v02/remotion-institution-assets-v01/candidates.json';
const lawBookPath = 'video/source-intake/episode-001/source-selection-v02/remotion-law-book-assets-v01/candidates.json';
const outputPath = 'video/source-intake/episode-001/source-selection-v02/editorial-remotion-asset-assignments.json';

const [review, spec, live, institutions, lawBooks] = await Promise.all([reviewPath, specPath, liveAssignmentPath, institutionPath, lawBookPath].map(async (p) => JSON.parse(await fs.readFile(p, 'utf8'))));
const candidates = new Map([...review.candidates, ...institutions.candidates, ...lawBooks.candidates].map((candidate) => [candidate.candidate_id, candidate]));
const cuts = new Map(review.cuts.map((cut) => [cut.shot_id, cut]));
const liveIds = new Set(live.assignments.map((assignment) => assignment.candidate_id));
const usedSha = new Map();
const rejected = new Set([
  '0c23dc1e3ff968fdde0126be', // vinyl record, not an analysis report
  'aae2f7a1138ab285a926601e', 'ea2b24935507c3d115659b24', '176747deb1e7cc4210c5bd9c',
  '1cfeabe9c2c64d955e534c60', '3c325d8ee21a0ddcb5bff23d', // cross-mapped finance/CCTV false positives
]);
const fallbacks = new Map([
  ['SH035-case-record', '0ebaccaa4e4551c416b59da9'],
  ['SH038-prosecution', 'KOR-WM-SEOUL-PROSECUTION-OFFICE-001'],
]);

const assignments = [];
const gaps = [];
for (const cut of spec.cuts.filter((item) => item.production_decision.mode === 'remotion')) {
  for (const brief of cuts.get(cut.shot_id)?.briefs ?? []) {
    if (brief.role === 'off-canvas-evidence' || brief.brief_id.endsWith('-legal-evidence')) continue;
    const institutionIds = brief.brief_id.endsWith('-prosecution') ? institutions.candidates.filter((item) => item.subject_family.includes('prosecution')).map((item) => item.candidate_id) : [];
    const lawBookIds = brief.brief_id.endsWith('-law-book') ? lawBooks.candidates.map((item) => item.candidate_id) : [];
    const ids = [...brief.candidates.map((item) => item.candidate_id), ...institutionIds, ...lawBookIds, ...(fallbacks.has(brief.brief_id) ? [fallbacks.get(brief.brief_id)] : [])]
      .filter((id, index, all) => id && all.indexOf(id) === index && candidates.has(id) && !rejected.has(id));
    const ranked = ids.map((id) => candidates.get(id)).sort((a, b) => {
      const aUsed = usedSha.has(a.sha256) ? 1 : 0;
      const bUsed = usedSha.has(b.sha256) ? 1 : 0;
      const aLive = liveIds.has(a.candidate_id) ? 1 : 0;
      const bLive = liveIds.has(b.candidate_id) ? 1 : 0;
      const aReview = a.disposition === 'unreviewed-photo' ? 1 : 0;
      const bReview = b.disposition === 'unreviewed-photo' ? 1 : 0;
      return aUsed - bUsed || aLive - bLive || aReview - bReview || a.candidate_id.localeCompare(b.candidate_id);
    });
    const selected = ranked[0];
    if (!selected) {
      gaps.push({ shot_id: cut.shot_id, brief_id: brief.brief_id, subject: brief.subject, required_view: brief.required_view, status: 'new-original-required' });
      continue;
    }
    const prior = usedSha.get(selected.sha256) ?? [];
    assignments.push({
      shot_id: cut.shot_id,
      brief_id: brief.brief_id,
      independent_asset_id: `${cut.shot_id.toLowerCase()}-${brief.brief_id.split('-').slice(1).join('-')}-real-01`,
      candidate_id: selected.candidate_id,
      media_type: selected.media_type,
      original_path: selected.original_path,
      sha256: selected.sha256,
      asset_role: brief.subject,
      source_observation: selected.visual_observation,
      source_limitations: selected.limitations ?? null,
      editorial_use: `실사 원본을 ${brief.subject} 레이어로 분리해 Remotion의 관계·경로·강조 설명에 사용한다.`,
      reuse_reason: prior.length ? `대본에서 같은 실제 기관/사물을 다시 가리키는 경우에 한해 회수한다. 이전 배정: ${prior.join(', ')}` : null,
      status: 'editorial-selected-pending-human-source-review',
      production_authority: false,
    });
    usedSha.set(selected.sha256, [...prior, `${cut.shot_id}/${brief.brief_id}`]);
  }
}

const repeated = [...usedSha.entries()].filter(([, refs]) => refs.length > 1).map(([sha256, refs]) => ({ sha256, refs }));
const output = {
  schema_version: 1,
  artifact_kind: 'provisional-remotion-independent-live-asset-selection',
  rule: '모션그래픽 컷은 관계·경로·텍스트만 결정론적으로 만들고, 실제 사물·기관·기록은 외부에서 확보한 독립 실사 원본으로 구성한다.',
  totals: { remotion_cuts: 25, assigned_layers: assignments.length, unique_original_sha256: usedSha.size, repeated_sha256: repeated.length, unresolved_layers: gaps.length },
  assignments,
  unresolved_layers: gaps,
  motivated_reuse: repeated,
  rejected_candidate_ids: [...rejected],
  source_approval: false,
  user_approval: false,
  production_authority: false,
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, ...output.totals }, null, 2));
