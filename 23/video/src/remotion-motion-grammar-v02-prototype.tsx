import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

export type PrototypeSampleId =
  | 'sample-01-shared-background-accumulation'
  | 'sample-02-numeric-step-progression'
  | 'sample-03-chart-reveal'
  | 'sample-04-map-route-reframe'
  | 'sample-05-object-preserving-layout-reframe'
  | 'sample-06-directional-exit-hard-cut-pair'
  | 'sample-07-hook-reel-collage-montage'
  | 'sample-08-speaker-supporting-overlay-entry'
  | 'sample-09-device-light-focal-motion'
  | 'sample-10-narrative-scale-translation';

const BASE = 'assets/style-calibration/remotion-motion-grammar-v02-prototype/assets';
const asset = (name: string) => staticFile(`${BASE}/${name}`);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const progress = (frame: number, start = 15, end = 105) => clamp((frame - start) / Math.max(1, end - start));
const move = (frame: number, from: number, to: number, start = 15, end = 105) => interpolate(progress(frame, start, end), [0, 1], [from, to]);
const opacity = (frame: number, start = 15, end = 105) => interpolate(progress(frame, start, end), [0, 1], [0, 1]);

function Photo({name, style, target}: {name: string; style: React.CSSProperties; target?: string}) {
  return <Img data-parity-target={target} src={asset(name)} style={{position: 'absolute', objectFit: 'contain', display: 'block', ...style}} />;
}

function SourceRail({label}: {label: string}) {
  return <div style={{position: 'absolute', left: 96, right: 96, bottom: 42, fontSize: 22, letterSpacing: 0.5, color: '#5d5349', textAlign: 'center'}}>{label}</div>;
}

function Chart({frame}: {frame: number}) {
  const p = progress(frame, 15, 105);
  const bars = [210, 330, 460, 600, 760];
  return <svg data-parity-target="chart-focal" viewBox="0 0 1100 680" width="1100" height="680" style={{position: 'absolute', left: 410, top: 180, overflow: 'visible'}}>
    <path d="M90 590H1030M90 590V70" stroke="#403930" strokeWidth="7" fill="none" />
    {bars.map((height, index) => <rect key={height} x={160 + index * 165} y={590 - height * p} width="92" height={height * p} fill={index === 4 ? '#b04a3b' : '#536f7a'} />)}
    <text x="90" y="45" fontSize="38" fontWeight="800" fill="#302a24">공식 자료 기반 비교</text>
  </svg>;
}

function Route({frame}: {frame: number}) {
  const p = progress(frame, 35, 125);
  return <svg data-parity-target="route-focal" viewBox="0 0 1920 1080" width="1920" height="1080" style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
    <path d="M520 650 C780 390 1110 360 1460 540" fill="none" stroke="#a64036" strokeWidth="16" strokeLinecap="round" strokeDasharray="1200" strokeDashoffset={1200 * (1 - p)} />
  </svg>;
}

