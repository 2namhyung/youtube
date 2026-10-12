import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const poses = [
  {start:0, end:15, index:0, label:'발견'},
  {start:12, end:31, index:1, label:'손을 뻗음'},
  {start:28, end:49, index:2, label:'집어 듦'},
  {start:46, end:72, index:3, label:'확인'},
];

const Pose = ({pose, frame}) => {
  const fadeIn = interpolate(frame, [pose.start, pose.start + 3], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const fadeOut = pose.end === 72 ? 1 : interpolate(frame, [pose.end - 3, pose.end], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const opacity = Math.min(fadeIn, fadeOut);
  const local = Math.max(0, frame - pose.start);
  const settle = Math.sin(Math.min(local, 8) / 8 * Math.PI) * 0.018;
  return <div style={{
    position:'absolute', left:92, top:330, width:896, height:1260, overflow:'hidden',
    opacity, transform:`translateY(${-settle * 45}px) scale(${1 + settle})`, transformOrigin:'50% 90%',
  }}>
    <Img src={staticFile('phone-pickup-keyposes-alpha.png')} style={{
      position:'absolute', width:3584, height:'auto', maxWidth:'none',
      left:-896 * pose.index, top:0,
    }}/>
  </div>;
};

export const CharacterActionTest = () => {
  const frame = useCurrentFrame();
  const active = poses.findLast((p) => frame >= p.start)?.label ?? poses[0].label;
  const progress = interpolate(frame, [0,71], [0,1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:'#EEE5D7', color:'#202A36', fontFamily:'Arial, sans-serif', overflow:'hidden'}}>
    <div style={{position:'absolute', inset:0, backgroundImage:'radial-gradient(circle at 78% 18%,rgba(255,255,255,.9),transparent 34%),repeating-linear-gradient(6deg,rgba(32,42,54,.022) 0 1px,transparent 1px 13px)'}}/>
    <div style={{position:'absolute', left:62, top:64, fontSize:26, letterSpacing:4, fontWeight:800, color:'#34495E'}}>CHARACTER ACTION STUDY · 3 SEC</div>
    <div style={{position:'absolute', left:62, top:112, fontSize:64, lineHeight:1.08, fontWeight:900}}>휴대전화를 발견하고<br/>집어 드는 행동</div>
    {poses.map((pose) => <Pose key={pose.index} pose={pose} frame={frame}/>)}
    <div style={{position:'absolute', left:70, right:70, bottom:158, height:10, borderRadius:10, background:'rgba(32,42,54,.14)'}}>
      <div style={{height:'100%', width:`${progress*100}%`, borderRadius:10, background:'#E36D5D'}}/>
    </div>
    <div style={{position:'absolute', left:70, bottom:90, fontSize:38, fontWeight:900}}>{active}</div>
    <div style={{position:'absolute', right:70, bottom:94, fontSize:23, color:'#34495E'}}>키포즈 교체 방식 · 비공개 PoC</div>
  </AbsoluteFill>;
};
