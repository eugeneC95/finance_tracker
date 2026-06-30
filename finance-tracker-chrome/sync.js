'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   GOOGLE SHEETS SYNC  — GET-only, no CORS preflight (PWA)
//   Same Sheet contract as finance-tracker-chrome/sync.js
// ╚══════════════════════════════════════════════════════════╝

var KEY_SYNC_STATE = 'sync_state_v1';
var FT_FORCE_SHEET_SOURCE = true;
window.__ftForceSheetSource = FT_FORCE_SHEET_SOURCE;

var FT_FINANCE_STORAGE_KEYS_ = [
  'expenses_v2', 'incomes_v1', 'banks_v1',
  'recurring_v1', 'networth_history_v1', 'budgets_v1', 'lastcat_v1', 'cat_rules_v1', 'savings_goal_v1',
  'petrol_v1', 'last_petrol_v1', 'last_expense_v1', 'last_income_v1',
  'unit_trust_holdings_v1', 'unit_trust_nav_v1',
  'sync_state_v1', 'sync_url_v1'
];

(function ftForceSheetBootstrap_() {
  if (!FT_FORCE_SHEET_SOURCE) return;
  var i, k, extra = [];
  try {
    FT_FINANCE_STORAGE_KEYS_.forEach(function(key) { localStorage.removeItem(key); });
    localStorage.removeItem('ft.lastSyncError');
    localStorage.removeItem('ft_ut_nav_snap_ymd');
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (!k || k.indexOf('ft_') !== 0) continue;
      if (k === 'ft_lock_pw_hash_v1' || k === 'ft_lock_timeout_min') continue;
      extra.push(k);
    }
    extra.forEach(function(key) { localStorage.removeItem(key); });
    sessionStorage.clear();
  } catch (e) {}
})();

// Hard-coded Google Apps Script web app (…/exec only). Shown read-only on Settings; not user-editable.
var APPS_SCRIPT_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbwHOytl1mIYf070-EQCWjddyZar0FGLfchijC5LXoveT7TeRuzZ9JgRRD1ImX566_Dc/exec';

var syncUrl   = '';
var syncState = { lastSaved: null, lastLoaded: null, status: 'idle', message: '' };

function applyHardcodedSyncUrl_() {
  syncUrl = canonicalSyncExecUrl(APPS_SCRIPT_WEB_APP_URL);
}

// Apps Script URL must be …/exec with no ?query — duplicate ?action= breaks routing
// (server can report "Unknown action: save_chunk" even when the new code is deployed).
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
  try {
    chromeStorage.local.remove('sync_url_v1');
  } catch (e) {}
  chromeStorage.local.get([KEY_SYNC_STATE], function(r) {
    applyHardcodedSyncUrl_();
    syncState = r[KEY_SYNC_STATE] || syncState;
    updateSyncUI();
    if (cb) cb();
  });
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
    catRules:     (typeof catRules     !== 'undefined') ? catRules     : {},
    savingsGoal:  (typeof savingsGoal  !== 'undefined') ? savingsGoal  : null,
    petrolLog:    (typeof petrolLog    !== 'undefined') ? petrolLog    : [],
    networthHist: (typeof networthHist !== 'undefined') ? networthHist : [],
    unitTrustHoldings: (typeof utHoldings !== 'undefined') ? utHoldings : [],
    unitTrustNav:      (typeof utNavPoints !== 'undefined') ? utNavPoints : [],
  };
}

var _sheetSessionLoaded = false;
var _sheetSessionResetDone = false;
var _sheetBaseline = null;
var _syncDirtyKinds = {
  tx: false,
  recurring: false,
  meta: false,
};

function cloneJson_(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
}

function snapshotSheetBaseline_() {
  var p = buildPayload();
  _sheetBaseline = {
    expenses: cloneJson_(p.expenses),
    incomes: cloneJson_(p.incomes),
    banks: cloneJson_(p.banks),
    recurring: cloneJson_(p.recurring),
    petrolLog: cloneJson_(p.petrolLog),
    networthHist: cloneJson_(p.networthHist),
    unitTrustHoldings: cloneJson_(p.unitTrustHoldings),
    unitTrustNav: cloneJson_(p.unitTrustNav),
    budgets: cloneJson_(p.budgets),
    catRules: cloneJson_(p.catRules),
    savingsGoal: cloneJson_(p.savingsGoal),
  };
  _sheetSessionLoaded = true;
}

function localRowsMissingBaselineMonths_(localRows, baselineRows) {
  var localByM = countExpensesByMonth_(localRows);
  var baseByM = countExpensesByMonth_(baselineRows);
  var keys = Object.keys(baseByM);
  for (var i = 0; i < keys.length; i++) {
    var ym = keys[i];
    if (baseByM[ym] > 0 && !(localByM[ym] > 0)) return true;
  }
  var lc = (localRows || []).length;
  var bc = (baselineRows || []).length;
  if (bc > 0 && lc === 0) return true;
  if (bc >= 8 && lc > 0 && lc < Math.floor(bc * 0.45)) return true;
  return false;
}

