import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const EVIDENCE_BUNDLE_SCHEMA = 'editorial-evidence-bundle-v1';
const SHA256 = /^[a-f0-9]{64}$/u;
const HTTP_URL = /^https?:\/\//iu;
const DECISIONS = new Set(['allow', 'conditional']);
const DENIED_DECISIONS = new Set(['block', 'blocked', 'deny', 'denied', 'prohibited']);
const EVIDENCE_CLASSES = new Set(['direct', 'reported', 'inference', 'contextual']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const hashText = (value) => sha256(Buffer.from(String(value ?? ''), 'utf8'));
export const hashFile = (file) => sha256(fs.readFileSync(path.resolve(file)));

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function bundleHash(bundle) {
  if (!isObject(bundle)) return hashText(stableStringify(bundle));
  const { bundleSha256: _omitted, ...payload } = bundle;
  return hashText(stableStringify(payload));
}

function assertExactKeys(value, required, optional, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) throw new Error(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not allowed`);
}

function parseJsonBytes(bytes, label) {
  const raw = bytes.toString('utf8').replace(/^\uFEFF/u, '');
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function readArtifact(input, label) {
  const declared = isObject(input) && text(input.path) ? input.sha256 : null;
  const file = typeof input === 'string' ? input : (isObject(input) ? input.path : null);
  if (!text(file)) throw new Error(`${label} must be a file-backed artifact`);
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label} is missing: ${resolved}`);
  const bytes = fs.readFileSync(resolved);
  const digest = sha256(bytes);
  if (declared && declared !== digest) throw new Error(`${label} hash does not match declared sha256`);
  const value = parseJsonBytes(bytes, label);
  if (!isObject(value)) throw new Error(`${label} top level must be an object`);
  return { value, path: resolved, sha256: digest };
}

export function resolveContainedPath(rootDir, reference, label = 'path') {
  const root = path.resolve(rootDir);
  const raw = text(reference);
  if (!raw || raw.includes('\0')) throw new Error(`${label} must be a non-empty relative path`);
  const normalizedSeparators = raw.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalizedSeparators) || path.win32.isAbsolute(raw)) throw new Error(`${label} must be relative`);
  const resolved = path.resolve(root, ...normalizedSeparators.split('/'));
  const relative = path.relative(root, resolved);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error(`${label} must resolve inside its root`);
  return { root, resolved, relative: relative.split(path.sep).join('/') };
}

function relativeRef(file, rootDir, kind, digest) {
  const root = path.resolve(rootDir);
  const relative = path.relative(root, file);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error(`${kind} must be inside bundle root`);
  const normalized = relative.split(path.sep).join('/');
  resolveContainedPath(root, normalized, `${kind}.path`);
  return { kind, path: normalized, sha256: digest };
}

