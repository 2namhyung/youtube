import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  CloudOff,
  Download,
  ExternalLink,
  FileText,
  Film,
  Gauge,
  ImagePlus,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoveRight,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import './styles.css';

type Pipeline = 'newsroom' | 'shopping';
type StageId = 'intake' | 'analyze' | 'materials' | 'rights' | 'bind' | 'composite' | 'conform' | 'export';
type Tone = 'coral' | 'olive';

type Stage = { id: StageId; label: string; short: string; detail: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };
type Project = { id: string; name: string; pipeline: Pipeline; revision: number; created_at?: string; status?: string; script?: string; stages?: Record<string, string>; shots?: Shot[]; sources?: Source[]; conform?: ConformState; conforms?: ConformState[] };
type Shot = { id: string; label?: string; text?: string; query?: string; duration?: number; material_status?: string; source_id?: string; status?: string; visual_type?: string; visual_intent?: string; required_visual_intent?: string };
type Source = { id: string; title: string; source_url?: string; creator?: string; license?: string; license_url?: string; rights_evidence?: string; rights_confirmed?: boolean; role?: string; context?: string; allow_transform?: boolean; allow_imagegen?: boolean; allow_omni?: boolean; media_type?: string; mime_type?: string; original_sha256?: string; byte_size?: number; preview?: { status?: string; media_type?: string }; status?: string; thumbnail_url?: string; duration?: number; path_available?: boolean };
type Candidate = { id?: string; source_id?: string; source_sha256?: string; title?: string; label?: string; url?: string; source_url?: string; creator?: string; license?: string; thumbnail_url?: string; media_type?: string; duration?: number; start?: number; end?: number; score?: number; rights_status?: string; role?: string; note?: string };
type ConformState = { revision?: number; before?: string; after?: string; changed?: number; status?: string };
type CompositePreview = { id: string; file_url?: string; duration?: number; background_id?: string; character_id?: string };
type HandoffBlocker = { code?: string; shot_id?: string; message: string };
type HandoffPacket = { status?: string; blockers?: HandoffBlocker[]; revision?: number };
type Session = { token?: string; projects?: Project[]; capabilities?: Capability[]; selected_project_id?: string; engine?: EngineStatus };
type Capability = { name: string; status: 'ready' | 'offline' | 'unknown'; detail: string };
type EngineStatus = { connected?: boolean; name?: string; version?: string; wise?: string; ffmpeg?: string };
type ApiError = Error & { status?: number };

const STAGES: Stage[] = [
  { id: 'intake', label: '대본 입력', short: '01', detail: '사실 또는 상품 근거를 먼저 고정합니다.', icon: FileText },
  { id: 'analyze', label: '샷 분석', short: '02', detail: '문장마다 필요한 화면과 소스 조건을 풉니다.', icon: Sparkles },
  { id: 'materials', label: '소재 탐색', short: '03', detail: '내 라이브러리와 WISE에서 후보를 찾습니다.', icon: Search },
  { id: 'rights', label: '권리 확인', short: '04', detail: 'CC BY와 변환·생성 입력 범위를 분리합니다.', icon: ShieldCheck },
  { id: 'bind', label: '샷 연결', short: '05', detail: '검토한 후보를 대본의 샷에 연결합니다.', icon: Link2 },
  { id: 'composite', label: '2D 합성', short: '06', detail: '현실 장소 위에 캐릭터와 소품을 배치합니다.', icon: ImagePlus },
  { id: 'conform', label: '대본 다듬기', short: '07', detail: '소재에 맞게 표현을 다듬고 변경 이력을 남깁니다.', icon: RefreshCw },
  { id: 'export', label: '제작 인계', short: '08', detail: '출처와 샷 정보를 함께 내보냅니다.', icon: Download },
];

const PIPELINES: Record<Pipeline, { name: string; eyebrow: string; description: string; tone: Tone; fps: string; native: string; link: string }> = {
  newsroom: { name: '내무습다', eyebrow: 'NEWSROOM / OBSERVED EVENTS', description: '그날의 기괴한 사건을 사실과 화면의 근거로 엮습니다.', tone: 'coral', fps: '24 fps', native: '뉴스룸 기존 제작 화면', link: 'http://127.0.0.1:3002/newsroom' },
  shopping: { name: '쇼핑쇼츠', eyebrow: 'COMMERCE / PRODUCT PROOF', description: '제품 주장과 실제 사용 장면을 짧고 분명하게 연결합니다.', tone: 'olive', fps: '30 fps', native: '쇼핑 원본 작업실', link: 'http://127.0.0.1:8765' },
};

const initialScript = {
  newsroom: '사건의 핵심을 한 문장으로 적어 주세요. 확인된 사실과 추정은 구분해서 씁니다.',
  shopping: '제품이 해결하는 문제와 확인 가능한 사용 장면을 한 문장씩 적어 주세요.',
};

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isLoopbackOrigin(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function apiError(response: Response, body: unknown): ApiError {
  const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : `요청을 처리하지 못했습니다 (${response.status}).`;
  const error = new Error(message) as ApiError;
  error.status = response.status;
  return error;
}

function asProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!item.id) return null;
  const conforms = Array.isArray(item.conforms) ? item.conforms as ConformState[] : [];
  return { ...item, id: String(item.id), name: String(item.name || '이름 없는 프로젝트'), pipeline: item.pipeline === 'shopping' || item.profile === 'shopping' ? 'shopping' : 'newsroom', revision: Number(item.revision || 0), shots: Array.isArray(item.shots) ? item.shots as Shot[] : [], sources: Array.isArray(item.sources) ? item.sources as Source[] : [], conforms, conform: conforms.at(-1) || item.conform as ConformState | undefined };
}

function asProjects(value: unknown): Project[] {
  const array = Array.isArray(value) ? value : (value && typeof value === 'object' && Array.isArray((value as { projects?: unknown[] }).projects) ? (value as { projects: unknown[] }).projects : []);
  return array.map(asProject).filter((item): item is Project => Boolean(item));
}

function asSources(value: unknown): Source[] {
  const array = Array.isArray(value) ? value : (value && typeof value === 'object' && Array.isArray((value as { sources?: unknown[] }).sources) ? (value as { sources: unknown[] }).sources : []);
  return array.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && (item as Record<string, unknown>).id)).map((item) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
    const preview = item.preview && typeof item.preview === 'object' ? item.preview as { status?: string; media_type?: string } : undefined;
    return { ...item, id: String(item.id), title: String(item.title || '이름 없는 소재'), context: String(item.context || metadata.context || ''), media_type: String(item.media_type || ''), mime_type: String(item.mime_type || metadata.mime_type || ''), original_sha256: String(item.original_sha256 || metadata.original_sha256 || ''), byte_size: Number(item.byte_size || 0) || undefined, preview, duration: Number(item.duration || item.duration_seconds || 0) || undefined, path_available: item.path_available !== false } as Source;
  });
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = { ready: '연결됨', offline: '오프라인', unknown: '확인 필요', pending: '검토 중', complete: '완료', draft: '초안', blocked: '확인 필요' };
  return status ? labels[status] || status : '기록 없음';
}

function handoffBlockerLabel(blocker: HandoffBlocker) {
  const labels: Record<string, string> = {
    SCRIPT_MISSING: '대본이 없습니다.', ANALYSIS_MISSING: '대본을 샷 단위로 분석해야 합니다.', ANALYSIS_STALE: '대본 변경 후 샷을 다시 분석해야 합니다.', SOURCE_MISSING: '연결되지 않은 샷이 있습니다.',
    RIGHTS_NOT_READY: '소재 권리 확인이 끝나지 않았습니다.', RIGHTS_UNCONFIRMED: '소재별 권리 확인이 필요합니다.', SOURCE_BYTES_MISSING: '원본 파일을 등록해야 합니다.', SOURCE_UNAVAILABLE: '소재 원본을 확인할 수 없습니다.',
    CC_BY_ATTRIBUTION_INCOMPLETE: 'CC BY 출처·제작자·라이선스·권리 근거를 모두 기록해야 합니다.', RIGHTS_EVIDENCE_INCOMPLETE: '출처 URL·라이선스 URL·권리 근거가 필요합니다.', OWNED_RIGHTS_EVIDENCE_MISSING: '직접 보유 또는 허락 근거를 기록해야 합니다.',
    VIDEO_INTERVAL_REQUIRED: '영상 소재의 연속 시작·끝 구간을 확인해야 합니다.', MEDIA_DURATION_UNKNOWN: '소재 길이를 확인해야 합니다.', TRANSFORM_NOT_ALLOWED: '변환 사용 권한을 확인해야 합니다.', IMAGEGEN_INPUT_NOT_ALLOWED: 'ImageGen 입력 권한을 확인해야 합니다.',
    EVIDENCE_ORIGIN_UNVERIFIED: '사건 증거의 출처 분류를 확인해야 합니다.', EVIDENCE_REVIEW_REQUIRED: '사건 증거는 별도 검토 확인이 필요합니다.',
  };
  return labels[blocker.code || ''] || blocker.message;
}

