throw new Error('Retired editorial rebuilder: edit episode-spec.json and run pnpm run video:generate-plans. Historical source retained for deletion review; no files were changed.');

import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const scriptPath = path.join(root, 'wiki', 'syntheses', 'episode-001-live-action-script-draft-v1.md');
const intakeDir = path.join(root, 'video', 'source-intake', 'episode-001', 'source-first-rebuild-v01');
const matrixPath = path.join(intakeDir, 'source-acquisition-matrix.json');
const rightsPath = path.join(root, 'video', 'source-intake', 'episode-001', 'full-script-usable-v01', 'rights-inventory.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const projectPath = (value) => path.relative(root, value).replaceAll('\\', '/');
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');

function approvedNarration(markdown) {
  const section = markdown.match(/## 1\.[^\n]*\n([\s\S]*?)(?=## 실사 중심 화면 수급 계획)/u)?.[1];
  if (!section) throw new Error('approved narration sections 1-8 not found');
  const normalized = section.split(/\r?\n/u).filter((line) => !/^##\s/u.test(line)).join(' ')
    .replace(/\*\*/gu, '').replace(/\s*\[근거[^\]]+\]/gu, '').replace(/\s+/gu, ' ').trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (sentences.length !== 79 || normalized.replace(/\s/gu, '').length !== 2761) throw new Error('approved narration changed');
  return {normalized, sentences};
}

function semanticSegments(sentences) {
  const pairStarts = new Set([1, 4, 8, 14, 18, 20, 24, 31, 36, 43, 49, 51, 56, 73, 76]);
  const segments = [];
  for (let index = 1; index <= 79; index += 1) {
    if (index === 33) {
      segments.push({key:'33-35', sentence_numbers:[33,34,35], narration:sentences.slice(32,35).join(' '), internal_focus:['관리 기록','기한 질문','1개월 기준']});
      index = 35;
    } else if (pairStarts.has(index)) {
      segments.push({key:`${index}-${index + 1}`, sentence_numbers:[index,index + 1], narration:`${sentences[index - 1]} ${sentences[index]}`, internal_focus:['전제','귀결']});
      index += 1;
    } else if (index === 59) {
      const [lead, tail] = sentences[58].split('사건 중에는');
      segments.push({key:'59a', sentence_numbers:[59], narration:`${lead}사건 중에는`, internal_focus:['기존 사건 범위']});
      segments.push({key:'59b', sentence_numbers:[59], narration:tail.trim(), internal_focus:['조건','최대 90일']});
    } else if (index === 64) {
      const [lead, tail] = sentences[63].split('아니라,');
      segments.push({key:'64a', sentence_numbers:[64], narration:`${lead}아니라,`, internal_focus:['닫히는 직접 수사 경로']});
      segments.push({key:'64b', sentence_numbers:[64], narration:tail.trim(), internal_focus:['남는 보완수사요구 경로']});
    } else {
      segments.push({key:String(index), sentence_numbers:[index], narration:sentences[index - 1], internal_focus:[]});
    }
  }
  return segments;
}

const sourceConfig = {
  '1-2':['source-video','general-korean-context',['KOR-WM-ASSEMBLY-001','NEW-KOR-ASSEMBLY-INTERIOR-001'],'국회 외관과 본회의장 내부를 2–4초 단위로 교차해 한국 정책 논쟁의 장소만 설정한다.'],
  '3':['source-video','actual-speech',['YT-TVCHOSUN-PF11-0204','NEW-KOR-ASSEMBLY-INTERIOR-001'],'정치권 발언 차이를 바로 분석하는 4.83초 원 발언 1회와 Green 한국 국회 맥락으로 구성한다.'],
  '4-5':['source-video','general-korean-context',['KOR-WM-ASSEMBLY-001'],'국회 실사로 질문에서 정책 설명 약속으로 전환한다.'],
  '16':['source-video','document-workflow',['WM-DOCUMENT-SCANNING-001'],'문서에서 빠진 확인을 보충하는 일반 업무 동작으로 정의를 받친다.'],
  '17':['source-video','document-workflow',['WM-MOVING-ARCHIVE-CABINETS-001','WM-MAN-WRITING-PAPER-001'],'기록 묶음 이동과 문서 확인을 기관 사이 절차의 일반 맥락으로 보여 준다.'],
  '18-19':['source-photo','general-korean-context',['KOR-WM-NAMDAEMUN-POLICE-001','KOR-WM-SEOUL-PROSECUTION-OFFICE-001'],'한국 경찰·검찰 외관으로 사건 위치와 기록 이동의 선후를 구분한다.'],
  '21':['source-video','actual-speech',['YT-TVCHOSUN-PF11-0204'],'검사의 남는 역할을 둘러싼 발언을 즉시 비판적으로 분석할 때만 제한 인용한다.'],
  '23':['source-video','legal-text',['WM-DOCUMENT-SCANNING-001','WM-TYPING-EXAMPLE-001','KOR-WM-SEOUL-PROSECUTION-OFFICE-001','KOR-WM-NAMDAEMUN-POLICE-001'],'남아 있는 법적 직무의 정확한 짧은 native overlay를 실제 사건기록 workflow 위에 둔다.'],
  '27':['source-video','document-workflow',['WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001'],'확인 대상과 이유가 드러나는 요구서 작성 동작을 맥락으로 쓴다.'],
  '28':['source-video','legal-text',['WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001'],'요구 이유·내용의 구체성은 실제 작성 동작으로 채우고 정확 문구만 native overlay로 제한한다.'],
  '30':['source-video','document-workflow',['WM-DOCUMENT-SCANNING-001','WM-LAW-SCHOOL-PHOTOCOPIER-001','WM-MAN-WRITING-PAPER-001'],'관련 서류·증거물의 동봉과 전달을 일반 문서 처리로 보여 준다.'],
  '31-32':['source-video','document-workflow',['WM-TYPING-EXAMPLE-001','WM-DOCUMENT-SCANNING-001','WM-MAN-WRITING-PAPER-001'],'예외 검토와 관리 시스템 기록을 서로 다른 2–4초 업무 디테일로 구성한다.'],
  '33-35':['source-video','legal-text',['WM-TYPING-EXAMPLE-001','WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001','WM-LAPTOP-TYPING-001'],'관리 기록과 기한 질문은 실제 입력·문서 workflow로 채우고 한 달 기준만 짧은 native overlay로 명시한다.'],
  '36-37':['source-video','legal-text',['WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001','WM-LAPTOP-TYPING-001'],'한 달의 적용 범위와 피해 회복 아님을 서로 다른 문서 동작으로 보여 주고 정확 범위만 overlay한다.'],
  '39':['source-video','document-workflow',['WM-MOVING-ARCHIVE-CABINETS-001','WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001'],'사건마다 다른 기록 묶음과 검토 동작으로 일괄 기한 오해를 막는다.'],
  '40':['source-photo','general-korean-context',['KOR-WM-NAMDAEMUN-POLICE-001','KOR-WM-ANYANG-MANAN-POLICE-001'],'기관 지정 절차로 넘어가기 전 한국 경찰기관 맥락을 설정한다.'],
  '42':['source-photo','legal-text',['KOR-WM-NAMDAEMUN-POLICE-001','KOR-WM-ANYANG-MANAN-POLICE-001'],'자동 이동이 아니라 조건부 지정이라는 최소 native cue를 한국 경찰기관 실사와 결속한다.'],
  '45':['source-photo','general-korean-context',['KOR-WM-NAMDAEMUN-POLICE-001','KOR-WM-ANYANG-MANAN-POLICE-001'],'서류 횟수가 아니라 실제 수행 기관이라는 초점을 기관 외관 교차로 전달한다.'],
  '46':['source-photo','general-korean-context',['KOR-WM-SEOUL-PROSECUTION-OFFICE-001','KOR-WM-POLICE-BUILDING-001'],'조항 존재와 현장 작동을 구분하는 한국 기관 맥락을 보여 준다.'],
  '49-50':['source-photo','document-workflow',['WM-MAN-WRITING-PAPER-001','WM-LAPTOP-TYPING-001'],'통지 뒤 이의 제기라는 별도 출발점을 일반 문서 작성 맥락으로 보여 준다.'],
  '53':['source-video','document-workflow',['WM-LAW-SCHOOL-PHOTOCOPIER-001','WM-MAN-WRITING-PAPER-001'],'의견 청취와 자료 수령을 사람·문서의 일반 업무 디테일로 구성한다.'],
  '58':['source-video','document-workflow',['WM-TYPING-EXAMPLE-001','WM-MAN-WRITING-PAPER-001'],'시행일과 기존 사건 적용례를 서로 다른 기록 묶음으로 구분한다.'],
  '59a':['source-video','document-workflow',['WM-OLIVETTI-DOCUMENT-TYPING-001','WM-MAN-WRITING-PAPER-001'],'시행 당시 이미 수사 중인 사건이라는 범위만 기존 기록 실사로 설정한다.'],
  '60':['source-video','legal-text',['WM-OLIVETTI-DOCUMENT-TYPING-001','WM-TYPING-EXAMPLE-001'],'일반 연장이 아닌 조건부 경과조치라는 경계를 기존 사건기록 실사 위 최소 cue로 전달한다.'],
  '61':['source-video','general-korean-context',['KOR-WM-ASSEMBLY-001','KOR-WM-SEOUL-PROSECUTION-OFFICE-001'],'개정문과 시행 뒤 성과 자료가 서로 다른 판단 대상임을 기관 맥락으로 분리한다.'],
  '68':['source-photo','general-korean-context',['KOR-WM-SEOUL-PROSECUTION-OFFICE-001','KOR-WM-NAMDAEMUN-POLICE-001'],'피해 회복의 실제 효과는 시행 뒤 자료가 필요하다는 빈칸을 기관 실사로 유지한다.'],
  '69':['source-photo','legal-text',['KOR-WM-SEOUL-PROSECUTION-OFFICE-001','NEW-KOR-ASSEMBLY-INTERIOR-001'],'삭제되는 제196조의 범위는 한국 입법·검찰 맥락 실사 위에 정확한 native 문구만 표시한다.'],
  '70':['source-photo','legal-text',['KOR-WM-NAMDAEMUN-POLICE-001','KOR-WM-SEOUL-PROSECUTION-OFFICE-001'],'남는 보완수사·재수사 요구 직무는 두 한국 기관 실사와 짧은 native cue로 전달한다.'],
  '71':['source-photo','legal-text',['KOR-WM-SEOUL-PROSECUTION-OFFICE-001','KOR-WM-NAMDAEMUN-POLICE-001'],'과장된 전면 상실 표현을 기관 실사와 제한된 native 반박 문구로 정리한다.'],
  '72':['source-photo','legal-text',['KOR-WM-SEOUL-PROSECUTION-OFFICE-001','KOR-WM-NAMDAEMUN-POLICE-001'],'과장된 전면 상실 표현은 한국 기관 실사와 정확한 native 반박 문구로 정리하고, YTN은 수동 최소구간 잠금 전까지 research locator로만 남긴다.'],
  '75':['source-video','exact-event',[],'시행 뒤 속도와 결과를 보여 줄 공식 통계·브리핑 영상은 아직 존재하지 않아 honest gap으로 둔다.'],
};

const omniKeys = new Set(['6','7','8-9','10','11','12','13','24-25','29','37','44','62','63','65','67','76-77','78','79']);

const evidenceByKey = (key) => {
  const n = Number.parseInt(key, 10);
  if (n <= 19) return ['LAW-196','LAW-1972'];
  if (n <= 23) return ['LAW-196','LAW-195','LAW-REVISION-21857'];
  if (n <= 48) return ['LAW-1972'];
  if (n <= 52) return ['LAW-2457','LAW-2458'];
  if (n <= 55) return ['LAW-24513'];
  if (n <= 61) return ['LAW-TRANS','LAW-TRANS-APPLICATION'];
  return ['LAW-196','LAW-195','LAW-1972'];
};

const scriptBytes = await readFile(scriptPath);
const oldSpec = JSON.parse(await readFile(specPath, 'utf8'));
const rightsInventory = JSON.parse(await readFile(rightsPath, 'utf8'));
const {normalized, sentences} = approvedNarration(scriptBytes.toString('utf8'));
const segments = semanticSegments(sentences);
const narrationHash = sha256(Buffer.from(normalized.replace(/\s/gu, ''), 'utf8'));
if (narrationHash !== '755fc7c746066bed53970de877fcacd66c92bacbbb94e9d67d80a0c4ca85f0fe') throw new Error('approved narration lock changed');
if (segments.length !== 64 || segments.map((item) => item.narration).join(' ').replace(/\s/gu, '') !== normalized.replace(/\s/gu, '')) throw new Error('semantic segmentation changed narration');

const inventory = Object.fromEntries(rightsInventory.sources.map((item) => [item.id, item]));
inventory['NEW-KOR-ASSEMBLY-INTERIOR-001'] = {
  id:'NEW-KOR-ASSEMBLY-INTERIOR-001', media_type:'photo', title:'Main conference room of South Korean National Assembly building', creator:'Dmthoth',
  item_url:'https://commons.wikimedia.org/wiki/File:Main_conference_room_of_South_korean_national_assembly_building.JPG',
  license:'CC BY-SA 3.0', license_url:'https://creativecommons.org/licenses/by-sa/3.0/',
  path:'video/source-intake/episode-001/source-first-rebuild-v01/originals/wikimedia/national-assembly-main-conference-room.jpg',
  sha256:'68313915ce2f0f51a6d75320c27a051fa6958e863be2de527f55377abc8e95fc', width:4752, height:3168,
  rights_status:'commercial-derivative-item-license-verified', commercial_use_allowed:true, derivative_use_allowed:true, locale_priority:'korean-institution-primary', production_authority:false,
};

const amberLocators = {
  'YT-TVCHOSUN-PF11-0204':{lane:'amber-direct-quotation-locator-only',selection_status:'cut-bound-once-minimum-quote',url:'https://www.youtube.com/watch?v=pf11BtbuOSc',title:'보완수사권 뭐길래',creator:'TV CHOSUN',timecode:{start:'00:02:04.759',end:'00:02:09.589'},seconds:4.83,commentary_binding:'남는 보완수사 필요성을 말하는 해당 발언을 바로 비판·대조하는 내레이션에만 결속',amount_necessity:'한 문장 발언의 완결에 필요한 4.83초',market_substitution:'동일 발언의 공식·자체 라이선스 원본이 있으면 교체',license:'YouTube Standard License / item-level reuse permission not established',content_id_risk:'high',local_acquisition_authorization:false,local_video_file:null,transcript:'metadata/youtube-transcripts/pf11BtbuOSc.ko.vtt',verification:'auto-caption and speaker identity require manual verification'},
  'YT-YTN-TYJ-1132':{lane:'amber-direct-quotation-locator-only',selection_status:'research-locator-not-cut-bound',url:'https://www.youtube.com/watch?v=T-YJtN9LehU',title:'보완수사권 폐지 현실화...수사 공백 어떻게 막나? [이슈플러스] / YTN',creator:'YTN',timecode:{start:'00:11:32.240',end:'00:11:54.829'},seconds:22.589,commentary_binding:'수사 공백·비효율 주장 중 실제 분석에 필요한 단문만 재지정해 즉시 논평',amount_necessity:'현재 locator는 22.589초 범위이며 실제 사용 전 더 짧은 문장 단위 재잠금 필수',market_substitution:'같은 주장에 대한 공식 회의·브리핑 원본이 있으면 교체',license:'YouTube Standard License / item-level reuse permission not established',content_id_risk:'high',local_acquisition_authorization:false,local_video_file:null,transcript:'metadata/youtube-transcripts/T-YJtN9LehU.ko.vtt',verification:'auto-caption and exact quote require manual verification'},
  'YT-YTN-TYJ-0041':{lane:'amber-direct-quotation-locator-only',selection_status:'research-locator-not-cut-bound',url:'https://www.youtube.com/watch?v=T-YJtN9LehU',title:'보완수사권 폐지 현실화...수사 공백 어떻게 막나? [이슈플러스] / YTN',creator:'YTN',timecode:{start:'00:00:41.960',end:'00:01:09.350'},seconds:27.39,commentary_binding:'고소·송치·보완수사요구 설명을 원 보도 표현과 직접 대조할 때만 사용',amount_necessity:'실제 사용 전 단문 단위로 축소해야 함',market_substitution:'자체 제작 절차 그래픽 또는 공식 설명 원본으로 대체 가능',license:'YouTube Standard License / item-level reuse permission not established',content_id_risk:'high',local_acquisition_authorization:false,local_video_file:null,transcript:'metadata/youtube-transcripts/T-YJtN9LehU.ko.vtt',verification:'auto-caption contains transcription errors; manual verification mandatory'},
};

// Every source-mode cut has an editorially chosen EDL. Video windows stay inside the
// previously reviewed full-script EDL ranges; photo holds declare an exact crop/treatment.
const sourceSegmentPlans = {
  '1-2':[
    {kind:'video-window',source_id:'KOR-WM-ASSEMBLY-001',edl_start_seconds:0,edl_end_seconds:4.8,output_frames:144,role:'한국 국회의사당 establishing'},
    {kind:'photo-hold',source_id:'NEW-KOR-ASSEMBLY-INTERIOR-001',output_frames:122,role:'한국 입법 공간 내부 맥락'},
  ],
  '3':[
    {kind:'amber-video-locator',source_id:'YT-TVCHOSUN-PF11-0204',source_start_seconds:124.759,source_end_seconds:129.589,output_frames:145,role:'남는 최소 보완수사 필요성 발언 1회'},
    {kind:'photo-hold',source_id:'NEW-KOR-ASSEMBLY-INTERIOR-001',output_frames:121,role:'나머지 내레이션의 한국 정치 맥락'},
  ],
  '4-5':[
    {kind:'video-window',source_id:'KOR-WM-ASSEMBLY-001',edl_start_seconds:4.8,edl_end_seconds:9.6,output_frames:144,role:'정책 질문을 여는 국회 외관'},
    {kind:'photo-hold',source_id:'NEW-KOR-ASSEMBLY-INTERIOR-001',output_frames:128,role:'설명 약속을 받치는 입법 공간'},
  ],
  '16':[{kind:'video-window',source_id:'WM-DOCUMENT-SCANNING-001',edl_start_seconds:0,edl_end_seconds:6.266667,output_frames:188,role:'빠진 기록을 더 확인하는 문서 전자화'}],
  '17':[
    {kind:'video-window',source_id:'WM-MOVING-ARCHIVE-CABINETS-001',edl_start_seconds:0,edl_end_seconds:5.666667,output_frames:170,role:'기록과 증거 보관·이동'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:60,role:'인계 기록 확인'},
  ],
  '18-19':[
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:120,role:'신고와 초동수사 기관'},
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:188,role:'송치 뒤 기록 위치'},
  ],
  '23':[
    {kind:'video-window',source_id:'WM-DOCUMENT-SCANNING-001',edl_start_seconds:8,edl_end_seconds:10.233333,output_frames:67,role:'요구 기록 편입'},
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:0,edl_end_seconds:3,output_frames:90,role:'남는 직무 원문 확인 업무'},
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:97,role:'검사 직무 기관 맥락'},
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:97,role:'요구를 이행하는 수사기관 맥락'},
  ],
  '27':[
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:0,edl_end_seconds:4,output_frames:120,role:'확인 대상과 이유 작성'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:82,role:'구체 요구서 작성 detail A'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:82,role:'구체 요구서 작성 detail B'},
  ],
  '28':[
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:4,edl_end_seconds:7,output_frames:90,role:'이유와 내용 구체화'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:82,role:'확인 대상 작성 detail'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:82,role:'필요 이유 작성 detail'},
  ],
  '30':[
    {kind:'video-window',source_id:'WM-LAW-SCHOOL-PHOTOCOPIER-001',edl_start_seconds:0,edl_end_seconds:4,output_frames:120,role:'사건 서류 복사·동봉'},
    {kind:'video-window',source_id:'WM-DOCUMENT-SCANNING-001',edl_start_seconds:10.233333,edl_end_seconds:12.5,output_frames:68,role:'구체 요구서 기록 편입'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:90,role:'증거물 목록 작성'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:91,role:'긴급성 예외 검토'},
  ],
  '31-32':[
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:3,edl_end_seconds:5.5,output_frames:75,role:'관리 시스템 요구 입력'},
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:5.5,edl_end_seconds:8,output_frames:75,role:'처리 상태 입력'},
    {kind:'video-window',source_id:'WM-DOCUMENT-SCANNING-001',edl_start_seconds:12.5,edl_end_seconds:16.233333,output_frames:112,role:'결과 문서 시스템 편입'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:119,role:'예외 사유 기록'},
  ],
  '33-35':[
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:8,edl_end_seconds:12,output_frames:120,role:'사실관계 확인 기록 입력'},
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:7,edl_end_seconds:10,output_frames:90,role:'기간 기준이 붙는 요구 문서'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:140,role:'누가 언제 무엇을 요구했는지 기록'},
    {kind:'photo-hold',source_id:'WM-LAPTOP-TYPING-001',output_frames:140,role:'한 달 기준 확인'},
  ],
  '36-37':[
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:10,edl_end_seconds:13,output_frames:90,role:'보완수사 요구 이행 문서'},
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:13,edl_end_seconds:17,output_frames:120,role:'요구일과 별도 기간 문서화'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:103,role:'한 달 적용 범위 확인'},
    {kind:'photo-hold',source_id:'WM-LAPTOP-TYPING-001',output_frames:104,role:'피해 회복과 절차 기간 구분'},
  ],
  '39':[
    {kind:'video-window',source_id:'WM-MOVING-ARCHIVE-CABINETS-001',edl_start_seconds:5.9,edl_end_seconds:8.633333,output_frames:82,role:'사건별 다른 기록 묶음'},
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:17,edl_end_seconds:20,output_frames:90,role:'조건별 문서 작성'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:119,role:'일괄 기한 오해 방지'},
  ],
  '40':[
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:90,role:'담당 수사관서'},
    {kind:'photo-hold',source_id:'KOR-WM-ANYANG-MANAN-POLICE-001',output_frames:90,role:'다른 수사기관 후보'},
  ],
  '42':[
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:120,role:'자동 이동이 아닌 담당 기관'},
    {kind:'photo-hold',source_id:'KOR-WM-ANYANG-MANAN-POLICE-001',output_frames:213,role:'조건 충족 시 지정될 다른 기관'},
  ],
  '45':[
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:145,role:'기존 담당 기관'},
    {kind:'photo-hold',source_id:'KOR-WM-ANYANG-MANAN-POLICE-001',output_frames:146,role:'실제 수행 가능한 기관'},
  ],
  '46':[
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:101,role:'조항을 적용하는 검찰기관'},
    {kind:'photo-hold',source_id:'KOR-WM-POLICE-BUILDING-001',output_frames:101,role:'현장에서 작동할 수사기관'},
  ],
  '49-50':[
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:119,role:'불송치 이의 문서 작성'},
    {kind:'photo-hold',source_id:'WM-LAPTOP-TYPING-001',output_frames:120,role:'별도 경로 확인'},
  ],
  '53':[
    {kind:'video-window',source_id:'WM-LAW-SCHOOL-PHOTOCOPIER-001',edl_start_seconds:7,edl_end_seconds:11,output_frames:120,role:'공소 제기·유지 자료 제출·복사'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:140,role:'의견과 자료 수령 기록'},
  ],
  '58':[
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:17,edl_end_seconds:20,output_frames:90,role:'조항별 시행일·적용례 확인'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:67,role:'시행일 기록'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:67,role:'기존 사건 적용례 기록'},
  ],
  '59a':[
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:23,edl_end_seconds:25.64,output_frames:79,role:'종전 규정 사건 문서 확인'},
    {kind:'photo-hold',source_id:'WM-MAN-WRITING-PAPER-001',output_frames:79,role:'시행 당시 수사 중 사건 범위'},
  ],
  '60':[
    {kind:'video-window',source_id:'WM-OLIVETTI-DOCUMENT-TYPING-001',edl_start_seconds:27,edl_end_seconds:31,output_frames:120,role:'조건부 경과조치 문서'},
    {kind:'video-window',source_id:'WM-TYPING-EXAMPLE-001',edl_start_seconds:20,edl_end_seconds:23.866667,output_frames:116,role:'개정문과 시행 뒤 자료 구분'},
  ],
  '61':[
    {kind:'video-window',source_id:'KOR-WM-ASSEMBLY-001',edl_start_seconds:9.6,edl_end_seconds:13.6,output_frames:120,role:'개정문을 만든 한국 입법 맥락'},
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:119,role:'시행 뒤 처리 기관 detail A'},
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:118,role:'시행 뒤 자료 판단 detail B'},
  ],
  '68':[
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:93,role:'시행 뒤 성과 자료가 필요한 검찰기관'},
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:93,role:'시행 뒤 성과 자료가 필요한 경찰기관'},
  ],
  '69':[
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:142,role:'삭제 조항이 영향을 주는 검찰기관'},
    {kind:'photo-hold',source_id:'NEW-KOR-ASSEMBLY-INTERIOR-001',output_frames:142,role:'개정문 입법 맥락'},
  ],
  '70':[
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:110,role:'요구를 이행하는 수사기관'},
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:110,role:'요구 직무가 남는 검찰기관'},
  ],
  '71':[
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:127,role:'전면 역할 상실이 아닌 검찰기관'},
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:127,role:'남는 요구를 수행할 수사기관'},
  ],
  '72':[
    {kind:'photo-hold',source_id:'KOR-WM-SEOUL-PROSECUTION-OFFICE-001',output_frames:127,role:'과장 표현을 바로잡는 검찰기관 맥락'},
    {kind:'photo-hold',source_id:'KOR-WM-NAMDAEMUN-POLICE-001',output_frames:127,role:'보완수사가 남는 수사기관 맥락'},
  ],
};

