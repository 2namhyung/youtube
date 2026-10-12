import React from 'react';
import {AbsoluteFill, Composition, interpolate, registerRoot, staticFile, useCurrentFrame} from 'remotion';

const families = [
  {id: 'hook-source-collage', compositionId: 'ReferenceParity-hook-source-collage', color: '#ef4444', target: 'headline-sheet', operator: 'translate.operator.1', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 120, top: 250, width: 1120, height: 360}, startX: 280, property: 'translate-x'},
  {id: 'assembly-editorial', compositionId: 'ReferenceParity-assembly-editorial', color: '#2563eb', target: 'chamber', operator: 'translate.operator.2', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 300, top: 360, width: 1320, height: 430}, startX: 280, property: 'translate-x'},
  {id: 'law-document-editorial', compositionId: 'ReferenceParity-law-document-editorial', color: '#16a34a', target: 'prosecutor-role', operator: 'translate.operator.3', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 100, top: 220, width: 620, height: 580}, startX: 280, property: 'translate-x'},
  {id: 'omni-fiction-continuity', compositionId: 'ReferenceParity-omni-fiction-continuity', color: '#ca8a04', target: 'still-1', operator: 'scale.operator.4', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 0, top: 0, width: 1920, height: 1080}, startX: 0, property: 'scale'},
  {id: 'process-route-editorial', compositionId: 'ReferenceParity-process-route-editorial', color: '#c026d3', target: 'request', operator: 'translate.operator.5', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 1080, top: 300, width: 620, height: 500}, startX: -280, property: 'translate-x'},
  {id: 'time-data-editorial', compositionId: 'ReferenceParity-time-data-editorial', color: '#0891b2', target: 'month', operator: 'translate.operator.6', inputSha256: 'bf605cb4f8d0234403ec2a4f1295e8913ffc810556b23e601ff6fd2f97bcc177', bbox: {left: 920, top: 300, width: 520, height: 430}, startX: 280, property: 'translate-x'},
] as const;

const ParityScene = ({index}: {index: number}) => {
  const frame = useCurrentFrame();
  const family = families[index];
  const translateX = interpolate(frame, [0, 14], [family.startX, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = family.property === 'scale' ? interpolate(frame, [0, 14], [0.8, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  return <AbsoluteFill style={{backgroundColor: '#f4ead7'}}>
    <div style={{position: 'absolute', inset: 48 + index * 7, border: `12px solid ${family.color}`, opacity: 0.18}} />
    <img
      src={staticFile('__test__/reference-parity-target.svg')}
      data-operator={family.operator}
      data-parity-target={family.target}
      data-parity-input-sha256={family.inputSha256}
      style={{
        position: 'absolute', ...family.bbox,
        transform: `translateX(${translateX}px) scale(${scale})`, transformOrigin: 'center center',
        objectFit: 'fill', borderRadius: index % 2 ? 72 : 24,
      }}
    />
  </AbsoluteFill>;
};

const Root = () => <>
  {families.map((family, index) => <Composition
    key={family.id}
    id={family.compositionId}
    component={ParityScene}
    defaultProps={{index}}
    durationInFrames={75}
    fps={30}
    width={1920}
    height={1080}
  />)}
</>;

registerRoot(Root);
