import path from 'node:path';
import sharp from 'sharp';
import {renderStyleFrameBuffers,renderContactBuffer,renderBlockedContactBuffer} from './grammar-bound-style-frame-renderer-v08.mjs';
export {renderStyleFrameBuffers,renderContactBuffer,renderBlockedContactBuffer};
export const WIDTH=1920,HEIGHT=1080,CONTACT_WIDTH=1920,CONTACT_HEIGHT=520;
export const RENDERER_RECIPE_ID='episode-source-surface-compositor-v09';
export const RENDERER_RECIPE_PATH='video/scripts/lib/grammar-bound-style-frame-renderer-v09.mjs';
export async function renderBoardBuffer({root,rows}){const h=110+rows.length*548,s=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${h}"><rect width="100%" height="100%" fill="#ded4c5"/><text x="60" y="62" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#17212b">EP001 v09 — episode-source-only transfer review</text><text x="60" y="94" font-family="Arial,sans-serif" font-size="19" fill="#685f55">Actual source-pixel containment · source-bound 0/45/90 state · no text/card focal</text></svg>`),cs=await Promise.all(rows.map(r=>sharp(path.resolve(root,r.contact.path)).resize(1800,488).png({compressionLevel:9}).toBuffer()));return sharp(s).composite(cs.map((input,i)=>({input,left:60,top:110+i*548}))).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();}