function beatWindows(duration) {
  const count = Math.max(2, Math.ceil(duration / 120));
  const base = Math.floor(duration / count);
  let cursor = 0;
  return Array.from({length:count}, (_, index) => {
    const end = index === count - 1 ? duration : cursor + base;
    const result = [cursor, end]; cursor = end; return result;
  });
}

function requirement(shotId, sourceId, index, extra = {}) {
  return {requirement_id:`${shotId}-${slug(sourceId)}-${index + 1}`,kind:'source-original',source_id:sourceId,asset_id:`${shotId.toLowerCase()}-${slug(sourceId)}-${index + 1}`,approved_media_asset_id:null,materialization_record_id:null,materialization_record_path:null,status:'blocked',blocker:'human_source_semantic_review_and_materialization_pending',...extra};
}

const fpsNumber = (value) => {
  if (typeof value === 'number') return value;
  const [numerator,denominator='1'] = String(value ?? '').split('/').map(Number);
  return numerator / denominator;
};

function exactSourceSegments(segment, duration) {
  const plan = sourceSegmentPlans[segment.key];
  if (!plan) return [];
  const nonPhotos = plan.filter((item)=>item.kind!=='photo-hold');
  const photoTemplates = plan.filter((item)=>item.kind==='photo-hold');
  const remainingPhotoFrames = duration-nonPhotos.reduce((sum,item)=>sum+item.output_frames,0);
  let adjustedPhotos = [];
  if (remainingPhotoFrames > 0) {
    if (!photoTemplates.length) throw new Error(`${segment.key}: ${remainingPhotoFrames} uncovered frames without photo hold`);
    const minCount = Math.ceil(remainingPhotoFrames/120);
    const maxCount = Math.floor(remainingPhotoFrames/60);
    const count = Math.max(minCount,Math.min(photoTemplates.length,maxCount));
    if (count>maxCount) throw new Error(`${segment.key}: photo remainder cannot keep 2–4s rhythm`);
    const base = Math.floor(remainingPhotoFrames/count);
    adjustedPhotos = Array.from({length:count},(_,index)=>({...photoTemplates[index%photoTemplates.length],output_frames:index===count-1?remainingPhotoFrames-base*(count-1):base}));
  } else if (remainingPhotoFrames < 0) throw new Error(`${segment.key}: fixed video/Amber segments exceed cut duration`);
  const adjustedPlan = [...nonPhotos,...adjustedPhotos];
  const expandedPlan = adjustedPlan.flatMap((item)=>{
    if (!['photo-hold','video-window'].includes(item.kind) || item.output_frames <= 120) return [item];
    const count = Math.ceil(item.output_frames/120);
    const base = Math.floor(item.output_frames/count);
    let usedFrames = 0;
    return Array.from({length:count},(_,index)=>{
      const outputFrames = index===count-1?item.output_frames-base*(count-1):base;
      const startRatio = usedFrames/item.output_frames;
      usedFrames += outputFrames;
      const endRatio = usedFrames/item.output_frames;
      return {...item,output_frames:outputFrames,role:`${item.role} ${index+1}/${count}`,...(item.kind==='video-window'?{edl_start_seconds:item.edl_start_seconds+(item.edl_end_seconds-item.edl_start_seconds)*startRatio,edl_end_seconds:item.edl_start_seconds+(item.edl_end_seconds-item.edl_start_seconds)*endRatio}:{})};
    });
  });
  let timelineFrame = 0;
  const exact = expandedPlan.map((item,index) => {
    const outputStart = timelineFrame;
    timelineFrame += item.output_frames;
    if (item.kind === 'amber-video-locator') return {...item,segment_index:index+1,start_frame:outputStart,end_frame_exclusive:timelineFrame,output_seconds:item.output_frames/30,local_acquisition_authorization:false,local_video_file:null};
    const source = inventory[item.source_id];
    if (!source) throw new Error(`${segment.key}: missing inventory ${item.source_id}`);
    if (item.kind === 'photo-hold') return {...item,segment_index:index+1,start_frame:outputStart,end_frame_exclusive:timelineFrame,hold_frames:item.output_frames,hold_seconds:item.output_frames/30,crop_normalized:index%2===0?{x:0.04,y:0.04,width:0.92,height:0.92}:{x:0.08,y:0.06,width:0.86,height:0.88},treatment:'documentary-static-or-subtle-reframe',source_path:source.path,source_sha256:source.sha256,source_width:source.width,source_height:source.height};
    const fps = fpsNumber(source.fps);
    const sourceStartFrame = Math.round(item.edl_start_seconds * fps);
    const sourceEndFrame = Math.round(item.edl_end_seconds * fps);
    return {...item,segment_index:index+1,start_frame:outputStart,end_frame_exclusive:timelineFrame,output_seconds:item.output_frames/30,source_start_frame:sourceStartFrame,source_end_frame_exclusive:sourceEndFrame,source_start_seconds:Number((sourceStartFrame/fps).toFixed(6)),source_end_seconds:Number((sourceEndFrame/fps).toFixed(6)),source_fps:source.fps,original_duration_seconds:source.duration_seconds,original_width:source.width,original_height:source.height,source_path:source.path,source_sha256:source.sha256,verified_edl_binding:{path:'video/source-intake/episode-001/full-script-usable-v01/source-selection-edl.json',start_seconds:item.edl_start_seconds,end_seconds:item.edl_end_seconds}};
  });
  if (timelineFrame !== duration) throw new Error(`${segment.key}: exact source segments cover ${timelineFrame}/${duration} frames`);
  return exact;
}

