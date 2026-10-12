const safeNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isSha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
const allowedLicense = /^(?:CC0|CC BY(?:-SA)? \d(?:\.\d)?|Public domain)$/iu;

export function validateSourceFirstWindowContracts(spec, matrix) {
  const failures = [];
  const green = new Map((matrix?.green_inventory ?? []).map((item)=>[item.id,item]));
  const amberGlobal = new Map((matrix?.amber_locators ?? []).map((item)=>[`${item.url}|${item.timecode?.start}|${item.timecode?.end}`,item]));
  const seenVideoRanges = new Map();
  const amberUseCount = new Map();
  for (const cut of spec?.cuts ?? []) {
    if (!['source-video','source-photo'].includes(cut.production_mode)) continue;
    const label = cut.shot_id;
    const segments = cut.internal_presentation_segments ?? [];
    const hasGap = (cut.requirements ?? []).some((item)=>item.source_id===`SOURCE-SEARCH-${label}`);
    if (!segments.length && !hasGap) failures.push(`${label}: source cut needs exact presentation segments`);
    if (segments.length && segments.reduce((sum,item)=>sum+(item.end_frame_exclusive-item.start_frame),0) !== cut.timing?.provisional_duration_frames) failures.push(`${label}: source segment coverage differs from cut duration`);
    let cursor = 0;
    for (const segment of segments) {
      const sl = `${label}/segment-${segment.segment_index}`;
      if (segment.start_frame !== cursor || segment.end_frame_exclusive <= segment.start_frame) failures.push(`${sl}: output timeline must be contiguous and positive`);
      cursor = segment.end_frame_exclusive;
      if (segment.output_frames !== segment.end_frame_exclusive-segment.start_frame) failures.push(`${sl}: output_frames mismatch`);
      if (!Number.isInteger(segment.output_frames) || segment.output_frames <= 0) failures.push(`${sl}: presentation duration must be a positive integer; pacing follows the semantic beat and reviewed source window`);
      if (segment.kind === 'video-window') {
        const source = green.get(segment.source_id);
        if (!source || source.media_type !== 'video') { failures.push(`${sl}: video source missing from exact Green inventory`); continue; }
        if (!allowedLicense.test(source.license ?? '') || source.commercial_use_allowed !== true || source.derivative_use_allowed !== true) failures.push(`${sl}: Green video license is outside the commercial-derivative allowlist`);
        if (!isSha(segment.source_sha256) || segment.source_sha256 !== source.sha256 || segment.source_path !== source.path
          || segment.original_duration_seconds !== source.duration_seconds || segment.original_width !== source.width || segment.original_height !== source.height
          || segment.source_fps !== source.fps) failures.push(`${sl}: video does not exactly match Green inventory bytes/metadata`);
        if (!(safeNumber(segment.source_start_seconds) && safeNumber(segment.source_end_seconds) && segment.source_end_seconds > segment.source_start_seconds
          && Number.isInteger(segment.source_start_frame) && Number.isInteger(segment.source_end_frame_exclusive) && segment.source_end_frame_exclusive > segment.source_start_frame
          && segment.source_start_seconds >= 0 && segment.source_end_seconds <= segment.original_duration_seconds + 0.05)) failures.push(`${sl}: invalid or out-of-range exact source window`);
        if (!segment.verified_edl_binding?.path || !safeNumber(segment.verified_edl_binding.start_seconds) || !safeNumber(segment.verified_edl_binding.end_seconds)) failures.push(`${sl}: reviewed EDL binding missing`);
        const ranges = seenVideoRanges.get(segment.source_id) ?? [];
        if (ranges.some((range)=>segment.source_start_frame < range.end && segment.source_end_frame_exclusive > range.start)) failures.push(`${sl}: source window overlaps or repeats ${rangeLabel(ranges,segment)}`);
        ranges.push({start:segment.source_start_frame,end:segment.source_end_frame_exclusive,label:sl});
        seenVideoRanges.set(segment.source_id,ranges);
      } else if (segment.kind === 'photo-hold') {
        const source = green.get(segment.source_id);
        const crop = segment.crop_normalized;
        if (!source || source.media_type !== 'photo' || !allowedLicense.test(source.license ?? '') || source.commercial_use_allowed !== true || source.derivative_use_allowed !== true) failures.push(`${sl}: photo source missing from allowed Green inventory`);
        if (!isSha(segment.source_sha256) || segment.source_sha256 !== source?.sha256 || segment.source_path !== source?.path
          || segment.source_width !== source?.width || segment.source_height !== source?.height) failures.push(`${sl}: photo does not exactly match Green inventory bytes/dimensions`);
        if (segment.hold_frames !== segment.output_frames || segment.hold_seconds !== segment.output_frames/30 || !segment.treatment?.trim()
          || ![crop?.x,crop?.y,crop?.width,crop?.height].every(safeNumber) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x+crop.width>1 || crop.y+crop.height>1) failures.push(`${sl}: photo needs exact hold, crop and treatment`);
      } else if (segment.kind === 'amber-video-locator') {
        const requirement = (cut.requirements ?? []).find((item)=>item.source_id===segment.source_id);
        const locatorKey = `${requirement?.item_url}|${formatTime(segment.source_start_seconds)}|${formatTime(segment.source_end_seconds)}`;
        const global = amberGlobal.get(locatorKey);
        if (!global || requirement?.rights_lane !== 'amber-direct-quotation-locator-only' || segment.local_acquisition_authorization !== false || segment.local_video_file !== null
          || requirement.local_acquisition_authorization !== false || requirement.production_use !== 'direct quotation candidate only; no local clip acquired') failures.push(`${sl}: Amber use must match the exact locator and remain non-local`);
        if (segment.output_frames > Math.ceil((segment.source_end_seconds-segment.source_start_seconds)*30)+1) failures.push(`${sl}: Amber output exceeds the necessary quoted amount`);
        amberUseCount.set(segment.source_id,(amberUseCount.get(segment.source_id)??0)+1);
      } else failures.push(`${sl}: unsupported source segment kind`);
    }
  }
  for (const [sourceId,count] of amberUseCount) if (count !== 1) failures.push(`${sourceId}: Amber locator must be used exactly once`);
  return failures;
}

function formatTime(seconds) {
  const hours = Math.floor(seconds/3600); const minutes=Math.floor((seconds%3600)/60); const secs=(seconds%60).toFixed(3).padStart(6,'0');
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${secs}`;
}

function rangeLabel(ranges,segment) {
  return ranges.find((range)=>segment.source_start_frame < range.end && segment.source_end_frame_exclusive > range.start)?.label ?? 'prior segment';
}
