import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CameraMotionBlur} from '@remotion/motion-blur';
import {Video} from '@remotion/media';
import {interpolatePath} from '@remotion/paths';

/** Deterministic SVG path morph used for non-boxed visual accents. */
export function MorphPath({from, to, progress, color, width = 4, viewBox = '0 0 100 100'}: {from: string; to: string; progress: number; color: string; width?: number; viewBox?: string}) {
  const d = interpolatePath(Math.max(0, Math.min(1, progress)), from, to);
  return <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" /></svg>;
}

/** 2.5D camera board: shallow perspective and depth movement keep a still cut alive. */
export function CameraBoard({children, sceneIndex, durationInFrames}: {children: React.ReactNode; sceneIndex: number; durationInFrames: number}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 90, mass: 0.8}});
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const zoom = interpolate(progress, [0, 1], [1.035, 1]);
  const drift = interpolate(progress, [0, 1], [18, -8]);
  const rotateY = interpolate(progress, [0, 1], [0.8, -0.8]);
  const depth = interpolate(progress, [0, 1], [0, -12]);
  return <AbsoluteFill style={{perspective: 1600, opacity: enter}}>
    <AbsoluteFill style={{pointerEvents: 'none', transform: `translate3d(${depth}px, 0, -80px) scale(1.03)`, opacity: 0.14}}><div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${62 + sceneIndex * 4}% 30%, rgba(110,231,183,.28), transparent 28%)`}} /></AbsoluteFill>
    <AbsoluteFill style={{transform: `translate3d(${drift}px, 0, 0) rotateY(${rotateY}deg) scale(${zoom})`, transformStyle: 'preserve-3d'}}>{children}</AbsoluteFill>
  </AbsoluteFill>;
}

/** Full-bleed still with a slow push-in and image-to-image match-mask at scene boundaries. */
export function KeyframePlate({src, previousSrc, alt = 'AI 재구성 장면'}: {src: string; previousSrc?: string; alt?: string}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [0, 5 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = interpolate(progress, [0, 1], [1.015, 1.075]);
  const x = interpolate(progress, [0, 1], [0, -18]);
  const transitionProgress = previousSrc ? interpolate(frame, [0, 22], [0.08, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  return <AbsoluteFill style={{zIndex: 0, overflow: 'hidden', pointerEvents: 'none'}}>
    {previousSrc && <Img src={previousSrc} alt="이전 AI 재구성 장면" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate3d(${x * 0.5}px, 0, 0) scale(${scale * 0.985})`, filter: 'brightness(.82)'}} />}
    <Img src={src} alt={alt} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate3d(${x}px, 0, 0) scale(${scale})`, transformOrigin: 'center center', clipPath: previousSrc ? `inset(0% ${100 - transitionProgress * 100}% 0% 0%)` : undefined}} />
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,17,31,.88) 0%, rgba(7,17,31,.64) 35%, rgba(7,17,31,.20) 68%, rgba(7,17,31,.40) 100%), linear-gradient(0deg, rgba(7,17,31,.62), transparent 35%, rgba(7,17,31,.18))'}} />
  </AbsoluteFill>;
}

/** Non-boxed path accent that morphs with the scene rhythm. */
export function PathAccent({accent, side = 'right'}: {accent: string; side?: 'left' | 'right'}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [8, 42], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <div style={{position: 'absolute', top: '46%', [side]: 96, width: 360, height: 82, opacity: 0.72}}><MorphPath from="M 0 50 C 30 10 72 90 108 50 S 178 10 214 50 S 286 90 360 38" to="M 0 50 C 44 50 76 50 112 50 S 188 50 232 50 S 308 50 360 50" progress={progress} color={accent} width={3} /></div>;
}

/** A connector with real motion blur, without a surrounding box. */
export function BlurredConnector({accent, progress}: {accent: string; progress: number}) {
  return <CameraMotionBlur shutterAngle={180} samples={6}><div style={{width: 120, height: 12, opacity: progress}}><MorphPath from="M 0 50 C 24 50 76 50 100 50" to="M 0 50 C 24 6 76 94 100 50" progress={progress} color={accent} width={7} /></div></CameraMotionBlur>;
}

export function SourceFooter({text}: {text: string}) {
  return <div style={{position: 'absolute', left: 86, bottom: 32, fontSize: 16, color: '#D2D9E3', letterSpacing: 0.3, textShadow: '0 2px 12px rgba(0,0,0,.9)'}}><span style={{color: '#6EE7B7', fontWeight: 800}}>출처</span> {text}</div>;
}

export function AIReconstructionLabel({text = 'AI 재구성'}: {text?: string}) {
  return <div style={{position: 'absolute', right: 86, bottom: 34, fontSize: 13, color: '#D6B85A', letterSpacing: 0.7, textShadow: '0 2px 10px rgba(0,0,0,.9)'}}>{text}</div>;
}

/** Video plate for an official clip or a generated image-to-video result. */
export function VideoPlate({src, opacity = 1, objectFit = 'cover'}: {src: string; opacity?: number; objectFit?: 'cover' | 'contain' | 'fill'}) {
  return <Video src={src} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit, opacity}} />;
}
