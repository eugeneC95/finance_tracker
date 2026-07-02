#!/usr/bin/env node
/** Ping the hard-coded Finance Tracker Apps Script web app. */
const EXEC =
  'https://script.google.com/macros/s/AKfycbw-crW39LqE5JSpgg6pwHzkfuZbY3ZY0prLYDSv1OTjr8Dnfrk8ozAOn3fIxZd5ISg0/exec';

const url = EXEC + (EXEC.includes('?') ? '&' : '?') + 'action=ping';

const res = await fetch(url, { redirect: 'follow' });
const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error('Not JSON:', text.slice(0, 200));
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
const v = Number(data.apiVersion);
if (data.ok && v >= 6) {
  console.log('\nOK — merge-on-save (v6+) is live.');
  if (v >= 8) console.log('v8+ — _Meta save range fix deployed.');
  process.exit(0);
}
if (data.ok && v < 6) {
  console.error('\nLive deployment is apiVersion', v, '— redeploy google-apps-script.js (see scripts/APPS_SCRIPT_DEPLOY.md).');
  process.exit(2);
}
console.error('\nPing failed.');
process.exit(1);
