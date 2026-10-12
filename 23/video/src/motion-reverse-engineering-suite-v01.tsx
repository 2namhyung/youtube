import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const BG = '#eee8da';
const BLUE = '#2864c7';
const RED = '#d54335';
const GREEN = '#2b9b68';
const ORANGE = '#e8792e';
const PURPLE = '#7651b5';
const PINK = '#c13b8a';
const INK = '#20242a';
const CYAN = '#36a9bd';

const p = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
const ease = (value: number) => value * value * (3 - 2 * value);

const Chrome: React.FC<{label: string}> = ({label}) => <div style={{position: 'absolute', left: 34, top: 26, color: INK, font: '700 24px Arial', letterSpacing: 1}}>{label}</div>;

export const SuiteSample01: React.FC = () => {
  const f = useCurrentFrame();
  const b = ease(p(f, 0, 27));
  const l = ease(p(f, 27, 48));
  const r = ease(p(f, 48, 75));
  return <AbsoluteFill style={{backgroundColor: BG, overflow: 'hidden'}}>
    <Chrome label="01 · INDEPENDENT ACCUMULATION" />
    <div data-suite-target="building" style={{position: 'absolute', left: 360, top: -180 + 430 * b, width: 1200, height: 650, opacity: b, background: BLUE, clipPath: 'polygon(0 38%,50% 0,100% 38%,100% 100%,0 100%)'}}>
      <div style={{position: 'absolute', left: 160, top: 290, width: 880, height: 110, background: '#d8dfec'}} />
    </div>
    <div data-suite-target="left-person" style={{position: 'absolute', left: 230, top: 900 - 620 * l, width: 390, height: 650, opacity: l}}>
      <div style={{position: 'absolute', left: 105, width: 180, height: 180, borderRadius: 100, background: RED}} />
      <div style={{position: 'absolute', top: 150, width: 390, height: 500, borderRadius: 90, background: RED}} />
    </div>
    <div data-suite-target="right-person" style={{position: 'absolute', left: 1300, top: 900 - 600 * r, width: 390, height: 640, opacity: r}}>
      <div style={{position: 'absolute', left: 105, width: 180, height: 180, borderRadius: 100, background: GREEN}} />
      <div style={{position: 'absolute', top: 150, width: 390, height: 490, borderRadius: 90, background: GREEN}} />
    </div>
  </AbsoluteFill>;
};

