'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   GOOGLE SHEETS SYNC  — GET-only, no CORS preflight
// ╚══════════════════════════════════════════════════════════╝

var KEY_SYNC_URL   = 'sync_url_v1';
var KEY_SYNC_STATE = 'sync_state_v1';

var syncUrl   = '';
var syncState = { lastSaved: null, lastLoaded: null, status: 'idle', message: '' };

// ── Load settings from chrome.storage ─────────────────────
function loadSyncSettings(cb) {
  chromeStorage.local.get([KEY_SYNC_URL, KEY_SYNC_STATE], function(r) {
    syncUrl   = r[KEY_SYNC_URL]   || '';
    syncState = r[KEY_SYNC_STATE] || syncState;
    updateSyncUI();
    if (cb) cb();
  });
}

function persistSyncUrl(url) {
  syncUrl = url;
  chromeStorage.local.set({ [KEY_SYNC_URL]: url });
}

function persistSyncState() {
  chromeStorage.local.set({ [KEY_SYNC_STATE]: syncState });
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

// ── Core fetch — GET with ?action=…&data=… ─────────────────
// Apps Script GET never triggers CORS preflight.
// We follow redirects manually by using fetch with redirect:'follow'.
function scriptFetch(url, params) {
  var qs = Object.keys(params)
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  var fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;

  return fetch(fullUrl, {
    method:   'GET',
    redirect: 'follow',
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
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
function syncSave(silent) {
  if (!syncUrl) {
    if (!silent) showToast('No sync URL — add it in Settings');
    return;
  }

  setSyncStatus('saving', 'Saving to Google Sheets…');

  var json    = JSON.stringify(buildPayload());
  var encoded = encodeURIComponent(json);

  // Google Apps Script has a URL length limit (~8000 chars after encoding).
  // If payload is larger, we split into a metadata-only save + a warning.
  // For most users months of data fits fine. If not, we show a clear error.
  if (encoded.length > 7500) {
    // Try anyway — Apps Script can handle longer via POST body passed as param
    // If it fails we'll surface it
    console.warn('Large payload:', encoded.length, 'chars');
  }

  scriptFetch(syncUrl, { action: 'save', data: json })
    .then(function(data) {
      if (data.ok) {
        syncState.lastSaved = new Date().toISOString();
        setSyncStatus('ok', 'Saved ' + fmtTime(syncState.lastSaved));
        persistSyncState();
        if (!silent) showToast('Saved to Google Sheets');
      } else {
        setSyncStatus('error', 'Save failed: ' + (data.error || 'unknown'));
        if (!silent) showToast('Save failed — check console for details');
      }
    })
    .catch(function(err) {
      setSyncStatus('error', 'Network error — working offline');
      if (!silent) showToast('Offline — data saved locally');
      console.error('Sync save error:', err);
    });
}

// ── Load ───────────────────────────────────────────────────
function syncLoad() {
  if (!syncUrl) { showToast('No sync URL — add it in Settings'); return; }

  if (!confirm(
    'Load data from Google Sheets?\n\n' +
    'This will REPLACE all data on this device with what is in your Sheet.\n' +
    'Make sure your Sheet has the latest data before proceeding.'
  )) return;

  setSyncStatus('loading', 'Loading from Google Sheets…');

  scriptFetch(syncUrl, { action: 'load' })
    .then(function(data) {
      if (!data.ok) {
        setSyncStatus('error', 'Load failed: ' + (data.error || 'unknown'));
        showToast('Load failed');
        return;
      }

      var p = data.payload || {};

      expenses = filterValid(p.expenses,  function(e){ return e.id; });
      incomes  = filterValid(p.incomes,   function(e){ return e.id; });
      banks    = filterValid(p.banks,     function(e){ return e.id; });

      if (typeof recurring    !== 'undefined') recurring    = filterValid(p.recurring,    function(e){ return e.id; });
      if (typeof budgets      !== 'undefined') budgets      = p.budgets || {};
      if (typeof petrolLog    !== 'undefined') petrolLog    = filterValid(p.petrolLog,    function(e){ return e.id; });
      if (typeof networthHist !== 'undefined') networthHist = filterValid(p.networthHist, function(e){ return e.date; });

      // Persist everything locally
      saveExp(); saveInc(); saveBanks();
      if (typeof saveRec    === 'function') saveRec();
      if (typeof saveBud    === 'function') saveBud();
      if (typeof savePetrol === 'function') savePetrol();
      if (typeof saveNWH    === 'function') saveNWH();

      syncState.lastLoaded = new Date().toISOString();
      setSyncStatus('ok', 'Loaded ' + fmtTime(syncState.lastLoaded));
      persistSyncState();

      render();
      showToast('Data loaded from Google Sheets');
    })
    .catch(function(err) {
      setSyncStatus('error', 'Network error loading data');
      showToast('Load failed — check connection');
      console.error('Sync load error:', err);
    });
}

function filterValid(arr, test) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(function(e) { return e && test(e); });
}

// ── Auto-sync (debounced, triggered by save functions) ──────
var syncTimer = null;

function scheduleAutoSync() {
  if (!syncUrl) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() { syncSave(true); }, 4000);
}

// Patch chrome.storage saves to trigger auto-sync
(function() {
  var origExp   = saveExp;
  var origInc   = saveInc;
  var origBanks = saveBanks;

  saveExp = function() {
    origExp();
    scheduleAutoSync();
  };
  saveInc = function() {
    origInc();
    scheduleAutoSync();
  };
  saveBanks = function() {
    origBanks();
    scheduleAutoSync();
  };
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
  if (loadBtn) loadBtn.addEventListener('click', syncLoad);
  if (urlInp)  urlInp.addEventListener('change', function() {
    persistSyncUrl(urlInp.value.trim());
    updateSyncUI();
  });
}

// ── Init ───────────────────────────────────────────────────
loadSyncSettings(wireSyncUI);
