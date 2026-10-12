import React from 'react';
import {AbsoluteFill, Img} from 'remotion';

export const SAFE_AREA = {left: 86, right: 86, top: 58, bottom: 52} as const;

export function PaperBackground({src}: {src: string}) {
  return <AbsoluteFill style={{backgroundColor: '#f2ead8'}}><Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} /></AbsoluteFill>;
}

export function CollageBoard({children, camera = {x: 0, y: 0, scale: 1, rotate: 0}}: {children: React.ReactNode; camera?: {x: number; y: number; scale: number; rotate: number}}) {
  return <AbsoluteFill style={{overflow: 'hidden', perspective: 1800}}>
    <AbsoluteFill style={{transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale}) rotate(${camera.rotate}deg)`, transformOrigin: 'center', transformStyle: 'preserve-3d'}}>{children}</AbsoluteFill>
  </AbsoluteFill>;
}

export function Layer({children, zIndex, style}: {children: React.ReactNode; zIndex: number; style?: React.CSSProperties}) {
  return <div style={{position: 'absolute', zIndex, transformStyle: 'preserve-3d', ...style}}>{children}</div>;
}

export function Cutout({src, alt, style}: {src: string; alt: string; style?: React.CSSProperties}) {
  return <Img src={src} alt={alt} style={{width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 18px 18px rgba(58,42,24,.2))', ...style}} />;
}

export function SourcePhoto({src, alt, fit = 'cover'}: {src: string; alt: string; fit?: 'cover' | 'contain'}) {
  return <div style={{width: '100%', height: '100%', padding: 13, background: '#fffdf7', boxShadow: '0 20px 38px rgba(58,42,24,.2)', transform: 'rotate(-0.45deg)'}}>
    <Img src={src} alt={alt} style={{width: '100%', height: '100%', objectFit: fit}} />
  </div>;
}

export function DocumentPlate({src, alt}: {src: string; alt: string}) {
  return <div style={{width: '100%', height: '100%', padding: 18, background: '#fffef9', border: '1px solid rgba(87,69,45,.22)', boxShadow: '0 18px 42px rgba(58,42,24,.18)'}}>
    <Img src={src} alt={alt} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
  </div>;
}

export function HalftoneWash({opacity = 0.08}: {opacity?: number}) {
  return <AbsoluteFill aria-hidden="true" style={{opacity, pointerEvents: 'none', backgroundImage: 'radial-gradient(#362d24 0.75px, transparent 0.75px)', backgroundSize: '7px 7px', mixBlendMode: 'multiply'}} />;
}

