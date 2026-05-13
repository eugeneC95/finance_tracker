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
//  Deploy → New deployment (not Manage deployments) to get a new URL.
//  Or use "Manage deployments → Edit" to update the existing one.
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

// ── All requests come in as GET ────────────────────────────
// action=ping                          → test connection
// action=save&data=<url-encoded-json>  → save all data
// action=load                          → return all data
function doGet(e) {
  var action = (e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
  var result;

  try {
    if (action === 'ping') {
      result = { ok: true, message: 'Finance Tracker connected successfully' };

    } else if (action === 'save') {
      var raw = e.parameter.data || '';
      if (!raw) {
        result = { ok: false, error: 'No data received' };
      } else {
        var payload = JSON.parse(decodeURIComponent(raw));
        saveAllData(payload);
        result = { ok: true, saved: new Date().toISOString() };
      }

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

// ── doPost kept for compatibility ──────────────────────────
function doPost(e) {
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