export const SuiteSample04: React.FC = () => {
  const f = Math.min(useCurrentFrame(), 239);
  const camera = ease(p(f, 0, 220));
  const mapX = -180 - 650 * camera;
  const mapY = -40 - 110 * camera;
  const mapScale = 1 + .25 * camera;
  const opening = 1 - ease(p(f, 0, 14));
  const israel = ease(p(f, 60, 97));
  const aircraft = ease(p(f, 105, 142));
  const iran = ease(p(f, 128, 170));
  const route = p(f, 196, 239);
  const flash = f < 188 ? 0 : f <= 194 ? interpolate(f, [188, 194], [.25, 1]) : f <= 207 ? interpolate(f, [194, 207], [1, 0]) : 0;
  return <AbsoluteFill data-suite-target="continuous-map-camera-scene" style={{backgroundColor: '#d9e4ee', overflow: 'hidden'}}>
    <div data-suite-target="continuous-map" style={{position: 'absolute', left: mapX, top: mapY, width: 2400, height: 1200, transform: `scale(${mapScale})`, transformOrigin: '0 0'}}>
      <div style={{position: 'absolute', left: 70, top: 180, width: 2150, height: 820, borderRadius: '42% 35% 48% 40%', background: '#8ea7bd', clipPath: 'polygon(0 32%,12% 8%,30% 18%,42% 0,58% 20%,75% 9%,100% 34%,91% 63%,72% 72%,58% 100%,39% 78%,20% 94%,4% 69%)'}} />
      <div data-suite-target="continuous-map-landmarks" style={{position: 'absolute', left: 350, top: 300, width: 190, height: 110, borderRadius: '55% 35%', background: '#16435b'}} />
      <div style={{position: 'absolute', left: 1080, top: 250, width: 230, height: 150, borderRadius: '35% 60%', background: '#16435b'}} />
      <div style={{position: 'absolute', left: 1760, top: 650, width: 260, height: 120, borderRadius: '60% 35%', background: '#16435b'}} />
      <div data-suite-target="us-person" style={{position: 'absolute', left: 650, top: 210, width: 230, height: 450, opacity: opening}}><div style={{width: 160, height: 160, margin: '0 auto', borderRadius: 100, background: GREEN}}/><div style={{height: 290, borderRadius: 80, background: GREEN}}/></div>
      <div data-suite-target="us-marker" style={{position: 'absolute', left: 620, top: 580, width: 290, height: 120, borderRadius: 80, background: PURPLE, opacity: opening}} />
      <div data-suite-target="israel-marker" style={{position: 'absolute', left: 820, top: 650, width: 115, height: 190, border: `14px solid ${CYAN}`, opacity: israel}} />
      <div data-suite-target="middle-aircraft" style={{position: 'absolute', left: 850 + 390 * aircraft, top: 600 - 90 * aircraft, width: 150, height: 56, background: BLUE, opacity: aircraft, clipPath: 'polygon(0 35%,70% 35%,85% 0,100% 0,92% 50%,100% 100%,85% 100%,70% 65%,0 65%)'}} />
      <div data-suite-target="iran-border" style={{position: 'absolute', left: 1370, top: 350, width: 390, height: 420, border: `14px solid ${RED}`, borderRadius: '45% 34% 52% 40%', opacity: iran}} />
      <svg data-suite-target="route" width="2400" height="1200" style={{position: 'absolute', inset: 0}}><path d="M 880 710 C 1080 560 1300 700 1500 580" fill="none" stroke={PINK} strokeWidth="18" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - route} /></svg>
      <div data-suite-target="explosion-flash" style={{position: 'absolute', left: 1400, top: 420, width: 180, height: 180, background: ORANGE, opacity: flash, boxShadow: `0 0 ${80 + 180 * flash}px ${60 * flash}px #fff7b0`, transform: `scale(${.55 + .65 * flash}) rotate(45deg)`}} />
    </div>
    <Chrome label="04 · CONTINUOUS MAP CAMERA / LOCAL OVERLAYS" />
  </AbsoluteFill>;
};

export const SuiteSample05: React.FC = () => {
  const f = Math.min(useCurrentFrame(), 26);
  const q = ease(p(f, 0, 26));
  return <AbsoluteFill style={{backgroundColor: BG, overflow: 'hidden'}}>
    <Chrome label="05 · SAME OBJECT SURVIVES REFRAME" />
    <div data-suite-target="departing-chart" style={{position: 'absolute', left: 100 - 1000 * q, top: 180, width: 820, height: 650, background: '#fff', border: `12px solid ${INK}`}}>
      {[.2,.45,.7].map((h, i) => <div key={i} style={{position: 'absolute', left: 100 + i * 190, bottom: 70, width: 110, height: 460 * h, background: ORANGE}} />)}
    </div>
    <div data-suite-target="preserved-flag-map" style={{position: 'absolute', left: 1120 - 500 * q, top: 260 - 20 * q, width: 650, height: 560}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: '45% 34% 52% 38%', background: CYAN}} />
      <div style={{position: 'absolute', left: 230, top: 125, width: 150, height: 92, background: RED}} />
      <div style={{position: 'absolute', left: 230, top: 155, width: 150, height: 32, background: '#fff'}} />
    </div>
  </AbsoluteFill>;
};

