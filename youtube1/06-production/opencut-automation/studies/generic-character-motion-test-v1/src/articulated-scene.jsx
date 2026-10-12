import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'};
const lerp = (frame, input, output) => interpolate(frame, input, output, clamp);
const part = (name) => staticFile(`rig-tight/${name}.png`);

const Limb = ({side, upperAngle, lowerAngle, grasp, phone}) => {
  const upperW = side === 'right' ? 76 : 86;
  const upperH = 273;
  const lowerW = side === 'right' ? 82 : 75;
  const lowerH = side === 'right' ? 272 : 270;
  const handName = `${grasp ? 'hand-grasp' : 'hand-open'}-${side}`;
  const handW = side === 'right' ? 108 : 108;
  const handH = side === 'right' ? 177 : 178;
  const graspW = 89;
  const graspH = 152;
  return <div style={{position:'absolute', width:upperW, height:upperH, transform:`rotate(${upperAngle}deg)`, transformOrigin:'50% 5%'}}>
    <Img src={part(`upper-${side}`)} style={{position:'absolute', inset:0, width:upperW, height:upperH}}/>
    <div style={{position:'absolute', left:(upperW-lowerW)/2, top:upperH-22, width:lowerW, height:lowerH, transform:`rotate(${lowerAngle}deg)`, transformOrigin:'50% 5%'}}>
      <Img src={part(`lower-${side}`)} style={{position:'absolute', inset:0, width:lowerW, height:lowerH}}/>
      <div style={{position:'absolute', left:(lowerW-(grasp?graspW:handW))/2, top:lowerH-20, width:grasp?graspW:handW, height:grasp?graspH:handH, transform:'rotate(0deg)', transformOrigin:'50% 5%'}}>
        {phone && <Img src={part('phone-front')} style={{position:'absolute', left:18, top:38, width:75, height:129, transform:'rotate(-8deg)', zIndex:0}}/>}
        <Img src={part(handName)} style={{position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1}}/>
      </div>
    </div>
  </div>;
};

export const ArticulatedCharacterTest = () => {
  const frame = useCurrentFrame();
  const reach = lerp(frame, [12,42], [0,1]);
  const lift = lerp(frame, [50,70], [0,1]);
  const grasp = frame >= 45;
  const torsoAngle = 8 * reach * (1-lift);
  const torsoX = 12 * reach * (1-lift);
  const torsoY = 18 * reach * (1-lift);
  const rightUpper = lerp(reach, [0,1], [-2,-35]) + lerp(lift,[0,1],[0,20]);
  const rightLower = lerp(reach, [0,1], [1,-20]) + lerp(lift,[0,1],[0,-125]);
  const leftUpper = lerp(reach,[0,1],[3,18]) + lerp(lift,[0,1],[0,-18]);
  const leftLower = lerp(reach,[0,1],[0,12]) + lerp(lift,[0,1],[0,-12]);
  const headTurn = lerp(frame,[4,18],[0,7]) - lerp(lift,[0,1],[0,4]);
  const tablePhoneOpacity = lerp(frame,[43,47],[1,0]);
  const phase = frame < 12 ? '발견' : frame < 44 ? '팔을 뻗는 중' : frame < 51 ? '잡기' : '들어 올리기';

  return <AbsoluteFill style={{background:'#EEE5D7', color:'#202A36', fontFamily:'Arial, sans-serif', overflow:'hidden'}}>
    <div style={{position:'absolute', inset:0, backgroundImage:'radial-gradient(circle at 77% 18%,rgba(255,255,255,.85),transparent 34%),repeating-linear-gradient(7deg,rgba(32,42,54,.022) 0 1px,transparent 1px 13px)'}}/>
    <div style={{position:'absolute', left:62, top:62, fontSize:25, letterSpacing:4, fontWeight:800, color:'#34495E'}}>ARTICULATED CHARACTER · 3 SEC</div>
    <div style={{position:'absolute', left:62, top:110, fontSize:62, lineHeight:1.08, fontWeight:900}}>관절을 움직여<br/>휴대전화를 집는다</div>

    <div style={{position:'absolute', left:105, top:315, width:700, height:1120, transform:'scale(1.18)', transformOrigin:'0 0'}}>
      <div style={{position:'absolute', left:185, top:482, width:108, height:276}}><Img src={part('thigh-left')} style={{width:108,height:276}}/></div>
      <div style={{position:'absolute', left:295, top:482, width:110, height:276}}><Img src={part('thigh-right')} style={{width:110,height:276}}/></div>
      <div style={{position:'absolute', left:197, top:738, width:84, height:232}}><Img src={part('shin-left')} style={{width:84,height:232}}/></div>
      <div style={{position:'absolute', left:309, top:738, width:82, height:232}}><Img src={part('shin-right')} style={{width:82,height:232}}/></div>
      <div style={{position:'absolute', left:150, top:947, width:131, height:103}}><Img src={part('foot-left')} style={{width:131,height:103}}/></div>
      <div style={{position:'absolute', left:310, top:947, width:131, height:103}}><Img src={part('foot-right')} style={{width:131,height:103}}/></div>

      <div style={{position:'absolute', left:torsoX, top:torsoY, width:600, height:720, transform:`rotate(${torsoAngle}deg)`, transformOrigin:'295px 690px'}}>
        <div style={{position:'absolute', left:145, top:258, zIndex:1}}><Limb side="left" upperAngle={leftUpper} lowerAngle={leftLower} grasp={false} phone={false}/></div>
        <div style={{position:'absolute', left:360, top:258, zIndex:1}}><Limb side="right" upperAngle={rightUpper} lowerAngle={rightLower} grasp={grasp} phone={grasp}/></div>
        <Img src={part('torso')} style={{position:'absolute', left:185, top:225, width:220, height:300, zIndex:2}}/>
        <div style={{position:'absolute', left:196, top:0, width:199, height:246, transform:`rotate(${headTurn - torsoAngle * .55}deg)`, transformOrigin:'50% 94%', zIndex:3}}>
          <Img src={part('head')} style={{width:199,height:246}}/>
        </div>
      </div>
    </div>

    <div style={{position:'absolute', left:748, top:1170, width:245, height:38, borderRadius:8, background:'#A87442', border:'7px solid #202A36'}}/>
    <div style={{position:'absolute', left:790, top:1202, width:25, height:230, background:'#A87442', border:'6px solid #202A36'}}/>
    <div style={{position:'absolute', left:930, top:1202, width:25, height:230, background:'#A87442', border:'6px solid #202A36'}}/>
    <Img src={part('phone-front')} style={{position:'absolute', left:820, top:1084, width:75, height:129, transform:'rotate(88deg)', opacity:tablePhoneOpacity}}/>

    <div style={{position:'absolute', left:70, bottom:100, fontSize:38, fontWeight:900}}>{phase}</div>
    <div style={{position:'absolute', right:70, bottom:104, fontSize:22, color:'#34495E'}}>어깨·팔꿈치 연속 보간 · 비공개 PoC</div>
  </AbsoluteFill>;
};
