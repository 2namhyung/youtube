import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SECRET = /(api|token|secret|password|credential|key)/i;
const FORBIDDEN_PATH = /(^|[\\/])(api\.txt|knowledge[\\/]raw|news-media-audit)([\\/]|$)/i;
const FORBIDDEN = ['secrets', 'raw-authority', 'provider', 'upload', 'publication', 'production-authority'];
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function verifyResearchOfficialRender(m, {workspaceRoot, verifyFiles = true} = {}) {
  const errors = [];
  if (m?.schema !== 'motion-tool-learning-v4-research-official-render-v1') errors.push('schema');
  if (m?.scope !== 'research-only') errors.push('scope');
  if (!HEX40.test(m?.origin?.commit || '')) errors.push('origin.commit');
  if (!String(m?.origin?.commitUrl || '').endsWith(`/commit/${m?.origin?.commit}`)) errors.push('origin.commitUrl');
  if (!HEX64.test(m?.license?.sha256 || '') || !(m?.license?.bytes > 0) || m?.license?.reviewStatus !== 'approved-for-isolated-research-render') errors.push('license');
  if (m?.urlAudit?.executionRemoteUrls?.length) errors.push('urlAudit.executionRemoteUrls');
  if (m?.isolation?.network !== 'blocked' || !m?.isolation?.physicalNonSymlink || !m?.isolation?.containedRealpath) errors.push('isolation');
  if (JSON.stringify(m?.isolation?.forbiddenCapabilities) !== JSON.stringify(FORBIDDEN)) errors.push('forbiddenCapabilities');
  if ((m?.isolation?.environmentNames || []).some(x => SECRET.test(x))) errors.push('environmentNames');
  if (m?.result?.promotionEligible !== false || m?.result?.productionEligible !== false) errors.push('result.eligibility');
  if (!HEX64.test(m?.implementations?.creatorSha256 || '') || !HEX64.test(m?.implementations?.verifierSha256 || '')) errors.push('implementations');
  const files = [m?.license, ...(m?.sourceFiles || []), ...(m?.dependencyClosure || []), ...(m?.result?.artifact ? [m.result.artifact] : [])];
  if (!m?.sourceFiles?.length || !m?.dependencyClosure?.length) errors.push('closure.empty');
  for (const item of files) {
    if (!item?.file || FORBIDDEN_PATH.test(item.file) || !HEX64.test(item?.sha256 || '') || !(item?.bytes > 0) || item?.physicalNonSymlink !== true || item?.containedRealpath !== true) { errors.push(`file:${item?.file || 'missing'}`); continue; }
    if (!verifyFiles) continue;
    const root = path.resolve(workspaceRoot || '.');
    const full = path.resolve(root, item.file);
    if (!full.startsWith(root + path.sep) || !fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink() || fs.realpathSync(full) !== full) { errors.push(`containment:${item.file}`); continue; }
    const bytes = fs.readFileSync(full);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) errors.push(`hash:${item.file}`);
  }
  for (const r of m?.urlAudit?.allowlistedReplacements || []) if (r.semanticChange !== false || !/^https:\/\//.test(r.originalUrl || '') || !HEX64.test(r.originalSha256 || '') || !HEX64.test(r.adaptedSha256 || '')) errors.push('replacement');
  return {ok: errors.length === 0, errors};
}
