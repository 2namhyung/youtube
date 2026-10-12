import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import motionConfig from '../config/motion-parameters.json';

const FPS = motionConfig.render.fps;
const [droneSegment, robotSegment] = motionConfig.segments;
const DRONE_FRAMES = droneSegment.sourceFrameRange[1] - droneSegment.sourceFrameRange[0];
const ROBOT_START = DRONE_FRAMES + motionConfig.render.segmentGapFrames;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const eventAt = (segment, type) => segment.events.find((event) => event.type === type)?.at;

function CentralBackground({kind}) {
  if (kind === 'robot') {
    return <>
      <defs>
        <linearGradient id="robotSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86badb"/><stop offset="1" stopColor="#d7e6e5"/>
        </linearGradient>
      </defs>
      <rect width="360" height="338" fill="url(#robotSky)"/>
      <path d="M0 232 Q72 202 145 230 T360 220 V338 H0Z" fill="#9a9b7d"/>
      <path d="M0 258 Q90 235 175 260 T360 250 V338 H0Z" fill="#6b765f" opacity=".7"/>
    </>;
  }
  return <>
    <defs>
      <linearGradient id="fieldSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b8d1dc"/><stop offset="1" stopColor="#edf0d0"/>
      </linearGradient>
      <linearGradient id="fieldRice" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d7c94e"/><stop offset="1" stopColor="#78902f"/>
      </linearGradient>
    </defs>
    <rect width="360" height="338" fill="url(#fieldSky)"/>
    <path d="M0 120 L48 82 88 110 140 58 192 112 246 76 302 115 360 82 V183 H0Z" fill="#6d8790" opacity=".78"/>
    <path d="M0 160 L72 116 126 151 188 102 246 150 310 111 360 140 V205 H0Z" fill="#557b74" opacity=".68"/>
    <path d="M0 185 Q88 168 176 190 T360 183 V338 H0Z" fill="url(#fieldRice)"/>
    <path d="M0 255 Q90 232 180 257 T360 248" fill="none" stroke="#e7d673" strokeWidth="35" opacity=".42"/>
    {Array.from({length: 15}, (_, index) => <path key={index} d={`M${index * 26 - 8} 319 l12 -34 M${index * 26 + 2} 319 l-6 -31`} stroke="#536c29" strokeWidth="3" opacity=".62"/>)}
  </>;
}

function Field({kind, showLabel, children}) {
  return <svg width="540" height="960" viewBox="0 0 540 960" role="img" aria-label="자체 제작 SVG 모션 구조 재현">
    <rect width="540" height="960" fill="#050607"/>
    <defs><clipPath id="sceneViewport"><rect x="0" y="246" width="540" height="507"/></clipPath></defs>
    <g clipPath="url(#sceneViewport)">
      <g transform="translate(0 246) scale(1.5)">
        <CentralBackground kind={kind}/>
        {children}
      </g>
    </g>
    {showLabel && <g>
      <rect x="14" y="14" width="257" height="45" rx="8" fill="#050607" stroke="#fff" strokeWidth="2" opacity=".92"/>
      <text x="28" y="45" fill="#fff" fontSize="24" fontWeight="800">OWN SVG · 자체 SVG</text>
      <text x="270" y="892" textAnchor="middle" fill="#d9dfe1" fontSize="19" fontWeight="700">MOTION-STRUCTURE STUDY</text>
      <text x="270" y="922" textAnchor="middle" fill="#9fa8ac" fontSize="15">NO SOURCE PIXELS · RESEARCH ONLY</text>
    </g>}
  </svg>;
}

function Farmer() {
  const [leftHandX, handY] = droneSegment.anchors.leftHand;
  const [rightHandX] = droneSegment.anchors.rightHand;
  return <g aria-label="드론 하부 바를 양손으로 잡은 자체 제작 SVG 농부">
    <path d={`M148 179 Q136 143 ${leftHandX} ${handY} M212 179 Q224 143 ${rightHandX} ${handY}`} fill="none" stroke="#57483e" strokeWidth="15" strokeLinecap="round"/>
    <path d="M145 174 Q180 160 215 174 L225 247 Q180 260 135 247Z" fill="#3f4947" stroke="#22292a" strokeWidth="4"/>
    <path d="M150 245 L145 326 M210 245 L215 326" fill="none" stroke="#303736" strokeWidth="18" strokeLinecap="round"/>
    <path d="M133 330 Q145 321 157 330 M203 330 Q215 321 227 330" fill="none" stroke="#202626" strokeWidth="8" strokeLinecap="round"/>
    <ellipse cx="180" cy="140" rx="27" ry="31" fill="#f1ad90" stroke="#332a29" strokeWidth="4"/>
    <path d="M154 134 Q180 103 206 134 L198 116 186 124 178 113 166 125 158 117Z" fill="#776052"/>
    <circle cx="169" cy="142" r="3" fill="#332a29"/><circle cx="191" cy="142" r="3" fill="#332a29"/>
    <path d="M169 156 Q180 164 191 156" fill="none" stroke="#9d5149" strokeWidth="3" strokeLinecap="round"/>
    <circle cx={leftHandX} cy={handY} r="8" fill="#f1ad90" stroke="#332a29" strokeWidth="3"/>
    <circle cx={rightHandX} cy={handY} r="8" fill="#f1ad90" stroke="#332a29" strokeWidth="3"/>
  </g>;
}

