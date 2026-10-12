import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {validateCanonicalReferenceTransferGate} from './reference-transfer-gate-contract.mjs';

const supported = new Set(['--contract', '--state', '--spec', '--grammar-contract']);
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  const value = process.argv[index + 1];
  if (!supported.has(flag) || !value || value.startsWith('--')) throw new Error(`unsupported or incomplete CLI option: ${flag}`);
  if (flag === '--contract') options.contract = value;
  if (flag === '--state') options.state = value;
  if (flag === '--spec') options.spec = value;
  if (flag === '--grammar-contract') options.grammar = value;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = await validateCanonicalReferenceTransferGate(options);
  if (!result.ok) {
    console.error(`Reference transfer gate validation failed (${result.failures.length})`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Reference transfer gates valid: calibration 01-09 PASS and sample10 exclusion preserved; source approval/materialization is current; family/sample quotas have no production authority.');
  }
}
