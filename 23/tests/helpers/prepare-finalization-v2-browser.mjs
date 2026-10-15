// Run only when explicitly starting a fresh browser acceptance. This creates
// an isolated synthetic Temp mirror and stops before any finalization job.
import assert from 'node:assert/strict';
import {createCanonicalExportFixture,prepareCanonicalExportInputs,runFixtureGate} from './canonical-export-fixture.mjs';

assert.equal(process.argv.length,2,'No existing fixture may be reused by the v2 browser preparation launcher');
const fixture=createCanonicalExportFixture();
try{
  prepareCanonicalExportInputs(fixture);
  runFixtureGate(fixture,process.execPath,['tests/helpers/canonical-export-child.mjs']);
  runFixtureGate(fixture,process.execPath,['video/scripts/generate-render-catalog.mjs']);
  runFixtureGate(fixture,process.execPath,['video/scripts/validate-production-stage.mjs','--lock','cut-review-approved']);
  runFixtureGate(fixture,process.execPath,['video/scripts/validate-render-authority.mjs']);
  runFixtureGate(fixture,process.execPath,['tests/helpers/canonical-export-child.mjs','--pipeline','--mix-v2','--prepare-browser']);
  process.stdout.write(JSON.stringify({prepared:true,fixtureRoot:fixture.root,preparedProof:`${fixture.root}/prepared-finalization-v2-browser.json`,technicalProof:fixture.proofPath})+'\n');
}catch(error){
  process.stderr.write(JSON.stringify({prepared:false,fixtureRoot:fixture.root,technicalProof:fixture.proofPath,error:error instanceof Error?error.message:String(error)})+'\n');
  process.exitCode=1;
}
