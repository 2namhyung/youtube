import sharp from 'sharp';

const root = 'video/qa/style-calibration/episode-001-sh003-assembly-set-v04/rendered';
const samples = [
  ['F0 · BACKGROUND ONLY', 'SH003-manifest-v04-frame-0.png'],
  ['F98 · CHAMBER HOLD', 'SH003-manifest-v04-frame-98.png'],
  ['F198 · KIM FOCAL HOLD', 'SH003-manifest-v04-frame-198.png'],
  ['F298 · PARK / SUMMARY HOLD', 'SH003-manifest-v04-frame-298.png'],
];

const layers = [];
for (let index = 0; index < samples.length; index += 1) {
  const [label, file] = samples[index];
  const left = (index % 2) * 960;
  const top = Math.floor(index / 2) * 540;
  const input = await sharp(`${root}/${file}`).resize(960, 540, {fit: 'cover'}).toBuffer();
  const overlay = Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="960" height="58" fill="#211e1acc"/><text x="24" y="39" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#fffaf0">${label}</text></svg>`);
  layers.push({input, left, top}, {input: overlay, left, top});
}

await sharp({
  create: {width: 1920, height: 1080, channels: 4, background: {r: 33, g: 30, b: 26, alpha: 1}},
})
  .composite(layers)
  .png()
  .toFile(`${root}/SH003-manifest-v04-contact-sheet.png`);

console.log('SH003 v04 contact sheet created');
