const sha256 = /^[a-f0-9]{64}$/u;
const safePath = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && value.split('/').every((part) => part && part !== '.' && part !== '..');
const realModes = new Set(['source-video', 'source-photo']);

export function sourceFirstProgressionStatus(revisionId, phase, status) {
  if (phase !== 'source-selected-editorial-plan') return false;
  if (revisionId === 'ep001-narrative-source-first-v3') return status === 'approved-script-narrative-source-first-plan';
  if (revisionId === 'ep001-source-first-semantic-v2') return status === 'approved-script-source-first-semantic-plan';
  return false;
}

export function validateV3RealMediaProgression(cut, phase) {
  if (!realModes.has(cut.production_mode)) return [];
  const label = cut.shot_id;
  const requirements = Array.isArray(cut.requirements) ? cut.requirements : [];
  if (phase === 'candidate-plan-blocked') {
    return requirements.some((item) => item.kind === 'source-original' && item.source_id === `SOURCE-SEARCH-${label}` && item.status === 'blocked' && typeof item.blocker === 'string' && item.blocker.trim())
      ? [] : [`${label}: pending acquisition requires an explicit blocked source gap`];
  }
  if (phase !== 'source-selected-editorial-plan') return [`${label}: unknown source-first progression phase`];
  const errors = [];
  if (!requirements.length || requirements.some((item) => item.status !== 'approved')) errors.push(`${label}: source-selected real-media cut has missing or unresolved requirements`);
  const materials = requirements.filter((item) => ['source-original', 'transparent-derivative'].includes(item.kind));
  if (!materials.length) errors.push(`${label}: source-selected real-media cut needs an approved material requirement`);
  for (const item of materials) {
    const source = item.approved_source;
    if (item.status !== 'approved' || !Number.isSafeInteger(item.approved_media_asset_id) || item.approved_media_asset_id < 1
      || !safePath(item.materialization_record_path) || !safePath(item.asset_id)
      || typeof item.source_id !== 'string' || !Array.isArray(cut.source_ids) || !cut.source_ids.includes(item.source_id)
      || !source || typeof source.original_url !== 'string' || !/^https?:\/\//iu.test(source.original_url)
      || typeof source.license !== 'string' || !source.license.trim() || !sha256.test(source.sha256 ?? '')) {
      errors.push(`${label}/${item.requirement_id ?? 'unknown'}: selected material needs approved media ID, provenance and materialization ledger binding`);
    }
  }
  return errors;
}

export function validateV3FictionDeclaration(cuts, declaredIds) {
  const actual = cuts.filter((cut) => cut.production_mode === 'omni').map((cut) => cut.shot_id);
  if (!Array.isArray(declaredIds) || declaredIds.some((id) => typeof id !== 'string')
    || new Set(declaredIds).size !== declaredIds.length
    || actual.length !== declaredIds.length || actual.some((id) => !declaredIds.includes(id))) {
    return ['v3 fictional continuity IDs must exactly match Omni cuts'];
  }
  if (cuts.some((cut) => cut.production_mode !== 'omni' && cut.source_need_taxonomy === 'fictional-continuity')) {
    return ['v3 fictional continuity taxonomy requires Omni mode'];
  }
  return [];
}

export function requiresV3FictionalNotice(cuts, declaredIds) {
  return cuts.some((cut) => cut.production_mode === 'omni') || (Array.isArray(declaredIds) && declaredIds.length > 0);
}
