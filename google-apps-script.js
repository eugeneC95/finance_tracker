// ============================================================
//  Finance Tracker — Google Apps Script Backend v8 (fix _Meta save range)
//
//  WEB APP (already in sync.js — do not change unless you create a new deployment):
//  https://script.google.com/macros/s/AKfycbyoAUYxXl55wCVZzuZ2e8nIWus2V0NeGxtUA4_vQucPWkeyl7XN88kGXkyIjEkB6TF8/exec
//
//  UPDATE LIVE SCRIPT (required after editing this file):
//  1. script.google.com → open the project for the URL above
//  2. Replace all code with this file → Save
//  3. Deploy → Manage deployments → Edit (pencil) on the Web app
//  4. Version: New version → Deploy (same /exec URL)
//  5. Verify: node scripts/verify-apps-script.mjs  →  apiVersion 8
//
//  See scripts/APPS_SCRIPT_DEPLOY.md in the repo for full steps.
// ============================================================

var SHEET_NAME = 'Finance Tracker';
var API_VERSION = 8;

// ── Get or create spreadsheet ──────────────────────────────
function getOrCreateSheet(tabName) {
  var ss;
  var files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
  }
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  return sheet;
}

// Web app URL must not include ?query — clients may append &action=… twice otherwise.
// e.parameters.action is either a string OR an array (one entry per repeated ?action=).
// BUG (fixed v5): if it is a string like "save_chunk", then action[length-1] is only the
// last CHARACTER ("k"), so save_chunk never matched and the server returned Unknown action.
function normalizeAction_(e) {
  function clean(s) {
    return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '').toLowerCase();
  }
  var raw = null;
  if (e && e.parameters && e.parameters.action != null && e.parameters.action !== '') {
    var x = e.parameters.action;
    if (typeof x === 'string') {
      raw = x;
    } else if (typeof x === 'number') {
      raw = String(x);
    } else if (typeof x.length === 'number' && x.length > 0) {
      var piece = x[x.length - 1];
      raw = typeof piece === 'string' ? piece : String(piece);
    }
  }
  if ((raw == null || raw === '') && e && e.parameter && e.parameter.action) {
    raw = e.parameter.action;
  }
  var a = clean(raw || 'ping');
  return a || 'ping';
}

