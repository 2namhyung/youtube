import path from 'node:path';
import sharp from 'sharp';

export const RENDERER_RECIPE_ID = 'independent-input-sharp-compositor-v04';
export const RENDERER_RECIPE_PATH = 'video/scripts/lib/grammar-bound-style-frame-renderer-v04.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;

const checkerSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs><pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#eee7da"/><rect width="32" height="32" fill="#e6ddcf"/><rect x="32" y="32" width="32" height="32" fill="#e6ddcf"/></pattern></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
</svg>`);

function integerBox(box) {
  return {
    left: Math.round(box.left),
    top: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export async function renderStyleFrameBuffers({root, frame}) {
  const layers = [...(frame.render_recipe?.layers ?? [])].sort((a, b) => a.z_index - b.z_index);
  const composites = [];
  for (const layer of layers) {
    const box = integerBox(layer.bbox);
    const input = await sharp(path.resolve(root, layer.path))
      .resize(box.width, box.height, {
        fit: layer.fit,
        position: layer.position ?? 'centre',
        background: {r: 0, g: 0, b: 0, alpha: 0},
      })
      .png({compressionLevel: 9, adaptiveFiltering: false})
      .toBuffer();
    composites.push({input, left: box.left, top: box.top, blend: 'over'});
  }
  const wide = await sharp(checkerSvg)
    .composite(composites)
    .png({compressionLevel: 9, adaptiveFiltering: false})
    .toBuffer();
  const mobile = await sharp(wide)
    .resize(360, 203, {fit: 'fill'})
    .png({compressionLevel: 9, adaptiveFiltering: false})
    .toBuffer();
  return {wide, mobile};
}
