import assert from 'node:assert/strict';
import test from 'node:test';
import {planKoreanOfficialRoute} from '../video/scripts/korean-official-route-planner.mjs';

test('maps institutional briefs to an allowlisted Korean official route',()=>{
  const plan=planKoreanOfficialRoute({subject:'경찰서 민원실',action:'수사관이 기록을 접수',place_context:'대한민국 경찰서',queries:[]},'video');
  assert.equal(plan.route_id,'national-police-official');
  assert.deepEqual(plan.allowed_hosts,['www.police.go.kr','police.go.kr']);
  assert.equal(plan.production_authority,false);
  assert.ok(plan.required_evidence.includes('item_level_rights'));
});

test('does not invent an institution for a generic object',()=>{
  const plan=planKoreanOfficialRoute({subject:'빈 봉투',action:'책상 위에 놓임',queries:[]},'photo');
  assert.equal(plan.status,'unresolved-official-route');
  assert.equal(plan.route_id,undefined);
});
