'use strict';

/**
 * Unified sync transport:
 * - Chrome extension: proxy through background (SYNC_FETCH) to bypass Apps Script redirect CORS quirks.
 * - PWA/web: normal window.fetch.
 */
function ftSyncTransportFetch(url, opts) {
  opts = opts || {};
  var method = opts.method || 'GET';
  var body = opts.body || null;
  var headers = opts.headers || {};

  var hasChromeRuntime =
    typeof chrome !== 'undefined' &&
    chrome &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === 'function';

  if (hasChromeRuntime) {
    return new Promise(function(resolve, reject) {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'SYNC_FETCH',
            url: url,
            method: method,
            body: body,
            headers: headers,
          },
          function(resp) {
            var err = chrome.runtime && chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message || 'SYNC_FETCH failed'));
              return;
            }
            if (!resp || !resp.ok) {
              reject(new Error((resp && resp.error) || 'SYNC_FETCH failed'));
              return;
            }
            resolve(resp.data);
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  return fetch(url, {
    method: method,
    redirect: 'follow',
    headers: headers,
    body: body,
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' from Apps Script');
    return r.text().then(function(text) {
      var t = (text || '').trim();
      if (!t) throw new Error('Empty response from server');
      try {
        return JSON.parse(t);
      } catch (e) {
        throw new Error('Server did not return JSON. First part: ' + t.slice(0, 160));
      }
    });
  });
}

if (typeof window !== 'undefined') {
  window.ftSyncTransportFetch = ftSyncTransportFetch;
}
