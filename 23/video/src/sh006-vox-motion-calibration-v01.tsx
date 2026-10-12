import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const BASE = 'assets/style-calibration/episode-001-sh006-vox-motion-v01';
const asset = (file: string) => staticFile(`${BASE}/${file}`);
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (frame: number, start: number, end: number) => {
  const p = clamp((frame - start) / Math.max(1, end - start));
  return p * p * (3 - 2 * p);
};

const DOC_INITIAL = {left: 310, top: 170, width: 1300, height: 585};
const DOC_FINAL = {left: 390, top: 145, width: 1160, height: 522};

function Background() {
  return <Img src={asset('background.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill'}} />;
}

function Label({children, left, top, width, color = '#233844'}: {children: string; left: number; top: number; width: number; color?: string}) {
  return <div style={{position: 'absolute', left, top, width, textAlign: 'center', color, fontFamily: 'Arial, "Noto Sans KR", sans-serif', fontSize: 42, lineHeight: 1.15, fontWeight: 900, letterSpacing: -1.5, textShadow: '3px 3px 0 #fffaf0'}}>{children}</div>;
}

function SourceRail() {
  return <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, background: 'rgba(239,231,217,.98)', borderTop: '2px solid rgba(64,80,88,.22)', color: '#405058', fontFamily: 'Arial, "Noto Sans KR", sans-serif', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 72px', boxSizing: 'border-box'}}>공식 원문 · 형사소송법 제196조 · 법률 제21857호 개정문 · 경찰청 사진 Wikimedia Commons CC BY 2.0</div>;
}

function DocumentShell({children, left, top, width, height, dataDocumentState, scale = 1}: {children: React.ReactNode; left: number; top: number; width: number; height: number; dataDocumentState: string; scale?: number}) {
  return <div data-document-shell="sh006-law-document" data-document-state={dataDocumentState} style={{position: 'absolute', left, top, width, height, overflow: 'hidden', background: '#fffdf8', borderRadius: 18, boxShadow: '0 22px 42px rgba(52,38,25,.2)', transform: `scale(${scale})`, transformOrigin: 'center center'}}>{children}</div>;
}

