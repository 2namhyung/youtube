import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {auditEditorialRouting} from './editorial-route-contract.mjs';

const workspace = process.cwd();
const defaultSpec = path.join(workspace, 'video', 'episodes', 'episode-001', 'episode-spec.json');

function parseArgs(argv) {
  const options = {spec: defaultSpec, output: null, check: false};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--spec' || argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      options[argument === '--spec' ? 'spec' : 'output'] = path.resolve(workspace, value);
      index += 1;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function isInsideWorkspace(filePath) {
  const relative = path.relative(workspace, filePath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node video/scripts/validate-editorial-routing.mjs [--spec path] [--output path] [--check]\n');
    return;
  }

  if (options.output) {
    if (!isInsideWorkspace(options.output)) throw new Error('--output must resolve to a file inside the workspace');
    const reviewRelative = path.relative(path.join(workspace, 'video', 'qa'), options.output);
    if (!reviewRelative || reviewRelative.startsWith('..') || path.isAbsolute(reviewRelative) || path.extname(options.output) !== '.json') {
      throw new Error('--output must be a JSON review report under video/qa; source and production inputs are immutable to this audit');
    }
    if (path.resolve(options.output) === path.resolve(options.spec)) throw new Error('--output must not overwrite the episode spec');
    if (['episode-spec.json', 'production-state.json'].includes(path.basename(options.output).toLowerCase())) {
      throw new Error('--output must not target an episode spec or production state file');
    }
  }

  const specBytes = await readFile(options.spec);
  const spec = JSON.parse(specBytes.toString('utf8'));
  const report = {...auditEditorialRouting(spec), source_spec_sha256: createHash('sha256').update(specBytes).digest('hex')};
  const reportText = `${JSON.stringify(report, null, options.output ? 2 : 0)}\n`;
  if (options.output) {
    await mkdir(path.dirname(options.output), {recursive: true});
    await writeFile(options.output, reportText, 'utf8');
    process.stdout.write(`Editorial routing report written to ${path.relative(workspace, options.output)} (${report.errors.length} errors, ${report.warnings.length} review warnings).\n`);
  } else {
    process.stdout.write(reportText);
  }

  if (options.check && report.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Editorial routing audit failed: ${error.message}\n`);
  process.exitCode = 1;
});
