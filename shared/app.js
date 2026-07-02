'use strict';

// Sheet is the source of truth on every open (sync.js scrubs cache and reloads).
window.__ftForceSheetSource = true;

// ── localStorage adapter (replaces chrome.storage for PWA) ─
var chromeStorage = {
  local: {
    get: function(keys, cb) {
      var result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach(function(k) {
        try { var v = localStorage.getItem(k); result[k] = v ? JSON.parse(v) : undefined; }
        catch(e) { result[k] = undefined; }
      });
      cb(result);
    },
    set: function(obj, cb) {
      Object.keys(obj).forEach(function(k) {
        try { localStorage.setItem(k, JSON.stringify(obj[k])); } catch(e) {}
      });
      if (cb) cb();
    },
    remove: function(keys, cb) {
      (Array.isArray(keys) ? keys : [keys]).forEach(function(k) { localStorage.removeItem(k); });
      if (cb) cb();
    }
  }
};

// ── Category definitions ───────────────────────────────────
const EXP_CATS = {
  // Food & drink
  'Food':          { icon:'FD', color:'#1D9E75' },
  'Groceries':     { icon:'GR', color:'#2D9E5A' },
  'Eating out':    { icon:'EO', color:'#3DBE7A' },
  'Coffee':        { icon:'CF', color:'#7B5EA7' },
  // Shopping
  'Shopping':      { icon:'SH', color:'#D85A30' },
  'Clothing':      { icon:'CL', color:'#E07040' },
  'Electronics':   { icon:'EL', color:'#3A86FF' },
  // Home
  'Rent':          { icon:'RE', color:'#BA7517' },
  'Utilities':     { icon:'UT', color:'#D4A017' },
  'Internet':      { icon:'IN', color:'#5B8DEF' },
  'Renovation':    { icon:'RN', color:'#8B6914' },
  // Health
  'Health':        { icon:'HE', color:'#D4537E' },
  'Fitness':       { icon:'FI', color:'#E8547E' },
  'Grooming':      { icon:'GO', color:'#C4678E' },
  // Bills & finance
  'Bills':         { icon:'BI', color:'#8B6220' },
  'Insurance':     { icon:'IS', color:'#6B7DB3' },
  'Loan payment':  { icon:'LP', color:'#4A6FA5' },
  'Tax':           { icon:'TX', color:'#666666' },
  // Car
  'Petrol':        { icon:'PT', color:'#E24B4A' },
  'Car Service':   { icon:'CS', color:'#378ADD' },
  'Car Repair Labour': { icon:'CR', color:'#2E7DCE' },
  'Car Parts':     { icon:'CP', color:'#5D7FA3' },
  'Tyre Service':  { icon:'TS', color:'#6D7A86' },
  'Toll':          { icon:'TL', color:'#888780' },
  'Parking':       { icon:'PK', color:'#78909C' },
  'Car Expenses':  { icon:'CE', color:'#5F5E5A' },
  'Car Insurance': { icon:'CI', color:'#4472CA' },
  // Transport
  'Transport':     { icon:'TR', color:'#63A0C8' },
  'Flight':        { icon:'FL', color:'#1A73E8' },
  // Entertainment
  'Entertainment': { icon:'EN', color:'#7F77DD' },
  'Subscription':  { icon:'SU', color:'#9B59B6' },
  'Travel':        { icon:'TV', color:'#1ABC9C' },
  'Hobbies':       { icon:'HB', color:'#E91E63' },
  // Family
  'Education':     { icon:'ED', color:'#2196F3' },
  
  // Other
  'Other':         { icon:'OT', color:'#B4B2A9' },
  'Pet care':      { icon:'PC', color:'#795548' },
};

/** Display order for “Add expense” category chips: frequent / similar items first. */
const EXP_CAT_GROUPS = [
  { title: 'Everyday & dining', cats: ['Food', 'Groceries', 'Eating out', 'Coffee'] },
  { title: 'Shopping & gear', cats: ['Shopping', 'Clothing', 'Electronics'] },
  { title: 'Home & utilities', cats: ['Rent', 'Utilities', 'Internet', 'Renovation'] },
  { title: 'Health & self-care', cats: ['Health', 'Fitness', 'Grooming'] },
  { title: 'Bills & finance', cats: ['Bills', 'Insurance', 'Loan payment', 'Tax'] },
  { title: 'Car & travel', cats: ['Petrol', 'Car Service', 'Car Repair Labour', 'Car Parts', 'Tyre Service', 'Toll', 'Parking', 'Car Expenses', 'Car Insurance', 'Transport', 'Flight'] },
  { title: 'Fun & leisure', cats: ['Entertainment', 'Subscription', 'Travel', 'Hobbies'] },
  { title: 'Education & family', cats: ['Education', 'Pet care'] },
  { title: 'Other', cats: ['Other'] },
];

/** Category-specific icon symbols for expense badges/chips. */
const EXP_CAT_ICON_IDS = {
  'Food': 'cat-food',
  'Groceries': 'cat-groceries',
  'Eating out': 'cat-eating',
  'Coffee': 'cat-coffee',
  'Shopping': 'cat-shopping',
  'Clothing': 'cat-clothing',
  'Electronics': 'cat-electronics',
  'Rent': 'cat-home',
  'Utilities': 'cat-utilities',
  'Internet': 'cat-internet',
  'Renovation': 'cat-renovation',
  'Health': 'cat-health',
  'Fitness': 'cat-fitness',
  'Grooming': 'cat-grooming',
  'Bills': 'cat-bills',
  'Insurance': 'cat-insurance',
  'Loan payment': 'cat-loan',
  'Tax': 'cat-tax',
  'Petrol': 'cat-petrol',
  'Car Service': 'cat-car-service',
  'Car Repair Labour': 'cat-car-service',
  'Car Parts': 'cat-car-parts',
  'Tyre Service': 'cat-tyre',
  'Toll': 'cat-toll',
  'Parking': 'cat-parking',
  'Car Expenses': 'cat-car',
  'Car Insurance': 'cat-car-insurance',
  'Transport': 'cat-transport',
  'Flight': 'cat-flight',
  'Entertainment': 'cat-entertainment',
  'Subscription': 'cat-subscription',
  'Travel': 'cat-travel',
  'Hobbies': 'cat-hobbies',
  'Education': 'cat-education',
  'Pet care': 'cat-pet',
  'Other': 'cat-other',
};

const INC_CATS = {
  'Salary':      { icon:'SA', color:'#1D9E75' },
  'Bonus':       { icon:'BO', color:'#2DBE8A' },
  'Freelance':   { icon:'FR', color:'#378ADD' },
  'Business':    { icon:'BU', color:'#BA7517' },
  'Unit Trust':  { icon:'UT', color:'#7F77DD' },
  'Dividend':    { icon:'DV', color:'#9B59B6' },
  'Investment':  { icon:'IV', color:'#5B4DB5' },
  'Rental':      { icon:'RE', color:'#D85A30' },
  'Side income': { icon:'SI', color:'#FF9800' },
  'Cashback':    { icon:'CB', color:'#00BCD4' },
  'Gift':        { icon:'GF', color:'#D4537E' },
  'Refund':      { icon:'RF', color:'#607D8B' },
  'Other':       { icon:'OT', color:'#B4B2A9' },
};

// ── Storage keys ───────────────────────────────────────────
const KEY_EXP   = 'expenses_v2';
const KEY_INC   = 'incomes_v1';
const KEY_BANKS = 'banks_v1';
const KEY_SETS  = 'settings_v1';
const KEY_UT_HOLD = 'unit_trust_holdings_v1';
const KEY_UT_NAV  = 'unit_trust_nav_v1';
const KEY_LAST_EXP = 'last_expense_v1';
const KEY_LAST_INC = 'last_income_v1';

// ── Storage read generation (avoid stale load() overwriting a fresh Sheet load)
let _storageReadGen = 0;
function bumpStorageReadGeneration() { _storageReadGen++; }

// ── State ──────────────────────────────────────────────────
let expenses = [], incomes = [], banks = [];
let utHoldings = [];
let utNavPoints = [];
let settings = { dark:false, darkSchedule:'off', fontSize:'fs-md', currency:'RM', showDrag:true, compact:false, nwAutoSnapshot:true, lockTimeoutMin:5, notifyRecurring:true, petrolFullTankOnly:false };
let lastExpenseTpl = null;
let lastIncomeTpl = null;
let viewMonth = new Date(); viewMonth.setDate(1);
let activeFilter = 'All';
let selectedCat  = 'Food';

// ── Helpers (pure utils from shared/core via main.js) ───────
function ftCore_() {
  return globalThis.ftCore || {};
}
function todayStr() {
  const fn = ftCore_().todayStr;
  return fn ? fn() : new Date().toISOString().slice(0, 10);
}
function fmt(n) {
  const fn = ftCore_().fmtAmount;
  return fn ? fn(n, settings.currency || 'RM') : String(n);
}

const BANK_CURRENCIES = {
  MYR: { symbol: 'RM',  label: 'MYR', decimals: 2 },
  SGD: { symbol: 'SGD', label: 'SGD', decimals: 2 },
  USD: { symbol: 'USD', label: 'USD', decimals: 2 },
  JPY: { symbol: 'JPY', label: 'JPY', decimals: 0 },
};

function normalizeBankCurrency(c) {
  const u = String(c || '').trim().toUpperCase();
  if (u === 'RM') return 'MYR';
  return BANK_CURRENCIES[u] ? u : 'MYR';
}

function defaultFxRates() {
  return { MYR: 1, SGD: 3.10, USD: 4.50, JPY: 0.028 };
}

function ensureFxRates() {
  if (!settings.fxRates || typeof settings.fxRates !== 'object') settings.fxRates = defaultFxRates();
  else settings.fxRates = Object.assign({}, defaultFxRates(), settings.fxRates);
  settings.fxRates.MYR = 1;
}

function fxRateToBase(currencyCode) {
  ensureFxRates();
  const code = normalizeBankCurrency(currencyCode);
  if (code === 'MYR') return 1;
  const rate = parseFloat(settings.fxRates[code]);
  return (!isNaN(rate) && rate > 0) ? rate : (defaultFxRates()[code] || 1);
}

