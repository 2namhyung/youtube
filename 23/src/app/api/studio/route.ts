import {createPlan, planCsv, prepareImportedCopy, requirementsExport, reviewStates, scriptDiff} from '../../../../visualmaker/core/director';
import {getProject, insertProject, listProjects, updateProject, verifyAssets} from '../../../../visualmaker/core/store';
import {guard, readJson, failure} from '../../../../visualmaker/core/http';
import {importEpisode, handoff} from '../../../../visualmaker/core/episode';
import type {Command} from '../../../../visualmaker/core/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    guard(request);
    const query = new URL(request.url).searchParams;
    const id = query.get('id');
    if (!id) return Response.json({projects:listProjects()});
    const plan = getProject(id);
    const format = query.get('format');
    if (format === 'csv') return new Response('\uFEFF' + planCsv(plan), {headers:{'Content-Type':'text/csv; charset=utf-8'}});
    if (format === 'requirements') return Response.json(requirementsExport(plan));
    if (format === 'handoff') return Response.json(handoff(plan));
    if (format === 'json') verifyAssets(plan);
    return Response.json({plan, sourceReviewStates:reviewStates(plan)});
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    guard(request); const body = await readJson(request);
    if (body.operation === 'diff') return Response.json(scriptDiff(getProject(String(body.id)), String(body.text ?? '')));
    const plan = body.operation === 'episode' ? importEpisode()
      : body.operation === 'import' ? prepareImportedCopy(body.plan)
      : createPlan(String(body.title || '새 영상'), String(body.text || ''));
    const saved = insertProject(plan, body.operation === 'import');
    return Response.json({plan:saved, sourceReviewStates:reviewStates(saved), importReviewReset:body.operation === 'import'}, {status:201});
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    guard(request); const body = await readJson(request);
    const command = body.command as Command;
    if (!command || command.type === 'attach-asset') throw new Error('파일 자료는 검증된 업로드 경로로 등록하세요.');
    const plan = updateProject(String(body.id), Number(body.baseRevision), command);
    return Response.json({plan, sourceReviewStates:reviewStates(plan)});
  } catch (error) { return failure(error); }
}
