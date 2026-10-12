import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {prepareEpisodeAcquisition, buildAcquisitionQueueReport, readCandidateRows, DEFAULT_REGISTRY} from '../../src/lib/episode-official-acquisition.ts';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const reportPath = path.join(episodeDir, 'generated', 'acquisition-queue.json');
const newsRegistryPath = path.join(root, 'video', 'source-intake', 'episode-001', 'news', 'intake-registry.json');
const dryRun = process.argv.includes('--dry-run');
const reportOnly = process.argv.includes('--report-only');
const dbPath = process.env.ARCHIVE_DB_PATH || path.join(root, 'data', 'archive.sqlite');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(DEFAULT_REGISTRY, 'utf8'));
const newsRegistry = JSON.parse(fs.readFileSync(newsRegistryPath, 'utf8'));
const result = await prepareEpisodeAcquisition({dryRun: dryRun || reportOnly, officialRegistryPath: DEFAULT_REGISTRY, newsRegistryPath, dbPath});
if (!dryRun) {
  const report = buildAcquisitionQueueReport(spec, readCandidateRows(dbPath), {official: sha(DEFAULT_REGISTRY), news: sha(newsRegistryPath)}, sha(specPath), {official: registry.entries.map((entry) => entry.source_id), news: newsRegistry.entries.map((entry) => entry.source_id)});
  fs.mkdirSync(path.dirname(reportPath), {recursive: true});
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
const output = {
  ...result.official,
  news: result.news,
  created_media_ids: [...result.official.created_media_ids, ...result.news.created_media_ids],
  deduped: [...result.official.deduped, ...result.news.deduped],
  report_only: reportOnly,
  report_path: dryRun ? null : path.relative(root, reportPath).replaceAll('\\', '/'),
  report_written: !dryRun,
};
console.log(JSON.stringify(output, null, 2));
