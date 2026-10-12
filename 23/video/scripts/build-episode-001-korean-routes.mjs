import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputRoot = path.join(root, 'video', 'source-intake', 'episode-001', 'korean-routes-v01');

// The CLI only learns whether a known key is configured. It never serializes or logs values.
function loadKnownLocalEnv() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(ASSEMBLY_API_KEY|DATA_GO_KR_SERVICE_KEY|NATIONAL_ARCHIVES_API_KEY|PEXELS_API_KEY)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
function writeJson(name, value) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const target = path.join(outputRoot, name); const temporary = `${target}.tmp-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, target); return target;
}
function escape(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function page(routes, generatedAt) {
  const rows = routes.map((route) => `<tr><td>${route.priority}</td><td><strong>${escape(route.label)}</strong><br><small>${escape(route.id)}</small></td><td><code>${escape(route.status)}</code><br><small>${escape(route.semanticRole)}</small></td><td>${escape(route.rights)}${route.blocker ? `<br><small><b>제한:</b> ${escape(route.blocker)}</small>` : ''}</td><td>${route.modes.map(escape).join(', ')}</td></tr>`).join('\n');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EP001 Korean routes v01</title><style>body{margin:32px auto;max-width:1500px;padding:0 20px;font:15px/1.5 system-ui,sans-serif;color:#18211f;background:#fbfaf5}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #d8ddd8;padding:10px;vertical-align:top;text-align:left}th{background:#e9f0eb}code{color:#075a3f}small{color:#52605a}section{padding:14px 18px;background:#fff;border:1px solid #d8ddd8;margin:16px 0}</style><main><h1>EP001 한국 맥락 자료 수집 route</h1><p>생성: ${escape(generatedAt)}. 이 판은 수집 route 준비도와 권리 조건을 보여주며, source approval·materialization·production authority를 부여하지 않습니다.</p><section><p>일반 맥락 B-roll은 허용하지만 특정 사건·발언의 실제 기록으로 표기하지 않습니다. 국적·정체성은 외모로 추정하지 않고, 장소·기관·원문 metadata로만 확인합니다.</p><p>실행 surface: <code>pnpm run media:ep001-korean-routes</code>로 전체 상태/artifact를 갱신합니다. 앱 <code>/sources</code>의 dry-run과 search는 네트워크 검색을 실행하지 않는 준비도 확인이며, acquire와 manual-registration만 각각 제한 수집과 검증된 등록을 뜻합니다.</p></section><table><thead><tr><th>우선</th><th>route</th><th>준비도·역할</th><th>권리·blocker</th><th>모드</th></tr></thead><tbody>${rows}</tbody></table></main></html>`;
}

loadKnownLocalEnv();
const { getEp001KoreanMediaRoutes } = await import('../../src/lib/ep001-korean-routes.ts');
const routes = getEp001KoreanMediaRoutes(); const generatedAt = new Date().toISOString();
const manualTemplate = {
  schema_version: 1, purpose: 'EP001 Korean-context media manual registration template. Not a production approval marker.', production_authority: false,
  required_for_all_items: ['route_id', 'source_url', 'creator_or_shooter', 'publisher_or_owner', 'retrieved_at', 'rights_status', 'rights_evidence_url_or_contract_id', 'semantic_role', 'specific_event_evidence', 'local_original_path', 'sha256', 'mime_type', 'duration_or_dimensions'],
  constraints: ['original bytes stay under the versioned source-intake route and never replace raw/', 'official URL must be https and match the route host allowlist', 'news and paid stock require a license contract or explicit permission before download/use', 'general-context B-roll is labelled general-context and never asserted as the specific policy debate', 'production_authority remains false until existing source/right/style/cut gates pass'],
  item_template: { route_id: '', source_url: '', creator_or_shooter: '', publisher_or_owner: '', retrieved_at: '', rights_status: 'pending-item-level-review', rights_evidence_url_or_contract_id: '', semantic_role: 'general-context-b-roll', specific_event_evidence: false, local_original_path: '', sha256: '', mime_type: '', duration_or_dimensions: '', location_or_institution_metadata: '', editorial_limits: '' },
};
const statuses = ['live-operational', 'implemented-awaiting-key', 'manual-intake-ready', 'rights-contract-required'];
const registry = { schema_version: 1, episode_id: 'episode-001', revision: 'korean-routes-v01', generated_at: generatedAt, production_authority: false, route_count: routes.length, statuses: Object.fromEntries(statuses.map((status) => [status, routes.filter((route) => route.status === status).length])), routes };
writeJson('route-registry.json', registry); writeJson('manual-intake-template.json', manualTemplate); fs.writeFileSync(path.join(outputRoot, 'review.html'), page(routes, generatedAt));
process.stdout.write(`EP001 Korean route registry: ${routes.length} routes → ${path.relative(root, outputRoot)}\n`);
