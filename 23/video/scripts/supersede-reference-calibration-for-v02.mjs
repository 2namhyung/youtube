import {validateReferenceCorrection} from './validate-reference-correction-v02.mjs';

if(process.argv.length!==2)throw new Error('reference correction is already applied; refresh or alternate mutation routes are forbidden');

const result=await validateReferenceCorrection({verifyMedia:false});
process.stdout.write(`reference correction already applied; historical v02 chain validated; no files changed; ${result.active_samples} PASS and sample${result.excluded_sample} excluded\n`);
