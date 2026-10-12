import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const BASE = 'assets/style-calibration/episode-001-sh003-assembly-set-v01';
const src = (file: string) => staticFile(`${BASE}/${file}`);

type LayerProps = {
  file: string;
  start: number;
  end?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  fromX?: number;
  fromY?: number;
  fromScale?: number;
  toScale?: number;
  opacityEnd?: number;
  mirror?: boolean;
  zIndex: number;
  focal?: boolean;
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

function ChamberLayer({
  file,
  start,
  end = start + 28,
  left,
  top,
  width,
  height,
  fromX = 0,
  fromY = 0,
  fromScale = 0.86,
  toScale = 1,
  opacityEnd = 1,
  mirror = false,
  zIndex,
  focal = false,
}: LayerProps) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = Math.max(0, frame - start);
  const motion = spring({
    frame: local,
    fps,
    config: {damping: focal ? 17 : 19, mass: focal ? 0.75 : 0.9, stiffness: focal ? 105 : 130},
  });
  const reveal = clamp((frame - start) / Math.max(1, end - start));
  const settle = clamp(motion);
  const x = interpolate(settle, [0, 1], [fromX, 0]);
  const y = interpolate(settle, [0, 1], [fromY, 0]);
  const scale = interpolate(settle, [0, 1], [fromScale, toScale]);
  const opacity = interpolate(reveal, [0, 1], [0, opacityEnd]);
  const mirrorScale = mirror ? -1 : 1;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex,
        opacity,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale * mirrorScale}, ${scale})`,
        transformOrigin: 'center bottom',
        filter: 'drop-shadow(0 18px 22px rgba(50, 33, 20, 0.16))',
        willChange: 'transform, opacity',
      }}
    >
      <Img src={src(file)} style={{width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
    </div>
  );
}

/**
 * Inactive style calibration only. This composition intentionally has no
 * narration, labels, official Assembly pixels, or production manifest link.
 * It tests the independent 2.5D chamber layers and final focal treatment.
 */
export function AssemblySetCalibrationPlayback() {
  const frame = useCurrentFrame();
  const cameraScale = interpolate(frame, [0, 299], [0.98, 1.02], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cameraX = interpolate(frame, [0, 299], [0, -18], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cameraY = interpolate(frame, [0, 299], [0, -8], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: '#f4edde', overflow: 'hidden'}}>
      <Img src={src('background.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate3d(${cameraX}px, ${cameraY}px, 0) scale(${cameraScale})`,
          transformOrigin: 'center center',
        }}
      >
        <ChamberLayer file="assets/assembly-rear-wall-v01.png" start={15} left={160} top={65} width={1600} height={900} fromY={-90} fromScale={0.84} zIndex={10} />
        <ChamberLayer file="assets/assembly-seating-left-v02.png" start={31} left={45} top={340} width={920} height={620} fromX={-160} fromY={42} fromScale={0.72} toScale={0.82} zIndex={24} />
        <ChamberLayer file="assets/assembly-seating-left-v02.png" start={47} left={1025} top={350} width={850} height={590} fromX={165} fromY={35} fromScale={0.72} toScale={0.78} mirror zIndex={25} />
        <ChamberLayer file="assets/assembly-presiding-dais-v01.png" start={65} left={760} top={430} width={820} height={545} fromY={170} fromScale={0.78} toScale={0.88} zIndex={42} />
        <ChamberLayer file="assets/assembly-speaker-podium-v01.png" start={88} left={770} top={505} width={440} height={402} fromX={-120} fromY={95} fromScale={0.72} toScale={0.86} zIndex={58} />
        <ChamberLayer file="assets/assembly-speaker-token-generic-v01.png" start={105} left={880} top={360} width={260} height={390} fromY={145} fromScale={0.74} toScale={0.86} zIndex={54} />
        <ChamberLayer file="assets/assembly-rights-shield-v01.png" start={158} left={1320} top={260} width={350} height={380} fromX={120} fromY={70} fromScale={0.45} toScale={0.9} zIndex={72} focal />
      </div>
    </AbsoluteFill>
  );
}

export function AssemblySetCalibrationMobile() {
  return (
    <div style={{position: 'absolute', width: 1920, height: 1080, transform: 'scale(0.1875)', transformOrigin: 'top left'}}>
      <AssemblySetCalibrationPlayback />
    </div>
  );
}
