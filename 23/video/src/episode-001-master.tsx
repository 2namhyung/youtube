import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile} from 'remotion';
import narrationPlan from '../episodes/episode-001/narration-plan.json';

const FPS = 30;
const BEIGE = '#e8d9c3';
const INK = '#18222c';
const RED = '#c84d3f';
const BLUE = '#2e5d7c';
const GOLD = '#b78a3b';

type Cut = typeof narrationPlan.cuts[number];
const cuts = narrationPlan.cuts as Cut[];
const compactChars = (text: string) => text.replace(/\s/g, '').length;
const durations = cuts.map((cut) => Math.max(1,
  Math.ceil(compactChars(cut.draft_narration) / narrationPlan.draft_timing_assumption.compact_korean_chars_per_second * FPS)
    + cut.pre_roll_frames + cut.post_hold_frames - cut.transition_overlap_frames));
export const EPISODE_001_MASTER_FRAMES = durations.reduce((sum, value) => sum + value, 0);

// Root-invoked Remotion renders use the repository public/ directory. The
// scaffold mirrors only render inputs into public/video/assets while keeping
// the canonical, validated assets in video/public/assets.
const asset = (p: string) => staticFile(`video/assets/episode-001-v03/${p}`);
const official = (name: string) => asset(`official/${name}`);
const story = (shotId: string) => asset(`cuts/${shotId}/assets/start.png`);

function Background() {
  return <AbsoluteFill style={{background: '#f9f7f2'}}><Img src={staticFile('video/assets/shared/paper-beige-check.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} /></AbsoluteFill>;
}

function TinyLabel({children, color = INK}: {children: React.ReactNode; color?: string}) {
  return <div style={{position: 'absolute', top: 52, left: 82, zIndex: 20, fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: 1, color}}>{children}</div>;
}

function Source({children}: {children: React.ReactNode}) {
  return <div style={{position: 'absolute', bottom: 34, left: 82, fontFamily: 'Arial, sans-serif', fontSize: 16, color: '#5e665f', letterSpacing: .4}}>{children}</div>;
}

function Paper({src, x, y, width, rotate = 0, opacity = 1}: {src?: string; x: number; y: number; width: number; rotate?: number; opacity?: number}) {
  return <div style={{position: 'absolute', left: x, top: y, width, padding: 15, background: '#fffdf8', boxShadow: '0 14px 35px rgba(58,46,30,.18)', transform: `rotate(${rotate}deg)`, opacity}}>
    {src ? <Img src={src} style={{display: 'block', width: '100%', height: width * .66, objectFit: 'cover'}} /> : <div style={{height: width * .66, background: `linear-gradient(135deg, ${BEIGE}, #fffdf8)`}} />}
  </div>;
}

function Person({x, y, color = BLUE}: {x: number; y: number; color?: string}) {
  return <div style={{position: 'absolute', left: x, top: y, width: 190, height: 330}}>
    <div style={{position: 'absolute', left: 48, top: 0, width: 94, height: 94, borderRadius: '50%', background: '#d3a47b'}} />
    <div style={{position: 'absolute', left: 17, top: 85, width: 156, height: 220, borderRadius: '80px 80px 20px 20px', background: color}} />
    <div style={{position: 'absolute', left: 60, top: 298, width: 30, height: 32, background: INK, transform: 'rotate(9deg)'}} />
    <div style={{position: 'absolute', left: 104, top: 298, width: 30, height: 32, background: INK, transform: 'rotate(-9deg)'}} />
  </div>;
}

function Dot({x, y, color = BLUE, size = 26}: {x: number; y: number; color?: string; size?: number}) {
  return <div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 0 8px ${color}22`}} />;
}

function Line({x1, y1, x2, y2, color = BLUE, width = 7, dashed = false}: {x1: number; y1: number; x2: number; y2: number; color?: string; width?: number; dashed?: boolean}) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return <div style={{position: 'absolute', left: x1, top: y1, width: length, height: width, transformOrigin: '0 50%', transform: `rotate(${angle}deg)`, background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 18px, transparent 18px 32px)` : color, borderRadius: width}} />;
}