function DocumentImage({file}: {file: string}) {
  return <Img src={asset(`assets/${file}`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block'}} />;
}

function Article196Transition({frame}: {frame: number}) {
  const enter = spring({frame: Math.max(0, frame - 30), fps: 30, config: {damping: 18, stiffness: 120, mass: .78}});
  const enterProgress = clamp(enter);
  const left = interpolate(enterProgress, [0, 1], [240, DOC_INITIAL.left]);
  const top = interpolate(enterProgress, [0, 1], [205, DOC_INITIAL.top]);
  const scale = interpolate(enterProgress, [0, 1], [.82, 1]);
  const opacity = clamp((frame - 30) / 24);
  if (frame < 30) return null;
  if (frame < 120) return <DocumentShell left={left} top={top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} scale={scale} dataDocumentState="article-196-current-entering"><div style={{opacity}}><DocumentImage file="sh006-current-article-196-evidence-view.png" /></div></DocumentShell>;
  if (frame < 165) {
    const strikeProgress = frame < 132 ? clamp((frame - 120) / 12) : 0;
    const w = frame < 132 ? 0 : clamp((frame - 132) / 18);
    return <DocumentShell left={DOC_INITIAL.left} top={DOC_INITIAL.top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-localized-deletion"><div style={{position: 'absolute', inset: 0}}><div data-localized-deletion-outgoing style={{position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${w * 100}%)`}}><DocumentImage file="sh006-current-article-196-evidence-view.png" /></div><div data-localized-deletion-mask style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - w * 100}% 0 0)`}}><DocumentImage file="sh006-article-196-deletion-evidence-view.png" /></div><div data-deletion-wipe-boundary style={{position: 'absolute', left: `calc(${w * 100}% - 20px)`, top: 0, width: 40, height: '100%', background: '#fffdf8', boxShadow: '0 0 14px rgba(52,38,25,.16)', borderLeft: '3px solid rgba(47,117,110,.28)'}} /><div data-deletion-stroke style={{position: 'absolute', left: 110, top: 258, width: `${strikeProgress * 940}px`, height: 11, borderRadius: 99, background: '#a84034', transform: 'rotate(-4deg)', transformOrigin: 'left center', opacity: strikeProgress}} /><div data-deletion-accent style={{position: 'absolute', right: `${w * 68}px`, top: 38, width: 10, height: 500, background: '#2f756e', opacity: w}} /></div></DocumentShell>;
  }
  return null;
}

function Article195Transition({frame}: {frame: number}) {
  if (frame < 165) return null;
  if (frame < 225) return <DocumentShell left={DOC_INITIAL.left} top={DOC_INITIAL.top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-deletion-hold"><DocumentImage file="sh006-article-196-deletion-evidence-view.png" /></DocumentShell>;
  const p = ease(frame, 225, 269);
  const left = interpolate(p, [0, 1], [DOC_INITIAL.left, DOC_FINAL.left]);
  const top = interpolate(p, [0, 1], [DOC_INITIAL.top, DOC_FINAL.top]);
  const width = interpolate(p, [0, 1], [DOC_INITIAL.width, DOC_FINAL.width]);
  const height = interpolate(p, [0, 1], [DOC_INITIAL.height, DOC_FINAL.height]);
  const w = clamp((frame - 225) / 18);
  return <DocumentShell left={left} top={top} width={width} height={height} dataDocumentState={frame < 243 ? 'article-195-localized-morph' : 'article-195-retained-hold'}><div data-shared-document-outgoing style={{position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${w * 100}%)`}}><DocumentImage file="sh006-article-196-deletion-evidence-view.png" /></div><div data-shared-document-incoming style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - w * 100}% 0 0)`}}><DocumentImage file="sh006-article-195-retained-evidence-view.png" /></div><div data-shared-document-wipe-boundary style={{position: 'absolute', left: `calc(${w * 100}% - 20px)`, top: 0, width: 40, height: '100%', background: '#fffdf8', boxShadow: '0 0 14px rgba(52,38,25,.16)', borderLeft: '3px solid rgba(47,117,110,.28)'}} /></DocumentShell>;
}

function PeopleAndBuilding({frame}: {frame: number}) {
  if (frame < 330) return null;
  const personP = ease(frame, 330, 359);
  const buildingP = ease(frame, 342, 359);
  return <>
    <div data-parity-target="person-imagegen-fictional" style={{position: 'absolute', left: interpolate(personP, [0, 1], [-260, 80]), top: 485, width: 330, height: 430, opacity: personP, transform: `scale(${interpolate(personP, [0, 1], [.78, 1])})`, transformOrigin: 'center bottom', zIndex: 5}}><Img src={asset('assets/sh006-prosecutor-role-imagegen-clean-v01.png')} style={{width: '100%', height: '100%', objectFit: 'contain'}} /></div>
    <div data-parity-target="police-building" style={{position: 'absolute', left: interpolate(buildingP, [0, 1], [1980, 1570]), top: 530, width: 300, height: 300, opacity: buildingP, transform: `scale(${interpolate(buildingP, [0, 1], [.78, 1])})`, transformOrigin: 'center bottom', zIndex: 5}}><Img src={asset('assets/sh006-police-building-real-photo.png')} style={{width: '100%', height: '100%', objectFit: 'contain'}} /></div>
    <div style={{opacity: personP}}><Label left={50} top={930} width={390} color="#9f3f35">검사 역할</Label></div>
    <Label left={390} top={730} width={1160} color="#2f756e">새 제195조 제2항</Label>
    <div style={{opacity: buildingP}}><Label left={1530} top={850} width={330} color="#2f756e">경찰청</Label></div>
  </>;
}

function Routes({frame}: {frame: number}) {
  if (frame < 360) return null;
  const first = clamp((frame - 360) / 18);
  const second = clamp((frame - 372) / 18);
  return <svg data-route-layer viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none', overflow: 'visible'}}>
    <defs><marker id="sh006-route-arrow" markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto"><path d="M0 0 L20 12 L0 24 Z" fill="#2f756e" /></marker></defs>
    <path data-parity-target="route-person-to-document" d="M410 690 C405 570 400 470 390 430" fill="none" stroke="#2f756e" strokeWidth="9" strokeLinecap="round" strokeDasharray="28 18" strokeDashoffset={190 * (1 - first)} markerEnd="url(#sh006-route-arrow)" opacity={first} />
    <path data-parity-target="route-document-to-police" d="M1550 510 C1580 530 1590 620 1570 680" fill="none" stroke="#2f756e" strokeWidth="9" strokeLinecap="round" strokeDasharray="28 18" strokeDashoffset={190 * (1 - second)} markerEnd="url(#sh006-route-arrow)" opacity={second} />
  </svg>;
}

export function Sh006VoxMotionCalibrationV01() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  void fps;
  return <AbsoluteFill style={{backgroundColor: '#f2ead8', overflow: 'hidden', fontFamily: 'Arial, "Noto Sans KR", sans-serif'}}>
    <Background />
    <Article196Transition frame={frame} />
    <Article195Transition frame={frame} />
    <Routes frame={frame} />
    <PeopleAndBuilding frame={frame} />
    {frame >= 30 ? <SourceRail /> : null}
  </AbsoluteFill>;
}
