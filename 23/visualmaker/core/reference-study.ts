export const REFERENCE_STUDY_SCHEMA = 'visualmaker-reference-study-v1' as const;

export const REFERENCE_DIMENSIONS = [
  'stage', 'focal', 'supporting', 'depth', 'entrance', 'internal-change', 'transition', 'hold', 'exclusions',
] as const;

export type ReferenceDimension = typeof REFERENCE_DIMENSIONS[number];
export type DimensionNote =
  | {status:'observed';note:string;evidenceIds:string[]}
  | {status:'unknown'|'not-applicable';reason:string};

export type ReferenceFrameEvidence = {
  id:string;
  kind:'local-frame';
  frameId:string;
  path:string;
  sha256:string;
  timeSeconds:number;
};

export type ReferenceObservation = {
  id:string;
  startSeconds:number;
  endSeconds:number;
  evidence:ReferenceFrameEvidence[];
  dimensions:Record<ReferenceDimension,DimensionNote>;
  borrowedElements:string[];
  excludedElements:string[];
  originalSubjectReplacementIntent:string;
};

export type ToolGap = {
  id:string;
  basis:'observed'|'hypothesis';
  target:{kind:'observation';observationId:string}|{kind:'unbound';reason:string};
  requiredBehavior:string;
  currentLimitation:string;
  evidence:{kind:'comparison';sourceEvidenceIds:string[];reproductionEvidence:ReproductionEvidence[];pairedTimepoints:Array<{sourceEvidenceId:string;reproductionEvidenceId:string;sourceTimeSeconds:number;reproductionTimeSeconds:number}>;comparisonNote:string}|{kind:'unknown';reason:string};
  testableAcceptanceCriterion:string;
};

export type ReproductionEvidence = {
  id:string;
  kind:'reproduction-frame'|'probe-artifact';
  mediaType:'image/jpeg'|'image/png'|'image/webp'|'video/mp4'|'video/webm'|'application/json'|'text/plain';
  path:string;
  sha256:string;
  timeSeconds:number;
};

export type CapabilityUpgradeProposal = {
  id:string;
  toolGapId:string;
  proposedCapability:string;
  acceptanceCriterion:string;
  changesSourceGrammar:false;
  status:'proposal';
};

export type ReferenceStudy = {
  schemaVersion:typeof REFERENCE_STUDY_SCHEMA;
  studyId:string;
  objective:string;
  source:{platform:'youtube';videoId:string;canonicalUrl:string};
  observations:ReferenceObservation[];
  toolGaps:ToolGap[];
  capabilityUpgradeProposals:CapabilityUpgradeProposal[];
  capabilities:{automaticAnalysis:false;remoteAccess:false;rendering:false;productionAuthority:false};
};

