import {validateCanonicalProductionAuthoring} from './production-authoring-contract.mjs';

const result = await validateCanonicalProductionAuthoring();
if (!result.ok) {
  console.error(`Production authoring contract validation failed (${result.failures.length})`);
  for (const failure of result.failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Production authoring route valid: ${result.route}`);
  console.log(`episode-spec SHA-256: ${result.spec_sha256}`);
  console.log('Historical roots remain non-production; active_cut_root may remain null during timing-draft.');
}
