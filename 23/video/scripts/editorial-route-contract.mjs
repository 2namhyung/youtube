const SOURCE_MODES = new Set(['source-photo', 'source-video']);
const MODES = new Set([...SOURCE_MODES, 'remotion', 'omni']);
const PURPOSES = new Set(['real-context', 'exact-evidence', 'explanation', 'fictional-action']);
const BRIEF_ROLES = new Set(['full-frame', 'independent-layer', 'off-canvas-evidence']);
const SPECIFICITIES = new Set(['korea-institution', 'generic-object', 'exact-source']);
const SEARCH_PLACEHOLDER = /^(?:tbd|todo|n\/?a|none|검색 필요|추가 검색|미정|나중에)$/iu;

const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeSubject = (value) => value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
const cropKey = (crop) => {
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) return null;
  const sorted = Object.fromEntries(Object.entries(crop).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
};
const sourceKeyFor = (segment) => {
  if (/^[a-f0-9]{64}$/iu.test(segment?.source_sha256 ?? '')) return `sha256:${segment.source_sha256.trim().toLowerCase()}`;
  return null;
};
const isPhotoSegment = (segment) => /photo|image|still/iu.test(String(segment?.kind ?? ''));
const addError = (errors, message) => errors.push(message);

function validateBrief(brief, label, errors) {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    addError(errors, `${label}: asset search brief must be an object`);
    return;
  }
  for (const field of ['brief_id', 'subject', 'action']) {
    if (!nonblank(brief[field])) addError(errors, `${label}: ${field} must be nonblank`);
  }
  if (!BRIEF_ROLES.has(brief.role)) addError(errors, `${label}: role must be full-frame, independent-layer, or off-canvas-evidence`);
  if (!SPECIFICITIES.has(brief.specificity)) addError(errors, `${label}: specificity must be korea-institution, generic-object, or exact-source`);

  for (const field of ['queries_ko', 'queries_en']) {
    if (!Array.isArray(brief[field])) {
      addError(errors, `${label}: ${field} must be an array`);
      continue;
    }
    for (const [index, query] of brief[field].entries()) {
      if (!nonblank(query) || query.trim().length < 2 || SEARCH_PLACEHOLDER.test(query.trim())) {
        addError(errors, `${label}: ${field}[${index}] must be a useful non-placeholder query`);
      }
    }
  }
  if (![...(Array.isArray(brief.queries_ko) ? brief.queries_ko : []), ...(Array.isArray(brief.queries_en) ? brief.queries_en : [])].length) {
    addError(errors, `${label}: at least one Korean or English search query is required`);
  }

  if (!Array.isArray(brief.provider_routes) || brief.provider_routes.length === 0) {
    addError(errors, `${label}: provider_routes must contain at least one external search route`);
  } else {
    for (const [index, route] of brief.provider_routes.entries()) {
      if (!nonblank(route) || SEARCH_PLACEHOLDER.test(route.trim())) {
        addError(errors, `${label}: provider_routes[${index}] must name a usable provider route`);
      }
    }
  }

  if (!Array.isArray(brief.exclusions)) {
    addError(errors, `${label}: exclusions must be an array`);
  } else {
    for (const [index, exclusion] of brief.exclusions.entries()) {
      if (!nonblank(exclusion)) addError(errors, `${label}: exclusions[${index}] must be nonblank`);
    }
  }
}

