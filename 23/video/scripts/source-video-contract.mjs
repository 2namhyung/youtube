const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u;

function seconds(value) {
  const match = TIMECODE.exec(value ?? '');
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function validateSourceVideoContract(manifest) {
  const failures = [];
  const assets = manifest.assets ?? [];
  for (const asset of assets.filter((item) => item?.media_type?.startsWith?.('video/'))) {
    const label = `asset ${asset.asset_id ?? '(missing-id)'}`;
    const item = asset.source_timecode;
    if (!item) { failures.push(`${label}: source video requires exact source_timecode metadata`); continue; }
    const start = seconds(item.start);
    const end = seconds(item.end);
    if (start === null || end === null || Math.abs(start - item.start_seconds) > 0.0005 || Math.abs(end - item.end_seconds) > 0.0005) failures.push(`${label}: source_timecode string/seconds mismatch`);
    if (!(item.start_seconds >= 0) || !(item.end_seconds > item.start_seconds)) failures.push(`${label}: source_timecode range is invalid`);
    if (!(asset.source_duration_seconds > 0)) failures.push(`${label}: source_duration_seconds must be positive`);
    else if (item.end_seconds > asset.source_duration_seconds + 0.001) failures.push(`${label}: source_timecode exceeds source_duration_seconds`);
    for (const key of ['speaker', 'context', 'locator', 'locator_basis']) if (typeof item[key] !== 'string' || !item[key].trim()) failures.push(`${label}: source_timecode.${key} is required`);
  }
  return failures;
}