function formatTime(seconds?: number) {
  if (seconds === undefined || Number.isNaN(Number(seconds))) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function App() {
  const [pipeline, setPipeline] = useState<Pipeline>('newsroom');
  const [stage, setStage] = useState<StageId>('intake');
  const [apiBase, setApiBase] = useState(() => localStorage.getItem('studio.apiBase') || 'http://127.0.0.1:8766');
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [engine, setEngine] = useState<EngineStatus>({ connected: false, name: 'PC local engine' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [script, setScript] = useState('');
  const [analysis, setAnalysis] = useState<{ shots: Shot[]; suggestions: string[]; revision?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [wiseResults, setWiseResults] = useState<Candidate[]>([]);
  const [youtubeResults, setYoutubeResults] = useState<Candidate[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'evidence' | 'context' | 'broll' | 'character'>('all');
  const [selectedShot, setSelectedShot] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [bindIn, setBindIn] = useState('');
  const [bindOut, setBindOut] = useState('');
  const [bindMode, setBindMode] = useState('real-2d');
  const [bindNotes, setBindNotes] = useState('');
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceForm, setSourceForm] = useState({ title: '', source_url: '', creator: '', license: 'CC-BY', license_url: 'https://creativecommons.org/licenses/by/4.0/', rights_evidence: '', role: 'broll', context: 'generic-context', rights_confirmed: false, allow_transform: false, allow_imagegen: false, allow_omni: false });
  const [composition, setComposition] = useState({ background_id: '', character_id: '', x: 0, y: 0, scale: 1, duration: 3 });
  const [conformAfter, setConformAfter] = useState('');
  const [conformNote, setConformNote] = useState('');
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const [wiseJob, setWiseJob] = useState<{ id: string; status: string; source_count?: number; reason?: string } | null>(null);
  const [compositePreview, setCompositePreview] = useState<CompositePreview | null>(null);
  const [handoff, setHandoff] = useState<HandoffPacket | null>(null);
  const [youtubeMessage, setYoutubeMessage] = useState('');

  const activePipeline = PIPELINES[pipeline];
  const visibleProjects = useMemo(() => projects.filter((item) => item.pipeline === pipeline), [projects, pipeline]);
  const shots = project?.shots || analysis?.shots || [];
  const sources = project?.sources || [];
  const currentStage = STAGES.find((item) => item.id === stage) || STAGES[0];
  const doneStages = useMemo(() => {
    const done = new Set<StageId>();
    if (project?.script) done.add('intake');
    if (project?.shots?.length || analysis?.shots?.length) done.add('analyze');
    if (sources.length) done.add('materials');
    if (sources.some((item) => item.rights_confirmed)) done.add('rights');
    if (shots.some((item) => item.source_id)) done.add('bind');
    if (project?.status === 'composite-ready') done.add('composite');
    if (project?.conform?.status === 'complete') done.add('conform');
    return done;
  }, [analysis?.shots, project?.conform?.status, project?.script, project?.status, project?.shots, shots, sources]);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!isLoopbackOrigin(apiBase)) throw new Error('API 주소는 localhost 또는 127.0.0.1만 사용할 수 있습니다.');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Studio-Token', token);
    headers.set('Idempotency-Key', headers.get('Idempotency-Key') || makeId());
    const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw apiError(response, body);
    return body as unknown;
  }, [apiBase, token]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const value = await request('/api/studio/session');
      const session = (value || {}) as Session;
      setToken(String(session.token || ''));
      const list = asProjects(await request('/api/studio/projects'));
      const [sourceResponse, wiseResponse] = await Promise.all([request('/api/studio/sources'), request('/api/studio/wise/status').catch(() => ({}))]);
      const allSources = asSources(sourceResponse);
      setProjects(list);
      setCapabilities(Array.isArray(session.capabilities) ? session.capabilities : []);
      const wiseState = wiseResponse && typeof wiseResponse === 'object' ? String((wiseResponse as { status?: unknown }).status || '') : '';
      setEngine(session.engine || { connected: true, name: 'PC local engine', wise: wiseState === 'available' ? 'ready' : 'offline', ffmpeg: 'unknown' });
      const preferred = list.find((item) => item.id === session.selected_project_id && item.pipeline === pipeline) || list.find((item) => item.pipeline === pipeline);
      if (preferred) {
        const [detail, composites, handoffValue] = await Promise.all([
          request(`/api/studio/projects/${preferred.id}`),
          request(`/api/studio/projects/${preferred.id}/composites`).catch(() => ({ items: [] })),
          request(`/api/studio/projects/${preferred.id}/handoff`).catch(() => null),
        ]);
        const selectedProject = asProject((detail as { project?: unknown }).project || detail);
        if (selectedProject) selectedProject.sources = allSources;
        const compositeItems = composites && typeof composites === 'object' && Array.isArray((composites as { items?: unknown[] }).items) ? (composites as { items: CompositePreview[] }).items : [];
        setCompositePreview(compositeItems[0] || null);
        setHandoff(handoffValue && typeof handoffValue === 'object' ? handoffValue as HandoffPacket : null);
        setProject(selectedProject);
      } else {
        setProject(null);
        setHandoff(null);
      }
      setNotice({ kind: 'success', text: '제작 엔진에 연결되었습니다.' });
    } catch (error) {
      setEngine({ connected: false, name: 'PC local engine' });
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '제작 엔진에 연결할 수 없습니다.' });
    } finally {
      setLoading(false);
    }
  }, [pipeline, request]);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => { localStorage.setItem('studio.apiBase', apiBase); }, [apiBase]);
  useEffect(() => {
    if (!project) setScript(initialScript[pipeline]);
    else setScript(project.script || '');
    setConformAfter(project?.script || '');
    setConformNote('');
    setAnalysis(null);
    setSelectedShot('');
    setSelectedSource('');
    setBindIn(''); setBindOut(''); setBindNotes(''); setFactsConfirmed(false);
  }, [pipeline, project]);

  useEffect(() => {
    if (!wiseJob || !['queued', 'running'].includes(wiseJob.status)) return;
    const timer = window.setInterval(() => { void request(`/api/studio/wise/index/${wiseJob.id}`).then((value) => setWiseJob(value as typeof wiseJob)).catch(() => undefined); }, 2000);
    return () => window.clearInterval(timer);
  }, [request, wiseJob]);

  const refreshProject = useCallback(async (id = project?.id) => {
    if (!id) return;
    const [detail, sourceValue, composites, handoffValue] = await Promise.all([
      request(`/api/studio/projects/${id}`),
      request('/api/studio/sources'),
      request(`/api/studio/projects/${id}/composites`).catch(() => ({ items: [] })),
      request(`/api/studio/projects/${id}/handoff`).catch(() => null),
    ]);
    const next = asProject((detail as { project?: unknown }).project || detail);
    if (next) {
      next.sources = asSources(sourceValue);
      const compositeItems = composites && typeof composites === 'object' && Array.isArray((composites as { items?: unknown[] }).items) ? (composites as { items: CompositePreview[] }).items : [];
      setCompositePreview(compositeItems[0] || null);
      setHandoff(handoffValue && typeof handoffValue === 'object' ? handoffValue as HandoffPacket : null);
      setProject(next);
      setProjects((current) => current.map((item) => item.id === next.id ? next : item));
    }
  }, [project?.id, request]);

  const act = async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    setNotice(null);
    try { await fn(); if (success) setNotice({ kind: 'success', text: success }); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '작업을 처리하지 못했습니다.' }); }
    finally { setBusy(false); }
  };

  const createProject = () => act(async () => {
    const value = await request('/api/studio/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), profile: pipeline }) });
    const created = asProject((value as { project?: unknown }).project || value);
    if (!created) throw new Error('새 프로젝트 응답을 읽지 못했습니다.');
    setProjects((current) => [created, ...current]);
    setProject(created);
    setStage('intake');
    setCreateOpen(false);
    setNewName('');
  }, '새 프로젝트를 만들었습니다.');

  const saveScript = () => act(async () => {
    if (!project) throw new Error('먼저 프로젝트를 선택하세요.');
    const value = await request(`/api/studio/projects/${project.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script, expected_revision: project.revision }) });
    const payload = value as { project?: unknown; analysis?: { shots?: Shot[]; suggestions?: string[]; revision?: number } };
    setAnalysis({ shots: payload.analysis?.shots || [], suggestions: [], revision: payload.analysis?.revision });
    const next = asProject(payload.project) || { ...project, script, revision: project.revision + 1 };
    next.sources = project.sources || [];
    setProject(next);
  }, '대본을 저장하고 샷을 분석했습니다.');

  const analyzeScript = () => act(async () => {
    if (!project) throw new Error('먼저 프로젝트를 선택하세요.');
    const value = await request(`/api/studio/projects/${project.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script, expected_revision: project.revision }) });
    const payload = value as { project?: unknown; analysis?: { shots?: Shot[]; suggestions?: string[]; revision?: number } };
    setAnalysis({ shots: payload.analysis?.shots || [], suggestions: payload.analysis?.suggestions || [], revision: payload.analysis?.revision });
    const next = asProject(payload.project);
    if (next) { next.sources = project.sources || []; setProject(next); }
  }, '샷 분석 결과를 저장했습니다. 각 샷의 소재 조건을 확인하세요.');

  const searchMaterials = () => act(async () => {
    if (!query.trim()) throw new Error('검색어를 입력하세요.');
    const [wise, youtube] = await Promise.all([
      request('/api/studio/wise/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim(), top_k: 10 }) }).catch((error) => ({ results: [], reason: error instanceof Error ? error.message : 'WISE 연결 확인 필요' })),
      request(`/api/studio/youtube?q=${encodeURIComponent(query.trim())}`).catch((error) => ({ results: [], reason: error instanceof Error ? error.message : 'YouTube 후보 연결 확인 필요' })),
    ]);
    const normalize = (value: unknown): Candidate[] => {
      const items = Array.isArray(value) ? value : (value && typeof value === 'object' && Array.isArray((value as { results?: unknown[] }).results) ? (value as { results: unknown[] }).results : value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items) ? (value as { items: unknown[] }).items : []);
      return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => {
        const sourceId = String(item.source_id || item.id || item.video_id || '');
        const source = sources.find((candidate) => candidate.id === sourceId);
        const mediaType = String(item.media_type || source?.media_type || source?.mime_type || '').toLowerCase();
        const isImage = mediaType.split('/')[0] === 'image';
        return {
          ...item,
          id: sourceId,
          source_id: sourceId || undefined,
          source_sha256: String(item.sha256 || item.source_sha256 || source?.original_sha256 || '') || undefined,
          title: String(source?.title || item.title || item.label || (sourceId ? `소재 ${sourceId}` : '제목 없는 후보')),
          creator: String(item.creator || source?.creator || '') || undefined,
          license: String(item.license || source?.license || '') || undefined,
          rights_status: source?.rights_confirmed ? 'confirmed' : String(item.rights_status || '') || undefined,
          media_type: mediaType || undefined,
          source_url: String(item.source_url || item.url || (item.video_id ? `https://www.youtube.com/watch?v=${item.video_id}` : '') || source?.source_url || ''),
          thumbnail_url: String(item.thumbnail_url || item.thumbnail || source?.thumbnail_url || (isImage && source?.path_available !== false && sourceId ? `${apiBase.replace(/\/$/, '')}/api/studio/sources/${sourceId}/file` : '') || '') || undefined,
          start: isImage ? undefined : item.start !== undefined ? Number(item.start) : item.start_seconds !== undefined ? Number(item.start_seconds) : undefined,
          end: isImage ? undefined : item.end !== undefined ? Number(item.end) : item.end_seconds !== undefined ? Number(item.end_seconds) : undefined,
        } as Candidate;
      });
    };
    setWiseResults(normalize(wise));
    setYoutubeResults(normalize(youtube));
    const youtubeState = youtube && typeof youtube === 'object' ? youtube as { status?: string; reason?: string } : {};
    if (youtubeState.status === 'quota') setYoutubeMessage('YouTube 검색 한도에 도달했습니다. 아래 링크에서 CC 필터로 직접 확인하거나 원본 URL을 등록하세요.');
    else setYoutubeMessage('');
    if (!normalize(wise).length && !normalize(youtube).length && youtubeState.status !== 'quota') setNotice({ kind: 'info', text: '검색 결과가 없습니다. WISE 연결 상태와 확보한 원본을 확인하세요.' });
  }, '후보 소재를 불러왔습니다. 후보는 자동 승인되지 않습니다.');

  const registerSource = () => act(async () => {
    if (!project || !sourceForm.title.trim()) throw new Error('프로젝트와 소재 제목이 필요합니다.');
    const form = new FormData();
    if (sourceFile) form.append('file', sourceFile);
    const metadata = { ...sourceForm, project_id: project.id };
    form.append('metadata', JSON.stringify(metadata));
    await request('/api/studio/sources', { method: 'POST', body: form });
    await refreshProject();
    setSourceFormOpen(false);
    setSourceFile(null);
    setSourceForm({ title: '', source_url: '', creator: '', license: 'CC-BY', license_url: 'https://creativecommons.org/licenses/by/4.0/', rights_evidence: '', role: 'broll', context: 'generic-context', rights_confirmed: false, allow_transform: false, allow_imagegen: false, allow_omni: false });
  }, '소재를 등록했습니다. 권리 근거를 확인한 뒤 샷에 연결하세요.');

  const bindSource = (shotId: string, sourceId: string, inSeconds?: number, outSeconds?: number, visualMode = 'real-2d', notes = '') => act(async () => {
    if (!project) throw new Error('프로젝트가 필요합니다.');
    await request(`/api/studio/projects/${project.id}/shots/${shotId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: sourceId, expected_revision: project.revision, ...(inSeconds === undefined ? {} : { in_seconds: inSeconds }), ...(outSeconds === undefined ? {} : { out_seconds: outSeconds }), visual_mode: visualMode, notes, query: project.shots?.find((shot) => shot.id === shotId)?.query || '' }) });
    await refreshProject();
  }, '샷 연결을 저장했습니다.');

  const indexWise = () => act(async () => {
    const eligible = sources.filter((source) => source.rights_confirmed === true && Boolean(source.original_sha256) && Boolean(source.byte_size) && source.preview?.status === 'available' && ['image', 'video'].includes((source.media_type || source.mime_type || source.preview.media_type || '').split('/')[0].toLowerCase())).map((source) => source.id);
    if (!eligible.length) throw new Error('WISE 색인에는 원본 파일이 있고 권리 범위가 확인된 소재가 하나 이상 필요합니다.');
    const value = await request('/api/studio/wise/index', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_ids: eligible }) });
    setWiseJob(value as typeof wiseJob);
  }, 'WISE 색인을 시작했습니다. 상태를 확인하며 검색을 준비합니다.');

  const compose = () => act(async () => {
    if (!project || !composition.background_id || !composition.character_id) throw new Error('현실 배경과 2D 캐릭터를 모두 선택하세요.');
    const value = await request(`/api/studio/projects/${project.id}/composite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...composition, expected_revision: project.revision }) });
    if (value && typeof value === 'object' && 'id' in value) setCompositePreview(value as CompositePreview);
    await refreshProject();
  }, '합성 미리보기를 만들었습니다. 실제 렌더와 검수는 다음 제작 화면에서 계속합니다.');

  const conform = () => act(async () => {
    if (!project || !conformAfter.trim() || !conformNote.trim()) throw new Error('다듬은 대본과 변경 메모를 모두 입력하세요.');
    await request(`/api/studio/projects/${project.id}/conform`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: conformAfter.trim(), change_note: conformNote.trim(), facts_confirmed: factsConfirmed, expected_revision: project.revision }) });
    await refreshProject();
  }, '대본 다듬기 변경을 기록했습니다. 사실과 상품 주장은 변경 전에 다시 확인하세요.');

  const exportProject = () => act(async () => {
    if (!project) throw new Error('프로젝트가 필요합니다.');
    if (!isLoopbackOrigin(apiBase)) throw new Error('API 주소는 localhost 또는 127.0.0.1만 사용할 수 있습니다.');
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/studio/projects/${project.id}/export`, { headers: { Accept: 'application/zip', 'X-Studio-Token': token } });
    if (!response.ok) throw apiError(response, await response.text());
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name.replace(/\s+/g, '-')}-handoff.zip`; anchor.click(); URL.revokeObjectURL(url);
  }, '출처와 샷 정보 ZIP을 다운로드했습니다.');

  const switchPipeline = (next: Pipeline) => { setPipeline(next); setStage('intake'); setSettingsOpen(false); };
  const selectProject = (next: Project) => act(async () => { const [detail, sourceValue, composites, handoffValue] = await Promise.all([request(`/api/studio/projects/${next.id}`), request('/api/studio/sources'), request(`/api/studio/projects/${next.id}/composites`).catch(() => ({ items: [] })), request(`/api/studio/projects/${next.id}/handoff`).catch(() => null)]); const selected = asProject((detail as { project?: unknown }).project || detail) || next; selected.sources = asSources(sourceValue); const compositeItems = composites && typeof composites === 'object' && Array.isArray((composites as { items?: unknown[] }).items) ? (composites as { items: CompositePreview[] }).items : []; setCompositePreview(compositeItems[0] || null); setHandoff(handoffValue && typeof handoffValue === 'object' ? handoffValue as HandoffPacket : null); setProject(selected); setStage('intake'); }, `${next.name} 프로젝트를 열었습니다.`);

  return <div className={`app tone-${activePipeline.tone}`}>
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-symbol"><Clapperboard size={19} strokeWidth={2.4} /></div><div><div className="brand-name">제작실 <span>STUDIO</span></div><div className="brand-caption">evidence → frame → cut</div></div></div>
      <div className="pipeline-switcher" role="tablist" aria-label="파이프라인 선택">
        {(Object.keys(PIPELINES) as Pipeline[]).map((key) => <button key={key} className={pipeline === key ? 'pipeline-tab active' : 'pipeline-tab'} onClick={() => switchPipeline(key)} role="tab" aria-selected={pipeline === key}><span className="tab-dot" />{PIPELINES[key].name}</button>)}
      </div>
      <div className="top-actions"><div className={`engine-chip ${engine.connected ? 'connected' : 'offline'}`}><span className="status-dot" />{engine.connected ? '로컬 엔진 연결됨' : '로컬 엔진 오프라인'}</div><button className="icon-button menu-toggle" aria-label="메뉴 열기" onClick={() => setMobileNav((value) => !value)}><Menu size={19} /></button><button className="settings-button" onClick={() => setSettingsOpen((value) => !value)}><Settings2 size={17} />연결 설정</button></div>
    </header>
    <div className="workspace">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-intro"><div className="eyebrow">CURRENT PIPELINE</div><h2>{activePipeline.name}</h2><p>{activePipeline.description}</p></div>
        <div className="native-flow"><div className="flow-label">먼저 기존 제작 화면에서</div><a href={activePipeline.link} target="_blank" rel="noreferrer"><span>{pipeline === 'newsroom' ? '주제 · 사실 검토' : '이야기 · 상품 검토'}</span><ExternalLink size={12} /></a><div className="flow-arrow">↓</div><div className="flow-label">여기서 공통 8단계</div></div>
        <nav className="stage-nav" aria-label="제작 단계">{STAGES.map((item, index) => { const Icon = item.icon; const isActive = stage === item.id; return <button className={`stage-nav-item ${isActive ? 'active' : ''} ${doneStages.has(item.id) ? 'done' : ''}`} key={item.id} onClick={() => { setStage(item.id); setMobileNav(false); }}><span className="stage-index">{doneStages.has(item.id) ? <Check size={13} strokeWidth={3} /> : item.short}</span><span className="stage-nav-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><Icon size={16} strokeWidth={isActive ? 2.5 : 1.7} /></button>; })}</nav>
        <div className="sidebar-section"><div className="sidebar-section-heading"><span>프로젝트</span><button className="plus-button" onClick={() => setCreateOpen(true)} aria-label="새 프로젝트"><Plus size={15} /></button></div>{visibleProjects.length ? visibleProjects.map((item) => <button key={item.id} className={`project-item ${item.id === project?.id ? 'selected' : ''}`} onClick={() => void selectProject(item)}><span className="project-mark" /><span><strong>{item.name}</strong><small>rev {item.revision} · {statusLabel(item.status)}</small></span><ChevronRight size={14} /></button>) : <p className="sidebar-empty">아직 이 파이프라인의 프로젝트가 없습니다.</p>}</div>
        <div className="downstream-flow"><div className="flow-label">인계 후 기존 제작 화면</div><div className="downstream-line"><span>제목</span><span>음성</span><span>편집</span><span>최종 검수</span></div></div><div className="sidebar-footer"><div className="native-link-label">기존 제작 화면</div><a href={activePipeline.link} target="_blank" rel="noreferrer">{activePipeline.native}<ExternalLink size={13} /></a><p>이 화면은 공통 소재·샷 정보를 관리하고, 최종 제작 승인은 기존 화면에 남깁니다.</p></div>
      </aside>
      <main className="main-content">
        <div className="mobile-stage-bar"><span>{currentStage.short}</span><strong>{currentStage.label}</strong><ChevronDown size={15} /></div>
        <div className="content-head"><div><div className="eyebrow">{activePipeline.eyebrow}</div><h1>{project ? project.name : '오늘의 장면을 준비합니다'}</h1><p>{project ? currentStage.detail : '대본과 제품 근거가 들어오면, 화면에 필요한 소재부터 함께 설계합니다.'}</p></div><div className="head-actions">{project && <span className="revision-pill"><span className="revision-dot" />revision {project.revision}</span>}<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />새 프로젝트</button></div></div>
        {notice && <div className={`notice ${notice.kind}`} role="status">{notice.kind === 'error' ? <CircleAlert size={17} /> : notice.kind === 'success' ? <BadgeCheck size={17} /> : <Sparkles size={17} />}<span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="알림 닫기"><X size={15} /></button></div>}
        {loading ? <LoadingState /> : !project ? <EmptyProject pipeline={pipeline} onCreate={() => setCreateOpen(true)} /> : <StageContent apiBase={apiBase} compositePreview={compositePreview} handoff={handoff} youtubeMessage={youtubeMessage} stage={stage} project={project} script={script} setScript={setScript} analysis={analysis} setAnalysis={setAnalysis} busy={busy} saveScript={saveScript} analyzeScript={analyzeScript} query={query} setQuery={setQuery} searchMaterials={searchMaterials} wiseResults={wiseResults} youtubeResults={youtubeResults} sources={sources} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} selectedShot={selectedShot} setSelectedShot={setSelectedShot} selectedSource={selectedSource} setSelectedSource={setSelectedSource} bindIn={bindIn} setBindIn={setBindIn} bindOut={bindOut} setBindOut={setBindOut} bindMode={bindMode} setBindMode={setBindMode} bindNotes={bindNotes} setBindNotes={setBindNotes} onBind={bindSource} onOpenSource={() => setSourceFormOpen(true)} onIndexWise={indexWise} wiseJob={wiseJob} composition={composition} setComposition={setComposition} compose={compose} conformAfter={conformAfter} setConformAfter={setConformAfter} conformNote={conformNote} setConformNote={setConformNote} factsConfirmed={factsConfirmed} setFactsConfirmed={setFactsConfirmed} conform={conform} onExport={exportProject} pipeline={pipeline} />}
        <footer className="main-footer"><span><span className="footer-mark" />제작실 · 공통 파이프라인</span><span>{activePipeline.fps} · {project ? `rev ${project.revision}` : '프로젝트 대기 중'} · 자동 게시 없음</span></footer>
      </main>
      <aside className="right-rail"><div className="rail-heading"><span className="eyebrow">FIELD NOTES</span><BookOpen size={16} /></div><div className="rail-card accent"><div className="rail-number">01</div><strong>사실은 화면보다 먼저</strong><p>{pipeline === 'newsroom' ? '실제 사건을 다룰 때 장소·시각·인물의 확인 범위를 먼저 고정합니다.' : '상품의 주장과 실제 사용 장면을 같은 근거 카드로 연결합니다.'}</p></div><div className="rail-card"><div className="rail-icon"><Box size={17} /></div><strong>현실 배경 + 2D 캐릭터</strong><p>장소의 그림자와 카메라 축을 보존하고, 캐릭터는 필요한 동작만 얹습니다.</p><span className="rail-tag">6 · COMPOSITE</span></div><div className="rail-card"><div className="rail-icon"><Gauge size={17} /></div><strong>{activePipeline.fps} 출력을 준비</strong><p>내무습다는 24fps, 쇼핑쇼츠는 30fps로 원본 타임라인을 구분합니다.</p><span className="rail-tag">LOCAL FFmpeg</span></div><div className="rail-card engine-card"><div className="rail-card-title"><span className={`status-dot ${engine.connected ? '' : 'off'}`} />엔진 연결 상태</div><div className="engine-row"><span>{engine.name || 'PC local engine'}</span><strong>{engine.connected ? 'READY' : 'OFFLINE'}</strong></div><div className="engine-row"><span>WISE</span><strong className={engine.wise === 'ready' ? 'ready' : ''}>{engine.wise || '확인 전'}</strong></div><div className="engine-row"><span>FFmpeg</span><strong className={engine.ffmpeg === 'ready' ? 'ready' : ''}>{engine.ffmpeg || '확인 전'}</strong></div></div></aside>
    </div>
    {settingsOpen && <SettingsPanel apiBase={apiBase} setApiBase={setApiBase} capabilities={capabilities} engine={engine} onReconnect={() => void loadSession()} onClose={() => setSettingsOpen(false)} />}
    {createOpen && <CreateProject pipeline={pipeline} name={newName} setName={setNewName} busy={busy} onClose={() => setCreateOpen(false)} onCreate={createProject} />}
    {sourceFormOpen && <SourceForm form={sourceForm} setForm={setSourceForm} file={sourceFile} setFile={setSourceFile} busy={busy} onClose={() => setSourceFormOpen(false)} onSubmit={registerSource} />}
  </div>;
}

function LoadingState() { return <div className="empty-state loading-state"><LoaderCircle className="spin" size={30} /><strong>제작 엔진 연결 확인 중</strong><p>프로젝트와 능력을 불러오고 있습니다.</p></div>; }

function EmptyProject({ pipeline, onCreate }: { pipeline: Pipeline; onCreate: () => void }) { const active = PIPELINES[pipeline]; return <div className="empty-state"><div className="empty-orbit"><Clapperboard size={29} /></div><div className="eyebrow">{active.eyebrow}</div><h2>첫 장면을 위한 프로젝트를 만드세요</h2><p>공통 작업실에서 대본을 쪼개고, 소재를 찾고, 권리를 확인한 뒤 기존 렌더 작업실로 넘깁니다.</p><button className="button primary large" onClick={onCreate}><Plus size={17} />{active.name} 프로젝트 시작</button><div className="empty-meta"><span>01 대본</span><ArrowRight size={14} /><span>03 소재</span><ArrowRight size={14} /><span>08 인계</span></div></div>; }

type StageContentProps = { stage: StageId; project: Project; pipeline: Pipeline; script: string; setScript: React.Dispatch<React.SetStateAction<string>>; analysis: { shots: Shot[]; suggestions: string[]; revision?: number } | null; setAnalysis: React.Dispatch<React.SetStateAction<{ shots: Shot[]; suggestions: string[]; revision?: number } | null>>; busy: boolean; saveScript: () => void; analyzeScript: () => void; query: string; setQuery: React.Dispatch<React.SetStateAction<string>>; searchMaterials: () => void; wiseResults: Candidate[]; youtubeResults: Candidate[]; sources: Source[]; sourceFilter: 'all' | 'evidence' | 'context' | 'broll' | 'character'; setSourceFilter: React.Dispatch<React.SetStateAction<'all' | 'evidence' | 'context' | 'broll' | 'character'>>; selectedShot: string; setSelectedShot: React.Dispatch<React.SetStateAction<string>>; selectedSource: string; setSelectedSource: React.Dispatch<React.SetStateAction<string>>; bindIn: string; setBindIn: React.Dispatch<React.SetStateAction<string>>; bindOut: string; setBindOut: React.Dispatch<React.SetStateAction<string>>; bindMode: string; setBindMode: React.Dispatch<React.SetStateAction<string>>; bindNotes: string; setBindNotes: React.Dispatch<React.SetStateAction<string>>; onBind: (shotId: string, sourceId: string, inSeconds?: number, outSeconds?: number, visualMode?: string, notes?: string) => void; onOpenSource: () => void; onIndexWise: () => void; wiseJob: { id: string; status: string; source_count?: number; reason?: string } | null; composition: { background_id: string; character_id: string; x: number; y: number; scale: number; duration: number }; setComposition: React.Dispatch<React.SetStateAction<{ background_id: string; character_id: string; x: number; y: number; scale: number; duration: number }>>; compose: () => void; conformAfter: string; setConformAfter: React.Dispatch<React.SetStateAction<string>>; conformNote: string; setConformNote: React.Dispatch<React.SetStateAction<string>>; factsConfirmed: boolean; setFactsConfirmed: React.Dispatch<React.SetStateAction<boolean>>; conform: () => void; onExport: () => void };

function StageContent(props: StageContentProps & { apiBase: string; compositePreview: CompositePreview | null; handoff: HandoffPacket | null; youtubeMessage: string }) {
  const { stage } = props;
  if (stage === 'intake') return <IntakeStage {...props} />;
  if (stage === 'analyze') return <AnalyzeStage {...props} />;
  if (stage === 'materials') return <><MaterialsStage {...props} /><QuotaFallback message={props.youtubeMessage} query={props.query} /></>;
  if (stage === 'rights') return <RightsStage {...props} />;
  if (stage === 'bind') return <BindStage {...props} />;
  if (stage === 'composite') return <CompositePreviewStage {...props} />;
  if (stage === 'conform') return <ConformStage {...props} />;
  return <ExportStageWithHandoff {...props} />;
}

function IntakeStage({ project, pipeline, script, setScript, busy, saveScript, analyzeScript }: StageContentProps) { return <div className="stage-layout"><section className="primary-card"><SectionKicker number="01" label="대본 입력" /><h2>장면을 만들기 전에<br /><em>근거의 문장</em>을 고정합니다.</h2><p className="lede">{pipeline === 'newsroom' ? '사실·출처·추정을 한 문장 안에서 섞지 마세요. 화면은 확인된 범위에 맞춰 설계됩니다.' : '제품의 효능을 넓혀 쓰기보다 확인 가능한 사용 장면을 적으세요. 화면이 대본의 빈칸을 채우지 않습니다.'}</p><label className="field-label">{pipeline === 'newsroom' ? '사건 대본 / 사실 메모' : '상품 대본 / 제품 근거'}<textarea className="script-editor" value={script} onChange={(event) => setScript(event.target.value)} rows={10} placeholder={initialScript[pipeline]} /></label><div className="editor-footer"><span>{script.length}자 · 저장 전 초안</span><div className="button-group"><button className="button" disabled={busy || !script.trim()} onClick={saveScript}><Check size={16} />대본 저장</button><button className="button primary" disabled={busy || !script.trim()} onClick={analyzeScript}><Sparkles size={16} />샷 분석 시작<ArrowRight size={15} /></button></div></div></section><section className="secondary-card"><InfoBlock icon={<LockKeyhole size={17} />} title="최근 변경" body="소재를 바꾸면 대본과 음성을 다시 확인하세요. 저장할 때마다 최신 revision이 기록됩니다." /><InfoBlock icon={<Film size={17} />} title="먼저 필요한 것" body="대본의 각 문장이 어떤 화면을 요구하는지 확인해야 소재 검색이 시작됩니다." /><div className="small-spec"><span>현재 포맷</span><strong>{PIPELINES[pipeline].fps} · 9:16</strong></div><div className="small-spec"><span>프로젝트 revision</span><strong>{project.revision}</strong></div></section></div>; }

function AnalyzeStage({ project, analysis, setAnalysis, busy, analyzeScript, setQuery, pipeline }: StageContentProps) { const shots = analysis?.shots?.length ? analysis.shots : project.shots || []; return <div className="stage-layout"><section className="primary-card"><SectionKicker number="02" label="샷 분석" /><div className="section-title-row"><div><h2>대본을 <em>화면 단위</em>로 나눕니다.</h2><p className="lede">각 문장에 필요한 화면과 검색어를 확인한 뒤, 소재 탐색 단계에서 후보를 직접 검토합니다.</p></div><button className="button" disabled={busy} onClick={analyzeScript}><RefreshCw size={15} />다시 분석</button></div>{shots.length ? <div className="shot-list">{shots.map((shot, index) => <ShotRow key={shot.id || index} shot={shot} index={index} onUseQuery={(value) => setQuery(value)} />)}</div> : <div className="inline-empty"><Sparkles size={20} /><span>아직 분석 결과가 없습니다. 대본 입력 단계에서 분석을 시작하세요.</span></div>}{analysis?.suggestions?.length ? <div className="suggestion-box"><span className="eyebrow">SCRIPT CONFORM SUGGESTIONS</span>{analysis.suggestions.map((item) => <p key={item}><span>↳</span>{item}</p>)}</div> : null}</section><section className="secondary-card"><InfoBlock icon={<Sparkles size={17} />} title="분석 결과의 역할" body="문장 단위 초안과 필요한 장면·검색어를 확인하고 수정합니다. 최종 사실 문장은 사람이 잠급니다." /><div className="method-card"><div className="method-badge coral">A</div><strong>현실 배경 + 2D 인물</strong><p>사건 장소의 질감을 살릴 때</p></div><div className="method-card"><div className="method-badge olive">B</div><strong>정보 움직임</strong><p>지도·시간선·문서로 설명할 때</p></div></section></div>; }

function ShotRow({ shot, index, onUseQuery }: { shot: Shot; index: number; onUseQuery: (value: string) => void }) { const intent = shot.visual_intent || shot.required_visual_intent || '화면 조건 확인'; return <div className="shot-row"><span className="shot-number">{String(index + 1).padStart(2, '0')}</span><div className="shot-copy"><strong>{shot.label || `샷 ${index + 1}`}</strong><p>{shot.text || '이 샷에 필요한 화면 설명이 아직 없습니다.'}</p>{shot.query && <small className="shot-query">검색어 · {shot.query}</small>}</div><span className="shot-type">{intent}</span>{shot.query && <button className="shot-search-link" onClick={() => onUseQuery(shot.query || '')}>이 검색어로 찾기</button>}<span className="shot-duration">{shot.duration ? `${shot.duration.toFixed(1)}s` : '—'}</span></div>; }

function MaterialsStage({ query, setQuery, searchMaterials, wiseResults, youtubeResults, busy, sources, onOpenSource, onIndexWise, wiseJob, selectedSource, setSelectedSource, selectedShot, setSelectedShot, project }: StageContentProps) { return <div className="stage-layout materials-layout"><section className="primary-card"><SectionKicker number="03" label="소재 탐색" /><h2>빈 화면을 <em>후보의 언어</em>로 바꿉니다.</h2><p className="lede">먼저 보유 라이브러리를 찾고, 부족한 부분만 YouTube CC 후보와 WISE 타임스탬프로 확장합니다. 후보는 자동 승인이 아닙니다.</p><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchMaterials(); }} placeholder="예: 비 내리는 골목 CCTV, 접이식 수납함 손 동작" /><button className="button primary" disabled={busy || !query.trim()} onClick={searchMaterials}>{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}검색</button></div><div className="results-grid"><ResultColumn title="WISE · 로컬 장면 검색" caption="내가 확보한 원본 컬렉션 안에서 찾습니다." results={wiseResults} onSelect={(result) => { setSelectedSource(result.id || ''); setSelectedShot(selectedShot || project.shots?.[0]?.id || ''); }} selected={selectedSource} tone="coral" /><ResultColumn title="YouTube · CC BY 후보" caption="출처와 라이선스를 확인한 뒤 등록합니다." results={youtubeResults} onSelect={(result) => { setSelectedSource(result.id || result.source_url || ''); setSelectedShot(selectedShot || project.shots?.[0]?.id || ''); }} selected={selectedSource} tone="olive" /></div>{selectedSource && <div className="selection-note"><Check size={15} /><span><strong>{sources.find((source) => source.id === selectedSource)?.title || '검색 후보'} 선택됨</strong>{selectedShot ? ' · 05 샷 연결에서 시작·끝 구간을 지정하세요.' : ' · 먼저 02 샷 분석에서 연결할 샷을 만드세요.'}</span></div>}</section><section className="secondary-card"><div className="side-action-title"><div><span className="eyebrow">SOURCE LIBRARY</span><h3>확보한 소재</h3></div><button className="plus-button large-plus" onClick={onOpenSource}><Plus size={17} /></button></div>{sources.length ? sources.slice(0, 6).map((source) => <button className={`source-mini ${selectedSource === source.id ? 'selected' : ''}`} key={source.id} onClick={() => setSelectedSource(source.id)}><span className="source-type">{source.media_type === 'video' ? 'VID' : 'IMG'}</span><span><strong>{source.title}</strong><small>{source.role || '미분류'} · {source.license || '권리 기록 없음'}</small></span><ChevronRight size={14} /></button>) : <div className="inline-empty compact"><Box size={19} /><span>등록된 소재가 없습니다.</span></div>}<button className="button full-width" onClick={onOpenSource}><Upload size={15} />소재 직접 등록</button><button className="button full-width" disabled={busy || ['queued', 'running'].includes(wiseJob?.status || '')} onClick={onIndexWise}><Sparkles size={15} />{wiseJob?.status === 'ready' ? 'WISE 색인 완료' : wiseJob?.status === 'failed' ? 'WISE 색인 다시 시작' : wiseJob ? `WISE 색인 ${wiseJob.status === 'running' ? '진행 중' : '대기 중'}` : '등록 소재 WISE 색인'}</button>{wiseJob?.reason && <p className="helper">{wiseJob.reason}</p>}</section></div>; }