const ExitScene: React.FC<{x: number}> = ({x}) => <div data-suite-target="scene-parent" style={{position: 'absolute', inset: 0, background: BG, transform: `translateX(${x}px)`}}>
  <div data-suite-child="background" style={{position: 'absolute', inset: 0, background: '#b9d7df', backgroundImage: 'linear-gradient(0deg,transparent 48%,#8bb8c4 50%,transparent 52%)', backgroundSize: '100% 80px'}} />
  <div data-suite-child="tanker" style={{position: 'absolute', left: 350, top: 500, width: 1000, height: 250, background: BLUE, clipPath: 'polygon(0 15%,88% 15%,100% 70%,80% 100%,10% 100%)'}} />
  <div data-suite-child="number" style={{position: 'absolute', left: 1400, top: 270, width: 280, height: 160, borderRadius: 80, background: ORANGE}} />
  <div data-suite-child="subtitle" style={{position: 'absolute', left: 480, top: 910, width: 960, height: 70, background: PURPLE}} />
  <Chrome label="06A · EXHAUSTIVE PARENT EXIT" />
</div>;

export const SuiteSample06: React.FC = () => {
  const f = useCurrentFrame();
  if (f <= 29) {
    const x = -1920 * ease(p(f, 0, 15));
    return <AbsoluteFill style={{backgroundColor: '#111', overflow: 'hidden'}}><ExitScene x={x} /></AbsoluteFill>;
  }
  if (f === 30) return <AbsoluteFill style={{backgroundColor: '#f4efe2'}}><div style={{position: 'absolute', left: 240, top: 130, width: 1440, height: 820, background: '#fff', border: `18px solid ${INK}`}} /><Chrome label="06B · PRE-CUT FRAME" /></AbsoluteFill>;
  return <AbsoluteFill style={{backgroundColor: '#b9d7df'}}><div style={{position: 'absolute', left: 250, top: 490, width: 1420, height: 300, background: BLUE, clipPath: 'polygon(0 10%,90% 10%,100% 70%,80% 100%,8% 100%)'}} /><Chrome label="06B · POST-CUT FRAME" /></AbsoluteFill>;
};

const Speaker: React.FC = () => <div data-suite-target="speaker-footage" style={{position: 'absolute', left: 650, top: 120, width: 620, height: 900}}>
  <div style={{position: 'absolute', left: 190, width: 240, height: 240, borderRadius: 140, background: '#c89472'}} />
  <div style={{position: 'absolute', top: 210, width: 620, height: 690, borderRadius: 160, background: INK}} />
</div>;

export const SuiteSample07: React.FC = () => {
  const f = Math.min(useCurrentFrame(), 239);
  if (f < 85) {
    const left = ease(p(f, 18, 32));
    const right = ease(p(f, 48, 68));
    return <AbsoluteFill style={{backgroundColor: BG, overflow: 'hidden'}}><Speaker />
      <div data-suite-target="left-overlay" style={{position: 'absolute', left: -360 + 430 * left, top: 180, width: 360, height: 650, background: RED, opacity: left}} />
      <div data-suite-target="right-overlays" style={{position: 'absolute', left: 1480 - 160 * right, top: 170, width: 370, height: 280, background: BLUE, opacity: right}}><div style={{position: 'absolute', top: 330, width: 370, height: 280, background: GREEN}} /></div>
      <Chrome label="07A · SPEAKER-SIDE OVERLAYS" /></AbsoluteFill>;
  }
  if (f < 182) {
    const x = -520 * ease(p(f, 85, 181));
    return <AbsoluteFill style={{backgroundColor: '#fff', overflow: 'hidden'}}><div data-suite-target="gallery-strip" style={{position: 'absolute', left: x, top: 180, width: 2440, height: 720, display: 'flex', gap: 40}}>
      {[RED, BLUE, GREEN, ORANGE, PURPLE].map((c, i) => <div key={c} style={{width: 440, height: 720, flex: 'none', background: c, transform: `rotate(${i % 2 ? 2 : -2}deg)`}} />)}
    </div><Chrome label="07B · HORIZONTAL GALLERY" /></AbsoluteFill>;
  }
  const state = f < 208 ? 0 : f < 229 ? 1 : 2;
  const words = ['Ae', 'PEAK AFTER EFFECTS', 'HIRE A MOTION DESIGNER'];
  return <AbsoluteFill style={{backgroundColor: state === 0 ? INK : state === 1 ? PURPLE : ORANGE, justifyContent: 'center', alignItems: 'center'}}>
    <div data-suite-target="kinetic-title" role="img" aria-label={words[state]} style={{color: '#fff', font: `${state === 0 ? 260 : 110}px Arial`, fontWeight: 900, transform: `scale(${.9 + .1 * ease(p(f, state === 0 ? 182 : state === 1 ? 208 : 229, state === 0 ? 200 : state === 1 ? 222 : 239))})`}}>{words[state]}</div>
  </AbsoluteFill>;
};

