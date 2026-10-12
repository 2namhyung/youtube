import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildAcquisitionQueueReport, comparableAcquisitionQueueReport, readCandidateRows, validateRegisteredCandidates, validateNewsCandidates} from '../../src/lib/episode-official-acquisition.ts';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const reportPath = path.join(episodeDir, 'generated', 'acquisition-queue.json');
const registryPath = path.join(root, 'video', 'source-intake', 'episode-001', 'official', 'intake-registry.json');
const newsRegistryPath = path.join(root, 'video', 'source-intake', 'episode-001', 'news', 'intake-registry.json');
const dbPath = process.env.ARCHIVE_DB_PATH || path.join(root, 'data', 'archive.sqlite');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const failures = [];
if (!fs.existsSync(specPath)) failures.push(`missing episode spec: ${path.relative(root, specPath)}`);
if (!fs.existsSync(registryPath)) failures.push(`missing official intake registry: ${path.relative(root, registryPath)}`);
if (!fs.existsSync(newsRegistryPath)) failures.push(`missing news intake registry: ${path.relative(root, newsRegistryPath)}`);
if (!fs.existsSync(reportPath)) failures.push(`missing acquisition queue: ${path.relative(root, reportPath)}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const newsRegistry = JSON.parse(fs.readFileSync(newsRegistryPath, 'utf8'));
const actual = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const specSha = sha(specPath);
const registrySha = {official: sha(registryPath), news: sha(newsRegistryPath)};
const sourceGroups = {official: registry.entries.map((entry) => entry.source_id), news: newsRegistry.entries.map((entry) => entry.source_id)};
const expected = buildAcquisitionQueueReport(spec, readCandidateRows(dbPath), registrySha, specSha, sourceGroups);
const actualComparable = comparableAcquisitionQueueReport(actual);
const expectedComparable = comparableAcquisitionQueueReport(expected);
if (actual._generated?.spec_sha256 !== specSha) failures.push(`queue spec hash drift: ${actual._generated?.spec_sha256 ?? 'missing'} != ${specSha}`);
if (JSON.stringify(actual._generated?.registry_sha256) !== JSON.stringify(registrySha)) failures.push(`queue registry hash drift: ${JSON.stringify(actual._generated?.registry_sha256) ?? 'missing'} != ${JSON.stringify(registrySha)}`);
if (JSON.stringify(actualComparable) !== JSON.stringify(expectedComparable)) failures.push('acquisition queue candidate snapshot/report semantics drifted; regenerate with pnpm video:prepare-acquisition');
try {
  await validateRegisteredCandidates({registryPath, dbPath, rawRoot: process.env.ARCHIVE_RAW_ROOT});
  await validateNewsCandidates({registryPath: newsRegistryPath, dbPath, rawRoot: process.env.ARCHIVE_RAW_ROOT});
} catch (error) {
  failures.push(`official candidate integrity: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({status: 'valid', episode_id: actual.episode_id, spec_sha256: specSha, registry_sha256: registrySha, official_candidate_summary: actual.summary?.official_candidate_summary ?? null, news_candidate_summary: actual.summary?.news_candidate_summary ?? null, candidate_summary: actual.summary?.candidate_summary ?? null}));