function mergeRowArraysForSave_(localRows, baselineRows) {
  var map = {};
  (localRows || []).forEach(function(e) {
    if (e && e.id != null) map[e.id] = e;
  });
  if (localRowsMissingBaselineMonths_(localRows, baselineRows)) {
    (baselineRows || []).forEach(function(e) {
      if (e && e.id != null && !map[e.id]) map[e.id] = e;
    });
  }
  return Object.keys(map).map(function(k) { return map[k]; });
}

function buildPayloadForSave_(opts) {
  opts = opts || {};
  var local = buildPayload();
  if (!FT_FORCE_SHEET_SOURCE || !_sheetBaseline) return local;
  var preserveTxFromBaseline = !!opts.preserveTxFromBaseline;
  return {
    expenses: preserveTxFromBaseline ? cloneJson_(_sheetBaseline.expenses || []) : mergeRowArraysForSave_(local.expenses, _sheetBaseline.expenses),
    incomes: preserveTxFromBaseline ? cloneJson_(_sheetBaseline.incomes || []) : mergeRowArraysForSave_(local.incomes, _sheetBaseline.incomes),
    banks: preserveTxFromBaseline ? cloneJson_(_sheetBaseline.banks || []) : mergeRowArraysForSave_(local.banks, _sheetBaseline.banks),
    recurring: mergeRowArraysForSave_(local.recurring, _sheetBaseline.recurring),
    petrolLog: mergeRowArraysForSave_(local.petrolLog, _sheetBaseline.petrolLog),
    networthHist: mergeRowArraysForSave_(local.networthHist, _sheetBaseline.networthHist),
    unitTrustHoldings: (local.unitTrustHoldings && local.unitTrustHoldings.length)
      ? local.unitTrustHoldings
      : mergeRowArraysForSave_(local.unitTrustHoldings, _sheetBaseline.unitTrustHoldings),
    unitTrustNav: (local.unitTrustNav && local.unitTrustNav.length)
      ? local.unitTrustNav
      : mergeRowArraysForSave_(local.unitTrustNav, _sheetBaseline.unitTrustNav),
    budgets: Object.assign({}, _sheetBaseline.budgets || {}, local.budgets || {}),
    catRules: Object.assign({}, _sheetBaseline.catRules || {}, local.catRules || {}),
    savingsGoal: (local.savingsGoal && local.savingsGoal.target)
      ? local.savingsGoal
      : (_sheetBaseline.savingsGoal || null),
  };
}

function syncCountSummaryText(data) {
  var expN = Array.isArray(data && data.expenses) ? data.expenses.length : 0;
  var incN = Array.isArray(data && data.incomes) ? data.incomes.length : 0;
  var bankN = Array.isArray(data && data.banks) ? data.banks.length : 0;
  var utHN = Array.isArray(data && data.unitTrustHoldings) ? data.unitTrustHoldings.length : 0;
  var utNN = Array.isArray(data && data.unitTrustNav) ? data.unitTrustNav.length : 0;
  return (
    expN + ' exp, ' +
    incN + ' inc, ' +
    bankN + ' bank' +
    (utHN || utNN ? (', ' + utHN + ' funds, ' + utNN + ' nav') : '')
  );
}