const matrixCuts = [];
const cuts = segments.map((segment, index) => {
  const shotId = `SH${String(index + 1).padStart(3, '0')}`;
  const configured = sourceConfig[segment.key];
  const mode = configured?.[0] ?? (omniKeys.has(segment.key) ? 'omni' : 'remotion');
  const taxonomy = configured?.[1] ?? (mode === 'omni' ? 'fictional-continuity' : 'legal-text');
  const sourceIds = configured?.[2] ?? evidenceByKey(segment.key);
  const visualAction = configured?.[3] ?? (mode === 'omni'
    ? '동일한 가상 피해자·노트북·택배·결제 기록의 continuity를 유지하고, 독립 소품 상태 변화만 text-free keyframe으로 계획한다.'
    : '공식 법률 원문은 화면 밖 근거로 결속하고, 대사의 법적 관계·조건·기간·반대 경로만 래스터 없는 native vector surface로 설명한다.');
  const compact = segment.narration.replace(/\s/gu, '').length;
  const voiceFrames = Math.ceil((compact / 4.965) * 30);
  const postHold = index === segments.length - 1 ? 47 : 0;
  const duration = Math.max(132, voiceFrames) + postHold;
  let requirements;
  if (mode === 'omni') {
    requirements = [1,2].map((number, reqIndex) => ({...requirement(shotId,`IMAGEGEN-OMNI-${shotId}-KF0${number}`,reqIndex),kind:'imagegen-asset',blocker:'continuity_locked_imagegen_png_and_human_keyframe_review_pending',production_use:'fictional continuity keyframe input only; evidence=false; no Omni video before all-cut PASS'}));
  } else if (mode === 'remotion') {
    requirements = sourceIds.map((sourceId, reqIndex) => requirement(shotId,sourceId,reqIndex,{production_use:'evidence-provenance-only; capture pixels forbidden on production canvas',blocker:'official_source_lock_and_transcription_review_pending'}));
  } else if (!sourceIds.length) {
    requirements = [requirement(shotId,`SOURCE-SEARCH-${shotId}`,0,{production_use:'source-search gap only; no visual file selected',blocker:'semantically_matching_self_service_source_not_found'})];
  } else {
    requirements = sourceIds.map((sourceId, reqIndex) => {
      const green = inventory[sourceId], amber = amberLocators[sourceId];
      if (!green && !amber) throw new Error(`${shotId}: unknown source ${sourceId}`);
      return requirement(shotId,sourceId,reqIndex, green ? {
        candidate_source_path:green.path,candidate_sha256:green.sha256,media_type:green.media_type,item_url:green.item_url,creator:green.creator,license:green.license,license_url:green.license_url,original_duration_seconds:green.duration_seconds,original_width:green.width,original_height:green.height,original_fps:green.fps,rights_lane:'green-item-license-verified',production_use:'context-only; never evidence or a depiction of the hypothetical crime',blocker:'human_semantic_review_and_materialization_pending',
      } : {
        media_type:'video',item_url:amber.url,creator:amber.creator,license:amber.license,rights_lane:amber.lane,exact_timecode:amber.timecode,commentary_binding:amber.commentary_binding,amount_necessity:amber.amount_necessity,market_substitution:amber.market_substitution,content_id_risk:amber.content_id_risk,local_acquisition_authorization:false,production_use:'direct quotation candidate only; no local clip acquired',blocker:'manual_quote_verification_and_exception_review_pending',
      });
    });
  }
  if (mode !== 'remotion' && mode !== 'omni' && taxonomy === 'legal-text') {
    const offset = requirements.length;
    requirements.push(...evidenceByKey(segment.key).map((sourceId,evidenceIndex)=>requirement(shotId,sourceId,offset+evidenceIndex,{production_use:'evidence-provenance-only; capture pixels forbidden on production canvas',blocker:'official_source_lock_and_transcription_review_pending'})));
  }
  const prefix = shotId.toLowerCase();
  const labelId = `${prefix}-source-label`;
  const isRemotion = mode === 'remotion';
  const visualRequirements = mode === 'remotion' ? [] : requirements.filter((item)=>item.production_use !== 'evidence-provenance-only; capture pixels forbidden on production canvas');
  const mainId = isRemotion ? `${prefix}-procedure-path` : `${prefix}-visual-main`;
  const detailId = isRemotion ? `${prefix}-native-text` : `${prefix}-visual-detail`;
  const nativeTextId = `${prefix}-native-legal-text`;
  const needsNativeLegalText = !isRemotion && taxonomy === 'legal-text';
  const components = isRemotion ? [
    {component_id:mainId,asset_requirement_id:null,semantic_role:'primary',render_kind:'svg-path',compositing:'procedural-layer',motion_expectation:'procedural',atomicity:'single-editable-object',presentation_slot:'hero',implementation_status:'planned-not-implemented'},
    {component_id:detailId,asset_requirement_id:null,semantic_role:'primary',render_kind:'document-highlight',compositing:'raster-free-native-dom-vector',raster_beneath:false,raster_composite:false,text_surface_role:'surface-content',motion_expectation:'procedural',atomicity:'single-editable-object',presentation_slot:'detail',implementation_status:'planned-not-implemented'},
    {component_id:labelId,asset_requirement_id:null,semantic_role:'supporting',render_kind:'svg-path',compositing:'raster-free-native-dom-vector',raster_beneath:false,raster_composite:false,text_surface_role:'asset-label',motion_expectation:'static',atomicity:'single-editable-object',presentation_slot:'source-label-lane',implementation_status:'planned-not-implemented'},
  ] : [
    {component_id:mainId,asset_requirement_id:visualRequirements[0].requirement_id,semantic_role:'primary',render_kind:'asset',compositing:mode === 'omni'?'single-imagegen-keyframe-input':'single-flattened-source-surface',motion_expectation:mode === 'omni'?'keyframe-state-only':mode === 'source-video'?'source-internal-motion':'subtle-reframe',atomicity:'single-editable-object',presentation_slot:'full-frame',implementation_status:'planned-not-implemented',...(mode === 'omni'?{asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}:{})},
    {component_id:detailId,asset_requirement_id:(visualRequirements[1] ?? visualRequirements[0]).requirement_id,semantic_role:'primary',render_kind:'asset',compositing:mode === 'omni'?'single-imagegen-keyframe-input':'source-bound-detail-window',motion_expectation:mode === 'omni'?'keyframe-state-only':'subtle-reframe',atomicity:'single-editable-object',presentation_slot:'full-frame-detail',implementation_status:'planned-not-implemented',...(mode === 'omni'?{asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}:{})},
    {component_id:labelId,asset_requirement_id:null,semantic_role:'supporting',render_kind:'svg-path',compositing:'raster-free-native-dom-vector',raster_beneath:false,raster_composite:false,text_surface_role:'asset-label',motion_expectation:'static',atomicity:'single-editable-object',presentation_slot:'source-label-lane',implementation_status:'planned-not-implemented'},
    ...(needsNativeLegalText?[{component_id:nativeTextId,asset_requirement_id:null,semantic_role:'supporting',render_kind:'document-highlight',compositing:'raster-free-native-dom-vector',raster_beneath:false,raster_composite:false,text_surface_role:'surface-content',motion_expectation:'static',atomicity:'single-editable-object',presentation_slot:'native-legal-cue',implementation_status:'planned-not-implemented'}]:[]),
  ];
  const windows = beatWindows(duration);
  const visualBeats = windows.map(([start,end], beatIndex) => {
    const focal = beatIndex % 2 === 0 ? mainId : detailId;
    const supporting = beatIndex % 2 === 0 ? detailId : mainId;
    const graphicsFirst = isRemotion && beatIndex % 2 === 0;
    const purpose = isRemotion ? (graphicsFirst?'draw-relationship':'emphasize-verified-meaning') : (beatIndex % 2 === 0?'establish-source-context':'reframe-source-detail');
    const operator = isRemotion ? (graphicsFirst
      ? {operator_id:'svg.stroke-draw@1',required_capability:'relationship-path',action_semantic:'draw-relationship',parameters:{from_progress:0,to_progress:1}}
      : {operator_id:'document.highlight@1',required_capability:'document-emphasis',action_semantic:'emphasize-document',parameters:{from_progress:0,to_progress:1}})
      : (beatIndex % 2 === 0
        ? {operator_id:'transform.tween@1',required_capability:'layer-transform',action_semantic:'move-subject',parameters:{from_scale:1.02,to_scale:1,from_x:12,to_x:0}}
        : {operator_id:'mask.inset@1',required_capability:'mask-reveal',action_semantic:'reveal-region',parameters:{from_right_percent:18,to_right_percent:0}});
    return {beat_id:`${shotId}-B${String(beatIndex + 1).padStart(2,'0')}`,viewer_takeaway:segment.narration,purpose,narration_window:{start_frame:start,end_frame_exclusive:end},presentation:{layout_template:isRemotion?'process-flow':'experience-hero',focal:{component_id:focal,slot:beatIndex % 2?'detail':'hero'},supporting:[{component_id:supporting},{component_id:labelId},...(needsNativeLegalText?[{component_id:nativeTextId}]:[])],hidden:[]},component_visibility:[{component_id:focal,states:[{state:beatIndex === windows.length - 1?'final-summary':'focused',start_frame:start,end_frame_exclusive:end}]},{component_id:supporting,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]},{component_id:labelId,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]},...(needsNativeLegalText?[{component_id:nativeTextId,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]}]:[])],planned_operator:{status:'planned-not-implemented',...operator,target_component_id:focal,start_frame:start,end_frame_exclusive:start + 6,observable_change:`${purpose}: ${segment.internal_focus[beatIndex] ?? segment.narration}`},stable_reading_hold:{start_frame:end - 60,end_frame_exclusive:end,frames:60},document_phase:null,preview_status:'blocked-assets-pending'};
  });
  const candidateStatus = mode === 'remotion'?'not-applicable-justified-remotion':mode === 'omni'?'planned-keyframe-input-blocked-all-cut-pass':requirements.some((item)=>item.rights_lane?.startsWith('amber'))?'amber-locator-only-no-local-media':requirements[0].source_id.startsWith('SOURCE-SEARCH-')?'honest-source-gap':'green-local-candidate-pending-human-review';
  const selectionStatus = mode === 'remotion'?'not-applicable-justified-remotion':mode === 'omni'?'not-applicable-fictional-omni-keyframes':candidateStatus;
  const longReason = duration > 240 ? `이 컷은 ${segment.internal_focus.length || windows.length}개의 의미 초점을 ${windows.length}개 2–4초 presentation segment로 나눠 대본의 원인-조건-귀결을 보존한다.` : null;
  const exactSegments = ['source-video','source-photo'].includes(mode) ? exactSourceSegments(segment,duration) : windows.map(([start,end],i)=>({segment_index:i+1,start_frame:start,end_frame_exclusive:end,output_frames:end-start,output_seconds:(end-start)/30,source_id:null}));
  if (['source-video','source-photo'].includes(mode) && !exactSegments.length && !requirements.some((item)=>item.source_id===`SOURCE-SEARCH-${shotId}`)) throw new Error(`${shotId}: source mode lacks exact editorial segments`);
  matrixCuts.push({cut_id:shotId,script_sentence_numbers:segment.sentence_numbers,semantic_key:segment.key,narration:segment.narration,duration_frames:duration,duration_seconds:duration/30,source_need_taxonomy:taxonomy,production_mode:mode,visual_need:visualAction,planned_visual_segments:exactSegments,candidate_status:candidateStatus,selected_source_ids:visualRequirements.map((item)=>item.source_id),rights_lane:requirements.some((item)=>item.rights_lane?.startsWith('amber'))?'amber':requirements.some((item)=>item.rights_lane?.startsWith('green'))?'green':mode === 'remotion'?'official-evidence-off-canvas':mode === 'omni'?'imagegen-planned':'gap',long_cut_reason:longReason,production_authority:false});
  return {shot_id:shotId,production_mode:mode,draft_narration:segment.narration,visual_purpose:`${segment.narration}의 의미를 ${taxonomy} 화면 필요에 맞춰 전달한다.`,visual_action:visualAction,source_need_taxonomy:taxonomy,semantic_sentence_numbers:segment.sentence_numbers,internal_presentation_segments:matrixCuts.at(-1).planned_visual_segments,long_cut_reason:longReason,source_ids:requirements.map((item)=>item.source_id),estimated_voice_seconds:[Math.round((compact/4.965)*9)/10,Math.round((compact/4.965)*11)/10],pre_roll_frames:Math.max(0,132-voiceFrames),post_hold_frames:postHold,transition_overlap_frames:0,duration_frames:null,master_occupancy_frames:null,viewer_takeaway:segment.narration,usage_layer:isRemotion?'necessary-explanation':mode === 'omni'?'fictional-editorial-reconstruction':'contextual-real-media',acquisition:{priority:isRemotion?['OFFICIAL-LAW-EVIDENCE','JUSTIFIED-REMOTION']:mode === 'omni'?['IMAGEGEN-OMNI']:['KOREAN-GREEN-SELF-SERVICE','COMMONS-GREEN-FALLBACK','AMBER-DIRECT-QUOTE-EXCEPTION'],candidate_status:candidateStatus,preserve_full_original:mode !== 'omni'},candidate_selection:{status:selectionStatus,review_path:projectPath(matrixPath),candidate_ids:visualRequirements.map((item)=>item.source_id),rights_approval:false,production_visible:false,semantic_limits:visualAction},motion_graphics_justification:isRemotion?'실사로는 대사의 정확한 법적 관계·조건·기간·반대 경로를 표현할 수 없어 공식 근거에 결속한 래스터 없는 설명 화면이 필요하다.':null,imagegen_assets:mode === 'omni'?requirements.map((item,keyframeIndex)=>({asset_id:item.asset_id,requirement_id:item.requirement_id,status:'planned-not-created',origin:'imagegen-editorial-reconstruction',identity_scope:'fictional-generic',ai_disclosure:true,evidence:false,keyframe_index:keyframeIndex+1,continuity_group:'ep001-fictional-purchase-delivery-report',semantic_summary:segment.narration,visual_translation:visualAction,prompt_status:'pending-exact-continuity-design-and-human-review',readable_text_names_dates_numbers_logos_ui_watermarks_forbidden:true})):[],designed_assets:[],transparent_derivatives:[],evidence_originals:(isRemotion||needsNativeLegalText)?evidenceByKey(segment.key):[],requirements,presentation:{focal:mainId,supporting:[detailId,labelId,...(needsNativeLegalText?[nativeTextId]:[])],hidden_until:[],layout_template:isRemotion?'process-flow':'experience-hero'},visual_beats:visualBeats,document_contract:null,raster_free_text_contract:{required:true,capture_pixels_allowed_on_canvas:false,native_dom_or_vector:true,raster_beneath:false,raster_composite:false,evidence_source_ids:(isRemotion||needsNativeLegalText)?evidenceByKey(segment.key):[],text_component_ids:isRemotion?[detailId]:needsNativeLegalText?[nativeTextId]:[]},typography_surface_contract_version:2,layout_contract_version:2,text_surfaces:[{component_id:labelId,role:'asset-label',rotation_degrees:0,placement:'dedicated-lane-below-named-target',asset_gap_px:48,target_centerline_offset_px:0,raster_beneath:false,raster_composite:false},...(isRemotion?[{component_id:detailId,role:'surface-content',rotation_degrees:0,placement:'raster-free-native-vector-surface',raster_beneath:false,raster_composite:false,transcription_status:'pending-human-source-lock'}]:needsNativeLegalText?[{component_id:nativeTextId,role:'surface-content',rotation_degrees:0,placement:'raster-free-native-vector-overlay-rail',raster_beneath:false,raster_composite:false,transcription_status:'pending-human-source-lock'}]:[])],layout_contract:{version:2,row_asset_min_gap_px:64,row_gap_variance_max_px:64,baseline_group:'primary-source-row',unintended_overlap_allowed:false},timing:{provisional_duration_frames:duration,master_occupancy_frames:duration,reading_hold_frames:60},transition:{type:'hard-cut',intent:index === segments.length - 1?'closing stable hold':'semantic hard cut after the current beat resolves',next_shot_id:index === segments.length - 1?null:`SH${String(index+2).padStart(3,'0')}`,implementation_status:'planned-not-implemented'},missing_inputs:mode === 'remotion'?['official source transcription review','reference grammar applicability decision','playable parity and user cut PASS']:mode === 'omni'?['continuity-locked Imagegen PNG keyframes','human semantic/visual/decomposition review','episode-level all-cut PASS before Omni video generation']:['human semantic approval','item-level rights review','materialization record','full-cut preview and user cut PASS'],fallback:{allowed:mode === 'remotion'?'revised raster-free explanation bound to the same official evidence':mode === 'omni'?'revised continuity-locked fictional keyframe input after human review':'another human-reviewed source with the same semantic role',forbidden:'unrelated media, webpage pixels, generic beige board, or unreviewed AI reconstruction'},components,media_strategy:{priority:isRemotion?['source-video','source-photo','remotion']:mode === 'omni'?['omni-keyframe-input']:['source-video','source-photo','remotion'],dominant_surface:isRemotion?'raster-free-native-procedure-surface':mode === 'omni'?'full-frame-fictional-keyframe-input':'full-frame-real-source',overlay_policy:needsNativeLegalText?'source stays dominant; exact native legal text is confined to a separate raster-free rail':'short source label and necessary native explanation only',source_search_status:candidateStatus,fallback_rule:'missing media remains blocked; no unrelated fill',evidence_substitution_forbidden:true},production_authority:false};
});

