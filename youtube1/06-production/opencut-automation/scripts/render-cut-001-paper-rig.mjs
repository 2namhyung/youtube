#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('../opencut-classic/apps/web/node_modules/@napi-rs/canvas');

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const index = item.indexOf('=');
  return index < 0 ? [item, true] : [item.slice(0, index), item.slice(index + 1)];
}));
const backgroundPath = path.resolve(String(args['--background'] || ''));
const audioPath = path.resolve(String(args['--audio'] || ''));
const outputDir = path.resolve(String(args['--output-dir'] || ''));
const ffmpeg = path.resolve(String(args['--ffmpeg'] || ''));
if (!backgroundPath || !audioPath || !outputDir || !ffmpeg) throw new Error('Required: --background, --audio, --output-dir, --ffmpeg');

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 24;
const FRAMES = 73;
const DURATION = FRAMES / FPS;
const framesDir = path.join(outputDir, 'frames');
await fsp.mkdir(framesDir, { recursive: true });

const svg = (width, height, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="4" dy="7" stdDeviation="4" flood-color="#211d18" flood-opacity=".28"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="7" result="n"/><feColorMatrix in="n" type="saturate" values="0" result="g"/><feBlend in="SourceGraphic" in2="g" mode="multiply"/></filter></defs>
  <g filter="url(#shadow)">${body}</g></svg>`);

const assets = {
  teacherHead: await loadImage(svg(190, 225, '<path d="M33 91Q38 25 96 17q64 7 65 78v75q-23 38-66 43-45-8-67-45z" fill="#e8d2a9"/><path d="M24 91Q22 26 91 8q73 13 76 78-25-28-54-36-40 17-89 41z" fill="#403630"/><path d="M32 87q-8 43 7 78-29-21-20-73zM156 79q22 45 1 91 31-18 28-67z" fill="#403630"/>')),
  teacherTorso: await loadImage(svg(285, 390, '<path d="M54 47q88-38 177 0l42 319H13z" fill="#b75733"/><path d="M108 38h71l29 328H78z" fill="#eee1c7"/><path d="M111 40l30 48 39-48" fill="none" stroke="#ceb994" stroke-width="9"/><path d="M143 82v176" stroke="#2a5355" stroke-width="10"/><rect x="118" y="230" width="52" height="69" rx="5" fill="#d7c5a3" stroke="#665b4d" stroke-width="4"/>')),
  teacherUpper: await loadImage(svg(86, 174, '<path d="M20 10q24-14 50 3l8 143q-31 22-63 0z" fill="#b75733"/>')),
  teacherFore: await loadImage(svg(76, 168, '<path d="M16 8q23-12 46 2l7 142q-28 20-56 1z" fill="#b75733"/><path d="M15 133q27 12 54 0v22q-27 20-55 0z" fill="#eee1c7"/>')),
  hand: await loadImage(svg(92, 116, '<path d="M39 10q16-8 27 8l8 48 11-25q8-5 8 8l-10 50q-28 23-62-2L6 63q-2-15 10-9l13 20-3-51q1-13 13-13z" fill="#e8d2a9"/>')),
  teacherSkirt: await loadImage(svg(250, 250, '<path d="M39 7h173l31 229H7z" fill="#25282a"/>')),
  studentHead: await loadImage(svg(165, 190, '<path d="M27 73Q32 18 83 13q57 8 57 67v62q-21 34-57 38-38-7-58-39z" fill="#e4cda4"/><path d="M20 75Q19 17 78 5q62 6 69 66l-29-18-9 17-20-22-18 19-15-19-36 27z" fill="#292725"/>')),
  studentTorso: await loadImage(svg(235, 315, '<path d="M36 42q81-35 163 0l29 256H8z" fill="#263847"/><path d="M86 32h63l23 265H66z" fill="#e7dcc5"/><path d="M117 67l24 44-27 58-24-58z" fill="#315b5a"/>')),
  studentUpper: await loadImage(svg(74, 150, '<path d="M14 9q22-12 44 2l9 124q-27 19-53 1z" fill="#263847"/>')),
  studentFore: await loadImage(svg(68, 140, '<path d="M12 7q21-10 41 2l8 116q-24 18-49 2z" fill="#263847"/><path d="M11 112q25 10 49 0v17q-23 16-48 0z" fill="#e7dcc5"/>')),
  phone: await loadImage(svg(310, 570, '<rect x="10" y="10" width="290" height="550" rx="48" fill="#292b2b" stroke="#4c514e" stroke-width="13"/><circle cx="82" cy="92" r="46" fill="#111" stroke="#8b8e85" stroke-width="12"/><circle cx="82" cy="92" r="19" fill="#24444d"/><circle cx="207" cy="86" r="13" fill="#d4b569"/>')),
  phoneSmall: await loadImage(svg(178, 108, '<rect x="5" y="5" width="168" height="98" rx="18" fill="#262929" stroke="#555b57" stroke-width="7"/><circle cx="145" cy="32" r="16" fill="#101111" stroke="#96988e" stroke-width="5"/>')),
  document: await loadImage(svg(360, 250, '<path d="M17 9l330 12-14 215L8 224z" fill="#eee2c8" stroke="#c8b68e" stroke-width="7"/><path d="M38 43h245M37 79h210M34 115h263M31 151h222" stroke="#d2c3a4" stroke-width="4" opacity=".55"/>')),
};
const background = await loadImage(backgroundPath);

const ease = (t) => t * t * (3 - 2 * t);
const rad = (degrees) => degrees * Math.PI / 180;
function drawPart(ctx, image, x, y, rotation = 0, scale = 1, anchorX = image.width / 2, anchorY = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -anchorX, -anchorY);
  ctx.restore();
}
function joint(x, y, length, angle) { return { x: x + Math.sin(angle) * length, y: y + Math.cos(angle) * length }; }

for (let frame = 0; frame < FRAMES; frame += 1) {
  const t = ease(frame / (FRAMES - 1));
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const backgroundScale = 1.025 + t * 0.012;
  const bgWidth = WIDTH * backgroundScale;
  const bgHeight = HEIGHT * backgroundScale;
  ctx.drawImage(background, -(bgWidth - WIDTH) * (.42 + .05 * t), -(bgHeight - HEIGHT) * .45, bgWidth, bgHeight);

  // Student puppet: the phone hand rises slightly while the torso remains behind the desks.
  const sx = 270 - 9 * t; const sy = 650 - 4 * t; const ss = .78;
  drawPart(ctx, assets.studentTorso, sx, sy, rad(-4 + 1.5 * t), ss);
  drawPart(ctx, assets.studentHead, sx - 4, sy - 129, rad(-7 + 4 * t), ss);
  const studentShoulder = { x: sx + 55, y: sy + 55 };
  const studentUpperAngle = rad(106 - 9 * t);
  drawPart(ctx, assets.studentUpper, studentShoulder.x, studentShoulder.y, studentUpperAngle, ss, 37, 10);
  const studentElbow = joint(studentShoulder.x, studentShoulder.y, 110 * ss, studentUpperAngle);
  const studentForeAngle = rad(73 - 7 * t);
  drawPart(ctx, assets.studentFore, studentElbow.x, studentElbow.y, studentForeAngle, ss, 34, 8);
  const studentWrist = joint(studentElbow.x, studentElbow.y, 102 * ss, studentForeAngle);
  drawPart(ctx, assets.hand, studentWrist.x, studentWrist.y, rad(78 - 5 * t), .54, 46, 10);
  drawPart(ctx, assets.phoneSmall, studentWrist.x + 34, studentWrist.y + 28, rad(-8 + 9 * t), .78, 89, 54);

  // Teacher puppet: visible blank paper face, torso shift, and complaint-pressing hand gesture.
  const tx = 705 + 7 * t; const ty = 690 - 7 * t; const ts = 1.02;
  drawPart(ctx, assets.teacherSkirt, tx, ty + 295, rad(1), ts);
  drawPart(ctx, assets.teacherTorso, tx, ty, rad(2 - 1.5 * t), ts);
  drawPart(ctx, assets.teacherHead, tx + 4, ty - 185, rad(-7 + 7 * t), ts);
  const shoulder = { x: tx - 103, y: ty + 74 };
  const upperAngle = rad(35 + 8 * t);
  drawPart(ctx, assets.teacherUpper, shoulder.x, shoulder.y, upperAngle, ts, 43, 10);
  const elbow = joint(shoulder.x, shoulder.y, 151 * ts, upperAngle);
  const foreAngle = rad(16 + 5 * t);
  drawPart(ctx, assets.teacherFore, elbow.x, elbow.y, foreAngle, ts, 38, 8);
  const wrist = joint(elbow.x, elbow.y, 142 * ts, foreAngle);
  drawPart(ctx, assets.hand, wrist.x, wrist.y, rad(6 - 4 * t), .9, 46, 12);

  // Evidence layers sit in front of both puppets and move at a stronger parallax rate.
  drawPart(ctx, assets.document, 680 + 11 * t, 1335 - 5 * t, rad(-3 + 1.5 * t), .9, 180, 125);
  drawPart(ctx, assets.phone, 220 - 16 * t, 1375 - 20 * t, rad(-18 + 3 * t), 1.2 + .035 * t, 155, 285);

  const file = path.join(framesDir, `frame-${String(frame).padStart(4, '0')}.png`);
  await fsp.writeFile(file, canvas.toBuffer('image/png'));
}

const output = path.join(outputDir, 'cut-001-paper-rig-test.mp4');
const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'frame-%04d.png'), '-i', audioPath, '-filter_complex', `[1:a]atrim=start=0:end=${DURATION},apad=pad_dur=${DURATION},atrim=duration=${DURATION}[a]`, '-map', '0:v:0', '-map', '[a]', '-frames:v', String(FRAMES), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', output], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`FFmpeg failed: ${String(result.stderr).slice(-1000)}`);
await fsp.writeFile(path.join(outputDir, 'rig-manifest.json'), `${JSON.stringify({ schema: 'paper-puppet-cut-test-v1', cut: 1, width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, durationSeconds: DURATION, narrationRange: [0, 3.018518518518518], renderer: '@napi-rs/canvas', assetKinds: ['imagegen-background', 'svg-paper-puppet-parts', 'canvas-joint-animation', 'ffmpeg-private-test'], joints: ['student-shoulder', 'student-elbow', 'student-wrist', 'teacher-shoulder', 'teacher-elbow', 'teacher-wrist'], output: path.basename(output) }, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ output, frames: FRAMES, fps: FPS, durationSeconds: DURATION })}\n`);
