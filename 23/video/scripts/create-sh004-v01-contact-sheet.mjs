import sharp from 'sharp';

const root = 'video/qa/style-calibration/episode-001-sh004-two-route-v01/rendered';
const samples = ['pair-frame-0.png', 'pair-frame-24.png', 'pair-frame-62.png', 'pair-frame-82.png', 'pair-frame-119.png'];
const width = 960;
const height = 540;
const layers = [];
for (let index = 0; index < samples.length; index += 1) {
  const input = await sharp(`${root}/${samples[index]}`).resize(width, height, {fit: 'contain', background: '#f2ead8'}).toBuffer();
  const label = Buffer.from(`<svg width="${width}" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="54" fill="#211e1acc"/><text x="18" y="36" font-family="Arial" font-size="24" font-weight="800" fill="#fffaf0">PAIR F${[0,24,62,82,119][index]}</text></svg>`);
  layers.push({input, left: (index % 2) * width, top: Math.floor(index / 2) * height}, {input: label, left: (index % 2) * width, top: Math.floor(index / 2) * height});
}
await sharp({create: {width: 1920, height: 1620, channels: 4, background: {r: 33, g: 30, b: 26, alpha: 1}}}).composite(layers).png().toFile(`${root}/SH003-to-SH004-pair-v08-v01-contact.png`);
console.log('SH003 to SH004 v08-v01 pair contact sheet created');