function fmtBankAmount(amount, currencyCode) {
  const code = normalizeBankCurrency(currencyCode);
  const info = BANK_CURRENCIES[code] || BANK_CURRENCIES.MYR;
  const decimals = info.decimals != null ? info.decimals : 2;
  return info.symbol + ' ' + Number(amount).toLocaleString('en-MY', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function bankBalanceInBase(bank) {
  return (Number(bank && bank.balance) || 0) * fxRateToBase(bank && bank.currency);
}

function totalBanksBase() {
  return banks.reduce((a, b) => a + bankBalanceInBase(b), 0);
}

function normalizeBankRow(b) {
  if (!b || typeof b !== 'object') return b;
  b.currency = normalizeBankCurrency(b.currency);
  return b;
}

function fillBankCurrencySelect(sel, selected) {
  if (!sel) return;
  const cur = normalizeBankCurrency(selected);
  sel.innerHTML = '';
  Object.keys(BANK_CURRENCIES).forEach(code => {
    const info = BANK_CURRENCIES[code];
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = info.label + (info.symbol !== code ? ' (' + info.symbol + ')' : '');
    if (code === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}
function esc(s) {
  const fn = ftCore_().esc;
  return fn ? fn(s) : String(s);
}
function shake(el) { el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),300); }
function parseTxDate(dateStr) {
  const fn = ftCore_().parseTxDate;
  return fn ? fn(dateStr) : null;
}
function inVM(dateStr) {
  const d = parseTxDate(dateStr);
  if (!d) return false;
  return d.getFullYear()===viewMonth.getFullYear() && d.getMonth()===viewMonth.getMonth();
}
function mExp() { return expenses.filter(e=>inVM(e.date)); }
function mInc() { return incomes.filter(i=>inVM(i.date)); }
function viewYM() {
  return viewMonth.getFullYear()+'-'+String(viewMonth.getMonth()+1).padStart(2,'0');
}

// ── Storage ────────────────────────────────────────────────
function load() {
  const gen = _storageReadGen;
  const sheetOnly = !!(typeof window !== 'undefined' && window.__ftForceSheetSource);
  const storageKeys = sheetOnly
    ? [KEY_SETS]
    : [KEY_EXP,KEY_INC,KEY_BANKS,KEY_SETS,KEY_UT_HOLD,KEY_UT_NAV,KEY_LAST_EXP,KEY_LAST_INC];
  chromeStorage.local.get(storageKeys, r => {
    if (gen !== _storageReadGen) return;
    try {
      if (sheetOnly) {
        expenses = [];
        incomes = [];
        banks = [];
        utHoldings = [];
        utNavPoints = [];
        lastExpenseTpl = null;
        lastIncomeTpl = null;
      } else {
        expenses = r[KEY_EXP]   || [];
        incomes  = r[KEY_INC]   || [];
        banks    = (r[KEY_BANKS] || []).map(normalizeBankRow);
        utHoldings = utSanitizeHoldings(r[KEY_UT_HOLD]);
        utNavPoints = utSanitizeNav(r[KEY_UT_NAV]);
        utCarryForwardNavSnapshotForToday();
        lastExpenseTpl = r[KEY_LAST_EXP] || null;
        lastIncomeTpl = r[KEY_LAST_INC] || null;
      }
      if (r[KEY_SETS]) settings = Object.assign({}, settings, r[KEY_SETS]);
      applySettings();
      render();
      window.__ftAppReady = true;
    } catch (e) {
      window.__ftAppReady = false;
    } finally {
      try { window.dispatchEvent(new Event('ft-app-ready')); } catch (e) {}
    }
  });
}
function saveExp()   { chromeStorage.local.set({[KEY_EXP]:   expenses}); }
function saveInc()   { chromeStorage.local.set({[KEY_INC]:   incomes}); }
function saveBanks() { chromeStorage.local.set({[KEY_BANKS]: banks}); }
function saveSets()  { chromeStorage.local.set({[KEY_SETS]:  settings}); }
function saveUtHoldings() { chromeStorage.local.set({ [KEY_UT_HOLD]: utHoldings }); }
function saveUtNav()      { chromeStorage.local.set({ [KEY_UT_NAV]:  utNavPoints }); }

function utDedupeNavPoints() {
  const map = new Map();
  utNavPoints.forEach(p => { map.set(p.fundId + '|' + p.date, p); });
  utNavPoints = Array.from(map.values());
}

function utSanitizeHoldings(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(h => h && typeof h === 'object').map((h, idx) => {
    const rawId = h.id != null && h.id !== '' ? h.id : (h.ID != null ? h.ID : h.Id);
    const id = Number(rawId);
    const units = Math.max(0, parseFloat(h.units != null ? h.units : h.Units) || 0);
    const tcIn = parseFloat(h.totalCost != null ? h.totalCost : h.TotalCost);
    let totalCost = null;
    if (!isNaN(tcIn) && tcIn > 0) totalCost = tcIn;
    else {
      const ac = parseFloat(h.avgCost);
      if (!isNaN(ac) && ac > 0 && units > 0) totalCost = ac * units;
    }
    return {
      id: !isNaN(id) && id > 0 ? id : Date.now() + idx,
      name: String(h.name != null ? h.name : h.Name || 'Fund').trim() || 'Fund',
      fundCode: h.fundCode != null ? String(h.fundCode).trim() : (h.FundCode != null ? String(h.FundCode).trim() : ''),
      units,
      totalCost,
      purchaseDate: h.purchaseDate != null ? String(h.purchaseDate).trim().slice(0, 10) : '',
      notes: h.notes != null ? String(h.notes).trim() : '',
    };
  });
}

/** RM paid for the lot (incl. fees): totalCost, or legacy units×avgCost from older backups/sheets. */
function utCostBasis(h) {
  if (!h || typeof h !== 'object') return null;
  const tc = parseFloat(h.totalCost);
  if (!isNaN(tc) && tc > 0) return tc;
  const units = parseFloat(h.units) || 0;
  const ac = parseFloat(h.avgCost);
  if (!isNaN(ac) && ac > 0 && units > 0) return ac * units;
  return null;
}

function utSanitizeNav(arr) {
  if (!Array.isArray(arr)) return [];
  const out = arr.filter(p => p && typeof p === 'object').map(p => ({
    fundId: Number(p.fundId),
    date: String(p.date || '').trim().slice(0, 10),
    nav: parseFloat(p.nav),
  })).filter(p => !isNaN(p.fundId) && p.fundId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !isNaN(p.nav) && p.nav > 0);
  const map = new Map();
  out.forEach(p => { map.set(p.fundId + '|' + p.date, p); });
  return Array.from(map.values());
}

function mergeUtNavPoints(existing, incoming) {
  const map = new Map();
  (Array.isArray(existing) ? existing : []).forEach(p => {
    if (p && p.fundId && p.date) map.set(p.fundId + '|' + p.date, p);
  });
  utSanitizeNav(incoming).forEach(p => { map.set(p.fundId + '|' + p.date, p); });
  return Array.from(map.values());
}

function utNavSortedForFund(fundId) {
  return utNavPoints
    .filter(p => p.fundId === fundId && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !isNaN(p.nav) && p.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function utLatestNavEntry(fundId) {
  const s = utNavSortedForFund(fundId);
  return s.length ? s[s.length - 1] : null;
}

function utPrevNavEntry(fundId) {
  const s = utNavSortedForFund(fundId);
  return s.length >= 2 ? s[s.length - 2] : null;
}

function utNavAsOf(fundId, dateStr) {
  const s = utNavSortedForFund(fundId).filter(p => p.date <= dateStr);
  return s.length ? s[s.length - 1].nav : null;
}

/** Next calendar day YYYY-MM-DD (local). */
function utYmdPlusOne(ymd) {
  const d = new Date(ymd + 'T12:00:00');
  if (isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Once per calendar day: for each holding with a latest NAV, ensure a row exists for **today**
 * with that NAV (carry-forward). Persists so Sheet sync and charts get a daily timeline.
 */
function utCarryForwardNavSnapshotForToday() {
  const td = todayStr();
  let lastSnap = '';
  try {
    lastSnap = localStorage.getItem('ft_ut_nav_snap_ymd') || '';
  } catch (e) {}
  if (lastSnap === td) return;

  let changed = false;
  utHoldings.forEach(h => {
    const lastE = utLatestNavEntry(h.id);
    if (!lastE) return;
    const hasToday = utNavPoints.some(p => p.fundId === h.id && p.date === td);
    if (hasToday) return;
    utNavPoints.push({ fundId: h.id, date: td, nav: lastE.nav });
    changed = true;
  });

  if (changed) {
    utDedupeNavPoints();
    utNavPoints = utSanitizeNav(utNavPoints);
    saveUtNav();
  }
  try {
    localStorage.setItem('ft_ut_nav_snap_ymd', td);
  } catch (e) {}
}

/** Every calendar day in the visible month (YYYY-MM-DD). */
function buildMonthDateKeys() {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const keys = [];
  for (let d = 1; d <= last; d++) {
    keys.push(y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
  }
  return keys;
}

/** Sum amounts per day for the given transactions (dates must match keys). */
function buildMonthDailyTotals(keys, items) {
  const map = {};
  keys.forEach(k => {
    map[k] = 0;
  });
  items.forEach(e => {
    if (e && e.date && map[e.date] !== undefined) map[e.date] += Number(e.amount) || 0;
  });
  return keys.map(k => map[k]);
}

function computeUtTotalMarketValue() {
  return utHoldings.reduce((sum, h) => {
    const last = utLatestNavEntry(h.id);
    if (!last) return sum;
    return sum + h.units * last.nav;
  }, 0);
}

function utBuildPortfolioSeries() {
  if (!utHoldings.length) return [];
  let start = null;
  utNavPoints.forEach(p => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return;
    if (!start || p.date < start) start = p.date;
  });
  utHoldings.forEach(h => {
    const pd = h.purchaseDate && String(h.purchaseDate).trim().slice(0, 10);
    if (pd && /^\d{4}-\d{2}-\d{2}$/.test(pd)) {
      if (!start || pd < start) start = pd;
    }
  });
  if (!start) return [];
  const end = todayStr();
  if (start > end) return [];
  const series = [];
  for (let d = start; d <= end; d = utYmdPlusOne(d)) {
    let total = 0;
    let any = false;
    for (let i = 0; i < utHoldings.length; i++) {
      const h = utHoldings[i];
      const nav = utNavAsOf(h.id, d);
      if (nav == null) continue;
      total += h.units * nav;
      any = true;
    }
    if (any) series.push({ date: d, total });
    if (d === end) break;
  }
  return series;
}

function upsertUtNav(fundId, dateStr, navVal) {
  const nav = parseFloat(navVal);
  if (!fundId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(nav) || nav <= 0) return false;
  const i = utNavPoints.findIndex(p => p.fundId === fundId && p.date === dateStr);
  if (i >= 0) utNavPoints[i].nav = nav;
  else utNavPoints.push({ fundId, date: dateStr, nav });
  utDedupeNavPoints();
  saveUtNav();
  return true;
}

function deleteUtHolding(id) {
  const hIdx = utHoldings.findIndex(h => h.id === id);
  if (hIdx < 0) return;
  const removedHold = utHoldings[hIdx];
  const removedNav = utNavPoints.filter(p => p.fundId === id);
  utHoldings.splice(hIdx, 1);
  utNavPoints = utNavPoints.filter(p => p.fundId !== id);
  saveUtHoldings();
  saveUtNav();
  ftHaptic_('medium');
  render();
  registerUndoDelete('Fund', () => {
    utHoldings.splice(Math.min(hIdx, utHoldings.length), 0, removedHold);
    utNavPoints = utNavPoints.concat(removedNav);
    saveUtHoldings();
    saveUtNav();
    render();
  });
}

function utDownsampleSeries(series, maxPts) {
  if (series.length <= maxPts) return series;
  const out = [];
  for (let i = 0; i < maxPts; i++) {
    const idx = Math.round((i / (maxPts - 1)) * (series.length - 1));
    out.push(series[idx]);
  }
  return out;
}

function utFmtChartDate(ymd) {
  const p = String(ymd).split('-');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return mo[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
}

function renderUtChart(el) {
  if (!el) return;
  const full = utBuildPortfolioSeries();
  if (full.length < 2) {
    el.innerHTML = '<div class="ut-chart-empty">Add NAV on two or more days to see a trend line.</div>';
    return;
  }
  const series = utDownsampleSeries(full, 48);
  const W = el.clientWidth || 600;
  const H = 96;
  const PAD = { t: 8, r: 8, b: 8, l: 8 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const vals = series.map(s => s.total);
  const minV = Math.min.apply(null, vals);
  const maxV = Math.max.apply(null, vals);
  const rng = maxV - minV || 1;
  const n = series.length;
  const xOf = i => PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yOf = v => PAD.t + cH - ((v - minV) / rng) * cH;
  const pts = series.map((s, i) => xOf(i) + ',' + yOf(s.total));
  const path = 'M ' + pts.join(' L ');
  const area = 'M ' + xOf(0) + ',' + (PAD.t + cH) + ' L ' + pts.join(' L ') + ' L ' + xOf(n - 1) + ',' + (PAD.t + cH) + ' Z';
  const lc = vals[vals.length - 1] >= vals[0] ? '#1A9E6E' : '#E24B4A';
  const lastI = n - 1;
  const endDot =
    '<circle cx="' + xOf(lastI) + '" cy="' + yOf(vals[lastI]) + '" r="4" fill="' + lc + '" stroke="white" stroke-width="2"/>';
  const svg =
    '<svg class="nw-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="ut-grad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + lc + '" stop-opacity="0.12"/>' +
    '<stop offset="100%" stop-color="' + lc + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#ut-grad)"/>' +
    '<path d="' + path + '" fill="none" stroke="' + lc + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    endDot +
    '</svg>';
  const first = full[0];
  const last = full[full.length - 1];
  const pct = first.total ? ((last.total - first.total) / first.total) * 100 : 0;
  const pctCls = pct >= 0 ? 'ut-chart-cap__chg--up' : 'ut-chart-cap__chg--down';
  const pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  el.innerHTML =
    '<div class="ut-chart-simple">' +
    '<div class="nw-chart-wrap ut-chart-simple__plot">' +
    svg +
    '</div>' +
    '<div class="ut-chart-cap">' +
    '<div class="ut-chart-cap__end"><span class="ut-chart-cap__date">' +
    esc(utFmtChartDate(first.date)) +
    '</span><span class="ut-chart-cap__val">' +
    fmt(first.total) +
    '</span></div>' +
    '<span class="ut-chart-cap__chg ' +
    pctCls +
    '">' +
    pctStr +
    '</span>' +
    '<div class="ut-chart-cap__end ut-chart-cap__end--right"><span class="ut-chart-cap__date">' +
    esc(utFmtChartDate(last.date)) +
    '</span><span class="ut-chart-cap__val">' +
    fmt(last.total) +
    '</span></div>' +
    '</div></div>';
}

function importUtNavCsv(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = String((e.target && e.target.result) || '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let start = 0;
      if (lines.length && /fundid|fund_id|date|nav/i.test(lines[0])) start = 1;
      let n = 0;
      for (let i = start; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim());
        if (parts.length < 3) continue;
        const d = parts[1];
        const nav = parseFloat(parts[2]);
        let fundId = parseInt(parts[0], 10);
        if (isNaN(fundId) || fundId <= 0) {
          const code = parts[0];
          const h = utHoldings.find(x => (x.fundCode || '').toLowerCase() === String(code).toLowerCase());
          if (!h) continue;
          fundId = h.id;
        }
        if (!utHoldings.some(h => h.id === fundId)) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(nav) || nav <= 0) continue;
        upsertUtNav(fundId, d, nav);
        n++;
      }
      utNavPoints = utSanitizeNav(utNavPoints);
      saveUtNav();
      showToast(n ? 'Imported ' + n + ' NAV row(s)' : 'No CSV rows applied');
      render();
    } catch (err) {
      showToast('CSV import failed');
    }
  };
  reader.readAsText(file);
}

function addUtHolding() {
  const nameEl = document.getElementById('ut-name');
  const codeEl = document.getElementById('ut-code');
  const unitsEl = document.getElementById('ut-units');
  const costEl = document.getElementById('ut-total-cost');
  const dateEl = document.getElementById('ut-pdate');
  const notesEl = document.getElementById('ut-notes');
  if (!nameEl || !unitsEl) return;
  const name = nameEl.value.trim();
  const units = parseFloat(unitsEl.value);
  let ok = true;
  if (!name) { shake(nameEl); ok = false; }
  if (isNaN(units) || units <= 0) { shake(unitsEl); ok = false; }
  if (!ok) return;
  const costRaw = costEl && costEl.value.trim();
  let totalCost = null;
  if (costRaw !== '') {
    const t = parseFloat(costRaw);
    if (isNaN(t) || t <= 0) { shake(costEl); return; }
    totalCost = t;
  }
  utHoldings.push({
    id: Date.now(),
    name,
    fundCode: codeEl ? codeEl.value.trim() : '',
    units,
    totalCost,
    purchaseDate: dateEl && dateEl.value ? dateEl.value : '',
    notes: notesEl ? notesEl.value.trim() : '',
  });
  saveUtHoldings();
  nameEl.value = '';
  if (codeEl) codeEl.value = '';
  unitsEl.value = '';
  if (costEl) costEl.value = '';
  if (dateEl) dateEl.value = '';
  if (notesEl) notesEl.value = '';
  render();
  showToast('Fund added');
}

function wireAssetsPageControls() {
  const utAdd = document.getElementById('ut-add-btn');
  if (utAdd && !utAdd.dataset.wired) {
    utAdd.dataset.wired = '1';
    utAdd.addEventListener('click', addUtHolding);
    ['ut-name', 'ut-units'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addUtHolding(); });
    });
  }
  const utRef = document.getElementById('ut-refresh-btn');
  if (utRef && !utRef.dataset.wired) {
    utRef.dataset.wired = '1';
    utRef.addEventListener('click', () => render());
  }
  const utCsv = document.getElementById('ut-csv-btn');
  const utCsvIn = document.getElementById('ut-csv-input');
  if (utCsv && utCsvIn && !utCsv.dataset.wired) {
    utCsv.dataset.wired = '1';
    utCsv.addEventListener('click', () => utCsvIn.click());
    utCsvIn.addEventListener('change', () => {
      const f = utCsvIn.files && utCsvIn.files[0];
      utCsvIn.value = '';
      if (f) importUtNavCsv(f);
    });
  }
}

function utAppendStat(parent, label, text, cls) {
  const box = document.createElement('div');
  box.className = 'ut-stat';
  const lbl = document.createElement('div');
  lbl.className = 'ut-stat__lbl';
  lbl.textContent = label;
  const val = document.createElement('div');
  val.className = 'ut-stat__val' + (cls ? ' ' + cls : '');
  val.textContent = text;
  box.appendChild(lbl);
  box.appendChild(val);
  parent.appendChild(box);
}

function renderUnitTrustPanel() {
  const root = document.getElementById('ut-root');
  if (!root) return;

  const totalMv = computeUtTotalMarketValue();
  const sumEl = document.getElementById('ut-summary-mv');
  if (sumEl) sumEl.textContent = fmt(totalMv);

  root.innerHTML = '';

  if (!utHoldings.length) {
    const em = document.createElement('div');
    em.className = 'empty';
    em.style.padding = 'var(--s6) 0';
    const ico = document.createElement('div');
    ico.className = 'empty-icon ft-empty-state__ico';
    ico.innerHTML = ftIconHtml_('chart', 'ft-empty-state__svg');
    em.appendChild(ico);
    em.appendChild(document.createTextNode('No unit trust holdings yet — add a fund below'));
    root.appendChild(em);
  }

  utHoldings.forEach(h => {
    const last = utLatestNavEntry(h.id);
    const prev = utPrevNavEntry(h.id);
    const mv = last ? h.units * last.nav : null;
    const costBasis = utCostBasis(h);
    let pnl = null;
    if (last && costBasis != null) pnl = mv - costBasis;
    let dayChg = null;
    let dayPct = null;
    if (last && prev) {
      dayChg = h.units * (last.nav - prev.nav);
      dayPct = prev.nav ? ((last.nav - prev.nav) / prev.nav) * 100 : 0;
    }

    const card = document.createElement('div');
    card.className = 'ut-card';

    const head = document.createElement('div');
    head.className = 'ut-card__head';

    const title = document.createElement('div');
    title.className = 'ut-card__title';
    const nameEl = document.createElement('div');
    nameEl.className = 'ut-card__name';
    nameEl.textContent = h.name;
    title.appendChild(nameEl);
    const sub = document.createElement('div');
    sub.className = 'ut-card__sub';
    const bits = [];
    if (h.fundCode) bits.push('Code ' + h.fundCode);
    if (h.notes) bits.push(h.notes);
    sub.textContent = bits.length ? bits.join(' · ') : 'Fund ID ' + h.id;
    title.appendChild(sub);

    const mvEl = document.createElement('div');
    mvEl.className = 'ut-card__mv' + (mv == null ? ' ut-card__mv--empty' : '');
    mvEl.textContent = mv != null ? fmt(mv) : 'No NAV';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'assets-icon-btn del';
    delBtn.title = 'Remove fund';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm('Remove this fund and its NAV history?')) deleteUtHolding(h.id);
    });

    head.appendChild(title);
    head.appendChild(mvEl);
    head.appendChild(delBtn);

    const stats = document.createElement('div');
    stats.className = 'ut-stats';
    utAppendStat(stats, 'Units', h.units.toLocaleString('en-MY', { maximumFractionDigits: 6 }), '');
    utAppendStat(stats, 'Latest NAV', last ? last.nav.toFixed(4) + ' (' + last.date + ')' : '—', last ? '' : 'muted');
    if (pnl != null) {
      utAppendStat(stats, 'P&L', (pnl >= 0 ? '+' : '') + fmt(pnl), pnl >= 0 ? 'pos' : 'neg');
    } else {
      utAppendStat(stats, 'P&L', 'Add total paid', 'muted');
    }
    if (dayChg != null) {
      utAppendStat(stats, 'vs prior NAV', (dayChg >= 0 ? '+' : '') + fmt(dayChg) + ' (' + dayPct.toFixed(2) + '%)', dayChg >= 0 ? 'pos' : 'neg');
    } else {
      utAppendStat(stats, 'vs prior NAV', '—', 'muted');
    }

    const navBlock = document.createElement('div');
    navBlock.className = 'ut-card__nav';
    const navTitle = document.createElement('div');
    navTitle.className = 'ut-card__nav-title';
    navTitle.textContent = 'Update NAV';
    navBlock.appendChild(navTitle);

    const navGrid = document.createElement('div');
    navGrid.className = 'assets-form-grid assets-form-grid--3';

    const dateWrap = document.createElement('div');
    const dateLab = document.createElement('label');
    dateLab.className = 'lbl';
    dateLab.textContent = 'Date';
    const dateInp = document.createElement('input');
    dateInp.type = 'date';
    dateInp.value = last ? last.date : todayStr();
    dateWrap.appendChild(dateLab);
    dateWrap.appendChild(dateInp);

    const navWrap = document.createElement('div');
    const navLab = document.createElement('label');
    navLab.className = 'lbl';
    navLab.textContent = 'NAV per unit';
    const navInp = document.createElement('input');
    navInp.type = 'number';
    navInp.placeholder = '0.0000';
    navInp.min = '0';
    navInp.step = '0.0001';
    navInp.inputMode = 'decimal';
    navWrap.appendChild(navLab);
    navWrap.appendChild(navInp);

    const saveWrap = document.createElement('div');
    const saveNav = document.createElement('button');
    saveNav.type = 'button';
    saveNav.className = 'btn btn-primary';
    saveNav.textContent = 'Save NAV';
    saveNav.addEventListener('click', () => {
      if (!upsertUtNav(h.id, dateInp.value, navInp.value)) {
        shake(navInp);
        return;
      }
      navInp.value = '';
      showToast('NAV saved');
      render();
    });
    saveWrap.appendChild(saveNav);

    navGrid.appendChild(dateWrap);
    navGrid.appendChild(navWrap);
    navGrid.appendChild(saveWrap);
    navBlock.appendChild(navGrid);

    const edit = document.createElement('details');
    edit.className = 'assets-acct-edit ut-card__edit';
    const sum = document.createElement('summary');
    sum.textContent = 'Edit holding';
    edit.appendChild(sum);
    const editBody = document.createElement('div');
    editBody.className = 'assets-acct-edit__body';

    const editGrid = document.createElement('div');
    editGrid.className = 'assets-form-grid assets-form-grid--3';

    const unitsWrap = document.createElement('div');
    const unitsLab = document.createElement('label');
    unitsLab.className = 'lbl';
    unitsLab.textContent = 'Units';
    const unitsInp = document.createElement('input');
    unitsInp.type = 'number';
    unitsInp.min = '0';
    unitsInp.step = '0.000001';
    unitsInp.value = String(h.units);
    unitsWrap.appendChild(unitsLab);
    unitsWrap.appendChild(unitsInp);

    const costWrap = document.createElement('div');
    const costLab = document.createElement('label');
    costLab.className = 'lbl';
    costLab.textContent = 'Total paid (RM)';
    const costInp = document.createElement('input');
    costInp.type = 'number';
    costInp.min = '0';
    costInp.step = '0.01';
    costInp.placeholder = 'Optional';
    const cb0 = utCostBasis(h);
    costInp.value = cb0 != null ? String(cb0) : '';
    costWrap.appendChild(costLab);
    costWrap.appendChild(costInp);

    const saveRow = document.createElement('div');
    saveRow.className = 'assets-form-actions';
    const saveUnits = document.createElement('button');
    saveUnits.type = 'button';
    saveUnits.className = 'btn-ghost';
    saveUnits.textContent = 'Save units';
    saveUnits.addEventListener('click', () => {
      const u = parseFloat(unitsInp.value);
      if (isNaN(u) || u <= 0) { shake(unitsInp); return; }
      h.units = u;
      saveUtHoldings();
      showToast('Units updated');
      render();
    });
    const saveCost = document.createElement('button');
    saveCost.type = 'button';
    saveCost.className = 'btn-ghost';
    saveCost.textContent = 'Save cost';
    saveCost.addEventListener('click', () => {
      const raw = costInp.value.trim();
      if (raw === '') {
        h.totalCost = null;
        delete h.avgCost;
        saveUtHoldings();
        showToast('Cost cleared');
        render();
        return;
      }
      const t = parseFloat(raw);
      if (isNaN(t) || t <= 0) { shake(costInp); return; }
      h.totalCost = t;
      delete h.avgCost;
      saveUtHoldings();
      showToast('Total cost updated');
      render();
    });
    saveRow.appendChild(saveUnits);
    saveRow.appendChild(saveCost);

    editGrid.appendChild(unitsWrap);
    editGrid.appendChild(costWrap);
    editGrid.appendChild(document.createElement('div'));
    editBody.appendChild(editGrid);
    editBody.appendChild(saveRow);
    edit.appendChild(editBody);

    card.appendChild(head);
    card.appendChild(stats);
    card.appendChild(navBlock);
    card.appendChild(edit);
    root.appendChild(card);
  });

  const chartSlot = document.getElementById('ut-chart');
  if (chartSlot) renderUtChart(chartSlot);
}