function auditSourceUsage(cuts, routeReports, warnings) {
  const sources = new Map();
  const flattenedSegments = [];
  const photoCrops = new Map();
  const subjectCounts = new Map();
  const plannedSubjectCounts = new Map();
  const cutCount = cuts.length;

  for (const [cutIndex, cut] of cuts.entries()) {
    const shotId = nonblank(cut?.shot_id) ? cut.shot_id : `cut-${cutIndex + 1}`;
    const subject = routeReports[cutIndex]?.visible_subject;
    if (nonblank(subject)) {
      const key = normalizeSubject(subject);
      const entry = subjectCounts.get(key) ?? {visible_subject: subject.trim(), cut_ids: [], cut_count: 0};
      entry.cut_ids.push(shotId);
      entry.cut_count += 1;
      subjectCounts.set(key, entry);
    }
    const plannedSubjects = routeReports[cutIndex]?.planned_subjects ?? [];
    for (const plannedSubject of new Set(plannedSubjects.filter(nonblank).map(normalizeSubject))) {
      const entry = plannedSubjectCounts.get(plannedSubject) ?? {planned_subject: plannedSubject, cut_ids: [], cut_count: 0};
      entry.cut_ids.push(shotId);
      entry.cut_count += 1;
      plannedSubjectCounts.set(plannedSubject, entry);
    }

    const segments = Array.isArray(cut?.internal_presentation_segments) ? cut.internal_presentation_segments : [];
    if (segments.length === 0) flattenedSegments.push({source_key: null, shot_id: shotId, segment_index: null});
    for (const [segmentIndex, segment] of segments.entries()) {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
        flattenedSegments.push({source_key: null, shot_id: shotId, segment_index: segmentIndex});
        continue;
      }
      const sourceKey = sourceKeyFor(segment);
      if (!sourceKey) {
        if (nonblank(segment.source_id) || nonblank(segment.source_path)) warnings.push({code: 'unverified-original-hash', classification: 'review', message: `${shotId}: segment ${segmentIndex} has no valid original SHA-256 and cannot count toward source diversity.`, evidence: {shot_id: shotId, segment_index: segmentIndex, source_id: segment.source_id ?? null}});
        flattenedSegments.push({source_key: null, shot_id: shotId, segment_index: segmentIndex});
        continue;
      }
      const outputFrames = Number.isSafeInteger(segment.output_frames) && segment.output_frames >= 0 ? segment.output_frames : 0;
      const source = sources.get(sourceKey) ?? {
        source_key: sourceKey,
        source_sha256: nonblank(segment.source_sha256) ? segment.source_sha256.trim().toLowerCase() : null,
        source_ids: new Set(),
        cut_ids: new Set(),
        segment_count: 0,
        output_frames: 0,
      };
      if (nonblank(segment.source_id)) source.source_ids.add(segment.source_id.trim());
      source.cut_ids.add(shotId);
      source.segment_count += 1;
      source.output_frames += outputFrames;
      sources.set(sourceKey, source);

      const item = {
        source_key: sourceKey,
        shot_id: shotId,
        segment_index: Number.isSafeInteger(segment.segment_index) ? segment.segment_index : segmentIndex,
        kind: nonblank(segment.kind) ? segment.kind : null,
        output_frames: outputFrames,
        crop_normalized: segment.crop_normalized ?? null,
        reuse_reason: routeReports[cutIndex]?.reuse_reason ?? null,
      };
      flattenedSegments.push(item);

      if (isPhotoSegment(segment) && segment.crop_normalized) {
        const key = `${sourceKey}\n${cropKey(segment.crop_normalized)}`;
        const occurrences = photoCrops.get(key) ?? {
          source_key: sourceKey,
          crop_normalized: segment.crop_normalized,
          cut_ids: [],
          occurrences: [],
        };
        occurrences.cut_ids.push(shotId);
        occurrences.occurrences.push({shot_id: shotId, segment_index: item.segment_index, output_frames: outputFrames});
        photoCrops.set(key, occurrences);
      }
    }
  }

  const runs = [];
  const adjacentSameOriginal = [];
  let previousRun = null;
  for (const segment of flattenedSegments) {
    if (!segment.source_key) {
      previousRun = null;
      continue;
    }
    const previous = previousRun;
    if (previous?.source_key === segment.source_key) {
      previous.segments.push({shot_id: segment.shot_id, segment_index: segment.segment_index, kind: segment.kind});
      previous.cut_ids.add(segment.shot_id);
      previous.output_frames += segment.output_frames;
      const left = previous.last_segment;
      adjacentSameOriginal.push({
        source_key: segment.source_key,
        left: {shot_id: left.shot_id, segment_index: left.segment_index, kind: left.kind},
        right: {shot_id: segment.shot_id, segment_index: segment.segment_index, kind: segment.kind},
        classification: nonblank(segment.reuse_reason) ? 'motivated-reprise' : 'review-reuse-reason',
        reuse_reason: segment.reuse_reason,
      });
      previous.last_segment = segment;
    } else {
      runs.push({
        source_key: segment.source_key,
        start: {shot_id: segment.shot_id, segment_index: segment.segment_index},
        end: {shot_id: segment.shot_id, segment_index: segment.segment_index},
        segments: [{shot_id: segment.shot_id, segment_index: segment.segment_index, kind: segment.kind}],
        cut_ids: new Set([segment.shot_id]),
        output_frames: segment.output_frames,
        last_segment: segment,
      });
    }
    const activeRun = runs.at(-1);
    activeRun.end = {shot_id: segment.shot_id, segment_index: segment.segment_index};
    previousRun = activeRun;
  }

  for (const repeat of adjacentSameOriginal) {
    warnings.push({
      code: 'adjacent-same-original',
      classification: repeat.classification,
      message: `${repeat.left.shot_id} → ${repeat.right.shot_id} uses adjacent segments from ${repeat.source_key}; segment count does not add a new original source.`,
      evidence: repeat,
    });
  }

  const repeatedPhotoCrops = [...photoCrops.values()].filter((entry) => entry.occurrences.length > 1);
  for (const repeat of repeatedPhotoCrops) {
    repeat.occurrences = repeat.occurrences.map((occurrence, index) => {
      const reason = routeReports.find((report) => report.shot_id === occurrence.shot_id)?.reuse_reason ?? null;
      return {...occurrence, classification: index === 0 ? 'first-use' : nonblank(reason) ? 'motivated-reprise' : 'review-reuse-reason', reuse_reason: reason};
    });
    repeat.cut_ids = [...new Set(repeat.cut_ids)];
    repeat.classification = repeat.occurrences.slice(1).every((occurrence) => occurrence.classification === 'motivated-reprise') ? 'motivated-reprise' : 'review-reuse-reason';
    repeat.reuse_reason = null;
    warnings.push({
      code: 'repeated-photo-crop',
      classification: repeat.classification,
      message: `${repeat.source_key} repeats the same photo crop; review the reprise and source variety.`,
      evidence: repeat,
    });
  }

  const finalizedSources = [...sources.values()].map((source) => ({
    source_key: source.source_key,
    source_sha256: source.source_sha256,
    source_ids: [...source.source_ids].sort(),
    cut_ids: [...source.cut_ids],
    segment_count: source.segment_count,
    output_frames: source.output_frames,
  })).sort((a, b) => b.output_frames - a.output_frames || a.source_key.localeCompare(b.source_key));
  const totalSourceFrames = finalizedSources.reduce((sum, source) => sum + source.output_frames, 0);
  const sourceFrameConcentration = finalizedSources.map((source) => ({
    source_key: source.source_key,
    source_ids: source.source_ids,
    cut_ids: source.cut_ids,
    output_frames: source.output_frames,
    share: totalSourceFrames ? source.output_frames / totalSourceFrames : 0,
  }));
  if (sourceFrameConcentration[0]?.share > 0.5 && (finalizedSources[0]?.segment_count > 1 || finalizedSources[0]?.cut_ids.length > 1)) {
    warnings.push({
      code: 'source-frame-concentration',
      classification: 'review',
      message: `One original source contributes ${(sourceFrameConcentration[0].share * 100).toFixed(1)}% of sourced output frames; review whether the source range is varied enough.`,
      evidence: sourceFrameConcentration[0],
    });
  }

  const semanticSubjectConcentration = [...subjectCounts.values()].map((entry) => ({
    ...entry,
    share: cutCount ? entry.cut_count / cutCount : 0,
  })).sort((a, b) => b.cut_count - a.cut_count || a.visible_subject.localeCompare(b.visible_subject));
  if (cutCount > 1 && semanticSubjectConcentration[0]?.share > 0.5) {
    warnings.push({
      code: 'visible-subject-concentration',
      classification: 'review',
      message: `The same normalized visible subject appears in ${(semanticSubjectConcentration[0].share * 100).toFixed(1)}% of cuts; review the semantic variety independently of source count.`,
      evidence: semanticSubjectConcentration[0],
    });
  }

  const plannedAssetSubjectConcentration = [...plannedSubjectCounts.values()].map((entry) => ({
    ...entry,
    share: cutCount ? entry.cut_count / cutCount : 0,
  })).sort((a, b) => b.cut_count - a.cut_count || a.planned_subject.localeCompare(b.planned_subject));
  if (cutCount > 1 && plannedAssetSubjectConcentration[0]?.share > 0.5) {
    warnings.push({
      code: 'planned-asset-subject-concentration',
      classification: 'review',
      message: `The same exact planned asset subject appears in ${(plannedAssetSubjectConcentration[0].share * 100).toFixed(1)}% of cuts; review the planned subject variety.`,
      evidence: plannedAssetSubjectConcentration[0],
    });
  }
  const families = new Map();
  for (const cut of cuts) for (const brief of cut.production_decision?.asset_search_briefs ?? []) {
    if (brief.role === 'off-canvas-evidence' || !nonblank(brief.subject_family)) continue;
    const family = families.get(brief.subject_family) ?? {subject_family: brief.subject_family, cut_ids: new Set(), query_sets: new Set()};
    family.cut_ids.add(cut.shot_id);
    family.query_sets.add(JSON.stringify([...(brief.queries_ko ?? []), ...(brief.queries_en ?? [])].sort()));
    families.set(brief.subject_family, family);
  }
  const semanticFamilyConcentration = [...families.values()].map((family) => ({subject_family: family.subject_family, cut_ids: [...family.cut_ids], cut_count: family.cut_ids.size, distinct_query_sets: family.query_sets.size, share: cutCount ? family.cut_ids.size / cutCount : 0})).sort((a, b) => b.cut_count - a.cut_count);
  for (const family of semanticFamilyConcentration.filter((entry) => entry.cut_count >= 3)) warnings.push({code: 'recurrent-semantic-family', classification: 'review-action-view-variety', message: `${family.subject_family} occurs in ${family.cut_count} cuts with ${family.distinct_query_sets} query sets; review actual action, view and original variety. This is a review signal, not a source-count approval quota.`, evidence: family});
  if (cutCount > 0) {
    warnings.push({
      code: 'human-semantic-review-required',
      classification: 'review',
      message: 'Subject labels and original hashes cannot establish perceptual variety; a human must inspect the actual source frames and assets.',
      evidence: {planned_subject_count: plannedAssetSubjectConcentration.length, visible_subject_count: semanticSubjectConcentration.length, original_hash_count: finalizedSources.length},
    });
  }

  return {
    original_count: finalizedSources.length,
    total_sourced_output_frames: totalSourceFrames,
    sources: finalizedSources,
    contiguous_source_runs: runs.map(({last_segment, cut_ids, ...run}) => ({...run, cut_ids: [...cut_ids]})),
    adjacent_same_original: adjacentSameOriginal,
    repeated_photo_crops: repeatedPhotoCrops,
    source_frame_concentration: sourceFrameConcentration,
    actual_original_hash_exposure: sourceFrameConcentration,
    semantic_visible_subject_concentration: semanticSubjectConcentration,
    planned_asset_subject_concentration: plannedAssetSubjectConcentration,
    semantic_family_concentration: semanticFamilyConcentration,
    human_semantic_review_required: cutCount > 0,
  };
}

