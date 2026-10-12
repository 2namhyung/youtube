import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.resolve(here, '../..');
const runtimeRoot = path.join(automationRoot, 'production/motion-engines/nonhuman-runtime-v1');
const nodeModules = path.join(runtimeRoot, 'node_modules');
const outputRoot = path.join(automationRoot, 'out/studies/motion-tool-learning-v4-local-discovery-a');
const packageLock = JSON.parse(readFileSync(path.join(runtimeRoot, 'package-lock.json'), 'utf8'));
const ffmpegPath = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const posix = value => value.replaceAll('\\','/');
function importProbe(packageName) {
  try {
    execFileSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(packageName)})`],{cwd:runtimeRoot,stdio:['ignore','pipe','pipe']});
    return {command:'node --input-type=module -e await import(<package>)',networkAllowed:false,status:'passed',error:null};
  } catch (error) {
    const detail=String(error.stderr ?? error.message).split(/\r?\n/).find(Boolean) ?? 'unknown import failure';
    return {command:'node --input-type=module -e await import(<package>)',networkAllowed:false,status:'failed',error:detail};
  }
}

try { statSync(outputRoot); throw new Error(`append-only target already exists: ${outputRoot}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
mkdirSync(outputRoot, {recursive:true});

const packageTools = [
  {toolId:'gsap-html-v1', packageName:'gsap'},
  {toolId:'motion-canvas-v1', packageName:'@motion-canvas/core'},
  {toolId:'canvas-d3-v1', packageName:'d3'},
  {toolId:'lottie-web-v1', packageName:'lottie-web'},
  {toolId:'dotlottie-web-v1', packageName:'@lottiefiles/dotlottie-web'},
];

function walk(root, current=root, output=[]) {
  for (const entry of readdirSync(current, {withFileTypes:true})) {
    const file = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(root, file, output);
    else if (entry.isFile()) output.push(posix(path.relative(root,file)));
  }
  return output;
}

function licenseFile(packageRoot) {
  return readdirSync(packageRoot).find(name => /^(license|copying|notice)(\.|$)/i.test(name)) ?? null;
}

function repositoryUrl(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (!raw) return null;
  return raw.replace(/^git\+/,'').replace(/\.git$/,'');
}

