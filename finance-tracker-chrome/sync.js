'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   GOOGLE SHEETS SYNC  — GET-only, no CORS preflight (Chrome)
//   Same Sheet contract as ../sync.js (PWA); fetch via background SYNC_FETCH
// ╚══════════════════════════════════════════════════════════╝

var KEY_SYNC_URL   = 'sync_url_v1';
var KEY_SYNC_STATE = 'sync_state_v1';

// Baked-in default (override anytime in Settings; empty stored value uses this again)
var DEFAULT_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbwkuc6feabs9fUZ44t_IBRsh_0za_YYbbQwPzUeid1aBFe3RxQeG6ayNLfpsx5VbbMA/exec';

var syncUrl   = '';
var syncState = { lastSaved: null, lastLoaded: null, status: 'idle', message: '' };

// Same as ../sync.js — …/exec only, no ?query (duplicate ?action= breaks Apps Script).
function canonicalSyncExecUrl(url) {
  var u = String(url || '').trim();
  if (!u) return u;
  var q = u.indexOf('?');
  var h = u.indexOf('#');
  var cut = u.length;
  if (q >= 0) cut = Math.min(cut, q);
  if (h >= 0) cut = Math.min(cut, h);
  return u.slice(0, cut);
}

// ── Load settings from chrome.storage ─────────────────────
function loadSyncSettings(cb) {
  chrome.storage.local.get([KEY_SYNC_URL, KEY_SYNC_STATE], function(r) {
    var stored = r[KEY_SYNC_URL];
    var hasStored = typeof stored === 'string' && stored.trim().length > 0;
    var raw = hasStored ? stored.trim() : DEFAULT_SYNC_URL;
    syncUrl = canonicalSyncExecUrl(raw);
    if (!hasStored && DEFAULT_SYNC_URL) {
      persistSyncUrl(syncUrl);
    } else if (hasStored && syncUrl !== stored.trim()) {
      chrome.storage.local.set({ [KEY_SYNC_URL]: syncUrl });
    }
    syncState = r[KEY_SYNC_STATE] || syncState;
    updateSyncUI();
    if (cb) cb();
  });
}

function persistSyncUrl(url) {
  syncUrl = canonicalSyncExecUrl(url);
  chrome.storage.local.set({ [KEY_SYNC_URL]: syncUrl });
}

function persistSyncState() {
  chrome.storage.local.set({ [KEY_SYNC_STATE]: syncState });
}

// ── Build payload ──────────────────────────────────────────
function buildPayload() {
  return {
    expenses:     expenses     || [],
    incomes:      incomes      || [],
    banks:        banks        || [],
    recurring:    (typeof recurring    !== 'undefined') ? recurring    : [],
    budgets:      (typeof budgets      !== 'undefined') ? budgets      : {},
    petrolLog:    (typeof petrolLog    !== 'undefined') ? petrolLog    : [],
    networthHist: (typeof networthHist !== 'undefined') ? networthHist : [],
    unitTrustHoldings: (typeof utHoldings !== 'undefined') ? utHoldings : [],
    unitTrustNav:      (typeof utNavPoints !== 'undefined') ? utNavPoints : [],
  };
}