/**
 * Audit source-led editorial routing declarations without granting production authority.
 * The input object is read only; returned diagnostics are suitable for review or CI.
 */
export function auditEditorialRouting(spec) {
  const errors = [];
  const warnings = [];
  const cutsInput = Array.isArray(spec?.cuts) ? spec.cuts : [];
  const policy = spec?.production_routing_policy;
  const briefIds = new Set();

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    addError(errors, 'production_routing_policy must be declared');
  } else {
    if (policy.version !== 1) addError(errors, 'production_routing_policy.version must be 1');
    if (policy.missing_source_changes_mode !== false) addError(errors, 'production_routing_policy.missing_source_changes_mode must be false');
    if (policy.source_diversity_unit !== 'original-sha256-and-semantic-subject') {
      addError(errors, 'production_routing_policy.source_diversity_unit must be original-sha256-and-semantic-subject');
    }
  }

  if (!Array.isArray(spec?.cuts)) addError(errors, 'cuts must be an array');
  const cuts = cutsInput.map((cut, index) => {
    const cutId = nonblank(cut?.shot_id) ? cut.shot_id : `cut-${index + 1}`;
    const label = `${cutId}/production_decision`;
    const initialErrorCount = errors.length;
    const decision = cut?.production_decision;
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      addError(errors, `${label}: decision must be declared`);
      return {shot_id: cutId, mode: cut?.production_mode ?? null, purpose: null, visible_subject: null, reuse_reason: null, valid: false};
    }

    if (decision.version !== 1) addError(errors, `${label}: version must be 1`);
    if (!MODES.has(cut?.production_mode)) addError(errors, `${cutId}: production_mode must be source-photo, source-video, remotion, or omni`);
    if (decision.mode !== cut?.production_mode) addError(errors, `${label}: mode must match production_mode (${String(cut?.production_mode)})`);
    for (const field of ['reason', 'visible_subject', 'observable_action']) {
      if (!nonblank(decision[field])) addError(errors, `${label}: ${field} must be nonblank`);
    }
    if (!PURPOSES.has(decision.purpose)) addError(errors, `${label}: purpose is invalid`);
    if (SOURCE_MODES.has(cut?.production_mode) && !['real-context', 'exact-evidence'].includes(decision.purpose)) {
      addError(errors, `${label}: source modes require real-context or exact-evidence purpose`);
    }
    if (cut?.production_mode === 'remotion' && decision.purpose !== 'explanation') {
      addError(errors, `${label}: Remotion requires explanation purpose`);
    }
    if (cut?.production_mode === 'omni') {
      if (decision.purpose !== 'fictional-action') addError(errors, `${label}: Omni requires fictional-action purpose`);
      if (!nonblank(decision.continuity_group)) addError(errors, `${label}: Omni requires a nonblank continuity_group`);
    }

    const rejected = decision.rejected_modes;
    if (!rejected || typeof rejected !== 'object' || Array.isArray(rejected)) {
      addError(errors, `${label}: rejected_modes must be declared`);
    } else {
      for (const field of ['live_action', 'motion_graphics', 'omni']) {
        if (!nonblank(rejected[field])) addError(errors, `${label}: rejected_modes.${field} must be nonblank`);
      }
    }

    const briefs = decision.asset_search_briefs;
    if (!Array.isArray(briefs)) {
      addError(errors, `${label}: asset_search_briefs must be an array`);
    } else {
      if ((SOURCE_MODES.has(cut?.production_mode) || cut?.production_mode === 'remotion') && briefs.length === 0) {
        addError(errors, `${label}: source and Remotion routes require at least one asset search brief`);
      }
      for (const [briefIndex, brief] of briefs.entries()) {
        validateBrief(brief, `${cutId}/asset_search_briefs[${briefIndex}]`, errors);
        if (nonblank(brief?.brief_id)) {
          if (briefIds.has(brief.brief_id.trim())) addError(errors, `${label}: asset search brief IDs must be globally unique across the episode`);
          briefIds.add(brief.brief_id.trim());
        }
      }
    }

    const valid = errors.length === initialErrorCount;
    return {
      shot_id: cutId,
      mode: cut?.production_mode ?? null,
      purpose: decision.purpose ?? null,
      reason: decision.reason ?? null,
      visible_subject: decision.visible_subject ?? null,
      observable_action: decision.observable_action ?? null,
      continuity_group: decision.continuity_group ?? null,
      asset_search_brief_count: Array.isArray(briefs) ? briefs.length : 0,
      reuse_reason: decision.reuse_reason ?? null,
      planned_subjects: Array.isArray(briefs)
        ? briefs.filter((brief) => brief?.role !== 'off-canvas-evidence').map((brief) => brief?.subject).filter(nonblank)
        : [],
      valid,
    };
  });

  const sourceUsage = auditSourceUsage(cutsInput, cuts, warnings);
  const routeCounts = Object.fromEntries([...MODES].map((mode) => [mode, cuts.filter((cut) => cut.mode === mode).length]));
  return {
    errors,
    warnings,
    summary: {
      cut_count: cutsInput.length,
      route_counts: routeCounts,
      valid_cut_count: cuts.filter((cut) => cut.valid).length,
      error_count: errors.length,
      warning_count: warnings.length,
      source_original_count: sourceUsage.original_count,
      production_approved: false,
      quality_approved: false,
      authority: 'integrity-only',
    },
    cuts,
    source_usage: sourceUsage,
  };
}