// ── Core fetch ─────────────────────────────────────────────
// GET for ping / load / save (query) / save_chunk. For "save" with a POST body
// we only use that path when explicitly needed — the PWA avoids POST here
// because Apps Script returns a 302 and fetch drops the body on redirect.
function scriptFetch(url, params, body) {
  url = canonicalSyncExecUrl(url);
  var qs = Object.keys(params)
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  var fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  var hasBody = typeof body === 'string' && body.length > 0;

  var opts = { method: hasBody ? 'POST' : 'GET', redirect: 'follow' };
  if (hasBody) {
    opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    opts.body = body;
  }

  // Log URL length so users can diagnose 414/CORS easily via console.
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

// Map Apps Script error strings to actionable copy (also used after thrown fetch/parse errors).
function humanizeSaveApiError(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  if (/no data received/i.test(raw)) {
    return 'Apps Script needs re-deploy (open google-apps-script.js, Deploy → Manage deployments → Edit → New version)';
  }
  if (/^unknown action:/i.test(raw.trim())) {
    return (
      raw.trim() +
      ' — redeploy this repo’s google-apps-script.js (Deploy → New version). The web app must respond at …/exec (no ? or # after it). ' +
      'Ping should show apiVersion 6+ for merge-on-save.'
    );
  }
  return raw;
}

// ── Ping ───────────────────────────────────────────────────
function syncPing() {
  applyHardcodedSyncUrl_();
  if (!syncUrl) {
    showToast('Built-in sync URL missing — rebuild the app');
    return;
  }

  setSyncStatus('loading', 'Testing connection…');

  scriptFetch(syncUrl, { action: 'ping' })
    .then(function(data) {
      if (data.ok) {
        updateSyncUI();
        var av = Number(data.apiVersion);
        var hint = '';
        if (isNaN(av) || av < 2) hint = ' — redeploy script (ping missing apiVersion)';
        else if (av < 3) hint = ' — redeploy script for unit trust on Sheets (UTHoldings / UTNav)';
        else if (av < 4) hint = ' — redeploy script so UTHoldings uses total paid RM (totalCost incl. fees)';
        else if (av < 5) hint = ' — redeploy script v5 (fixes save_chunk when action is a string)';
        else if (av < 6) hint = ' — redeploy script v6 (merge-on-save keeps all months on Sheet)';
        setSyncStatus('ok', (data.message || 'Connected') + hint);
        showToast('Connected to Google Sheets');
      } else {
        setSyncStatus('error', 'Failed: ' + (data.error || 'unknown'));
        showToast('Connection failed — check Apps Script deployment');
      }
    })
    .catch(function(err) {
      setSyncStatus('error', 'Cannot reach server');
      showToast('Cannot reach server — see troubleshooting below');
      console.error('Sync ping error:', err);
    });
}

// ── Save ───────────────────────────────────────────────────
// On PWA (github.io origin) the Apps Script /macros/s/.../exec POST returns
// a 302 to script.googleusercontent.com. Per HTTP/1.1, fetch converts POST
// to GET on the follow and DROPS THE BODY, so doPost runs without
// e.postData.contents, falls through to doGet, which responds
// {ok:false, error:"No data received"}.
//
// v14 sent small saves as GET ?action=save&data=... (survives redirect).
// Realistic datasets (~37 expense rows + other tabs) still URL-encode to
// >6500 chars, so the code fell back to POST and hit the same bug.
//
// v17: if encodeURIComponent(json) >= SAVE_URL_LIMIT, send save_chunk GETs
// (see google-apps-script.js). Chunks run in small parallel batches on the PWA
// to cut wall-clock time vs strictly sequential requests.
var SAVE_URL_LIMIT = 6500;
// Raw JSON per chunk; balance URL limits vs number of round-trips.
var CHUNK_PAYLOAD_CHARS = 2200;
// How many save_chunk requests to run at once (PWA only; server uses LockService).
var SAVE_CHUNK_PARALLEL = 4;

function syncSaveChunked(fullJson) {
  var sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
  var chunks = [];
  var i;
  for (i = 0; i < fullJson.length; i += CHUNK_PAYLOAD_CHARS) {
    chunks.push(fullJson.slice(i, i + CHUNK_PAYLOAD_CHARS));
  }
  var total = chunks.length;
  if (total === 0) {
    return Promise.resolve({ ok: false, error: 'Nothing to save' });
  }
  var start = 0;
  var lastGood = null;

  function sendChunk(idx, chunk) {
    return scriptFetch(syncUrl, {
      action: 'save_chunk',
      id: sessionId,
      seq: String(idx),
      total: String(total),
      data: chunk
    }).then(function(data) {
      if (!data || !data.ok) {
        return { ok: false, error: (data && data.error) || ('Chunk ' + (idx + 1) + '/' + total + ' failed') };
      }
      return data;
    });
  }

  function runBatch() {
    if (start >= total) {
      return Promise.resolve(lastGood && lastGood.ok ? lastGood : { ok: false, error: 'Chunk save incomplete' });
    }
    var end = Math.min(start + SAVE_CHUNK_PARALLEL, total);
    var batch = [];
    for (var j = start; j < end; j++) {
      batch.push(sendChunk(j, chunks[j]));
    }
    return Promise.all(batch).then(function(results) {
      var k;
      var winner = null;
      for (k = 0; k < results.length; k++) {
        if (results[k] && results[k].ok === false) return results[k];
        if (results[k] && results[k].ok) lastGood = results[k];
        if (results[k] && results[k].ok && (results[k].saveChunkTotal || results[k].duplicate)) {
          winner = results[k];
          break;
        }
      }
      if (winner) return winner;
      start = end;
      return runBatch();
    });
  }

  return runBatch();
}

function syncSave(silent, onDone) {
  applyHardcodedSyncUrl_();
  if (!syncUrl) {
    if (!silent) showToast('Built-in sync URL missing — rebuild the app');
    if (onDone) onDone(false);
    return;
  }
  if (syncSaveBlocked || syncLoadInFlight) {
    if (onDone) onDone(false);
    return;
  }
  if (FT_FORCE_SHEET_SOURCE && !_sheetSessionLoaded) {
    if (onDone) onDone(false);
    return;
  }

  setSyncStatus('saving', 'Saving to Google Sheets…');

  var preserveTxFromBaseline = FT_FORCE_SHEET_SOURCE &&
    _sheetBaseline &&
    !_syncDirtyKinds.tx &&
    (_syncDirtyKinds.recurring || _syncDirtyKinds.meta);
  var payload = buildPayloadForSave_({ preserveTxFromBaseline: preserveTxFromBaseline });
  var json    = JSON.stringify(payload);
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
        clearSyncDirty_();
        syncPendingSave = false;
        if (data.apiVersion != null) syncApiVersion = Number(data.apiVersion);
        _syncDirtyKinds.tx = false;
        _syncDirtyKinds.recurring = false;
        _syncDirtyKinds.meta = false;
        snapshotSheetBaseline_();
        syncState.lastSaved = new Date().toISOString();
        setSyncStatus('ok', 'Saved ' + fmtTime(syncState.lastSaved));
        persistSyncState();
        if (!silent) {
          var av = Number(data.apiVersion);
          var counts = syncCountSummaryText(payload);
          if (isNaN(av) || av < 3) {
            showToast('Saved — redeploy Apps Script (google-apps-script.js v3) for unit trust tabs UTHoldings & UTNav.');
          } else if (av < 4) {
            showToast('Saved — redeploy Apps Script for UTHoldings totalCost (full amount paid incl. fees).');
          } else if (av < 6) {
            showToast('Saved — redeploy Apps Script v6 (google-apps-script.js) for merge-on-save on Sheet.');
          } else if (av < 7) {
            showToast('Saved — redeploy Apps Script v7 for catRules & savings goal on Sheet.');
          } else {
            showToast('Saved: ' + counts);
          }
        }
      } else {
        var msg = humanizeSaveApiError((data && data.error) || 'unknown');
        setSyncStatus('error', 'Save failed: ' + msg);
        if (!silent) showToast('Save failed — ' + msg);
      }
      if (onDone) onDone(!!(data && data.ok));
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
      if (onDone) onDone(false);
    });
}

