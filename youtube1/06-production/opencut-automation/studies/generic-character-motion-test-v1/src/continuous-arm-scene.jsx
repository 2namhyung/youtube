import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};

const mix = (a, b, t) => a + (b - a) * t;
const mixPoint = (a, b, t) => ({x: mix(a.x, b.x, t), y: mix(a.y, b.y, t)});
const ease = (value) => value * value * (3 - 2 * value);

// Half-widths measured against the approved master at comparable sleeve
// positions. Only the first 14% is widened, and that root remains buried under
// the torso. Every visible cross-section is invariant across all 72 frames.
const sleeveHalfWidth = (t) => {
  if (t < 0.14) return mix(100, 64, t / 0.14);
  if (t < 0.55) return mix(64, 52, (t - 0.14) / 0.41);
  return mix(52, 39, (t - 0.55) / 0.45);
};

const quadraticPoint = (a, b, c, t) => {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  };
};

const quadraticTangent = (a, b, c, t) => ({
  x: 2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x),
  y: 2 * (1 - t) * (b.y - a.y) + 2 * t * (c.y - b.y),
});

const roundedClosedPath = (points) => {
  const p = points;
  let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`;
  for (let i = 0; i < p.length; i++) {
    const current = p[i];
    const next = p[(i + 1) % p.length];
    const after = p[(i + 2) % p.length];
    const c1 = {x: current.x + (next.x - p[(i - 1 + p.length) % p.length].x) / 6, y: current.y + (next.y - p[(i - 1 + p.length) % p.length].y) / 6};
    const c2 = {x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6};
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return `${d} Z`;
};

const openSmoothPath = (points) => {
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const before = points[Math.max(0, i - 1)];
    const current = points[i];
    const next = points[i + 1];
    const after = points[Math.min(points.length - 1, i + 2)];
    const c1 = {x: current.x + (next.x - before.x) / 6, y: current.y + (next.y - before.y) / 6};
    const c2 = {x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6};
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return d;
};

const closedStripPath = (left, right) => {
  const commands = [`M ${left[0].x.toFixed(2)} ${left[0].y.toFixed(2)}`];
  for (const point of left.slice(1)) commands.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  for (const point of [...right].reverse()) commands.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  commands.push('Z');
  return commands.join(' ');
};

const sleeveGeometry = (progress) => {
  // The sleeve root is deliberately buried beneath the torso artwork. This
  // keeps the open shoulder cap invisible while the arm emerges continuously.
  const shoulder = {x: 535, y: 474};
  const elbow = mixPoint({x: 674, y: 648}, {x: 682, y: 590}, progress);
  const wrist = mixPoint({x: 766, y: 780}, {x: 818, y: 472}, progress);
  const left = [];
  const right = [];
  const samples = 18;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = quadraticPoint(shoulder, elbow, wrist, t);
    const tangent = quadraticTangent(shoulder, elbow, wrist, t);
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const normal = {x: -tangent.y / length, y: tangent.x / length};
    const width = sleeveHalfWidth(t);
    left.push({x: center.x + normal.x * width, y: center.y + normal.y * width});
    right.push({x: center.x - normal.x * width, y: center.y - normal.y * width});
  }
  const angle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x) * 180 / Math.PI;
  const rightForward = [...right];
  return {
    path: closedStripPath(left, right),
    leftPath: openSmoothPath(left.slice(3)),
    rightPath: openSmoothPath(rightForward.slice(3)),
    wrist,
    angle,
  };
};

const Hand = ({x, y, angle}) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <path
      d="M -13 -43 C 13 -49 47 -43 69 -24 C 84 -11 84 8 70 18 C 60 26 50 25 42 20 C 50 34 44 47 32 51 C 21 55 12 47 6 39 C 7 50 -1 59 -13 58 C -28 57 -34 43 -35 28 C -41 35 -54 34 -61 25 C -68 16 -64 2 -53 -8 C -43 -17 -32 -30 -13 -43 Z"
      fill="#F3AD67"
      stroke="#171A1F"
      strokeWidth="8"
      strokeLinejoin="round"
    />
    <path d="M 5 38 C 0 23 -1 11 2 -3 M 24 42 C 17 24 16 10 18 -4 M 43 33 C 34 18 33 6 33 -5" fill="none" stroke="#171A1F" strokeWidth="6" strokeLinecap="round" opacity={0.92}/>
    <path d="M -49 8 C -35 4 -24 -2 -16 -13" fill="none" stroke="#171A1F" strokeWidth="6" strokeLinecap="round"/>
  </g>
);

export const ContinuousArmMeshTest = () => {
  const frame = useCurrentFrame();
  const raw = interpolate(frame, [10, 54], [0, 1], clamp);
  const progress = ease(raw);
  const settle = Math.sin(Math.max(0, frame - 54) / 18 * Math.PI) * (frame >= 54 ? 0.018 : 0);
  const motion = Math.min(1, progress + settle);
  const arm = sleeveGeometry(motion);

  return <AbsoluteFill style={{background: '#EEE5D7', overflow: 'hidden', fontFamily: 'Arial, sans-serif', color: '#202A36'}}>
    <div style={{position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 76% 20%,rgba(255,255,255,.9),transparent 38%),repeating-linear-gradient(7deg,rgba(32,42,54,.018) 0 1px,transparent 1px 13px)'}}/>
    <div style={{position: 'absolute', left: 58, top: 58, fontSize: 24, letterSpacing: 3.4, fontWeight: 800, color: '#41566B'}}>CONTINUOUS ARM DEFORMATION · 3 SEC</div>
    <div style={{position: 'absolute', left: 58, top: 104, fontSize: 54, lineHeight: 1.08, fontWeight: 900}}>힌지 표시 없이<br/>팔 전체가 이어지는 테스트</div>

    <svg viewBox="0 0 1024 1536" style={{position: 'absolute', left: -70, top: 238, width: 1228.8, height: 1843.2, overflow: 'visible'}}>
      <defs>
        <linearGradient id="sleeveBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#315F86"/>
          <stop offset="0.55" stopColor="#244E73"/>
          <stop offset="1" stopColor="#183B5C"/>
        </linearGradient>
      </defs>
      <path d={arm.path} fill="url(#sleeveBlue)" stroke="none"/>
      <path d={arm.leftPath} fill="none" stroke="#171A1F" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={arm.rightPath} fill="none" stroke="#171A1F" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      <Hand x={arm.wrist.x} y={arm.wrist.y} angle={arm.angle}/>
      <image href={staticFile('continuous-arm/character-base.png')} x="0" y="0" width="1024" height="1536"/>
    </svg>

    <div style={{position: 'absolute', left: 58, bottom: 104, right: 58, display: 'flex', justifyContent: 'space-between', alignItems: 'end'}}>
      <div style={{fontSize: 31, fontWeight: 900}}>연속 소매 외곽선 · 가변 폭 · 곡선 중심선</div>
      <div style={{fontSize: 20, lineHeight: 1.35, textAlign: 'right', color: '#506275'}}>팔꿈치 원·겹침선 없음<br/>승인 원화 기반 비제작 PoC</div>
    </div>
  </AbsoluteFill>;
};
