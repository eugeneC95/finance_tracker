#!/usr/bin/env node
/**
 * Rewrites the <<<MEMO_AUTO_SUMMARY>>> … <<<END_MEMO_AUTO_SUMMARY>>> block in memo.txt
 * from `git log` (newest first). Run manually or from hooks/post-commit.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const memoPath = join(root, 'memo.txt');

let log;
try {
  log = execSync(
    'git log -18 --pretty=format:"%h %x09%s %x09%ad" --date=short',
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
} catch (e) {
  process.stderr.write('update-memo-summary: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(0);
}

const lines = log
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const parts = l.split('\t').map((s) => s.trim());
    if (parts.length >= 3) return '  - ' + parts[0] + ' (' + parts[2] + ') ' + parts[1];
    return '  - ' + l.trim();
  })
  .join('\n');

const gen = new Date().toISOString();
const block = `<<<MEMO_AUTO_SUMMARY>>>
Generated: ${gen}

Recent commits (newest first):
${lines || '  (no commits)'}
<<<END_MEMO_AUTO_SUMMARY>>>`;

let text;
try {
  text = readFileSync(memoPath, 'utf8');
} catch (e) {
  process.stderr.write('update-memo-summary: memo.txt missing: ' + e.message + '\n');
  process.exit(1);
}

const re = /<<<MEMO_AUTO_SUMMARY>>>[\s\S]*?<<<END_MEMO_AUTO_SUMMARY>>>/;
if (re.test(text)) {
  text = text.replace(re, block);
} else {
  const needle = /^(Last updated:.*\n)/m;
  if (needle.test(text)) {
    text = text.replace(needle, `$1\n${block}\n`);
  } else {
    text = `${block}\n\n${text}`;
  }
}

writeFileSync(memoPath, text, 'utf8');
process.stdout.write('memo.txt: refreshed MEMO_AUTO_SUMMARY\n');
