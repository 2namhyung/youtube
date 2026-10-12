import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();
const candidateRoot = path.join(root,'video/qa/style-frames/remotion-motion-grammar-v02-sample-cuts');
const readJson = async (file) => JSON.parse(await readFile(file,'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedRoute = [[910,500],[940,505],[970,505],[1000,495],[1030,500],[1050,520],[1085,520],[1115,505],[1135,520],[1155,540],[1170,510],[1200,495],[1235,485],[1260,475],[1295,480],[1320,492]];

test('sample 04 binds the runtime route asset to frozen NPS raster coordinates', async () => {
  const manifest = await readJson(path.join(candidateRoot,'sample-04-map-route-reframe/manifest.json'));
  const sourceManifest = await readJson(path.join(root,'video/source-intake/reference-calibration-v02/source-manifest.json'));
  const binding = manifest.route_geometry_binding;
  const overlay = manifest.assets.find((asset) => asset.asset_id === 's04-route-overlay');
  const nps = sourceManifest.records.find((record) => record.source_id === 'NPS-SOUTH-RIVER-2025');
  assert.deepEqual(binding.path_points,expectedRoute);
  assert.equal(binding.source_pdf_sha256,nps.sha256);
  assert.equal(overlay.source_sha256,nps.sha256);
  assert.equal(overlay.origin,'deterministic-editorial');
  assert.equal(overlay.explanatory_overlay,true);
  assert.equal(sha(await readFile(path.join(root,binding.source_raster.path))),binding.source_raster.sha256);
  assert.match(await readFile(path.join(root,overlay.path),'utf8'),/M 910 500 L 940 505/);
  assert.equal(manifest.camera_reframe_binding.direction,'zoom-in');
  assert.ok(manifest.camera_reframe_binding.end_scale > manifest.camera_reframe_binding.start_scale);
  assert.deepEqual(manifest.camera_reframe_binding.shared_transform_asset_ids,['s04-nps-south-river-map','s04-route-overlay']);
  assert.equal(manifest.map_label_layout_binding.vertical_gap_px,40);
  assert.ok(manifest.map_label_layout_binding.vertical_gap_px >= 32 && manifest.map_label_layout_binding.vertical_gap_px <= 72);
});

test('sample 10 uses JPL values, a broken distance axis, and the exact diameter ratio', async () => {
  const manifest = await readJson(path.join(candidateRoot,'sample-10-narrative-scale-translation/manifest.json'));
  const binding = manifest.scale_geometry_binding;
  const overlay = manifest.assets.find((asset) => asset.asset_id === 's10-distance-scale');
  assert.deepEqual(binding.source_values,{earth_diameter_km:12742,moon_diameter_km:3475,average_distance_km:384400});
  assert.equal(binding.distance_treatment,'broken-axis-not-to-scale');
  assert.ok(Math.abs(binding.render_geometry.diameter_ratio - 3475/12742) < 1e-12);
  assert.ok(Math.abs(binding.render_geometry.moon_diameter_px / binding.render_geometry.earth_diameter_px - 3475/12742) < 1e-12);
  const svg = await readFile(path.join(root,overlay.path),'utf8');
  for (const value of ['12,742 km','3,475 km','384,400 km','BROKEN AXIS · DISTANCE NOT TO SCALE']) assert.ok(svg.includes(value));
});

test('sample 10 normalized source-photo discs have equal measured alpha diameters', async () => {
  const manifest = await readJson(path.join(candidateRoot,'sample-10-narrative-scale-translation/manifest.json'));
  for (const id of ['s10-earth','s10-moon']) {
    const asset=manifest.assets.find((item)=>item.asset_id===id);
    const {data,info}=await sharp(path.join(root,asset.path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    assert.deepEqual({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},manifest.scale_geometry_binding.normalized_disc_assets[id === 's10-earth' ? 'earth' : 'moon']);
  }
});
