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

// ── Load settings from chrome.storage ─────────────────────
function loadSyncSettings(cb) {
  chrome.storage.local.get([KEY_SYNC_URL, KEY_SYNC_STATE], function(r) {
    var stored = r[KEY_SYNC_URL];
    var hasStored = typeof stored === 'string' && stored.trim().length > 0;
    syncUrl = hasStored ? stored.trim() : DEFAULT_SYNC_URL;
    if (!hasStored && DEFAULT_SYNC_URL) {
      persistSyncUrl(syncUrl);
    }
    syncState = r[KEY_SYNC_STATE] || syncState;
    updateSyncUI();
    if (cb) cb();
  });
}

function persistSyncUrl(url) {
  syncUrl = url;
  chrome.storage.local.set({ [KEY_SYNC_URL]: url });
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
  };
}

// ── Core fetch ─────────────────────────────────────────────
// GET for ping / load / save (query) / save_chunk. Extension fetches go
// through background.js (SYNC_FETCH) to dodge Apps Script CORS; POST is still
// supported there for other callers, but syncSave uses GET + chunking like the PWA.
function scriptFetch(url, params, body) {
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
    return fetch(fullUrl, opts).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
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

// ── Ping ───────────────────────────────────────────────────
function syncPing() {
  var urlEl = document.getElementById('sync-url-input');
  var url   = urlEl ? urlEl.value.trim() : syncUrl;
  if (!url) { showToast('Paste your Apps Script URL first'); return; }

  setSyncStatus('loading', 'Testing connection…');

  scriptFetch(url, { action: 'ping' })
    .then(function(data) {
      if (data.ok) {
        persistSyncUrl(url);
        setSyncStatus('ok', data.message || 'Connected');
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
var CHUNK_PAYLOAD_CHARS = 3000;

function syncSaveChunked(fullJson) {
  var sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
  var chunks = [];
  var i;
  for (i = 0; i < fullJson.length; i += CHUNK_PAYLOAD_CHARS) {
    chunks.push(fullJson.slice(i, i + CHUNK_PAYLOAD_CHARS));
  }
  var total = chunks.length;
  var chain = Promise.resolve();
  chunks.forEach(function(chunk, idx) {
    chain = chain.then(function() {
      return scriptFetch(syncUrl, {
        action: 'save_chunk',
        id: sessionId,
        seq: String(idx),
        total: String(total),
        data: chunk
      });
    }).then(function(data) {
      if (!data || !data.ok) throw new Error((data && data.error) || 'Chunk save failed');
      return data;
    });
  });
  return chain;
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
        if (!silent) showToast('Saved to Google Sheets');
      } else {
        var msg = (data && data.error) || 'unknown';
        if (/no data received/i.test(msg)) {
          msg = 'Apps Script needs re-deploy (open google-apps-script.js, Deploy → Manage deployments → Edit → New version)';
        } else if (/unknown action:\s*save_chunk/i.test(msg)) {
          msg =
            'Your Apps Script web app is an old version — it does not support chunked saves. ' +
            'In Google Apps Script: Deploy → Manage deployments → Edit → New version (paste code from repo google-apps-script.js). ' +
            'Large datasets need save_chunk; until then only very small saves work.';
        }
        setSyncStatus('error', 'Save failed: ' + msg);
        if (!silent) showToast('Save failed — ' + msg);
      }
    })
    .catch(function(err) {
      setSyncStatus('error', 'Network error — working offline');
      if (!silent) showToast('Offline — data saved locally');
      console.error('Sync save error:', err);
    });
}

// ── Load ───────────────────────────────────────────────────
// opts.skipConfirm — used by auto-load on startup (no "REPLACE all data?" prompt)
// opts.silent       — suppress toasts for the success case
function syncLoad(opts) {
  opts = opts || {};
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

      function todayStrLocal() {
        if (typeof todayStr === 'function') return todayStr();
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }

      function dateToYMD(val) {
        if (val === undefined || val === null || val === '') return todayStrLocal();
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
        return todayStrLocal();
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
          o.date = dateToYMD(o.date);
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
          o.date = dateToYMD(o.date);
          if (o.total !== undefined) o.total = parseFloat(o.total) || 0;
          return o;
        });
      }

      // Move the visible month to the latest loaded transaction so lists are not empty by accident.
      try {
        if (typeof viewMonth !== 'undefined') {
          var best = null;
          function consider(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return;
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
      setSyncStatus('error', 'Network error loading data');
      var detail = (err && err.message) ? err.message : 'check connection';
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