const modeCounts = cuts.reduce((result,cut)=>({...result,[cut.production_mode]:(result[cut.production_mode]??0)+1}),{});
const taxonomyCounts = matrixCuts.reduce((result,cut)=>({...result,[cut.source_need_taxonomy]:(result[cut.source_need_taxonomy]??0)+1}),{});
const totalFrames = cuts.reduce((sum,cut)=>sum+cut.timing.master_occupancy_frames,0);
if (totalFrames !== 16760) throw new Error(`provisional authority changed: ${totalFrames}`);
const modeFrames = cuts.reduce((result,cut)=>({...result,[cut.production_mode]:(result[cut.production_mode]??0)+cut.timing.master_occupancy_frames}),{});
const modeCoverage = Object.fromEntries(Object.entries(modeFrames).map(([mode,frames])=>[mode,{frames,seconds:frames/30,percent:Number((frames/totalFrames*100).toFixed(1))}]));
const fullFrameFrames = (modeFrames['source-video']??0)+(modeFrames['source-photo']??0)+(modeFrames.omni??0);
const acquiredGreenFrames = matrixCuts.flatMap((cut)=>cut.planned_visual_segments).filter((item)=>['video-window','photo-hold'].includes(item.kind)).reduce((sum,item)=>sum+item.output_frames,0);
const amberFrames = matrixCuts.flatMap((cut)=>cut.planned_visual_segments).filter((item)=>item.kind==='amber-video-locator').reduce((sum,item)=>sum+item.output_frames,0);
const honestGapFrames = matrixCuts.filter((cut)=>cut.rights_lane==='gap').reduce((sum,cut)=>sum+cut.duration_frames,0);
const usedGreenIds = [...new Set(matrixCuts.flatMap((cut)=>cut.rights_lane === 'green'?cut.selected_source_ids:[]))];
const approvedScriptSourceHash = oldSpec.script_lock.source_sha256;
const matrix = {schema_version:1,candidate_id:'episode-001-source-first-rebuild-v01',generated_at:'2026-09-10T00:00:00+09:00',status:'candidate-only-source-first-plan-blocked',review_profile:'source-video-selection',production_authority:false,user_source_pass:false,episode_spec:'video/episodes/episode-001/episode-spec.json',script_lock:{source_sha256:approvedScriptSourceHash,narration_sha256:narrationHash,compact_character_count:2761},selection_standard:{taxonomy:['exact-event','actual-speech','general-korean-context','document-workflow','legal-text','fictional-continuity'],green_rule:'항목별 상업·변형 허용과 creator/license가 확인되고 로컬 원본 hash/decode가 확보된 self-service 자료',amber_rule:'발언·보도 표현 자체를 바로 분석할 때 필요한 최소 분량의 정확한 원문 인용 locator만 허용; 일반 B-roll 금지; 로컬 다운로드 권한 근거 없으면 파일화 금지',mode_rule:{'source-video/source-photo':'실제 인물·기관·사건·일반 한국 맥락과 문서 동작','remotion':'정확한 법률 문구·관계·기간·반대 경로','omni':'명시적으로 가상인 중고거래 연속성만'},segment_rule:'기본 2–4초, 읽기·원 발언 완결 hold만 예외; 8초 초과 컷은 복수 presentation segment와 이유를 기록',gap_rule:'의미가 맞는 self-service source가 없으면 gap으로 남기며 무관한 자료로 채우지 않는다.'},summary:{cuts_total:cuts.length,mode_counts:modeCounts,mode_coverage:modeCoverage,full_frame_source_or_omni:{frames:fullFrameFrames,seconds:fullFrameFrames/30,percent:Number((fullFrameFrames/totalFrames*100).toFixed(1))},actual_local_green_coverage:{frames:acquiredGreenFrames,seconds:acquiredGreenFrames/30,percent:Number((acquiredGreenFrames/totalFrames*100).toFixed(1))},amber_locator_coverage:{frames:amberFrames,seconds:amberFrames/30,percent:Number((amberFrames/totalFrames*100).toFixed(1))},honest_gap_coverage:{frames:honestGapFrames,seconds:honestGapFrames/30,percent:Number((honestGapFrames/totalFrames*100).toFixed(1))},local_green_plus_planned_omni:{frames:acquiredGreenFrames+(modeFrames.omni??0),seconds:(acquiredGreenFrames+(modeFrames.omni??0))/30,percent:Number(((acquiredGreenFrames+(modeFrames.omni??0))/totalFrames*100).toFixed(1))},taxonomy_counts:taxonomyCounts,green_source_cuts:matrixCuts.filter((cut)=>cut.rights_lane==='green').length,amber_locator_cuts:matrixCuts.filter((cut)=>cut.rights_lane==='amber').length,honest_gap_cuts:matrixCuts.filter((cut)=>cut.rights_lane==='gap').length,green_unique_assets:usedGreenIds.length,new_downloads_accepted:1,new_downloads_rejected:1,provisional_master_frames:totalFrames,provisional_master_seconds:totalFrames/30},green_inventory:usedGreenIds.map((id)=>inventory[id]),new_acquisition_rejected:[{id:'NEW-KOR-ASSEMBLY-SEAT-2014-REJECTED',path:'video/source-intake/episode-001/source-first-rebuild-v01/originals/wikimedia/national-assembly-seat-2014.jpg',item_url:'https://commons.wikimedia.org/wiki/File:National_Assembly_of_the_Republic_of_Korea_seat_2014-4-29.jpg',license:'Public domain',sha256:'180f275ef001b1a8da523c16c3e4361cea44e5291f87cf839aa0e69cebe7a053',width:582,height:272,disposition:'reject-resolution-below-production-target'}],amber_locators:Object.values(amberLocators),cuts:matrixCuts};
await writeFile(matrixPath,`${JSON.stringify(matrix,null,2)}\n`,'utf8');
const matrixHash = sha256(await readFile(matrixPath));
const spec = {...oldSpec,status:'approved-script-source-first-semantic-plan-blocked',narration_contract:{...oldSpec.narration_contract,status:'user-approved-editorial-script-provisional-timing',runtime_note:'사용자 승인 대본 sections 1–8을 byte-lock한 64 semantic-cut source-first provisional timing. 최종 녹음 뒤 실제 길이를 다시 측정한다.',cut_count_target:{min:60,max:70}},timing_authority:{...oldSpec.timing_authority,provisional_master_frames:totalFrames,provisional_master_seconds:totalFrames/30},background_contract:{required_per_cut:'approved full-frame source-video/source-photo, continuity-locked fictional Omni keyframe input, or specifically justified raster-free explanation',visual:'real source fills actual context; fictional continuity uses reviewed text-free keyframe inputs; exact legal relationships use raster-free native surfaces',rule:'의미에 맞는 source가 없으면 gap으로 남기고 production_authority=false를 유지한다.'},production_gates:['candidate selection remains review-only until human semantic review, item-level rights approval and materialization','YouTube Amber entries remain locator-only until manual quotation verification and an authorized acquisition route exist','source-video/source-photo fills the frame; captured-page pixels remain evidence/provenance-only','Omni is limited to fictional continuity keyframe inputs; no Omni video before every cut PASS'],cuts,script_lock:{...oldSpec.script_lock,narration_sha256:narrationHash,compact_character_count:2761},editorial_revision:{schema_version:1,id:'ep001-source-first-semantic-v2',status:'candidate-plan-blocked',supersedes_visual_plan:'ep001-live-action-footage-first-v1',superseded_plan_production_authority:false,approved_script_source:'wiki/syntheses/episode-001-live-action-script-draft-v1.md',cut_count:cuts.length,mode_counts:modeCounts,source_need_taxonomy_counts:taxonomyCounts,source_review:projectPath(matrixPath),source_review_sha256:matrixHash,fictional_continuity:{status:'planned-keyframe-input-only',cut_ids:cuts.filter((cut)=>cut.production_mode==='omni').map((cut)=>cut.shot_id),omni_video_generation:'blocked-until-all-cuts-user-pass'},production_authority:false},editorial_visual_policy:{reference_video:'https://www.youtube.com/watch?v=5o8DvcFB65g',reference_analysis:'video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md',multi_reference_analysis:'video/qa/reference-study/multi-reference-v01',source_acquisition_matrix:projectPath(matrixPath),source_acquisition_matrix_sha256:matrixHash,candidate_inventory_status:'green-local-and-amber-locator-candidates-pending-human-review',order:['korean-green-self-service-source','international-green-fallback','amber-direct-quotation-locator','remotion','omni'],default_surface:'real source fills actual context; fictional continuity uses reviewed text-free imagegen keyframes',motion_graphics_rule:'only exact legal relationships, text, timing and logic that source media cannot truthfully show',omni_rule:`${modeCounts.omni} fictional continuity cuts use keyframe-input only; generated Omni video is forbidden until all ${cuts.length} cuts receive user PASS`,source_gap_rule:'missing media stays an honest blocked gap',mode_transition_status:'semantic candidate-only plan; no active cut or production authority'}};
await writeFile(specPath,`${JSON.stringify(spec,null,2)}\n`,'utf8');
console.log(JSON.stringify({spec:projectPath(specPath),matrix:projectPath(matrixPath),matrix_sha256:matrixHash,cut_count:cuts.length,mode_counts:modeCounts,taxonomy_counts:taxonomyCounts,frames:totalFrames},null,2));