function Drone() {
  const barY = droneSegment.anchors.gripBarY;
  return <g aria-label="자체 제작 SVG 농업용 드론">
    <path d="M126 22 L234 22 L246 55 L114 55Z" fill="#dbe6e4" stroke="#26383c" strokeWidth="4"/>
    <rect x="155" y="12" width="50" height="54" rx="12" fill="#b9ccca" stroke="#26383c" strokeWidth="4"/>
    <circle cx="180" cy="39" r="11" fill="#354e58"/><circle cx="176" cy="35" r="3" fill="#a9e9e5"/>
    <path d="M128 30 L83 8 M232 30 L277 8 M128 48 L80 68 M232 48 L280 68" fill="none" stroke="#26383c" strokeWidth="6" strokeLinecap="round"/>
    <g fill="#26383c" stroke="#a5b8b7" strokeWidth="2">
      <ellipse cx="74" cy="7" rx="34" ry="6"/><ellipse cx="286" cy="7" rx="34" ry="6"/>
      <ellipse cx="72" cy="72" rx="34" ry="6"/><ellipse cx="288" cy="72" rx="34" ry="6"/>
    </g>
    <path d={`M128 54 L${droneSegment.anchors.leftHand[0]} ${barY} M232 54 L${droneSegment.anchors.rightHand[0]} ${barY} M${droneSegment.anchors.leftHand[0]} ${barY} H${droneSegment.anchors.rightHand[0]}`} fill="none" stroke="#26383c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M132 58 Q180 72 228 58" fill="none" stroke="#ed9c43" strokeWidth="4"/>
  </g>;
}