const PresenterPlate: React.FC<{frame: number}> = ({frame}) => <div data-suite-target="presenter-plate" style={{position: 'absolute', left: 540, top: 80, width: 840, height: 940, border: `10px solid ${INK}`, background: '#cbd3d4', overflow: 'hidden'}}>
  <div style={{position: 'absolute', left: 260, top: 70, width: 300, height: 300, borderRadius: 170, background: '#c89472'}} />
  <div style={{position: 'absolute', left: 120, top: 340, width: 600, height: 650, background: BLUE, borderRadius: 180}} />
  <div data-suite-target="source-internal-motion" style={{position: 'absolute', left: 350 + 18 * Math.sin(frame / 6), top: 230, width: 130, height: 24 + 8 * Math.sin(frame / 3), background: INK, borderRadius: 20}} />
</div>;

export const SuiteSample08: React.FC = () => {
  const f = Math.min(useCurrentFrame(), 239);
  const a = ease(p(f, 36, 60));
  const b = ease(p(f, 136, 176));
  const c = ease(p(f, 196, 239));
  return <AbsoluteFill style={{backgroundColor: BG}}><PresenterPlate frame={f} />
    <div data-suite-target="right-handshake" style={{position: 'absolute', left: 1450, top: 130, width: 220, height: 150, borderRadius: 80, background: GREEN, opacity: a, transform: `scale(${a})`}} />
    <div data-suite-target="left-tombstone" style={{position: 'absolute', left: 220, top: 300, width: 250, height: 320, borderRadius: '120px 120px 12px 12px', background: PURPLE, opacity: b, transform: `scale(${b})`}} />
    <div data-suite-target="right-person-icon" style={{position: 'absolute', left: 1480, top: 430, width: 190, height: 280, opacity: c, transform: `scale(${c})`}}><div style={{width: 120, height: 120, borderRadius: 70, background: RED, margin: '0 auto'}} /><div style={{height: 170, borderRadius: 70, background: RED}} /></div>
    <Chrome label="08 · STABLE PRESENTER / BILATERAL OVERLAYS" />
  </AbsoluteFill>;
};

