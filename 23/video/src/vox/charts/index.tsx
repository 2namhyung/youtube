import React from 'react';

import type {ChartSpec} from '../../cut-manifest';
import {normalizeChartRows} from './model';

const INK = '#302a24';
const ACCENT = '#ce543d';
const MUTED = '#9b876b';

const format = (value: number) => new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 1}).format(value);

export function BarChart({chart, progress}: {chart: ChartSpec; progress: number}) {
  const rows = normalizeChartRows(chart.data);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return <div style={{display: 'flex', alignItems: 'flex-end', gap: 28, width: '100%', height: '100%', padding: '60px 48px 42px', color: INK}}>
    {rows.map((row, index) => <div key={`${row.label}-${index}`} style={{height: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 12}}>
      <div style={{fontSize: 24, fontWeight: 800, opacity: progress}}>{format(row.value)}{chart.unit}</div>
      <div style={{width: '72%', minWidth: 22, height: `${Math.max(2, Math.abs(row.value) / max * progress * 76)}%`, background: index % 2 ? MUTED : ACCENT, borderRadius: '8px 8px 2px 2px', boxShadow: '6px 8px 0 rgba(48,42,36,.1)'}} />
      <div style={{fontSize: 20, fontWeight: 700, textAlign: 'center'}}>{row.label}</div>
    </div>)}
  </div>;
}

export function LineChart({chart, progress}: {chart: ChartSpec; progress: number}) {
  const rows = normalizeChartRows(chart.data);
  const width = 900;
  const height = 430;
  const min = Math.min(0, ...rows.map((row) => row.value));
  const max = Math.max(1, ...rows.map((row) => row.value));
  const span = Math.max(1, max - min);
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? width / 2 : index / (rows.length - 1) * width,
    y: height - ((row.value - min) / span) * height,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center'}}>
    <svg viewBox={`-60 -70 ${width + 120} ${height + 160}`} width="100%" height="100%" overflow="visible">
      <path d={`M 0 ${height} H ${width}`} stroke={MUTED} strokeWidth="3" fill="none" />
      <path d={path} stroke={ACCENT} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
      {points.map((point, index) => <g key={`${point.label}-${index}`} opacity={progress >= index / Math.max(1, points.length) ? 1 : 0}>
        <circle cx={point.x} cy={point.y} r="12" fill={INK} />
        <text x={point.x} y={height + 45} textAnchor="middle" fontSize="22" fontWeight="700" fill={INK}>{point.label}</text>
        <text x={point.x} y={point.y - 24} textAnchor="middle" fontSize="24" fontWeight="800" fill={INK}>{format(point.value)}{chart.unit}</text>
      </g>)}
    </svg>
  </div>;
}

export function Counter({chart, progress}: {chart: ChartSpec; progress: number}) {
  const rows = normalizeChartRows(chart.data);
  const value = rows.at(-1)?.value ?? 0;
  return <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: INK}}>
    <div style={{fontSize: 146, fontWeight: 900, letterSpacing: -7, fontVariantNumeric: 'tabular-nums'}}>{format(value * progress)}<span style={{fontSize: 46, marginLeft: 14, letterSpacing: 0}}>{chart.unit}</span></div>
  </div>;
}

export function DotPlot({chart, progress}: {chart: ChartSpec; progress: number}) {
  const rows = normalizeChartRows(chart.data);
  const min = Math.min(0, ...rows.map((row) => row.value));
  const max = Math.max(1, ...rows.map((row) => row.value));
  const span = Math.max(1, max - min);
  return <div style={{width: '100%', height: '100%', padding: '44px 70px', display: 'flex', flexDirection: 'column', justifyContent: 'space-around', color: INK}}>
    {rows.map((row, index) => {
      const x = ((row.value - min) / span) * 100;
      const visible = progress >= (index + 1) / Math.max(1, rows.length) * 0.7;
      return <div key={`${row.label}-${index}`} style={{position: 'relative', height: 60, opacity: visible ? 1 : 0.15}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 28, height: 3, background: '#d7c9af'}} />
        <div style={{position: 'absolute', left: `${x * progress}%`, top: 12, width: 34, height: 34, marginLeft: -17, borderRadius: '50%', background: ACCENT, border: '5px solid #fffaf0', boxShadow: '0 4px 0 rgba(48,42,36,.15)'}} />
        <div style={{position: 'absolute', left: 0, top: -6, fontSize: 20, fontWeight: 800}}>{row.label}</div>
        <div style={{position: 'absolute', left: `${x * progress}%`, top: -7, marginLeft: 24, fontSize: 20, fontWeight: 850}}>{format(row.value)}{chart.unit}</div>
      </div>;
    })}
  </div>;
}

export function ProcessTimeline({chart, progress}: {chart: ChartSpec; progress: number}) {
  const rows = normalizeChartRows(chart.data);
  return <div style={{position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 46px', color: INK}}>
    <div style={{position: 'absolute', left: 72, right: 72, top: '49%', height: 9, background: '#d7c9af'}} />
    <div style={{position: 'absolute', left: 72, top: '49%', height: 9, width: `calc((100% - 144px) * ${progress})`, background: ACCENT, transformOrigin: 'left'}} />
    {rows.map((row, index) => {
      const threshold = rows.length === 1 ? 0 : index / (rows.length - 1);
      const visible = progress >= threshold;
      return <div key={`${row.label}-${index}`} style={{position: 'relative', width: 176, textAlign: 'center', opacity: visible ? 1 : 0.24}}>
        <div style={{margin: '0 auto 20px', width: 46, height: 46, borderRadius: '50%', background: visible ? ACCENT : '#d7c9af', border: '7px solid #fffaf0', boxShadow: '0 5px 0 rgba(48,42,36,.15)'}} />
        <div style={{fontSize: 24, fontWeight: 850}}>{row.label}</div>
        {Number.isFinite(row.value) && <div style={{fontSize: 18, color: MUTED, marginTop: 7}}>{format(row.value)}{chart.unit}</div>}
      </div>;
    })}
  </div>;
}

export function ManifestChart({chart, progress}: {chart: ChartSpec; progress: number}) {
  switch (chart.type) {
    case 'bar': return <BarChart chart={chart} progress={progress} />;
    case 'line': return <LineChart chart={chart} progress={progress} />;
    case 'counter': return <Counter chart={chart} progress={progress} />;
    case 'dot-plot': return <DotPlot chart={chart} progress={progress} />;
    case 'process':
    case 'timeline': return <ProcessTimeline chart={chart} progress={progress} />;
    default: throw new Error(`unsupported chart type: ${String(chart.type)}`);
  }
}
