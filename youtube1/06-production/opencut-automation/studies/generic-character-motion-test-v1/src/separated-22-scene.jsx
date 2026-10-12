import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';

const FRAME_COUNT = 22;
const DURATION = 72;

export const Separated22CharacterTest = () => {
  const frame = useCurrentFrame();
  const drawing = Math.min(FRAME_COUNT - 1, Math.floor(frame * FRAME_COUNT / DURATION));
  const name = `separated-22-v1/frames/frame-${String(drawing + 1).padStart(2, '0')}.png`;

  return <AbsoluteFill style={{backgroundColor: '#e9e3da', overflow: 'hidden'}}>
    <div style={{
      position: 'absolute',
      left: 110,
      right: 110,
      bottom: 185,
      height: 34,
      borderRadius: '50%',
      background: 'rgba(55, 45, 36, 0.12)',
      filter: 'blur(14px)',
    }}/>
    <Img
      src={staticFile(name)}
      style={{
        position: 'absolute',
        left: 0,
        top: 205,
        width: 1080,
        height: 1600,
        objectFit: 'contain',
      }}
    />
    <div style={{
      position: 'absolute',
      left: 54,
      top: 54,
      color: '#27231f',
      fontFamily: 'Arial, sans-serif',
      fontSize: 27,
      fontWeight: 700,
      letterSpacing: 2.5,
    }}>
      IMAGEGEN 22 · SEPARATED HEAD / BODY
    </div>
  </AbsoluteFill>;
};
