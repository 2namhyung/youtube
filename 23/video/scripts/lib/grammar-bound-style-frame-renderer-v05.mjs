import path from 'node:path';
import sharp from 'sharp';

export const RENDERER_RECIPE_ID = 'transfer-matrix-bound-sharp-compositor-v05';
export const RENDERER_RECIPE_PATH = 'video/scripts/lib/grammar-bound-style-frame-renderer-v05.mjs';
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const CONTACT_WIDTH = 1920;
export const CONTACT_HEIGHT = 520;

const escapeXml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));

const checkerSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs><pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#eee7da"/><rect width="32" height="32" fill="#e6ddcf"/><rect x="32" y="32" width="32" height="32" fill="#e6ddcf"/></pattern></defs>
  <rect width="100%" height="100%" fill="url(#grid)"/>
</svg>`);

const integerBox = (box) => ({left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height)});

export async function renderStyleFrameBuffers({root, frame}) {
  const layers = [...(frame.render_recipe?.layers ?? [])].sort((a, b) => a.z_index - b.z_index);
  const composites = [];
  for (const layer of layers) {
    const box = integerBox(layer.bbox);
    const input = await sharp(path.resolve(root, layer.path)).resize(box.width, box.height, {
      fit: layer.fit,
      position: layer.position ?? 'centre',
      background: {r: 0, g: 0, b: 0, alpha: 0},
    }).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
    composites.push({input, left: box.left, top: box.top, blend: 'over'});
  }
  const wide = await sharp(checkerSvg).composite(composites).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
  const mobile = await sharp(wide).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
  return {wide, mobile};
}

export async function renderContactBuffer({root, familyId, frames}) {
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CONTACT_WIDTH}" height="${CONTACT_HEIGHT}">
    <rect width="100%" height="100%" fill="#eee7da"/>
    <text x="60" y="54" font-family="Arial, Malgun Gothic, sans-serif" font-size="34" font-weight="700" fill="#17212b">${escapeXml(familyId)}</text>
    ${frames.map((frame, index) => `<text x="${60 + index * 600}" y="96" font-family="Arial, sans-serif" font-size="21" font-weight="700" letter-spacing="1" fill="#8b2f2f">${escapeXml(frame.representative_beat.toUpperCase())}</text>`).join('')}
  </svg>`);
  const thumbs = await Promise.all(frames.map((frame) => sharp(path.resolve(root, frame.output)).resize(560, 315).png({compressionLevel: 9}).toBuffer()));
  return sharp(header).composite(thumbs.map((input, index) => ({input, left: 60 + index * 600, top: 118}))).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
}

export async function renderBlockedContactBuffer({familyId, blockers}) {
  const lines = blockers.slice(0, 3);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CONTACT_WIDTH}" height="${CONTACT_HEIGHT}">
    <rect width="100%" height="100%" fill="#eee7da"/>
    <rect x="60" y="54" width="1800" height="410" rx="22" fill="#fffaf3" stroke="#b42318" stroke-width="5"/>
    <text x="100" y="120" font-family="Arial, Malgun Gothic, sans-serif" font-size="38" font-weight="700" fill="#17212b">${escapeXml(familyId)}</text>
    <text x="100" y="170" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#b42318">BLOCKED — NOT A REVIEW SURFACE</text>
    ${lines.map((line, index) => `<text x="100" y="${235 + index * 62}" font-family="Arial, Malgun Gothic, sans-serif" font-size="27" fill="#3d352e">• ${escapeXml(line)}</text>`).join('')}
  </svg>`);
  return sharp(svg).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
}

export async function renderBoardBuffer({root, rows}) {
  const rowHeight = 548;
  const boardHeight = 110 + rows.length * rowHeight;
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${boardHeight}">
    <rect width="100%" height="100%" fill="#ded4c5"/>
    <text x="60" y="62" font-family="Arial, Malgun Gothic, sans-serif" font-size="36" font-weight="700" fill="#17212b">EP001 v05 — sample-to-shot transfer review</text>
    <text x="60" y="94" font-family="Arial, Malgun Gothic, sans-serif" font-size="19" fill="#685f55">Static state evidence only · motion parity not claimed · blocked rows are not reviewable</text>
  </svg>`);
  const contacts = await Promise.all(rows.map((row) => sharp(path.resolve(root, row.contact.path)).resize(1800, 488).png({compressionLevel: 9}).toBuffer()));
  return sharp(base).composite(contacts.map((input, index) => ({input, left: 60, top: 110 + index * rowHeight}))).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
}
