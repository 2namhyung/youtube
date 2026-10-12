export function clamp01(v){ return Math.max(0, Math.min(1, v)); }
export function easeOutCubic(v){ const t=clamp01(v); return 1-Math.pow(1-t,3); }
export function routeReveal({progress, paths, color='#38c2c9', width=8}) {
  const p=clamp01(progress); return paths.map((d,i)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width-i}" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-p}" opacity="${0.95-i*0.12}"/>`).join('');
}
export function kineticHeadline({text,progress,x=72,y=300,size=104,color='#edf4f2'}) {
  const p=easeOutCubic(progress); return `<text x="${x}" y="${y}" fill="${color}" font-family="Pretendard,Arial,sans-serif" font-size="${size}" font-weight="800" letter-spacing="-2" opacity="${p}" transform="translate(${(1-p)*42},0)">${text}</text>`;
}
export function iconCallout({svgInner,x,y,size=96,accent='#ff705d',progress=1}) {
  const p=easeOutCubic(progress); return `<g transform="translate(${x} ${y}) scale(${size/24*p})" opacity="${p}"><circle cx="12" cy="12" r="11" fill="${accent}"/><g transform="translate(1 1)" fill="none" stroke="#07131f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgInner}</g></g>`;
}
export function progressRail({progress,y=1660,color='#38c2c9',secondary='#274657'}) { const p=clamp01(progress); return `<rect x="72" y="${y}" width="936" height="8" rx="4" fill="${secondary}"/><rect x="72" y="${y}" width="${936*p}" height="8" rx="4" fill="${color}"/>`; }
export function sourceChip({text,x=72,y=1600,w=430,accent='#ff705d'}) { return `<g><rect x="${x}" y="${y}" width="${w}" height="58" rx="29" fill="#10283a" stroke="${accent}" stroke-width="2"/><circle cx="${x+28}" cy="${y+29}" r="8" fill="${accent}"/><text x="${x+50}" y="${y+37}" fill="#edf4f2" font-family="Pretendard,Arial,sans-serif" font-size="24" font-weight="700">${text}</text></g>`; }
export function wipeTransition({progress,x=0,y=0,w=1080,h=1920,color='#07131f'}) { const p=easeOutCubic(progress); return `<rect x="${x}" y="${y}" width="${w*p}" height="${h}" fill="${color}"/>`; }