// ── Core fetch ─────────────────────────────────────────────
// GET for ping / load / save (query) / save_chunk. Extension fetches go
// through background.js (SYNC_FETCH) to dodge Apps Script CORS; POST is still
// supported there for other callers, but syncSave uses GET + chunking like the PWA.
function scriptFetch(url, params, body) {
  url = canonicalSyncExecUrl(url);
  var qs = Object.keys(params)
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  var fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  var hasBody = typeof body === 'string' && body.length > 0;
  var method  = hasBody ? 'POST' : 'GET';

  function directFetch() {
    var opts = { method: method, redirect: 'follow' };
    if (hasBody) {
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body    = body;
    }
    try { if (fullUrl.length > 6000) console.log('[sync] URL ' + fullUrl.length + ' chars'); } catch (e) {}
    return fetch(fullUrl, opts).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' from Apps Script');
      return r.text().then(function(text) {
        var t = (text || '').trim();
        if (!t) throw new Error('Empty response from server');
        try {
          return JSON.parse(t);
        } catch (parseErr) {
          throw new Error('Server did not return JSON. First part: ' + t.slice(0, 160));
        }
      });
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage(
        { type: 'SYNC_FETCH', url: fullUrl, method: method, body: hasBody ? body : undefined },
        function(response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error((response && response.error) || 'Sync request failed'));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  return directFetch();
}

// Map Apps Script error strings to actionable copy (same as ../sync.js).
function humanizeSaveApiError(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  if (/no data received/i.test(raw)) {
    return 'Apps Script needs re-deploy (open google-apps-script.js, Deploy → Manage deployments → Edit → New version)';
  }
  if (/unknown action:\s*save_chunk/i.test(raw)) {
    return (
      'Your web app URL may include extra ?query after /exec, which duplicates ?action= and breaks saves. ' +
      'In Settings, paste only the URL up to /exec (no ?…), tap Test connection, then try Save again. ' +
      'If it still fails, Deploy → Manage deployments → New version with this repo’s google-apps-script.js.'
    );
  }
  return raw;
}

// ── Ping ───────────────────────────────────────────────────
function syncPing() {
  var urlEl = document.getElementById('sync-url-input');
  var url   = urlEl ? canonicalSyncExecUrl(urlEl.value.trim()) : syncUrl;
  if (!url) { showToast('Paste your Apps Script URL first'); return; }

  setSyncStatus('loading', 'Testing connection…');

  scriptFetch(url, { action: 'ping' })
    .then(function(data) {
      if (data.ok) {
        persistSyncUrl(url);
        if (urlEl) urlEl.value = syncUrl;
        var av = Number(data.apiVersion);
        var hint = '';
        if (isNaN(av) || av < 2) hint = ' — redeploy script (ping missing apiVersion)';
        else if (av < 3) hint = ' — redeploy script for unit trust on Sheets (UTHoldings / UTNav)';
        else if (av < 4) hint = ' — redeploy script so UTHoldings uses total paid RM (totalCost incl. fees)';
        setSyncStatus('ok', (data.message || 'Connected') + hint);
        showToast('Connected to Google Sheets');
      } else {
        setSyncStatus('error', 'Failed: ' + (data.error || 'unknown'));
        showToast('Connection failed — check the URL');
      }
    })
    .catch(function(err) {
      setSyncStatus('error', 'Cannot reach URL');
      showToast('Cannot reach URL — see troubleshooting below');
      console.error('Sync ping error:', err);
    });
}

// ── Save ───────────────────────────────────────────────────
// Same contract as ../sync.js: GET ?action=save for small payloads; chunked
// GET save_chunk when URL-encoded JSON exceeds SAVE_URL_LIMIT. The extension
// could POST large bodies via background.js, but chunking keeps one code path
// and matches the deployed Apps Script (save_chunk).
var SAVE_URL_LIMIT = 6500;
// Keep chunks small after URL-encoding (see ../sync.js).
var CHUNK_PAYLOAD_CHARS = 1600;

function syncSaveChunked(fullJson) {
  var sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
  var chunks = [];
  var i;
  for (i = 0; i < fullJson.length; i += CHUNK_PAYLOAD_CHARS) {
    chunks.push(fullJson.slice(i, i + CHUNK_PAYLOAD_CHARS));
  }
  if (chunks.length === 0) {
    return Promise.resolve({ ok: false, error: 'Nothing to save' });
  }
  return chunks.reduce(function(chain, chunk, idx) {
    return chain.then(function(prev) {
      if (prev && prev.ok === false) return prev;
      return scriptFetch(syncUrl, {
        action: 'save_chunk',
        id: sessionId,
        seq: String(idx),
        total: String(chunks.length),
        data: chunk
      }).then(function(data) {
        if (!data || !data.ok) {
          return { ok: false, error: (data && data.error) || 'Chunk save failed' };
        }
        return data;
      });
    });
  }, Promise.resolve());
}

function syncSave(silent) {
  if (!syncUrl) {
    if (!silent) showToast('No sync URL — add it in Settings');
    return;
  }

  setSyncStatus('saving', 'Saving to Google Sheets…');

  var json    = JSON.stringify(buildPayload());
  var encoded = encodeURIComponent(json);
  var promise;

  if (encoded.length < SAVE_URL_LIMIT) {
    promise = scriptFetch(syncUrl, { action: 'save', data: json });
  } else {
    promise = syncSaveChunked(json);
  }

  promise
    .then(function(data) {
      if (data && data.ok) {
        syncState.lastSaved = new Date().toISOString();
        setSyncStatus('ok', 'Saved ' + fmtTime(syncState.lastSaved));
        persistSyncState();
        if (!silent) {
          var av = Number(data.apiVersion);
          if (isNaN(av) || av < 3) {
            showToast('Saved — redeploy Apps Script (google-apps-script.js v3) for unit trust tabs UTHoldings & UTNav.');
          } else if (av < 4) {
            showToast('Saved — redeploy Apps Script for UTHoldings totalCost (full amount paid incl. fees).');
          } else {
            showToast('Saved to Google Sheets');
          }
        }
      } else {
        var msg = humanizeSaveApiError((data && data.error) || 'unknown');
        setSyncStatus('error', 'Save failed: ' + msg);
        if (!silent) showToast('Save failed — ' + msg);
      }
    })
    .catch(function(err) {
      console.error('Sync save error:', err);
      var raw = (err && err.message) ? String(err.message) : '';
      try { if (raw) localStorage.setItem('ft.lastSyncError', raw + ' @ ' + new Date().toISOString()); } catch (e) {}
      var low = raw.toLowerCase();
      var looksOffline =
        !raw ||
        /failed to fetch|networkerror|network request failed|load failed|aborted|timed out|err_internet_disconnected/.test(low);
      var msg = looksOffline ? 'Network error — working offline' : ('Save failed: ' + humanizeSaveApiError(raw));
      setSyncStatus('error', msg);
      if (!silent) {
        showToast(looksOffline ? 'Offline — data saved locally' : msg);
      }
    });
}

// ── Load ───────────────────────────────────────────────────
// opts.skipConfirm — used by auto-load on startup (no "REPLACE all data?" prompt)
// opts.silent       — suppress toasts for the success case
function syncLoad(opts) {
  opts = opts || {};
  var prevExpCount = (typeof expenses !== 'undefined' && Array.isArray(expenses)) ? expenses.length : 0;
  if (!syncUrl) {
    if (!opts.silent) showToast('No sync URL — add it in Settings');
    return;
  }

  if (!opts.skipConfirm) {
    if (!confirm(
      'Load data from Google Sheets?\n\n' +
      'This will REPLACE all data on this device with what is in your Sheet.\n' +
      'Make sure your Sheet has the latest data before proceeding.'
    )) return;
  }

  if (typeof bumpStorageReadGeneration === 'function') bumpStorageReadGeneration();

  setSyncStatus('loading', opts.skipConfirm ? 'Syncing from cloud…' : 'Loading from Google Sheets…');

  scriptFetch(syncUrl, { action: 'load' })
    .then(function(data) {
      if (!data.ok) {
        setSyncStatus('error', 'Load failed: ' + (data.error || 'unknown'));
        showToast('Load failed');
        return;
      }

      var p = data.payload || {};

      var BAD_SHEET_DATE = '1900-01-02';

      function sheetDateField_(o) {
        var v = o.date;
        if (v === undefined || v === null || v === '') v = o.Date;
        if (v === undefined || v === null || v === '') v = o.DATE;
        return v;
      }

      function dateToYMD(val) {
        if (val === undefined || val === null || val === '') return BAD_SHEET_DATE;
        if (typeof val === 'number' && !isNaN(val)) {
          var dn = new Date(val);
          if (!isNaN(dn.getTime())) {
            return dn.getFullYear() + '-' + String(dn.getMonth() + 1).padStart(2, '0') + '-' + String(dn.getDate()).padStart(2, '0');
          }
        }
        var s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        var dp = new Date(s);
        if (!isNaN(dp.getTime())) {
          return dp.getFullYear() + '-' + String(dp.getMonth() + 1).padStart(2, '0') + '-' + String(dp.getDate()).padStart(2, '0');
        }
        return BAD_SHEET_DATE;
      }

      if (opts.skipConfirm) {
        var ce = (p.expenses || []).length;
        if (prevExpCount > 0 && ce === 0) {
          setSyncStatus('error', 'Auto-sync skipped — cloud had no expenses');
          showToast('Sheet returned 0 expenses; kept your local data.');
          return;
        }
        if (prevExpCount >= 5 && ce > 0 && ce < Math.floor(prevExpCount * 0.35)) {
          setSyncStatus('error', 'Auto-sync skipped — cloud much smaller than device');
          showToast('Sheet has far fewer expenses than this device — kept local data. Use Sheet version history if rows are missing.');
          return;
        }
      }

      // Match PWA: coerce ids/amounts/dates from Sheet so rows are not dropped and filters work.
      // Apps Script uses sheet header text as JSON keys — "ID" vs "id" matters; missing id gets synthetic.
      function sanitize(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(function(e) {
          return e && typeof e === 'object';
        }).map(function(e, idx) {
          var o = Object.assign({}, e);
          var rawId = o.id;
          if (rawId === undefined || rawId === null || rawId === '') rawId = o.ID;
          if (rawId === undefined || rawId === null || rawId === '') rawId = o.Id;
          o.id = Number(rawId);
          if (!o.id || isNaN(o.id)) o.id = Date.now() + idx;
          o.date = dateToYMD(sheetDateField_(o));
          if (o.amount !== undefined) o.amount = parseFloat(o.amount) || 0;
          if (o.balance !== undefined) o.balance = parseFloat(o.balance) || 0;
          return o;
        });
      }

      expenses = sanitize(p.expenses);
      incomes  = sanitize(p.incomes);
      banks    = sanitize(p.banks);

      if (typeof recurring !== 'undefined') recurring = sanitize(p.recurring);
      if (typeof budgets !== 'undefined') budgets = p.budgets || {};
      if (typeof petrolLog !== 'undefined') petrolLog = sanitize(p.petrolLog);
      if (typeof networthHist !== 'undefined') {
        networthHist = (p.networthHist || []).filter(function(e) { return e && e.date; }).map(function(e) {
          var o = Object.assign({}, e);
          o.date = dateToYMD(sheetDateField_(o));
          if (o.total !== undefined) o.total = parseFloat(o.total) || 0;
          return o;
        });
      }

      if ('unitTrustHoldings' in p || 'unitTrustNav' in p) {
        var arrH = Array.isArray(p.unitTrustHoldings) ? p.unitTrustHoldings : [];
        var arrN = Array.isArray(p.unitTrustNav) ? p.unitTrustNav : [];
        var localHasUt =
          (typeof utHoldings !== 'undefined' && utHoldings.length > 0) ||
          (typeof utNavPoints !== 'undefined' && utNavPoints.length > 0);
        if (arrH.length > 0 || arrN.length > 0 || !localHasUt) {
          if (typeof utHoldings !== 'undefined') {
            utHoldings = typeof utSanitizeHoldings === 'function' ? utSanitizeHoldings(arrH) : [];
          }
          if (typeof utNavPoints !== 'undefined') {
            utNavPoints = typeof utSanitizeNav === 'function' ? utSanitizeNav(arrN) : [];
          }
        }
      }

      // Move the visible month to the latest loaded transaction so lists are not empty by accident.
      try {
        if (typeof viewMonth !== 'undefined') {
          var best = null;
          function consider(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return;
            if (dateStr.indexOf('1900-01-') === 0) return;
            var t = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
              ? new Date(dateStr.trim() + 'T12:00:00')
              : new Date(dateStr);
            if (isNaN(t.getTime())) return;
            if (!best || t > best) best = t;
          }
          expenses.forEach(function(e) { consider(e.date); });
          incomes.forEach(function(i) { consider(i.date); });
          if (best) viewMonth.setFullYear(best.getFullYear(), best.getMonth(), 1);
        }
      } catch (e4) { console.warn('syncLoad viewMonth', e4); }

      // Persist everything locally
      saveExp(); saveInc(); saveBanks();
      if (typeof saveRec === 'function') saveRec();
      if (typeof saveBud === 'function') saveBud();
      if (typeof savePetrol === 'function') savePetrol();
      if (typeof saveNWH === 'function') saveNWH();
      if (typeof saveUtHoldings === 'function') saveUtHoldings();
      if (typeof saveUtNav === 'function') saveUtNav();

      syncState.lastLoaded = new Date().toISOString();
      setSyncStatus('ok', 'Loaded ' + fmtTime(syncState.lastLoaded));
      persistSyncState();

      render();

      var rowCount = expenses.length + incomes.length + banks.length;
      if (rowCount === 0) {
        if (!opts.silent) {
          showToast('Loaded — no expense/income/bank rows in this backend (check Sheet name "Finance Tracker" and Expenses/Income/Banks tabs).');
        }
      } else if (!opts.silent) {
        showToast(opts.skipConfirm ? 'Synced ' + rowCount + ' rows from cloud' : 'Data loaded from Google Sheets');
      }
    })
    .catch(function(err) {
      var detail = (err && err.message) ? err.message : 'check connection';
      setSyncStatus('error', 'Load failed: ' + detail);
      if (!opts.silent) showToast('Load failed: ' + detail);
      console.error('Sync load error:', err);
    });
}

// ── Auto-load on app start ─────────────────────────────────
// Fires once per page session after the local data is loaded and rendered.
var _autoLoadFired = false;
function syncAutoLoad() {
  if (_autoLoadFired) return;
  _autoLoadFired = true;
  if (!syncUrl) return;
  setTimeout(function() {
    syncLoad({ skipConfirm: true, silent: false });
  }, 400);
}

window.addEventListener('ft-app-ready', syncAutoLoad);

// ── Auto-sync (debounced, triggered by save functions) ──────
var syncTimer = null;

function scheduleAutoSync() {
  if (!syncUrl) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() { syncSave(true); }, 4000);
}