function ResultColumn({ title, caption, results, onSelect, selected, tone }: { title: string; caption: string; results: Candidate[]; onSelect: (result: Candidate) => void; selected: string; tone: Tone }) { return <div className={`result-column result-${tone}`}><div className="result-heading"><div><strong>{title}</strong><small>{caption}</small></div><span>{results.length}</span></div>{results.length ? results.slice(0, 5).map((result, index) => <button key={result.id || result.source_url || index} className={`result-card ${selected === (result.id || result.source_url) ? 'selected' : ''}`} onClick={() => onSelect(result)}><div className="result-thumb">{result.thumbnail_url ? <img src={result.thumbnail_url} alt="" /> : result.role === 'character' ? <ImagePlus size={19} /> : <Film size={19} />}</div><span className="result-copy"><strong>{result.title || '제목 없는 후보'}</strong><small>{result.creator || result.url || result.source_url || '로컬 후보'} · {result.start !== undefined ? `${formatTime(result.start)}–${formatTime(result.end)}` : result.license || '권리 확인 필요'}</small></span><ChevronRight size={14} /></button>) : <div className="result-empty"><Search size={18} /><span>검색 결과가 여기에 표시됩니다.</span></div>}</div>; }

function RightsStage({ sources, sourceFilter, setSourceFilter, onOpenSource }: StageContentProps) { const visible = sourceFilter === 'all' ? sources : sources.filter((source) => source.context === sourceFilter || source.role === sourceFilter); return <div className="stage-layout"><section className="primary-card"><SectionKicker number="04" label="권리 확인" /><h2>권리는 <em>소스별로</em> 기록합니다.</h2><p className="lede">CC BY라고 적혀 있어도 원본 취득, 변환, ImageGen 입력, Omni 입력 권한은 각각 확인합니다. 창작적 편집 여부와 저작권 허락은 별도입니다.</p><div className="filter-tabs">{(['all', 'evidence', 'context', 'broll', 'character'] as const).map((filter) => <button className={sourceFilter === filter ? 'active' : ''} key={filter} onClick={() => setSourceFilter(filter)}>{filter === 'all' ? '전체' : filter === 'evidence' ? '사건 증거' : filter === 'context' ? '맥락' : filter === 'broll' ? 'B-roll' : '캐릭터'}</button>)}</div>{visible.length ? <div className="rights-table"><div className="rights-header"><span>소재</span><span>역할</span><span>권리 근거</span><span>입력 범위</span></div>{visible.map((source) => <div className="rights-row" key={source.id}><div className="rights-name"><span className={`check-circle ${source.rights_confirmed ? 'checked' : ''}`}>{source.rights_confirmed && <Check size={12} />}</span><span><strong>{source.title}</strong><small>{source.creator || '제작자 미기록'}</small></span></div><span className="table-tag">{source.role || '미분류'}</span><span className={source.rights_confirmed ? 'rights-ok' : 'rights-pending'}>{source.rights_confirmed ? '확인됨' : '확인 필요'}</span><span className="input-scope">{source.allow_transform ? '변환' : ''}{source.allow_imagegen ? ' · ImageGen' : ''}{source.allow_omni ? ' · Omni' : !source.allow_transform && !source.allow_imagegen && !source.allow_omni ? '편집만' : ''}</span></div>)}</div> : <div className="inline-empty"><ShieldCheck size={21} /><span>아직 등록된 소재가 없습니다. 후보를 실제 소스로 등록하세요.</span></div>}<button className="button" onClick={onOpenSource}><Plus size={15} />권리 카드 추가</button></section><section className="secondary-card"><InfoBlock icon={<ShieldCheck size={17} />} title="검수 기준" body="사용 권리를 확인한 원본을 제작 소재로 선택하세요." /><div className="rights-legend"><div><span className="legend-dot coral" />사건 증거</div><p>실제 사건의 증거로 주장하지 않고, 확인된 원본에만 사용</p><div><span className="legend-dot olive" />일반 맥락</div><p>실제 현장·증거로 승격하지 않는 생성·스톡 화면</p></div><div className="license-note"><LockKeyhole size={15} />라이선스 URL과 확인 메모를 함께 보존합니다.</div></section></div>; }