export const SuiteSample09: React.FC = () => {
  const f = Math.min(useCurrentFrame(), 95);
  const value = Math.round(interpolate(f, [0, 10, 20, 30, 60], [0, 9306, 17216, 22136, 24751], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const percent = interpolate(f, [0, 10, 20, 30, 60], [0, 2.3, 34, 55.6, 65.8], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const chart = value / 24751;
  const supportA = ease(p(f, 12, 24));
  const supportB = ease(p(f, 20, 30));
  return <AbsoluteFill style={{backgroundColor: '#cfd6da', overflow: 'hidden'}}>
    <div data-suite-target="presenter-context" style={{position: 'absolute', left: 150, top: 180, width: 760, height: 900, borderRadius: 200, background: INK}} />
    <div data-suite-target="phone-shell" style={{position: 'absolute', left: 900, top: 100, width: 460, height: 850, borderRadius: 70, border: `28px solid ${INK}`, background: '#f8f8f5', transform: 'rotate(-6deg)', transformOrigin: '50% 50%', overflow: 'hidden'}}>
      <div data-suite-target="screen-state" style={{position: 'absolute', left: 38, top: 90, width: 328, height: 610, padding: '34px 28px', boxSizing: 'border-box', background: '#dbe5e0', color: INK, fontFamily: 'Arial'}}>
        <div style={{fontSize: 18, fontWeight: 700, opacity: .7}}>REVENUE</div>
        <div data-suite-target="surface-value" style={{fontSize: 42, fontWeight: 900, marginTop: 8}}>${value.toLocaleString('en-US')}</div>
        <div data-suite-target="surface-percent" style={{fontSize: 34, fontWeight: 800, marginTop: 34}}>{percent.toFixed(percent % 1 === 0 ? 0 : 1)}%</div>
        <div style={{position: 'absolute', left: 28, top: 260, width: 270, height: 130, borderLeft: `4px solid ${INK}`, borderBottom: `4px solid ${INK}`}}>
          <div data-suite-target="surface-chart" style={{position: 'absolute', left: 0, bottom: 0, width: 260 * chart, height: 14, background: GREEN, transform: 'rotate(-15deg)', transformOrigin: '0 50%', borderRadius: 12}} />
          {[.36,.58,.76,1].map((ratio, i) => <div key={ratio} style={{position: 'absolute', left: 24 + i * 58, bottom: 10, width: 28, height: 92 * ratio * chart, background: BLUE}} />)}
        </div>
        <div style={{position: 'absolute', left: 28, right: 28, bottom: 62, height: 56, borderRadius: 12, background: '#bfd0ca'}} />
      </div>
    </div>
    <div data-suite-target="support-icon-a" style={{position: 'absolute', left: 1510, top: 180, width: 170, height: 170, opacity: supportA, transform: `scale(${supportA}) rotate(18deg)`, borderRadius: 32, background: PINK}} />
    <div data-suite-target="support-icon-b" style={{position: 'absolute', left: 1515, top: 430, width: 170, height: 170, opacity: supportB, transform: `scale(${supportB}) rotate(45deg)`, borderRadius: '55% 20% 55% 20%', background: CYAN}} />
    <Chrome label="09 · DEVICE SHELL / INSIDE-SURFACE STATE" />
  </AbsoluteFill>;
};

export const SuiteSample10: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= 208) return <AbsoluteFill style={{backgroundColor: '#4f7888'}}><div style={{position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(30deg,transparent 40%,#9bb3b9 42%,transparent 44%)', backgroundSize: '140px 140px'}} /><Chrome label="10 · ADJACENT HARD CUT" /></AbsoluteFill>;
  const snack = ease(p(f, 15, 63));
  const snackValue2 = ease(p(f, 63, 79));
  const phoneReveal = ease(p(f, 109, 123));
  const phoneTravel = ease(p(f, 109, 199));
  const phoneEndValue = f >= 199 ? 1 : 0;
  return <AbsoluteFill style={{backgroundColor: BG}}>
    <div data-suite-target="snack-object" style={{position: 'absolute', left: 230, top: 390, width: 610, height: 250, opacity: snack, transform: `scaleX(${snack})`, transformOrigin: 'left'}}><div style={{position: 'absolute', inset: 0, background: ORANGE, clipPath: 'polygon(0 25%,10% 0,90% 0,100% 25%,90% 100%,10% 100%)'}} /></div>
    <div data-suite-target="snack-values" style={{position: 'absolute', left: 220, top: 680, width: 640, textAlign: 'center', color: INK, font: '700 52px Arial', opacity: snack}}>₩1,000 → <span style={{opacity: snackValue2}}>₩27,000,000</span></div>
    <div data-suite-target="phone-object" style={{position: 'absolute', left: 1240, top: -160 + 340 * phoneTravel, width: 260, height: 520, borderRadius: 44, border: `24px solid ${INK}`, background: PINK, opacity: phoneReveal}} />
    <div data-suite-target="phone-values" style={{position: 'absolute', left: 1030, top: 680, width: 760, textAlign: 'center', color: INK, font: '700 46px Arial', opacity: phoneReveal}}>₩1,000,000 <span data-suite-target="phone-end-value" style={{color: PINK, opacity: phoneEndValue}}>→ ₩27,000,000,000</span></div>
    <Chrome label="10 · OBJECT-BOUND VALUE COMPARISON" />
  </AbsoluteFill>;
};
