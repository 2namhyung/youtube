import path from 'node:path';

export function historicalLedgerDecision({sourceLedActiveRoute, expectedPath, ledger, error}) {
  if (error) {
    if (sourceLedActiveRoute && error.code === 'ENOENT' && typeof error.path === 'string'
      && path.resolve(error.path) === path.resolve(expectedPath)) {
      return {status:'unavailable-non-production',productionAuthority:false,error:null};
    }
    return {status:'invalid',productionAuthority:false,error:`historical duplicate-renderer ledger missing or invalid: ${error.message}`};
  }
  if (ledger?.status !== 'invalid-duplicate-renderer' || ledger?.historical_only !== true
    || ledger?.excluded_from_current_render_authority !== true) {
    return {status:'invalid',productionAuthority:false,error:'historical specialized pair must remain isolated as invalid-duplicate-renderer'};
  }
  return {status:'isolated-historical-invalid-renderer',productionAuthority:false,error:null};
}
