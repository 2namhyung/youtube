import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {EPISODE_001_MEDIA} from './episode-001-media';

type Cut = {
  shotId: string;
  seconds: number;
  mode: 'remotion' | 'omni' | 'source-photo';
  subject: string;
  keyword: string;
  source: string;
  asset: string;
  mediaType?: 'image' | 'video';
  holdAsset?: string;
};

const cuts: Cut[] = ([
  ['SH001', 18, 'omni', '중고 노트북 사기', '누가 다시 확인하지?', 'SRC-AI-SH001', EPISODE_001_MEDIA.SH001.path, EPISODE_001_MEDIA.SH001.mediaType, EPISODE_001_MEDIA.SH001.holdPath],
  ['SH002', 16, 'remotion', '법률 질문으로 전환', '제196조', 'LAW-21857 · LAW-196', 'assets/official-law-196-delete.png'],
  ['SH003', 18, 'remotion', '직접과 요구의 구분', '직접 ≠ 요구', 'LAW-196 · LAW-1972', 'assets/split-route.png'],
  ['SH004', 18, 'remotion', '현재 절차의 큰 흐름', '현재 절차', 'LAW-1972', 'assets/police-prosecutor.png'],
  ['SH005', 18, 'remotion', '개정 전 직접 확인의 위치', '개정 전', 'LAW-196', 'assets/missing-piece.png'],
  ['SH006', 20, 'remotion', '공포와 시행의 시간축', '2026.10.02', 'LAW-21857', 'assets/calendar.png'],
  ['SH007', 18, 'remotion', '제196조 삭제 원문', '제196조 삭제', 'LAW-196', 'assets/official-law-196-delete.png'],
  ['SH008', 18, 'remotion', '삭제 범위의 경계', '남는 요구', 'LAW-196 · LAW-1972', 'assets/route-remaining.png'],
  ['SH009', 20, 'remotion', '보완수사요구가 남는다', '보완수사요구', 'LAW-1972', 'assets/request-route.png'],
  ['SH010', 18, 'remotion', '구체적인 요구서', '이유 · 내용 · 자료', 'LAW-1972', 'assets/request-form.png'],
  ['SH011', 20, 'remotion', '1개월과 별도 기한', '기본 1개월', 'LAW-1972', 'assets/deadline.png'],
  ['SH012', 20, 'remotion', '불이행과 구제 절차', '요구 → 이행 → 구제', 'LAW-1973 · LAW-245', 'assets/remedy-route.png'],
  ['SH013', 18, 'remotion', '사실확인과 재판 증거', '재판 증거 아님', 'LAW-245', 'assets/evidence-stop.png'],
  ['SH014', 20, 'remotion', '시행 전후 특례', '진행 중 사건 · 90일', 'LAW-TRANS', 'assets/transition-90.png'],
  ['SH015', 20, 'source-photo', '입법 결정의 시간순서', '의안 2220257', 'BILL-2220257', 'assets/official-bill-2220257.png'],
  ['SH016', 20, 'source-photo', '실제 국회 청원 기록', '51,018명', 'PET-2200332', 'assets/official-petition-2200332.png'],
  ['SH017', 20, 'remotion', '청원은 신호이지 결과가 아니다', '우려 신호', 'PET-2200332 · UNKNOWN-OUTCOME', 'assets/signal-scale.png'],
  ['SH018', 24, 'remotion', '아직 모르는 네 가지', '시행 후 확인', 'UNKNOWN-OUTCOME', 'assets/unknown-grid.png'],
  ['SH019', 28, 'remotion', '전체 절차 다시 읽기', '전체 흐름', 'LAW-196 · LAW-1972 · LAW-TRANS', 'assets/overview.png'],
  ['SH020', 18, 'remotion', '판단을 남기는 엔드카드', '10월 2일 시행 예정', 'LAW-21857 · UNKNOWN-OUTCOME', 'assets/end-card.png'],
] as const).map(([shotId, seconds, mode, subject, keyword, source, asset, mediaType, holdAsset]): Cut => ({shotId, seconds, mode, subject, keyword, source, asset, mediaType, holdAsset}));

export const EPISODE_001_FRAMES = cuts.reduce((sum, cut) => sum + cut.seconds * 30, 0);

