import sharp from 'sharp';

const root = 'video/qa/style-calibration/episode-001-sh003-assembly-set-v07/rendered';
const samples = [
  ['F0 · BACKGROUND ONLY', 'SH003-manifest-v07-frame-0.png'],
  ['F98 · CHAMBER PERSISTENCE', 'SH003-manifest-v07-frame-98.png'],
  ['F198 · KIM FOCAL', 'SH003-manifest-v07-frame-198.png'],
  ['F238 · PARK + BILL ENTRY', 'SH003-manifest-v07-frame-238.png'],
  ['F298 · BILL TITLE HOLD', 'SH003-manifest-v07-frame-298.png'],
];
const tileWidth = 640;
const tileHeight = 540;
const layers = [];
for (let index = 0; index < samples.length; index += 1) {
  const [label, file] = samples[index];
  const left = (index % 3) * tileWidth;
  const top = Math.floor(index / 3) * tileHeight;
  const input = await sharp(`${root}/${file}`).resize(tileWidth, tileHeight, {fit: 'cover'}).toBuffer();
  const overlay = Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${tileWidth}" height="54" fill="#211e1acc"/><text x="18" y="36" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#fffaf0">${label}</text></svg>`);
  layers.push({input, left, top}, {input: overlay, left, top});
}
await sharp({create:{width:1920,height:1080,channels:4,background:{r:33,g:30,b:26,alpha:1}}}).composite(layers).png().toFile(`${root}/SH003-manifest-v07-contact-sheet.png`);
console.log('SH003 v07 contact sheet created');
