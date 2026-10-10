const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const script = path.join(__dirname, 'check-zh-docs.cjs');
const hash = (text) => createHash('sha256').update(text).digest('hex');

test('detects untranslated English edits and checks the actual master source', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-docs-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs/zh-CN'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.en.md'), '# English\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# 中文\n');
  fs.writeFileSync(
    path.join(root, 'docs/zh-CN/translations.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          source: 'README.en.md',
          upstreamSource: 'README.md',
          target: 'README.md',
          sourceSha256: hash('# English\n'),
          translationSha256: hash('# 中文\n'),
        },
      ],
    }),
  );
  const run = (...args) =>
    spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  fs.writeFileSync(path.join(root, 'README.en.md'), '# English\r\n');
  assert.equal(run().status, 0, 'Windows newlines must not appear as outdated content');
  fs.writeFileSync(path.join(root, 'README.en.md'), '# English changed\n');
  assert.equal(run().status, 1);
  assert.match(run('--record', 'README.en.md').stderr, /Translate/);
  fs.writeFileSync(path.join(root, 'README.md'), '# 已更新中文\n');
  assert.equal(run('--record', 'README.en.md').status, 0);
  assert.equal(run().status, 0);

  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '--initial-branch=master');
  git('config', 'user.name', 'Documentation test');
  git('config', 'user.email', 'test@example.invalid');
  const chinese = fs.readFileSync(path.join(root, 'README.md'));
  fs.writeFileSync(path.join(root, 'README.md'), '# English changed\n');
  git('add', 'README.md');
  git('commit', '-m', 'English source fixture');
  fs.writeFileSync(path.join(root, 'README.md'), chinese);
  assert.equal(run('--source-ref', 'master').status, 0);
  fs.writeFileSync(path.join(root, 'README.md'), '# Later English edit\n');
  git('add', 'README.md');
  git('commit', '-m', 'Later English change');
  fs.writeFileSync(path.join(root, 'README.md'), chinese);
  assert.equal(run('--source-ref', 'master').status, 1);
  assert.match(run('--source-ref', 'master').stderr, /New English source/);
});