function flushSyncThenLoad_(opts) {
  syncSave(true, function(ok) {
    if (!ok) {
      if (!opts.silent) {
        showToast('Could not save local changes — kept on device; try again when online');
      }
      return;
    }
    syncLoad(Object.assign({}, opts, { allowDirty: true }));
  });
}

function syncFinishLoad_(opts, ok) {
  if (opts && typeof opts.onComplete === 'function') {
    try { opts.onComplete(!!ok); } catch (e) {}
  }
}

function resetFinanceDataOnly_() {
  clearSyncDirty_();
  clearTimeout(syncTimer);
  try {
    FT_FINANCE_STORAGE_KEYS_.forEach(function(key) { localStorage.removeItem(key); });
    localStorage.removeItem('ft.lastSyncError');
    localStorage.removeItem('ft_ut_nav_snap_ymd');
    var i, k, extra = [];
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (!k || k.indexOf('ft_') !== 0) continue;
      if (k === 'ft_lock_pw_hash_v1' || k === 'ft_lock_timeout_min') continue;
      extra.push(k);
    }
    extra.forEach(function(key) { localStorage.removeItem(key); });
  } catch (e) {}
  if (typeof expenses !== 'undefined') expenses = [];
  if (typeof incomes !== 'undefined') incomes = [];
  if (typeof banks !== 'undefined') banks = [];
  if (typeof utHoldings !== 'undefined') utHoldings = [];
  if (typeof utNavPoints !== 'undefined') utNavPoints = [];
  if (typeof recurring !== 'undefined') recurring = [];
  if (typeof networthHist !== 'undefined') networthHist = [];
  if (typeof budgets !== 'undefined') budgets = {};
  if (typeof catRules !== 'undefined') catRules = {};
  if (typeof savingsGoal !== 'undefined') savingsGoal = null;
  if (typeof petrolLog !== 'undefined') petrolLog = [];
  if (typeof lastExpenseTpl !== 'undefined') lastExpenseTpl = null;
  if (typeof lastIncomeTpl !== 'undefined') lastIncomeTpl = null;
  if (typeof lastPetrolTpl !== 'undefined') lastPetrolTpl = null;
  syncState = { lastSaved: null, lastLoaded: null, status: 'idle', message: '' };
}

var _sheetPipelineBusy = false;
var _sheetPipelineRetries = 0;
var SHEET_LOAD_MAX_RETRIES = 4;

/** Cold open only: reset local cache once, then load Sheet. No reload while app is in use. */
function ensureSheetSessionLoad_(opts) {
  opts = opts || {};
  if (_sheetPipelineBusy || _sheetSessionLoaded) return;
  if (isMobileFtClient_() && !window.__ftUnlocked) return;

  applyHardcodedSyncUrl_();
  if (!syncUrl) {
    loadSyncSettings(function() { ensureSheetSessionLoad_(opts); });
    return;
  }

  _sheetPipelineBusy = true;
  if (!_sheetSessionResetDone) {
    resetFinanceDataOnly_();
    _sheetSessionResetDone = true;
  }
  if (typeof render === 'function') render();
  setSyncStatus('loading', 'Loading from spreadsheet…');

  syncLoad(Object.assign({
    skipConfirm: true,
    silent: opts.silent !== false,
    autoStart: true,
    force: true,
    allowDirty: true,
    onComplete: function(ok) {
      _sheetPipelineBusy = false;
      if (!ok && _sheetPipelineRetries < SHEET_LOAD_MAX_RETRIES) {
        _sheetPipelineRetries++;
        setTimeout(function() { ensureSheetSessionLoad_(opts); }, 900);
        return;
      }
      if (ok) {
        _sheetPipelineRetries = 0;
        if (typeof renderRecurring === 'function') renderRecurring();
        if (typeof renderBudgets === 'function') renderBudgets();
        if (typeof renderPetrolLog === 'function') renderPetrolLog();
      } else if (!opts.silent) {
        showToast('Could not load spreadsheet — try Settings → Test connection');
      }
    }
  }, opts));
}

