#!/usr/bin/env node
/**
 * Extract inline <style> from index.html into styles/*.css
 * Run: node scripts/extract-styles.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const start = html.indexOf('<style>');
const end = html.indexOf('</style>');
if (start < 0 || end < 0) {
  console.error('No <style> block in index.html');
  process.exit(1);
}

const css = html.slice(start + '<style>'.length, end).replace(/^\n/, '').replace(/\n$/, '');
const lines = css.split('\n');

const markers = [
  { file: 'tokens.css', match: 'DESIGN TOKENS' },
  { file: 'base.css', match: 'LAYOUT SHELL' },
  { file: 'components.css', match: 'SIDEBAR' },
  { file: 'mobile.css', match: 'PWA RESPONSIVE' },
];

const stylesDir = path.join(root, 'styles');
fs.mkdirSync(stylesDir, { recursive: true });

// Reset block before tokens
const resetEnd = lines.findIndex(l => l.includes('DESIGN TOKENS'));
const resetCss = lines.slice(0, resetEnd).join('\n').trim();
fs.writeFileSync(path.join(stylesDir, 'reset.css'), resetCss + '\n', 'utf8');

const indices = markers.map(m => lines.findIndex(l => l.includes(m.match)));
for (let i = 0; i < markers.length; i++) {
  const from = indices[i];
  const to = i + 1 < markers.length ? indices[i + 1] : lines.length;
  if (from < 0) {
    console.error('Marker not found:', markers[i].match);
    process.exit(1);
  }
  const chunk = lines.slice(from, to).join('\n').trim();
  fs.writeFileSync(path.join(stylesDir, markers[i].file), chunk + '\n', 'utf8');
}

const links = [
  'styles/reset.css',
  'styles/tokens.css',
  'styles/base.css',
  'styles/components.css',
  'styles/mobile.css',
  'theme-modern.css',
].map(href => `<link rel="stylesheet" href="${href}?v=PLACEHOLDER"/>`).join('\n');

const themeMatch = html.match(/<link rel="stylesheet" href="theme-modern\.css\?v=\d+"\/>/);
const ver = themeMatch ? (themeMatch[0].match(/v=(\d+)/) || [])[1] || '128' : '128';
const linkBlock = links.replace(/PLACEHOLDER/g, ver);

const newHtml = html.slice(0, start) + linkBlock + '\n' + html.slice(end + '</style>'.length).replace(/\n<link rel="stylesheet" href="theme-modern\.css\?v=\d+"\/>/, '');
fs.writeFileSync(htmlPath, newHtml, 'utf8');

console.log('Extracted styles/reset.css, tokens.css, base.css, components.css, mobile.css');
console.log('Updated index.html stylesheet links');
