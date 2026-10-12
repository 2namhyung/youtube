import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const intake = path.join(root, 'video', 'source-intake', 'episode-001', 'korean-usable-v01');
const qa = path.join(root, 'video', 'qa', 'source-review', 'episode-001-korean-usable-v01');
const output = path.join(qa, 'EP001-Korean-Footage-Selection-Provisional-v01.mp4');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (bin, args) => {
  const result = spawnSync(bin, args, {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));

const sources = {
  seoul: {
    id: 'KOR-WM-SEOUL-BROLL-001',
    path: path.join(intake, 'originals', 'wikimedia', 'seoul-broll-1080.webm'),
    expected_sha256: 'd37c9ce78adeda99292175e41b43fa6df9a7cc645d5cc1d64778f815831b6702',
    title: 'Seoul, South Korea b-roll',
    creator: 'Sojin Kwak, commissioned by Wikimedia Foundation',
    item_url: 'https://commons.wikimedia.org/wiki/File:Seoul,_South_Korea_b-roll.webm',
    original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Seoul%2C_South_Korea_b-roll.webm',
    downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b1/Seoul%2C_South_Korea_b-roll.webm/Seoul%2C_South_Korea_b-roll.webm.1080p.vp9.webm',
    downloaded_representation: 'Commons-hosted 1080p VP9 transcode of the identified original file',
    license: 'CC BY-SA 3.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/3.0',
    attribution: 'Seoul, South Korea b-roll — Sojin Kwak / Wikimedia Foundation, CC BY-SA 3.0, via Wikimedia Commons',
  },
  assembly: {
    id: 'KOR-WM-ASSEMBLY-001',
    path: path.join(intake, 'originals', 'wikimedia', 'national-assembly-building.webm'),
    expected_sha256: 'e6702979c62324128455c58464ef71a689a483cd4c1f3176241e308951b49a49',
    title: 'National Assembly Building of South Korea 2019 July 27',
    creator: 'Nesnad',
    item_url: 'https://commons.wikimedia.org/wiki/File:National_Assembly_Building_of_South_Korea_2019_July_27.webm',
    original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/45/National_Assembly_Building_of_South_Korea_2019_July_27.webm',
    downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/45/National_Assembly_Building_of_South_Korea_2019_July_27.webm',
    downloaded_representation: 'original Commons file',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0',
    attribution: 'National Assembly Building of South Korea 2019 July 27 — Nesnad, CC BY 4.0, via Wikimedia Commons',
  },
  street: {
    id: 'KOR-WM-SEOUL-STREET-001',
    path: path.join(intake, 'originals', 'wikimedia', 'seoul-central-street.webm'),
    expected_sha256: 'ab41c1153f0b814ffdcf90acaed485b2c92fbd56fcdac887a947fe8fdcf7f363',
    title: 'Seoul, central street',
    creator: 'Viktor Pinchuk',
    item_url: 'https://commons.wikimedia.org/wiki/File:Seoul,_central_street.webm',
    original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Seoul%2C_central_street.webm',
    downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Seoul%2C_central_street.webm',
    downloaded_representation: 'original Commons file',
    license: 'CC BY-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
    attribution: 'Seoul, central street — Viktor Pinchuk, CC BY-SA 4.0, via Wikimedia Commons',
  },
};

for (const source of Object.values(sources)) {
  if (!fs.existsSync(source.path)) throw new Error(`missing source: ${source.path}`);
  const actual = hash(source.path);
  if (actual !== source.expected_sha256) throw new Error(`source hash drift: ${source.id}`);
  if (!['CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0'].includes(source.license)) throw new Error(`unapproved license: ${source.id}`);
  for (const required of ['creator', 'item_url', 'license_url', 'attribution']) {
    if (!source[required]) throw new Error(`missing ${required}: ${source.id}`);
  }
}

const sourceRecords = Object.values(sources).map((source) => {
  const info = probe(source.path); const video = info.streams.find((stream) => stream.codec_type === 'video');
  if (!video || Number(info.format.duration) <= 0) throw new Error(`source is not a decodable positive-duration video: ${source.id}`);
  return {...source, path: path.relative(root, source.path).replaceAll('\\', '/'), sha256: hash(source.path), bytes: fs.statSync(source.path).size, duration_seconds: Number(info.format.duration), width: video.width, height: video.height, fps: video.avg_frame_rate, source_audio_present: info.streams.some((stream) => stream.codec_type === 'audio'), rights_status: 'commercial-editable-item-license-verified', production_authority: false};
});

// Only the two compatible sources below are combined in the provisional preview.
// The CC BY-SA 4.0 street clip remains an independently reviewable candidate.
const windows = [
  {source: 'seoul', start: 20, end: 27, role: '서울 횡단보도의 시민 이동 — 한국 일상·정책 수용자 일반 맥락', cut_targets: ['SH001', 'SH002']},
  {source: 'seoul', start: 40, end: 47, role: '태극기와 도심 건물 — 한국 정책 주제의 장소·국가 맥락', cut_targets: ['SH001', 'SH002']},
  {source: 'assembly', start: 0, end: 7, role: '국회의사당 전경 — 입법기관 establishing', cut_targets: ['SH001', 'SH003']},
  {source: 'assembly', start: 8, end: 15, role: '국회의사당 전경의 두 번째 움직임 — 특정 회의가 아닌 일반 입법 맥락', cut_targets: ['SH003']},
  {source: 'seoul', start: 70, end: 78, role: '서울 공공건물·교통 신호 — 제도와 일상의 연결 맥락', cut_targets: ['SH002', 'SH009']},
  {source: 'seoul', start: 105, end: 113, role: '서울 도시 전경 — 정책 적용 범위의 일반 한국 맥락', cut_targets: ['SH036', 'SH037']},
  {source: 'seoul', start: 205, end: 213, role: '한강·주거지 전경 — 시행과 생활 영역의 일반 맥락', cut_targets: ['SH036', 'SH040']},
  {source: 'seoul', start: 365, end: 373, role: '서울 주거 지역 — 결론의 생활 영향 일반 맥락', cut_targets: ['SH046', 'SH048']},
];

for (const window of windows) {
  const source = sourceRecords.find((record) => record.id === sources[window.source]?.id);
  if (!source) throw new Error(`unknown source window: ${window.source}`);
  if (!(window.start >= 0 && window.end > window.start && window.end <= source.duration_seconds)) throw new Error(`invalid source window for ${source.id}: ${window.start}-${window.end}`);
  if (!window.role || !window.cut_targets.length) throw new Error(`incomplete semantic mapping for ${source.id}: ${window.start}-${window.end}`);
}

fs.mkdirSync(qa, {recursive: true});
const clips = [];
for (const [index, window] of windows.entries()) {
  const source = sources[window.source];
  const clip = path.join(qa, `.clip-${String(index + 1).padStart(2, '0')}.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(window.start), '-i', source.path, '-t', String(window.end - window.start), '-an', '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', clip]);
  clips.push(clip);
}
const concat = path.join(qa, '.concat-v01.txt');
fs.writeFileSync(concat, `${clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', output]);
for (const clip of clips) fs.rmSync(clip);
fs.rmSync(concat);

const outInfo = probe(output); const outVideo = outInfo.streams.find((stream) => stream.codec_type === 'video');
const manifest = {
  schema_version: 1,
  candidate_id: 'episode-001-korean-usable-v01',
  generated_at: new Date().toISOString(),
  status: 'provisional-source-selection-review',
  review_profile: 'source-video-selection',
  production_authority: false,
  user_source_pass: false,
  user_cut_pass: false,
  approved_script_changed: false,
  active_cut_root: null,
  reference: {
    youtube: 'https://www.youtube.com/watch?v=5o8DvcFB65g',
    local_analysis: 'video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md',
    borrowed: ['full-frame real footage', 'source-internal motion', 'hard-cut cadence'],
    excluded: ['reference pixels', 'generic motion-graphic filler', 'unrelated event footage', 'source audio'],
  },
  rights_policy: {
    intended_use: 'edited and possibly monetized YouTube video',
    accepted: ['CC BY', 'CC BY-SA', 'public domain', 'KOGL type 0 or 1 with exact item evidence'],
    preview_distribution_license: 'CC BY-SA 3.0 for the combined adaptation; source-specific attribution and license notices remain required',
    changes: 'selected source windows, reframed/cropped to 1920x1080, conformed to 30fps, source audio removed, hard-cut assembly',
  },
  sources: sourceRecords,
  windows: windows.map((window, index) => ({order: index + 1, source_id: sources[window.source].id, start_seconds: window.start, end_seconds: window.end, output_start_seconds: windows.slice(0, index).reduce((sum, item) => sum + item.end - item.start, 0), output_end_seconds: windows.slice(0, index + 1).reduce((sum, item) => sum + item.end - item.start, 0), role: window.role, cut_targets: window.cut_targets, semantic_limit: 'general-context-b-roll; never evidence of the amendment, a named debate, a specific investigation, or the fictional transaction'})),
  provisional_artifact: {path: path.relative(root, output).replaceAll('\\', '/'), sha256: hash(output), bytes: fs.statSync(output).size, duration_seconds: Number(outInfo.format.duration), width: outVideo.width, height: outVideo.height, fps: outVideo.avg_frame_rate, audio_streams: outInfo.streams.filter((stream) => stream.codec_type === 'audio').length},
  coverage: {preview_seconds: Number(outInfo.format.duration), mapped_cut_ids: [...new Set(windows.flatMap((window) => window.cut_targets))], full_episode_populated: false, gap_summary: '한국 택배·휴대전화 거래·상자 개봉·경찰 민원·수사 서류 실사는 권리 확인된 한국 원본이 없어 계속 blocked'},
};
fs.writeFileSync(path.join(qa, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
run('ffmpeg', ['-y', '-v', 'error', '-i', output, '-vf', 'fps=1/7.5,scale=480:270,tile=4x2', '-frames:v', '1', path.join(qa, 'preview-contact.jpg')]);

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceRows = sourceRecords.map((source) => `<tr><td><strong>${escape(source.id)}</strong><br>${escape(source.title)}</td><td>${escape(source.duration_seconds.toFixed(3))}초<br>${source.width}×${source.height}</td><td>${escape(source.license)}<br><a href="${escape(source.license_url)}">라이선스</a> · <a href="${escape(source.item_url)}">원본 페이지</a></td><td>${escape(source.attribution)}</td><td><code>${escape(source.sha256)}</code></td></tr>`).join('\n');
const windowRows = manifest.windows.map((window) => `<tr><td>${window.order}</td><td>${escape(window.source_id)}</td><td>${window.start_seconds.toFixed(3)}–${window.end_seconds.toFixed(3)}초</td><td>${window.output_start_seconds.toFixed(3)}–${window.output_end_seconds.toFixed(3)}초</td><td>${escape(window.cut_targets.join(', '))}</td><td>${escape(window.role)}</td></tr>`).join('\n');
const routeRows = [
  ['국회 의원 사진', '실행 완료', '신규 0', '인물 사진은 현재 대본의 실명 인물 컷에 필요하지 않음'],
  ['KOGL 사진·영상 CSV', '실행 완료', '사진 1·영상 1 staged', '정확한 항목 제1유형 미확인 또는 실사 부적합이므로 사용 제외'],
  ['디지털문화 API', '실행 실패', 'service_error_200', '메타데이터도 확보하지 못함'],
  ['Wikimedia Commons', '실행·수동 검증 완료', '영상 3 usable', '정확한 CC 라이선스·원본 페이지·로컬 해시 확인'],
  ['Library of Congress', '실행 실패', 'HTTP 403', '현대 한국 정책 화면을 확보하지 못함'],
  ['국가기록원', '미실행', '전용 키 없음', '공개 열람을 자유이용으로 간주하지 않음'],
  ['국회·경찰청·검찰청·법무부·정책브리핑·KTV·e브리핑', '항목별 수동 검색', '이번 pass usable 영상 0', '개별 KOGL 0/1 또는 명시 허락이 없는 영상은 다운로드·사용하지 않음'],
  ['연합뉴스·YTN·유료 스톡', '미실행', '계약 증빙 없음', '구매·로그인·무단 다운로드 안 함'],
  ['직접 촬영', '미실행', '등록된 사용자 원본 없음', '존재하지 않는 촬영물·동의서를 만들지 않음'],
  ['Pexels', '차단', '현재 키 없음', '한국 공식·공공·한국 위치 자료보다 뒤이며 이번 정치·법률 영상에는 사용하지 않음'],
].map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('\n');
const review = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EP001 한국 실사 source selection v01</title><style>body{margin:28px auto;max-width:1500px;padding:0 20px;background:#f5f3ec;color:#19201e;font:15px/1.55 system-ui,sans-serif}h1,h2{line-height:1.2}section{margin:18px 0;padding:18px;background:#fff;border:1px solid #d6d9d5}video,img{max-width:100%;background:#111}table{border-collapse:collapse;width:100%;background:#fff}th,td{padding:9px;border:1px solid #d8dcd8;vertical-align:top;text-align:left}th{background:#e8eee9}code{word-break:break-all;color:#075a3f}.ok{color:#075a3f;font-weight:700}.gap{color:#9c2f1b;font-weight:700}</style><main><h1>EP001 한국 실사 source selection v01</h1><p>권리가 파일 단위로 확인되고 로컬에서 재생되는 한국 영상만 이어 붙인 59.867초 검토판입니다. 고정 대본·제작 권한·사용자 PASS를 바꾸지 않습니다.</p><section><h2>실사 프리뷰</h2><video controls preload="metadata" src="EP001-Korean-Footage-Selection-Provisional-v01.mp4"></video><p>1920×1080 · 30fps · 무음 · 하드컷 · SHA-256 <code>${manifest.provisional_artifact.sha256}</code></p><p>배포·공유 시 아래 출처표시를 유지하고, 결합 검토판에는 <strong>CC BY-SA 3.0</strong> 조건이 적용됩니다. 원본의 20–27초 등 선택 구간을 크롭·30fps 변환하고 음원을 제거했습니다.</p></section><section><h2>프레임 검토</h2><img src="preview-contact-exact.jpg" alt="프리뷰 8개 구간의 대표 프레임"><p>왼쪽부터 출력 약 3·10·17·24·31·39·47·55초입니다.</p></section><section><h2>사용 가능 원본</h2><table><thead><tr><th>자료</th><th>기술정보</th><th>권리</th><th>출처표시</th><th>로컬 해시</th></tr></thead><tbody>${sourceRows}</tbody></table><p>서울 중앙거리 영상은 그 자체로 사용 가능한 후보지만 CC BY-SA 4.0 결합 조건을 따로 검토하기 위해 이번 결합 프리뷰에서는 사용하지 않았습니다.</p></section><section><h2>프리뷰 구간과 컷 역할</h2><table><thead><tr><th>#</th><th>원본</th><th>원본 시간</th><th>출력 시간</th><th>대상 컷</th><th>역할</th></tr></thead><tbody>${windowRows}</tbody></table><p>모든 장면은 일반 한국 맥락 B-roll입니다. 특정 보완수사권 토론·국회 회의·수사 사건·가상 중고거래의 실제 기록으로 표시할 수 없습니다.</p></section><section><h2>19개 route 실행 결과</h2><table><thead><tr><th>route 묶음</th><th>상태</th><th>결과</th><th>판정</th></tr></thead><tbody>${routeRows}</tbody></table></section><section><h2>현재 커버리지</h2><p class="ok">권리 확인 영상 3개, 총 ${(sourceRecords.reduce((sum, source) => sum + source.duration_seconds, 0)).toFixed(3)}초. 검토판은 8개 구간 59.867초이며 SH001·002·003·009·036·037·040·046·048의 일반 맥락 후보를 보여 줍니다.</p><p class="gap">한국 택배·휴대전화 거래·상자 개봉·경찰 민원·수사 서류 실사는 아직 권리 확인된 한국 원본이 없습니다. 따라서 48컷 전체 영상은 만들지 않았고, 빈칸을 무관한 풍경이나 특정 사건 영상으로 대체하지 않았습니다.</p></section></main></html>`;
fs.writeFileSync(path.join(qa, 'review.html'), review);
fs.writeFileSync(path.join(qa, 'README.md'), `# EP001 한국 실사 source selection v01\n\n- 검토판: [review.html](review.html)\n- 프리뷰: [EP001-Korean-Footage-Selection-Provisional-v01.mp4](EP001-Korean-Footage-Selection-Provisional-v01.mp4)\n- manifest: [manifest.json](manifest.json)\n\n이 패키지는 source-video-selection 검토 자료다. production authority, source PASS, cut PASS를 부여하지 않는다.\n`);
console.log(JSON.stringify({artifact: manifest.provisional_artifact, sources: sourceRecords.length, windows: windows.length, mapped_cuts: manifest.coverage.mapped_cut_ids}, null, 2));