function Evidence({x = 1160, y = 240, scale = 1}: {x?: number; y?: number; scale?: number}) {
  return <div style={{position: 'absolute', left: x, top: y, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
    <div style={{width: 210, height: 136, background: '#fffdf8', border: `5px solid ${INK}`, borderRadius: 8, boxShadow: '10px 12px 0 rgba(24,34,44,.15)'}} />
    <div style={{position: 'absolute', left: 35, top: 28, width: 140, height: 14, background: GOLD}} />
    <div style={{position: 'absolute', left: 35, top: 57, width: 112, height: 10, background: '#a4adb0'}} />
    <div style={{position: 'absolute', left: 35, top: 80, width: 135, height: 10, background: '#a4adb0'}} />
    <div style={{position: 'absolute', left: 35, top: 103, width: 74, height: 10, background: '#a4adb0'}} />
  </div>;
}

function Calendar({x = 1080, y = 210, extend = false}: {x?: number; y?: number; extend?: boolean}) {
  return <div style={{position: 'absolute', left: x, top: y, width: 300, height: 260, background: '#fffdf8', border: `5px solid ${INK}`, boxShadow: '12px 12px 0 rgba(24,34,44,.14)'}}>
    <div style={{height: 58, background: RED}} />
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, padding: 22}}>{Array.from({length: extend ? 20 : 15}, (_, i) => <div key={i} style={{height: 22, background: i === 14 || (extend && i === 19) ? GOLD : '#bcc5c5'}} />)}</div>
  </div>;
}

