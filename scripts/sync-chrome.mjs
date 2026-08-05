#!/usr/bin/env node
/**
 * Verify Chrome extension uses shared JS (no duplicate copies to sync).
 * Run after editing shared/*.js — extension loads ../shared/ via script tags in app.html.
 *
 * Usage: node scripts/sync-chrome.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const chromeDir = path.join(root, 'finance-tracker-chrome');
const sharedDir = path.join(root, 'shared');

const requiredInAppHtml = [
  '../shared/app.js',
  '../shared/sync.js',
  '../shared/features.js',
  '../shared/extras.js',
  '../shared/receipts.js',
];

const appHtml = path.join(chromeDir, 'app.html');
if (!fs.existsSync(appHtml)) {
  console.error('Missing finance-tracker-chrome/app.html');
  process.exit(1);
}
const html = fs.readFileSync(appHtml, 'utf8');
const missing = requiredInAppHtml.filter((src) => !html.includes(src));
if (missing.length) {
  console.error('app.html missing shared script tags:');
  missing.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

const staleCopies = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^(app|sync|features|extras|import-inline|receipts)\.js$/.test(name)) {
      staleCopies.push(path.relative(root, p));
    }
  }
}
walk(chromeDir);

if (staleCopies.length) {
  console.warn('Stale duplicate JS in extension folder (remove if unused):');
  staleCopies.forEach((f) => console.warn('  ' + f));
}

const sharedFiles = fs.readdirSync(sharedDir).filter((f) => f.endsWith('.js'));
console.log('Chrome extension loads ' + sharedFiles.length + ' shared modules from ../shared/');
console.log('OK — no copy step needed; bump build after shared JS changes.');