function SampleScene({sampleId}: {sampleId: PrototypeSampleId}) {
  const frame = useCurrentFrame();
  const shared = {backgroundColor: '#f2ead8', overflow: 'hidden' as const, fontFamily: 'Arial, "Noto Sans KR", sans-serif', color: '#302a24'};
  if (sampleId === 'sample-01-shared-background-accumulation') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Photo name="sh006-police-building-real-photo.png" target="building-focal" style={{left: 640, top: 100 + move(frame, -180, 0), width: 760, height: 650, opacity: opacity(frame)}} />
    <Photo name="sh006-dossier-real-photo.png" style={{left: 230 + move(frame, -220, 0, 50, 135), top: 570, width: 440, height: 390, opacity: opacity(frame, 50, 135)}} />
    <Photo name="sh006-legal-signing-real-photo.png" style={{left: 1260 + move(frame, 220, 0, 90, 165), top: 530, width: 470, height: 380, opacity: opacity(frame, 90, 165)}} />
    <SourceRail label="공식·권리 확인 자료를 한 장면에 축적" />
  </AbsoluteFill>;
  if (sampleId === 'sample-02-numeric-step-progression') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Photo name="sh006-dossier-real-photo.png" target="numeric-context" style={{left: 420, top: 170, width: 1080, height: 720}} />
    <div style={{position: 'absolute', left: 630, top: 420, fontSize: 112, fontWeight: 900, color: '#a64036', letterSpacing: -4}}>{frame < 55 ? '제196조' : frame < 105 ? '제197조' : '제195조'}</div>
    <SourceRail label="국가법령정보센터 원문 번호 표면" />
  </AbsoluteFill>;
  if (sampleId === 'sample-03-chart-reveal') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Chart frame={frame} />
    <SourceRail label="공식 통계 원문·축·값을 잠근 차트 설계" />
  </AbsoluteFill>;
  if (sampleId === 'sample-04-map-route-reframe') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Photo name="sh006-police-building-real-photo.png" target="map-focal" style={{left: 470 + move(frame, 260, 0, 15, 95), top: 170 + move(frame, 100, 0, 15, 95), width: 980, height: 690}} />
    <Route frame={frame} />
    <SourceRail label="공식 위치 자료와 사건 경로를 결합한 설명 화면" />
  </AbsoluteFill>;
  if (sampleId === 'sample-05-object-preserving-layout-reframe') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Photo name="sh006-dossier-real-photo.png" target="retained-focal" style={{left: 540 + move(frame, 250, 0, 15, 125), top: 220, width: 760, height: 650}} />
    <Photo name="sh006-police-building-real-photo.png" style={{left: 1320 + move(frame, 0, 260, 50, 125), top: 230, width: 450, height: 420, opacity: interpolate(progress(frame, 50, 125), [0, 1], [1, 0])}} />
    <SourceRail label="남겨진 사건파일이 다음 설명의 중심으로 이동" />
  </AbsoluteFill>;
  if (sampleId === 'sample-06-directional-exit-hard-cut-pair') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    {frame < 120 ? <Photo name="sh006-dossier-real-photo.png" target="outgoing-scene" style={{left: 520 + move(frame, 0, -205, 15, 115), top: 220, width: 850, height: 680}} /> : <Photo name="sh006-police-building-real-photo.png" target="incoming-scene" style={{left: 520, top: 170, width: 900, height: 740}} />}
    <SourceRail label="완결 장면의 방향성 있는 퇴장 → 다음 완결 장면" />
  </AbsoluteFill>;
  if (sampleId === 'sample-07-hook-reel-collage-montage') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    {frame < 60 ? <Photo name="sh006-legal-signing-real-photo.png" target="reel-panel-a" style={{left: 560, top: 160, width: 800, height: 740}} /> : frame < 120 ? <Photo name="sh006-dossier-real-photo.png" target="reel-panel-b" style={{left: 560, top: 160, width: 800, height: 740}} /> : <Photo name="sh006-police-building-real-photo.png" target="reel-panel-c" style={{left: 560, top: 160, width: 800, height: 740}} />}
    <SourceRail label="하나의 질문을 향해 실물 장면을 빠르게 교대" />
  </AbsoluteFill>;
  if (sampleId === 'sample-08-speaker-supporting-overlay-entry') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <Photo name="sh006-person-real-cutout.png" target="speaker-focal" style={{left: 260, top: 170, width: 620, height: 770}} />
    <Photo name="sh006-police-building-real-photo.png" style={{left: 1040 + move(frame, 220, 0, 55, 125), top: 230, width: 690, height: 570, opacity: opacity(frame, 55, 125)}} />
    <SourceRail label="실제 자료 기반 인물 기준점 + 옆으로 들어오는 근거 자산" />
  </AbsoluteFill>;
  if (sampleId === 'sample-09-device-light-focal-motion') return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    <SourceRail label="실제 기기 source 부재로 blocked: 렌더하지 않음" />
  </AbsoluteFill>;
  return <AbsoluteFill style={shared}>
    <Img src={asset('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
    {frame < 105 ? <Photo name="sh006-dossier-real-photo.png" target="scale-prop" style={{left: 540, top: 210, width: 820, height: 680, transform: `scale(${interpolate(progress(frame, 15, 105), [0, 1], [0.72, 1.05])})`}} /> : <Photo name="sh006-police-building-real-photo.png" target="scale-broll" style={{left: 480, top: 150, width: 960, height: 760}} />}
    <SourceRail label="구체적 물건에서 실제 공간으로 규모를 번역" />
  </AbsoluteFill>;
}

export const RemotionMotionGrammarV02Prototype = ({sampleId}: {sampleId: PrototypeSampleId}) => <SampleScene sampleId={sampleId} />;
