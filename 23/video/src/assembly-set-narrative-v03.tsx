import React from 'react';
import {AbsoluteFill, Freeze, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const BASE = 'assets/style-calibration/episode-001-sh003-assembly-set-v03';
const asset = (file: string) => staticFile(`${BASE}/${file}`);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

type LayerProps = {
  file: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  height: number;
  fromX?: number;
  fromY?: number;
  fromScale?: number;
  toScale?: number;
  mirror?: boolean;
  zIndex: number;
  opacity?: number;
};

function Layer({file, start, end, left, top, width, height, fromX = 0, fromY = 0, fromScale = 0.82, toScale = 1, mirror = false, zIndex, opacity = 1}: LayerProps) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const progress = clamp((frame - start) / Math.max(1, end - start));
  const eased = progress * progress * (3 - 2 * progress);
  const x = interpolate(eased, [0, 1], [fromX, 0]);
  const y = interpolate(eased, [0, 1], [fromY, 0]);
  const scale = interpolate(eased, [0, 1], [fromScale, toScale]);
  const visible = frame < start ? 0 : opacity;
  return (
    <div style={{position: 'absolute', left, top, width, height, zIndex, opacity: visible, transform: `translate3d(${x}px, ${y}px, 0) scale(${mirror ? -scale : scale}, ${scale})`, transformOrigin: 'center bottom', filter: 'drop-shadow(0 18px 22px rgba(50, 33, 20, 0.16))'}}>
      <Img src={asset(file)} style={{width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
    </div>
  );
}

function Label({children, left, top, start, color = '#3b3028', zIndex = 100}: {children: string; left: number; top: number; start: number; color?: string; zIndex?: number}) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const opacity = interpolate(frame, [0, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <div style={{position: 'absolute', left, top, zIndex, opacity, color, fontFamily: 'Arial, sans-serif', fontSize: 56, fontWeight: 700, letterSpacing: '0.05em', textShadow: '0 2px 0 rgba(255,250,240,.8)'}}>{children}</div>;
}

function Gear({file, start, left, top, size, direction}: {file: string; start: number; left: number; top: number; size: number; direction: 1 | -1}) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const progress = clamp((frame - start) / 30);
  const rotation = frame < start ? 0 : frame < start + 30 ? direction * interpolate(progress, [0, 1], [0, 100]) : direction * 100;
  const scale = frame < start ? 0.65 : interpolate(clamp((frame - start) / 30), [0, 1], [0.65, 1]);
  return <div style={{position: 'absolute', left, top, width: size, height: size, zIndex: 76, opacity: frame < start ? 0 : 1, transform: `scale(${scale}) rotate(${rotation}deg)`, transformOrigin: 'center'}}><Img src={asset(file)} style={{width: '100%', height: '100%'}} /></div>;
}

function FocalBadge({children, left, top, start, color}: {children: string; left: number; top: number; start: number; color: string}) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  return <div style={{position: 'absolute', left, top, zIndex: 110, padding: '8px 18px', borderRadius: 999, color: '#fffaf0', backgroundColor: color, font: '700 36px Arial, sans-serif', letterSpacing: '0.08em', boxShadow: '0 8px 18px rgba(50,33,20,.18)'}}>{children}</div>;
}

function ChamberBase() {
  return <>
    <Layer file="assets/assembly-rear-wall-v01.png" start={15} end={39} left={120} top={60} width={1680} height={900} fromY={-90} fromScale={0.84} toScale={1} zIndex={10} />
    <Layer file="assets/assembly-seating-left-v02.png" start={20} end={39} left={18} top={355} width={930} height={620} fromX={-180} fromY={55} fromScale={0.72} toScale={0.82} zIndex={24} />
    <Layer file="assets/assembly-seating-right-v01.png" start={25} end={39} left={1010} top={355} width={900} height={620} fromX={180} fromY={55} fromScale={0.72} toScale={0.82} zIndex={25} />
    <Layer file="assets/assembly-presiding-dais-v01.png" start={27} end={39} left={745} top={430} width={830} height={550} fromY={180} fromScale={0.78} toScale={0.88} zIndex={42} />
  </>;
}

/** Inactive narrative calibration with official profile-photo cutouts. This is not a production cut or user PASS. */
export function AssemblySetNarrativeV03() {
  const frame = useCurrentFrame();
  const cameraProgress = clamp(frame / 39);
  const cameraScale = interpolate(cameraProgress, [0, 1], [0.98, 1]);
  const cameraX = interpolate(cameraProgress, [0, 1], [0, -12]);
  const cameraY = interpolate(cameraProgress, [0, 1], [0, -6]);
  const kimSupportProgress = clamp((frame - 199) / 20);
  const kimSupportScale = interpolate(kimSupportProgress, [0, 1], [1, 0.62]);
  const kimSupportX = interpolate(kimSupportProgress, [0, 1], [0, -420]);
  const kimSupportY = interpolate(kimSupportProgress, [0, 1], [0, 150]);
  const kimSupportOpacity = interpolate(kimSupportProgress, [0, 1], [1, 0.72]);
  return <AbsoluteFill style={{backgroundColor: '#f4edde', overflow: 'hidden'}}>
    <Img src={asset('background.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
    <div style={{position: 'absolute', inset: 0, transform: `translate3d(${cameraX}px, ${cameraY}px, 0) scale(${cameraScale})`, transformOrigin: 'center center'}}>
      <ChamberBase />
      <div style={{position: 'absolute', inset: 0, zIndex: 60, opacity: frame < 199 ? kimSupportOpacity : 0, transform: `translate3d(${kimSupportX}px, ${kimSupportY}px, 0) scale(${kimSupportScale})`, transformOrigin: 'center center', transition: 'none'}}>
        <Layer file="assets/assembly-speaker-podium-v01.png" start={99} end={119} left={760} top={505} width={440} height={402} fromX={-100} fromY={95} fromScale={0.72} toScale={0.86} zIndex={58} />
        <Layer file="assets/assembly-speaker-photo-kim-v01.png" start={99} end={119} left={815} top={265} width={360} height={555} fromY={150} fromScale={0.74} toScale={0.88} zIndex={64} />
        <Label left={845} top={286} start={99}>김승원</Label>
        <FocalBadge left={610} top={170} start={99} color="#747642">절차</FocalBadge>
        <Gear file="assets/assembly-gear-small-v01.svg" start={109} left={420} top={445} size={180} direction={1} />
        <Gear file="assets/assembly-gear-large-v01.svg" start={119} left={1230} top={390} size={260} direction={-1} />
      </div>
      <div style={{position: 'absolute', inset: 0, zIndex: 72}}>
        <Layer file="assets/assembly-speaker-photo-kim-v01.png" start={199} end={219} left={112} top={465} width={245} height={360} fromX={-90} fromY={45} fromScale={0.74} toScale={0.92} zIndex={75} />
        <Label left={145} top={410} start={199}>김승원</Label>
        <FocalBadge left={310} top={410} start={199} color="#747642">절차</FocalBadge>
        <Gear file="assets/assembly-gear-small-v01.svg" start={199} left={352} top={680} size={88} direction={1} />
        <Gear file="assets/assembly-gear-large-v01.svg" start={199} left={350} top={560} size={126} direction={-1} />
      </div>
      <div style={{position: 'absolute', inset: 0, zIndex: 70}}>
        <Layer file="assets/assembly-speaker-photo-park-v01.png" start={199} end={219} left={1198} top={425} width={248} height={365} fromX={120} fromY={90} fromScale={0.74} toScale={0.9} zIndex={65} />
        <Label left={1235} top={365} start={199}>박형수</Label>
        <FocalBadge left={1540} top={190} start={199} color="#cf6250">권리</FocalBadge>
        <Layer file="assets/assembly-rights-shield-v01.png" start={219} end={239} left={1535} top={255} width={300} height={340} fromX={125} fromY={70} fromScale={0.45} toScale={0.92} zIndex={84} />
        <Layer file="assets/assembly-bill-card-v01.svg" start={219} end={239} left={680} top={145} width={560} height={355} fromX={-150} fromY={80} fromScale={0.72} toScale={0.9} zIndex={82} />
        {frame >= 219 ? <div style={{position: 'absolute', left: 840, top: 395, zIndex: 90, color: '#6b412a', font: '700 42px Arial, sans-serif', letterSpacing: '0.08em'}}>2220257</div> : null}
      </div>
    </div>
  </AbsoluteFill>;
}

export function AssemblySetNarrativePairV03() {
  const frame = useCurrentFrame();
  const transition = clamp((frame - 60) / 30);
  const eased = transition * transition * (3 - 2 * transition);
  const cardScale = interpolate(eased, [0, 1], [0.92, 0.58]);
  const cardX = interpolate(eased, [0, 1], [0, -260]);
  const cardY = interpolate(eased, [0, 1], [0, -190]);
  const routesOpacity = clamp((frame - 66) / 18);
  return <AbsoluteFill style={{backgroundColor: '#f4edde', overflow: 'hidden'}}>
    <Freeze frame={298}><AssemblySetNarrativeV03 /></Freeze>
    <div style={{position: 'absolute', inset: 0, opacity: frame < 60 ? 0 : 1, background: 'rgba(244,237,222,.78)'}} />
    <div style={{position: 'absolute', left: 620 + cardX, top: 230 + cardY, width: 680, height: 430, zIndex: 200, transform: `scale(${cardScale})`, transformOrigin: 'center center'}}>
      <Img src={asset('assets/assembly-bill-card-v01.svg')} style={{width: '100%', height: '100%'}} />
      <div style={{position: 'absolute', left: 260, top: 272, color: '#6b412a', font: '700 46px Arial, sans-serif'}}>2220257</div>
    </div>
    <svg style={{position: 'absolute', left: 760, top: 370, width: 900, height: 420, zIndex: 220, opacity: routesOpacity, overflow: 'visible'}} viewBox="0 0 900 420">
      <path d="M80 210 H350 C430 210 430 70 520 70 H820" fill="none" stroke="#747642" strokeWidth="18" strokeLinecap="round" />
      <path d="M80 210 H350 C430 210 430 350 520 350 H820" fill="none" stroke="#cf6250" strokeWidth="18" strokeLinecap="round" />
      <circle cx="80" cy="210" r="30" fill="#373c28" />
      <circle cx="820" cy="70" r="30" fill="#747642" />
      <circle cx="820" cy="350" r="30" fill="#cf6250" />
    </svg>
  </AbsoluteFill>;
}
