export {
  WIDTH,
  HEIGHT,
  CONTACT_WIDTH,
  CONTACT_HEIGHT,
  renderStyleFrameBuffers,
  renderContactBuffer,
  renderBlockedContactBuffer,
} from './grammar-bound-style-frame-renderer-v05.mjs';

import path from 'node:path';
import sharp from 'sharp';

export async function renderBoardBuffer({root, rows}) {
  const rowHeight = 548;
  const boardHeight = 110 + rows.length * rowHeight;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${boardHeight}"><rect width="100%" height="100%" fill="#ded4c5"/><text x="60" y="62" font-family="Arial, Malgun Gothic, sans-serif" font-size="36" font-weight="700" fill="#17212b">EP001 v06 — source-surface-only transfer review</text><text x="60" y="94" font-family="Arial, Malgun Gothic, sans-serif" font-size="19" fill="#685f55">No generic text-box focal · static state evidence only · blocked rows are not reviewable</text></svg>`);
  const contacts = await Promise.all(rows.map((row) => sharp(path.resolve(root, row.contact.path)).resize(1800, 488).png({compressionLevel: 9}).toBuffer()));
  return sharp(svg).composite(contacts.map((input, index) => ({input, left: 60, top: 110 + index * rowHeight}))).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
}

export const RENDERER_RECIPE_ID = 'source-surface-only-compositor-v06';
export const RENDERER_RECIPE_PATH = 'video/scripts/lib/grammar-bound-style-frame-renderer-v06.mjs';
