import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const BG = '#efe7d2';
const INK = '#17212b';
const BLUE = '#3573c8';
const GREEN = '#35a873';
const PINK = '#db5f92';
const CYAN = '#52bdd1';
const PURPLE = '#7255a8';

const progress = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
const smooth = (value: number) => value * value * (3 - 2 * value);
const Chrome: React.FC<{label: string}> = ({label}) => <div data-text-role="screen-chrome" style={{position: 'absolute', left: 54, top: 38, color: INK, font: '700 25px Arial', letterSpacing: 1.2}}>{label}</div>;

export const CorrectedSample08: React.FC = () => {
  const frame = Math.min(useCurrentFrame(), 180);
  const left = smooth(progress(frame, 36, 68));
  const right = smooth(progress(frame, 112, 150));
  return <AbsoluteFill data-review-profile="remotion-motion" style={{backgroundColor: BG, overflow: 'hidden'}}>
    <div data-suite-target="reserved-source-video-region" data-content-policy="presenter-not-reconstructed" style={{position: 'absolute', left: 540, top: 98, width: 840, height: 884, border: '4px dashed rgba(23,33,43,.28)', borderRadius: 24}} />
    <div data-suite-target="left-support-overlay" style={{position: 'absolute', left: 230, top: 330, width: 230, height: 300, opacity: left, transform: `translateX(${(1-left)*-90}px) scale(${.88+.12*left})`, borderRadius: '112px 112px 14px 14px', background: PURPLE}} />
    <div data-suite-target="right-support-overlay" style={{position: 'absolute', left: 1460, top: 260, width: 230, height: 170, opacity: right, transform: `translateX(${(1-right)*90}px) scale(${.88+.12*right})`, borderRadius: 86, background: GREEN}}>
      <div style={{position: 'absolute', left: 52, top: 46, width: 72, height: 72, borderRadius: 40, border: `16px solid ${BG}`}} />
      <div style={{position: 'absolute', left: 108, top: 46, width: 72, height: 72, borderRadius: 40, border: `16px solid ${BG}`}} />
    </div>
    <Chrome label="08 · NON-PERSON SIDE OVERLAYS / PRESENTER REGION RESERVED" />
  </AbsoluteFill>;
};

export const CorrectedSample09: React.FC = () => {
  const frame = Math.min(useCurrentFrame(), 60);
  const value = Math.round(interpolate(frame, [0, 10, 20, 30, 60], [0, 9306, 17216, 22136, 24751], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const percent = interpolate(frame, [0, 10, 20, 30, 60], [0, 2.3, 34, 55.6, 65.8], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const chart = value / 24751;
  const supportA = smooth(progress(frame, 12, 24));
  const supportB = smooth(progress(frame, 20, 30));
  return <AbsoluteFill data-review-profile="remotion-motion" style={{backgroundColor: '#cfd6da', overflow: 'hidden'}}>
    <div data-suite-target="phone-shell" style={{position: 'absolute', left: 730, top: 100, width: 460, height: 850, borderRadius: 70, border: `28px solid ${INK}`, background: '#f8f8f5', transform: 'rotate(-6deg)', transformOrigin: '50% 50%', overflow: 'hidden'}}>
      <div data-suite-target="screen-state" data-text-role="surface-content" style={{position: 'absolute', left: 38, top: 90, width: 328, height: 610, padding: '34px 28px', boxSizing: 'border-box', background: '#dbe5e0', color: INK, fontFamily: 'Arial'}}>
        <div style={{fontSize: 18, fontWeight: 700, opacity: .7}}>REVENUE</div>
        <div data-suite-target="surface-value" style={{fontSize: 42, fontWeight: 900, marginTop: 8}}>${value.toLocaleString('en-US')}</div>
        <div data-suite-target="surface-percent" style={{fontSize: 34, fontWeight: 800, marginTop: 34}}>{percent.toFixed(percent % 1 === 0 ? 0 : 1)}%</div>
        <div style={{position: 'absolute', left: 28, top: 260, width: 270, height: 130, borderLeft: `4px solid ${INK}`, borderBottom: `4px solid ${INK}`}}>
          <div data-suite-target="surface-chart" style={{position: 'absolute', left: 0, bottom: 0, width: 260 * chart, height: 14, background: GREEN, transform: 'rotate(-15deg)', transformOrigin: '0 50%', borderRadius: 12}} />
          {[.36,.58,.76,1].map((ratio, index) => <div key={ratio} style={{position: 'absolute', left: 24 + index * 58, bottom: 10, width: 28, height: 92 * ratio * chart, background: BLUE}} />)}
        </div>
      </div>
    </div>
    <div data-suite-target="support-overlay-a" style={{position: 'absolute', left: 1390, top: 210, width: 170, height: 170, opacity: supportA, transform: `scale(${supportA}) rotate(18deg)`, borderRadius: 32, background: PINK}} />
    <div data-suite-target="support-overlay-b" style={{position: 'absolute', left: 1400, top: 460, width: 170, height: 170, opacity: supportB, transform: `scale(${supportB}) rotate(45deg)`, borderRadius: '55% 20% 55% 20%', background: CYAN}} />
    <Chrome label="09 · DEVICE SHELL / SOURCE-BOUND SURFACE STATE" />
  </AbsoluteFill>;
};