/**
 * Validate a beat whose playable action is intentionally deferred until its source is selected.
 * The explicit blocked state is required; this function never treats the deferral as a quality pass.
 */
export function validateDeferredBeatIntent(cut, beat) {
  const errors = [];
  const cutId = nonblank(cut?.shot_id) ? cut.shot_id : 'cut';
  const beatId = nonblank(beat?.beat_id) ? beat.beat_id : 'beat';
  const label = `${cutId}/${beatId}`;
  const expectedKindByMode = {
    'source-photo': 'source-selection',
    'source-video': 'source-selection',
    remotion: 'source-derived-motion',
    omni: 'keyframe-state',
  };

  if (!expectedKindByMode[cut?.production_mode]) errors.push(`${label}: deferred intent requires a recognized production_mode`);
  if (beat?.planned_operator !== null) errors.push(`${label}: planned_operator must be null while the action is deferred`);
  if (cut?.production_decision?.human_review_status !== 'pending') errors.push(`${label}: human_review_status must remain pending while deferred`);
  if (cut?.production_authority !== false) errors.push(`${label}: production_authority must remain false while deferred`);
  if (beat?.preview_status !== 'blocked-assets-pending') errors.push(`${label}: preview_status must remain blocked-assets-pending while deferred`);

  const intent = beat?.action_intent;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    errors.push(`${label}: action_intent must declare the deferred action`);
  } else {
    const expectedKind = expectedKindByMode[cut?.production_mode];
    if (expectedKind && intent.kind !== expectedKind) errors.push(`${label}: action_intent.kind must be ${expectedKind} for ${cut.production_mode}`);
    if (intent.status !== 'deferred-until-source-selection') errors.push(`${label}: action_intent.status must be deferred-until-source-selection`);
    if (!nonblank(intent.observable_action)) errors.push(`${label}: action_intent.observable_action must be nonblank`);
  }

  return errors;
}
