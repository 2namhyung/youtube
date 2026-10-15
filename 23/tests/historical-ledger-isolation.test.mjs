import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {historicalLedgerDecision} from '../video/scripts/historical-ledger-isolation.mjs';

const valid={status:'invalid-duplicate-renderer',historical_only:true,excluded_from_current_render_authority:true};

test('only exact source-led ledger ENOENT is explicitly unavailable and non-production',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'historical-ledger-'));
  try{
    const expectedPath=path.join(dir,'missing.json');
    let missing;try{await readFile(expectedPath);}catch(error){missing=error;}
    const source=historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath,error:missing});
    assert.deepEqual(source,{status:'unavailable-non-production',productionAuthority:false,error:null});
    const legacy=historicalLedgerDecision({sourceLedActiveRoute:false,expectedPath,error:missing});
    assert.equal(legacy.status,'invalid');assert.match(legacy.error,/missing or invalid/u);
    const wrongPath=historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath:path.join(dir,'other.json'),error:missing});
    assert.equal(wrongPath.status,'invalid');
    const permission=historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath,error:{code:'EACCES',path:expectedPath,message:'permission denied'}});
    assert.equal(permission.status,'invalid');
    assert.match(permission.error,/permission denied/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('present valid isolation is accepted; malformed JSON and every false isolation field remain fatal',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'historical-ledger-'));
  try{
    const expectedPath=path.join(dir,'ledger.json');
    await writeFile(expectedPath,JSON.stringify(valid));
    const record=JSON.parse(await readFile(expectedPath,'utf8'));
    assert.deepEqual(historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath,ledger:record}),{status:'isolated-historical-invalid-renderer',productionAuthority:false,error:null});
    for(const field of ['status','historical_only','excluded_from_current_render_authority']){
      const bad={...record,[field]:false};
      const decision=historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath,ledger:bad});
      assert.equal(decision.status,'invalid',field);assert.match(decision.error,/must remain isolated/u);
    }
    await writeFile(expectedPath,'{"status":');
    let parseError;try{JSON.parse(await readFile(expectedPath,'utf8'));}catch(error){parseError=error;}
    const malformed=historicalLedgerDecision({sourceLedActiveRoute:true,expectedPath,error:parseError});
    assert.equal(malformed.status,'invalid');assert.match(malformed.error,/missing or invalid/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});
