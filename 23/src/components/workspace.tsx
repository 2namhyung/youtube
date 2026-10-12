'use client';

import { useMemo, useRef, useState } from 'react';
import { createRecord, editRecord, removeRecord, saveRecordPosition } from '@/app/actions';
import type { Politician, RecordCard, RecordInput } from '@/lib/db';

const CARD_TYPES = ['事实', '발언', '사건', '메모', '데모 메모'];
const COLORS = ['#fff8e9', '#e9f3f1', '#f4e8e8', '#eeeafd', '#f1f0e8'];
const blankInput = (politicianId: number): RecordInput => ({ politicianId, title: '', body: '', type: '메모', eventDate: '', color: COLORS[0], sourceTitle: '', sourceUrl: '', publisher: '', publishedAt: '', license: '확인 필요', verificationStatus: '미확인', sourceNote: '' });

export default function Workspace({ initialPoliticians, initialRecords }: { initialPoliticians: Politician[]; initialRecords: RecordCard[] }) {
  const [politicians] = useState(initialPoliticians);
  const [records, setRecords] = useState(initialRecords);
  const [selectedPoliticianId, setSelectedPoliticianId] = useState(initialPoliticians[0]?.id ?? 0);
  const [selectedId, setSelectedId] = useState<number | null>(initialRecords[0]?.id ?? null);
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 40, y: 32 });
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState<RecordInput>(() => blankInput(initialPoliticians[0]?.id ?? 0));
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const dragRef = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const positionRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const selectedPolitician = politicians.find((person) => person.id === selectedPoliticianId) ?? politicians[0];
  const visibleRecords = useMemo(() => records.filter((record) => record.politician_id === selectedPoliticianId), [records, selectedPoliticianId]);
  const selectedRecord = records.find((record) => record.id === selectedId) ?? visibleRecords[0];

  function openAdd() { setActionError(''); setForm(blankInput(selectedPoliticianId)); setModal('add'); }
  function openEdit(record: RecordCard) {
    const source = record.sources[0];
    setActionError('');
    setForm({ politicianId: record.politician_id, title: record.title, body: record.body, type: record.type, eventDate: record.event_date, color: record.color, sourceTitle: source?.title ?? '', sourceUrl: source?.url ?? '', publisher: source?.publisher ?? '', publishedAt: source?.published_at ?? '', license: source?.license ?? '확인 필요', verificationStatus: source?.verification_status ?? '미확인', sourceNote: source?.note ?? '', positionX: record.position_x, positionY: record.position_y });
    setModal('edit');
  }
  function updateForm<K extends keyof RecordInput>(key: K, value: RecordInput[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setActionError('');
    setSaving(true);
    try {
      if (modal === 'add') {
        const positionX = Math.min(1380, 120 + records.length * 22);
        const positionY = Math.min(740, 105 + records.length * 18);
        const created = await createRecord({ ...form, positionX, positionY });
        setRecords((items) => [...items, created]); setSelectedId(created.id);
      } else if (modal === 'edit' && selectedRecord) {
        await editRecord(selectedRecord.id, form);
        const source = form.sourceTitle || form.sourceUrl
          ? [{ id: selectedRecord.sources[0]?.id ?? Date.now(), record_id: selectedRecord.id, title: form.sourceTitle || '출처 제목 미입력', url: form.sourceUrl, publisher: form.publisher, published_at: form.publishedAt, license: form.license, verification_status: form.verificationStatus, note: form.sourceNote }, ...selectedRecord.sources.slice(1)]
          : selectedRecord.sources;
        setRecords((items) => items.map((item) => item.id === selectedRecord.id ? { ...item, politician_id: form.politicianId, title: form.title.trim(), body: form.body, type: form.type, event_date: form.eventDate, color: form.color, sources: source } : item));
      }
      setModal(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }
  async function deleteSelected() {
    if (!selectedRecord || !window.confirm('이 카드를 삭제할까요?')) return;
    setActionError('');
    try {
      await removeRecord(selectedRecord.id); setRecords((items) => items.filter((item) => item.id !== selectedRecord.id)); setSelectedId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  function onCardDown(event: React.PointerEvent, record: RecordCard) {
    event.stopPropagation();
    setSelectedId(record.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { id: record.id, x: event.clientX, y: event.clientY, ox: record.position_x, oy: record.position_y };
    positionRef.current = { id: record.id, x: record.position_x, y: record.position_y };
  }
  function onCardMove(event: React.PointerEvent) {
    const drag = dragRef.current; if (!drag) return;
    const x = drag.ox + (event.clientX - drag.x) / zoom; const y = drag.oy + (event.clientY - drag.y) / zoom;
    positionRef.current = { id: drag.id, x: Math.max(12, x), y: Math.max(12, y) };
    setRecords((items) => items.map((item) => item.id === drag.id ? { ...item, position_x: Math.max(12, x), position_y: Math.max(12, y) } : item));
  }
  function onCardUp() {
    const drag = dragRef.current; if (!drag) return;
    const position = positionRef.current; if (position) void saveRecordPosition(position.id, position.x, position.y).catch((error) => setActionError(error instanceof Error ? error.message : '카드 위치를 저장하지 못했습니다.'));
    dragRef.current = null;
    positionRef.current = null;
  }
  function onCanvasDown(event: React.PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.record-card, button, input, textarea, select, a, label')) return;
    if (!target.closest('.canvas-stage, .video-frame, .safe-area, .axis-label')) return;
    panRef.current = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onCanvasMove(event: React.PointerEvent) { const drag = panRef.current; if (drag) setPan({ x: drag.ox + event.clientX - drag.x, y: drag.oy + event.clientY - drag.y }); }
  function onCanvasUp() { panRef.current = null; }

  return <main className="app-shell">
    {actionError && !modal && <div role="alert" style={{ position: 'fixed', top: 18, right: 18, zIndex: 20, padding: '10px 14px', borderRadius: 7, background: '#fff1ed', border: '1px solid #e4b8aa', color: '#9f503d', fontSize: 11, boxShadow: '0 8px 24px #3f2a241f' }}>{actionError}<button type="button" onClick={() => setActionError('')} style={{ marginLeft: 10, border: 0, background: 'transparent', color: 'inherit' }}>×</button></div>}
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◈</span><div><strong>아카이브 스튜디오</strong><small>POLITICAL STORYBOARD</small></div></div>
      <nav className="archive-nav" aria-label="아카이브 메뉴"><a href="/studio">VisualMaker 장면 설계</a><a href="/">스토리보드</a><a href="/issues">정책 이슈 후보</a><a href="/graph">그래프 개요</a><a href="/graph/explorer">주장 탐색</a><a href="/sources">수집원 상태</a><a href="/review">검토 큐</a></nav>
      <div className="side-label">인물 아카이브 <span>{politicians.length}</span></div>
      <div className="person-list">{politicians.map((person) => <button className={`person-row ${person.id === selectedPoliticianId ? 'active' : ''}`} key={person.id} onClick={() => { setSelectedPoliticianId(person.id); setSelectedId(null); }}><i style={{ background: person.color }} /><span><b>{person.name}</b><small>{person.role}</small></span><em>›</em></button>)}</div>
      <div className="sidebar-foot"><div className="tiny-title">작업 원칙</div><p>사실 · 출처 · 장면을 한 카드에 묶어두세요. 데모 데이터는 실제 주장으로 사용하지 않습니다.</p><div className="db-status"><span /> 로컬 SQLite 저장 중</div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><div className="crumb">PROJECT / {selectedPolitician?.name ?? '인물 선택'}</div><h1>{selectedPolitician?.name ?? '새 아카이브'} <span>스토리보드</span></h1></div><div className="top-actions"><label className="select-wrap"><span>인물 전환</span><select value={selectedPoliticianId} onChange={(e) => { setSelectedPoliticianId(Number(e.target.value)); setSelectedId(null); }}>{politicians.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><button className="primary-btn" onClick={openAdd}>＋ 카드 추가</button></div></header>
      <div className="workspace-grid">
        <div className="canvas-column"><div className="canvas-toolbar"><div className="toolbar-note"><span className="live-dot" /> 편집 캔버스 <small>16:9 · 안전영역 표시</small></div><div className="zoom-controls"><button onClick={() => setZoom((value) => Math.max(.4, value - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.35, value + .1))}>＋</button><button className="fit-btn" onClick={() => { setZoom(.78); setPan({ x: 40, y: 32 }); }}>맞춤</button></div></div>
          <div className="canvas-viewport" onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp}><div className="canvas-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><div className="video-frame"><div className="safe-area"><span>VIDEO FRAME · 16:9</span><b>안전영역</b><small>이곳에 영상·그래프·사진을 배치하세요</small></div><div className="frame-caption">SOURCE-LED STORYBOARD <span>1920 × 1080</span></div></div><div className="axis-label axis-x">A / VISUAL NARRATIVE</div>{visibleRecords.map((record) => <article key={record.id} className={`record-card ${record.id === selectedId ? 'selected' : ''}`} style={{ left: record.position_x, top: record.position_y, background: record.color }} onPointerDown={(event) => onCardDown(event, record)} onPointerMove={onCardMove} onPointerUp={onCardUp} onClick={() => setSelectedId(record.id)}><div className="card-top"><span>{record.type}</span><small>{record.event_date || '날짜 미정'}</small></div><h3>{record.title}</h3><p>{record.body || '내용을 입력하세요.'}</p><div className="card-foot"><span>{record.sources.length ? '↗ 출처 있음' : '⚠ 출처 추가'}</span><b>#{String(record.id).padStart(2, '0')}</b></div></article>)}</div></div><div className="canvas-hint">드래그하여 카드와 캔버스를 이동 · 휠 대신 우측 컨트롤로 확대</div></div>
        <aside className="inspector">{selectedRecord ? <><div className="inspector-head"><div><small>SELECTED CARD</small><h2>카드 정보</h2></div><span className="card-id">#{String(selectedRecord.id).padStart(2, '0')}</span></div><div className="inspector-preview" style={{ borderColor: selectedRecord.color }}><span>{selectedRecord.type}</span><strong>{selectedRecord.title}</strong><small>{selectedRecord.event_date || '날짜 미정'}</small></div><section className="inspector-section"><div className="section-heading"><h3>기록 내용</h3><button onClick={() => openEdit(selectedRecord)}>편집</button></div><p className="body-copy">{selectedRecord.body || '기록 내용이 없습니다.'}</p></section><section className="inspector-section"><div className="section-heading"><h3>출처 · 검증</h3><span className="source-count">{selectedRecord.sources.length}개</span></div>{selectedRecord.sources.length ? selectedRecord.sources.map((source) => <div className="source-box" key={source.id}><div className="source-title"><span className={`verify ${source.verification_status === '확인됨' ? 'verified' : ''}`}>✓</span><b>{source.title}</b></div><p>{source.publisher || '발행처 미입력'} · {source.published_at || '날짜 미입력'}</p><small>{source.license} · {source.verification_status}</small>{source.url && <a href={source.url} target="_blank" rel="noreferrer">원문 열기 ↗</a>}</div>) : <div className="empty-source">출처를 추가하면 영상 설명란과 검증 노트에 바로 활용할 수 있어요.</div>}</section><section className="inspector-section usage"><h3>제작 메모</h3><div className="usage-row"><span>장면 북마크</span><b>0</b></div><div className="usage-row"><span>캔버스 위치</span><b>{Math.round(selectedRecord.position_x)} / {Math.round(selectedRecord.position_y)}</b></div></section><button className="delete-btn" onClick={deleteSelected}>카드 삭제</button></> : <div className="empty-inspector"><span>＋</span><h3>카드를 선택하세요</h3><p>캔버스 위 카드를 눌러 출처와 기록을 확인합니다.</p><button onClick={openAdd}>첫 카드 만들기</button></div>}</aside>
      </div>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><form className="record-form" onSubmit={submitForm}><div className="form-head"><div><small>{modal === 'add' ? 'NEW RECORD' : 'EDIT RECORD'}</small><h2>{modal === 'add' ? '새 카드 추가' : '카드 편집'}</h2></div><button type="button" className="close-btn" onClick={() => setModal(null)}>×</button></div>{actionError && <p role="alert" style={{ marginBottom: 14, padding: '9px 11px', borderRadius: 6, background: '#fff1ed', color: '#9f503d', fontSize: 10 }}>{actionError}</p>}<div className="form-grid"><label>카드 제목<input autoFocus value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="예: 핵심 발언 요약" /></label><label>분류<select value={form.type} onChange={(e) => updateForm('type', e.target.value)}>{CARD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>기록 인물<select value={form.politicianId} onChange={(e) => updateForm('politicianId', Number(e.target.value))}>{politicians.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>기준일<input value={form.eventDate} onChange={(e) => updateForm('eventDate', e.target.value)} placeholder="2025. 03. 12." /></label><label className="full">내용<textarea rows={4} value={form.body} onChange={(e) => updateForm('body', e.target.value)} placeholder="영상에서 설명할 사실과 맥락을 적어두세요." /></label><div className="full color-picker"><span>카드 컬러</span>{COLORS.map((color) => <button type="button" className={form.color === color ? 'picked' : ''} style={{ background: color }} onClick={() => updateForm('color', color)} key={color} aria-label={color} />)}</div></div><div className="source-form"><div className="form-subhead"><h3>출처와 사용 권한</h3><small>출처가 있는 주장만 영상에 사용하세요</small></div><div className="form-grid"><label>출처 제목<input value={form.sourceTitle} onChange={(e) => updateForm('sourceTitle', e.target.value)} placeholder="기사·보고서 제목" /></label><label>발행처<input value={form.publisher} onChange={(e) => updateForm('publisher', e.target.value)} placeholder="기관 또는 언론사" /></label><label className="full">URL<input type="url" value={form.sourceUrl} onChange={(e) => updateForm('sourceUrl', e.target.value)} placeholder="https://" /></label><label>발행일<input value={form.publishedAt} onChange={(e) => updateForm('publishedAt', e.target.value)} placeholder="YYYY-MM-DD" /></label><label>검증 상태<select value={form.verificationStatus} onChange={(e) => updateForm('verificationStatus', e.target.value)}><option>미확인</option><option>확인됨</option><option>데모</option><option>추가 확인</option></select></label><label>라이선스<input value={form.license} onChange={(e) => updateForm('license', e.target.value)} /></label><label>메모<input value={form.sourceNote} onChange={(e) => updateForm('sourceNote', e.target.value)} placeholder="저작권·인용 범위" /></label></div></div><div className="form-actions"><button type="button" className="ghost-btn" onClick={() => setModal(null)}>취소</button><button type="submit" className="primary-btn" disabled={saving}>{saving ? '저장 중…' : '저장하기'}</button></div></form></div>}
  </main>;
}