const SUPPORTED_HOSTS = new Set(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const HASH = /^(?!0{64}$)[a-f0-9]{64}$/;
const MOTION_DIMENSIONS = new Set<ReferenceDimension>(['entrance','internal-change','transition','hold']);
const PLACEHOLDER_BASENAMES = new Set(['placeholder','example','fake','dummy','todo']);

type UrlResult = {ok:true;videoId:string;canonicalUrl:string}|{ok:false;reason:string};

export function canonicalizeYouTubeUrl(input:unknown):UrlResult {
  if (typeof input !== 'string' || input.trim() === '') return {ok:false,reason:'url-required'};
  let url:URL;
  try { url = new URL(input.trim()); } catch { return {ok:false,reason:'url-malformed'}; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return {ok:false,reason:'unsupported-scheme'};
  if (url.username || url.password) return {ok:false,reason:'credentials-not-allowed'};
  if (url.port) return {ok:false,reason:'nonstandard-port-not-allowed'};
  const host = url.hostname.toLowerCase();
  if (!SUPPORTED_HOSTS.has(host)) return {ok:false,reason:'unsupported-youtube-host'};

  const segments = url.pathname.split('/').filter(Boolean);
  let videoId:string|undefined;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    if (segments.length !== 1) return {ok:false,reason:'unsupported-video-path'};
    videoId = segments[0];
  } else if (url.pathname === '/watch') {
    const ids = url.searchParams.getAll('v');
    if (ids.length !== 1) return {ok:false,reason:ids.length > 1 ? 'duplicate-video-id' : 'single-video-required'};
    videoId = ids[0];
  } else if (segments.length === 2 && ['shorts','embed'].includes(segments[0] ?? '')) {
    videoId = segments[1];
  } else if ((host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') && segments.length === 2 && segments[0] === 'embed') {
    videoId = segments[1];
  } else if (url.pathname === '/playlist' || url.pathname === '/') {
    return {ok:false,reason:'single-video-required'};
  } else {
    return {ok:false,reason:'unsupported-video-path'};
  }
  if (!videoId || !VIDEO_ID.test(videoId)) return {ok:false,reason:'invalid-video-id'};
  return {ok:true,videoId,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`};
}

export function createReferenceStudy(input:{studyId:string;url:string;objective:string}):ReferenceStudy {
  if (!ID.test(input.studyId)) throw new TypeError('studyId must be a stable, nonblank identifier');
  if (typeof input.objective !== 'string' || input.objective.trim() === '') throw new TypeError('objective is required');
  const source = canonicalizeYouTubeUrl(input.url);
  if (!source.ok) throw new TypeError(`Unsupported YouTube URL: ${source.reason}`);
  return {
    schemaVersion:REFERENCE_STUDY_SCHEMA,
    studyId:input.studyId,
    objective:input.objective.trim(),
    source:{platform:'youtube',videoId:source.videoId,canonicalUrl:source.canonicalUrl},
    observations:[],toolGaps:[],capabilityUpgradeProposals:[],
    capabilities:{automaticAnalysis:false,remoteAccess:false,rendering:false,productionAuthority:false},
  };
}

const isObject = (value:unknown):value is Record<string,unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonblank = (value:unknown):value is string => typeof value === 'string' && value.trim().length > 0;
const finiteNonnegative = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const exactKeys = (value:Record<string,unknown>,keys:string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const safeRelativePath = (value:unknown):value is string => {
  if (!nonblank(value) || value.includes('\0') || value.includes('\\') || value.startsWith('/')) return false;
  if (/^[a-z]:/i.test(value)) return false;
  const parts = value.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..' || /^[a-z]:/i.test(part))) return false;
  const basename = parts.at(-1) ?? '';
  const plainName = basename.replace(/^\./,'').toLowerCase();
  const stem = plainName.replace(/\.[^.]*$/,'');
  return !PLACEHOLDER_BASENAMES.has(plainName) && !PLACEHOLDER_BASENAMES.has(stem);
};

export type StudyValidation = {valid:boolean;errors:Array<{code:string;path:string}>};

export function validateReferenceStudy(value:unknown):StudyValidation {
  const errors:Array<{code:string;path:string}> = [];
  const issue = (code:string,path:string) => errors.push({code,path});
  if (!isObject(value)) return {valid:false,errors:[{code:'object-required',path:'$'}]};
  if (!exactKeys(value,['schemaVersion','studyId','objective','source','observations','toolGaps','capabilityUpgradeProposals','capabilities'])) issue('unexpected-or-missing-fields','$');
  if (value.schemaVersion !== REFERENCE_STUDY_SCHEMA) issue('unsupported-schema','schemaVersion');
  if (typeof value.studyId !== 'string' || !ID.test(value.studyId)) issue('invalid-study-id','studyId');
  if (!nonblank(value.objective)) issue('objective-required','objective');
  if (!isObject(value.source) || !exactKeys(value.source,['platform','videoId','canonicalUrl'])) issue('invalid-source','source');
  else {
    if (value.source.platform !== 'youtube') issue('unsupported-platform','source.platform');
    const parsed = canonicalizeYouTubeUrl(value.source.canonicalUrl);
    if (!parsed.ok || parsed.canonicalUrl !== value.source.canonicalUrl || parsed.videoId !== value.source.videoId) issue('invalid-canonical-youtube-url','source.canonicalUrl');
  }
  if (!isObject(value.capabilities) || !exactKeys(value.capabilities,['automaticAnalysis','remoteAccess','rendering','productionAuthority']) ||
    value.capabilities.automaticAnalysis !== false || value.capabilities.remoteAccess !== false || value.capabilities.rendering !== false || value.capabilities.productionAuthority !== false) issue('capability-unavailable-flags-must-be-false','capabilities');

  const observationIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const evidenceOwnerById = new Map<string,{observationId:string;timeSeconds:number}>();
  if (!Array.isArray(value.observations)) issue('observations-array-required','observations');
  else value.observations.forEach((item,index) => {
    const path = `observations[${index}]`;
    if (!isObject(item) || !exactKeys(item,['id','startSeconds','endSeconds','evidence','dimensions','borrowedElements','excludedElements','originalSubjectReplacementIntent'])) {issue('invalid-observation',path);return;}
    if (typeof item.id !== 'string' || !ID.test(item.id) || observationIds.has(item.id)) issue('invalid-or-duplicate-observation-id',`${path}.id`);
    else observationIds.add(item.id);
    const timeValid = finiteNonnegative(item.startSeconds) && finiteNonnegative(item.endSeconds) && item.endSeconds > item.startSeconds;
    if (!timeValid) issue('invalid-time-window',path);
    if (!Array.isArray(item.evidence)) issue('evidence-array-required',`${path}.evidence`);
    const localEvidence = new Map<string,number>();
    if (Array.isArray(item.evidence)) item.evidence.forEach((ev,eIndex) => {
      const evPath = `${path}.evidence[${eIndex}]`;
      if (!isObject(ev) || !exactKeys(ev,['id','kind','frameId','path','sha256','timeSeconds'])) {issue('invalid-evidence-locator',evPath);return;}
      if (typeof ev.id !== 'string' || !ID.test(ev.id) || evidenceIds.has(ev.id)) issue('invalid-or-duplicate-evidence-id',`${evPath}.id`);
      else {
        evidenceIds.add(ev.id);
        localEvidence.set(ev.id,ev.timeSeconds as number);
        if (typeof item.id === 'string') evidenceOwnerById.set(ev.id,{observationId:item.id,timeSeconds:ev.timeSeconds as number});
      }
      if (ev.kind !== 'local-frame' || !nonblank(ev.frameId) || !safeRelativePath(ev.path) || typeof ev.sha256 !== 'string' || !HASH.test(ev.sha256)) issue('invalid-local-frame-declaration',evPath);
      if (!finiteNonnegative(ev.timeSeconds) || (timeValid && ((ev.timeSeconds as number) < (item.startSeconds as number) || (ev.timeSeconds as number) > (item.endSeconds as number)))) issue('invalid-evidence-time',`${evPath}.timeSeconds`);
    });
    const dimensions = item.dimensions;
    if (!isObject(dimensions) || !exactKeys(dimensions, [...REFERENCE_DIMENSIONS])) {issue('invalid-nine-dimension-matrix',`${path}.dimensions`);return;}
    REFERENCE_DIMENSIONS.forEach(dimension => {
      const dim = dimensions[dimension];
      const dimPath = `${path}.dimensions.${dimension}`;
      if (!isObject(dim)) {issue('invalid-dimension-entry',dimPath);return;}
      if (dim.status === 'observed' && exactKeys(dim,['status','note','evidenceIds'])) {
        if (!nonblank(dim.note) || !Array.isArray(dim.evidenceIds) || dim.evidenceIds.length === 0 || !dim.evidenceIds.every(id => typeof id === 'string' && localEvidence.has(id))) {
          issue('observed-dimension-needs-linked-evidence',dimPath);return;
        }
        if (MOTION_DIMENSIONS.has(dimension)) {
          const times = new Set(dim.evidenceIds.map(id => localEvidence.get(id as string)));
          if (times.size < 2) issue('motion-needs-distinct-time-evidence',dimPath);
        }
      } else if ((dim.status === 'unknown' || dim.status === 'not-applicable') && exactKeys(dim,['status','reason'])) {
        if (!nonblank(dim.reason)) issue('dimension-reason-required',dimPath);
      } else issue('invalid-dimension-entry',dimPath);
    });
    if (!Array.isArray(item.borrowedElements) || !item.borrowedElements.every(nonblank)) issue('invalid-borrowed-elements',`${path}.borrowedElements`);
    if (!Array.isArray(item.excludedElements) || !item.excludedElements.every(nonblank)) issue('invalid-excluded-elements',`${path}.excludedElements`);
    if (!nonblank(item.originalSubjectReplacementIntent)) issue('replacement-intent-required',`${path}.originalSubjectReplacementIntent`);
  });

  const gapIds = new Set<string>();
  if (!Array.isArray(value.toolGaps)) issue('tool-gaps-array-required','toolGaps');
  else value.toolGaps.forEach((gap,index) => {
    const path = `toolGaps[${index}]`;
    if (!isObject(gap) || !exactKeys(gap,['id','basis','target','requiredBehavior','currentLimitation','evidence','testableAcceptanceCriterion'])) {issue('invalid-tool-gap',path);return;}
    if (typeof gap.id !== 'string' || !ID.test(gap.id) || gapIds.has(gap.id)) issue('invalid-or-duplicate-tool-gap-id',`${path}.id`); else gapIds.add(gap.id);
    if (gap.basis !== 'observed' && gap.basis !== 'hypothesis') issue('invalid-tool-gap-basis',`${path}.basis`);
    if (!isObject(gap.target)) issue('invalid-tool-gap-target',`${path}.target`);
    else if (gap.target.kind === 'observation' && exactKeys(gap.target,['kind','observationId'])) {
      if (typeof gap.target.observationId !== 'string' || !observationIds.has(gap.target.observationId)) issue('unknown-tool-gap-observation',`${path}.target.observationId`);
    } else if (gap.target.kind === 'unbound' && exactKeys(gap.target,['kind','reason'])) {
      if (!nonblank(gap.target.reason)) issue('tool-gap-unbound-reason-required',`${path}.target.reason`);
    } else issue('invalid-tool-gap-target',`${path}.target`);
    if (!nonblank(gap.requiredBehavior) || !nonblank(gap.currentLimitation) || !nonblank(gap.testableAcceptanceCriterion)) issue('incomplete-tool-gap',path);
    if (!isObject(gap.evidence)) issue('invalid-tool-gap-evidence',`${path}.evidence`);
    else if (gap.evidence.kind === 'unknown' && exactKeys(gap.evidence,['kind','reason'])) {
      if (!nonblank(gap.evidence.reason)) issue('unknown-evidence-reason-required',`${path}.evidence.reason`);
    } else if (gap.evidence.kind === 'comparison' && exactKeys(gap.evidence,['kind','sourceEvidenceIds','reproductionEvidence','pairedTimepoints','comparisonNote'])) {
      const comparison = gap.evidence;
      const targetId = isObject(gap.target) && gap.target.kind === 'observation' && typeof gap.target.observationId === 'string' ? gap.target.observationId : null;
      const targetObservation = targetId && Array.isArray(value.observations)
        ? value.observations.find(observation => isObject(observation) && observation.id === targetId)
        : undefined;
      const targetEvidence = isObject(targetObservation) && Array.isArray(targetObservation.evidence)
        ? new Set(targetObservation.evidence.filter(isObject).map(item => item.id))
        : new Set<unknown>();
      if (!Array.isArray(comparison.sourceEvidenceIds) || comparison.sourceEvidenceIds.length === 0 ||
        !comparison.sourceEvidenceIds.every(id => typeof id === 'string' && targetEvidence.has(id) && evidenceOwnerById.get(id)?.observationId === targetId)) issue('tool-gap-source-evidence-outside-target',`${path}.evidence.sourceEvidenceIds`);
      const reproductionById = new Map<string,Record<string,unknown>>();
      if (!Array.isArray(comparison.reproductionEvidence) || comparison.reproductionEvidence.length === 0) issue('tool-gap-reproduction-evidence-required',`${path}.evidence.reproductionEvidence`);
      else comparison.reproductionEvidence.forEach((reproduction,index) => {
        const reproductionPath = `${path}.evidence.reproductionEvidence[${index}]`;
        if (!isObject(reproduction) || !exactKeys(reproduction,['id','kind','mediaType','path','sha256','timeSeconds'])) {issue('invalid-reproduction-evidence',reproductionPath);return;}
        if (typeof reproduction.id !== 'string' || !ID.test(reproduction.id) || reproductionById.has(reproduction.id)) issue('invalid-or-duplicate-reproduction-evidence-id',`${reproductionPath}.id`);
        else reproductionById.set(reproduction.id,reproduction);
        if ((reproduction.kind !== 'reproduction-frame' && reproduction.kind !== 'probe-artifact') ||
          !['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/json','text/plain'].includes(String(reproduction.mediaType)) ||
          !safeRelativePath(reproduction.path) || typeof reproduction.sha256 !== 'string' || !HASH.test(reproduction.sha256) || !finiteNonnegative(reproduction.timeSeconds)) issue('invalid-reproduction-evidence-declaration',reproductionPath);
      });
      if (!Array.isArray(comparison.pairedTimepoints) || comparison.pairedTimepoints.length === 0) issue('tool-gap-paired-timepoints-required',`${path}.evidence.pairedTimepoints`);
      const pairedSources = new Set<string>();
      const pairedReproductions = new Set<string>();
      const pairKeys = new Set<string>();
      if (Array.isArray(comparison.pairedTimepoints)) comparison.pairedTimepoints.forEach((pair,index) => {
        const pairPath = `${path}.evidence.pairedTimepoints[${index}]`;
        if (!isObject(pair) || !exactKeys(pair,['sourceEvidenceId','reproductionEvidenceId','sourceTimeSeconds','reproductionTimeSeconds'])) {issue('invalid-comparison-timepoint',pairPath);return;}
        const source = typeof pair.sourceEvidenceId === 'string' ? evidenceOwnerById.get(pair.sourceEvidenceId) : undefined;
        const reproduction = typeof pair.reproductionEvidenceId === 'string' ? reproductionById.get(pair.reproductionEvidenceId) : undefined;
        if (typeof pair.sourceEvidenceId === 'string' && typeof pair.reproductionEvidenceId === 'string') {
          const pairKey = `${pair.sourceEvidenceId}\0${pair.reproductionEvidenceId}`;
          if (pairKeys.has(pairKey)) issue('duplicate-comparison-timepoint',pairPath);
          pairKeys.add(pairKey); pairedSources.add(pair.sourceEvidenceId); pairedReproductions.add(pair.reproductionEvidenceId);
        }
        if (!source || source.observationId !== targetId || !targetEvidence.has(pair.sourceEvidenceId) ||
          !Array.isArray(comparison.sourceEvidenceIds) || !comparison.sourceEvidenceIds.includes(pair.sourceEvidenceId) || !reproduction ||
          pair.sourceTimeSeconds !== source.timeSeconds || pair.reproductionTimeSeconds !== reproduction.timeSeconds) issue('comparison-timepoint-not-bound-to-target-evidence',pairPath);
      });
      if (Array.isArray(comparison.sourceEvidenceIds) && comparison.sourceEvidenceIds.some(id => typeof id === 'string' && !pairedSources.has(id))) issue('unpaired-source-comparison-evidence',`${path}.evidence.sourceEvidenceIds`);
      if (Array.isArray(comparison.reproductionEvidence) && comparison.reproductionEvidence.some(item => isObject(item) && typeof item.id === 'string' && !pairedReproductions.has(item.id))) issue('unpaired-reproduction-comparison-evidence',`${path}.evidence.reproductionEvidence`);
      if (!nonblank(comparison.comparisonNote)) issue('comparison-note-required',`${path}.evidence.comparisonNote`);
    } else issue('invalid-tool-gap-evidence',`${path}.evidence`);
    if ((gap.basis === 'observed' && (!isObject(gap.evidence) || gap.evidence.kind !== 'comparison' || !isObject(gap.target) || gap.target.kind !== 'observation')) ||
      (gap.basis === 'hypothesis' && (!isObject(gap.evidence) || gap.evidence.kind !== 'unknown'))) issue('tool-gap-basis-evidence-mismatch',`${path}.basis`);
  });

  const proposalIds = new Set<string>();
  if (!Array.isArray(value.capabilityUpgradeProposals)) issue('capability-upgrade-array-required','capabilityUpgradeProposals');
  else value.capabilityUpgradeProposals.forEach((proposal,index) => {
    const path = `capabilityUpgradeProposals[${index}]`;
    if (!isObject(proposal) || !exactKeys(proposal,['id','toolGapId','proposedCapability','acceptanceCriterion','changesSourceGrammar','status'])) {issue('invalid-capability-upgrade-proposal',path);return;}
    if (typeof proposal.id !== 'string' || !ID.test(proposal.id) || proposalIds.has(proposal.id)) issue('invalid-or-duplicate-proposal-id',`${path}.id`); else proposalIds.add(proposal.id);
    if (typeof proposal.toolGapId !== 'string' || !gapIds.has(proposal.toolGapId)) issue('unknown-tool-gap',`${path}.toolGapId`);
    if (!nonblank(proposal.proposedCapability) || !nonblank(proposal.acceptanceCriterion)) issue('incomplete-capability-upgrade-proposal',path);
    if (proposal.changesSourceGrammar !== false || proposal.status !== 'proposal') issue('proposal-cannot-modify-or-approve-reference-grammar',path);
  });
  return {valid:errors.length===0,errors};
}

export function buildReferenceStudyReadiness(value:unknown) {
  const validation = validateReferenceStudy(value);
  if (!validation.valid || !isObject(value)) return {
    schemaVersion:REFERENCE_STUDY_SCHEMA,status:'blocked' as const,structurallyValid:false,
    observationCount:0,unknownDimensionCount:0,localBytesVerified:false,humanReviewRequired:true,
    referenceFidelityPass:false,styleFrameEligible:false,cutPass:false,productionAuthority:false,
    reasons:validation.errors.map(error => error.code),
  };
  const observations = value.observations as ReferenceObservation[];
  const unknownDimensionCount = observations.reduce((count,observation) => count + REFERENCE_DIMENSIONS.filter(dimension => observation.dimensions[dimension].status !== 'observed').length,0);
  const reasons = ['human-reference-review-required','local-evidence-bytes-not-verified','reference-fidelity-not-approved'];
  if (observations.length === 0) reasons.unshift('no-observations-yet');
  if (unknownDimensionCount > 0) reasons.push('dimensions-unknown-or-not-applicable');
  return {
    schemaVersion:REFERENCE_STUDY_SCHEMA,status:'blocked' as const,structurallyValid:true,
    observationCount:observations.length,unknownDimensionCount,localBytesVerified:false,humanReviewRequired:true,
    referenceFidelityPass:false,styleFrameEligible:false,cutPass:false,productionAuthority:false,reasons,
  };
}
