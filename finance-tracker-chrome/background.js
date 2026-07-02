'use strict';

// ── Keyboard shortcut: open dashboard ─────────────────────
chrome.commands.onCommand.addListener(command => {
  if (command === 'open-dashboard') {
    const appUrl = chrome.runtime.getURL('app.html');
    chrome.tabs.query({ url: appUrl }, tabs => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: appUrl });
      }
    });
  }
});

// ── Proxy fetch for Google Apps Script ────────────────────
// Chrome extensions can't fetch Apps Script URLs directly from
// page context due to redirect-based CORS issues.
// The background service worker has no such restriction.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'SYNC_FETCH') return false;

  const { url, method, body, headers } = msg;

  const opts = { method: method || 'GET' };
  const reqHeaders = Object.assign({}, headers || {});
  if (body) {
    // Apps Script requires Content-Type text/plain to skip CORS preflight
    if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'text/plain;charset=utf-8';
    opts.body    = body;
  }
  if (Object.keys(reqHeaders).length) opts.headers = reqHeaders;

  fetch(url, opts)
    .then(r => {
      // Follow redirects — Apps Script always redirects to googleusercontent.com
      return r.text().then(text => ({ ok: r.ok, status: r.status, text }));
    })
    .then(({ ok, status, text }) => {
      if (!ok) {
        sendResponse({ ok: false, error: 'HTTP ' + status + ' from Apps Script' });
        return;
      }
      try {
        const json = JSON.parse(text);
        sendResponse({ ok: true, data: json });
      } catch (e) {
        sendResponse({ ok: false, error: 'Invalid JSON: ' + text.slice(0, 200) });
      }
    })
    .catch(err => {
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep message channel open for async response
});