// ── Category buttons ───────────────────────────────────────
function buildCatButtons() {
  const wrap = document.getElementById('cat-btns');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.className = 'cat-groups';

  function makeCatButton(name) {
    const meta = EXP_CATS[name];
    if (!meta) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn' + (name === selectedCat ? ' active' : '');
    btn.dataset.cat = name;
    const iconEl = document.createElement('span');
    iconEl.className = 'ci ft-cat-badge';
    var catIconId = ftCatIconIdFor_(name, EXP_CATS);
    if (catIconId) iconEl.innerHTML = ftIconHtml_(catIconId, 'ft-cat-badge__ico');
    else iconEl.textContent = name.charAt(0).toUpperCase();
    iconEl.style.setProperty('--ft-cat-color', meta.color || '#B4B2A9');
    btn.appendChild(iconEl);
    btn.appendChild(document.createTextNode(name));
    btn.addEventListener('click', () => {
      selectedCat = name;
      wrap.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === name));
    });
    return btn;
  }

  const listed = new Set();
  EXP_CAT_GROUPS.forEach(group => {
    const grid = document.createElement('div');
    grid.className = 'cat-grid';
    group.cats.forEach(name => {
      const btn = makeCatButton(name);
      if (!btn) return;
      listed.add(name);
      grid.appendChild(btn);
    });
    if (!grid.childElementCount) return;
    const sec = document.createElement('section');
    sec.className = 'cat-group';
    const lab = document.createElement('div');
    lab.className = 'cat-group__label';
    lab.textContent = group.title;
    sec.appendChild(lab);
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });

  const orphans = Object.keys(EXP_CATS).filter(k => !listed.has(k));
  if (orphans.length) {
    const grid = document.createElement('div');
    grid.className = 'cat-grid';
    orphans.forEach(name => {
      const btn = makeCatButton(name);
      if (btn) grid.appendChild(btn);
    });
    if (grid.childElementCount) {
      const sec = document.createElement('section');
      sec.className = 'cat-group';
      const lab = document.createElement('div');
      lab.className = 'cat-group__label';
      lab.textContent = 'More categories';
      sec.appendChild(lab);
      sec.appendChild(grid);
      wrap.appendChild(sec);
    }
  }
}

// Schedule storage load before later DOM wire-up so a missing control (e.g. HTML/JS mismatch) cannot block ft-app-ready.
(function initFromStorage() {
  try {
    const ed = document.getElementById('exp-date');
    const id = document.getElementById('inc-date');
    if (ed) ed.value = todayStr();
    if (id) id.value = todayStr();
    buildCatButtons();
    wireAssetsPageControls();
  } catch (e) {}
  load();
})();

// ── Settings ───────────────────────────────────────────────
function applySettings() {
  const b = document.body;
  let darkOn = !!settings.dark;
  if (settings.darkSchedule === 'night') {
    const h = new Date().getHours();
    darkOn = (h >= 19 || h < 7);
  } else if (settings.darkSchedule === 'system') {
    try {
      darkOn = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      darkOn = !!settings.dark;
    }
  }
  b.classList.toggle('dark', darkOn);
  const darkEl = document.getElementById('set-dark');
  if (darkEl) {
    darkEl.checked = darkOn;
    darkEl.disabled = settings.darkSchedule === 'night' || settings.darkSchedule === 'system';
  }
  const darkSchedEl = document.getElementById('set-dark-schedule');
  if (darkSchedEl) darkSchedEl.value = settings.darkSchedule || 'off';
  b.classList.remove('fs-sm','fs-md','fs-lg');
  b.classList.add(settings.fontSize || 'fs-md');
  document.querySelectorAll('.fs-btn').forEach(x =>
    x.classList.toggle('active', x.dataset.fs === (settings.fontSize||'fs-md'))
  );
  const curEl = document.getElementById('set-currency');
  if (curEl) curEl.value = settings.currency || 'RM';
  ensureFxRates();
  const fxSub = document.getElementById('set-fx-sub');
  if (fxSub) fxSub.textContent = '1 foreign unit → ' + (settings.currency || 'RM') + ' (for net assets total)';
  ['SGD', 'USD', 'JPY'].forEach(code => {
    const fxEl = document.getElementById('set-fx-' + code.toLowerCase());
    if (fxEl) fxEl.value = String(settings.fxRates[code]);
  });
  const dragEl = document.getElementById('set-drag');
  if (dragEl) dragEl.checked = settings.showDrag !== false;
  const compEl = document.getElementById('set-compact');
  if (compEl) compEl.checked = !!settings.compact;
  const nwAutoEl = document.getElementById('set-nw-auto');
  if (nwAutoEl) nwAutoEl.checked = settings.nwAutoSnapshot !== false;
  const notifyRecEl = document.getElementById('set-notify-recurring');
  if (notifyRecEl) notifyRecEl.checked = settings.notifyRecurring !== false;
  const ptFullOnlyEl = document.getElementById('set-petrol-full-only');
  if (ptFullOnlyEl) ptFullOnlyEl.checked = !!settings.petrolFullTankOnly;
  const lockEl = document.getElementById('set-lock-timeout');
  if (lockEl) lockEl.value = String(settings.lockTimeoutMin == null ? 5 : settings.lockTimeoutMin);
  try { localStorage.setItem('ft_lock_timeout_min', String(settings.lockTimeoutMin == null ? 5 : settings.lockTimeoutMin)); } catch (e) {}
  b.classList.toggle('compact', !!settings.compact);
  let cs = document.getElementById('compact-style');
  if (!cs) { cs = document.createElement('style'); cs.id = 'compact-style'; document.head.appendChild(cs); }
  cs.textContent = settings.compact
    ? '.tx-item{padding:4px 0!important}.tx-icon{width:24px!important;height:24px!important;font-size:12px!important}'
    : '';
}

function findNearDuplicateExpense(name, amount, date) {
  const day = String(date).slice(0, 10);
  return expenses.find(e => {
    if (Math.abs(e.amount - amount) > 0.009) return false;
    if (String(e.date).slice(0, 10) !== day) return false;
    const a = String(e.name).toLowerCase();
    const b = String(name).toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  });
}

// ── Calculator-style money input (1030 → 10.30) ────────────
var MONEY_INPUT_MAX_CENTS = 99999999999;

function moneyCentsFromInput(el) {
  if (!el) return 0;
  if (el.dataset.moneyCents != null && el.dataset.moneyCents !== '') {
    var stored = parseInt(el.dataset.moneyCents, 10);
    if (!isNaN(stored) && stored >= 0) return stored;
  }
  var digits = String(el.value || '').replace(/\D/g, '');
  if (!digits) return 0;
  var parsed = parseInt(digits, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function moneyAmountFromInput(el) {
  return moneyCentsFromInput(el) / 100;
}

function moneySetCents(el, cents) {
  if (!el) return;
  cents = Math.max(0, Math.min(MONEY_INPUT_MAX_CENTS, Math.round(cents || 0)));
  el.dataset.moneyCents = String(cents);
  el.value = cents === 0 ? '' : (cents / 100).toFixed(2);
  try { el.dispatchEvent(new CustomEvent('ft-money-change', { bubbles: true })); } catch (err) {}
}

function moneySetAmount(el, amount) {
  moneySetCents(el, Math.round((Number(amount) || 0) * 100));
}

function moneyClearInput(el) {
  if (!el) return;
  el.dataset.moneyCents = '0';
  el.value = '';
}

function moneyAppendDigit_(el, digit) {
  var cents = moneyCentsFromInput(el) * 10 + digit;
  if (cents > MONEY_INPUT_MAX_CENTS) return;
  moneySetCents(el, cents);
}

function moneyBackspace_(el) {
  moneySetCents(el, Math.floor(moneyCentsFromInput(el) / 10));
}

function wireCalculatorMoneyInput(el) {
  if (!el || el.dataset.moneyWired === '1') return;
  el.dataset.moneyWired = '1';
  el.type = 'text';
  el.inputMode = 'numeric';
  el.autocomplete = 'off';
  el.spellcheck = false;
  if (el.dataset.moneyCents == null) el.dataset.moneyCents = '0';

  el.addEventListener('keydown', function(e) {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' || e.key.indexOf('Arrow') === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      moneyBackspace_(el);
      return;
    }
    if (e.key === '.' || e.key === ',') {
      e.preventDefault();
      return;
    }
    if (e.key.length === 1 && /\d/.test(e.key)) {
      e.preventDefault();
      moneyAppendDigit_(el, parseInt(e.key, 10));
    }
  });

  el.addEventListener('beforeinput', function(e) {
    if (e.inputType === 'insertText' && e.data && /^\d$/.test(e.data)) {
      e.preventDefault();
      moneyAppendDigit_(el, parseInt(e.data, 10));
      return;
    }
    if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
      e.preventDefault();
      moneyBackspace_(el);
      return;
    }
    if (e.inputType === 'insertFromPaste') {
      e.preventDefault();
      return;
    }
  });

  el.addEventListener('paste', function(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text') || '';
    var digits = String(text).replace(/\D/g, '');
    if (!digits) {
      moneyClearInput(el);
      return;
    }
    var cents = parseInt(digits, 10);
    if (isNaN(cents)) moneyClearInput(el);
    else moneySetCents(el, cents);
  });

  el.addEventListener('focus', function() {
    try { el.select(); } catch (err) {}
  });
}

function initCalculatorMoneyInputs_() {
  ['exp-amount', 'inc-amount', 'edit-amount'].forEach(function(id) {
    wireCalculatorMoneyInput(document.getElementById(id));
  });
}

function ftIsMobileLayout_() {
  return window.matchMedia('(max-width: 680px)').matches;
}

function ftAssetBase_() {
  var p = String(location.pathname || '');
  return p.indexOf('finance-tracker-chrome') !== -1 ? '../assets/' : 'assets/';
}

function ftIconHtml_(id, extraClass) {
  var cls = 'ft-ico' + (extraClass ? ' ' + extraClass : '');
  return '<svg class="' + cls + '" aria-hidden="true"><use href="' + ftAssetBase_() + 'ft-icons.svg#ft-icon-' + id + '"/></svg>';
}

function ftCatIconIdFor_(catName, catMap) {
  if (catMap === EXP_CATS) return EXP_CAT_ICON_IDS[catName] || 'cat-other';
  return null;
}

function ftHaptic_(kind) {
  try {
    if (!navigator.vibrate) return;
    if (kind === 'success') navigator.vibrate(14);
    else if (kind === 'medium') navigator.vibrate([8, 24, 8]);
    else navigator.vibrate(6);
  } catch (e) {}
}

function ftCatBadgeHtml_(catName, catMap, extraClass) {
  var map = catMap || {};
  var info = map[catName] || map['Other'] || { color: '#B4B2A9' };
  var cls = 'ft-cat-badge' + (extraClass ? ' ' + extraClass : '');
  var iconId = ftCatIconIdFor_(catName, catMap);
  if (iconId) {
    return '<span class="' + cls + '" style="--ft-cat-color:' + (info.color || '#B4B2A9') + '">' +
      ftIconHtml_(iconId, 'ft-cat-badge__ico') +
      '</span>';
  }
  var fallback = String(catName || '?').trim().charAt(0).toUpperCase() || '?';
  return '<span class="' + cls + '" style="--ft-cat-color:' + (info.color || '#B4B2A9') + '">' + fallback + '</span>';
}

function ftCatLabelHtml_(catName, catMap, extraClass) {
  return ftCatBadgeHtml_(catName, catMap, extraClass || 'ft-cat-badge--sm') +
    ' <span class="ft-cat-row__name">' + esc(catName) + '</span>';
}

function syncMonthChip_() {
  var chip = document.getElementById('ft-month-chip');
  if (!chip) return;
  var lbl = document.getElementById('month-label');
  var days = document.getElementById('home-days-left');
  var monthText = lbl ? lbl.textContent : '';
  if (!monthText || monthText === '—') {
    chip.hidden = true;
    return;
  }
  var daysText = days ? days.textContent : '';
  chip.innerHTML = '<span class="ft-month-chip__label">' + monthText + '</span>' +
    (daysText ? '<span class="ft-month-chip__days">' + daysText + '</span>' : '');
  chip.hidden = !ftIsMobileLayout_() || !monthText || monthText === '—';
}

function buildEmptyState_(opts) {
  opts = opts || {};
  var wrap = document.createElement('div');
  wrap.className = 'ft-empty-state';
  var ico = document.createElement('div');
  ico.className = 'ft-empty-state__ico';
  ico.innerHTML = ftIconHtml_(opts.icon || 'clipboard', 'ft-empty-state__svg');
  wrap.appendChild(ico);
  var msg = document.createElement('p');
  msg.className = 'ft-empty-state__msg';
  msg.textContent = opts.msg || '';
  wrap.appendChild(msg);
  if (opts.hint) {
    var hint = document.createElement('p');
    hint.className = 'ft-empty-state__hint';
    hint.textContent = opts.hint;
    wrap.appendChild(hint);
  }
  if (opts.ctaTab) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary ft-empty-state__cta';
    btn.dataset.gotoTab = opts.ctaTab;
    btn.textContent = opts.ctaLabel || 'Get started';
    wrap.appendChild(btn);
  }
  return wrap;
}