const tools = [];
for (const spec of packageTools) {
  const packageRoot = path.join(nodeModules, ...spec.packageName.split('/'));
  const packageJsonPath = path.join(packageRoot,'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath,'utf8'));
  const lock = packageLock.packages[`node_modules/${spec.packageName}`] ?? {};
  const rootReal = realpathSync(packageRoot);
  const candidates = walk(packageRoot).filter(file => {
    if (spec.packageName === 'lottie-web') return /^test\/animations\//i.test(file);
    return /^(examples?|demos?|samples?|fixtures?|tests?)\//i.test(file);
  }).map(file => {
    const absolute = path.join(packageRoot, ...file.split('/'));
    const extension = path.extname(file).toLowerCase();
    const mediaType = ({'.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[extension] ?? null;
    const preRenderedMotion = ['.mp4','.webm','.gif'].includes(extension);
    return {file, sha256:sha256(absolute), bytes:statSync(absolute).size, kind:preRenderedMotion ? 'pre-rendered-motion-media' : ['.png','.jpg','.jpeg'].includes(extension) ? 'supporting-raster-not-motion-reference' : ['.json','.lottie'].includes(extension) ? 'declarative-animation-data' : 'source-or-support', mediaType};
  });
  const licenseName = licenseFile(packageRoot);
  const commit = typeof packageJson.gitHead === 'string' && /^[0-9a-f]{40}$/i.test(packageJson.gitHead) ? packageJson.gitHead.toLowerCase() : null;
  const repository = repositoryUrl(packageJson.repository);
  const preRendered = candidates.filter(candidate => candidate.kind === 'pre-rendered-motion-media');
  const runtimeProbe = importProbe(spec.packageName);
  const blockers = [];
  if (!candidates.length) blockers.push('no-distributed-official-example-or-demo-artifact');
  if (!preRendered.length) blockers.push('no-official-pre-rendered-motion-media; distributed source/data remains source-only and cannot execute');
  if (!commit) blockers.push('exact-upstream-source-commit-unavailable-in-installed-package');
  if (!repository) blockers.push('official-repository-url-unavailable');
  if (!licenseName) blockers.push('standalone-license-artifact-unavailable');
  if (runtimeProbe.status !== 'passed') blockers.push('pinned-runtime-direct-import-probe-failed');
  tools.push({
    toolId:spec.toolId,
    package:{name:packageJson.name,version:packageJson.version,packageJson:{file:posix(path.relative(automationRoot,packageJsonPath)),sha256:sha256(packageJsonPath),bytes:statSync(packageJsonPath).size},repository,gitHead:commit,tarballUrl:lock.resolved ?? null,integrity:lock.integrity ?? null,physicalNonSymlink:!lstatSync(packageRoot).isSymbolicLink(),containedRealpath:rootReal.startsWith(`${realpathSync(nodeModules)}${path.sep}`),runtimeProbe},
    license:licenseName ? {label:packageJson.license ?? null,file:posix(path.relative(automationRoot,path.join(packageRoot,licenseName))),sha256:sha256(path.join(packageRoot,licenseName)),bytes:statSync(path.join(packageRoot,licenseName)).size} : {label:packageJson.license ?? null,file:null,sha256:null,bytes:null},
    distributedCandidates:candidates,
    discoveryStatus:blockers.length ? 'blocked' : 'candidate-needs-license-review',
    blockers,
  });
}

const ffmpegVersion = execFileSync(ffmpegPath,['-version'],{encoding:'utf8'}).split(/\r?\n/)[0];
tools.push({toolId:'ffmpeg-layer-keyframes-v1',runtime:{file:ffmpegPath,sha256:sha256(ffmpegPath),bytes:statSync(ffmpegPath).size,versionLine:ffmpegVersion,physicalNonSymlink:!lstatSync(ffmpegPath).isSymbolicLink()},distributedCandidates:[],discoveryStatus:'blocked',blockers:['ffmpeg-runtime-distribution-has-no-official-pre-rendered-example-media-bound-to-a-filter-mechanic','exact-example-source-commit-unavailable','example-license-artifact-unavailable']});

const existingCatalog = path.join(automationRoot,'production/motion-assets/evidence-motion-v2/manifest.json');
const designFiles = ['official-reference-admission.schema.json','layout-motion-score-v1.json'].map(file => ({file:`studies/motion-tool-learning-v4/${file}`,sha256:sha256(path.join(here,file))}));
const manifest = {
  schema:'motion-tool-learning-v4-local-discovery-v1',
  createdAt:new Date().toISOString(),
  scope:'local pinned packages and binaries only; no network or download',
  canonicalBoundary:'downloaded examples, fixtures, and templates remain source-only and are never executed',
  admissionRule:'Only exact official pre-rendered media with a 40-hex upstream commit, commit-pinned source URL, exact license bytes, approved license review, and exact artifact hash can become a v4 visual reference.',
  noNetwork:true,
  providersInvoked:[],
  packageLock:{file:posix(path.relative(automationRoot,path.join(runtimeRoot,'package-lock.json'))),sha256:sha256(path.join(runtimeRoot,'package-lock.json'))},
  designFiles,
  existingSourceOnlyCatalog:statSync(existingCatalog).isFile() ? {file:posix(path.relative(automationRoot,existingCatalog)),sha256:sha256(existingCatalog),status:'source-only-not-admitted; mutable main/master source URLs and no pre-rendered official-media binding must fail closed'} : null,
  tools,
  summary:{tools:tools.length,readyTools:tools.filter(tool=>tool.discoveryStatus!=='blocked').length,blockedTools:tools.filter(tool=>tool.discoveryStatus==='blocked').length,v4TrainingReady:false},
};
writeFileSync(path.join(outputRoot,'local-discovery.manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
process.stdout.write(`${JSON.stringify(manifest.summary,null,2)}\n`);
