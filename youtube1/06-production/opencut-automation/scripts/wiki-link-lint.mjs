import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'wiki');
const files = [];
const visit = (directory) => {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name); const info = fs.lstatSync(file);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) visit(file);
    else if (name.endsWith('.md')) files.push(file);
  }
};
visit(root);

const broken = [];
for (const file of files) {
  const markdown = fs.readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^[a-z]+:/iu.test(rawTarget)) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(rawTarget));
    if (!fs.existsSync(target)) broken.push(`${path.relative(root, file)} -> ${match[1]}`);
  }
}

const index = fs.readFileSync(path.join(root, 'index.md'), 'utf8');
const indexed = new Set([...index.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/gu)].map((match) => path.normalize(path.relative(root, path.resolve(root, match[1])))));
const orphans = files.map((file) => path.relative(root, file)).filter((file) => !['index.md', 'log.md'].includes(file) && !indexed.has(path.normalize(file)));
if (broken.length || orphans.length) throw new Error(`Wiki link lint failed\nbroken:\n${broken.join('\n')}\norphans:\n${orphans.join('\n')}`);
process.stdout.write(`wiki-link-lint passed (${files.length} Markdown files, 0 broken links, 0 orphans)\n`);