// ── Request entry points ───────────────────────────────────
// GET  ?action=ping                          → test connection
// GET  ?action=load                          → return all data
// GET  ?action=save&data=<json>              → save (small payloads; data is already URL-decoded by Apps Script)
// GET  ?action=save_chunk&id=&seq=&total=&data= → save (large payloads; see handleSaveChunk_)
// POST ?action=save  body: <raw JSON>        → save (Chrome extension / no redirect issues)
function handleSaveChunk_(e) {
  var chunkId = (e.parameter && e.parameter.id) ? String(e.parameter.id) : '';
  var seqStr = (e.parameter && e.parameter.seq !== undefined && e.parameter.seq !== null) ? String(e.parameter.seq) : '';
  var totStr = (e.parameter && e.parameter.total) ? String(e.parameter.total) : '';
  var part = (e.parameter && e.parameter.data !== undefined && e.parameter.data !== null) ? String(e.parameter.data) : '';

  if (!chunkId || seqStr === '' || totStr === '') {
    return { ok: false, error: 'save_chunk: missing id, seq, or total' };
  }

  var seq = parseInt(seqStr, 10);
  var total = parseInt(totStr, 10);
  if (isNaN(seq) || isNaN(total) || total < 1 || seq < 0 || seq >= total) {
    return { ok: false, error: 'save_chunk: invalid seq or total' };
  }

  var cache = CacheService.getScriptCache();
  var keyPrefix = 'ftc_' + chunkId + '_';
  cache.put(keyPrefix + seqStr, part, 600);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var parts = [];
    var i;
    for (i = 0; i < total; i++) {
      var piece = cache.get(keyPrefix + i);
      if (piece === null) {
        var allGone = true;
        var g;
        for (g = 0; g < total; g++) {
          if (cache.get(keyPrefix + g) !== null) {
            allGone = false;
            break;
          }
        }
        if (allGone) {
          return { ok: true, saved: new Date().toISOString(), duplicate: true, apiVersion: API_VERSION };
        }
        return { ok: true, partial: true, need: i };
      }
      parts.push(piece);
    }

    var fullJson = parts.join('');
    var payload = JSON.parse(fullJson);
    for (i = 0; i < total; i++) {
      cache.remove(keyPrefix + i);
    }
    saveAllData(payload);
    return { ok: true, saved: new Date().toISOString(), saveChunkTotal: total, apiVersion: API_VERSION };
  } catch (err) {
    return { ok: false, error: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = normalizeAction_(e);
  var result;

  try {
    if (action === 'ping') {
      result = {
        ok: true,
        message: 'Finance Tracker connected successfully',
        apiVersion: API_VERSION,
      };

    } else if (action === 'save') {
      var raw = (e.parameter && e.parameter.data) ? e.parameter.data : '';
      if (!raw) {
        result = { ok: false, error: 'No data received' };
      } else {
        // Apps Script already URL-decodes e.parameter.* — do NOT decodeURIComponent again
        // or JSON containing a literal % (e.g. "50% off" in a note) throws URIError.
        var payload = JSON.parse(raw);
        saveAllData(payload);
        result = { ok: true, saved: new Date().toISOString(), apiVersion: API_VERSION };
      }

    } else if (action === 'save_chunk') {
      result = handleSaveChunk_(e);

    } else if (action === 'load') {
      result = { ok: true, payload: loadAllData() };

    } else {
      result = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST body save works for the Chrome extension (background fetch keeps the body
// across redirects). The PWA uses GET save / save_chunk instead because fetch()
// drops POST bodies when following Apps Script's 302.
function doPost(e) {
  try {
    var action = normalizeAction_(e);
    if (action === 'save' && e.postData && e.postData.contents) {
      var payload = JSON.parse(e.postData.contents);
      saveAllData(payload);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, saved: new Date().toISOString(), apiVersion: API_VERSION }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return doGet(e);
}

// ── Save all data tabs (merge with existing Sheet rows — never wipe missing months) ──

function catRulesToRows(obj) {
  return Object.keys(obj || {}).sort().map(function(k) {
    return { key: k, cat: obj[k] };
  });
}

function rowsToCatRules(rows) {
  var o = {};
  (rows || []).forEach(function(r) {
    if (r && r.key != null && String(r.key) !== '') o[String(r.key)] = String(r.cat || '');
  });
  return o;
}

function mergeCatRulesRows_(incoming, existing) {
  var map = {};
  (existing || []).forEach(function(r) {
    if (r && r.key != null) map[String(r.key)] = r;
  });
  (incoming || []).forEach(function(r) {
    if (r && r.key != null) map[String(r.key)] = r;
  });
  return Object.keys(map).map(function(k) { return map[k]; });
}

function savingsGoalToRows(g) {
  if (!g || !g.target) return [];
  return [{ target: g.target, byDate: g.byDate || '', startDate: g.startDate || '' }];
}

function rowsToSavingsGoal(rows) {
  if (!rows || !rows.length) return null;
  var r = rows[0];
  var t = parseFloat(r.target);
  if (isNaN(t) || t <= 0) return null;
  return { target: t, byDate: String(r.byDate || ''), startDate: String(r.startDate || '') };
}

function normalizeRowId_(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  var n = Number(raw);
  return isNaN(n) ? String(raw) : n;
}

function rowMonthKey_(row, dateCol) {
  if (!row || !dateCol) return '';
  var v = row[dateCol];
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0');
  }
  var s = String(v).trim();
  if (s.indexOf('1900-01-') === 0) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 7);
  return '';
}

function countRowsByMonth_(rows, dateCol) {
  var out = {};
  (rows || []).forEach(function(r) {
    var ym = rowMonthKey_(r, dateCol);
    if (ym) out[ym] = (out[ym] || 0) + 1;
  });
  return out;
}

/** Incoming save missing whole months still on the Sheet — keep those rows. */
function incomingLooksIncomplete_(incoming, existing, dateCol) {
  var inc = incoming || [];
  var ex = existing || [];
  if (dateCol) {
    var incM = countRowsByMonth_(inc, dateCol);
    var exM = countRowsByMonth_(ex, dateCol);
    var keys = Object.keys(exM);
    for (var i = 0; i < keys.length; i++) {
      if (exM[keys[i]] > 0 && !(incM[keys[i]] > 0)) return true;
    }
  }
  if (ex.length > 0 && inc.length === 0) return true;
  if (ex.length >= 8 && inc.length > 0 && inc.length < Math.floor(ex.length * 0.45)) return true;
  return false;
}

function mergeIdRows_(incoming, existing, dateCol) {
  var map = {};
  (incoming || []).forEach(function(r) {
    var id = normalizeRowId_(r.id);
    if (id != null) map[String(id)] = r;
  });
  if (incomingLooksIncomplete_(incoming, existing, dateCol)) {
    (existing || []).forEach(function(r) {
      var id = normalizeRowId_(r.id);
      if (id != null && !map[String(id)]) map[String(id)] = r;
    });
  }
  return Object.keys(map).map(function(k) { return map[k]; });
}

function mergeDateKeyedRows_(incoming, existing, dateCol) {
  var map = {};
  (incoming || []).forEach(function(r) {
    var d = r[dateCol];
    if (d !== undefined && d !== null && d !== '') map[String(d)] = r;
  });
  if (incomingLooksIncomplete_(incoming, existing, dateCol)) {
    (existing || []).forEach(function(r) {
      var d = r[dateCol];
      if (d !== undefined && d !== null && d !== '' && !map[String(d)]) map[String(d)] = r;
    });
  }
  return Object.keys(map).map(function(k) { return map[k]; });
}

function mergeUtNavRows_(incoming, existing) {
  var map = {};
  (incoming || []).forEach(function(r) {
    var k = String(r.fundId || '') + '|' + String(r.date || '');
    if (k !== '|') map[k] = r;
  });
  if (incomingLooksIncomplete_(incoming, existing, 'date')) {
    (existing || []).forEach(function(r) {
      var k = String(r.fundId || '') + '|' + String(r.date || '');
      if (k !== '|' && !map[k]) map[k] = r;
    });
  }
  return Object.keys(map).map(function(k) { return map[k]; });
}

function writeTabMerged_(tabName, incomingRows, cols, dateCol) {
  var existing = readTab(tabName);
  var merged = mergeIdRows_(incomingRows, existing, dateCol);
  writeTab(tabName, merged, cols);
}

function saveAllData(payload) {
  writeTabMerged_('Expenses', payload.expenses || [], ['id','name','amount','cat','date','note','auto'], 'date');
  writeTabMerged_('Income', payload.incomes || [], ['id','name','amount','cat','date','note','auto'], 'date');
  writeTabMerged_('Banks', payload.banks || [], ['id','name','acct','balance','currency'], null);
  writeTabMerged_('Recurring', payload.recurring || [], ['id','name','amount','type','cat','day','active','lastApplied'], null);
  writeTabMerged_('Petrol', payload.petrolLog || [], ['id','station','litres','ppl','odo','date','total'], 'date');
  writeTabMerged_('UTHoldings', payload.unitTrustHoldings || [], ['id','name','fundCode','units','totalCost','purchaseDate','notes'], null);

  var existingNw = readTab('NetWorth');
  var mergedNw = mergeDateKeyedRows_(payload.networthHist || [], existingNw, 'date');
  writeTab('NetWorth', mergedNw, ['date','total']);

  var existingNav = readTab('UTNav');
  var mergedNav = mergeUtNavRows_(payload.unitTrustNav || [], existingNav);
  writeTab('UTNav', mergedNav, ['fundId','date','nav']);

  var existingBud = readTab('Budgets');
  var mergedBudObj = rowsToBudgets(existingBud);
  var incBud = payload.budgets || {};
  if (Object.keys(incBud).length === 0 && existingBud.length > 0) {
    writeTab('Budgets', existingBud, ['cat','amount']);
  } else {
    Object.keys(incBud).forEach(function(k) { mergedBudObj[k] = incBud[k]; });
    writeTab('Budgets', budgetsToRows(mergedBudObj), ['cat','amount']);
  }

  var existingCR = readTab('CatRules');
  var mergedCR = mergeCatRulesRows_(catRulesToRows(payload.catRules || {}), existingCR);
  writeTab('CatRules', mergedCR, ['key', 'cat']);

  var sgRows = savingsGoalToRows(payload.savingsGoal);
  var existingSG = readTab('SavingsGoal');
  if (!sgRows.length && existingSG.length) {
    writeTab('SavingsGoal', existingSG, ['target', 'byDate', 'startDate']);
  } else {
    writeTab('SavingsGoal', sgRows, ['target', 'byDate', 'startDate']);
  }

  var meta = getOrCreateSheet('_Meta');
  meta.clearContents();
  meta.getRange(1, 1, 2, 2).setValues([
    ['lastSaved', new Date().toISOString()],
    ['apiVersion', API_VERSION],
  ]);
}

function writeTab(tabName, rows, cols) {
  var sheet = getOrCreateSheet(tabName);
  sheet.clearContents();
  var data = [cols];
  rows.forEach(function(row) {
    data.push(cols.map(function(col) {
      var v = row[col];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return v.toString();
      if (typeof v === 'object')  return JSON.stringify(v);
      return v;
    }));
  });
  if (data.length > 1) {
    sheet.getRange(1, 1, data.length, cols.length).setValues(data);
  } else {
    sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
}

// ── Load all data tabs ─────────────────────────────────────
function loadAllData() {
  return {
    expenses:     readTab('Expenses'),
    incomes:      readTab('Income'),
    banks:        readTab('Banks'),
    recurring:    readTab('Recurring'),
    budgets:      rowsToBudgets(readTab('Budgets')),
    catRules:     rowsToCatRules(readTab('CatRules')),
    savingsGoal:  rowsToSavingsGoal(readTab('SavingsGoal')),
    petrolLog:    readTab('Petrol'),
    networthHist: readTab('NetWorth'),
    unitTrustHoldings: readTab('UTHoldings'),
    unitTrustNav:      readTab('UTNav'),
  };
}

function readTab(tabName) {
  var sheet = getOrCreateSheet(tabName);
  var last  = sheet.getLastRow();
  if (last < 2) return [];
  var raw  = sheet.getRange(1, 1, last, sheet.getLastColumn()).getValues();
  var cols = raw[0];
  var rows = [];
  for (var i = 1; i < raw.length; i++) {
    var obj = {};
    var hasValue = false;
    cols.forEach(function(col, ci) {
      var v = raw[i][ci];
      if (v === '' || v === null || v === undefined) { obj[col] = null; return; }
      hasValue = true;
      // Google Sheets auto-converts date strings to Date objects — convert back
      if (v instanceof Date) {
        var yyyy = v.getFullYear();
        var mm   = String(v.getMonth()+1).padStart(2,'0');
        var dd   = String(v.getDate()).padStart(2,'0');
        obj[col] = yyyy+'-'+mm+'-'+dd;
        return;
      }
      if (typeof v === 'number')  { obj[col] = v; return; }
      if (v === 'true')           { obj[col] = true;  return; }
      if (v === 'false')          { obj[col] = false; return; }
      if (typeof v === 'string' && (v.charAt(0) === '{' || v.charAt(0) === '[')) {
        try { obj[col] = JSON.parse(v); return; } catch(e) {}
      }
      obj[col] = v;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function budgetsToRows(obj) {
  return Object.keys(obj).map(function(k) { return { cat: k, amount: obj[k] }; });
}

function rowsToBudgets(rows) {
  var obj = {};
  rows.forEach(function(r) { if (r && r.cat) obj[r.cat] = Number(r.amount) || 0; });
  return obj;
}
