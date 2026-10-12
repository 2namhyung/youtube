import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const validator = path.join(root, 'video', 'scripts', 'validate-motion-grammar-catalog-v01.mjs');
const canonical = {
  contract: path.join(episodeDir, 'reference-style-gates.json'),
  state: path.join(episodeDir, 'production-state.json'),
  spec: path.join(episodeDir, 'episode-spec.json'),
  grammarContract: path.join(episodeDir, 'reference-grammar-contract.json'),
  motionCatalog: path.join(root, 'video', 'qa', 'reference-study', 'vox-primary', 'motion-grammar-v01', 'motion-grammar-catalog.json'),
};
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const validate = ({grammarContract = canonical.grammarContract, motionCatalog = canonical.motionCatalog} = {}) => spawnSync(process.execPath, [
  validator,
  '--grammar-contract', grammarContract,
  '--motion-catalog', motionCatalog,
], {cwd: root, encoding: 'utf8', windowsHide: true});

test('motion grammar catalog canonical assertion follows calibration approval state', async () => {
  const canonicalGrammar = JSON.parse(await readFile(canonical.grammarContract, 'utf8'));
  const currentState = JSON.parse(await readFile(canonical.state, 'utf8'));
  assert.equal(currentState.reference_calibration?.approval_route, 'motion-reverse-engineering-review-v02');
  if (currentState.reference_calibration?.status === 'reference-calibration-passed') {
    assert.equal(canonicalGrammar.status, 'approved-human-grammar');
    assert.ok(canonicalGrammar.approved_subset.length > 0);
  } else {
    assert.equal(canonicalGrammar.status, 'pending-human-grammar-approval');
    assert.deepEqual(canonicalGrammar.categories.motion_operator, []);
  }
});