function wireEmptyStateCtas_() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-goto-tab]');
    if (!btn) return;
    var tab = btn.getAttribute('data-goto-tab');
    if (tab && typeof activateNavTab === 'function') activateNavTab(tab);
  });
}

function syncMobileMonthNav_() {
  var lbl = document.getElementById('month-label');
  var lblM = document.getElementById('month-label-m');
  if (lblM && lbl) lblM.textContent = lbl.textContent;
  var nav = document.getElementById('mobile-month-nav');
  if (nav) nav.hidden = !ftIsMobileLayout_();
  syncMonthChip_();
}

function ftMonthChangeHint_() {
  return ftIsMobileLayout_()
    ? ' \u2014 tap \u2039 \u203a above to change month'
    : ' \u2014 use sidebar arrows to change month';
}

function wireCalcAmountHint_() {
  var key = 'ft-calc-hint-dismissed-v1';
  var hint = document.getElementById('ft-calc-hint');
  var btn = document.getElementById('ft-calc-hint-dismiss');
  if (!hint || localStorage.getItem(key) === '1') return;
  hint.hidden = false;
  if (!btn) return;
  btn.addEventListener('click', function() {
    try { localStorage.setItem(key, '1'); } catch (e) {}
    hint.hidden = true;
  });
}

var _ftUxLayoutMode_ = null;

function applyFoldCardsForLayout_() {
  var expCards = document.querySelectorAll('.exp-fold-card');
  var setCards = document.querySelectorAll('.settings-fold-card');
  var mobile = ftIsMobileLayout_();
  var mode = mobile ? 'mobile' : 'desktop';
  if (_ftUxLayoutMode_ === mode && _ftUxLayoutMode_ !== null) {
    return;
  }
  _ftUxLayoutMode_ = mode;

  expCards.forEach(function(card) {
    if (mobile) card.removeAttribute('open');
    else card.setAttribute('open', '');
  });
  setCards.forEach(function(card) {
    if (mobile) card.removeAttribute('open');
    else card.setAttribute('open', '');
  });

  var homeExplore = document.getElementById('home-explore-fold');
  if (homeExplore) {
    if (mobile) homeExplore.removeAttribute('open');
    else homeExplore.setAttribute('open', '');
  }

  var dailyFold = document.getElementById('exp-daily-fold');
  if (dailyFold) {
    if (mobile) dailyFold.removeAttribute('open');
    else dailyFold.setAttribute('open', '');
  }

  var addFold = document.getElementById('exp-add-fold');
  if (addFold) {
    if (mobile) {
      var hasMany = typeof mExp === 'function' && mExp().length > 3;
      if (hasMany) addFold.removeAttribute('open');
      else addFold.setAttribute('open', '');
    } else {
      addFold.setAttribute('open', '');
    }
  }
}

function initExpFoldCards_() {
  applyFoldCardsForLayout_();
}

function initSettingsFoldCards_() {
  applyFoldCardsForLayout_();
}

function ftEnsureImportWizard_() {
  if (typeof globalThis.ftLoadImportWizard === 'function') {
    return globalThis.ftLoadImportWizard();
  }
  return Promise.resolve();
}

function wireImportWizardLazy_() {
  var fold = document.getElementById('settings-import-fold');
  if (!fold) return;
  fold.addEventListener('toggle', function() {
    if (fold.open) ftEnsureImportWizard_();
  });
  if (fold.open) ftEnsureImportWizard_();
}

var expFoldResizeTimer_;
function scheduleUxLayoutCards_() {
  clearTimeout(expFoldResizeTimer_);
  expFoldResizeTimer_ = setTimeout(function() {
    initExpFoldCards_();
    initSettingsFoldCards_();
    if (typeof renderHomeWeekDigest_ === 'function') renderHomeWeekDigest_();
    var mobileExp = ftIsMobileLayout_();
    var expStrip = document.getElementById('exp-summary-strip');
    var expHero = document.querySelector('#page-expenses .exp-page-hero');
    if (expStrip) expStrip.hidden = !mobileExp;
    if (expHero) expHero.classList.toggle('exp-page-hero--hidden-mob', mobileExp);
  }, 120);
}

function collectRecentPlaces_(limit) {
  limit = limit || 25;
  var seen = {};
  var list = [];
  expenses.slice().sort(function(a, b) {
    return String(b.date).localeCompare(String(a.date)) || (Number(b.id) - Number(a.id));
  }).forEach(function(e) {
    var p = String(e.place || '').trim();
    if (!p) return;
    var key = p.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    list.push(p);
  });
  return list.slice(0, limit);
}

function refreshExpensePlaceDatalist_() {
  var dl = document.getElementById('exp-place-list');
  if (!dl) return;
  dl.innerHTML = '';
  collectRecentPlaces_().forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p;
    dl.appendChild(opt);
  });
}

// ── Add expenses ───────────────────────────────────────────
function addExpense() {
  const nEl = document.getElementById('exp-name');
  const pEl = document.getElementById('exp-place');
  const aEl = document.getElementById('exp-amount');
  const name   = nEl.value.trim();
  const place  = pEl ? pEl.value.trim() : '';
  const amount = moneyAmountFromInput(aEl);
  const date   = document.getElementById('exp-date').value || todayStr();
  let ok = true;
  if (!name)                        { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { shake(aEl); ok = false; }
  if (!ok) return;
  const dup = findNearDuplicateExpense(name, amount, date);
  if (dup) {
    const msg = 'Similar entry: ' + dup.name + ' ' + fmt(dup.amount) + ' on ' + String(dup.date).slice(0, 10) + '\nAdd anyway?';
    if (!confirm(msg)) return;
  }
  if (amount >= 3000 && !confirm('Large expense detected (' + fmt(amount) + '). Save anyway?')) return;
  if (typeof learnCatRule === 'function') learnCatRule(place || name, selectedCat);
  const entry = { id: Date.now(), name, amount, cat: selectedCat, date };
  if (place) entry.place = place;
  expenses.push(entry);
  lastExpenseTpl = { name, amount, cat: selectedCat, place: place || undefined };
  chromeStorage.local.set({ [KEY_LAST_EXP]: lastExpenseTpl });
  saveExp();
  ftHaptic_('success');
  nEl.value = '';
  if (pEl) pEl.value = '';
  moneyClearInput(aEl);
  nEl.focus();
  render();
}

function parseSplitSpec(spec) {
  return String(spec || '')
    .split(',')
    .map(function(part) { return part.trim(); })
    .filter(Boolean)
    .map(function(part) {
      var m = part.match(/^(.+?)\s*[:=]\s*([0-9]+(?:\.[0-9]{1,2})?)$/);
      if (!m) return null;
      return { cat: m[1].trim(), amount: parseFloat(m[2]) };
    })
    .filter(function(x) { return x && EXP_CATS[x.cat] && x.amount > 0; });
}

function splitModalTotal_() {
  var hint = document.getElementById('split-total-hint');
  if (!hint || !hint.dataset.splitTotal) return 0;
  var t = parseFloat(hint.dataset.splitTotal);
  return isNaN(t) || t <= 0 ? 0 : t;
}

function buildSplitCatSelect_(selected) {
  var sel = document.createElement('select');
  sel.className = 'split-row__cat';
  Object.keys(EXP_CATS).forEach(function(c) {
    var opt = document.createElement('option');
    var info = EXP_CATS[c] || {};
    opt.value = c;
    opt.textContent = c;
    if (c === selected) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function addSplitRow_(defaultCat) {
  var list = document.getElementById('split-rows');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'split-row';

  var sel = buildSplitCatSelect_(defaultCat || selectedCat || 'Other');
  var amt = document.createElement('input');
  amt.type = 'text';
  amt.className = 'split-row__amt';
  amt.placeholder = 'Amount';
  amt.inputMode = 'numeric';
  amt.autocomplete = 'off';
  wireCalculatorMoneyInput(amt);

  var rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'assets-icon-btn del split-row__rm';
  rm.title = 'Remove line';
  rm.textContent = '\u2715';
  rm.addEventListener('click', function() {
    if (list.children.length <= 2) {
      showToast('Keep at least 2 lines for a split');
      return;
    }
    row.remove();
    updateSplitSummary_();
  });

  row.appendChild(sel);
  row.appendChild(amt);
  row.appendChild(rm);
  list.appendChild(row);
}

function collectSplitRows_() {
  var list = document.getElementById('split-rows');
  if (!list) return [];
  var rows = [];
  list.querySelectorAll('.split-row').forEach(function(row) {
    var cat = row.querySelector('.split-row__cat');
    var amt = row.querySelector('.split-row__amt');
    if (!cat || !amt) return;
    var amount = moneyAmountFromInput(amt);
    if (amount > 0 && EXP_CATS[cat.value]) {
      rows.push({ cat: cat.value, amount: amount });
    }
  });
  return rows;
}

function updateSplitSummary_() {
  var summary = document.getElementById('split-summary');
  var evenBtn = document.getElementById('split-even');
  if (!summary) return;
  var rows = collectSplitRows_();
  var allocated = rows.reduce(function(a, r) { return a + r.amount; }, 0);
  var total = splitModalTotal_();
  var parts = ['Parts: ' + rows.length + ' \u00b7 Allocated: ' + fmt(allocated)];
  summary.className = 'split-summary';
  if (total > 0) {
    var diff = total - allocated;
    parts.push('of ' + fmt(total));
    if (Math.abs(diff) < 0.009) {
      parts.push('\u2713 matches receipt');
      summary.classList.add('split-summary--ok');
    } else if (diff > 0) {
      parts.push(fmt(diff) + ' left');
    } else {
      parts.push(fmt(Math.abs(diff)) + ' over');
      summary.classList.add('split-summary--warn');
    }
  }
  summary.textContent = parts.join(' \u00b7 ');
  if (evenBtn) evenBtn.hidden = !(total > 0 && listRowCount_() >= 2);
}

function listRowCount_() {
  var list = document.getElementById('split-rows');
  return list ? list.querySelectorAll('.split-row').length : 0;
}

function splitEvenly_() {
  var total = splitModalTotal_();
  if (total <= 0) return;
  var list = document.getElementById('split-rows');
  if (!list) return;
  var amts = list.querySelectorAll('.split-row__amt');
  var n = amts.length;
  if (n < 2) return;
  var each = Math.floor((total * 100) / n) / 100;
  var used = 0;
  amts.forEach(function(el, i) {
    if (i === n - 1) moneySetAmount(el, Math.round((total - used) * 100) / 100);
    else {
      moneySetAmount(el, each);
      used += each;
    }
  });
  updateSplitSummary_();
}

function openSplitModal_() {
  var nEl = document.getElementById('exp-name');
  var name = nEl ? nEl.value.trim() : '';
  if (!name) {
    if (nEl) shake(nEl);
    showToast('Enter a description first');
    return;
  }
  var preview = document.getElementById('split-desc-preview');
  if (preview) preview.textContent = name;

  var aEl = document.getElementById('exp-amount');
  var total = aEl ? moneyAmountFromInput(aEl) : 0;
  var hint = document.getElementById('split-total-hint');
  if (hint) {
    if (total > 0) {
      hint.textContent = 'Receipt total from amount field: ' + fmt(total);
      hint.dataset.splitTotal = String(total);
    } else {
      hint.textContent = 'Tip: fill Amount on the form first to track how much is left to allocate.';
      delete hint.dataset.splitTotal;
    }
  }

  var list = document.getElementById('split-rows');
  if (list) {
    list.innerHTML = '';
    addSplitRow_(selectedCat || 'Food');
    addSplitRow_('Other');
  }
  updateSplitSummary_();

  var overlay = document.getElementById('split-overlay');
  if (overlay) overlay.classList.add('open');
  var firstAmt = list && list.querySelector('.split-row__amt');
  if (firstAmt) setTimeout(function() { try { firstAmt.focus(); } catch (e) {} }, 60);
}

function closeSplitModal_() {
  var overlay = document.getElementById('split-overlay');
  if (overlay) overlay.classList.remove('open');
}

function saveSplitExpense_() {
  var nEl = document.getElementById('exp-name');
  var dEl = document.getElementById('exp-date');
  var name = nEl ? nEl.value.trim() : '';
  var date = dEl && dEl.value ? dEl.value : todayStr();
  if (!name) { if (nEl) shake(nEl); return; }

  var rows = collectSplitRows_();
  if (rows.length < 2) {
    showToast('Add at least 2 parts with amounts');
    return;
  }

  var total = splitModalTotal_();
  var allocated = rows.reduce(function(a, r) { return a + r.amount; }, 0);
  if (total > 0 && allocated > total + 0.009) {
    if (!confirm('Split total ' + fmt(allocated) + ' is more than receipt ' + fmt(total) + '. Save anyway?')) return;
  }

  var group = 'split-' + Date.now();
  var pEl = document.getElementById('exp-place');
  var place = pEl ? pEl.value.trim() : '';
  rows.forEach(function(r) {
    var row = {
      id: Date.now() + Math.random(),
      name: name + ' (split)',
      amount: r.amount,
      cat: r.cat,
      date: date,
      note: 'Split group ' + group,
    };
    if (place) row.place = place;
    expenses.push(row);
  });
  saveExp();
  if (nEl) nEl.value = '';
  if (pEl) pEl.value = '';
  var aEl = document.getElementById('exp-amount');
  if (aEl) moneyClearInput(aEl);
  closeSplitModal_();
  render();
  showToast('Split into ' + rows.length + ' expenses (' + fmt(allocated) + ')');
}

function addSplitExpense() {
  openSplitModal_();
}

function repeatLastExpense() {
  if (!lastExpenseTpl) {
    showToast('No recent expense to repeat');
    return false;
  }
  const cat = lastExpenseTpl.cat && EXP_CATS[lastExpenseTpl.cat] ? lastExpenseTpl.cat : selectedCat;
  selectedCat = cat;
  buildCatButtons();
  const row = {
    id: Date.now(),
    name: lastExpenseTpl.name,
    amount: lastExpenseTpl.amount,
    cat,
    date: todayStr(),
  };
  if (lastExpenseTpl.place) row.place = lastExpenseTpl.place;
  expenses.push(row);
  saveExp();
  render();
  showToast('Repeated: ' + lastExpenseTpl.name);
  return true;
}

function maybeSnapshotNetWorth() {
  if (settings.nwAutoSnapshot === false) return;
  if (typeof snapshotNetWorth === 'function') snapshotNetWorth();
}
function deleteExpense(id) {
  const idx = expenses.findIndex(e => e.id === id);
  if (idx < 0) return;
  const removed = expenses[idx];
  expenses.splice(idx, 1);
  saveExp();
  ftHaptic_('medium');
  render();
  registerUndoDelete('Expense', () => {
    expenses.splice(Math.min(idx, expenses.length), 0, removed);
    saveExp();
    render();
  });
}

// ── Add income ─────────────────────────────────────────────
function addIncome() {
  const nEl = document.getElementById('inc-name');
  const aEl = document.getElementById('inc-amount');
  const name   = nEl.value.trim();
  const amount = moneyAmountFromInput(aEl);
  const cat    = document.getElementById('inc-cat').value;
  const date   = document.getElementById('inc-date').value || todayStr();
  let ok = true;
  if (!name)                        { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { shake(aEl); ok = false; }
  if (!ok) return;
  if (amount >= 10000 && !confirm('Large income detected (' + fmt(amount) + '). Save anyway?')) return;
  incomes.push({ id: Date.now(), name, amount, cat, date });
  lastIncomeTpl = { name, amount, cat };
  chromeStorage.local.set({ [KEY_LAST_INC]: lastIncomeTpl });
  saveInc();
  ftHaptic_('success');
  nEl.value = '';
  moneyClearInput(aEl);
  render();
}

function repeatLastIncome() {
  if (!lastIncomeTpl) {
    showToast('No recent income to repeat');
    return false;
  }
  const cat = lastIncomeTpl.cat && INC_CATS[lastIncomeTpl.cat] ? lastIncomeTpl.cat : 'Salary';
  incomes.push({
    id: Date.now(),
    name: lastIncomeTpl.name,
    amount: lastIncomeTpl.amount,
    cat,
    date: todayStr(),
  });
  saveInc();
  render();
  showToast('Repeated income: ' + lastIncomeTpl.name);
  return true;
}

function deleteIncome(id) {
  const idx = incomes.findIndex(i => i.id === id);
  if (idx < 0) return;
  const removed = incomes[idx];
  incomes.splice(idx, 1);
  saveInc();
  ftHaptic_('medium');
  render();
  registerUndoDelete('Income', () => {
    incomes.splice(Math.min(idx, incomes.length), 0, removed);
    saveInc();
    render();
  });
}

// ── Add banks ──────────────────────────────────────────────
function addBank() {
  const nEl = document.getElementById('bk-name');
  const aEl = document.getElementById('bk-acct');
  const cEl = document.getElementById('bk-currency');
  const bEl = document.getElementById('bk-balance');
  const name    = nEl.value.trim();
  const acct    = aEl.value.trim();
  const currency = normalizeBankCurrency(cEl ? cEl.value : 'MYR');
  const balance = parseFloat(bEl.value);
  let ok = true;
  if (!name)                       { shake(nEl); ok = false; }
  if (isNaN(balance) || balance<0) { shake(bEl); ok = false; }
  if (!ok) return;
  banks.push({ id: Date.now(), name, acct: acct || 'Account', balance, currency });
  saveBanks();
  maybeSnapshotNetWorth();
  nEl.value = ''; aEl.value = ''; bEl.value = '';
  if (cEl) cEl.value = 'MYR';
  render();
}
function deleteBank(id) {
  const idx = banks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const removed = banks[idx];
  banks.splice(idx, 1);
  saveBanks();
  maybeSnapshotNetWorth();
  ftHaptic_('medium');
  render();
  registerUndoDelete('Bank account', () => {
    banks.splice(Math.min(idx, banks.length), 0, removed);
    saveBanks();
    maybeSnapshotNetWorth();
    render();
  });
}

// ── Edit modal ─────────────────────────────────────────────
let editCtx = null;

function openEditModal(type, id) {
  const arr    = type === 'exp' ? expenses : incomes;
  const catMap = type === 'exp' ? EXP_CATS : INC_CATS;
  const entry  = arr.find(e => e.id === id);
  if (!entry) return;

  editCtx = { type, id };
  document.getElementById('edit-title').textContent = type==='exp' ? 'Edit expense' : 'Edit income';
  document.getElementById('edit-name').value   = entry.name;
  moneySetAmount(document.getElementById('edit-amount'), entry.amount);
  document.getElementById('edit-date').value   = entry.date;

  const sel = document.getElementById('edit-cat');
  sel.innerHTML = '';
  Object.keys(catMap).forEach(c => {
    const opt = document.createElement('option');
    const info = catMap[c] || {};
    opt.value = c;
    opt.textContent = c;
    if (c === entry.cat) opt.selected = true;
    sel.appendChild(opt);
  });

  const noteEl = document.getElementById('edit-note');
  if (noteEl) noteEl.value = entry.note || '';

  const placeWrap = document.getElementById('edit-place-wrap');
  const placeEl = document.getElementById('edit-place');
  if (placeWrap) placeWrap.hidden = type !== 'exp';
  if (placeEl) placeEl.value = (type === 'exp' && entry.place) ? entry.place : '';

  document.getElementById('edit-overlay').classList.add('open');
  document.getElementById('edit-name').focus();
}

function closeEditModal() {
  editCtx = null;
  document.getElementById('edit-overlay').classList.remove('open');
}

function saveEdit() {
  if (!editCtx) return;
  const nEl = document.getElementById('edit-name');
  const aEl = document.getElementById('edit-amount');
  const name   = nEl.value.trim();
  const amount = moneyAmountFromInput(aEl);
  let ok = true;
  if (!name)                        { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { shake(aEl); ok = false; }
  if (!ok) return;

  const date  = document.getElementById('edit-date').value || todayStr();
  const cat   = document.getElementById('edit-cat').value;
  const noteEl = document.getElementById('edit-note');
  const note  = (noteEl && noteEl.value ? noteEl.value : '').trim();
  const arr   = editCtx.type === 'exp' ? expenses : incomes;
  const entry = arr.find(e => e.id === editCtx.id);
  if (!entry) return;

  entry.name = name; entry.amount = amount; entry.date = date; entry.cat = cat; entry.note = note;
  if (editCtx.type === 'exp') {
    const placeEl = document.getElementById('edit-place');
    const place = placeEl ? placeEl.value.trim() : '';
    if (place) entry.place = place;
    else delete entry.place;
  }

  if (editCtx.type === 'exp') saveExp(); else saveInc();
  closeEditModal();
  ftHaptic_('success');
  render();
  showToast('Entry updated');
}

// ── Category drill-down ────────────────────────────────────
function openCatDetail(cat, isIncome) {
  const catMap   = isIncome ? INC_CATS : EXP_CATS;
  const allItems = isIncome ? mInc()   : mExp();
  const items    = allItems.filter(e => e.cat === cat);
  const total    = items.reduce((a,e) => a+e.amount, 0);
  const avg      = items.length ? total/items.length : 0;
  const info     = catMap[cat] || catMap['Other'];

  document.getElementById('cd-title').innerHTML = ftCatLabelHtml_(cat, catMap, 'ft-cat-badge--sm');
  document.getElementById('cd-sub').textContent   = viewMonth.toLocaleString('default',{month:'long',year:'numeric'});
  document.getElementById('cd-total').textContent = fmt(total);
  document.getElementById('cd-count').textContent = items.length;
  document.getElementById('cd-avg').textContent   = fmt(avg);

  const list   = document.getElementById('cd-list');
  list.innerHTML = '';
  const sorted = [...items].sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
  sorted.forEach(entry => {
    const pd = parseTxDate(entry.date);
    const dlbl = pd ? pd.toLocaleDateString('en-MY',{month:'short',day:'numeric',year:'numeric'}) : '';
    const row  = document.createElement('div');
    row.className = 'cat-entry';
    row.style.cursor = 'pointer';

    const ico  = document.createElement('div');
    ico.className = 'ce-ico';
    ico.innerHTML = ftCatBadgeHtml_(entry.cat, catMap, 'ft-cat-badge--tx');

    const inf  = document.createElement('div');
    inf.className = 'ce-info';

    const nm   = document.createElement('div');
    nm.className = 'ce-name';
    nm.textContent = entry.name;

    const dt   = document.createElement('div');
    dt.className = 'ce-date';
    dt.textContent = dlbl;

    inf.appendChild(nm);
    inf.appendChild(dt);

    const amt  = document.createElement('div');
    amt.className = 'ce-amt ' + (isIncome ? 'green' : 'red');
    amt.textContent = isIncome ? '+ ' + fmt(entry.amount) : fmt(entry.amount);

    row.appendChild(ico);
    row.appendChild(inf);
    row.appendChild(amt);

    row.addEventListener('click', () => {
      closeCatDetail();
      openEditModal(isIncome ? 'inc' : 'exp', entry.id);
    });
    list.appendChild(row);
  });

  document.getElementById('cat-detail-overlay').classList.add('open');
}

function closeCatDetail() {
  document.getElementById('cat-detail-overlay').classList.remove('open');
}

// ── Mobile swipe actions (shared across lists) ─────────────
let openTxSwipe = null;

function ftUseSwipeRows() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches;
}

function closeOpenTxSwipe() {
  if (!openTxSwipe) return;
  const surface = openTxSwipe.querySelector('.tx-item__surface, .ft-swipe-surface');
  if (surface) {
    surface.classList.remove('is-open');
    surface.style.transform = '';
  }
  openTxSwipe = null;
}

function ftWireSwipe(wrap, surface, openWidth) {
  const OPEN_X = -openWidth;
  const THRESH = 48;
  let startX = 0, startY = 0, tracking = false, dx = 0;

  function setOpen(on) {
    surface.classList.toggle('is-open', on);
    if (on) {
      if (openTxSwipe && openTxSwipe !== wrap) closeOpenTxSwipe();
      openTxSwipe = wrap;
    } else if (openTxSwipe === wrap) openTxSwipe = null;
    surface.style.transform = on ? 'translateX(' + OPEN_X + 'px)' : '';
  }

  surface.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    dx = 0;
  }, { passive: true });

  surface.addEventListener('touchmove', e => {
    if (!tracking) return;
    const t = e.touches[0];
    dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 12) return;
    if (Math.abs(dx) > 10) e.preventDefault();
    const base = surface.classList.contains('is-open') ? OPEN_X : 0;
    let x = base + dx;
    if (x > 0) x = 0;
    if (x < OPEN_X) x = OPEN_X;
    surface.style.transform = 'translateX(' + x + 'px)';
  }, { passive: false });

  surface.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    const wasOpen = surface.classList.contains('is-open');
    if (wasOpen) setOpen(!(dx > THRESH));
    else setOpen(dx < -THRESH);
    if (!surface.classList.contains('is-open')) surface.style.transform = '';
  });

  surface.addEventListener('click', e => {
    if (!surface.classList.contains('is-open')) return;
    if (e.target.closest('.tx-action-btn')) return;
    const r = surface.getBoundingClientRect();
    if (e.clientX > r.right - 40) return;
    setOpen(false);
  });
}

