import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const ink = '#202A36';
const navy = '#34495E';
const coral = '#E36D5D';

const Phone = ({frame}) => {
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - 24, fps, config: {damping: 15, stiffness: 170}});
  const pulse = 1 + Math.sin(Math.max(0, frame - 43) * 0.28) * 0.025;
  return (
    <div style={{
      position: 'absolute', left: 700, top: 690, width: 230, height: 330,
      opacity: enter, transform: `scale(${enter * pulse}) rotate(${(1 - enter) * 8}deg)`,
      transformOrigin: '50% 60%',
    }}>
      <svg viewBox="0 0 230 330" width="230" height="330">
        <rect x="18" y="10" width="194" height="306" rx="34" fill="#F7F0E6" stroke={ink} strokeWidth="14"/>
        <rect x="37" y="55" width="156" height="205" rx="12" fill="#E9C78F" stroke={ink} strokeWidth="8"/>
        <line x1="83" y1="34" x2="148" y2="34" stroke={ink} strokeWidth="9" strokeLinecap="round"/>
        <circle cx="115" cy="286" r="12" fill={coral}/>
        <path d="M67 205 L100 169 L123 188 L161 135" fill="none" stroke={navy} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
};

export const MotionTest = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 16, stiffness: 120}});
  const characterX = interpolate(enter, [0, 1], [-180, 78]);
  const settle = Math.sin(Math.max(0, frame - 14) * 0.23);
  const characterY = 290 + settle * 4;
  const characterScale = 0.98 + settle * 0.004;
  const lineProgress = interpolate(frame, [34, 50], [0, 1], clamp);
  const labelOpacity = interpolate(frame, [46, 58], [0, 1], clamp);
  const eyebrow = interpolate(frame, [54, 66], [0, 1], clamp);

  return (
    <AbsoluteFill style={{
      backgroundColor: '#EFE7DA',
      backgroundImage: 'radial-gradient(circle at 20% 18%, rgba(255,255,255,.8), transparent 32%), repeating-linear-gradient(8deg, rgba(32,42,54,.025) 0 1px, transparent 1px 12px)',
      color: ink,
      fontFamily: 'Arial, sans-serif', overflow: 'hidden',
    }}>
      <div style={{position:'absolute', left:64, top:72, fontSize:28, letterSpacing:4, fontWeight:700, color:navy}}>
        LIMITED MOTION STUDY · 3 SEC
      </div>
      <div style={{position:'absolute', left:64, top:125, width:760, fontSize:64, lineHeight:1.12, fontWeight:900}}>
        캐릭터와 정보 레이어를<br/>한 장면에서 연결하기
      </div>

      <Img
        src={staticFile('character.png')}
        style={{
          position:'absolute', left:characterX, top:characterY, width:650, height:'auto',
          opacity:enter, transform:`scale(${characterScale}) rotate(${settle * 0.18}deg)`,
          transformOrigin:'50% 88%', filter:'drop-shadow(0 18px 3px rgba(32,42,54,.12))',
        }}
      />

      <svg width="1080" height="1920" style={{position:'absolute', inset:0}}>
        <path d="M 585 870 C 650 830, 664 820, 730 830" fill="none" stroke={coral} strokeWidth="12" strokeLinecap="round" strokeDasharray="240" strokeDashoffset={240 * (1-lineProgress)}/>
        <circle cx="585" cy="870" r={12 + eyebrow * 4} fill={coral} opacity={lineProgress}/>
      </svg>
      <Phone frame={frame}/>

      <div style={{
        position:'absolute', left:635, top:1070, width:340, opacity:labelOpacity,
        transform:`translateY(${(1-labelOpacity)*20}px)`, borderTop:`8px solid ${coral}`,
        paddingTop:20, fontSize:46, fontWeight:900, lineHeight:1.15,
      }}>
        휴대전화
        <div style={{fontSize:27, fontWeight:600, color:navy, marginTop:12}}>사건 핵심 물체</div>
      </div>

      <div style={{position:'absolute', left:70, right:70, bottom:112, display:'flex', justifyContent:'space-between', alignItems:'flex-end', borderTop:`2px solid rgba(32,42,54,.28)`, paddingTop:22}}>
        <div style={{fontSize:25, fontWeight:700}}>승인 캐릭터 alpha + 코드 SVG</div>
        <div style={{fontSize:22, color:navy}}>비공개 PoC · 관절 rig 미사용</div>
      </div>
    </AbsoluteFill>
  );
};