const beatOpacity = (frame: number, start: number, end: number, hold = false) => interpolate(frame, hold ? [start, start + 12] : [start, start + 12, end - 12, end], hold ? [0, 1] : [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

function FictionStoryCut({cut, durationInFrames}: {cut: Cut; durationInFrames: number}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const revealStart = 12;
  const enter = spring({frame: frame - revealStart, fps, config: {damping: 20, stiffness: 92, mass: 0.78}});
  const sourceAsset = staticFile(`assets/episode-001/cuts/${cut.shotId}/${cut.asset}`);
  const holdAsset = cut.holdAsset ? staticFile(`assets/episode-001/cuts/${cut.shotId}/${cut.holdAsset}`) : null;
  const evidenceAsset = staticFile('assets/episode-001/cuts/SH001/assets/story-evidence.png');
  const holdProgress = holdAsset ? interpolate(frame, [294, 312], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const reveal = Math.min(1, enter) * interpolate(frame, [revealStart, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cameraScale = interpolate(frame, [revealStart, durationInFrames], [1.035, 1.0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const evidenceOpacity = interpolate(frame, [260, 290], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const questionOpacity = beatOpacity(frame, 390, durationInFrames, true);
  const beats = [
    {start: 24, end: 132, label: '중고 노트북 · 70만원'},
    {start: 120, end: 246, label: '도착한 건 빈 상자'},
    {start: 234, end: 378, label: '판매자는 잠적'},
    {start: 360, end: durationInFrames, label: '계좌 명의 불일치', hold: true},
  ];
  return <AbsoluteFill style={{overflow: 'hidden', background: '#fbf8f0'}}>
    <Img src={staticFile('assets/episode-001/cuts/SH001/background.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <AbsoluteFill style={{opacity: frame < revealStart ? 0 : reveal, transform: `scale(${cameraScale})`, transformOrigin: 'center center'}}>
      {cut.mediaType === 'video' ? <Video src={sourceAsset} muted volume={0} objectFit="cover" style={{position: 'absolute', left: '3%', top: '4%', width: '94%', height: '88%', opacity: 1 - holdProgress}} /> : <Img src={sourceAsset} style={{position: 'absolute', left: '3%', top: '4%', width: '94%', height: '88%', objectFit: 'cover'}} />}
      {holdAsset && <Img src={holdAsset} style={{position: 'absolute', left: '3%', top: '4%', width: '94%', height: '88%', objectFit: 'cover', opacity: holdProgress}} />}
      <div style={{position: 'absolute', left: '3%', right: '3%', top: '4%', height: '88%', background: 'linear-gradient(180deg, rgba(13,21,29,.32) 0%, transparent 28%, transparent 54%, rgba(13,21,29,.7) 100%)'}} />
      <div style={{position: 'absolute', left: 90, top: 66, color: '#fffaf0', fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: 800, textShadow: '0 2px 14px rgba(0,0,0,.45)'}}>한 취업준비생의 이야기</div>
      <div style={{position: 'absolute', right: 88, top: 68, color: '#f2c77e', fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,.5)'}}>AI 재구성 · 가상 사례</div>
      {beats.map((beat, index) => <React.Fragment key={beat.label}>
        <div style={{position: 'absolute', left: 92, bottom: 100, opacity: beatOpacity(frame, beat.start, beat.end, beat.hold), color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: index === 3 ? 42 : 52, fontWeight: 900, letterSpacing: -1.2, textShadow: '0 3px 16px rgba(0,0,0,.7)'}}>{beat.label}</div>
        <div style={{position: 'absolute', left: 92 + index * 38, bottom: 62, width: 26, height: 5, borderRadius: 4, opacity: frame >= beat.start ? .95 : .35, background: frame >= beat.start ? '#f2c77e' : '#fff'}} />
      </React.Fragment>)}
      <Img src={evidenceAsset} style={{position: 'absolute', right: 92, bottom: 142, width: 510, opacity: evidenceOpacity, filter: 'drop-shadow(0 12px 20px rgba(0,0,0,.3))'}} />
      <div style={{position: 'absolute', right: 92, bottom: 70, opacity: questionOpacity, color: '#fffaf0', fontFamily: 'Arial, sans-serif', fontSize: 34, fontWeight: 900, letterSpacing: -1, textShadow: '0 3px 16px rgba(0,0,0,.7)'}}>누가 다시 확인하지?</div>
    </AbsoluteFill>
  </AbsoluteFill>;
}

function StandardCutScene({cut, index, durationInFrames}: {cut: Cut; index: number; durationInFrames: number}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const duration = durationInFrames;
  const revealStart = 12;
  const revealEnd = Math.min(duration - 30, Math.max(36, Math.floor(duration * 0.42)));
  const enter = spring({frame: frame - revealStart, fps, config: {damping: 20, stiffness: 90, mass: 0.75}});
  const reveal = interpolate(frame, [revealStart, revealEnd], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cameraScale = interpolate(frame, [revealStart, duration], [1.02, 1.0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cameraX = interpolate(frame, [revealStart, duration], [index % 2 ? 10 : -10, index % 2 ? -8 : 8], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const sourceAsset = staticFile(`assets/episode-001/cuts/${cut.shotId}/${cut.asset}`);
  const holdAsset = cut.holdAsset ? staticFile(`assets/episode-001/cuts/${cut.shotId}/${cut.holdAsset}`) : null;
  const isOfficialCapture = cut.mode === 'source-photo' || cut.shotId === 'SH002' || cut.shotId === 'SH007';
  const contentOpacity = Math.min(1, enter) * reveal;
  const holdProgress = holdAsset ? interpolate(frame, [300, 318], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  return <AbsoluteFill style={{overflow: 'hidden', background: '#fbf8f0'}}>
    <Img src={staticFile(`assets/episode-001/cuts/${cut.shotId}/background.png`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <AbsoluteFill style={{opacity: frame < revealStart ? 0 : 1, transform: `translate3d(${cameraX}px, 0, 0) scale(${cameraScale})`, transformOrigin: 'center center'}}>
      {cut.mediaType === 'video' ? <Video src={sourceAsset} muted volume={0} objectFit="cover" style={{position: 'absolute', left: '8%', top: '8%', width: '84%', height: '78%', opacity: contentOpacity * (1 - holdProgress)}} /> : <Img src={sourceAsset} style={{position: 'absolute', left: '8%', top: '8%', width: '84%', height: '78%', objectFit: isOfficialCapture ? 'contain' : 'cover', opacity: contentOpacity, filter: isOfficialCapture ? 'drop-shadow(0 18px 30px rgba(28,39,51,.18))' : 'none'}} />}
      {holdAsset && <Img src={holdAsset} style={{position: 'absolute', left: '8%', top: '8%', width: '84%', height: '78%', objectFit: 'cover', opacity: contentOpacity * holdProgress}} />}
      <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: contentOpacity, background: 'radial-gradient(circle at 76% 22%, rgba(35,125,119,.08), transparent 24%)'}} />
      <div style={{position: 'absolute', left: 86, top: 54, opacity: contentOpacity, color: '#1c2733', fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: 0.4}}>{cut.subject}</div>
      <div style={{position: 'absolute', left: 86, bottom: 82, opacity: contentOpacity, color: '#1c2733', fontFamily: 'Arial, sans-serif', fontSize: 31, fontWeight: 800, letterSpacing: -0.6}}>{cut.keyword}</div>
      <div style={{position: 'absolute', left: 86, bottom: 35, opacity: contentOpacity, color: '#52636d', fontFamily: 'Arial, sans-serif', fontSize: 15, letterSpacing: 0.2}}>출처 {cut.source}</div>
      {cut.mode === 'omni' && <div style={{position: 'absolute', right: 86, bottom: 35, opacity: contentOpacity, color: '#a36f25', fontFamily: 'Arial, sans-serif', fontSize: 14, fontWeight: 700}}>AI 재구성 · 가상 사례</div>}
    </AbsoluteFill>
  </AbsoluteFill>;
}

function CutScene({cut, index, durationInFrames}: {cut: Cut; index: number; durationInFrames: number}) {
  return cut.shotId === 'SH001' ? <FictionStoryCut cut={cut} durationInFrames={durationInFrames} /> : <StandardCutScene cut={cut} index={index} durationInFrames={durationInFrames} />;
}

const transitionDuration = (current: Cut, next: Cut) => current.mode === 'remotion' && next.mode === 'remotion' ? 24 : 18;

export function Episode001() {
  const children: React.ReactNode[] = [];
  cuts.forEach((cut, index) => {
    const next = cuts[index + 1];
    const overlap = next ? transitionDuration(cut, next) : 0;
    const actualDuration = cut.seconds * 30 + overlap;
    children.push(<TransitionSeries.Sequence key={`${cut.shotId}-sequence`} durationInFrames={actualDuration}><CutScene cut={cut} index={index} durationInFrames={actualDuration} /></TransitionSeries.Sequence>);
    if (next) {
      const duration = transitionDuration(cut, next);
      const presentation = cut.mode === 'remotion' && next.mode === 'remotion' ? slide({direction: 'from-right'}) : fade();
      children.push(<TransitionSeries.Transition key={`${cut.shotId}-to-${next.shotId}`} timing={linearTiming({durationInFrames: duration})} presentation={presentation} />);
    }
  });
  return <AbsoluteFill><TransitionSeries>{children}</TransitionSeries></AbsoluteFill>;
}