test('motion grammar catalog retains isolated pre-approval fixture coverage', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), '23jung-motion-catalog-'));
  t.after(async () => rm(directory, {recursive: true, force: true}));
  const canonicalCatalog = JSON.parse(await readFile(canonical.motionCatalog, 'utf8'));
  const canonicalGrammar = JSON.parse(await readFile(canonical.grammarContract, 'utf8'));
  const bindPendingCatalog = (grammar, catalogFile, catalogBytes) => {
    const catalogRecord = {path: relative(catalogFile), sha256: sha256(catalogBytes)};
    const pendingById = new Map((grammar.pending_evidence_entries ?? []).map((entry) => [entry.grammar_id, entry]));
    for (const entry of canonicalCatalog.entries) {
      const pending = pendingById.get(entry.grammar_id) ?? {category: entry.category, grammar_id: entry.grammar_id, reason: 'historical isolated catalog validation', required_evidence: ['isolated catalog evidence']};
      pending.status = 'pending_evidence';
      pending.evidence_catalog = catalogRecord;
      pending.evidence_entry_id = pending.grammar_id;
      if (!pendingById.has(entry.grammar_id)) grammar.pending_evidence_entries.push(pending);
    }
  };
  const canonicalCatalogBytes = await readFile(canonical.motionCatalog);
  const isolatedGrammar = structuredClone(canonicalGrammar);
  const catalogIds = new Set(canonicalCatalog.entries.map((entry) => entry.grammar_id));
  isolatedGrammar.status = 'pending-human-grammar-approval';
  isolatedGrammar.approval_marker = null;
  isolatedGrammar.calibration_approval_marker = null;
  isolatedGrammar.approved_review_package = null;
  for (const category of ['motion_operator', 'transition_operator', 'treatment']) isolatedGrammar.categories[category] = (isolatedGrammar.categories[category] ?? []).filter((entry) => !catalogIds.has(entry.grammar_id));
  isolatedGrammar.bindings = (isolatedGrammar.bindings ?? []).filter((entry) => !catalogIds.has(entry.grammar_id));
  isolatedGrammar.approved_subset = (isolatedGrammar.approved_subset ?? []).filter((id) => !catalogIds.has(id));
  bindPendingCatalog(isolatedGrammar, canonical.motionCatalog, canonicalCatalogBytes);
  const isolatedGrammarFile = path.join(directory, 'isolated-v01-catalog-grammar.json');
  await writeFile(isolatedGrammarFile, JSON.stringify(isolatedGrammar));
  const isolatedBaseline = validate({grammarContract: isolatedGrammarFile});
  assert.equal(isolatedBaseline.status, 0, isolatedBaseline.stderr || isolatedBaseline.stdout);
  const historicalCatalog = structuredClone(canonicalCatalog);
  historicalCatalog.entries[0].frames.end = structuredClone(historicalCatalog.entries[0].frames.start);
  const isolatedCatalogFile = path.join(directory, 'superseded-v01-catalog.json');
  await writeFile(isolatedCatalogFile, JSON.stringify(historicalCatalog));
  const isolatedResult = validate({grammarContract: isolatedGrammarFile, motionCatalog: isolatedCatalogFile});
  assert.notEqual(isolatedResult.status, 0, 'historical v01 catalog adversarial checks must still run in isolated validation');
  assert.match(`${isolatedResult.stdout}\n${isolatedResult.stderr}`, /stored frame is not raw-RGBA identical|start\/end must prove meaningful non-identical motion/u);

  const runMutation = async (name, mutateCatalog, mutateGrammar, expected) => {
    const catalog = structuredClone(canonicalCatalog);
    const grammar = structuredClone(isolatedGrammar);
    await mutateCatalog?.(catalog);
    mutateGrammar?.(grammar);
    const catalogFile = path.join(directory, `${name}-catalog.json`);
    const catalogBytes = Buffer.from(JSON.stringify(catalog));
    await writeFile(catalogFile, catalogBytes);
    bindPendingCatalog(grammar, catalogFile, catalogBytes);
    const grammarFile = path.join(directory, `${name}-grammar.json`);
    await writeFile(grammarFile, JSON.stringify(grammar));
    const result = validate({grammarContract: grammarFile, motionCatalog: catalogFile});
    assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
    assert.match(`${result.stdout}\n${result.stderr}`, expected);
  };

  await runMutation('single-still-fake', (catalog) => {
    catalog.entries[0].frames.end = structuredClone(catalog.entries[0].frames.start);
  }, null, /stored frame is not raw-RGBA identical|start\/end must prove meaningful non-identical motion/u);

  await runMutation('identical-start-end-timecode', (catalog) => {
    catalog.entries[1].timecodes.end = catalog.entries[1].timecodes.start;
  }, null, /strict forward start\/mid\/end timecodes/u);

  await runMutation('timecode-frame-mismatch', (catalog) => {
    catalog.entries[0].timecodes.mid = '00:00:05.500';
  }, null, /stored frame is not raw-RGBA identical to the locked source timecode/u);

  await runMutation('unknown-source', (catalog) => {
    catalog.source.path = 'raw/inbox/not-the-locked-reference.mp4';
  }, null, /source path\/hash\/kind must match the frozen grammar source/u);

  await runMutation('automatic-approval', (catalog) => {
    catalog.status = 'approved-human-motion-grammar';
    catalog.approval_marker = {path: 'automatic.json', sha256: '0'.repeat(64)};
    catalog.entries[0].human_approval = {status: 'approved', approved: true, marker: catalog.approval_marker};
  }, null, /must remain pending, non-production calibration evidence|pending human approval state is required/u);

  await runMutation('human-pending-active-binding', null, (grammar) => {
    grammar.categories.motion_operator.push({grammar_id: 'staggered-object-accumulation'});
  }, /human-pending catalog candidate cannot be active grammar/u);

  await runMutation('unrelated-review-clip', (catalog) => {
    catalog.entries[0].review_clip = structuredClone(catalog.entries[1].review_clip);
  }, null, /source range and decoded frame count|first\/last decoded frames must be byte-identical/u);

  await runMutation('interior-frame-tamper', async (catalog) => {
    const entry = catalog.entries[0];
    const clipFile = path.join(directory, 'interior-frame-tamper.mp4');
    const changed = spawnSync('ffmpeg', ['-v', 'error', '-i', path.resolve(root, entry.review_clip.path), '-vf', "drawbox=x=0:y=0:w=40:h=40:color=red@1:t=fill:enable='eq(n,10)'", '-an', '-c:v', 'libx264rgb', '-crf', '0', '-pix_fmt', 'rgb24', '-vsync', '0', '-y', clipFile], {cwd: root, encoding: 'utf8', windowsHide: true});
    assert.equal(changed.status, 0, changed.stderr);
    entry.review_clip.path = relative(clipFile);
    entry.review_clip.sha256 = sha256(await readFile(clipFile));
  }, null, /every decoded frame must be byte-identical to the complete bound source range/u);

  await runMutation('unrelated-contact-sheet', (catalog) => {
    catalog.entries[0].contact = structuredClone(catalog.entries[1].contact);
  }, null, /panel pixels must derive exactly from the bound/u);

  await runMutation('contact-header-tamper', async (catalog) => {
    const record = catalog.entries[0].contact;
    const file = path.join(directory, 'contact-header-tamper.png');
    const overlay = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="60"><rect width="500" height="60" fill="#d8cdb8"/><text x="10" y="38" font-size="24">APPROVED</text></svg>');
    await sharp(path.resolve(root, record.path)).composite([{input: overlay, left: 60, top: 10}]).png().toFile(file);
    record.path = relative(file);
    record.sha256 = sha256(await readFile(file));
  }, null, /full contact image including labels and background/u);

  await runMutation('unrelated-review-board', async (catalog) => {
    const boardFile = path.join(directory, 'unrelated-board.png');
    await sharp({create: {width: 1920, height: 760, channels: 4, background: '#eee7da'}}).png().toFile(boardFile);
    catalog.human_review_board.path = relative(boardFile);
    catalog.human_review_board.sha256 = sha256(await readFile(boardFile));
  }, null, /must derive exactly from its bound contact sheet/u);

  await runMutation('board-header-tamper', async (catalog) => {
    const record = catalog.human_review_board;
    const file = path.join(directory, 'board-header-tamper.png');
    const overlay = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="70"><rect width="1000" height="70" fill="#eee7da"/><text x="10" y="44" font-size="30">HUMAN APPROVED</text></svg>');
    await sharp(path.resolve(root, record.path)).composite([{input: overlay, left: 20, top: 5}]).png().toFile(file);
    record.path = relative(file);
    record.sha256 = sha256(await readFile(file));
  }, null, /full board including title and background/u);

  await runMutation('hard-cut-nonadjacent-boundary', (catalog) => {
    const hardCut = catalog.entries.find((entry) => entry.grammar_id === 'hard-cut');
    hardCut.timecodes.start = '00:00:12.300';
  }, null, /hard-cut proof requires three adjacent source frames/u);

  await runMutation('delete-frozen-rejection', (catalog) => {
    catalog.rejected_or_pending_observations.pop();
  }, null, /rejected\/pending overclaim records are frozen/u);

  await runMutation('weaken-frozen-rejection-reason', (catalog) => {
    catalog.rejected_or_pending_observations[0].reason = 'Probably fine.';
    catalog.rejected_or_pending_observations[0].required_next_evidence = [];
  }, null, /rejected\/pending overclaim records are frozen/u);
});
