#!/usr/bin/env node
/**
 * Bump FT_BUILD across PWA + service worker + asset ?v= tags.
 * Usage: node scripts/bump-build.mjs [versionNumber]
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const ver = parseInt(process.argv[2] || '78', 10);
if (!Number.isFinite(ver) || ver < 1) {
  console.error('Usage: node scripts/bump-build.mjs <number>');
  process.exit(1);
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const time = now.toTimeString().slice(0, 5);
const stamp = `v${ver} · ${date} ${time}`;
const cache = `ft-v${ver}`;

const buildIdJs = `'use strict';
/** Single source for cache bust — run \`node scripts/bump-build.mjs\` after JS/HTML changes. */
window.FT_BUILD = {
  ver: ${ver},
  stamp: '${stamp}',
  cache: '${cache}',
};
`;

fs.writeFileSync(path.join(root, 'build-id.js'), buildIdJs, 'utf8');

const swPath = path.join(root, 'service-worker.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE = 'ft-v\d+'/, `const CACHE = '${cache}'`);
fs.writeFileSync(swPath, sw, 'utf8');

function bumpHtml(file) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/var BUILD_VERSION\s*=\s*'[^']+'/, `var BUILD_VERSION    = '${stamp}'`);
  s = s.replace(/(<span id="ft-build-stamp"[^>]*>)[^<]+(<\/span>)/, `$1${stamp}$2`);
  s = s.replace(/\?v=\d+/g, `?v=${ver}`);
  if (!s.includes('build-id.js')) {
    s = s.replace(
      /<script src="(?:\.\.\/)?build-id\.js/,
      `<script src="build-id.js?v=${ver}"></script>\n<script src="shared/app.js`
    );
  }
  fs.writeFileSync(file, s, 'utf8');
}

bumpHtml(path.join(root, 'index.html'));
bumpHtml(path.join(root, 'finance-tracker-chrome', 'app.html'));

console.log(`Bumped to ${stamp} (${cache})`);