function syncPullFromSheetAfterReset_(opts) {
  ensureSheetSessionLoad_(opts);
}

// ── Load ───────────────────────────────────────────────────
// opts.skipConfirm — silent pulls (no "REPLACE all data?" prompt)
// opts.silent       — suppress success toasts (errors still show unless silent)
// opts.autoStart    — merge cloud rows by id (keeps local-only months); still blocks empty/tiny cloud
// opts.allowDirty   — internal: load after a flush save (skips dirty gate)
var syncLoadInFlight = false;
var syncLocalDirty = false;
var syncSaveBlocked = false;
var syncPendingSave = false;
var syncApiVersion = null;

function markSyncDirty_() { syncLocalDirty = true; }
function clearSyncDirty_() { syncLocalDirty = false; }

function mergeRowsById_(localRows, cloudRows) {
  var map = {};
  (cloudRows || []).forEach(function(e) { if (e && e.id != null) map[e.id] = e; });
  (localRows || []).forEach(function(e) {
    if (e && e.id != null && !map[e.id]) map[e.id] = e;
  });
  return Object.keys(map).map(function(k) { return map[k]; });
}

function txMonthKey_(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  var s = dateStr.trim();
  if (s.indexOf('1900-01-') === 0) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  var d = typeof parseTxDate === 'function' ? parseTxDate(s) : new Date(s);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function countExpensesByMonth_(arr) {
  var out = {};
  if (!Array.isArray(arr)) return out;
  arr.forEach(function(e) {
    var ym = txMonthKey_(e && e.date);
    if (!ym) return;
    out[ym] = (out[ym] || 0) + 1;
  });
  return out;
}

function localHasMonthRowsMissingOnCloud_(localExp, cloudExp) {
  var localByM = countExpensesByMonth_(localExp);
  var cloudByM = countExpensesByMonth_(cloudExp);
  var keys = Object.keys(localByM);
  for (var i = 0; i < keys.length; i++) {
    var ym = keys[i];
    if (localByM[ym] > 0 && !(cloudByM[ym] > 0)) return true;
  }
  return false;
}

function shouldSkipCloudReplace_(prevCount, cloudExpArr) {
  var ce = (cloudExpArr || []).length;
  if (prevCount > 0 && ce === 0) return true;
  if (prevCount >= 5 && ce > 0 && ce < Math.floor(prevCount * 0.35)) return true;
  if (localHasMonthRowsMissingOnCloud_(expenses, cloudExpArr)) return true;
  return false;
}

/** Phone / narrow viewport or iOS home-screen PWA. */
function isMobileFtClient_() {
  try {
    if (window.matchMedia && window.matchMedia('(max-width: 680px)').matches) return true;
  } catch (e) {}
  try {
    if (window.navigator && window.navigator.standalone === true) return true;
  } catch (e2) {}
  return false;
}

function syncLoad(opts) {
  opts = opts || {};
  if (syncLoadInFlight && !opts.force) return;
  if (!FT_FORCE_SHEET_SOURCE && syncLocalDirty && opts.skipConfirm && !opts.allowDirty) {
    flushSyncThenLoad_(opts);
    return;
  }
  var prevExpCount = (typeof expenses !== 'undefined' && Array.isArray(expenses)) ? expenses.length : 0;
  function syncConflictMsg_(cloudExpCount) {
    return (
      'Sync conflict: device has ' +
      prevExpCount +
      ' expenses, cloud has ' +
      cloudExpCount +
      '. Kept local data. Check Google Sheets version history if rows are missing.'
    );
  }
  applyHardcodedSyncUrl_();
  if (!syncUrl) {
    if (!opts.silent) showToast('Built-in sync URL missing — rebuild the app');
    syncFinishLoad_(opts, false);
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

  clearTimeout(syncTimer);
  syncSaveBlocked = true;
  syncLoadInFlight = true;
  setSyncStatus('loading', opts.skipConfirm ? 'Syncing from cloud…' : 'Loading from Google Sheets…');

  scriptFetch(syncUrl, { action: 'load' })
    .then(function(data) {
      if (!data.ok) {
        setSyncStatus('error', 'Load failed: ' + (data.error || 'unknown'));
        if (!opts.silent) showToast('Load failed');
        syncSaveBlocked = false;
        syncLoadInFlight = false;
        syncFinishLoad_(opts, false);
        return;
      }

      try {
      var p = data.payload || {};

      // Never default missing/unparseable sheet dates to "today" — that silently moves every
      // affected row into the current month (e.g. April looks empty, May doubles).
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

      if (!FT_FORCE_SHEET_SOURCE && opts.skipConfirm && !opts.autoStart && shouldSkipCloudReplace_(prevExpCount, p.expenses)) {
        var ceSkip = (p.expenses || []).length;
        var msgSkip = syncConflictMsg_(ceSkip);
        setSyncStatus('error', msgSkip);
        if (!opts.silent) showToast(msgSkip);
        syncFinishLoad_(opts, false);
        return;
      }

      // Same rules as finance-tracker-chrome/sync.js (Sheet headers may use id / ID / Id).
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

      /** Recurring rows must not use expense sanitize (adds bogus date / strips semantics). */
      function sanitizeRecurring(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(function(e) {
          return e && typeof e === 'object';
        }).map(function(e, idx) {
          var o = Object.assign({}, e);
          delete o.date;
          var rawId = o.id;
          if (rawId === undefined || rawId === null || rawId === '') rawId = o.ID;
          if (rawId === undefined || rawId === null || rawId === '') rawId = o.Id;
          o.id = Number(rawId);
          if (!o.id || isNaN(o.id)) o.id = Date.now() + idx;
          o.name = o.name != null ? String(o.name) : '';
          o.amount = parseFloat(o.amount) || 0;
          o.type = o.type === 'inc' ? 'inc' : 'exp';
          o.cat = o.cat != null ? String(o.cat) : 'Other';
          var dRaw = o.day;
          if (dRaw === 'last' || dRaw === 'Last' || dRaw === 'LAST') o.day = 'last';
          else {
            var dn = parseInt(dRaw, 10);
            o.day = !isNaN(dn) && dn >= 1 ? Math.min(dn, 31) : 1;
          }
          o.active = !(o.active === false || o.active === 'false' || o.active === 0 || o.active === '0');
          if (o.lastApplied != null && String(o.lastApplied).trim() !== '') {
            var ls = String(o.lastApplied).trim();
            if (/^\d{4}-\d{2}$/.test(ls)) o.lastApplied = ls;
            else if (/^\d{4}-\d{2}-\d{2}$/.test(ls)) o.lastApplied = ls.slice(0, 7);
            else {
              var la = dateToYMD(sheetDateField_({ date: ls }));
              o.lastApplied = (la && la !== BAD_SHEET_DATE && /^\d{4}-\d{2}-\d{2}$/.test(la)) ? la.slice(0, 7) : null;
            }
          } else o.lastApplied = null;
          return o;
        });
      }

      var cloudExp = sanitize(p.expenses);
      var cloudInc = sanitize(p.incomes);
      var cloudBanks = sanitize(p.banks);
      if (opts.refreshOnly) {
        expenses = mergeRowsById_(expenses, cloudExp);
        incomes  = mergeRowsById_(incomes, cloudInc);
        banks    = mergeRowsById_(banks, cloudBanks);
      } else {
        expenses = cloudExp;
        incomes  = cloudInc;
        banks    = cloudBanks;
      }

      if (typeof recurring !== 'undefined') recurring = sanitizeRecurring(p.recurring);
      if (typeof budgets !== 'undefined') budgets = p.budgets || {};
      if (typeof catRules !== 'undefined') catRules = p.catRules || {};
      if (typeof savingsGoal !== 'undefined') {
        var sg = p.savingsGoal;
        if (sg && sg.target) {
          savingsGoal = {
            target: parseFloat(sg.target) || 0,
            byDate: sg.byDate != null ? String(sg.byDate) : '',
            startDate: sg.startDate != null ? String(sg.startDate) : '',
          };
        } else savingsGoal = null;
      }
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
        if (typeof utSanitizeHoldings === 'function' && typeof utHoldings !== 'undefined') {
          var cloudH = utSanitizeHoldings(arrH);
          if (utHoldings.length && typeof mergeRowsById_ === 'function') {
            utHoldings = utSanitizeHoldings(mergeRowsById_(utHoldings, cloudH));
          } else {
            utHoldings = cloudH;
          }
        }
        if (typeof utSanitizeNav === 'function' && typeof utNavPoints !== 'undefined') {
          var cloudN = utSanitizeNav(arrN);
          if (typeof mergeUtNavPoints === 'function' && utNavPoints.length) {
            utNavPoints = mergeUtNavPoints(utNavPoints, cloudN);
          } else {
            utNavPoints = cloudN;
          }
        }
      }

      saveExp(); saveInc(); saveBanks();
      if (typeof saveRec === 'function') saveRec();
      if (typeof saveBud === 'function') saveBud();
      if (typeof saveSavGoal === 'function') saveSavGoal();
      if (typeof saveCatRules === 'function') saveCatRules();
      if (typeof savePetrol === 'function') savePetrol();
      if (typeof saveNWH === 'function') saveNWH();
      if (typeof saveUtHoldings === 'function') saveUtHoldings();
      if (typeof saveUtNav === 'function') saveUtNav();

      syncState.lastLoaded = new Date().toISOString();
      setSyncStatus('ok', 'Loaded ' + fmtTime(syncState.lastLoaded));
      persistSyncState();

      render();

      // Reconcile recurring after cloud replace (fixes lost lastApplied + race with loadFeatures).
      if (typeof applyRecurring === 'function' && applyRecurring()) render();

      snapshotSheetBaseline_();

      var rowCount = expenses.length + incomes.length + banks.length;
      var countsAfterLoad = syncCountSummaryText({
        expenses: expenses,
        incomes: incomes,
        banks: banks,
        unitTrustHoldings: (typeof utHoldings !== 'undefined') ? utHoldings : [],
        unitTrustNav: (typeof utNavPoints !== 'undefined') ? utNavPoints : [],
      });
      if (rowCount === 0) {
        if (!opts.silent) {
          showToast('Loaded: ' + countsAfterLoad + ' (cloud has no expense/income/bank rows)');
        }
      } else if (!opts.silent) {
        showToast('Loaded: ' + countsAfterLoad);
      }
      syncFinishLoad_(opts, true);
      } finally {
        syncSaveBlocked = false;
        syncLoadInFlight = false;
      }
    })
    .catch(function(err) {
      syncSaveBlocked = false;
      syncLoadInFlight = false;
      var detail = (err && err.message) ? err.message : 'check connection';
      setSyncStatus('error', 'Load failed: ' + detail);
      if (!opts.silent) showToast('Load failed: ' + detail);
      console.error('Sync load error:', err);
      syncFinishLoad_(opts, false);
    });
}

// ── Auto-load on app start ─────────────────────────────────
// Fires once per page session after the local data is loaded and rendered.
// Pulls the latest Google Sheets snapshot so the iPhone PWA (which is
// killed/rehydrated aggressively by iOS) shows fresh data on every launch.
var _autoLoadFired = false;
var _sheetBootLoadScheduled = false;

function bootSheetLoadOnce_(opts) {
  if (!FT_FORCE_SHEET_SOURCE) return;
  if (_sheetSessionLoaded || _sheetBootLoadScheduled) return;
  if (isMobileFtClient_() && !window.__ftUnlocked) return;
  _sheetBootLoadScheduled = true;
  setTimeout(function() { ensureSheetSessionLoad_(opts || { silent: true }); }, 80);
}

function syncAutoLoad() {
  if (FT_FORCE_SHEET_SOURCE) {
    bootSheetLoadOnce_({ silent: true });
    return;
  }
  if (_autoLoadFired) return;
  if (!syncUrl) return;
  if (isMobileFtClient_() && !window.__ftUnlocked) return;
  _autoLoadFired = true;
  setTimeout(function() {
    syncLoad({ skipConfirm: true, silent: true, autoStart: true });
  }, 120);
}

window.addEventListener('ft-app-ready', syncAutoLoad);

window.addEventListener('ft-unlocked', function() {
  if (!FT_FORCE_SHEET_SOURCE) {
    if (!isMobileFtClient_()) return;
    setTimeout(function() {
      syncLoad({ skipConfirm: true, silent: true, autoStart: true, force: true });
    }, 100);
    return;
  }
  _sheetBootLoadScheduled = false;
  setTimeout(function() { ensureSheetSessionLoad_({ silent: true }); }, 100);
});

function scheduleDebouncedSheetPull_() {
  if (FT_FORCE_SHEET_SOURCE) return;
  clearTimeout(scheduleDebouncedSheetPull_._t);
  scheduleDebouncedSheetPull_._t = setTimeout(function() {
    if (!syncUrl || syncLoadInFlight) return;
    syncPullFromSheetAfterReset_({ silent: true });
  }, 500);
}
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') scheduleDebouncedSheetPull_();
});
window.addEventListener('pageshow', function(ev) {
  if (ev.persisted) scheduleDebouncedSheetPull_();
});