function ftMountSwipeRow(surface, actions) {
  if (!ftUseSwipeRows() || !actions.length) return surface;
  const width = actions.length * 72;
  const wrap = document.createElement('div');
  wrap.className = 'tx-swipe-wrap';
  const behind = document.createElement('div');
  behind.className = 'tx-swipe-actions';
  actions.forEach(act => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tx-swipe-act tx-swipe-act--' + (act.kind || 'edit');
    btn.textContent = act.label;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      closeOpenTxSwipe();
      act.onClick();
    });
    behind.appendChild(btn);
  });
  wrap.appendChild(behind);
  if (!surface.classList.contains('tx-item__surface')) surface.classList.add('tx-item__surface', 'ft-swipe-surface');
  wrap.appendChild(surface);
  ftWireSwipe(wrap, surface, width);
  return wrap;
}

document.addEventListener('touchstart', e => {
  if (!openTxSwipe) return;
  if (e.target.closest('.tx-swipe-wrap')) return;
  closeOpenTxSwipe();
}, { passive: true });

// ── Drag & drop ────────────────────────────────────────────
let dragSrc = null;
function makeDraggable(el, list, arr, save) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', e => {
    dragSrc = el; el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    list.querySelectorAll('.tx-item').forEach(i => i.classList.remove('drag-over'));
    const newOrder = [];
    list.querySelectorAll('.tx-item').forEach(i => {
      const f = arr.find(a => a.id === Number(i.dataset.id));
      if (f) newOrder.push(f);
    });
    arr.length = 0; newOrder.forEach(o => arr.push(o)); save();
  });
  el.addEventListener('dragover', e => {
    e.preventDefault();
    if (el !== dragSrc) {
      list.querySelectorAll('.tx-item').forEach(i => i.classList.remove('drag-over'));
      el.classList.add('drag-over');
    }
  });
  el.addEventListener('drop', e => {
    e.preventDefault();
    if (dragSrc && dragSrc !== el) {
      const all = [...list.querySelectorAll('.tx-item')];
      if (all.indexOf(dragSrc) < all.indexOf(el)) el.after(dragSrc);
      else el.before(dragSrc);
    }
  });
}

// ── Render ─────────────────────────────────────────────────
function monthTotals_() {
  const me = mExp();
  const mi = mInc();
  const today = todayStr();
  const totalExp = me.reduce((a, e) => a + e.amount, 0);
  const todayExp = expenses.filter(e => e.date === today).reduce((a, e) => a + e.amount, 0);
  const totalInc = mi.reduce((a, i) => a + i.amount, 0);
  return {
    me, mi, today, totalExp, todayExp, totalInc,
    totalBanks: totalBanksBase(),
    net: totalInc - totalExp,
  };
}

function syncMonthLabel_() {
  const el = document.getElementById('month-label');
  if (el) {
    el.textContent = viewMonth.toLocaleString('default', { month: 'short', year: 'numeric' });
  }
  if (typeof syncMobileMonthNav_ === 'function') syncMobileMonthNav_();
}

function ftActiveTab_() {
  const page = document.querySelector('.page.active');
  return page && page.id ? page.id.replace(/^page-/, '') : '';
}