function BindStage({ project, sources, selectedShot, setSelectedShot, selectedSource, setSelectedSource, bindIn, setBindIn, bindOut, setBindOut, bindMode, setBindMode, bindNotes, setBindNotes, onBind }: StageContentProps) { const shots = project.shots || []; const bound = shots.find((shot) => shot.id === selectedShot); const selected = sources.find((source) => source.id === selectedSource); return <div className="stage-layout"><section className="primary-card"><SectionKicker number="05" label="샷 연결" /><h2>대본의 문장과 <em>소재의 시간</em>을 잇습니다.</h2><p className="lede">샷 하나에는 한 가지 행동과 인접 상태만 연결합니다. WISE 후보도 원본을 직접 재생해 시작·끝을 확인한 뒤 연결합니다.</p>{shots.length ? <div className="bind-grid"><div className="bind-list"><div className="bind-list-title">분석된 샷 <span>{shots.length}</span></div>{shots.map((shot, index) => <button className={`bind-shot ${selectedShot === shot.id ? 'selected' : ''}`} key={shot.id} onClick={() => setSelectedShot(shot.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{shot.label || `샷 ${index + 1}`}</strong><small>{shot.material_status || (shot.source_id ? '소스 연결됨' : '소재 대기')}</small></button>)}</div><div className="bind-editor"><div className="bind-editor-head"><span className="eyebrow">SHOT MATERIAL</span><span>{selected?.duration ? `원본 ${selected.duration.toFixed(1)}s` : '원본 길이 확인 필요'}</span></div>{selectedShot ? <><p>{bound?.text || '선택한 샷의 화면 조건을 확인하세요.'}</p><label className="field-label">연결할 소재<select value={selectedSource} onChange={(event) => setSelectedSource(event.target.value)}><option value="">소재 선택</option>{sources.filter((source) => source.rights_confirmed || source.context !== 'evidence').map((source) => <option key={source.id} value={source.id}>{source.title} · {source.role || '미분류'}</option>)}</select></label><div className="form-grid bind-timing"><label className="field-label">시작 (초)<input type="number" min="0" step="0.01" value={bindIn} onChange={(event) => setBindIn(event.target.value)} placeholder="0.00" /></label><label className="field-label">끝 (초)<input type="number" min="0.01" step="0.01" value={bindOut} onChange={(event) => setBindOut(event.target.value)} placeholder="예: 3.00" /></label><label className="field-label">화면 방식<select value={bindMode} onChange={(event) => setBindMode(event.target.value)}><option value="real-2d">현실 배경 + 2D</option><option value="2.5d">2.5D</option><option value="3d">3D</option><option value="source">원본 그대로</option></select></label><label className="field-label">메모<input value={bindNotes} onChange={(event) => setBindNotes(event.target.value)} placeholder="연속 동작, 프레임 메모" /></label></div><button className="button primary" disabled={!selectedSource} onClick={() => onBind(selectedShot, selectedSource, bindIn ? Number(bindIn) : undefined, bindOut ? Number(bindOut) : undefined, bindMode, bindNotes)}><Link2 size={15} />이 샷에 연결</button></> : <div className="inline-empty"><MoveRight size={19} />왼쪽에서 샷을 선택하세요.</div>}</div></div> : <div className="inline-empty"><Sparkles size={20} />먼저 대본 분석을 실행하면 샷이 생깁니다.</div>}</section><section className="secondary-card"><InfoBlock icon={<Link2 size={17} />} title="소스와 샷은 별도" body="한 소스를 여러 샷에서 참조할 수 있지만, 각 샷의 타임스탬프와 시각적 역할은 따로 기록됩니다." /><div className="small-spec"><span>연결된 샷</span><strong>{shots.filter((shot) => shot.source_id).length} / {shots.length}</strong></div><div className="small-spec"><span>소스 라이브러리</span><strong>{sources.length}개</strong></div></section></div>; }

function CompositeStage({ sources, composition, setComposition, compose, busy }: StageContentProps) { const backgrounds = sources.filter((source) => source.role === 'context' || source.role === 'broll' || source.media_type === 'video'); const characters = sources.filter((source) => source.role === 'character'); return <div className="stage-layout"><section className="primary-card"><SectionKicker number="06" label="2D 합성" /><h2>현실 장소 위에 <em>필요한 움직임만</em> 얹습니다.</h2><p className="lede">실제 배경의 카메라 축과 그림자를 유지합니다. 인물·차량·소품은 별도 마스터로 관리하고, 합성 위치와 스케일을 기록합니다.</p><div className="composite-preview"><div className="preview-grid" /><div className="preview-label">PLACEMENT GUIDE · ORIGINAL PIXELS</div><div className="preview-crosshair" style={{ left: `${(composition.x / 1080) * 100}%`, top: `${(composition.y / 1920) * 100}%`, transform: `translate(-50%, -50%) scale(${composition.scale})` }}><span className="character-placeholder"><Box size={23} /></span><small>2D CHARACTER</small></div><div className="preview-axis x" /><div className="preview-axis y" /></div><div className="form-grid"><label className="field-label">현실 배경<select value={composition.background_id} onChange={(event) => setComposition((current) => ({ ...current, background_id: event.target.value }))}><option value="">배경 선택</option>{backgrounds.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label className="field-label">2D 캐릭터 / 소품<select value={composition.character_id} onChange={(event) => setComposition((current) => ({ ...current, character_id: event.target.value }))}><option value="">캐릭터 선택</option>{characters.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label className="field-label">X 위치 (px)<input type="number" min="0" max="10000" value={composition.x} onChange={(event) => setComposition((current) => ({ ...current, x: Number(event.target.value) }))} /></label><label className="field-label">Y 위치 (px)<input type="number" min="0" max="10000" value={composition.y} onChange={(event) => setComposition((current) => ({ ...current, y: Number(event.target.value) }))} /></label><label className="field-label">스케일<input type="number" min="0.1" max="4" step="0.1" value={composition.scale} onChange={(event) => setComposition((current) => ({ ...current, scale: Number(event.target.value) }))} /></label><label className="field-label">샷 길이 (초)<input type="number" min="1.5" max="3.5" step="0.1" value={composition.duration} onChange={(event) => setComposition((current) => ({ ...current, duration: Number(event.target.value) }))} /></label></div><button className="button primary" disabled={busy || !composition.background_id || !composition.character_id} onClick={compose}><ImagePlus size={16} />합성 미리보기 만들기</button></section><section className="secondary-card"><InfoBlock icon={<Box size={17} />} title="입력 분리" body="배경·캐릭터·소품은 각각 provenance를 가진 마스터로 등록합니다. 이 단계는 렌더 권한을 대신 승인하지 않습니다." /><div className="small-spec"><span>배경 후보</span><strong>{backgrounds.length}개</strong></div><div className="small-spec"><span>캐릭터 후보</span><strong>{characters.length}개</strong></div><div className="method-card dark"><strong>권장 사용</strong><p>실사 장소 + 평면 캐릭터 + 최소한의 그림자</p></div></section></div>; }

function ConformStage({ project, conformAfter, setConformAfter, conformNote, setConformNote, factsConfirmed, setFactsConfirmed, conform }: StageContentProps) { return <div className="stage-layout"><section className="primary-card"><SectionKicker number="07" label="대본 다듬기" /><h2>화면에 맞게 다듬고,<br /><em>사실은 그대로</em> 둡니다.</h2><p className="lede">소재에 없는 숫자·인물·행동을 대본에 새로 만들지 않습니다. 바뀐 표현과 근거를 함께 기록해 다시 검토합니다.</p><div className="before-after"><div><span className="eyebrow">BEFORE · SCRIPT</span><p>{project.script || '저장된 대본이 없습니다.'}</p></div><ArrowRight size={18} /><div><span className="eyebrow">AFTER · SCRIPT</span><textarea rows={7} value={conformAfter} onChange={(event) => setConformAfter(event.target.value)} placeholder="소재에 맞춰 표현을 다듬은 전체 대본" /><label className="field-label conform-note">변경 메모<textarea rows={3} value={conformNote} onChange={(event) => setConformNote(event.target.value)} placeholder="어떤 문장을 왜 다듬었는지" /></label></div></div><label className="attestation"><input type="checkbox" checked={factsConfirmed} onChange={(event) => setFactsConfirmed(event.target.checked)} /> 다듬은 대본의 사실 관계를 다시 확인했습니다.</label><button className="button primary" disabled={!conformAfter.trim() || !conformNote.trim()} onClick={conform}><RefreshCw size={16} />대본 다듬기 기록</button></section><section className="secondary-card"><InfoBlock icon={<CircleAlert size={17} />} title="다음 검수" body="대본 다듬기는 자동 승인 단계가 아닙니다. 최종 내레이션·제목·렌더 권위는 기존 화면에서 따로 승인합니다." /><div className="small-spec"><span>현재 상태</span><strong>{statusLabel(project.conform?.status)}</strong></div><div className="small-spec"><span>마지막 변경 revision</span><strong>{project.conform?.revision || '—'}</strong></div></section></div>; }

function ExportStage({ project, onExport, pipeline }: StageContentProps) { const linked = (project.shots || []).filter((shot) => shot.source_id).length; return <div className="stage-layout"><section className="primary-card"><SectionKicker number="08" label="제작 인계" /><h2>출처와 샷 정보를<br /><em>한 묶음으로 넘깁니다.</em></h2><p className="lede">이 ZIP은 제작 인계용입니다. 영상 업로드·게시·최종 승인 없이, 지금까지 확인한 근거와 소재 연결만 내보냅니다.</p><div className="export-summary"><SummaryCell label="파이프라인" value={PIPELINES[pipeline].name} /><SummaryCell label="샷 연결" value={`${linked} / ${(project.shots || []).length}`} /><SummaryCell label="소스" value={`${(project.sources || []).length}개`} /><SummaryCell label="출력" value={PIPELINES[pipeline].fps} /></div><div className="export-checks"><div><BadgeCheck size={16} /><span>대본 revision {project.revision} 기록</span></div><div><BadgeCheck size={16} /><span>소재 provenance 및 권리 필드 포함</span></div><div><BadgeCheck size={16} /><span>자동 업로드·게시 없음</span></div></div><button className="button primary large" disabled={!project.id} onClick={onExport}><Download size={17} />인계 ZIP 다운로드</button></section><section className="secondary-card"><InfoBlock icon={<ExternalLink size={17} />} title="다음 제작 화면" body="제목·음성·렌더는 각 파이프라인의 기존 화면에서 계속합니다." /><a className="native-workbench" href={PIPELINES[pipeline].link} target="_blank" rel="noreferrer"><span>{PIPELINES[pipeline].native}</span><ExternalLink size={14} /></a><div className="export-warning"><LockKeyhole size={15} /><span>이 화면의 완료 표시는 제작 인계만 뜻합니다.</span></div></section></div>; }

function SummaryCell({ label, value }: { label: string; value: string }) { return <div className="summary-cell"><span>{label}</span><strong>{value}</strong></div>; }
function SectionKicker({ number, label }: { number: string; label: string }) { return <div className="section-kicker"><span>{number}</span><span>{label}</span><i /></div>; }
function InfoBlock({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="info-block"><span className="info-icon">{icon}</span><div><strong>{title}</strong><p>{body}</p></div></div>; }

function SettingsPanel({ apiBase, setApiBase, capabilities, engine, onReconnect, onClose }: { apiBase: string; setApiBase: React.Dispatch<React.SetStateAction<string>>; capabilities: Capability[]; engine: EngineStatus; onReconnect: () => void; onClose: () => void }) { const [draft, setDraft] = useState(apiBase); const [error, setError] = useState(''); return <div className="drawer-backdrop" onClick={onClose}><aside className="settings-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">LOCAL CONNECTION</div><h2>연결 설정</h2></div><button className="icon-button" onClick={onClose} aria-label="설정 닫기"><X size={18} /></button></div><p className="drawer-lede">Vercel 화면은 브라우저에서 PC의 로컬 제작 엔진에 연결합니다. 저장하는 값은 loopback API 주소와 선택 ID뿐입니다.</p><label className="field-label">공통 API 주소<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>{error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}<div className="drawer-actions"><button className="button" onClick={() => { setDraft('http://127.0.0.1:8766'); setError(''); }}>기본값 복원</button><button className="button primary" onClick={() => { if (!isLoopbackOrigin(draft)) { setError('localhost 또는 127.0.0.1 주소만 허용됩니다.'); return; } setApiBase(draft); onReconnect(); onClose(); }}>저장 후 연결</button></div><div className="drawer-divider" /><div className="drawer-status"><div className="drawer-status-head"><span>엔진</span><strong className={engine.connected ? 'ready' : 'offline'}>{engine.connected ? 'READY' : 'OFFLINE'}</strong></div><p>{engine.name || 'PC local engine'}</p><StatusRows capabilities={capabilities} engine={engine} /></div><div className="drawer-note"><CloudOff size={15} />배포된 화면이 로컬 엔진에 닿지 않으면 오프라인으로 표시됩니다. 연결을 확인한 뒤 다시 시도하세요.</div></aside></div>; }
function StatusRows({ capabilities, engine }: { capabilities: Capability[]; engine: EngineStatus }) { const rows = capabilities.length ? capabilities : [{ name: 'WISE', status: engine.wise === 'ready' ? 'ready' : 'unknown', detail: '로컬 장면 검색' }, { name: 'FFmpeg', status: engine.ffmpeg === 'ready' ? 'ready' : 'unknown', detail: '로컬 렌더' }]; return <div className="status-list">{rows.map((item) => <div className="status-list-row" key={item.name}><span className={`status-dot ${item.status === 'ready' ? '' : 'off'}`} /><span>{item.name}<small>{item.detail}</small></span><strong>{statusLabel(item.status)}</strong></div>)}</div>; }

function CreateProject({ pipeline, name, setName, busy, onClose, onCreate }: { pipeline: Pipeline; name: string; setName: React.Dispatch<React.SetStateAction<string>>; busy: boolean; onClose: () => void; onCreate: () => void }) { return <div className="modal-backdrop" onClick={onClose}><form className="modal" onSubmit={(event) => { event.preventDefault(); onCreate(); }} onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button><div className="modal-symbol"><Plus size={20} /></div><div className="eyebrow">NEW PROJECT · {PIPELINES[pipeline].name}</div><h2>새로운 장면의 이름</h2><p>대본·소재·샷 정보는 이 프로젝트 revision 안에서 함께 추적됩니다.</p><label className="field-label">프로젝트 이름<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={pipeline === 'newsroom' ? '예: 비 오는 밤, 비어 있던 집' : '예: 접이식 수납함 1화'} /></label><button className="button primary full-width" disabled={busy || !name.trim()}><Plus size={16} />프로젝트 만들기</button></form></div>; }

type SourceFormProps = { form: { title: string; source_url: string; creator: string; license: string; license_url: string; rights_evidence: string; role: string; context: string; rights_confirmed: boolean; allow_transform: boolean; allow_imagegen: boolean; allow_omni: boolean }; setForm: React.Dispatch<React.SetStateAction<SourceFormProps['form']>>; file: File | null; setFile: React.Dispatch<React.SetStateAction<File | null>>; busy: boolean; onClose: () => void; onSubmit: () => void };
function SourceForm({ form, setForm, file, setFile, busy, onClose, onSubmit }: SourceFormProps) { const update = (key: keyof SourceFormProps['form'], value: string | boolean) => setForm((current) => ({ ...current, [key]: value })); return <div className="modal-backdrop" onClick={onClose}><form className="modal source-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button><div className="eyebrow">SOURCE REGISTER</div><h2>소재 카드 등록</h2><p>원본과 권리 근거를 함께 적습니다. 업로드 권한은 별도 입력 범위로 기록됩니다.</p><div className="source-form-grid"><label className="field-label wide">소재 제목<input required value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 2024년 3월 골목 CCTV" /></label><label className="field-label">원본 URL<input value={form.source_url} onChange={(event) => update('source_url', event.target.value)} placeholder="https://…" /></label><label className="field-label">제작자 / 채널<input value={form.creator} onChange={(event) => update('creator', event.target.value)} /></label><label className="field-label">라이선스<select value={form.license} onChange={(event) => update('license', event.target.value)}><option value="CC-BY">CC BY</option><option value="CC0">CC0</option><option value="public-domain">Public domain</option><option value="permission">별도 허락</option><option value="owned">직접 보유</option><option value="unknown">확인 전</option></select></label><label className="field-label">라이선스 URL<input value={form.license_url} onChange={(event) => update('license_url', event.target.value)} /></label><label className="field-label">역할<select value={form.role} onChange={(event) => update('role', event.target.value)}><option value="evidence">사건 증거</option><option value="context">일반 맥락</option><option value="broll">B-roll</option><option value="character">2D 캐릭터 / 소품</option></select></label><label className="field-label">분류<select value={form.context} onChange={(event) => update('context', event.target.value)}><option value="actual-case-evidence">실제 사건 증거</option><option value="institutional-context">기관 맥락</option><option value="generic-context">일반 맥락</option><option value="generated">생성 이미지</option></select></label><label className="field-label wide">권리 확인 메모<textarea rows={3} value={form.rights_evidence} onChange={(event) => update('rights_evidence', event.target.value)} placeholder="원본 페이지에서 확인한 문구, 확인 시각, 취득 경로" /></label><label className="file-drop wide"><Upload size={18} /><span>{file ? file.name : '원본 영상·이미지를 선택하세요'}</span><input type="file" accept="video/*,image/*,audio/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div><div className="checkbox-grid"><label><input type="checkbox" checked={form.rights_confirmed} onChange={(event) => update('rights_confirmed', event.target.checked)} />권리 근거를 확인함</label><label><input type="checkbox" checked={form.allow_transform} onChange={(event) => update('allow_transform', event.target.checked)} />편집·변환 허용</label><label><input type="checkbox" checked={form.allow_imagegen} onChange={(event) => update('allow_imagegen', event.target.checked)} />ImageGen 입력 허용</label><label><input type="checkbox" checked={form.allow_omni} onChange={(event) => update('allow_omni', event.target.checked)} />Omni 입력 허용</label></div><div className="modal-actions"><button className="button" type="button" onClick={onClose}>취소</button><button className="button primary" disabled={busy || !form.title.trim()}><ShieldCheck size={16} />소재 카드 저장</button></div></form></div>; }

function QuotaFallback({ message, query }: { message: string; query: string }) { if (!message) return null; const link = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} Creative Commons`)}`; return <div className="quota-fallback"><CircleAlert size={16} /><span>{message}</span><a href={link} target="_blank" rel="noreferrer">YouTube CC 검색 열기</a></div>; }

function ExportStageWithHandoff({ project, onExport, pipeline, handoff }: StageContentProps & { handoff: HandoffPacket | null }) {
  const linked = (project.shots || []).filter((shot) => shot.source_id).length;
  const blockers = handoff?.blockers || [];
  return <div className="stage-layout"><section className="primary-card"><SectionKicker number="08" label="제작 인계" /><h2>출처와 샷 정보를<br /><em>한 묶음으로 넘깁니다.</em></h2><p className="lede">이 ZIP은 제작 인계용 검토 패킷입니다. 차단 조건을 확인한 뒤 기존 제작 화면에서 별도 승인을 진행합니다.</p><div className="export-summary"><SummaryCell label="파이프라인" value={PIPELINES[pipeline].name} /><SummaryCell label="샷 연결" value={`${linked} / ${(project.shots || []).length}`} /><SummaryCell label="소스" value={`${(project.sources || []).length}개`} /><SummaryCell label="상태" value={handoff?.status === 'READY_FOR_SEPARATE_REVIEW' ? '별도 검토 준비' : '확인 필요'} /></div>{blockers.length ? <div className="handoff-blockers"><div className="handoff-blockers-title"><CircleAlert size={16} />인계 전 확인할 항목 <strong>{blockers.length}</strong></div><ul>{blockers.slice(0, 10).map((blocker, index) => <li key={`${blocker.code || 'blocker'}-${blocker.shot_id || index}`}>{handoffBlockerLabel(blocker)}{blocker.shot_id ? <small>{blocker.shot_id}</small> : null}</li>)}</ul>{blockers.length > 10 && <p className="helper">외 {blockers.length - 10}개 항목은 ZIP 안의 handoff 기록에서 확인하세요.</p>}</div> : <div className="handoff-ready"><BadgeCheck size={16} />차단 조건이 없습니다. 기존 제작 화면의 별도 검토로 넘길 수 있습니다.</div>}<div className="export-checks"><div><BadgeCheck size={16} /><span>대본 revision {project.revision} 기록</span></div><div><BadgeCheck size={16} /><span>소재 provenance 및 권리 필드 포함</span></div><div><BadgeCheck size={16} /><span>자동 업로드·게시 없음</span></div></div><button className="button primary large" disabled={!project.id} onClick={onExport}><Download size={17} />검토용 인계 ZIP 다운로드</button></section><section className="secondary-card"><InfoBlock icon={<ExternalLink size={17} />} title="다음 제작 화면" body="제목·음성·렌더는 각 파이프라인의 기존 화면에서 계속합니다." /><a className="native-workbench" href={PIPELINES[pipeline].link} target="_blank" rel="noreferrer"><span>{PIPELINES[pipeline].native}</span><ExternalLink size={14} /></a><div className="export-warning"><LockKeyhole size={15} /><span>이 화면의 상태는 최종 승인이나 게시 완료를 뜻하지 않습니다.</span></div></section></div>;
}

function CompositePreviewStage({ apiBase, compositePreview, sources, composition, setComposition, compose, busy }: StageContentProps & { apiBase: string; compositePreview: CompositePreview | null }) {
  const backgrounds = sources.filter((source) => source.role === 'context' || source.role === 'broll' || source.media_type === 'video');
  const characters = sources.filter((source) => source.role === 'character');
  const previewSrc = compositePreview?.file_url ? `${apiBase.replace(/\/$/, '')}${compositePreview.file_url}` : '';
  return <div className="stage-layout"><section className="primary-card"><SectionKicker number="06" label="2D 합성" /><h2>현실 장소 위에 <em>필요한 움직임만</em> 얹습니다.</h2><p className="lede">실제 배경의 카메라 축과 그림자를 유지합니다. 인물·차량·소품은 별도 마스터로 관리하고, 합성 위치와 스케일을 기록합니다.</p>{previewSrc ? <div className="composite-video"><video controls preload="metadata" src={previewSrc} /><a className="video-download" href={previewSrc} download>MP4 다운로드</a></div> : <div className="composite-preview"><div className="preview-grid" /><div className="preview-label">PLACEMENT GUIDE · FIT</div><div className="preview-crosshair" style={{ left: `${(composition.x / 1080) * 100}%`, top: `${(composition.y / 1920) * 100}%`, transform: `translate(-50%, -50%) scale(${composition.scale})` }}><span className="character-placeholder"><Box size={23} /></span><small>2D CHARACTER</small></div><div className="preview-axis x" /><div className="preview-axis y" /></div>}<p className="helper composite-coordinate-note">좌표는 선택한 배경의 원본 픽셀 기준입니다. 최종 세로 편집은 기존 제작 화면에서 맞춥니다.</p><div className="form-grid"><label className="field-label">현실 배경<select value={composition.background_id} onChange={(event) => setComposition((current) => ({ ...current, background_id: event.target.value }))}><option value="">배경 선택</option>{backgrounds.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label className="field-label">2D 캐릭터 / 소품<select value={composition.character_id} onChange={(event) => setComposition((current) => ({ ...current, character_id: event.target.value }))}><option value="">캐릭터 선택</option>{characters.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label className="field-label">X 위치 (px)<input type="number" min="0" max="10000" value={composition.x} onChange={(event) => setComposition((current) => ({ ...current, x: Number(event.target.value) }))} /></label><label className="field-label">Y 위치 (px)<input type="number" min="0" max="10000" value={composition.y} onChange={(event) => setComposition((current) => ({ ...current, y: Number(event.target.value) }))} /></label><label className="field-label">스케일<input type="number" min="0.1" max="4" step="0.1" value={composition.scale} onChange={(event) => setComposition((current) => ({ ...current, scale: Number(event.target.value) }))} /></label><label className="field-label">샷 길이 (초)<input type="number" min="1.5" max="3.5" step="0.1" value={composition.duration} onChange={(event) => setComposition((current) => ({ ...current, duration: Number(event.target.value) }))} /></label></div><button className="button primary" disabled={busy || !composition.background_id || !composition.character_id} onClick={compose}><ImagePlus size={16} />합성 미리보기 만들기</button></section><section className="secondary-card"><InfoBlock icon={<Box size={17} />} title="입력 분리" body="배경·캐릭터·소품은 각각 provenance를 가진 마스터로 등록합니다. 이 단계는 렌더 권한을 대신 승인하지 않습니다." /><div className="small-spec"><span>배경 후보</span><strong>{backgrounds.length}개</strong></div><div className="small-spec"><span>캐릭터 후보</span><strong>{characters.length}개</strong></div><div className="method-card dark"><strong>권장 사용</strong><p>실사 장소 + 평면 캐릭터 + 최소한의 그림자</p></div></section></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