function uniqueStrings(values) {
  const map = new Map();
  for (const value of values.flat(Infinity)) {
    const item = text(value);
    if (item) map.set(normalizeNeedle(item), item);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

const normalizeNeedle = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();

function safeSource(source) {
  if (!isObject(source)) return null;
  const url = text(source.url);
  if (!url || !HTTP_URL.test(url)) return null;
  const status = text(source.status)?.toLocaleLowerCase();
  const acceptedStatuses = ['verified', 'authoritative', 'authoritative-reference', 'confirmed'];
  if (source.verified === false) throw new Error(`Source ${text(source.id || source.sourceId) || url} is explicitly unverified`);
  if (source.verified === true && status && !acceptedStatuses.includes(status)) throw new Error(`Source ${text(source.id || source.sourceId) || url} has contradictory verification metadata`);
  const verified = source.verified === true || acceptedStatuses.includes(status);
  if (!verified) return null;
  const id = text(source.id || source.sourceId) || `source-${hashText(url).slice(0, 12)}`;
  return {
    id,
    url,
    ...(text(source.title) ? { title: text(source.title) } : {}),
    ...(text(source.publisher || source.source) ? { publisher: text(source.publisher || source.source) } : {}),
    ...(text(source.date || source.publishedAt) ? { date: text(source.date || source.publishedAt) } : {}),
    status: 'verified',
    verified: true,
  };
}

function collectSourceIndex(research, dossier, legal) {
  const rows = [];
  for (const owner of [research, dossier, legal]) {
    for (const source of [...(owner?.sources || []), ...(owner?.sourceIndex || []), ...(owner?.legalSources || [])]) {
      const row = safeSource(source);
      if (row) rows.push(row);
    }
  }
  const byId = new Map();
  for (const row of rows) {
    const prior = byId.get(row.id);
    if (prior && prior.url !== row.url) throw new Error(`Source ${row.id} resolves to conflicting URLs`);
    byId.set(row.id, { ...row, ...prior, ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collectClaims(legal, dossier) {
  const rows = [
    ...(legal?.confirmedFacts || []), ...(legal?.reportedFacts || []),
    ...(dossier?.claims || []), ...(dossier?.facts || []), ...(dossier?.confirmedFacts || []), ...(dossier?.reportedFacts || []),
  ];
  const byId = new Map();
  for (const row of rows) {
    if (!isObject(row)) continue;
    const claimId = text(row.claimId || row.id);
    if (!claimId) continue;
    const candidate = {
      claimId,
      summary: text(row.summary || row.statement || row.value) || claimId,
      ...(text(row.field) ? { field: text(row.field) } : {}),
      perspective: text(row.perspective) || 'reported',
      status: text(row.status) || 'reported',
      confidence: text(row.confidence) || 'unknown',
      sourceIds: uniqueStrings(Array.isArray(row.sourceIds) ? row.sourceIds : []),
    };
    const prior = byId.get(claimId);
    if (!prior) byId.set(claimId, candidate);
    else byId.set(claimId, { ...candidate, ...prior, sourceIds: uniqueStrings([...prior.sourceIds, ...candidate.sourceIds]) });
  }
  return [...byId.values()].sort((a, b) => a.claimId.localeCompare(b.claimId));
}

function policySources(legal, dossier) {
  return [dossier, dossier?.scriptPolicy, dossier?.legalPolicy, legal, legal?.scriptPolicy, legal?.legalPolicy].filter(isObject);
}

function arrayUnion(owners, key) {
  return owners.flatMap((owner) => Array.isArray(owner[key]) ? owner[key] : (owner[key] === undefined || owner[key] === null ? [] : [owner[key]]));
}

function normalizeLegalString(item) {
  if (typeof item === 'string') return text(item);
  if (!isObject(item)) return null;
  return text(item.claimId || item.id || item.statement || item.phrase || item.summary || item.text);
}

function normalizeScoped(item, prefix, index, { stringIsId = false } = {}) {
  if (typeof item === 'string') {
    const value = text(item);
    if (!value) return null;
    return { id: stringIsId ? value : `${prefix}-${hashText(normalizeNeedle(value)).slice(0, 12)}`, text: value, claimIds: [], triggers: [], global: true };
  }
  if (!isObject(item)) return null;
  const body = text(item.qualifier || item.text || item.statement || item.phrase || item.label || item.restriction);
  if (!body) return null;
  const claimIds = uniqueStrings([...(item.claimIds || []), ...(item.appliesToClaimIds || [])]);
  const triggers = uniqueStrings([...(item.semanticTriggers || []), ...(item.triggers || []), item.semanticTrigger]);
  const id = text(item.id || item.qualificationId || item.constraintId) || `${prefix}-${index + 1}-${hashText(normalizeNeedle(body)).slice(0, 8)}`;
  return { id, text: body, claimIds, triggers, global: item.global === true || (claimIds.length === 0 && triggers.length === 0) };
}

function normalizeScopedList(items, prefix, options) {
  const byId = new Map();
  items.forEach((item, index) => {
    const normalized = normalizeScoped(item, prefix, index, options);
    if (!normalized) return;
    const prior = byId.get(normalized.id);
    if (prior && stableStringify(prior) !== stableStringify(normalized)) throw new Error(`Conflicting ${prefix} id ${normalized.id}`);
    byId.set(normalized.id, normalized);
  });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeProhibitedClaim(item, knownClaimIds) {
  if (typeof item === 'string') return text(item);
  if (!isObject(item)) return null;
  const candidateId = text(item.claimId || item.id);
  if (candidateId && knownClaimIds.has(candidateId)) return candidateId;
  return text(item.statement || item.phrase || item.summary || item.text) || candidateId;
}

function normalizeLegal(legal = {}, dossier = {}, claims = []) {
  const owners = policySources(legal, dossier);
  const knownClaimIds = new Set(claims.map((claim) => claim.claimId));
  const decisionValues = [
    legal.videoDecision,
    legal.report?.videoDecision,
    legal.legalReport?.videoDecision,
    legal.scriptPolicy?.videoDecision,
    legal.legalPolicy?.videoDecision,
    dossier.videoDecision,
    dossier.report?.videoDecision,
    dossier.scriptPolicy?.videoDecision,
    dossier.legalPolicy?.videoDecision,
  ].filter((item) => item !== undefined && item !== null);
  const decisions = decisionValues.map((item) => (isObject(item) ? text(item.decision || item.status) : text(item))?.toLocaleLowerCase()).filter(Boolean);
  if (decisions.some((decision) => DENIED_DECISIONS.has(decision))) throw new Error('Legal videoDecision blocks evidence bundle admission');
  if (decisions.some((decision) => !DECISIONS.has(decision))) throw new Error(`Unknown legal videoDecision: ${decisions.find((decision) => !DECISIONS.has(decision))}`);
  if (new Set(decisions).size > 1) throw new Error(`Conflicting legal videoDecision values: ${uniqueStrings(decisions).join(', ')}`);
  const decision = decisions[0] || '';
  const reasons = uniqueStrings(decisionValues.flatMap((item) => isObject(item) && Array.isArray(item.reasons) ? item.reasons : []));
  // Workflow-level requiredConditions often contain editorial controls whose
  // `label` is not text that must be spoken. Admit only explicit qualification
  // text here; label-only controls remain in the legal authority, not spans.
  const qualificationConditions = arrayUnion(owners, 'requiredConditions').filter((item) => typeof item === 'string' || (isObject(item) && ['qualifier', 'text', 'statement', 'phrase'].some((key) => text(item[key]))));
  return {
    videoDecision: { decision: decision?.toLocaleLowerCase() || '', reasons },
    allowedClaims: uniqueStrings(arrayUnion(owners, 'allowedClaims').map(normalizeLegalString)),
    prohibitedClaims: uniqueStrings(arrayUnion(owners, 'prohibitedClaims').map((item) => normalizeProhibitedClaim(item, knownClaimIds))),
    prohibitedPhrases: uniqueStrings(arrayUnion(owners, 'prohibitedPhrases').map(normalizeLegalString)),
    requiredQualifications: normalizeScopedList(arrayUnion(owners, 'requiredQualifications').concat(qualificationConditions), 'qualification', { stringIsId: true }),
    identityRestrictions: normalizeScopedList(arrayUnion(owners, 'identityRestrictions'), 'identity'),
    footageRestrictions: normalizeScopedList(arrayUnion(owners, 'footageRestrictions').concat(arrayUnion(owners, 'restrictedMaterials')), 'footage'),
    safePhrasing: uniqueStrings(arrayUnion(owners, 'safePhrasing').map(normalizeLegalString)),
  };
}

// Exposes the exact normalized inputs used by the creator so callers can build
// conservative mappings without reimplementing legal/claim normalization.
export function deriveEvidenceContext({ legalReport = {}, eventDossier = {} } = {}) {
  const claims = collectClaims(legalReport, eventDossier);
  return { claims, legal: normalizeLegal(legalReport, eventDossier, claims) };
}

function normalizeConflict(item, index) {
  if (typeof item === 'string') {
    const statement = text(item);
    return statement ? { id: `conflict-${hashText(normalizeNeedle(statement)).slice(0, 12)}`, statement } : null;
  }
  if (!isObject(item)) return null;
  const statement = text(item.statement || item.note || item.summary || item.description) || (Array.isArray(item.values) ? item.values.map(text).filter(Boolean).join(' | ') : null);
  if (!statement) return null;
  return { id: text(item.id) || `conflict-${index + 1}-${hashText(normalizeNeedle(statement)).slice(0, 8)}`, statement };
}

function collectConflicts(legal, dossier) {
  const items = [...(dossier?.conflicts || []), ...(legal?.contradictions || []), ...(legal?.conflicts || []), ...(legal?.scriptPolicy?.conflicts || []), ...(legal?.legalPolicy?.conflicts || [])];
  const byKey = new Map();
  items.forEach((item, index) => { const row = normalizeConflict(item, index); if (row) byKey.set(normalizeNeedle(row.statement), row); });
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collectUnknowns(legal, dossier) {
  return uniqueStrings([...(dossier?.unknowns || []), ...(legal?.missingFacts || []), ...(legal?.unknowns || []), ...(legal?.scriptPolicy?.uncertaintyInstructions || []), ...(legal?.legalPolicy?.uncertaintyInstructions || [])].map(normalizeLegalString));
}

function scriptText(script) {
  if (typeof script === 'string') return script;
  if (isObject(script)) return String(script.draft || Object.values(script.sections || {}).join('\n') || '');
  return '';
}

function appliesToSpan(rule, span, spanText) {
  if (rule.global) return true;
  if (rule.claimIds.some((id) => span.claimIds.includes(id))) return true;
  const normalizedSpan = normalizeNeedle(spanText);
  return rule.triggers.some((trigger) => normalizedSpan.includes(normalizeNeedle(trigger)));
}

function containsQualifiedText(haystack, qualifier) {
  const normalized = normalizeNeedle(haystack);
  const parts = String(qualifier).split('…').map(normalizeNeedle).filter(Boolean);
  let cursor = 0;
  return parts.length > 0 && parts.every((part) => { const found = normalized.indexOf(part, cursor); if (found < 0) return false; cursor = found + part.length; return true; });
}

function normalizedMediaDecision(value, index) {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new Error(`scriptSpans[${index}].mediaDecision must be an object or null`);
  const decision = text(value.decision || value.status)?.toLocaleLowerCase();
  if (!decision) throw new Error(`scriptSpans[${index}].mediaDecision.decision is required`);
  return { decision, ...(text(value.reason) ? { reason: text(value.reason) } : {}) };
}

function expectedConstraints(span, spanText, legal) {
  const identityRestrictionIds = legal.identityRestrictions.filter((rule) => appliesToSpan(rule, span, spanText)).map((rule) => rule.id);
  const footageRestrictionIds = legal.footageRestrictions.filter((rule) => appliesToSpan(rule, span, spanText)).map((rule) => rule.id);
  return { identityRestrictionIds, footageRestrictionIds };
}

export function validateScriptSpans(spans, { script, claims, legal } = {}) {
  if (!Array.isArray(spans) || spans.length === 0) throw new Error('scriptSpans must be a non-empty array');
  const draft = scriptText(script);
  if (!text(draft)) throw new Error('Final script draft must be non-empty');
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  const allowedClaimIds = new Set(legal.allowedClaims.filter((item) => claimIds.has(item)));
  if (allowedClaimIds.size === 0) throw new Error('legal.allowedClaims must explicitly authorize at least one known claim');
  const knownProhibitedIds = new Set(legal.prohibitedClaims.filter((item) => claimIds.has(item)));
  for (const claim of claims) if (['blocked', 'prohibited', 'denied'].includes(claim.status.toLocaleLowerCase())) knownProhibitedIds.add(claim.claimId);
  const bannedStatements = [...legal.prohibitedPhrases, ...legal.prohibitedClaims.filter((item) => !claimIds.has(item))];
  const normalizedDraft = normalizeNeedle(draft);
  for (const statement of bannedStatements) if (normalizedDraft.includes(normalizeNeedle(statement))) throw new Error(`final script contains prohibited text: ${statement}`);
  const qualificationIds = new Set(legal.requiredQualifications.map((item) => item.id));
  const constraintIds = new Set([...legal.identityRestrictions, ...legal.footageRestrictions].map((item) => item.id));
  let previousAt = -1;
  const seenText = new Set();
  const seenSpanIds = new Set();
  return spans.map((input, index) => {
    if (!isObject(input)) throw new Error(`scriptSpans[${index}] must be an object`);
    const scene = Number(input.scene ?? index + 1);
    if (!Number.isInteger(scene) || scene !== index + 1) throw new Error(`scriptSpans[${index}].scene must be ${index + 1}`);
    const spanId = text(input.spanId) || `span-${scene}`;
    if (seenSpanIds.has(spanId)) throw new Error(`scriptSpans[${index}].spanId must be unique`);
    seenSpanIds.add(spanId);
    const captionAnchor = text(input.captionAnchor || input.anchor);
    const excerpt = text(input.excerpt);
    if (!captionAnchor && !excerpt) throw new Error(`scriptSpans[${index}] requires captionAnchor or excerpt`);
    const anchorAt = captionAnchor ? draft.indexOf(captionAnchor) : -1;
    const excerptAt = excerpt ? draft.indexOf(excerpt) : -1;
    if (captionAnchor && anchorAt < 0) throw new Error(`script span ${scene} captionAnchor is absent from final script`);
    if (excerpt && excerptAt < 0) throw new Error(`script span ${scene} excerpt is absent from final script`);
    if (captionAnchor && excerpt && excerptAt < anchorAt) throw new Error(`script span ${scene} anchor/excerpt order is reversed`);
    const at = captionAnchor ? anchorAt : excerptAt;
    for (const item of [...new Set([captionAnchor, excerpt].filter(Boolean))]) {
      const key = `${item}\0${draft.indexOf(item)}`;
      if (seenText.has(key)) throw new Error(`script span ${scene} anchors/excerpts must be unique`);
      seenText.add(key);
    }
    if (at <= previousAt) throw new Error(`script span ${scene} anchors must be forward-ordered`);
    previousAt = at;
    const ids = uniqueStrings(input.claimIds || []);
    if (ids.length === 0) throw new Error(`script span ${scene} claimIds must be non-empty`);
    for (const id of ids) if (!claimIds.has(id)) throw new Error(`script span ${scene} references unknown claim ${id}`);
    for (const id of ids) if (!allowedClaimIds.has(id)) throw new Error(`script span ${scene} references claim ${id} outside legal allowedClaims`);
    for (const id of ids) if (knownProhibitedIds.has(id)) throw new Error(`script span ${scene} admits prohibited claim ${id}`);
    const evidenceClass = text(input.evidenceClass) || 'direct';
    if (!EVIDENCE_CLASSES.has(evidenceClass)) throw new Error(`script span ${scene} has invalid evidenceClass`);
    const mediaDecision = normalizedMediaDecision(input.mediaDecision, index);
    if (mediaDecision && DENIED_DECISIONS.has(mediaDecision.decision)) throw new Error(`script span ${scene} admits prohibited media decision`);
    const spanText = [captionAnchor, excerpt].filter(Boolean).join(' ');
    const applicableQualifications = legal.requiredQualifications.filter((rule) => appliesToSpan(rule, { claimIds: ids }, spanText));
    const carriedQualifications = uniqueStrings(input.qualificationIds || input.requiredQualifications || []);
    for (const id of carriedQualifications) if (!qualificationIds.has(id)) throw new Error(`script span ${scene} carries unknown qualification ${id}`);
    const expectedQualificationIds = applicableQualifications.map((rule) => rule.id).sort((a, b) => a.localeCompare(b));
    if (stableStringify(carriedQualifications) !== stableStringify(expectedQualificationIds)) throw new Error(`script span ${scene} qualificationIds do not match applicable qualifications`);
    for (const rule of applicableQualifications) if (!containsQualifiedText(spanText, rule.text)) throw new Error(`script span ${scene} is missing required qualifier text for ${rule.id}`);
    const mediaConstraints = expectedConstraints({ claimIds: ids }, spanText, legal);
    const legalConstraintIds = uniqueStrings(input.legalConstraintIds || []);
    for (const id of legalConstraintIds) if (!constraintIds.has(id)) throw new Error(`script span ${scene} carries unknown legal constraint ${id}`);
    const expectedConstraintIds = [...mediaConstraints.identityRestrictionIds, ...mediaConstraints.footageRestrictionIds].sort((a, b) => a.localeCompare(b));
    if (stableStringify(legalConstraintIds) !== stableStringify(expectedConstraintIds)) throw new Error(`script span ${scene} legalConstraintIds do not match applicable media constraints`);
    if (input.mediaConstraints !== undefined && stableStringify(input.mediaConstraints) !== stableStringify(mediaConstraints)) throw new Error(`script span ${scene} mediaConstraints do not match applicable legal constraints`);
    return {
      spanId,
      scene,
      ...(captionAnchor ? { captionAnchor } : {}),
      ...(excerpt ? { excerpt } : {}),
      claimIds: ids,
      evidenceClass,
      qualificationIds: carriedQualifications,
      legalConstraintIds,
      mediaDecision,
      mediaConstraints,
    };
  });
}

function validateScopedList(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    assertExactKeys(item, ['id', 'text', 'claimIds', 'triggers', 'global'], [], `${label}[${index}]`);
    if (!text(item.id) || !text(item.text) || ids.has(item.id)) throw new Error(`${label} requires unique non-empty ids and text`);
    ids.add(item.id);
    if (!Array.isArray(item.claimIds) || stableStringify(item.claimIds) !== stableStringify(uniqueStrings(item.claimIds)) || !Array.isArray(item.triggers) || stableStringify(item.triggers) !== stableStringify(uniqueStrings(item.triggers)) || typeof item.global !== 'boolean') throw new Error(`${label}[${index}] scope is invalid`);
    if (!item.global && item.claimIds.length === 0 && item.triggers.length === 0) throw new Error(`${label}[${index}] has no applicability scope`);
  }
  if (stableStringify(items) !== stableStringify([...items].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error(`${label} must be ordered by id`);
}

function assertNormalizedStringArray(items, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(items) || (nonEmpty && items.length === 0) || stableStringify(items) !== stableStringify(uniqueStrings(items))) throw new Error(`${label} must be a normalized unique string array`);
}

function validateNormalizedShape(bundle) {
  assertExactKeys(bundle,
    ['schema', 'generationPolicy', 'upstream', 'researchSnapshotSha', 'dossierSha', 'legalReportSha', 'scriptDraftSha', 'scriptArtifactSha', 'claims', 'conflicts', 'unknowns', 'legal', 'mediaConstraints', 'sourceIndex', 'scriptSpans', 'bundleSha256'],
    ['generatedAt'], 'evidenceBundle');
  if (bundle.schema !== EVIDENCE_BUNDLE_SCHEMA || bundle.generationPolicy !== 'explicit-mapping-only') throw new Error('Invalid editorial-evidence-bundle-v1 schema');
  if (bundle.generatedAt !== undefined && !text(bundle.generatedAt)) throw new Error('generatedAt must be non-empty');
  assertExactKeys(bundle.upstream, ['researchSnapshot', 'eventDossier', 'legalReport', 'script'], [], 'upstream');
  const hashFields = ['researchSnapshotSha', 'dossierSha', 'legalReportSha', 'scriptDraftSha', 'scriptArtifactSha', 'bundleSha256'];
  for (const key of hashFields) if (!SHA256.test(bundle[key] || '')) throw new Error(`Invalid ${key}`);
  for (const [key, ref] of Object.entries(bundle.upstream)) {
    assertExactKeys(ref, ['kind', 'path', 'sha256'], [], `upstream.${key}`);
    if (ref.kind !== key || !text(ref.path) || !SHA256.test(ref.sha256 || '')) throw new Error(`Invalid upstream ${key} reference`);
  }
  if (!Array.isArray(bundle.claims) || bundle.claims.length === 0) throw new Error('Evidence bundle claims must be non-empty');
  const claimIds = new Set();
  for (const [index, claim] of bundle.claims.entries()) {
    assertExactKeys(claim, ['claimId', 'summary', 'perspective', 'status', 'confidence', 'sourceIds'], ['field'], `claims[${index}]`);
    if (!text(claim.claimId) || !text(claim.summary) || !text(claim.perspective) || !text(claim.status) || !text(claim.confidence) || claimIds.has(claim.claimId)) throw new Error('Evidence claims require unique claimId and normalized text fields');
    try { assertNormalizedStringArray(claim.sourceIds, `Claim ${claim.claimId}.sourceIds`, { nonEmpty: true }); }
    catch { throw new Error(`Claim ${claim.claimId} requires normalized non-empty sourceIds`); }
    claimIds.add(claim.claimId);
  }
  if (stableStringify(bundle.claims) !== stableStringify([...bundle.claims].sort((a, b) => a.claimId.localeCompare(b.claimId)))) throw new Error('Evidence claims must be ordered by claimId');
  if (!Array.isArray(bundle.conflicts) || bundle.conflicts.some((item) => !isObject(item) || !text(item.id) || !text(item.statement) || Object.keys(item).some((key) => !['id', 'statement'].includes(key))) || new Set(bundle.conflicts.map((item) => item.id)).size !== bundle.conflicts.length || new Set(bundle.conflicts.map((item) => normalizeNeedle(item.statement))).size !== bundle.conflicts.length || stableStringify(bundle.conflicts) !== stableStringify([...bundle.conflicts].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error('Evidence conflicts must be unique normalized objects ordered by id');
  assertNormalizedStringArray(bundle.unknowns, 'Evidence unknowns');
  if (!Array.isArray(bundle.sourceIndex) || bundle.sourceIndex.length === 0) throw new Error('Evidence sourceIndex must be non-empty');
  const sourceIds = new Set();
  for (const [index, source] of bundle.sourceIndex.entries()) {
    assertExactKeys(source, ['id', 'url', 'status', 'verified'], ['title', 'publisher', 'date'], `sourceIndex[${index}]`);
    if (!text(source.id) || sourceIds.has(source.id) || !HTTP_URL.test(source.url || '') || source.status !== 'verified' || source.verified !== true || ['title', 'publisher', 'date'].some((key) => source[key] !== undefined && !text(source[key]))) throw new Error(`sourceIndex[${index}] is not an acceptable verified source`);
    sourceIds.add(source.id);
  }
  if (stableStringify(bundle.sourceIndex) !== stableStringify([...bundle.sourceIndex].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error('Evidence sourceIndex must be ordered by id');
  for (const claim of bundle.claims) for (const id of claim.sourceIds) if (!sourceIds.has(id)) throw new Error(`Claim ${claim.claimId} references dangling source ${id}`);
  assertExactKeys(bundle.legal, ['videoDecision', 'allowedClaims', 'prohibitedClaims', 'prohibitedPhrases', 'requiredQualifications', 'identityRestrictions', 'footageRestrictions', 'safePhrasing'], [], 'legal');
  assertExactKeys(bundle.legal.videoDecision, ['decision', 'reasons'], [], 'legal.videoDecision');
  const decision = text(bundle.legal.videoDecision.decision)?.toLocaleLowerCase();
  if (!DECISIONS.has(decision)) throw new Error(`Legal videoDecision ${decision || 'missing'} blocks evidence bundle admission`);
  assertNormalizedStringArray(bundle.legal.videoDecision.reasons, 'legal.videoDecision.reasons');
  for (const key of ['allowedClaims', 'prohibitedClaims', 'prohibitedPhrases', 'safePhrasing']) assertNormalizedStringArray(bundle.legal[key], `legal.${key}`);
  validateScopedList(bundle.legal.requiredQualifications, 'legal.requiredQualifications');
  validateScopedList(bundle.legal.identityRestrictions, 'legal.identityRestrictions');
  validateScopedList(bundle.legal.footageRestrictions, 'legal.footageRestrictions');
  assertExactKeys(bundle.mediaConstraints, ['identity', 'footage'], [], 'mediaConstraints');
  if (stableStringify(bundle.mediaConstraints.identity) !== stableStringify(bundle.legal.identityRestrictions) || stableStringify(bundle.mediaConstraints.footage) !== stableStringify(bundle.legal.footageRestrictions)) throw new Error('mediaConstraints must mirror legal restrictions exactly');
  if (!Array.isArray(bundle.scriptSpans) || bundle.scriptSpans.length === 0) throw new Error('Evidence scriptSpans must be non-empty');
}

export function validateEvidenceBundle(bundle, { rootDir, script, verifyUpstreams = true } = {}) {
  validateNormalizedShape(bundle);
  if (bundle.bundleSha256 !== bundleHash(bundle)) throw new Error('Evidence bundle bundleSha256 is stale or tampered');
  if (!rootDir) throw new Error('Evidence bundle rootDir is required');
  let scriptValue = script;
  for (const [key, ref] of Object.entries(bundle.upstream)) {
    const contained = resolveContainedPath(rootDir, ref.path, `upstream.${key}.path`);
    if (contained.relative !== ref.path.replaceAll('\\', '/')) throw new Error(`upstream.${key}.path must be normalized`);
    if (verifyUpstreams) {
      if (!fs.existsSync(contained.resolved) || !fs.statSync(contained.resolved).isFile()) throw new Error(`Evidence upstream ${key} is missing`);
      const bytes = fs.readFileSync(contained.resolved);
      if (sha256(bytes) !== ref.sha256) throw new Error(`Evidence upstream ${key} hash is stale`);
      const field = { researchSnapshot: 'researchSnapshotSha', eventDossier: 'dossierSha', legalReport: 'legalReportSha', script: 'scriptArtifactSha' }[key];
      if (bundle[field] !== ref.sha256) throw new Error(`Evidence ${field} does not match upstream ${key}`);
      if (key === 'script' && scriptValue === undefined) scriptValue = parseJsonBytes(bytes, 'Evidence script');
    }
  }
  if (scriptValue === undefined) throw new Error('Evidence script is required for span validation');
  if (bundle.scriptDraftSha !== hashText(scriptText(scriptValue))) throw new Error('Evidence script draft hash is stale');
  const normalizedSpans = validateScriptSpans(bundle.scriptSpans, { script: scriptValue, claims: bundle.claims, legal: bundle.legal });
  if (stableStringify(normalizedSpans) !== stableStringify(bundle.scriptSpans)) throw new Error('Evidence scriptSpans are not in normalized authoritative form');
  return true;
}

export function buildEvidenceBundle({ researchSnapshot, eventDossier, legalReport, script, scriptSpans, rootDir, generatedAt } = {}) {
  if (!rootDir) throw new Error('rootDir is required for deterministic evidence references');
  const research = readArtifact(researchSnapshot, 'researchSnapshot');
  const dossier = readArtifact(eventDossier, 'eventDossier');
  const legal = readArtifact(legalReport, 'legalReport');
  const scriptArtifact = readArtifact(script, 'script');
  const claims = collectClaims(legal.value, dossier.value);
  const legalSummary = normalizeLegal(legal.value, dossier.value, claims);
  const spans = validateScriptSpans(scriptSpans || [], { script: scriptArtifact.value, claims, legal: legalSummary });
  const bundle = {
    schema: EVIDENCE_BUNDLE_SCHEMA,
    generationPolicy: 'explicit-mapping-only',
    ...(generatedAt ? { generatedAt } : {}),
    upstream: {
      researchSnapshot: relativeRef(research.path, rootDir, 'researchSnapshot', research.sha256),
      eventDossier: relativeRef(dossier.path, rootDir, 'eventDossier', dossier.sha256),
      legalReport: relativeRef(legal.path, rootDir, 'legalReport', legal.sha256),
      script: relativeRef(scriptArtifact.path, rootDir, 'script', scriptArtifact.sha256),
    },
    researchSnapshotSha: research.sha256,
    dossierSha: dossier.sha256,
    legalReportSha: legal.sha256,
    scriptDraftSha: hashText(scriptText(scriptArtifact.value)),
    scriptArtifactSha: scriptArtifact.sha256,
    claims,
    conflicts: collectConflicts(legal.value, dossier.value),
    unknowns: collectUnknowns(legal.value, dossier.value),
    legal: legalSummary,
    mediaConstraints: { identity: legalSummary.identityRestrictions, footage: legalSummary.footageRestrictions },
    sourceIndex: collectSourceIndex(research.value, dossier.value, legal.value),
    scriptSpans: spans,
  };
  bundle.bundleSha256 = bundleHash(bundle);
  validateEvidenceBundle(bundle, { rootDir, script: scriptArtifact.value });
  return bundle;
}

export function verifyEvidenceBundle(bundle, options = {}) {
  return validateEvidenceBundle(bundle, options);
}
