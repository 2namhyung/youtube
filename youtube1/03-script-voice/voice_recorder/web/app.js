(() => {
  var DEFAULT_SCRIPT = "오늘 뉴스 브리핑입니다. 지금 서울 도심의 하늘, 평소보다 유난히 맑아 보이는데요.\n기상청은 오늘 낮 기온이 어제보다 3도 오르면서, 한낮에는 초여름처럼 따뜻하겠다고 예보했습니다.\n다만 오후 4시 전후로 서쪽 지역부터 바람이 강해질 수 있어, 외출하신다면 얇은 겉옷을 챙기시는 게 좋겠습니다.\n이번 주 가장 눈에 띄는 소식은 인공지능 반도체를 둘러싼 새로운 협력입니다. 국내 연구진과 스타트업이 2년의 개발 끝에, 전력 사용량을 30퍼센트 낮춘 시제품을 공개했는데요.\n이 기술이 실제 생산 라인에 적용되면 데이터센터의 부담도 줄어들 전망입니다. 여러분은 기술의 속도와 안전, 어느 쪽이 더 중요하다고 생각하시나요?\n지금까지 오늘의 주요 소식이었습니다.";
  var $ = function(id) { return document.getElementById(id); };
  var transcript = $("transcript"), deviceSelect = $("deviceSelect"), permissionBtn = $("permissionBtn");
  var recordBtn = $("recordBtn"), pauseBtn = $("pauseBtn"), stopBtn = $("stopBtn"), timer = $("timer");
  var canvas = $("waveform"), ctx = canvas.getContext("2d");
  var audioContext, stream, source, analyser, processor, muteGain, raf, activeDeviceId = "";
  var chunks = [], recording = false, paused = false, countdownActive = false;
  var startedAt = 0, pausedMs = 0, pauseStarted = 0, elapsedSeconds = 0, wavBlob = null;
  var peakDb = -Infinity, clipCount = 0, silentSamples = 0, totalSamples = 0, peakLinear = 0;

  transcript.value = DEFAULT_SCRIPT;
  function updateChars() { $("charCount").textContent = transcript.value.length.toLocaleString("ko-KR") + "자"; }
  transcript.addEventListener("input", updateChars); updateChars();
  $("resetScript").addEventListener("click", function() { transcript.value = DEFAULT_SCRIPT; updateChars(); transcript.focus(); });

  async function refreshDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) throw new Error("미디어 장치를 지원하지 않습니다.");
      var devices = await navigator.mediaDevices.enumerateDevices();
      var inputs = devices.filter(function(d) { return d.kind === "audioinput"; });
      deviceSelect.replaceChildren();
      inputs.forEach(function(d, i) { var option = document.createElement("option"); option.value = d.deviceId; option.textContent = d.label || ("마이크 " + (i + 1)); deviceSelect.append(option); });
      if (!inputs.length) { var o = document.createElement("option"); o.textContent = "연결된 마이크 없음"; deviceSelect.append(o); }
    } catch (e) { setMessage("마이크 장치를 읽지 못했습니다. 브라우저 권한을 확인하세요.", true); }
  }
  async function ensureMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("이 브라우저는 마이크 입력을 지원하지 않습니다.");
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
    var id = deviceSelect.value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : { channelCount: 1 } });
    activeDeviceId = id;
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    await audioContext.resume();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .65;
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    muteGain = audioContext.createGain(); muteGain.gain.value = 0;
    source.connect(analyser); source.connect(processor); processor.connect(muteGain); muteGain.connect(audioContext.destination);
    permissionBtn.textContent = "마이크 연결됨 · 다시 확인"; permissionBtn.classList.add("granted"); recordBtn.disabled = false;
    await refreshDevices(); startMonitor();
  }
  permissionBtn.addEventListener("click", async function() { try { await ensureMic(); setMessage("입력 신호를 확인했습니다. 녹음을 시작할 수 있습니다."); } catch (e) { setMessage(e.message || "마이크 권한이 필요합니다.", true); } });
  $("refreshDevices").addEventListener("click", refreshDevices);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", refreshDevices);

  function startMonitor() {
    cancelAnimationFrame(raf);
    var wave = new Uint8Array(analyser.fftSize);
    function draw() {
      if (!analyser) return;
      analyser.getByteTimeDomainData(wave);
      var sum = 0, max = 0;
      for (var i = 0; i < wave.length; i++) { var n = (wave[i] - 128) / 128; sum += n * n; max = Math.max(max, Math.abs(n)); }
      var rms = Math.sqrt(sum / wave.length), db = rms > 0 ? 20 * Math.log10(rms) : -96, peak = max > 0 ? 20 * Math.log10(max) : -96;
      $("dbValue").textContent = Math.max(-96, db).toFixed(1) + " dB"; $("peakValue").textContent = Math.max(-96, peak).toFixed(1) + " dB";
      $("levelFill").style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + "%"; $("peakMarker").style.left = Math.max(0, Math.min(100, (peak + 60) / 60 * 100)) + "%";
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#56d0bc"; ctx.lineWidth = 1.5; ctx.beginPath();
      wave.forEach(function(v, j) { var x = j / (wave.length - 1) * canvas.width, y = (v / 255) * canvas.height; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      if (recording && !paused) updateTimer(); raf = requestAnimationFrame(draw);
    }
    draw();
  }
  function updateTimer() { elapsedSeconds = (performance.now() - startedAt - pausedMs) / 1000; timer.textContent = formatTime(elapsedSeconds); }
  function formatTime(s) { var m = Math.floor(s / 60), sec = Math.floor(s % 60), tenth = Math.floor((s % 1) * 10); return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0") + "." + tenth; }
  function setMessage(text, error) { var el = $("saveMessage"); el.textContent = text; el.className = "save-message " + (error ? "error" : ""); }
  function setQuality() {
    var silence = totalSamples ? silentSamples / totalSamples : 1; $("silenceValue").textContent = Math.round(silence * 100) + " %"; $("clipValue").textContent = clipCount ? clipCount + "회" : "정상";
    var issues = []; if (elapsedSeconds < 10) issues.push("10초 이상 녹음하세요"); if (peakDb < -45) issues.push("입력이 너무 작습니다"); if (clipCount) issues.push("클리핑이 감지되었습니다"); if (silence > .65) issues.push("무음 구간이 많습니다");
    var q = $("quality"); q.className = "quality " + (issues.length ? "warn" : "good"); q.textContent = issues.length ? "확인 필요 · " + issues.join(" · ") : "품질 양호 · 저장 전에 재생해 보세요.";
  }
  function attachProcessor() {
    processor.onaudioprocess = function(event) { if (!recording || paused) return; var input = event.inputBuffer.getChannelData(0), copy = new Float32Array(input); chunks.push(copy); totalSamples += copy.length; input.forEach(function(v) { var a = Math.abs(v); peakLinear = Math.max(peakLinear, a); if (a < .01) silentSamples++; if (a >= .999) clipCount++; }); peakDb = peakLinear ? 20 * Math.log10(peakLinear) : -96; };
  }
  async function beginRecording() {
    if (countdownActive || recording) return; if (!stream || activeDeviceId !== deviceSelect.value) { try { await ensureMic(); } catch (e) { setMessage(e.message, true); return; } }
    countdownActive = true; for (var n of [3, 2, 1]) { $("countdown").textContent = String(n); await new Promise(function(r) { setTimeout(r, 1000); }); } $("countdown").textContent = ""; countdownActive = false;
    chunks = []; clipCount = 0; silentSamples = 0; totalSamples = 0; peakLinear = 0; peakDb = -Infinity; elapsedSeconds = 0; pausedMs = 0; startedAt = performance.now(); recording = true; paused = false; attachProcessor();
    recordBtn.disabled = true; recordBtn.classList.add("active"); $("recordState").textContent = "녹음 중"; pauseBtn.disabled = false; stopBtn.disabled = false; pauseBtn.textContent = "일시정지"; wavBlob = null; $("takeBadge").textContent = "진행 중"; $("saveBtn").disabled = true;
  }
  function togglePause() { if (!recording) return; if (!paused) { paused = true; pauseStarted = performance.now(); pauseBtn.textContent = "계속 녹음"; $("recordState").textContent = "일시정지"; } else { pausedMs += performance.now() - pauseStarted; paused = false; pauseBtn.textContent = "일시정지"; $("recordState").textContent = "녹음 중"; } }
  function stopRecording() { if (!recording) return; if (paused) { pausedMs += performance.now() - pauseStarted; paused = false; } recording = false; updateTimer(); processor.onaudioprocess = null; wavBlob = encodeWav(chunks, audioContext.sampleRate); $("playback").src = URL.createObjectURL(wavBlob); $("takeBadge").textContent = formatTime(elapsedSeconds); $("recordState").textContent = "테이크 준비"; recordBtn.disabled = false; recordBtn.classList.remove("active"); pauseBtn.disabled = true; stopBtn.disabled = true; setQuality(); $("voiceCheck").checked = false; $("saveBtn").disabled = false; }

  recordBtn.addEventListener("click", beginRecording); pauseBtn.addEventListener("click", togglePause); stopBtn.addEventListener("click", stopRecording);
  function encodeWav(parts, sampleRate) { var length = parts.reduce(function(n, p) { return n + p.length; }, 0), data = new Int16Array(length), offset = 0; parts.forEach(function(p) { for (var i = 0; i < p.length; i++) data[offset++] = Math.max(-1, Math.min(1, p[i])) * 0x7fff; }); var buffer = new ArrayBuffer(44 + data.length * 2), view = new DataView(buffer), str = function(o, s) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }; str(0, "RIFF"); view.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE"); str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, data.length * 2, true); new Int16Array(buffer, 44).set(data); return new Blob([buffer], { type: "audio/wav" }); }
  function blobBase64(blob) { return new Promise(function(resolve, reject) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result.split(",")[1]); }; reader.onerror = reject; reader.readAsDataURL(blob); }); }
  $("saveBtn").addEventListener("click", async function() { if (!wavBlob || !transcript.value.trim() || !$("voiceCheck").checked) { setMessage("transcript를 확인하고 본인 목소리 체크를 선택하세요.", true); return; } var btn = $("saveBtn"); btn.disabled = true; setMessage("로컬 디스크에 저장 중…"); try { var wav = await blobBase64(wavBlob); var response = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wav_base64: wav, transcript: transcript.value, metadata: { sample_rate: audioContext.sampleRate, channels: 1, encoding: "PCM 16-bit", duration_seconds: Number(elapsedSeconds.toFixed(2)), peak_dbfs: Number(peakDb.toFixed(1)), silence_ratio: Number((silentSamples / Math.max(1, totalSamples)).toFixed(4)), clipping_samples: clipCount, user_agent: navigator.userAgent } }) }); var data = await response.json(); if (!response.ok) throw new Error(data.error || "저장 실패"); setMessage("저장 완료 · recordings/" + data.id, false); $("saveMessage").classList.add("ok"); } catch (e) { setMessage(e.message || "저장하지 못했습니다.", true); btn.disabled = false; } });
  async function health() { try { var r = await fetch("/api/health"); if (!r.ok) throw new Error(); $("serverDot").classList.add("online"); $("serverStatus").textContent = "LOCALHOST · 연결됨"; } catch (e) { $("serverStatus").textContent = "서버 연결 실패"; } }
  refreshDevices(); health();
})();
