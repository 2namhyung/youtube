import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const paper = '#ede9df';
const ink = '#181817';
const orange = '#e87922';

export const NumericRevealCountProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const actionEnd = 60;
  const eventFrames = [0, 15, 22, 30, 37, 45, 52, actionEnd];
  const value = Math.round(interpolate(frame, eventFrames, [0, 25, 40, 57, 70, 89, 103, 116], clamp));
  const groupOpacity = interpolate(frame, [0, 7, 8, 9, 10, 11, 12, 15, 22], [0, 0, 0.25, 0.55, 0.7, 0.82, 0.9, 0.96, 1], clamp);
  const groupTranslateY = interpolate(frame, [0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 30, actionEnd], [214, 214, 214, 192, 180, 168, 152, 152, 128, 114, 100, 88, 22, 0, 0], clamp);
  const tankerTranslateX = interpolate(frame, [0, actionEnd], [0, 46], clamp);
  const tankerTranslateY = interpolate(frame, [0, actionEnd], [0, 11], clamp);

  return <AbsoluteFill style={{backgroundColor: paper, color: ink, fontFamily: 'Arial, sans-serif'}}>
    <div style={{position: 'absolute', inset: 0, transform: `translate(${tankerTranslateX}px, ${tankerTranslateY}px)`}} data-pilot-target="tanker-slow-translate" data-source-delta="46,11">
      <div style={{position: 'absolute', left: 250, top: 570, width: 1160, height: 220, background: '#242424', borderRadius: '55% 9% 18% 20% / 22% 25% 38% 35%'}} />
      <div style={{position: 'absolute', left: 300, top: 520, width: 210, height: 100, background: '#444'}} />
    </div>
    <div style={{position: 'absolute', left: 250, top: 815, width: 1420, height: 10, background: '#aaa'}} data-context-layer="ocean-source-footage-internal-motion" />
    <div style={{position: 'absolute', left: 1260, top: 285, width: 470, height: 250, opacity: groupOpacity, transform: `translateY(${groupTranslateY}px)`}} data-pilot-target="numeric-moving-group" data-local-layout-anchor="orange-icon">
      <div style={{width: '100%', height: '100%'}}>
        <div style={{position: 'absolute', left: 10, top: 25, width: 105, height: 145, background: orange}} />
        <div style={{position: 'absolute', left: 145, top: 20, width: 300, textAlign: 'left', fontSize: 110, lineHeight: 1.1, fontWeight: 900, fontVariantNumeric: 'tabular-nums'}}>${value}</div>
        <div style={{position: 'absolute', left: 20, top: 184, width: 420, textAlign: 'center', fontSize: 34, fontWeight: 800, letterSpacing: 5}}>PER BARREL</div>
      </div>
    </div>
    <div style={{position: 'absolute', left: 70, top: 70, fontSize: 30, fontWeight: 700}}>PROBE 02 · GROUP RISE/FADE + INTERNAL FRAMEWISE COUNT</div>
  </AbsoluteFill>;
};

const points = [
  [0, 0.20], [0.11, 0.34], [0.22, 0.39], [0.33, 0.29], [0.44, 0.18],
  [0.55, 0.58], [0.66, 0.93], [0.77, 0.52], [0.88, 0.39], [1, 0.47],
];
const makePath = (values: number[][], width: number, height: number) => values.map(([x, y], index) => `${index ? 'L' : 'M'} ${x * width} ${(1 - y) * height}`).join(' ');

export const ChartInternalDrawProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const shellSettleEnd = 14;
  const seriesStart = 16;
  const actionEnd = 88;
  const shellOpacity = interpolate(frame, [0, shellSettleEnd], [0.38, 1], clamp);
  const progress = interpolate(frame, [seriesStart, actionEnd], [0, 1], clamp);
  const plotW = 1080;
  const plotH = 500;
  const prior = points.map(([x, y]) => [x, Math.max(0.12, y * 0.74)]);

  return <AbsoluteFill style={{backgroundColor: paper, color: ink, fontFamily: 'Arial, sans-serif'}}>
    <div style={{position: 'absolute', left: 300, top: 150, width: 1320, height: 760, background: '#f8f5ee', borderRadius: 24, boxShadow: '0 12px 28px #0002', opacity: shellOpacity}} data-pilot-target="chart-shell-opacity-settle" data-shell-settle-end="14">
      <div style={{position: 'absolute', left: 60, top: 42, fontSize: 42, fontWeight: 900}}>U.S. INFLATION RATE</div>
      <div style={{position: 'absolute', right: 70, top: 48, display: 'flex', gap: 34, fontSize: 24, fontWeight: 700}}><span style={{color: orange}}>━ CPI</span><span style={{color: '#999'}}>━ PREVIOUS TREND</span></div>
      <svg width={plotW} height={plotH} viewBox={`0 0 ${plotW} ${plotH}`} style={{position: 'absolute', left: 120, top: 145, overflow: 'visible'}}>
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1={0} x2={plotW} y1={line * 125} y2={line * 125} stroke="#cbc6bd" strokeWidth={2} />)}
        <line x1={0} x2={0} y1={0} y2={plotH} stroke="#777" strokeWidth={3} />
        <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke="#777" strokeWidth={3} />
        <path d={makePath(prior, plotW, plotH)} fill="none" stroke="#9f9d99" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
        <path d={makePath(points, plotW, plotH)} fill="none" stroke={orange} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
        {points.map(([x, y], index) => {
          const threshold = index / (points.length - 1);
          const pointProgress = threshold >= 1 ? (progress >= 1 ? 1 : 0) : interpolate(progress, [threshold, Math.min(1, threshold + 0.045)], [0, 1], clamp);
          return <circle key={index} cx={x * plotW} cy={(1 - y) * plotH} r={12 * pointProgress} fill="#f8f5ee" stroke={orange} strokeWidth={7} opacity={pointProgress} />;
        })}
      </svg>
      <div style={{position: 'absolute', left: 100, right: 70, bottom: 53, display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700, color: '#777'}}>{['2016','2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'].map((year) => <span key={year}>{year}</span>)}</div>
    </div>
    <div style={{position: 'absolute', left: 70, top: 70, fontSize: 30, fontWeight: 700}}>PROBE 03 · SHELL SETTLE → PLOT-ONLY STROKE DRAW</div>
  </AbsoluteFill>;
};
