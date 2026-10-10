#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const root = path.resolve(option('--root') || path.join(__dirname, '..'));
const sourceRef = option('--source-ref');
const recordSources = args.includes('--record')
  ? args.slice(args.indexOf('--record') + 1)
  : [];
if (args.includes('--record') && (!recordSources.length || sourceRef)) {
  throw new Error('Use --record with explicit source paths after translating them.');
}
const manifestPath = path.join(root, 'docs/zh-CN/translations.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = (text) =>
  createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const errors = [];
const known = new Set(manifest.entries.map((entry) => entry.source));
for (const source of recordSources) {
  if (!known.has(source)) errors.push(`Unknown source: ${source}`);
}
for (const entry of manifest.entries) {
  try {
    const source = fs.readFileSync(path.join(root, entry.source), 'utf8');
    const target = fs.readFileSync(path.join(root, entry.target), 'utf8');
    const sourceHash = hash(source);
    const translationHash = hash(target);
    if (!/[\u3400-\u9fff]/.test(target)) {
      errors.push(`Missing Chinese translation: ${entry.target}`);
    }
    if (recordSources.includes(entry.source)) {
      if (
        sourceHash !== entry.sourceSha256 &&
        translationHash === entry.translationSha256
      ) {
        errors.push(
          `Translate ${entry.target} before recording the changed English source.`,
        );
      } else {
        entry.sourceSha256 = sourceHash;
        entry.translationSha256 = translationHash;
      }
    } else if (sourceHash !== entry.sourceSha256) {
      errors.push(
        `Outdated translation: ${entry.target} (English changed: ${entry.source})`,
      );
    }
    if (sourceRef) {
      const upstream = execFileSync(
        'git',
        ['show', `${sourceRef}:${entry.upstreamSource}`],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      if (hash(upstream) !== sourceHash) {
        errors.push(`New English source on ${sourceRef}: ${entry.upstreamSource}`);
      }
    }
  } catch (error) {
    errors.push(`Cannot check ${entry.source} → ${entry.target}: ${error.message}`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  if (recordSources.length) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(
    `All ${manifest.entries.length} Chinese documents match their English source versions.`,
  );
}