function renderExpenseFilterOnly_() {
  const me = mExp();
  const fb = document.getElementById('filter-bar');
  if (fb) {
    fb.querySelectorAll('.pill').forEach(function(b) {
      b.classList.toggle('active', b.textContent === activeFilter);
    });
  }
  const filtered = activeFilter === 'All' ? me : me.filter(e => e.cat === activeFilter);
  renderTxList(
    'expense-list',
    [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    EXP_CATS,
    false
  );
}

function renderExpensesPanel_(t) {
  t = t || monthTotals_();
  const me = t.me;

  const cTotal = document.getElementById('c-total');
  if (cTotal) cTotal.textContent = fmt(t.totalExp);
  const cToday = document.getElementById('c-today');
  if (cToday) cToday.textContent = fmt(t.todayExp);
  const cCount = document.getElementById('c-count');
  if (cCount) cCount.textContent = me.length;

  const mobileExp = ftIsMobileLayout_();
  const expStrip = document.getElementById('exp-summary-strip');
  const expHero = document.querySelector('#page-expenses .exp-page-hero');
  if (expStrip) {
    expStrip.hidden = !mobileExp;
    const stripToday = document.getElementById('exp-strip-today');
    const stripMonth = document.getElementById('exp-strip-month');
    const stripCount = document.getElementById('exp-strip-count');
    if (stripToday) stripToday.textContent = fmt(t.todayExp);
    if (stripMonth) stripMonth.textContent = fmt(t.totalExp);
    if (stripCount) stripCount.textContent = String(me.length);
  }
  if (expHero) expHero.classList.toggle('exp-page-hero--hidden-mob', mobileExp);

  const expPtEl = document.getElementById('exp-petrol-metrics');
  if (expPtEl) {
    const ym = viewYM();
    const mPetrol = (typeof petrolLog !== 'undefined' && Array.isArray(petrolLog))
      ? petrolLog.filter(p => p && p.date && String(p.date).startsWith(ym))
      : [];
    const ptSpend = mPetrol.reduce((a, p) => a + (Number(p.total) || 0), 0);
    const ptLitres = mPetrol.reduce((a, p) => a + (Number(p.litres) || 0), 0);
    const withOdo = mPetrol
      .filter(p => p && Number(p.odo) > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.odo) - Number(b.odo));
    let avgL100 = 0;
    let cpk = 0;
    if (withOdo.length >= 2 && ptLitres > 0) {
      let totalKm = 0;
      let fuelUsed = 0;
      for (let i = 1; i < withOdo.length; i++) {
        const km = Number(withOdo[i].odo) - Number(withOdo[i - 1].odo);
        if (km > 0) {
          totalKm += km;
          fuelUsed += Number(withOdo[i].litres) || 0;
        }
      }
      if (totalKm > 0 && fuelUsed > 0) {
        avgL100 = (fuelUsed / totalKm) * 100;
        const avgPpl = ptSpend / ptLitres;
        cpk = (fuelUsed / totalKm) * avgPpl;
      }
    }
    expPtEl.textContent = (avgL100 > 0 && cpk > 0)
      ? ('Petrol: ' + (typeof petrolFmtEfficiency === 'function'
        ? petrolFmtEfficiency(avgL100)
        : avgL100.toFixed(1) + ' L/100 km') + ' · RM ' + cpk.toFixed(2) + '/km')
      : '';
    expPtEl.hidden = !expPtEl.textContent;
  }

  const usedCats = [...new Set(me.map(e => e.cat))];
  const fb = document.getElementById('filter-bar');
  if (fb) {
    fb.innerHTML = '';
    ['All', ...usedCats].forEach(c => {
      const b = document.createElement('button');
      b.className = 'pill' + (activeFilter === c ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => { activeFilter = c; renderExpenseFilterOnly_(); });
      fb.appendChild(b);
    });
  }

  const filtered = activeFilter === 'All' ? me : me.filter(e => e.cat === activeFilter);
  renderTxList(
    'expense-list',
    [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    EXP_CATS,
    false
  );
  renderBarChart('bar-chart', me, EXP_CATS, false);
  const expDailyEl = document.getElementById('exp-daily-chart');
  if (expDailyEl) {
    const dayKeys = buildMonthDateKeys();
    const dayTotals = buildMonthDailyTotals(dayKeys, me);
    renderMonthDailyLineChart(expDailyEl, dayKeys, dayTotals, { stroke: '#E24B4A', label: 'Spent' });
  }

  if (typeof renderMoMDeltas === 'function') renderMoMDeltas();
  if (typeof renderExpMonthSummary === 'function') renderExpMonthSummary();
  if (typeof renderBudgets === 'function') renderBudgets();
  if (typeof renderExpBudgetChips === 'function') renderExpBudgetChips();
  if (typeof renderSavingsGoal === 'function') renderSavingsGoal();
  refreshExpensePlaceDatalist_();
}

function renderIncomePanel_(t) {
  t = t || monthTotals_();
  const mi = t.mi;

  const icTotal = document.getElementById('ic-total');
  if (icTotal) icTotal.textContent = fmt(t.totalInc);
  const icExp = document.getElementById('ic-exp');
  if (icExp) icExp.textContent = fmt(t.totalExp);
  const nel = document.getElementById('ic-net');
  if (nel) {
    nel.textContent = fmt(Math.abs(t.net));
    nel.className = 'ft-page-hero__value ' + (t.net >= 0 ? 'green' : 'red');
  }
  renderTxList(
    'income-list',
    [...mi].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    INC_CATS,
    true
  );
  renderBarChart('inc-chart', mi, INC_CATS, true);
}

function renderAssetsSummaries_(t) {
  t = t || monthTotals_();
  const totalBanksVal = t.totalBanks;
  const utMv = computeUtTotalMarketValue();
  const portfolioTotal = totalBanksVal + utMv;
  const monthCashflow = t.totalInc - t.totalExp;

  const nsBanks = document.getElementById('ns-banks');
  if (nsBanks) nsBanks.textContent = fmt(totalBanksVal);
  const nsIncome = document.getElementById('ns-income');
  if (nsIncome) nsIncome.textContent = fmt(t.totalInc);
  const nsExp = document.getElementById('ns-exp');
  if (nsExp) nsExp.textContent = fmt(t.totalExp);

  const nsPortfolio = document.getElementById('ns-portfolio');
  if (nsPortfolio) {
    nsPortfolio.textContent = fmt(portfolioTotal);
    nsPortfolio.className = 'assets-hero__value ' + (portfolioTotal >= 0 ? 'green' : 'red');
  }
  const nsCashflow = document.getElementById('ns-cashflow');
  if (nsCashflow) {
    nsCashflow.textContent = (monthCashflow >= 0 ? '+' : '−') + fmt(Math.abs(monthCashflow));
    nsCashflow.className = 'assets-cashflow-pill__val ' + (monthCashflow >= 0 ? 'green' : 'red');
  }
  const nsUt = document.getElementById('ns-ut');
  if (nsUt) nsUt.textContent = fmt(utMv);
  const nsBankCount = document.getElementById('ns-bank-count');
  if (nsBankCount) {
    nsBankCount.textContent = banks.length + ' account' + (banks.length === 1 ? '' : 's');
  }
  const nsUtCount = document.getElementById('ns-ut-count');
  if (nsUtCount) {
    nsUtCount.textContent = utHoldings.length + ' fund' + (utHoldings.length === 1 ? '' : 's');
  }

  const nnet = document.getElementById('ns-net');
  if (nnet) {
    nnet.textContent = fmt(portfolioTotal);
    nnet.className = 'assets-hero__value ' + (portfolioTotal >= 0 ? 'green' : 'red');
  }

  const utSumEl = document.getElementById('ut-summary-mv');
  if (utSumEl) utSumEl.textContent = fmt(utMv);
}

function renderActivePagePanels_(t) {
  t = t || monthTotals_();
  const tab = ftActiveTab_();
  if (!tab || tab === 'expenses') renderExpensesPanel_(t);
  if (!tab || tab === 'income') renderIncomePanel_(t);
  if (!tab || tab === 'assets' || tab === 'home') renderAssetsSummaries_(t);

  const pageAssets = document.getElementById('page-assets');
  if (pageAssets && pageAssets.classList.contains('active')) {
    renderBankList();
    renderUnitTrustPanel();
    if (typeof renderAllNetWorthCharts === 'function') renderAllNetWorthCharts();
  }

  if (!tab || tab === 'home') {
    if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  }
  if (!tab || tab === 'recurring') {
    if (typeof renderRecurring === 'function') renderRecurring();
  }
  if (typeof renderNwSnapshotHint === 'function') renderNwSnapshotHint();
}

function render() {
  utCarryForwardNavSnapshotForToday();
  syncMonthLabel_();
  const t = monthTotals_();
  renderExpensesPanel_(t);
  renderIncomePanel_(t);
  renderAssetsSummaries_(t);

  const pageAssets = document.getElementById('page-assets');
  if (pageAssets && pageAssets.classList.contains('active')) {
    renderBankList();
    renderUnitTrustPanel();
    if (typeof renderAllNetWorthCharts === 'function') renderAllNetWorthCharts();
  }

  if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (typeof renderRecurring === 'function') renderRecurring();
  if (typeof renderNwSnapshotHint === 'function') renderNwSnapshotHint();
  refreshActiveTabPanels();
}

// ── Transaction list ───────────────────────────────────────
const TX_VIRTUAL_THRESHOLD = 100;
const TX_ROW_HEIGHT_EST = 56;

function buildTxRow_(entry, catMap, isIncome, arr, save, opts) {
  opts = opts || {};
  const useSwipe = opts.useSwipe != null ? opts.useSwipe : ftUseSwipeRows();
  const showDrag = opts.showDrag != null
    ? opts.showDrag
    : (settings.showDrag !== false && !useSwipe);
  const cat = catMap[entry.cat] || catMap['Other'];
  const pd = parseTxDate(entry.date);
  const dlbl = pd ? pd.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }) : '';

  const item = document.createElement('div');
  item.className = 'tx-item' + (useSwipe ? ' tx-item__surface' : '');
  item.dataset.id = entry.id;

  if (showDrag) {
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    item.appendChild(handle);
  }

  const ico = document.createElement('div');
  ico.className = 'tx-icon';
  ico.style.background = cat.color + '22';
  ico.innerHTML = typeof ftCatBadgeHtml_ === 'function'
    ? ftCatBadgeHtml_(entry.cat, catMap, 'ft-cat-badge--tx')
    : esc(cat.icon || '');
  item.appendChild(ico);

  const info = document.createElement('div');
  info.className = 'tx-info';

  const nm = document.createElement('div');
  nm.className = 'tx-name';
  nm.textContent = entry.name;
  info.appendChild(nm);

  const meta = document.createElement('div');
  meta.className = 'tx-meta';
  var metaParts = [];
  if (!isIncome && entry.place) metaParts.push(entry.place);
  metaParts.push(entry.cat);
  metaParts.push(dlbl);
  meta.textContent = metaParts.join(' · ');
  if (entry.note) {
    const noteSpan = document.createElement('span');
    noteSpan.style.cssText = 'color:var(--ink3);font-style:italic';
    noteSpan.textContent = ' · ' + entry.note;
    meta.appendChild(noteSpan);
  }
  info.appendChild(meta);
  item.appendChild(info);

  const amt = document.createElement('div');
  amt.className = 'tx-amount' + (isIncome ? ' green' : '');
  amt.textContent = isIncome ? '+ ' + fmt(entry.amount) : fmt(entry.amount);
  item.appendChild(amt);

  const actions = document.createElement('div');
  actions.className = 'tx-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'tx-action-btn edit';
  editBtn.title = 'Edit';
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', e => {
    e.stopPropagation();
    openEditModal(isIncome ? 'inc' : 'exp', entry.id);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'tx-action-btn del';
  delBtn.title = 'Delete';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm('Delete this entry?')) {
      if (isIncome) deleteIncome(entry.id); else deleteExpense(entry.id);
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  if (useSwipe) {
    return ftMountSwipeRow(item, [
      { label: 'Edit', kind: 'edit', onClick: () => openEditModal(isIncome ? 'inc' : 'exp', entry.id) },
      { label: 'Delete', kind: 'del', onClick: () => {
        if (confirm('Delete this entry?')) {
          if (isIncome) deleteIncome(entry.id); else deleteExpense(entry.id);
        }
      }},
    ]);
  }

  item.appendChild(actions);
  return item;
}

function renderTxListVirtual_(el, items, catMap, isIncome, arr, save, useSwipe) {
  el.classList.add('tx-list--virtual');
  const viewport = document.createElement('div');
  viewport.className = 'tx-list__viewport';

  const spacerTop = document.createElement('div');
  spacerTop.className = 'tx-list__spacer';
  const windowEl = document.createElement('div');
  windowEl.className = 'tx-list__window';
  const spacerBottom = document.createElement('div');
  spacerBottom.className = 'tx-list__spacer';

  viewport.appendChild(spacerTop);
  viewport.appendChild(windowEl);
  viewport.appendChild(spacerBottom);
  el.appendChild(viewport);

  let rowHeight = TX_ROW_HEIGHT_EST;
  const buffer = 6;
  let rafPending = false;
  const mounted = new Map();

  function measure() {
    if (!items.length) return;
    const probe = buildTxRow_(items[0], catMap, isIncome, arr, save, { useSwipe: useSwipe, showDrag: false });
    windowEl.appendChild(probe);
    rowHeight = Math.max(44, probe.offsetHeight || TX_ROW_HEIGHT_EST);
    windowEl.removeChild(probe);
  }

  function paint() {
    rafPending = false;
    var scrollTop;
    var viewH;
    if (ftIsMobileLayout_()) {
      scrollTop = viewport.scrollTop;
      viewH = viewport.clientHeight || 400;
    } else {
      var rect = viewport.getBoundingClientRect();
      scrollTop = Math.max(0, -rect.top);
      viewH = window.innerHeight || 400;
    }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const end = Math.min(items.length, Math.ceil((scrollTop + viewH) / rowHeight) + buffer);

    spacerTop.style.height = (start * rowHeight) + 'px';
    spacerBottom.style.height = ((items.length - end) * rowHeight) + 'px';

    mounted.forEach(function(node, idx) {
      if (idx < start || idx >= end) {
        if (node.parentNode) node.parentNode.removeChild(node);
        mounted.delete(idx);
      }
    });

    for (let i = start; i < end; i++) {
      if (!mounted.has(i)) {
        const node = buildTxRow_(items[i], catMap, isIncome, arr, save, { useSwipe: useSwipe, showDrag: false });
        mounted.set(i, node);
        windowEl.appendChild(node);
      }
    }
  }

  function schedulePaint() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(paint);
    }
  }

  measure();
  viewport.addEventListener('scroll', schedulePaint, { passive: true });
  window.addEventListener('scroll', schedulePaint, { passive: true });
  window.addEventListener('resize', schedulePaint, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(schedulePaint);
    ro.observe(viewport);
  }
  schedulePaint();
}

function renderTxList(id, items, catMap, isIncome) {
  const el   = document.getElementById(id);
  const arr  = isIncome ? incomes : expenses;
  const save = isIncome ? saveInc : saveExp;
  el.innerHTML = '';
  el.classList.remove('tx-list--virtual');

  if (!items.length) {
    el.appendChild(buildEmptyState_({
      icon: isIncome ? 'income' : 'expenses',
      msg: isIncome ? 'No income this month' : 'No expenses this month',
      hint: isIncome ? 'Log salary, refunds, or other inflows.' : 'Use the form above to track spending.',
      ctaTab: isIncome ? 'income' : 'expenses',
      ctaLabel: isIncome ? 'Go to Income' : 'Add expense'
    }));
    return;
  }

  const useSwipe = ftUseSwipeRows();

  if (items.length > TX_VIRTUAL_THRESHOLD) {
    renderTxListVirtual_(el, items, catMap, isIncome, arr, save, useSwipe);
    return;
  }

  const showDrag = settings.showDrag !== false && !useSwipe;
  items.forEach(entry => {
    const row = buildTxRow_(entry, catMap, isIncome, arr, save, { useSwipe: useSwipe, showDrag: showDrag });
    el.appendChild(row);
    if (!useSwipe && showDrag) makeDraggable(row, el, arr, save);
  });
}

// ── Bar chart ──────────────────────────────────────────────
function renderBarChart(id, items, catMap, isIncome) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';

  const totals = {};
  items.forEach(e => { totals[e.cat] = (totals[e.cat]||0) + e.amount; });
  const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
  const max    = Math.max(...sorted.map(s=>s[1]), 1);
  const grand  = sorted.reduce((a,s)=>a+s[1], 0);

  if (!sorted.length) {
    const em = document.createElement('div');
    em.style.cssText = 'text-align:center;padding:20px;color:var(--ink3);font-size:var(--f-sm)';
    em.textContent = 'No data yet';
    el.appendChild(em);
    return;
  }

  sorted.forEach(([cat, val]) => {
    const color = (catMap[cat] || catMap['Other']).color;
    const pct   = Math.round((val/max)*100);
    const share = grand>0 ? Math.round((val/grand)*100) : 0;

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.title = 'Click to see all ' + cat + ' entries';
    row.addEventListener('click', () => openCatDetail(cat, isIncome));

    const lbl = document.createElement('div'); lbl.className='bar-label'; lbl.textContent=cat; row.appendChild(lbl);

    const track = document.createElement('div'); track.className='bar-track';
    const fill  = document.createElement('div'); fill.className='bar-fill';
    fill.style.cssText = 'width:'+pct+'%;background:'+color; track.appendChild(fill); row.appendChild(track);

    const pctEl = document.createElement('div');
    pctEl.style.cssText='font-size:var(--f-xs);color:var(--ink3);width:30px;flex-shrink:0;text-align:right';
    pctEl.textContent = share+'%'; row.appendChild(pctEl);

    const valEl = document.createElement('div'); valEl.className='bar-value'; valEl.textContent=fmt(val); row.appendChild(valEl);

    el.appendChild(row);
  });
}