function DroneFarmerScene({frame, showLabel}) {
  const time = frame / FPS;
  const keyframes = droneSegment.keyframes;
  const translateY = interpolate(time, keyframes.map((key) => key.at), keyframes.map((key) => key.translateY), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rotation = interpolate(time, keyframes.map((key) => key.at), keyframes.map((key) => key.rotation), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const [pivotX, pivotY] = droneSegment.anchors.groupPivot;
  return <Field kind="field" showLabel={showLabel}>
    <g transform={`translate(0 ${translateY}) rotate(${rotation} ${pivotX} ${pivotY})`}><Drone/><Farmer/></g>
  </Field>;
}

function Robot({finger = false, smile = false}) {
  return <g aria-label="연결된 어깨와 팔을 가진 자체 제작 SVG 휴머노이드 로봇">
    <path d="M118 187 L82 223 L52 266 M242 187 L278 225 L307 271" fill="none" stroke="#d9e4e2" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M118 187 L82 223 L52 266 M242 187 L278 225 L307 271" fill="none" stroke="#29383b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    {finger && <g aria-label="화면 왼쪽 어깨에서 손까지 연결된 들어 올린 검지 팔">
      <path d="M118 188 Q88 206 65 214 Q52 216 44 202" fill="none" stroke="#e9efed" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M118 188 Q88 206 65 214 Q52 216 44 202" fill="none" stroke="#29383b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M44 207 Q31 202 29 188 L31 149 Q32 137 40 137 Q49 138 48 151 L47 174 L53 159 Q57 151 63 155 Q68 160 64 169 L58 190 Q57 203 44 207Z" fill="#e9efed" stroke="#29383b" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="65" cy="214" r="10" fill="#c8d6d4" stroke="#29383b" strokeWidth="4"/>
    </g>}
    <path d="M120 174 Q180 158 240 174 L254 310 Q180 330 106 310Z" fill="#d8e5e2" stroke="#29383b" strokeWidth="5"/>
    <path d="M153 151 H207 V181 H153Z" fill="#c5d4d2" stroke="#29383b" strokeWidth="5"/>
    <rect x="105" y="25" width="150" height="135" rx="58" fill="#edf2f0" stroke="#293338" strokeWidth="5"/>
    <path d="M126 55 Q180 16 234 55" fill="none" stroke="#9bafad" strokeWidth="5"/>
    <circle cx="146" cy="98" r="12" fill="#293338"/><circle cx="214" cy="98" r="12" fill="#293338"/>
    <circle cx="143" cy="94" r="4" fill="#96e5df"/><circle cx="211" cy="94" r="4" fill="#96e5df"/>
    {smile ? <path d="M143 124 Q180 151 217 124" fill="none" stroke="#293338" strokeWidth="6" strokeLinecap="round"/> : <path d="M150 128 H210" fill="none" stroke="#293338" strokeWidth="5" strokeLinecap="round"/>}
    <path d="M133 310 L125 337 M227 310 L235 337" fill="none" stroke="#52686a" strokeWidth="17" strokeLinecap="round"/>
  </g>;
}

function Ladle() {
  return <g aria-label="왼쪽 바깥에서 들어와 머리 위에 닿는 자체 제작 SVG 금속 국자형 소품">
    <path d="M-42 16 L132 29" stroke="#59666b" strokeWidth="10" strokeLinecap="round"/>
    <path d="M-42 16 L132 29" stroke="#d9e0e2" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="173" cy="34" rx="43" ry="28" fill="#aab5b9" stroke="#4d5559" strokeWidth="5" transform="rotate(7 173 34)"/>
    <ellipse cx="173" cy="34" rx="31" ry="17" fill="#69777c" opacity=".78" transform="rotate(7 173 34)"/>
  </g>;
}

function RobotScene({frame, showLabel}) {
  const time = frame / FPS;
  const transitionAt = eventAt(robotSegment, 'brief-blur-and-body-bounce');
  const smileAt = eventAt(robotSegment, 'smile-visible');
  const fingerAt = eventAt(robotSegment, 'raised-index-finger-pose');
  const propAt = eventAt(robotSegment, 'metal-ladle-like-prop-enters-from-top');
  const glitchAt = eventAt(robotSegment, 'glitch-caption');
  const transitionDuration = robotSegment.events.find((event) => event.type === 'brief-blur-and-body-bounce')?.duration ?? 0.28;
  const propDuration = robotSegment.events.find((event) => event.type === 'metal-ladle-like-prop-enters-from-top')?.duration ?? 0.1;
  const transition = clamp((time - transitionAt) / transitionDuration);
  const blur = transition > 0 && transition < 1 ? (1 - Math.abs(transition - 0.5) * 2) * 3 : 0;
  const bounce = time >= transitionAt && time < fingerAt + 0.16 ? Math.sin((time - transitionAt) * Math.PI * 3) * 3 : 0;
  const propProgress = clamp((time - propAt) / propDuration);
  return <Field kind="robot" showLabel={showLabel}>
    <g transform={`translate(0 ${bounce})`} style={{filter: blur ? `blur(${blur}px)` : undefined}}><Robot finger={time >= fingerAt} smile={time >= smileAt}/></g>
    <g transform={`translate(${interpolate(propProgress, [0, 1], [-260, 0])} 0)`}><Ladle/></g>
    {time >= glitchAt && <g opacity=".92" aria-label="자체 제작 글리치 캡션">
      <path d="M28 275 H332 M52 291 H310 M35 307 H326" stroke="#ffec5c" strokeWidth="5"/>
      <text x="180" y="316" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="800" stroke="#1b2025" strokeWidth="4" paintOrder="stroke">GLITCH · 자체 텍스트</text>
      <path d="M48 282 H132 M210 300 H320" stroke="#55e5ff" strokeWidth="3"/><path d="M82 297 H204 M238 281 H305" stroke="#ff4c87" strokeWidth="3"/>
    </g>}
  </Field>;
}

export const ReconstructionStudy = ({showLabel = true}) => {
  const frame = useCurrentFrame();
  const style = {backgroundColor: '#050607', fontFamily: 'Arial, sans-serif'};
  if (frame < DRONE_FRAMES) return <AbsoluteFill style={style}><DroneFarmerScene frame={frame} showLabel={showLabel}/></AbsoluteFill>;
  return <AbsoluteFill style={style}><RobotScene frame={frame - ROBOT_START} showLabel={showLabel}/></AbsoluteFill>;
};