// ── Auto-sync (debounced, triggered by save functions) ──────
var syncTimer = null;

function scheduleAutoSync() {
  if (!syncUrl) return;
  if (FT_FORCE_SHEET_SOURCE && (!_sheetSessionLoaded || syncLoadInFlight || syncSaveBlocked)) {
    if (syncLocalDirty) syncPendingSave = true;
    return;
  }
  syncPendingSave = false;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() { syncSave(true); }, 2800);
}

// Patch save* functions to trigger auto-sync. app.js defines saveExp/Inc/Banks
// before this file; features.js / extras.js define saveRec/Bud/Petrol/NWH after,
// so we hook the first three immediately and the rest on window load.
(function() {
  function wrapSave(name) {
    var cur = typeof window[name] === 'function' ? window[name] : null;
    if (!cur || cur.__ftSyncHooked) return;
    var orig = cur;
    window[name] = function() {
      orig.apply(this, arguments);
      if (name === 'saveExp' || name === 'saveInc' || name === 'saveBanks' || name === 'saveUtHoldings' || name === 'saveUtNav') {
        _syncDirtyKinds.tx = true;
      } else if (name === 'saveRec') {
        _syncDirtyKinds.recurring = true;
      } else {
        _syncDirtyKinds.meta = true;
      }
      markSyncDirty_();
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
    wrapSave('saveSavGoal');
    wrapSave('saveCatRules');
  }
  // Runs after remaining <script> tags (features.js, extras.js) in this document.
  setTimeout(hookDeferredSaves, 0);
})();

// ── UI ─────────────────────────────────────────────────────
function syncDataCounts() {
  var rulesN = (typeof catRules !== 'undefined' && catRules) ? Object.keys(catRules).length : 0;
  return {
    expenses: (expenses || []).length,
    incomes: (incomes || []).length,
    banks: (banks || []).length,
    catRules: rulesN,
  };
}

function setSyncStatus(status, message) {
  syncState.status  = status;
  syncState.message = message;
  if (status === 'ok' || status === 'error') {
    syncState.counts = syncDataCounts();
  }
  persistSyncState();
  updateSyncUI();
}

function fmtRelativeTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 172800) return 'yesterday';
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function updateSyncUI() {
  var dot = document.getElementById('sync-dot');
  var msg = document.getElementById('sync-msg');
  var detail = document.getElementById('sync-detail');
  var disp = document.getElementById('sync-url-display');

  if (disp) disp.textContent = syncUrl || '';

  var counts = syncState.counts || syncDataCounts();
  var expEl = document.getElementById('settings-count-exp');
  var incEl = document.getElementById('settings-count-inc');
  var bankEl = document.getElementById('settings-count-bank');
  if (expEl) expEl.textContent = counts.expenses;
  if (incEl) incEl.textContent = counts.incomes;
  if (bankEl) bankEl.textContent = counts.banks;
  var rulesEl = document.getElementById('settings-count-rules');
  if (rulesEl) rulesEl.textContent = counts.catRules != null ? counts.catRules : '0';

  var buildChip = document.getElementById('settings-build-chip');
  if (buildChip && window.FT_BUILD) buildChip.textContent = 'v' + FT_BUILD.ver;

  var hero = document.getElementById('settings-hero-status');
  if (hero) {
    if (syncPendingSave && syncLocalDirty) {
      hero.textContent = 'Changes queued — will sync when Sheet load finishes';
    } else if (syncState.status === 'error' && syncState.message) {
      hero.textContent = syncState.message;
    } else if (syncState.lastSaved) {
      hero.textContent = 'Last saved to Sheet ' + fmtRelativeTime(syncState.lastSaved);
    } else if (syncState.lastLoaded) {
      hero.textContent = 'Last loaded from Sheet ' + fmtRelativeTime(syncState.lastLoaded);
    } else if (syncUrl) {
      hero.textContent = 'Connected — edits auto-save after a short pause';
    } else {
      hero.textContent = 'Your data stays on this device until you sync.';
    }
  }

  var pill = document.getElementById('settings-sync-pill');
  if (pill) {
    var pillText = {
      idle: syncUrl ? '● Ready to sync' : '○ Sync not set up',
      saving: '↑ Saving…',
      loading: '↓ Loading…',
      ok: '✓ Sync OK',
      error: '✗ Sync error'
    };
    pill.textContent = pillText[syncState.status] || '○ Sync';
    pill.className = 'settings-sync-pill';
    if (syncState.status === 'ok') pill.classList.add('settings-sync-pill--ok');
    else if (syncState.status === 'error') pill.classList.add('settings-sync-pill--err');
    else if (syncState.status === 'saving' || syncState.status === 'loading') pill.classList.add('settings-sync-pill--warn');
  }

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
    msg.textContent = syncUrl ? 'Auto-saves ~3 s after changes' : 'Sync URL not set in app build';
  }
  msg.style.color = syncState.status === 'error' ? 'var(--red)' : 'var(--ink3)';

  if (detail) {
    var parts = [];
    var c = syncState.counts;
    if (c) {
      parts.push(c.expenses + ' expenses · ' + c.incomes + ' income · ' + c.banks + ' banks');
      if (c.catRules != null) parts.push(c.catRules + ' learned categories');
    }
    if (syncApiVersion != null && !isNaN(syncApiVersion)) {
      parts.push('Sheet API v' + syncApiVersion);
    }
    if (syncPendingSave && syncLocalDirty) {
      parts.push('Pending sync (waiting for Sheet)');
    }
    if (syncState.lastSaved) {
      parts.push('Last saved ' + fmtRelativeTime(syncState.lastSaved) + ' (' + fmtTime(syncState.lastSaved) + ')');
    }
    if (syncState.lastLoaded) {
      parts.push('Last loaded ' + fmtRelativeTime(syncState.lastLoaded));
    }
    if (syncState.status === 'error' && syncState.message) {
      parts.push(syncState.message);
    }
    detail.textContent = parts.length ? parts.join(' · ') : 'Opens or returns to the app: loads from your Sheet. Edits auto-save after a short pause.';
    detail.style.color = syncState.status === 'error' ? 'var(--red)' : 'var(--ink3)';
  }
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

  if (pingBtn) pingBtn.addEventListener('click', syncPing);
  if (saveBtn) saveBtn.addEventListener('click', function() { syncSave(false); });
  if (loadBtn) loadBtn.addEventListener('click', function() { syncLoad(); });
}

// ── Init ───────────────────────────────────────────────────
loadSyncSettings(function() {
  wireSyncUI();
  if (FT_FORCE_SHEET_SOURCE) {
    bootSheetLoadOnce_({ silent: true });
  } else if (window.__ftAppReady) {
    syncAutoLoad();
  }
});
