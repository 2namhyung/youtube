import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const poses = [
  {w:152,h:479,label:'발견'}, {w:152,h:479,label:'시선 이동'},
  {w:202,h:482,label:'체중 이동'}, {w:273,h:423,label:'손을 뻗기 시작'},
  {w:288,h:385,label:'몸을 숙임'}, {w:278,h:342,label:'잡기'},
  {w:221,h:442,label:'일어남'}, {w:173,h:456,label:'확인', scale:479/456},
];
const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'};

const Pose = ({index, frame, opacity}) => {
  const pose = poses[index];
  const scale = 2.15 * (pose.scale ?? 1);
  const anticipation = index === 3 || index === 4 ? interpolate(frame,[27,44],[0,16],clamp) : 0;
  return <Img src={staticFile(`keyposes-v2/pose-${String(index+1).padStart(2,'0')}.png`)} style={{
    position:'absolute', left:430 - pose.w*scale/2 + anticipation, bottom:330,
    width:pose.w*scale, height:pose.h*scale, opacity,
    transformOrigin:'50% 100%', filter:'drop-shadow(0 12px 2px rgba(32,42,54,.10))',
  }}/>;
};

export const DrawnCharacterActionTest = () => {
  const frame = useCurrentFrame();
  const active = Math.min(7, Math.floor(frame/9));
  const within = frame % 9;
  const fade = active === 0 ? 1 : interpolate(within,[0,2],[0,1],clamp);
  const phoneOpacity = interpolate(frame,[43,46],[1,0],clamp);
  return <AbsoluteFill style={{background:'#EEE5D7', color:'#202A36', fontFamily:'Arial, sans-serif', overflow:'hidden'}}>
    <div style={{position:'absolute', inset:0, backgroundImage:'radial-gradient(circle at 78% 18%,rgba(255,255,255,.88),transparent 34%),repeating-linear-gradient(7deg,rgba(32,42,54,.02) 0 1px,transparent 1px 13px)'}}/>
    <div style={{position:'absolute',left:62,top:62,fontSize:25,letterSpacing:4,fontWeight:800,color:'#34495E'}}>DRAWN LIMITED ANIMATION · 3 SEC</div>
    <div style={{position:'absolute',left:62,top:110,fontSize:62,lineHeight:1.08,fontWeight:900}}>비율을 유지한 채<br/>휴대전화를 집는다</div>

    {active > 0 && fade < 1 && <Pose index={active-1} frame={frame} opacity={1-fade}/>} 
    <Pose index={active} frame={frame} opacity={fade}/>

    <div style={{position:'absolute',left:760,top:1178,width:245,height:38,borderRadius:8,background:'#A87442',border:'7px solid #202A36'}}/>
    <div style={{position:'absolute',left:802,top:1212,width:25,height:235,background:'#A87442',border:'6px solid #202A36'}}/>
    <div style={{position:'absolute',left:942,top:1212,width:25,height:235,background:'#A87442',border:'6px solid #202A36'}}/>
    <Img src={staticFile('rig-tight/phone-front.png')} style={{position:'absolute',left:830,top:1095,width:75,height:129,transform:'rotate(88deg)',opacity:phoneOpacity}}/>

    <div style={{position:'absolute',left:70,bottom:100,fontSize:38,fontWeight:900}}>{poses[active].label}</div>
    <div style={{position:'absolute',right:70,bottom:104,fontSize:22,color:'#34495E'}}>8개 드로잉 · 8fps 제한 애니메이션 · 비공개 PoC</div>
  </AbsoluteFill>;
};
