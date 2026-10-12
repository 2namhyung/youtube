import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const BASE = 'assets/style-calibration/episode-001-sh006-vox-motion-v04';
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

function DocumentShell({children, left, top, width, height, dataDocumentState}: {children: React.ReactNode; left: number; top: number; width: number; height: number; dataDocumentState: string}) {
  return <div data-document-shell="sh006-law-document" data-document-state={dataDocumentState} style={{position: 'absolute', left, top, width, height, overflow: 'hidden', background: 'transparent', border: '1px solid rgba(255,253,248,.65)', borderRadius: 18, boxShadow: '0 12px 24px rgba(52,38,25,.12)'}}>{children}</div>;
}

function DocumentImage({file}: {file: string}) {
  return <Img src={asset(`assets/${file}`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block'}} />;
}

function CurrentArticlePage({strikeProgress = 0}: {strikeProgress?: number}) {
  return <div data-flip-page="article-196-current" style={{position: 'absolute', inset: 0, background: '#fffdf8', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' as 'hidden'}}>
    <DocumentImage file="sh006-current-article-196-evidence-view.png" />
    {strikeProgress > 0 ? <div data-deletion-stroke style={{position: 'absolute', left: 110, top: 258, width: `${strikeProgress * 940}px`, height: 11, borderRadius: 99, background: '#a84034', transform: 'rotate(-4deg)', transformOrigin: 'left center'}} /> : null}
  </div>;
}

function DeletionArticlePage() {
  return <div data-flip-page="article-196-deletion" style={{position: 'absolute', inset: 0, background: '#fffdf8', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' as 'hidden'}}><DocumentImage file="sh006-article-196-deletion-evidence-view.png" /></div>;
}

function RetainedArticlePage() {
  return <div data-flip-page="article-195-retained" style={{position: 'absolute', inset: 0, background: '#fffdf8', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' as 'hidden'}}><DocumentImage file="sh006-article-195-retained-evidence-view.png" /></div>;
}

function FlipSwap({frame, start, outgoing, incoming, state, outgoingStrike = false}: {frame: number; start: number; outgoing: React.ReactNode; incoming: React.ReactNode; state: string; outgoingStrike?: boolean}) {
  const progress = clamp((frame - start) / 18);
  const outgoingVisible = progress < 0.5;
  const incomingVisible = progress > 0.5;
  const foldVisible = Math.abs(progress - 0.5) < 0.03;
  const outgoingStrikeProgress = outgoingStrike && frame >= 120 && frame < 141 ? clamp((frame - 120) / 12) : 0;
  return <div data-flip-swap="full-card" data-flip-progress={progress.toFixed(3)} data-document-state={state} style={{position: 'absolute', inset: 0, perspective: 1600, transformStyle: 'preserve-3d'}}>
    {outgoingVisible ? <div data-flip-target="outgoing-whole-card" style={{position: 'absolute', inset: 0, transform: `rotateY(${-90 * progress}deg)`, transformOrigin: 'center center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' as 'hidden'}}>{outgoingStrike ? <CurrentArticlePage strikeProgress={outgoingStrikeProgress} /> : outgoing}</div> : null}
    {incomingVisible ? <div data-flip-target="incoming-whole-card" style={{position: 'absolute', inset: 0, transform: `rotateY(${90 - 90 * progress}deg)`, transformOrigin: 'center center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' as 'hidden'}}>{incoming}</div> : null}
    {foldVisible ? <div data-flip-target="paper-edge-fold" style={{position: 'absolute', left: 'calc(50% - 12px)', top: 0, width: 24, height: '100%', background: '#fffdf8', boxShadow: '0 0 18px rgba(52,38,25,.28)', borderLeft: '2px solid rgba(47,117,110,.25)', borderRight: '2px solid rgba(47,117,110,.12)', transform: 'translateZ(2px)'}} /> : null}
  </div>;
}

function Article196Transition({frame}: {frame: number}) {
  if (frame < 30) return null;
  if (frame < 60) {
    const enter = spring({frame: Math.max(0, frame - 30), fps: 30, config: {damping: 18, stiffness: 120, mass: .78}});
    const enterProgress = clamp(enter);
    const left = interpolate(enterProgress, [0, 1], [240, DOC_INITIAL.left]);
    const top = interpolate(enterProgress, [0, 1], [205, DOC_INITIAL.top]);
    const scale = interpolate(enterProgress, [0, 1], [.82, 1]);
    const opacity = clamp((frame - 30) / 24);
    return <DocumentShell left={left} top={top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-current-entering"><div style={{opacity, transform: `scale(${scale})`, transformOrigin: 'center center', width: '100%', height: '100%'}}><DocumentImage file="sh006-current-article-196-evidence-view.png" /></div></DocumentShell>;
  }
  if (frame < 120) return <DocumentShell left={DOC_INITIAL.left} top={DOC_INITIAL.top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-current-reading-hold"><DocumentImage file="sh006-current-article-196-evidence-view.png" /></DocumentShell>;
  if (frame < 150) return <DocumentShell left={DOC_INITIAL.left} top={DOC_INITIAL.top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-full-card-flip"><FlipSwap frame={frame} start={132} outgoing={<CurrentArticlePage />} incoming={<DeletionArticlePage />} state="article-196-localized-deletion-flip" outgoingStrike /></DocumentShell>;
  return null;
}

function Article195Transition({frame}: {frame: number}) {
  if (frame < 150) return null;
  if (frame < 225) return <DocumentShell left={DOC_INITIAL.left} top={DOC_INITIAL.top} width={DOC_INITIAL.width} height={DOC_INITIAL.height} dataDocumentState="article-196-deletion-reading-hold"><DocumentImage file="sh006-article-196-deletion-evidence-view.png" /></DocumentShell>;
  const p = ease(frame, 225, 269);
  const left = interpolate(p, [0, 1], [DOC_INITIAL.left, DOC_FINAL.left]);
  const top = interpolate(p, [0, 1], [DOC_INITIAL.top, DOC_FINAL.top]);
  const width = interpolate(p, [0, 1], [DOC_INITIAL.width, DOC_FINAL.width]);
  const height = interpolate(p, [0, 1], [DOC_INITIAL.height, DOC_FINAL.height]);
  if (frame < 270) return <DocumentShell left={left} top={top} width={width} height={height} dataDocumentState={frame < 243 ? 'article-195-full-card-flip' : 'article-195-retained-morph-hold'}><FlipSwap frame={frame} start={225} outgoing={<DeletionArticlePage />} incoming={<RetainedArticlePage />} state="article-195-full-card-flip" /></DocumentShell>;
  return <DocumentShell left={DOC_FINAL.left} top={DOC_FINAL.top} width={DOC_FINAL.width} height={DOC_FINAL.height} dataDocumentState="article-195-retained-reading-hold"><DocumentImage file="sh006-article-195-retained-evidence-view.png" /></DocumentShell>;
}

function PeopleAndBuilding({frame}: {frame: number}) {
  if (frame < 330) return null;
  const personP = ease(frame, 330, 359);
  const buildingP = ease(frame, 342, 359);
  return <>
    <div data-parity-target="person-imagegen-fictional" style={{position: 'absolute', left: interpolate(personP, [0, 1], [-260, 80]), top: 485, width: 330, height: 430, opacity: personP, transform: `scale(${interpolate(personP, [0, 1], [.78, 1])})`, transformOrigin: 'center bottom', zIndex: 5}}><Img src={asset('assets/sh006-prosecutor-role-imagegen-clean-v01.png')} style={{width: '100%', height: '100%', objectFit: 'contain'}} /></div>
    <div data-parity-target="police-building" style={{position: 'absolute', left: interpolate(buildingP, [0, 1], [1980, 1570]), top: 530, width: 300, height: 300, opacity: buildingP, transform: `scale(${interpolate(buildingP, [0, 1], [.78, 1])})`, transformOrigin: 'center bottom', zIndex: 5}}><Img src={asset('assets/sh006-police-building-real-photo.png')} style={{width: '100%', height: '100%', objectFit: 'contain'}} /></div>
    <div style={{opacity: personP}}><Label left={50} top={947} width={390} color="#9f3f35">검사 역할</Label></div>
    <Label left={390} top={730} width={1160} color="#2f756e">새 제195조 제2항</Label>
    <div style={{opacity: buildingP}}><Label left={1555} top={862} width={330} color="#2f756e">경찰청</Label></div>
  </>;
}

function Routes({frame}: {frame: number}) {
  if (frame < 360) return null;
  const first = clamp((frame - 360) / 18);
  const second = clamp((frame - 372) / 18);
  return <svg data-route-layer data-runtime-bound-overlay="deterministic-editorial" viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none', overflow: 'visible'}}>
    <defs><marker id="sh006-route-arrow-v04" markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto"><path d="M0 0 L20 12 L0 24 Z" fill="#2f756e" /></marker></defs>
    <path data-parity-target="route-person-to-document" d="M410 690 C405 570 400 470 390 430" fill="none" stroke="#2f756e" strokeWidth="9" strokeLinecap="round" strokeDasharray="28 18" strokeDashoffset={190 * (1 - first)} markerEnd="url(#sh006-route-arrow-v04)" opacity={first} />
    <path data-parity-target="route-document-to-police" d="M1550 510 C1580 530 1590 620 1570 680" fill="none" stroke="#2f756e" strokeWidth="9" strokeLinecap="round" strokeDasharray="28 18" strokeDashoffset={190 * (1 - second)} markerEnd="url(#sh006-route-arrow-v04)" opacity={second} />
  </svg>;
}

export function Sh006VoxMotionCalibrationV04() {
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
