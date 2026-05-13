// ============================================================
//  Finance Tracker — Google Apps Script Backend v2
//
//  SETUP INSTRUCTIONS:
//  1. Go to https://script.google.com
//  2. Click "New project", delete all existing code
//  3. Paste this entire file
//  4. Click Save (Ctrl+S), name it "Finance Tracker Sync"
//  5. Click Deploy → New deployment
//     - Type: Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  6. Click Deploy → copy the Web App URL
//  7. In the extension: Settings → Google Sheets Sync → paste URL → Test connection
//
//  NOTE: Every time you change this script, you must
//  Deploy → Manage deployments → Edit → select the active deployment →
//  Version: "New version" → Deploy. (Or create a brand-new deployment.)
//  Without a new version, Google keeps running the old code.
// ============================================================

var SHEET_NAME = 'Finance Tracker';

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
          return { ok: true, saved: new Date().toISOString(), duplicate: true };
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
    return { ok: true, saved: new Date().toISOString(), saveChunkTotal: total };
  } catch (err) {
    return { ok: false, error: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = (e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
  var result;

  try {
    if (action === 'ping') {
      result = { ok: true, message: 'Finance Tracker connected successfully' };

    } else if (action === 'save') {
      var raw = (e.parameter && e.parameter.data) ? e.parameter.data : '';
      if (!raw) {
        result = { ok: false, error: 'No data received' };
      } else {
        // Apps Script already URL-decodes e.parameter.* — do NOT decodeURIComponent again
        // or JSON containing a literal % (e.g. "50% off" in a note) throws URIError.
        var payload = JSON.parse(raw);
        saveAllData(payload);
        result = { ok: true, saved: new Date().toISOString() };
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
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
    if (action === 'save' && e.postData && e.postData.contents) {
      var payload = JSON.parse(e.postData.contents);
      saveAllData(payload);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, saved: new Date().toISOString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return doGet(e);
}

// ── Save all data tabs ─────────────────────────────────────
function saveAllData(payload) {
  writeTab('Expenses',  payload.expenses     || [], ['id','name','amount','cat','date','note','auto']);
  writeTab('Income',    payload.incomes      || [], ['id','name','amount','cat','date','note','auto']);
  writeTab('Banks',     payload.banks        || [], ['id','name','acct','balance']);
  writeTab('Recurring', payload.recurring    || [], ['id','name','amount','type','cat','day','active','lastApplied']);
  writeTab('Budgets',   budgetsToRows(payload.budgets || {}), ['cat','amount']);
  writeTab('Petrol',    payload.petrolLog    || [], ['id','station','litres','ppl','odo','date','total']);
  writeTab('NetWorth',  payload.networthHist || [], ['date','total']);

  var meta = getOrCreateSheet('_Meta');
  meta.clearContents();
  meta.getRange(1,1,1,2).setValues([['lastSaved', new Date().toISOString()]]);
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
    petrolLog:    readTab('Petrol'),
    networthHist: readTab('NetWorth'),
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