/** Line chart for one month: dates (YYYY-MM-DD) vs numeric values (e.g. daily spend). */
function renderMonthDailyLineChart(el, dateKeys, values, opts) {
  if (!el) return;
  opts = opts || {};
  const stroke = opts.stroke || '#378ADD';
  const label = opts.label || '';
  const n = dateKeys.length;
  if (!n) {
    el.innerHTML = '';
    return;
  }
  const maxV = Math.max.apply(null, values.concat([0]));
  if (maxV <= 0) {
    el.innerHTML =
      '<div style="text-align:center;padding:14px;color:var(--ink3);font-size:var(--f-sm)">No ' +
      esc(label || 'amounts') +
      ' on any day this month yet.</div>';
    return;
  }
  const W = el.clientWidth || 360;
  const H = 150;
  const PAD = { t: 12, r: 12, b: 30, l: 52 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const minV = 0;
  const rng = maxV - minV || 1;
  const xOf = i => (n === 1 ? PAD.l + cW / 2 : PAD.l + (i / (n - 1)) * cW);
  const yOf = v => PAD.t + cH - ((v - minV) / rng) * cH;
  const pts = values.map((v, i) => xOf(i) + ',' + yOf(v));
  const path = 'M ' + pts.join(' L ');
  const area =
    'M ' +
    xOf(0) +
    ',' +
    (PAD.t + cH) +
    ' L ' +
    pts.join(' L ') +
    ' L ' +
    xOf(n - 1) +
    ',' +
    (PAD.t + cH) +
    ' Z';
  const yLbls = [
    { v: maxV, y: yOf(maxV) },
    { v: maxV / 2, y: yOf(maxV / 2) },
    { v: 0, y: yOf(0) },
  ];
  const xPick = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xLbls = xPick.map(i => ({ lbl: dateKeys[i].slice(5), x: xOf(i), full: dateKeys[i] }));
  const circles = values
    .map((v, i) =>
      v > 0
        ? '<circle cx="' +
          xOf(i) +
          '" cy="' +
          yOf(v) +
          '" r="3" fill="' +
          stroke +
          '" stroke="white" stroke-width="1.2"><title>' +
          esc(dateKeys[i]) +
          ': ' +
          fmt(v) +
          '</title></circle>'
        : ''
    )
    .join('');
  el.innerHTML =
    '<div class="nw-chart-wrap"><svg class="nw-svg" viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="exp-daily-grad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' +
    stroke +
    '" stop-opacity="0.12"/>' +
    '<stop offset="100%" stop-color="' +
    stroke +
    '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' +
    area +
    '" fill="url(#exp-daily-grad)"/>' +
    '<path d="' +
    path +
    '" fill="none" stroke="' +
    stroke +
    '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    yLbls
      .map(
        l =>
          '<text class="nw-axis-lbl" x="' +
          (PAD.l - 6) +
          '" y="' +
          (l.y + 3) +
          '" text-anchor="end">' +
          fmt(l.v) +
          '</text>'
      )
      .join('') +
    xLbls
      .map(
        l =>
          '<text class="nw-axis-lbl" x="' +
          l.x +
          '" y="' +
          (H - 6) +
          '" text-anchor="middle">' +
          esc(l.lbl) +
          '</text>'
      )
      .join('') +
    circles +
    '</svg></div>';
}

// ── Bank list ──────────────────────────────────────────────
function renderBankList() {
  const el = document.getElementById('bank-list');
  if (!el) return;
  el.innerHTML = '';

  if (!banks.length) {
    const em = document.createElement('div');
    em.className = 'empty';
    em.style.padding = 'var(--s4) 0';
    const ico = document.createElement('div');
    ico.className = 'empty-icon ft-empty-state__ico';
    ico.innerHTML = ftIconHtml_('wallet', 'ft-empty-state__svg');
    em.appendChild(ico);
    em.appendChild(document.createTextNode('No bank accounts yet'));
    el.appendChild(em);
    return;
  }

  banks.forEach(b => {
    const wrap = document.createElement('div');
    wrap.className = 'assets-bank-card';

    const row = document.createElement('div');
    row.className = 'assets-acct-row';

    const ico = document.createElement('div');
    ico.className = 'assets-acct-row__ico';
    ico.innerHTML = ftIconHtml_('wallet', 'ft-ico ft-ico--sm');

    const body = document.createElement('div');
    body.className = 'assets-acct-row__body';
    const nameEl = document.createElement('div');
    nameEl.className = 'assets-acct-row__name';
    nameEl.textContent = b.name;
    const meta = document.createElement('div');
    meta.className = 'assets-acct-row__meta';
    meta.textContent = b.acct || 'Account';
    body.appendChild(nameEl);
    body.appendChild(meta);

    const curBadge = document.createElement('span');
    curBadge.className = 'assets-currency-pill';
    curBadge.textContent = normalizeBankCurrency(b.currency);

    const bal = document.createElement('div');
    bal.className = 'assets-acct-row__bal';
    bal.textContent = fmtBankAmount(b.balance, b.currency);
    const balBase = document.createElement('div');
    balBase.className = 'assets-acct-row__bal-base';
    if (normalizeBankCurrency(b.currency) !== 'MYR') {
      balBase.textContent = '≈ ' + fmt(bankBalanceInBase(b));
    }

    const actions = document.createElement('div');
    actions.className = 'assets-acct-row__actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'assets-icon-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'assets-icon-btn del';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm('Delete this account?')) deleteBank(b.id);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(ico);
    row.appendChild(body);
    row.appendChild(curBadge);
    const balWrap = document.createElement('div');
    balWrap.className = 'assets-acct-row__bal-wrap';
    balWrap.appendChild(bal);
    if (balBase.textContent) balWrap.appendChild(balBase);
    row.appendChild(balWrap);
    row.appendChild(actions);

    const edit = document.createElement('details');
    edit.className = 'assets-acct-edit';
    const sum = document.createElement('summary');
    sum.textContent = 'Edit account';
    edit.appendChild(sum);
    const editBody = document.createElement('div');
    editBody.className = 'assets-acct-edit__body';

    const grid = document.createElement('div');
    grid.className = 'assets-form-grid assets-form-grid--4';

    const nameWrap = document.createElement('div');
    const nameLab = document.createElement('label');
    nameLab.className = 'lbl';
    nameLab.textContent = 'Bank';
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.className = 'be-name';
    nameInp.value = b.name;
    nameInp.maxLength = 24;
    nameWrap.appendChild(nameLab);
    nameWrap.appendChild(nameInp);

    const acctWrap = document.createElement('div');
    const acctLab = document.createElement('label');
    acctLab.className = 'lbl';
    acctLab.textContent = 'Account';
    const acctInp = document.createElement('input');
    acctInp.type = 'text';
    acctInp.className = 'be-acct';
    acctInp.value = b.acct;
    acctInp.maxLength = 24;
    acctWrap.appendChild(acctLab);
    acctWrap.appendChild(acctInp);

    const curWrap = document.createElement('div');
    const curLab = document.createElement('label');
    curLab.className = 'lbl';
    curLab.textContent = 'Currency';
    const curSel = document.createElement('select');
    curSel.className = 'be-curr';
    fillBankCurrencySelect(curSel, b.currency);
    curWrap.appendChild(curLab);
    curWrap.appendChild(curSel);

    const balFieldWrap = document.createElement('div');
    const balLab = document.createElement('label');
    balLab.className = 'lbl';
    balLab.textContent = 'Balance';
    const balInp = document.createElement('input');
    balInp.type = 'number';
    balInp.className = 'be-bal';
    balInp.value = String(b.balance);
    balInp.min = '0';
    balInp.step = '0.01';
    balFieldWrap.appendChild(balLab);
    balFieldWrap.appendChild(balInp);

    grid.appendChild(nameWrap);
    grid.appendChild(acctWrap);
    grid.appendChild(curWrap);
    grid.appendChild(balFieldWrap);
    editBody.appendChild(grid);

    const btnRow = document.createElement('div');
    btnRow.className = 'assets-form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const nameVal = nameInp.value.trim();
      const acctVal = acctInp.value.trim();
      const balVal = parseFloat(balInp.value);
      if (!nameVal || isNaN(balVal) || balVal < 0) { shake(nameInp); return; }
      b.name = nameVal;
      b.acct = acctVal || 'Account';
      b.currency = normalizeBankCurrency(curSel.value);
      b.balance = balVal;
      saveBanks();
      maybeSnapshotNetWorth();
      render();
      showToast('Account updated');
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => edit.removeAttribute('open'));
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    editBody.appendChild(btnRow);
    edit.appendChild(editBody);

    editBtn.addEventListener('click', () => {
      edit.open = !edit.open;
    });

    wrap.appendChild(row);
    wrap.appendChild(edit);
    el.appendChild(wrap);
  });
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
let toastActionCleanup = null;
let undoDeleteState = null;
function showToast(msg, opts) {
  opts = opts || {};
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = '';
  const txt = document.createElement('span');
  txt.textContent = msg;
  el.appendChild(txt);
  if (toastActionCleanup) {
    try { toastActionCleanup(); } catch (e) {}
    toastActionCleanup = null;
  }
  if (opts.actionLabel && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.actionLabel;
    btn.style.cssText = 'margin-left:10px;border:0;background:transparent;color:#9fd4ff;font-weight:700;cursor:pointer';
    const click = () => {
      try { opts.onAction(); } catch (e) {}
      el.classList.remove('show');
    };
    btn.addEventListener('click', click);
    toastActionCleanup = () => btn.removeEventListener('click', click);
    el.appendChild(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastActionCleanup) {
      try { toastActionCleanup(); } catch (e) {}
      toastActionCleanup = null;
    }
    el.classList.remove('show');
  }, opts.duration || 2600);
}

function registerUndoDelete(label, restoreFn) {
  if (undoDeleteState && undoDeleteState.t) clearTimeout(undoDeleteState.t);
  undoDeleteState = {
    restore: restoreFn,
    t: setTimeout(() => { undoDeleteState = null; }, 8200),
  };
  showToast(label + ' deleted', {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: () => {
      if (!undoDeleteState || typeof undoDeleteState.restore !== 'function') return;
      const fn = undoDeleteState.restore;
      undoDeleteState = null;
      fn();
      showToast(label + ' restored');
    },
  });
}

// ── Export / Import backup ─────────────────────────────────
function exportData() {
  const payload = {
    version: 5,
    exported: new Date().toISOString(),
    expenses, incomes, banks,
    unitTrustHoldings: utHoldings,
    unitTrustNav: utNavPoints,
    recurring:    (typeof recurring    !== 'undefined') ? recurring    : [],
    networthHist: (typeof networthHist !== 'undefined') ? networthHist : [],
    budgets:      (typeof budgets      !== 'undefined') ? budgets      : {},
    savingsGoal:  (typeof savingsGoal  !== 'undefined') ? savingsGoal  : null,
    catRules:     (typeof catRules     !== 'undefined') ? catRules     : {},
    lastExpense:  lastExpenseTpl || null,
    lastIncome:   lastIncomeTpl || null,
    petrolLog:    (typeof petrolLog    !== 'undefined') ? petrolLog    : [],
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'finance-tracker-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  settings.backupLastExportAt = payload.exported;
  settings.backupRemindedYm = viewMonth.getFullYear() + '-' + String(viewMonth.getMonth() + 1).padStart(2, '0');
  saveSets();
  showToast('Backup exported');
}

function importBackup(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!Array.isArray(d.expenses) || !Array.isArray(d.incomes) || !Array.isArray(d.banks)) {
        showToast('Invalid backup file'); return;
      }
      const from = d.exported ? d.exported.slice(0,10) : 'unknown date';
      const ans = (prompt(
        'Restore from ' + from + '\n\n' +
        'Type "merge"   — add entries; entries with the SAME date and amount are overwritten by the backup.\n' +
        'Type "replace" — REPLACE all current data with the backup.\n',
        'merge'
      ) || '').trim().toLowerCase();
      if (ans !== 'merge' && ans !== 'replace') { showToast('Import cancelled'); return; }

      bumpStorageReadGeneration();

      // Match key for "same date and amount" overwrite.
      function keyDA(x) { return String(x.date) + '|' + Number(x.amount).toFixed(2); }
      function mergeByDateAmount(existing, incoming) {
        if (!Array.isArray(incoming) || !incoming.length) return { merged: existing.slice(), overwritten: 0, added: 0 };
        const keys = new Set();
        const ids  = new Set();
        incoming.forEach(x => {
          keys.add(keyDA(x));
          if (x && x.id != null) ids.add(x.id);
        });
        let overwritten = 0;
        const kept = existing.filter(x => {
          const hit = keys.has(keyDA(x)) || (x && x.id != null && ids.has(x.id));
          if (hit) overwritten++;
          return !hit;
        });
        return { merged: kept.concat(incoming), overwritten: overwritten, added: incoming.length - overwritten };
      }
      function mergeById(existing, incoming) {
        if (!Array.isArray(incoming) || !incoming.length) return existing.slice();
        const ids = new Set(incoming.map(x => x && x.id).filter(id => id != null));
        return existing.filter(x => x && x.id != null ? !ids.has(x.id) : true).concat(incoming);
      }

      let expRes = { overwritten: 0, added: 0 };
      let incRes = { overwritten: 0, added: 0 };

      if (ans === 'replace') {
        expenses = d.expenses; incomes = d.incomes; banks = (d.banks || []).map(normalizeBankRow);
        if (Array.isArray(d.unitTrustHoldings)) utHoldings = utSanitizeHoldings(d.unitTrustHoldings);
        else utHoldings = [];
        if (Array.isArray(d.unitTrustNav)) utNavPoints = utSanitizeNav(d.unitTrustNav);
        else utNavPoints = [];
        if (d.recurring    && typeof recurring    !== 'undefined') recurring    = d.recurring;
        if (d.networthHist && typeof networthHist !== 'undefined') networthHist = d.networthHist;
        if (d.budgets      && typeof budgets      !== 'undefined') budgets      = d.budgets;
        if (d.savingsGoal !== undefined && typeof savingsGoal !== 'undefined') savingsGoal = d.savingsGoal;
        if (d.catRules     && typeof catRules     !== 'undefined') catRules     = d.catRules;
        if (d.petrolLog    && typeof petrolLog    !== 'undefined') petrolLog    = d.petrolLog;
      } else {
        expRes = mergeByDateAmount(expenses, d.expenses); expenses = expRes.merged;
        incRes = mergeByDateAmount(incomes,  d.incomes);  incomes  = incRes.merged;
        if (Array.isArray(d.banks)) banks = mergeById(banks, d.banks).map(normalizeBankRow);
        if (d.recurring    && typeof recurring    !== 'undefined') recurring    = mergeById(recurring, d.recurring);
        if (d.petrolLog    && typeof petrolLog    !== 'undefined') petrolLog    = mergeById(petrolLog, d.petrolLog);
        if (d.networthHist && typeof networthHist !== 'undefined') {
          const nDates = new Set(d.networthHist.map(n => n.date));
          networthHist = networthHist.filter(x => !nDates.has(x.date)).concat(d.networthHist);
        }
        if (d.budgets && typeof budgets !== 'undefined') {
          budgets = Object.assign({}, budgets, d.budgets);
        }
        if (d.savingsGoal !== undefined && typeof savingsGoal !== 'undefined') {
          savingsGoal = d.savingsGoal;
        }
        if (d.catRules && typeof catRules !== 'undefined') {
          catRules = Object.assign({}, catRules, d.catRules);
        }
        if (Array.isArray(d.unitTrustHoldings) && d.unitTrustHoldings.length) {
          utHoldings = mergeById(utHoldings, utSanitizeHoldings(d.unitTrustHoldings));
        }
        if (Array.isArray(d.unitTrustNav) && d.unitTrustNav.length) {
          utNavPoints = mergeUtNavPoints(utNavPoints, d.unitTrustNav);
        }
      }

      saveExp(); saveInc(); saveBanks();
      saveUtHoldings();
      saveUtNav();
      if (typeof saveRec    === 'function') saveRec();
      if (typeof saveNWH    === 'function') saveNWH();
      if (typeof saveBud    === 'function') saveBud();
      if (typeof saveSavGoal === 'function') saveSavGoal();
      if (typeof saveCatRules === 'function') saveCatRules();
      if (typeof savePetrol === 'function') savePetrol();
      render();
      if (ans === 'replace') {
        showToast('Data replaced from backup');
      } else {
        showToast('Merged: +' + (expRes.added + incRes.added) + ' new, ' +
                  (expRes.overwritten + incRes.overwritten) + ' overwritten by date+amount');
      }
    } catch (err) {
      showToast('Could not read backup file');
    }
  };
  r.readAsText(file);
}

// ── Settings listeners ─────────────────────────────────────
function bindChange(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', fn);
}
function bindInput(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', fn);
}
bindChange('set-dark', e => {
  settings.dark = e.target.checked; saveSets(); applySettings();
});
bindChange('set-dark-schedule', e => {
  settings.darkSchedule = e.target.value || 'off';
  saveSets();
  applySettings();
  showToast(
    settings.darkSchedule === 'night' ? 'Dark mode follows 7pm-7am' :
    settings.darkSchedule === 'system' ? 'Dark mode follows system setting' :
    'Dark mode schedule off'
  );
});
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (settings.darkSchedule === 'system') applySettings();
  });
} catch (e) {}
document.querySelectorAll('.fs-btn').forEach(b => b.addEventListener('click', () => {
  settings.fontSize = b.dataset.fs; saveSets(); applySettings();
}));
bindInput('set-currency', e => {
  settings.currency = e.target.value || 'RM'; saveSets(); applySettings(); render();
});
['SGD', 'USD', 'JPY'].forEach(code => {
  bindInput('set-fx-' + code.toLowerCase(), e => {
    ensureFxRates();
    const v = parseFloat(e.target.value);
    settings.fxRates[code] = (!isNaN(v) && v > 0) ? v : defaultFxRates()[code];
    saveSets();
    render();
  });
});
bindChange('set-drag', e => {
  settings.showDrag = e.target.checked; saveSets(); render();
});
bindChange('set-compact', e => {
  settings.compact = e.target.checked; saveSets(); applySettings();
});
bindChange('set-lock-timeout', e => {
  var mins = parseInt(e.target.value || '5', 10);
  if (isNaN(mins) || mins < 0) mins = 5;
  settings.lockTimeoutMin = mins;
  saveSets();
  applySettings();
  showToast('Lock timeout updated');
});
const setNwAuto = document.getElementById('set-nw-auto');
if (setNwAuto) {
  setNwAuto.addEventListener('change', e => {
    settings.nwAutoSnapshot = e.target.checked;
    saveSets();
    showToast(settings.nwAutoSnapshot ? 'Net worth will snapshot when banks change' : 'Net worth auto-snapshot off');
  });
}
const setNotifyRec = document.getElementById('set-notify-recurring');
if (setNotifyRec) {
  setNotifyRec.addEventListener('change', e => {
    settings.notifyRecurring = e.target.checked;
    saveSets();
    showToast(settings.notifyRecurring ? 'Bill reminders on' : 'Bill reminders off');
  });
}
const setPtFullOnly = document.getElementById('set-petrol-full-only');
if (setPtFullOnly) {
  setPtFullOnly.addEventListener('change', e => {
    settings.petrolFullTankOnly = e.target.checked;
    saveSets();
    if (typeof renderPetrolLog === 'function') renderPetrolLog();
    showToast(settings.petrolFullTankOnly ? 'Efficiency: full tank fills only' : 'Efficiency: all fill-ups');
  });
}

// ── Quick-add FAB (mobile) ───────────────────────────────────
function focusExpenseForm() {
  if (typeof activateNavTab === 'function') activateNavTab('expenses');
  else {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector('.nav-item[data-tab="expenses"]');
    if (tab) tab.classList.add('active');
    const page = document.getElementById('page-expenses');
    if (page) page.classList.add('active');
  }
  setTimeout(() => {
    const amt = document.getElementById('exp-amount');
    const card = amt ? amt.closest('.card') : null;
    if (card) {
      try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { card.scrollIntoView(); }
    }
    if (amt) {
      try { amt.focus({ preventScroll: true }); } catch (e) { amt.focus(); }
      try { amt.select(); } catch (e) {}
    }
  }, 60);
}

function openFabSheet() {
  const sheet = document.getElementById('ft-fab-sheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ft-fab-sheet-open');
  ftHaptic_('light');
  const fab = document.getElementById('ft-fab');
  if (fab) {
    fab.classList.remove('ft-fab--pulse');
    void fab.offsetWidth;
    fab.classList.add('ft-fab--pulse');
  }
  const repExp = document.getElementById('fab-repeat-exp');
  const repInc = document.getElementById('fab-repeat-inc');
  const repPet = document.getElementById('fab-repeat-petrol');
  if (repExp) repExp.disabled = !lastExpenseTpl;
  if (repInc) repInc.disabled = !lastIncomeTpl;
  if (repPet) repPet.disabled = !(typeof lastPetrolTpl !== 'undefined' && lastPetrolTpl);
}

function closeFabSheet() {
  const sheet = document.getElementById('ft-fab-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ft-fab-sheet-open');
}

