const MODERN_MIN_YEAR = 2020;

export const TEMPORAL_ERAS = new Set(['modern-2020s', 'legacy-pre-2020', 'unknown']);
export const TECHNOLOGY_GENERATIONS = new Set(['smartphone-era', 'modern-office', 'legacy-computing', 'none', 'unknown']);

export function temporalErrors(asset, need = {}) {
  const errors = [];
  const required = ['captureDate', 'captureYear', 'temporalEra', 'technologyGeneration', 'anachronismFlags'];
  for (const field of required) if (!(field in asset)) errors.push(`missing-${field}`);
  if (asset.captureDate !== null && asset.captureDate !== undefined && !/^\d{4}(?:-\d{2}-\d{2})?$/.test(String(asset.captureDate))) errors.push('invalid-captureDate');
  if (asset.captureYear !== null && asset.captureYear !== undefined && (!Number.isInteger(asset.captureYear) || asset.captureYear < 1900 || asset.captureYear > 2100)) errors.push('invalid-captureYear');
  if (!TEMPORAL_ERAS.has(asset.temporalEra)) errors.push('invalid-temporalEra');
  if (!TECHNOLOGY_GENERATIONS.has(asset.technologyGeneration)) errors.push('invalid-technologyGeneration');
  if (!asset.anachronismFlags || typeof asset.anachronismFlags !== 'object' || Array.isArray(asset.anachronismFlags)) errors.push('invalid-anachronismFlags');
  const unknownDate = asset.captureYear == null || asset.captureDate == null;
  if (unknownDate && asset.sourceUseStatus === 'approved') errors.push('unknown-date-cannot-be-approved');
  if (asset.captureYear != null && asset.captureYear < MODERN_MIN_YEAR && asset.coverageEligible) errors.push('pre-2020-cannot-be-coverage-eligible');
  if (asset.captureYear != null && asset.captureYear >= MODERN_MIN_YEAR && asset.temporalEra !== 'modern-2020s') errors.push('modern-year-era-mismatch');
  const flags = asset.anachronismFlags || {};
  const rule = need.temporalRule || 'modern-generic';
  if (rule === 'smartphone-era' || rule === 'modern-laptop') {
    for (const flag of ['opticalDiscDrive', 'featurePhone', 'crtDisplay']) if (flags[flag]) errors.push(`${rule}-anachronism-${flag}`);
    if (!['smartphone-era', 'modern-office'].includes(asset.technologyGeneration)) errors.push(`${rule}-technology-generation-too-old`);
  }
  return errors;
}

export function isTemporallyAdmissible(asset, need) {
  return temporalErrors(asset, need).length === 0 && asset.sourceUseStatus === 'approved' && asset.coverageEligible === false;
}

export {MODERN_MIN_YEAR};
