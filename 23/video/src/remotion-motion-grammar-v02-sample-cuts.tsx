import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

export type SampleId =
  | 'sample-01-shared-background-accumulation' | 'sample-02-numeric-step-progression' | 'sample-03-chart-reveal'
  | 'sample-04-map-route-reframe' | 'sample-05-object-preserving-layout-reframe' | 'sample-06-directional-exit-hard-cut-pair'
  | 'sample-07-hook-reel-collage-montage' | 'sample-08-speaker-supporting-overlay-entry' | 'sample-09-device-light-focal-motion'
  | 'sample-10-narrative-scale-translation';

const base = 'assets/style-calibration/remotion-motion-grammar-v02-sample-cuts/assets';
const file = (name: string) => staticFile(`${base}/${name}`);
const progress = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
const bg = <Img src={file('paper-beige-check.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
const common: React.CSSProperties = {backgroundColor: '#f2ead8', overflow: 'hidden', fontFamily: 'Arial, sans-serif', color: '#302a24'};
const photo = (name: string, id: string, style: React.CSSProperties) => <Img src={file(name)} data-parity-target={id} style={{position: 'absolute', display: 'block', objectFit: 'cover', ...style}} />;
const surface = (name: string, id: string, style: React.CSSProperties) => <Img src={file(name)} data-parity-target={id} style={{position: 'absolute', display: 'block', objectFit: 'contain', ...style}} />;
const chrome = (text: string) => <div data-text-role="screen-chrome" style={{position: 'absolute', left: 88, top: 52, fontSize: 24, fontWeight: 900, letterSpacing: 1.1, color: '#40372f'}}>{text}</div>;
const rail = (text: string) => <div data-text-role="screen-chrome" style={{position: 'absolute', right: 78, bottom: 38, fontSize: 17, fontWeight: 700, color: '#645b51'}}>{text}</div>;
const label = (text: string, left: number, top: number, width: number) => <div data-text-role="asset-label" style={{position: 'absolute', left, top, width, textAlign: 'center', fontSize: 22, fontWeight: 800, color: '#40372f'}}>{text}</div>;
const frameStyle: React.CSSProperties = {border: '8px solid #fffdf7', boxShadow: '0 18px 45px rgba(42,35,28,.22)'};
const cpiSourceStates = ['s02-cpi-299-170', 's02-cpi-305-109', 's02-cpi-306-746'];
const earthDiameterPx = 620;
const moonDiameterPx = earthDiameterPx * (3475 / 12742);

export function RemotionMotionGrammarV02SampleCuts({sampleId}: {sampleId: SampleId}) {
  const frame = useCurrentFrame();

  if (sampleId === 'sample-01-shared-background-accumulation') {
    const a = progress(frame, 20, 64), b = progress(frame, 66, 116), c = progress(frame, 118, 174);
    return <AbsoluteFill style={common}>{bg}{chrome('APOLLO 11 · THREE SOURCE MOMENTS')}
      {photo('s01-apollo-launch.jpg', 's01-apollo-launch', {left: 570, top: 130, width: 780, height: 430, ...frameStyle, opacity: a, transform: `translateY(${(1-a)*-180}px)`})}
      {photo('s01-apollo-crew.jpg', 's01-apollo-crew', {left: 145, top: 600, width: 620, height: 330, ...frameStyle, opacity: b, transform: `translateX(${(1-b)*-210}px)`})}
      {photo('s01-apollo-moon.jpg', 's01-apollo-moon', {left: 1205, top: 585, width: 540, height: 350, ...frameStyle, opacity: c, transform: `translateX(${(1-c)*210}px)`})}
      {label('CREW', 145, 970, 620)}{label('LAUNCH', 570, 575, 780)}{label('MOON', 1205, 970, 540)}
      {rail('NASA image archive · public-domain review pending')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-02-numeric-step-progression') {
    const active = frame < 65 ? 0 : frame < 120 ? 1 : 2;
    const assets = [
      ['s02-cpi-299-170.png', 's02-cpi-299-170'],
      ['s02-cpi-305-109.png', 's02-cpi-305-109'],
      ['s02-cpi-306-746.png', 's02-cpi-306-746'],
    ] as const;
    return <AbsoluteFill style={common}>{bg}{chrome('BLS CPI-U · SERIES CUUR0000SA0')}
      {assets.map(([name, id], index) => index === active ? surface(name, id, {left: 395, top: 185, width: 1130, height: 705, transform: `scale(${0.92+0.08*progress(frame, index === 0 ? 20 : index === 1 ? 65 : 120, index === 0 ? 55 : index === 1 ? 98 : 155)})`}) : null)}
      <div data-source-states={cpiSourceStates.join(',')} style={{display: 'none'}} />
      {rail('U.S. Bureau of Labor Statistics · 2023 monthly CPI table')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-03-chart-reveal') {
    const p = progress(frame, 25, 166);
    return <AbsoluteFill style={common}>{bg}{chrome('NASA GISTEMP V4 · GLOBAL ANOMALY')}
      <div style={{position: 'absolute', left: 255, top: 150, width: 1410, height: 790, overflow: 'hidden', clipPath: `inset(0 ${(1-p)*100}% 0 0)`}}>
        {surface('s03-gistemp-chart.png', 's03-gistemp-chart', {inset: 0, width: '100%', height: '100%'})}
      </div>
      {rail('NASA GISS · GLB.Ts+dSST · 1951–1980 baseline')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-04-map-route-reframe') {
    const reframe = progress(frame, 20, 82), route = progress(frame, 78, 154);
    return <AbsoluteFill style={common}>{bg}{chrome('NPS · SOUTH RIVER AREA')}
      <div style={{position: 'absolute', left: 335, top: 115, width: 1250, height: 850, overflow: 'hidden', background: '#fff', ...frameStyle}}>
        <div style={{position:'absolute',left:-10,top:-10,width:1270,height:870,transform:`scale(${1+0.12*reframe})`}}>
          {surface('s04-nps-south-river-map.png', 's04-nps-south-river-map', {inset:0,width:'100%',height:'100%'})}
          <div style={{position:'absolute',inset:0,clipPath:`inset(0 ${(1-route)*100}% 0 0)`}}>
            {surface('s04-route-overlay.svg', 's04-route-overlay', {inset:0,width:'100%',height:'100%'})}
          </div>
        </div>
      </div>
      {label('SOUTH RIVER FALLS TRAIL', 685, 1005, 550)}
      {rail('National Park Service · 2025 printed trail map')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-05-object-preserving-layout-reframe') {
    const reframe = progress(frame, 20, 105), person = progress(frame, 70, 142), doc = progress(frame, 112, 176);
    return <AbsoluteFill style={common}>{bg}{chrome('U.S. HOUSE CHAMBER · 1975')}
      {photo('s05-house-chamber.jpg', 's05-house-chamber', {left: 105+120*reframe, top: 145+65*reframe, width: 1500-520*reframe, height: 800-260*reframe, ...frameStyle})}
      {photo('s05-ford-portrait.jpg', 's05-ford-portrait', {left: 1260, top: 210, width: 360, height: 455, ...frameStyle, opacity: person, transform: `translateX(${(1-person)*260}px)`})}
      {surface('s05-ford-sotu-document.png', 's05-ford-sotu-document', {left: 1215, top: 710, width: 455, height: 250, ...frameStyle, opacity: doc, transform: `translateY(${(1-doc)*170}px)`})}
      {rail('NARA chamber photograph · Gerald R. Ford Library address')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-06-directional-exit-hard-cut-pair') {
    const exit = progress(frame, 24, 112);
    return <AbsoluteFill style={common}>{bg}
      {frame < 120 ? <div style={{position: 'absolute', inset: 0, transform: `translateX(${-2250*exit}px)`}}>
        {chrome('APOLLO 11 · LAUNCH')}{photo('s06-launch-scene.jpg', 's06-launch-scene', {left: 270, top: 120, width: 1380, height: 820, ...frameStyle})}
      </div> : <>{chrome('APOLLO 11 · THE MOON')}{photo('s06-moon-scene.jpg', 's06-moon-scene', {left: 270, top: 120, width: 1380, height: 820, ...frameStyle})}</>}
      {rail('NASA official mission photography')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-07-hook-reel-collage-montage') {
    const item = frame < 58 ? 0 : frame < 116 ? 1 : 2;
    const starts = [18,58,116];
    const panels = [
      ['s07-apollo-crew.jpg','s07-apollo-crew'],
      ['s07-apollo-launch.jpg','s07-apollo-launch'],
      ['s07-apollo-press-kit.png','s07-apollo-press-kit'],
    ] as const;
    const p = progress(frame, starts[item], Math.min(starts[item]+34, 174));
    return <AbsoluteFill style={common}>{bg}{chrome('APOLLO 11 · PEOPLE / EVENT / RECORD')}
      {photo(panels[item][0], panels[item][1], {left: 355, top: 125, width: 1210, height: 825, ...frameStyle, objectFit: item === 2 ? 'contain' : 'cover', background: '#fff', opacity: p, transform: `scale(${.9+.1*p})`})}
      {rail('NASA image archive and Apollo 11 press kit')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-08-speaker-supporting-overlay-entry') {
    const evidence = progress(frame, 70, 160);
    return <AbsoluteFill style={common}>{bg}{chrome('GERALD R. FORD · ADDRESS TO CONGRESS')}
      {photo('s08-ford-speaker.jpg', 's08-ford-speaker', {left: 180, top: 145, width: 810, height: 810, ...frameStyle})}
      {surface('s08-address-evidence.png', 's08-address-evidence', {left: 1090, top: 245, width: 620, height: 600, ...frameStyle, background: '#fff', opacity: evidence, transform: `translateX(${(1-evidence)*320}px)`})}
      {rail('NARA / Gerald R. Ford Presidential Library')}
    </AbsoluteFill>;
  }

  if (sampleId === 'sample-09-device-light-focal-motion') {
    const enter = progress(frame, 18, 72), edit = progress(frame, 92, 162);
    return <AbsoluteFill style={common}>{bg}{chrome('WIKIPEDIA · MOBILE SCREEN STATE')}
      {photo('s09-iphone-x.jpg', 's09-iphone-x', {left: 650, top: 105, width: 620, height: 860, objectFit: 'contain', transform: `translateY(${(1-enter)*170}px)`, opacity: enter})}
      <div style={{position: 'absolute', left: 804, top: 224, width: 312, height: 600, overflow: 'hidden', borderRadius: 18, background: '#fff', opacity: enter}}>
        {surface('s09-wikipedia-start.png', 's09-wikipedia-start', {inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 1-edit})}
        {surface('s09-wikipedia-edit.png', 's09-wikipedia-edit', {inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: edit})}
      </div>
      {rail('Device photo CC BY-SA 4.0 · source screen captures CC0 / CC BY-SA 4.0')}
    </AbsoluteFill>;
  }

  const reveal = progress(frame, 25, 160);
  return <AbsoluteFill style={common}>{bg}{chrome('DIAMETERS TO SCALE · DISTANCE SHOWN WITH A BROKEN AXIS')}
    {surface('s10-earth-disc.png', 's10-earth', {left: 170, top: 230, width: earthDiameterPx, height: earthDiameterPx, opacity: reveal})}
    {surface('s10-moon-disc.png', 's10-moon', {left: 1050, top: 540-moonDiameterPx/2, width: moonDiameterPx, height: moonDiameterPx, opacity: progress(frame, 70, 132), transform: `scale(${.72+.28*progress(frame,70,132)})`})}
    <div style={{position:'absolute',inset:0,clipPath:`inset(0 ${(1-reveal)*100}% 0 0)`}}>
      {surface('s10-distance-scale.svg', 's10-distance-scale', {inset:0,width:'100%',height:'100%'})}
    </div>
    {rail('NASA imagery · JPL scale worksheet')}
  </AbsoluteFill>;
}
