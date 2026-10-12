import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const TOOL_IDS = ['gsap-html-v1', 'motion-canvas-v1', 'canvas-d3-v1', 'lottie-web-v1', 'dotlottie-web-v1', 'ffmpeg-layer-keyframes-v1'];
export const TOPICS = [
  ['compass-route'], ['coffee-steam'], ['wind-turbine'], ['seedling-growth'], ['metro-map'],
  ['weather-front'], ['archive-index'], ['solar-orbit'], ['parcel-sort'], ['music-wave'],
];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = path.join(path.resolve(HERE, '../..'), 'out', 'private-tests', 'nonhuman-motion-engine-smoke-v1', 'creator.json');
export function verifyAuthorityContract(authority) {
  const creator = JSON.parse(fs.readFileSync(CREATOR, 'utf8'));
  if (authority.authorityId !== creator.authorityId || authority.creatorSha256 !== creator.creatorSha256 || authority.adapterSha256 !== creator.adapter.sha256) throw new Error('authority binding drift');
}