function wireQuickAddUi() {
  const fab = document.getElementById('ft-fab');
  const sheet = document.getElementById('ft-fab-sheet');
  if (!fab || !sheet) return;
  fab.addEventListener('click', () => {
    if (sheet.classList.contains('open')) closeFabSheet();
    else openFabSheet();
  });
  const backdrop = sheet.querySelector('.ft-fab-sheet__backdrop');
  if (backdrop) backdrop.addEventListener('click', closeFabSheet);
  sheet.querySelectorAll('[data-fab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.fab;
      closeFabSheet();
      if (action === 'expense') {
        focusExpenseForm();
      } else if (action === 'income') {
        if (typeof activateNavTab === 'function') activateNavTab('income');
        else document.querySelector('.nav-item[data-tab="income"]')?.click();
        setTimeout(() => document.getElementById('inc-amount')?.focus(), 80);
      } else if (action === 'petrol') {
        if (typeof activateNavTab === 'function') activateNavTab('petrol');
        else document.querySelector('.nav-item[data-tab="petrol"]')?.click();
        setTimeout(() => document.getElementById('pt-litres-in')?.focus(), 120);
      } else if (action === 'repeat-exp') {
        if (repeatLastExpense()) {
          if (typeof activateNavTab === 'function') activateNavTab('expenses');
        } else {
          focusExpenseForm();
        }
      } else if (action === 'repeat-inc') {
        if (typeof repeatLastIncome === 'function' && repeatLastIncome()) {
          if (typeof activateNavTab === 'function') activateNavTab('income');
        } else if (typeof activateNavTab === 'function') activateNavTab('income');
      } else if (action === 'repeat-petrol') {
        if (typeof repeatLastPetrol === 'function' && repeatLastPetrol()) {
          if (typeof activateNavTab === 'function') activateNavTab('petrol');
        } else if (typeof activateNavTab === 'function') activateNavTab('petrol');
      }
    });
  });
}
wireQuickAddUi();

// ── Modal listeners ─────────────────────────────────────────
document.getElementById('edit-save').addEventListener('click', saveEdit);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-close').addEventListener('click', closeEditModal);
document.getElementById('edit-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-overlay')) closeEditModal();
});
document.getElementById('edit-name').addEventListener('keydown', e => {
  if (e.key==='Enter') saveEdit(); if (e.key==='Escape') closeEditModal();
});
document.getElementById('edit-amount').addEventListener('keydown', e => {
  if (e.key==='Enter') saveEdit(); if (e.key==='Escape') closeEditModal();
});

bindClick('split-close', closeSplitModal_);
bindClick('split-cancel', closeSplitModal_);
bindClick('split-save', saveSplitExpense_);
bindClick('split-add-row', function() { addSplitRow_('Other'); updateSplitSummary_(); });
bindClick('split-even', splitEvenly_);
var splitOverlay = document.getElementById('split-overlay');
if (splitOverlay) {
  splitOverlay.addEventListener('click', function(e) {
    if (e.target === splitOverlay) closeSplitModal_();
  });
}
var splitRowsEl = document.getElementById('split-rows');
if (splitRowsEl) splitRowsEl.addEventListener('ft-money-change', updateSplitSummary_);
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var so = document.getElementById('split-overlay');
  if (so && so.classList.contains('open')) {
    e.preventDefault();
    closeSplitModal_();
  }
});
document.getElementById('cd-close').addEventListener('click', closeCatDetail);
document.getElementById('cat-detail-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cat-detail-overlay')) closeCatDetail();
});

// ── Nav ────────────────────────────────────────────────────
// Desktop: full sidebar. Mobile (≤680px): five dock slots + More sheet.
const MOBILE_OVERFLOW_TABS = new Set(['recurring', 'trends', 'petrol', 'report']);

function closeMobileNavMore() {
  const sheet = document.getElementById('mobile-nav-more-sheet');
  const opener = document.getElementById('nav-more-open');
  if (sheet) {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }
  if (opener) opener.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-nav-sheet-open');
}

function isMobileDockLayout() {
  if (!window.matchMedia) return true;
  return window.matchMedia('(max-width: 680px)').matches;
}

function ensureBodyPortal(id) {
  const el = document.getElementById(id);
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
}

function openMobileNavMore() {
  const sheet = document.getElementById('mobile-nav-more-sheet');
  const opener = document.getElementById('nav-more-open');
  if (!sheet) return;
  if (!isMobileDockLayout()) return;
  if (typeof closeFabSheet === 'function') closeFabSheet();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  if (opener) opener.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-nav-sheet-open');
}

// ── Tab open hooks (sidebar, mobile More, and data refresh) ──
const TAB_OPEN_HOOKS = {
  home: () => { if (typeof renderHomeDashboard === 'function') renderHomeDashboard(); },
  recurring: () => { if (typeof renderRecurring === 'function') renderRecurring(); },
  petrol: () => { if (typeof renderPetrolLog === 'function') renderPetrolLog(); },
  report: () => { if (typeof renderReport === 'function') renderReport(); },
  trends: () => { if (typeof renderTrends === 'function') renderTrends(); },
  assets: () => {
    renderBankList();
    renderUnitTrustPanel();
    if (typeof renderNwSnapshotHint === 'function') renderNwSnapshotHint();
    if (typeof renderAllNetWorthCharts === 'function') renderAllNetWorthCharts();
  },
  settings: () => {
    remindMonthlyBackupIfNeeded();
    if (typeof updateSyncUI === 'function') updateSyncUI();
    if (typeof renderCatRulesPanel_ === 'function') renderCatRulesPanel_();
  },
};
const TAB_OPEN_DELAY_MS = { trends: 50, petrol: 10, report: 10 };

function runTabOpenHooks(tab) {
  const fn = TAB_OPEN_HOOKS[tab];
  if (!fn) return;
  const delay = TAB_OPEN_DELAY_MS[tab] || 0;
  if (delay) setTimeout(fn, delay);
  else fn();
}

function remindMonthlyBackupIfNeeded() {
  const ym = viewMonth.getFullYear() + '-' + String(viewMonth.getMonth() + 1).padStart(2, '0');
  if (settings.backupRemindedYm === ym) return;
  const last = settings.backupLastExportAt ? String(settings.backupLastExportAt).slice(0, 7) : '';
  if (last === ym) {
    settings.backupRemindedYm = ym;
    saveSets();
    return;
  }
  settings.backupRemindedYm = ym;
  saveSets();
  showToast('Reminder: export backup for ' + ym + ' in Settings');
}

function refreshActiveTabPanels() {
  const page = document.querySelector('.page.active');
  if (!page || !page.id) return;
  runTabOpenHooks(page.id.replace(/^page-/, ''));
}

function activateNavTab(tab) {
  if (!tab) return;
  const page = document.getElementById('page-' + tab);
  if (!page) return;
  if (tab !== 'expenses' && typeof closeExpSearch === 'function') closeExpSearch();
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  page.classList.add('active');
  const moreOpen = document.getElementById('nav-more-open');
  if (MOBILE_OVERFLOW_TABS.has(tab)) {
    if (moreOpen) moreOpen.classList.add('active');
  } else {
    const dock = document.querySelector('.nav-item[data-tab="' + tab + '"]');
    if (dock) dock.classList.add('active');
  }
  scrollNavItemIntoView(document.querySelector('.nav-item.active'));
  closeMobileNavMore();
  runTabOpenHooks(tab);
  renderActivePagePanels_(monthTotals_());
  if (ftIsMobileLayout_()) {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }
  syncMobileMonthNav_();
  pulseFabOnTab_();
}

function pulseFabOnTab_() {
  if (!ftIsMobileLayout_()) return;
  var fab = document.getElementById('ft-fab');
  if (!fab) return;
  fab.classList.remove('ft-fab--pulse');
  void fab.offsetWidth;
  fab.classList.add('ft-fab--pulse');
}

function scrollNavItemIntoView(btn) {
  if (!btn || !ftIsMobileLayout_()) return;
  const strip = btn.closest('.sb-nav');
  if (!strip) return;
  try {
    btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  } catch (e) {
    btn.scrollIntoView(false);
  }
}

document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateNavTab(btn.dataset.tab));
});

['mobile-nav-more-sheet', 'ft-fab-sheet', 'ft-fab'].forEach(ensureBodyPortal);

const navMoreOpen = document.getElementById('nav-more-open');
if (navMoreOpen) {
  navMoreOpen.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const sheet = document.getElementById('mobile-nav-more-sheet');
    if (sheet && sheet.classList.contains('open')) closeMobileNavMore();
    else openMobileNavMore();
  });
}

const mobileNavSheet = document.getElementById('mobile-nav-more-sheet');
if (mobileNavSheet) {
  const backdrop = mobileNavSheet.querySelector('.mobile-nav-sheet__backdrop');
  if (backdrop) backdrop.addEventListener('click', closeMobileNavMore);
  mobileNavSheet.querySelectorAll('.mobile-nav-sheet__btn[data-tab]').forEach(b => {
    b.addEventListener('click', () => activateNavTab(b.dataset.tab));
  });
}

window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const fabSheet = document.getElementById('ft-fab-sheet');
  if (fabSheet && fabSheet.classList.contains('open')) {
    closeFabSheet();
    return;
  }
  const sheet = document.getElementById('mobile-nav-more-sheet');
  if (sheet && sheet.classList.contains('open')) closeMobileNavMore();
});

window.addEventListener('resize', () => {
  if (window.matchMedia && !window.matchMedia('(max-width: 680px)').matches) closeMobileNavMore();
});

window.addEventListener('load', () => {
  const active = document.querySelector('.nav-item.active');
  if (active) scrollNavItemIntoView(active);
});

function bindClick(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
bindClick('prev-month', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  render();
});
bindClick('next-month', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  render();
});

// ── Action buttons ─────────────────────────────────────────
bindClick('add-exp-btn', addExpense);
bindClick('add-exp-split-btn', addSplitExpense);
var addExpBtn = document.getElementById('add-exp-btn');
if (addExpBtn && !document.getElementById('add-exp-split-btn')) {
  var splitBtn = document.createElement('button');
  splitBtn.type = 'button';
  splitBtn.className = 'btn-ghost';
  splitBtn.id = 'add-exp-split-btn';
  splitBtn.textContent = 'Split';
  splitBtn.title = 'Split one receipt into multiple categories';
  splitBtn.addEventListener('click', addSplitExpense);
  addExpBtn.parentElement && addExpBtn.parentElement.appendChild(splitBtn);
}
bindClick('add-inc-btn', addIncome);
bindClick('add-bank-btn', addBank);
bindClick('export-btn', exportData);
bindClick('import-btn', () => {
  const inp = document.getElementById('import-file');
  if (!inp) return;
  inp.value = '';
  inp.click();
});
bindChange('import-file', e => importBackup(e.target.files[0]));

['exp-name','exp-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addExpense(); })
);
const expNameEl = document.getElementById('exp-name');
if (expNameEl) {
  let catSuggestTimer = null;
  expNameEl.addEventListener('input', () => {
    clearTimeout(catSuggestTimer);
    catSuggestTimer = setTimeout(() => {
      if (typeof applySuggestedCategory === 'function') {
        applySuggestedCategory(expNameEl.value.trim(), { silent: true });
      }
    }, 400);
  });
  expNameEl.addEventListener('blur', () => {
    if (typeof applySuggestedCategory === 'function') {
      applySuggestedCategory(expNameEl.value.trim(), { silent: false });
    }
  });
}
const expPlaceEl = document.getElementById('exp-place');
if (expPlaceEl) {
  let placeSuggestTimer = null;
  expPlaceEl.addEventListener('input', () => {
    clearTimeout(placeSuggestTimer);
    placeSuggestTimer = setTimeout(() => {
      if (typeof applySuggestedCategory === 'function') {
        applySuggestedCategory(expPlaceEl.value.trim(), { silent: true });
      }
    }, 400);
  });
  expPlaceEl.addEventListener('blur', () => {
    if (typeof applySuggestedCategory === 'function') {
      applySuggestedCategory(expPlaceEl.value.trim(), { silent: false });
    }
  });
}
['inc-name','inc-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addIncome(); })
);
['bk-name','bk-acct','bk-balance'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addBank(); })
);
fillBankCurrencySelect(document.getElementById('bk-currency'), 'MYR');

initCalculatorMoneyInputs_();
wireCalcAmountHint_();
wireEmptyStateCtas_();
initExpFoldCards_();
initSettingsFoldCards_();
wireImportWizardLazy_();
window.addEventListener('resize', scheduleUxLayoutCards_);
(function hookMobileMonthRender_() {
  if (typeof render !== 'function') return;
  var origRender = render;
  render = function() {
    origRender();
    syncMobileMonthNav_();
  };
})();
(function wireMobileMonthArrows_() {
  var pMM = document.getElementById('prev-month-m');
  var nMM = document.getElementById('next-month-m');
  if (pMM) pMM.addEventListener('click', function() {
    var prev = document.getElementById('prev-month');
    if (prev) prev.click();
    syncMobileMonthNav_();
  });
  if (nMM) nMM.addEventListener('click', function() {
    var next = document.getElementById('next-month');
    if (next) next.click();
    syncMobileMonthNav_();
  });
})();
syncMobileMonthNav_();
window.addEventListener('resize', syncMobileMonthNav_);

function wireHomeOnboarding_() {
  var card = document.getElementById('home-onboarding');
  var cta = document.getElementById('home-onboarding-cta');
  var dismiss = document.getElementById('home-onboarding-dismiss');
  if (!card) return;
  if (cta) {
    cta.addEventListener('click', function() {
      if (typeof activateNavTab === 'function') activateNavTab('expenses');
      if (typeof focusExpenseForm === 'function') setTimeout(focusExpenseForm, 80);
    });
  }
  if (dismiss) {
    dismiss.addEventListener('click', function() {
      try { localStorage.setItem('ft-onboarding-dismissed-v1', '1'); } catch (e) {}
      card.hidden = true;
    });
  }
}
wireHomeOnboarding_();

function wireFabTooltip_() {
  var fab = document.getElementById('ft-fab');
  if (!fab || fab.dataset.ftTipWired === '1') return;
  fab.dataset.ftTipWired = '1';
  var tip = document.createElement('div');
  tip.className = 'ft-fab-tip';
  tip.textContent = 'Add transaction';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  if (fab.parentNode) fab.parentNode.appendChild(tip);
  var holdTimer = null;
  function clearTip() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    tip.hidden = true;
  }
  fab.addEventListener('touchstart', function() {
    clearTip();
    holdTimer = setTimeout(function() {
      tip.hidden = false;
      ftHaptic_('light');
    }, 480);
  }, { passive: true });
  fab.addEventListener('touchend', clearTip);
  fab.addEventListener('touchcancel', clearTip);
  fab.addEventListener('touchmove', clearTip);
}

function wireSettingsSearch_() {
  var input = document.getElementById('settings-search');
  if (!input || input.dataset.ftWired === '1') return;
  input.dataset.ftWired = '1';
  var activeGroup = 'all';
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.settings-tab'));
  function applySettingsGroupFilter_() {
    var blocks = document.querySelectorAll('#page-settings [data-settings-group]');
    blocks.forEach(function(block) {
      var group = String(block.getAttribute('data-settings-group') || '');
      var show = activeGroup === 'all' || group === activeGroup;
      block.classList.toggle('settings-tab-hidden', !show);
    });
    tabs.forEach(function(tab) {
      var isActive = String(tab.getAttribute('data-settings-tab') || '') === activeGroup;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }
  function filterSettings_(q) {
    q = String(q || '').trim().toLowerCase();
    var stack = document.querySelector('#page-settings .settings-stack');
    if (!stack) return;
    if (!q) {
      stack.querySelectorAll('.settings-search-hidden').forEach(function(node) {
        node.classList.remove('settings-search-hidden');
      });
      applySettingsGroupFilter_();
      return;
    }
    stack.querySelectorAll('.settings-fold-card, section[aria-labelledby]').forEach(function(block) {
      if (block.classList.contains('settings-search-wrap') || block.querySelector('.settings-search')) return;
      var text = (block.textContent || '').toLowerCase();
      var show = !q || text.indexOf(q) >= 0;
      block.classList.remove('settings-tab-hidden');
      block.classList.toggle('settings-search-hidden', !show);
    });
    stack.querySelectorAll('.setting-row').forEach(function(row) {
      var text = (row.textContent || '').toLowerCase();
      var show = !q || text.indexOf(q) >= 0;
      row.classList.toggle('settings-search-hidden', !show);
    });
  }
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      activeGroup = String(tab.getAttribute('data-settings-tab') || 'all');
      if (input.value) {
        input.value = '';
      }
      filterSettings_('');
    });
  });
  applySettingsGroupFilter_();
  input.addEventListener('input', function() { filterSettings_(input.value); });
}

wireFabTooltip_();
wireSettingsSearch_();
