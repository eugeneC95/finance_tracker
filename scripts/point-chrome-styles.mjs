#!/usr/bin/env node
/** Point chrome app.html at shared styles/ (same as PWA). */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'finance-tracker-chrome', 'app.html');
let s = fs.readFileSync(file, 'utf8');
const start = s.indexOf('<style>');
const end = s.indexOf('</style>');
if (start < 0 || end < 0) {
  console.log('chrome app.html: no inline style block, skip');
  process.exit(0);
}

const verMatch = s.match(/theme-modern\.css\?v=(\d+)/);
const ver = verMatch ? verMatch[1] : '128';

const links = [
  '../styles/reset.css',
  '../styles/tokens.css',
  '../styles/base.css',
  '../styles/components.css',
  '../styles/mobile.css',
  '../theme-modern.css',
].map(href => `<link rel="stylesheet" href="${href}?v=${ver}"/>`).join('\n');

s = s.slice(0, start) + links + '\n' + s.slice(end + '</style>'.length);
s = s.replace(/\n<link rel="stylesheet" href="\.\.\/theme-modern\.css\?v=\d+"\/>/, '');
fs.writeFileSync(file, s, 'utf8');
console.log('chrome app.html now uses shared styles/');