// Patch save* functions to trigger auto-sync (see ../sync.js).
(function() {
  function wrapSave(name) {
    var cur = typeof window[name] === 'function' ? window[name] : null;
    if (!cur || cur.__ftSyncHooked) return;
    var orig = cur;
    window[name] = function() {
      orig.apply(this, arguments);
      scheduleAutoSync();
    };
    window[name].__ftSyncHooked = true;
  }

  wrapSave('saveExp');
  wrapSave('saveInc');
  wrapSave('saveBanks');
  wrapSave('saveUtHoldings');
  wrapSave('saveUtNav');

  function hookDeferredSaves() {
    wrapSave('saveRec');
    wrapSave('saveBud');
    wrapSave('savePetrol');
    wrapSave('saveNWH');
  }
  setTimeout(hookDeferredSaves, 0);
})();

// ── UI ─────────────────────────────────────────────────────
function setSyncStatus(status, message) {
  syncState.status  = status;
  syncState.message = message;
  updateSyncUI();
}

function updateSyncUI() {
  var dot = document.getElementById('sync-dot');
  var msg = document.getElementById('sync-msg');
  var inp = document.getElementById('sync-url-input');

  if (inp && syncUrl && !inp.value) inp.value = syncUrl;

  if (!dot || !msg) return;

  var icons  = { idle:'○', saving:'↑', loading:'↓', ok:'✓', error:'✗' };
  var colors = {
    idle:    'var(--ink3)',
    saving:  '#BA7517',
    loading: '#378ADD',
    ok:      'var(--green)',
    error:   'var(--red)',
  };

  dot.textContent = icons[syncState.status]  || '○';
  dot.style.color = colors[syncState.status] || 'var(--ink3)';

  if (syncState.message) {
    msg.textContent = syncState.message;
  } else {
    msg.textContent = syncUrl ? 'Auto-saves 4 s after every change' : 'Not configured';
  }
  msg.style.color = syncState.status === 'error' ? 'var(--red)' : 'var(--ink3)';
}

function fmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleTimeString('en-MY', { hour:'2-digit', minute:'2-digit' }) +
    ' ' + d.toLocaleDateString('en-MY', { day:'numeric', month:'short' });
}

// ── Wire buttons ───────────────────────────────────────────
function wireSyncUI() {
  var pingBtn = document.getElementById('sync-ping-btn');
  var saveBtn = document.getElementById('sync-save-btn');
  var loadBtn = document.getElementById('sync-load-btn');
  var urlInp  = document.getElementById('sync-url-input');

  if (pingBtn) pingBtn.addEventListener('click', syncPing);
  if (saveBtn) saveBtn.addEventListener('click', function() { syncSave(false); });
  if (loadBtn) loadBtn.addEventListener('click', function() { syncLoad(); });
  if (urlInp)  urlInp.addEventListener('change', function() {
    persistSyncUrl(urlInp.value.trim());
    updateSyncUI();
  });
}

// ── Init ───────────────────────────────────────────────────
loadSyncSettings(function() {
  wireSyncUI();
  if (window.__ftAppReady) syncAutoLoad();
});