function StoryPlate({shotId, action}: {shotId: string; action: 'payment' | 'delivery' | 'open' | 'wrong' | 'contact' | 'blocked' | 'police'}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({frame, fps, config: {damping: 20, stiffness: 90}});
  const src = story(shotId);
  return <AbsoluteFill style={{opacity: reveal, transform: `scale(${interpolate(reveal, [0, 1], [.96, 1])})`}}>
    <Img src={src} style={{position: 'absolute', left: 250, top: 105, width: 1420, height: 790, objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(50,40,25,.2))'}} />
    <TinyLabel color={action === 'blocked' ? RED : BLUE}>{action === 'payment' ? '송금' : action === 'delivery' ? '도착' : action === 'open' ? '개봉' : action === 'wrong' ? '다른 물건' : action === 'contact' ? '연락' : action === 'blocked' ? '차단' : '신고'}</TinyLabel>
  </AbsoluteFill>;
}

function Board({index, cut}: {index: number; cut: Cut}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 19, stiffness: 78, mass: .8}});
  const p = interpolate(frame, [0, Math.max(1, 2 * fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const drift = interpolate(p, [0, 1], [22, -8]);
  const storyActions: Record<number, 'payment' | 'delivery' | 'open' | 'wrong' | 'contact' | 'blocked' | 'police'> = {7: 'payment', 8: 'delivery', 9: 'open', 10: 'wrong', 11: 'contact', 12: 'blocked', 13: 'police'};
  if (storyActions[index]) return <StoryPlate shotId={cut.shot_id} action={storyActions[index]} />;

  const source = index === 0 ? official('law-revision-21857-full.png') : index === 5 ? official('law-revision-21857-full.png') : index === 14 || index === 31 ? official('bill-2220257-full.png') : index === 19 || index === 24 || index === 36 ? official('law-197-2-requirement-deadline.png') : index === 37 ? official('law-revision-21857-full.png') : index === 1 ? official('petition-2200332-minutes.png') : official('law-196-delete.png');
  const sourceLabel = index === 0 ? '공식 개정문' : index === 19 || index === 24 || index === 36 ? '형사소송법 제197조의2' : index === 37 ? '시행일 규정' : '국회·법령 원문';
  const showDoc = [0, 1, 2, 5, 14, 19, 24, 31, 36, 37].includes(index);
  const final = index >= 40;
  return <AbsoluteFill style={{opacity: entrance, transform: `translate3d(${drift}px,0,0)`}}>
    {showDoc && <Paper src={source} x={index % 2 ? 1030 : 1160} y={180} width={580} rotate={index % 2 ? 2 : -2} />}
    {index === 0 && <><Paper src={official('bill-2220257-full.png')} x={300} y={280} width={490} rotate={-6} /><Paper src={official('petition-2200332-minutes.png')} x={620} y={410} width={490} rotate={5} /><TinyLabel color={RED}>말이 많다</TinyLabel></>}
    {index === 1 && <><Person x={320} y={405} /><Line x1={540} y1={550} x2={950} y2={365} color={GOLD} /><Dot x={950} y={365} color={RED} /><Dot x={950} y={550} color={BLUE} /><TinyLabel>반복되는 출처</TinyLabel></>}
    {index === 2 && <><Person x={300} y={380} color={RED} /><Person x={1450} y={380} color={BLUE} /><Line x1={510} y1={560} x2={1400} y2={560} color={RED} dashed /><Paper src={official('bill-2220257-full.png')} x={740} y={280} width={430} rotate={-2} /><TinyLabel color={RED}>문맥이 다르다</TinyLabel></>}
    {index === 3 && <><Evidence x={370} y={420} /><Line x1={580} y1={485} x2={960} y2={330} color={BLUE} /><Line x1={580} y1={535} x2={960} y2={680} color={RED} /><Dot x={1040} y={330} color={BLUE} /><Dot x={1040} y={680} color={RED} /><TinyLabel>두 갈래</TinyLabel></>}
    {index === 4 && <><Line x1={330} y1={590} x2={690} y2={590} color={BLUE} /><Line x1={690} y1={590} x2={1040} y2={360} color={GOLD} /><Line x1={690} y1={590} x2={1040} y2={820} color={RED} /><Dot x={330} y={590} /><Dot x={690} y={590} color={GOLD} /><Dot x={1040} y={360} color={BLUE} /><Dot x={1040} y={820} color={RED} /><TinyLabel>절차를 펼쳐보기</TinyLabel></>}
    {index === 6 && <><Person x={360} y={420} color={BLUE} /><Evidence x={760} y={460} /><Line x1={560} y1={570} x2={760} y2={570} color={GOLD} /><div style={{position: 'absolute', left: 1180, top: 470, width: 280, height: 180, border: `5px solid ${INK}`, background: '#fffdf8', transform: 'rotate(-5deg)'}} /><TinyLabel>사건 하나</TinyLabel></>}
    {index === 13 && <><Evidence x={350} y={430} /><Person x={1450} y={390} color={BLUE} /><Line x1={570} y1={515} x2={1400} y2={520} color={GOLD} /><TinyLabel>기록을 접수</TinyLabel></>}
    {index === 14 && <><Evidence x={350} y={430} /><Line x1={570} y1={510} x2={980} y2={510} color={GOLD} /><Paper src={source} x={1100} y={250} width={520} rotate={-2} /><TinyLabel>기록이 모인다</TinyLabel></>}
    {index >= 15 && index <= 18 && <><Person x={330} y={390} color={BLUE} /><Evidence x={1120} y={420} /><Line x1={540} y1={530} x2={1120} y2={530} color={GOLD} /><Dot x={820} y={530} color={GOLD} /><TinyLabel color={index === 16 ? RED : BLUE}>{index === 16 ? '직접 경로 닫힘' : index === 17 ? '구체적으로 요구' : '확인 항목 지정'}</TinyLabel></>}
    {index >= 19 && index <= 27 && <><Evidence x={300} y={470} /><Calendar x={1120} y={230} extend={index >= 25} /><Line x1={530} y1={540} x2={1120} y2={540} color={index === 22 ? BLUE : GOLD} /><TinyLabel color={index === 22 ? BLUE : GOLD}>{index === 22 ? '시스템 기록' : index >= 25 ? '연장 범위' : '한 달 기준'}</TinyLabel></>}
    {index >= 28 && index <= 34 && <><Person x={300} y={400} color={index >= 31 ? RED : BLUE} /><Person x={1440} y={400} color={GOLD} /><Line x1={530} y1={535} x2={1420} y2={535} color={index === 28 ? RED : BLUE} dashed={index === 28} /><Evidence x={800} y={400} /><TinyLabel>{index === 31 ? '별도 절차' : index >= 32 ? '재수사 경로' : '다른 수사기관'}</TinyLabel></>}
    {index >= 35 && index <= 39 && <><Paper src={source} x={290} y={250} width={650} rotate={-2} /><Calendar x={1240} y={250} extend={index === 39} /><Line x1={980} y1={520} x2={1230} y2={520} color={index === 39 ? RED : GOLD} /><TinyLabel color={index === 38 || index === 39 ? RED : BLUE}>{index === 38 ? '2026.10.02' : index === 39 ? '최대 90일' : '증거 사용 제한'}</TinyLabel></>}
    {final && <><Person x={260} y={410} color={BLUE} /><Evidence x={740} y={440} /><Person x={1470} y={410} color={GOLD} /><Line x1={470} y1={550} x2={740} y2={550} color={RED} dashed={index === 42} /><Line x1={950} y1={550} x2={1460} y2={550} color={BLUE} /><Dot x={1160} y={550} color={BLUE} /><TinyLabel color={index === 46 ? RED : BLUE}>{index === 46 ? '직접 경로는 사라짐' : '보완수사요구는 남음'}</TinyLabel></>}
    <Source>{sourceLabel} · 시각 애니메틱</Source>
  </AbsoluteFill>;
}

function CutScene({index, cut}: {index: number; cut: Cut}) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 15, Math.max(16, durations[index] - 18), durations[index]], [0, 1, 1, .96], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: fade}}><Background /><Board index={index} cut={cut} /></AbsoluteFill>;
}

export function Episode001Master() {
  let from = 0;
  return <AbsoluteFill>{cuts.map((cut, index) => {
    const start = from;
    from += durations[index];
    return <Sequence key={cut.shot_id} from={start} durationInFrames={durations[index]} premountFor={15}><CutScene index={index} cut={cut} /></Sequence>;
  })}</AbsoluteFill>;
}
