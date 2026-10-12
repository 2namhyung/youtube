(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const FRAME_RATE = 30000 / 1001;
  const state = { data: null, shots: [], selected: -1, query: '', duration: 0, comparisonLoaded: false, loop: false, loopTargetIndex: -1 };
  const video = $('#sourceVideo');

  const formatTime = (seconds = 0, milliseconds = false) => {
    const value = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(value / 60).toString().padStart(2, '0');
    const secs = Math.floor(value % 60).toString().padStart(2, '0');
    if (!milliseconds) return `${mins}:${secs}`;
    return `${mins}:${secs}.${Math.floor((value % 1) * 1000).toString().padStart(3, '0')}`;
  };
  const frameToSeconds = frame => Number(frame) / FRAME_RATE;
  const maxFrameIndex = () => {
    const frameCount = Number(state.data?.source?.frameCount);
    if (Number.isFinite(frameCount) && frameCount > 0) return Math.max(0, Math.floor(frameCount) - 1);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : state.duration;
    return Math.max(0, Math.floor(duration * FRAME_RATE) - 1);
  };
  const frameCenter = frame => {
    const index = Math.max(0, Math.min(maxFrameIndex(), Math.floor(Number(frame) || 0)));
    return (index + 0.5) / FRAME_RATE;
  };
  const shotStart = shot => Number.isFinite(Number(shot.startSeconds)) ? Number(shot.startSeconds) : frameToSeconds(shot.startFrame);
  const shotEnd = shot => Number.isFinite(Number(shot.endSeconds)) ? Number(shot.endSeconds) : frameToSeconds(shot.endFrame);
  const confidenceText = value => {
    if (typeof value === 'number') return `${Math.round(value * 100)}%`;
    const labels = { high: '높음', medium: '보통', low: '낮음' };
    return labels[String(value).toLowerCase()] || value || '기록 필요';
  };
  const shotNumber = shot => String(shot.id || '').match(/(\d{3})$/)?.[1] || String(shot.id || '').replace(/^shot[-_]?/i, '') || '—';

  function setStatus(text, ready = false) {
    const node = $('#loadState');
    node.innerHTML = `<i></i>${text}`;
    node.classList.toggle('ready', ready);
  }

  function normalizedShot(shot, index) {
    return {
      ...shot,
      id: shot.id || `shot-${String(index + 1).padStart(2, '0')}`,
      start: shotStart(shot),
      end: shotEnd(shot),
      layers: Array.isArray(shot.layers) ? shot.layers : [],
      techniques: Array.isArray(shot.techniques) ? shot.techniques : [],
      uncertainty: Array.isArray(shot.uncertainty) ? shot.uncertainty : []
    };
  }

  function visibleShots() {
    if (!state.query) return state.shots.map((shot, index) => ({ shot, index }));
    const query = state.query.toLowerCase();
    return state.shots.map((shot, index) => ({ shot, index })).filter(({ shot }) => {
      const haystack = [shot.label, shot.narrationSummary, shot.observed, shot.recipe, ...shot.techniques, ...shot.layers].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderTimeline() {
    const timeline = $('#timeline');
    timeline.innerHTML = '';
    const total = state.duration || Number(state.data?.source?.durationSeconds) || 1;
    state.shots.forEach((shot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `timeline-mark${index === state.selected ? ' is-selected' : ''}`;
      button.style.left = `${(shot.start / total) * 100}%`;
      button.style.width = `${Math.max(((shot.end - shot.start) / total) * 100, .35)}%`;
      button.setAttribute('aria-label', `${shot.id}, ${formatTime(shot.start)}–${formatTime(shot.end)}`);
      button.title = `${shot.label || shot.id} · ${formatTime(shot.start)}–${formatTime(shot.end)}`;
      const label = document.createElement('span');
      label.textContent = shotNumber(shot);
      button.append(label);
      button.addEventListener('click', () => selectShot(index, true, true));
      timeline.append(button);
    });
    $('#timelineRange').textContent = `00:00 — ${formatTime(total)}`;
  }

  function renderShotList() {
    const list = $('#shotList');
    list.innerHTML = '';
    const matches = visibleShots();
    if (!matches.length) {
      list.innerHTML = '<p class="empty-list">검색 결과가 없습니다.</p>';
      return;
    }
    matches.forEach(({ shot, index }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `shot-item${index === state.selected ? ' is-selected' : ''}`;
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-current', index === state.selected ? 'true' : 'false');
      button.innerHTML = `<span class="shot-index">${String(index + 1).padStart(2, '0')}</span><span class="shot-info"><span class="shot-label"></span><span class="shot-time">${formatTime(shot.start, true)} — ${formatTime(shot.end, true)}</span></span><span class="shot-confidence">${confidenceText(shot.confidence)}</span>`;
      $('.shot-label', button).textContent = shot.label || '라벨 없음';
      button.addEventListener('click', () => selectShot(index, true, true));
      list.append(button);
    });
  }

  function renderDetail() {
    const shot = state.shots[state.selected];
    const empty = $('#emptyState');
    const detail = $('#shotDetail');
    if (!shot) { empty.hidden = false; detail.hidden = true; $('#shotCounter').textContent = `— / ${state.shots.length || '—'}`; return; }
    empty.hidden = true;
    detail.hidden = false;
    $('#shotCounter').textContent = `${String(state.selected + 1).padStart(2, '0')} / ${String(state.shots.length).padStart(2, '0')}`;
    $('#detailId').textContent = shot.id.toUpperCase();
    $('#detailTime').textContent = `${formatTime(shot.start, true)} — ${formatTime(shot.end, true)}`;
    $('#detailLabel').textContent = shot.label || '라벨 없음';
    $('#detailSummary').textContent = shot.narrationSummary || '대사 요약이 기록되지 않았습니다.';
    $('#detailObserved').textContent = Array.isArray(shot.observed) ? shot.observed.join('\n') : (shot.observed || '관찰 기록이 없습니다.');
    $('#detailRecipe').textContent = shot.recipe || '재현 레시피가 아직 기록되지 않았습니다.';
    $('#detailConfidence').textContent = confidenceText(shot.confidence);
    const renderItems = (selector, items, emptyText) => {
      const list = $(selector);
      list.innerHTML = '';
      if (!items.length) { list.innerHTML = `<li>${emptyText}</li>`; return; }
      items.forEach(item => { const li = document.createElement('li'); li.textContent = item; list.append(li); });
    };
    renderItems('#detailLayers', shot.layers, '레이어 기록 없음');
    renderItems('#detailTechniques', shot.techniques, '기법 기록 없음');
    const uncertainty = $('#detailUncertainty');
    uncertainty.innerHTML = '';
    if (!shot.uncertainty.length) { $('#uncertaintyBlock').hidden = true; }
    else { $('#uncertaintyBlock').hidden = false; shot.uncertainty.forEach(item => { const li = document.createElement('li'); li.textContent = item; uncertainty.append(li); }); }
  }

  function renderAll() {
    renderTimeline();
    renderShotList();
    renderDetail();
  }

  function selectShot(index, seek = false, userInitiated = false) {
    if (!state.shots[index]) return;
    state.selected = index;
    const shot = state.shots[index];
    if (userInitiated) state.loopTargetIndex = index;
    if (seek && Number.isFinite(shot.start)) {
      const startFrame = Number(shot.startFrame);
      video.currentTime = Number.isFinite(startFrame) ? frameCenter(startFrame) : frameCenter(shot.start * FRAME_RATE);
    }
    renderAll();
    if (seek) $('#shotDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function findShotAt(time) {
    const found = state.shots.findIndex(shot => time >= shot.start && time < shot.end);
    if (found !== -1) return found;
    if (time >= (state.shots.at(-1)?.end || 0)) return state.shots.length - 1;
    return -1;
  }

  function updateCurrentTime() {
    const time = video.currentTime || 0;
    $('#currentTimeLabel').textContent = formatTime(time, true);
    const loopTarget = state.shots[state.loopTargetIndex];
    if (state.loop && !video.paused && loopTarget && time >= loopTarget.end) {
      const startFrame = Number(loopTarget.startFrame);
      video.currentTime = Number.isFinite(startFrame) ? frameCenter(startFrame) : frameCenter(loopTarget.start * FRAME_RATE);
      return;
    }
    const index = findShotAt(time);
    if (index !== -1 && index !== state.selected) { state.selected = index; renderAll(); }
  }

  function setRate(rate) {
    video.playbackRate = rate;
    $$('[data-rate]').forEach(button => {
      const active = Number(button.dataset.rate) === rate;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function stepFrame(delta) {
    video.pause();
    const currentFrame = Math.floor((video.currentTime || 0) * FRAME_RATE);
    video.currentTime = frameCenter(currentFrame + delta);
  }

  function downloadData() {
    if (!state.data) return;
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'VQazcEuV9Xw-shot-analysis.json'; link.click();
    URL.revokeObjectURL(url);
  }

  async function loadAnalysis() {
    try {
      const response = await fetch('../shot-analysis.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = await response.json();
      state.shots = (state.data.shots || []).map(normalizedShot);
      state.duration = Number(state.data.source?.durationSeconds) || 0;
      const source = state.data.source || {};
      $('#sourceTitle').textContent = source.title || source.url || 'VQazcEuV9Xw';
      $('#sourceDuration').textContent = formatTime(state.duration);
      const fps = Number(source.fps);
      $('#sourceFps').textContent = Number.isFinite(fps) ? `${fps.toFixed(3)} fps` : (source.fps || `${FRAME_RATE.toFixed(3)} fps`);
      $('#sourceDimensions').textContent = source.width && source.height ? `${source.width} × ${source.height}` : '—';
      $('#scopeNote').textContent = state.data.scopeNote || $('#scopeNote').textContent;
      setStatus(`${state.shots.length}개 분석 구간 로드됨`, true);
      state.selected = findShotAt(video.currentTime || 0);
      if (state.selected < 0 && state.shots.length) state.selected = 0;
      renderAll();
    } catch (error) {
      setStatus('shot-analysis.json 대기 중');
      $('#shotList').innerHTML = '<p class="empty-list">분석 JSON을 찾지 못했습니다. 상위 폴더의 shot-analysis.json을 연결해 주세요.</p>';
      console.warn('Analysis data could not be loaded:', error);
    }
  }

  video.addEventListener('loadedmetadata', () => {
    if (!state.duration && Number.isFinite(video.duration)) { state.duration = video.duration; renderTimeline(); }
  });
  video.addEventListener('timeupdate', updateCurrentTime);
  video.addEventListener('error', () => { $('#videoError').hidden = false; });
  const comparisonDetails = $('.comparison-box');
  const comparisonVideo = $('#comparisonVideo');
  const comparisonFallback = $('#comparisonFallback');
  const requestComparisonLoad = () => {
    if (!comparisonDetails.open) return;
    comparisonVideo.hidden = true;
    comparisonFallback.hidden = false;
    comparisonFallback.textContent = '비교 영상을 불러오는 중입니다.';
    comparisonVideo.preload = 'metadata';
    comparisonVideo.load();
  };
  const showComparisonVideo = () => { state.comparisonLoaded = true; comparisonVideo.hidden = false; comparisonFallback.hidden = true; };
  comparisonDetails.addEventListener('toggle', () => { if (comparisonDetails.open) requestComparisonLoad(); });
  comparisonVideo.addEventListener('loadedmetadata', showComparisonVideo);
  comparisonVideo.addEventListener('loadeddata', showComparisonVideo);
  comparisonVideo.addEventListener('error', () => {
    comparisonVideo.hidden = true;
    comparisonFallback.hidden = false;
    comparisonFallback.textContent = '비교 영상을 아직 연결하지 못했습니다. 패널을 닫았다가 다시 열면 재시도합니다.';
  });
  $('#shotSearch').addEventListener('input', event => { state.query = event.target.value.trim(); renderShotList(); });
  $$('[data-rate]').forEach(button => button.addEventListener('click', () => setRate(Number(button.dataset.rate))));
  $('#stepBack').addEventListener('click', () => stepFrame(-1));
  $('#stepForward').addEventListener('click', () => stepFrame(1));
  $('#prevShot').addEventListener('click', () => selectShot(Math.max(0, state.selected - 1), true, true));
  $('#nextShot').addEventListener('click', () => selectShot(Math.min(state.shots.length - 1, state.selected + 1), true, true));
  $('#loopShot').addEventListener('change', event => {
    state.loop = event.target.checked;
    if (state.loop) state.loopTargetIndex = state.selected >= 0 ? state.selected : findShotAt(video.currentTime || 0);
  });
  $('#downloadData').addEventListener('click', downloadData);
  document.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select')) { if (event.key === '/' && event.target === $('#shotSearch')) event.preventDefault(); else return; }
    if (event.key === '/') { event.preventDefault(); $('#shotSearch').focus(); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      if (event.shiftKey) selectShot(Math.max(0, Math.min(state.shots.length - 1, state.selected + delta)), true, true);
      else stepFrame(delta);
    }
  });
  loadAnalysis();
})();
