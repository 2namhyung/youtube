import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const route = await fs.readFile(new URL('../opencut-classic/apps/web/src/app/api/newsroom/projects/[slug]/workflow/route.ts', import.meta.url), 'utf8');
assert.match(route, /verifyCommonMasterManifest/u);
assert.match(route, /admitDefaultCommonMasterManifest/u);
assert.match(route, /const commonMasterAssets = await loadCommonMasterAssets\(body\)/u);
assert.match(route, /runOrchestrationCli\(\{[\s\S]*commonMasterAssets \}\)/u);
assert.match(route, /commonMasterManifestId/u);
console.log('newsroom-route-common-master-assets-tests passed');
