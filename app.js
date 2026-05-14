'use strict';

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
  'Food':          { icon:'🍜', color:'#1D9E75' },
  'Groceries':     { icon:'🛒', color:'#2D9E5A' },
  'Eating out':    { icon:'🍽', color:'#3DBE7A' },
  'Coffee':        { icon:'☕', color:'#7B5EA7' },
  // Shopping
  'Shopping':      { icon:'🛍', color:'#D85A30' },
  'Clothing':      { icon:'👕', color:'#E07040' },
  'Electronics':   { icon:'📱', color:'#3A86FF' },
  // Home
  'Rent':          { icon:'🏠', color:'#BA7517' },
  'Utilities':     { icon:'💡', color:'#D4A017' },
  'Internet':      { icon:'📶', color:'#5B8DEF' },
  'Renovation':    { icon:'🔨', color:'#8B6914' },
  // Health
  'Health':        { icon:'💊', color:'#D4537E' },
  'Fitness':       { icon:'🏋', color:'#E8547E' },
  'Grooming':      { icon:'💈', color:'#C4678E' },
  // Bills & finance
  'Bills':         { icon:'🧾', color:'#8B6220' },
  'Insurance':     { icon:'🛡', color:'#6B7DB3' },
  'Loan payment':  { icon:'🏦', color:'#4A6FA5' },
  'Tax':           { icon:'📋', color:'#666666' },
  // Car
  'Petrol':        { icon:'⛽', color:'#E24B4A' },
  'Car Service':   { icon:'🔧', color:'#378ADD' },
  'Toll':          { icon:'🛣', color:'#888780' },
  'Parking':       { icon:'🅿️', color:'#78909C' },
  'Car Expenses':  { icon:'🚗', color:'#5F5E5A' },
  'Car Insurance': { icon:'🚘', color:'#4472CA' },
  // Transport
  'Transport':     { icon:'🚌', color:'#63A0C8' },
  'Flight':        { icon:'✈', color:'#1A73E8' },
  // Entertainment
  'Entertainment': { icon:'🎬', color:'#7F77DD' },
  'Subscription':  { icon:'📺', color:'#9B59B6' },
  'Travel':        { icon:'🌍', color:'#1ABC9C' },
  'Hobbies':       { icon:'🎮', color:'#E91E63' },
  // Family
  'Education':     { icon:'📚', color:'#2196F3' },
  'Pet care':      { icon:'🐾', color:'#795548' },
  // Other
  'Other':         { icon:'📦', color:'#B4B2A9' },
};

/** Display order for “Add expense” category chips: frequent / similar items first. */
const EXP_CAT_GROUPS = [
  { title: 'Everyday & dining', cats: ['Food', 'Groceries', 'Eating out', 'Coffee'] },
  { title: 'Shopping & gear', cats: ['Shopping', 'Clothing', 'Electronics'] },
  { title: 'Home & utilities', cats: ['Rent', 'Utilities', 'Internet', 'Renovation'] },
  { title: 'Health & self-care', cats: ['Health', 'Fitness', 'Grooming'] },
  { title: 'Bills & finance', cats: ['Bills', 'Insurance', 'Loan payment', 'Tax'] },
  { title: 'Car & travel', cats: ['Petrol', 'Car Service', 'Toll', 'Parking', 'Car Expenses', 'Car Insurance', 'Transport', 'Flight'] },
  { title: 'Fun & leisure', cats: ['Entertainment', 'Subscription', 'Travel', 'Hobbies'] },
  { title: 'Education & family', cats: ['Education', 'Pet care'] },
  { title: 'Other', cats: ['Other'] },
];

const INC_CATS = {
  'Salary':      { icon:'💼', color:'#1D9E75' },
  'Bonus':       { icon:'🎯', color:'#2DBE8A' },
  'Freelance':   { icon:'💻', color:'#378ADD' },
  'Business':    { icon:'🏪', color:'#BA7517' },
  'Unit Trust':  { icon:'📊', color:'#7F77DD' },
  'Dividend':    { icon:'💹', color:'#9B59B6' },
  'Investment':  { icon:'📈', color:'#5B4DB5' },
  'Rental':      { icon:'🏠', color:'#D85A30' },
  'Side income': { icon:'💡', color:'#FF9800' },
  'Cashback':    { icon:'💳', color:'#00BCD4' },
  'Gift':        { icon:'🎁', color:'#D4537E' },
  'Refund':      { icon:'↩', color:'#607D8B' },
  'Other':       { icon:'📦', color:'#B4B2A9' },
};

// ── Storage keys ───────────────────────────────────────────
const KEY_EXP   = 'expenses_v2';
const KEY_INC   = 'incomes_v1';
const KEY_BANKS = 'banks_v1';
const KEY_SETS  = 'settings_v1';
const KEY_UT_HOLD = 'unit_trust_holdings_v1';
const KEY_UT_NAV  = 'unit_trust_nav_v1';

// ── Storage read generation (avoid stale load() overwriting a fresh Sheet load)
let _storageReadGen = 0;
function bumpStorageReadGeneration() { _storageReadGen++; }

// ── State ──────────────────────────────────────────────────
let expenses = [], incomes = [], banks = [];
let utHoldings = [];
let utNavPoints = [];
let settings = { dark:false, fontSize:'fs-md', currency:'RM', showDrag:true, compact:false };
let viewMonth = new Date(); viewMonth.setDate(1);
let activeFilter = 'All';
let selectedCat  = 'Food';

// ── Helpers ────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmt(n) {
  return (settings.currency||'RM')+' '+Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function shake(el) { el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),300); }
/** Plain YYYY-MM-DD or Google Sheets datetime ISO (e.g. …T16:00:00.000Z). */
function parseTxDate(dateStr) {
  if (dateStr === undefined || dateStr === null || dateStr === '') return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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
  chromeStorage.local.get([KEY_EXP,KEY_INC,KEY_BANKS,KEY_SETS,KEY_UT_HOLD,KEY_UT_NAV], r => {
    if (gen !== _storageReadGen) return;
    try {
      expenses = r[KEY_EXP]   || [];
      incomes  = r[KEY_INC]   || [];
      banks    = r[KEY_BANKS] || [];
      utHoldings = utSanitizeHoldings(r[KEY_UT_HOLD]);
      utNavPoints = utSanitizeNav(r[KEY_UT_NAV]);
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
    const id = Number(h.id);
    return {
      id: !isNaN(id) && id > 0 ? id : Date.now() + idx,
      name: String(h.name || 'Fund').trim() || 'Fund',
      fundCode: h.fundCode != null ? String(h.fundCode).trim() : '',
      units: Math.max(0, parseFloat(h.units) || 0),
      avgCost: h.avgCost != null && h.avgCost !== '' && !isNaN(parseFloat(h.avgCost))
        ? Math.max(0, parseFloat(h.avgCost)) : null,
      purchaseDate: h.purchaseDate != null ? String(h.purchaseDate).trim().slice(0, 10) : '',
      notes: h.notes != null ? String(h.notes).trim() : '',
    };
  });
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

function computeUtTotalMarketValue() {
  return utHoldings.reduce((sum, h) => {
    const last = utLatestNavEntry(h.id);
    if (!last) return sum;
    return sum + h.units * last.nav;
  }, 0);
}

function utBuildPortfolioSeries() {
  if (!utHoldings.length) return [];
  const dates = [...new Set(utNavPoints.map(p => p.date))]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const series = [];
  dates.forEach(d => {
    let total = 0;
    for (let i = 0; i < utHoldings.length; i++) {
      const h = utHoldings[i];
      const nav = utNavAsOf(h.id, d);
      if (nav == null) return;
      total += h.units * nav;
    }
    series.push({ date: d, total });
  });
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
  utHoldings = utHoldings.filter(h => h.id !== id);
  utNavPoints = utNavPoints.filter(p => p.fundId !== id);
  saveUtHoldings();
  saveUtNav();
  render();
  showToast('Fund removed');
}

function renderUtChart(el) {
  if (!el) return;
  const series = utBuildPortfolioSeries();
  if (series.length < 2) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--ink3);font-size:var(--f-sm)">Chart appears when every holding has at least two NAV dates with full coverage.</div>';
    return;
  }
  const W = el.clientWidth || 600;
  const H = 160;
  const PAD = { t: 10, r: 16, b: 28, l: 64 };
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
  const yLbls = [
    { v: maxV, y: yOf(maxV) },
    { v: (minV + maxV) / 2, y: yOf((minV + maxV) / 2) },
    { v: minV, y: yOf(minV) },
  ];
  const xIdxs = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xLbls = xIdxs.map(i => ({ lbl: series[i].date.slice(5), x: xOf(i) }));
  const circles = series.map((s, i) =>
    '<circle cx="' + xOf(i) + '" cy="' + yOf(s.total) + '" r="3.5" fill="' + lc + '" stroke="white" stroke-width="1.5"><title>' +
    esc(s.date) + ': ' + fmt(s.total) + '</title></circle>'
  ).join('');
  el.innerHTML =
    '<div class="nw-chart-wrap"><svg class="nw-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="ut-grad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + lc + '" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="' + lc + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#ut-grad)"/>' +
    '<path d="' + path + '" fill="none" stroke="' + lc + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    yLbls.map(l => '<text class="nw-axis-lbl" x="' + (PAD.l - 6) + '" y="' + (l.y + 3) + '" text-anchor="end">' + fmt(l.v) + '</text>').join('') +
    xLbls.map(l => '<text class="nw-axis-lbl" x="' + l.x + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(l.lbl) + '</text>').join('') +
    circles + '</svg></div>';
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
  const avgEl = document.getElementById('ut-avg');
  const dateEl = document.getElementById('ut-pdate');
  const notesEl = document.getElementById('ut-notes');
  if (!nameEl || !unitsEl) return;
  const name = nameEl.value.trim();
  const units = parseFloat(unitsEl.value);
  let ok = true;
  if (!name) { shake(nameEl); ok = false; }
  if (isNaN(units) || units <= 0) { shake(unitsEl); ok = false; }
  if (!ok) return;
  const avgRaw = avgEl && avgEl.value.trim();
  let avgCost = null;
  if (avgRaw !== '') {
    const a = parseFloat(avgRaw);
    if (isNaN(a) || a < 0) { shake(avgEl); return; }
    avgCost = a;
  }
  utHoldings.push({
    id: Date.now(),
    name,
    fundCode: codeEl ? codeEl.value.trim() : '',
    units,
    avgCost,
    purchaseDate: dateEl && dateEl.value ? dateEl.value : '',
    notes: notesEl ? notesEl.value.trim() : '',
  });
  saveUtHoldings();
  nameEl.value = '';
  if (codeEl) codeEl.value = '';
  unitsEl.value = '';
  if (avgEl) avgEl.value = '';
  if (dateEl) dateEl.value = '';
  if (notesEl) notesEl.value = '';
  render();
  showToast('Fund added');
}

function renderUnitTrustPanel() {
  const root = document.getElementById('ut-root');
  if (!root) return;

  const totalMv = computeUtTotalMarketValue();
  const sumEl = document.getElementById('ut-summary-mv');
  if (sumEl) sumEl.textContent = fmt(totalMv);

  root.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px';
  const refBtn = document.createElement('button');
  refBtn.type = 'button';
  refBtn.className = 'btn-ghost';
  refBtn.style.height = '38px';
  refBtn.textContent = 'Refresh values';
  refBtn.title = 'Recompute from latest NAV (offline; open app to update)';
  refBtn.addEventListener('click', () => render());
  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'btn-ghost';
  csvBtn.style.height = '38px';
  csvBtn.textContent = 'Import NAV CSV';
  const csvInput = document.createElement('input');
  csvInput.type = 'file';
  csvInput.accept = '.csv,text/csv,text/plain';
  csvInput.style.display = 'none';
  csvInput.addEventListener('change', () => {
    const f = csvInput.files && csvInput.files[0];
    csvInput.value = '';
    if (f) importUtNavCsv(f);
  });
  csvBtn.addEventListener('click', () => csvInput.click());
  toolbar.appendChild(refBtn);
  toolbar.appendChild(csvBtn);
  toolbar.appendChild(csvInput);
  root.appendChild(toolbar);

  utHoldings.forEach(h => {
    const last = utLatestNavEntry(h.id);
    const prev = utPrevNavEntry(h.id);
    const mv = last ? h.units * last.nav : null;
    let pnlStr = '';
    if (last && h.avgCost != null && !isNaN(h.avgCost)) {
      const cost = h.units * h.avgCost;
      const pnl = mv - cost;
      pnlStr = ' · P&amp;L ' + (pnl >= 0 ? '+' : '') + fmt(pnl);
    }
    let dNavStr = '';
    if (last && prev) {
      const dNav = last.nav - prev.nav;
      const dRm = h.units * dNav;
      dNavStr =
        ' · vs prior NAV: ' +
        (dRm >= 0 ? '+' : '') +
        fmt(dRm) +
        ' (' +
        (prev.nav ? ((dNav / prev.nav) * 100).toFixed(2) : '0') +
        '%)';
    }

    const card = document.createElement('div');
    card.className = 'bank-card';
    card.style.marginBottom = '10px';

    const head = document.createElement('div');
    head.className = 'bank-main';
    head.innerHTML =
      '<div class="bank-ico">📊</div>' +
      '<div class="bank-info">' +
        '<div class="bank-name">' +
        esc(h.name) +
        '</div>' +
        '<div class="bank-type">ID ' +
        h.id +
        (h.fundCode ? ' · Code ' + esc(h.fundCode) : '') +
        (h.notes ? ' · ' + esc(h.notes) : '') +
        '</div>' +
      '</div>' +
      '<div class="bank-bal">' +
      (mv != null ? fmt(mv) : '—') +
      '</div>';

    const delBtn = document.createElement('button');
    delBtn.className = 'bank-card-btn del';
    delBtn.title = 'Remove fund';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm('Remove this fund and its NAV history?')) deleteUtHolding(h.id);
    });
    head.appendChild(delBtn);

    const meta = document.createElement('div');
    meta.style.cssText =
      'font-size:var(--f-sm);color:var(--ink2);padding:0 12px 10px 48px;line-height:1.45';
    meta.innerHTML =
      'Units <strong>' +
      h.units.toLocaleString('en-MY', { maximumFractionDigits: 6 }) +
      '</strong>' +
      (last
        ? ' · Latest NAV <strong>' +
          last.nav.toFixed(4) +
          '</strong> <span style="color:var(--ink3)">(' +
          esc(last.date) +
          ')</span>'
        : ' · <span style="color:var(--ink3)">No NAV yet — add below</span>') +
      pnlStr +
      dNavStr;

    const navForm = document.createElement('div');
    navForm.style.cssText =
      'display:grid;grid-template-columns:140px 1fr auto;gap:8px;align-items:end;padding:0 12px 12px 48px;border-top:1px solid var(--line)';

    const dateCol = document.createElement('div');
    const dl = document.createElement('label');
    dl.className = 'lbl';
    dl.style.fontSize = 'var(--f-xs)';
    dl.textContent = 'NAV date';
    const dateInp = document.createElement('input');
    dateInp.type = 'date';
    dateInp.className = 'ut-nav-date';
    dateInp.dataset.fund = String(h.id);
    dateInp.value = last ? last.date : todayStr();
    dateCol.appendChild(dl);
    dateCol.appendChild(dateInp);

    const navCol = document.createElement('div');
    const nl = document.createElement('label');
    nl.className = 'lbl';
    nl.style.fontSize = 'var(--f-xs)';
    nl.textContent = 'NAV (per unit)';
    const navInp = document.createElement('input');
    navInp.type = 'number';
    navInp.className = 'ut-nav-val';
    navInp.dataset.fund = String(h.id);
    navInp.placeholder = '0.0000';
    navInp.min = '0';
    navInp.step = '0.0001';
    navCol.appendChild(nl);
    navCol.appendChild(navInp);

    const saveNav = document.createElement('button');
    saveNav.type = 'button';
    saveNav.className = 'btn btn-primary';
    saveNav.style.height = '38px';
    saveNav.textContent = 'Save NAV';
    saveNav.addEventListener('click', () => {
      const ds = dateInp.value;
      const nv = navInp.value;
      if (!upsertUtNav(h.id, ds, nv)) {
        shake(navInp);
        return;
      }
      navInp.value = '';
      showToast('NAV saved');
      render();
    });

    navForm.appendChild(dateCol);
    navForm.appendChild(navCol);
    navForm.appendChild(saveNav);

    const editRow = document.createElement('div');
    editRow.style.cssText =
      'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:0 12px 12px 48px;border-top:1px solid var(--line)';
    const unitsCol = document.createElement('div');
    unitsCol.style.flex = '1';
    unitsCol.style.minWidth = '120px';
    const unitsLab = document.createElement('label');
    unitsLab.className = 'lbl';
    unitsLab.style.fontSize = 'var(--f-xs)';
    unitsLab.textContent = 'Units (edit)';
    const unitsInp = document.createElement('input');
    unitsInp.type = 'number';
    unitsInp.style.width = '100%';
    unitsInp.min = '0';
    unitsInp.step = '0.000001';
    unitsInp.value = String(h.units);
    const saveUnits = document.createElement('button');
    saveUnits.type = 'button';
    saveUnits.className = 'btn-ghost';
    saveUnits.style.height = '38px';
    saveUnits.textContent = 'Save units';
    saveUnits.addEventListener('click', () => {
      const u = parseFloat(unitsInp.value);
      if (isNaN(u) || u <= 0) {
        shake(unitsInp);
        return;
      }
      h.units = u;
      saveUtHoldings();
      showToast('Units updated');
      render();
    });
    unitsCol.appendChild(unitsLab);
    unitsCol.appendChild(unitsInp);
    editRow.appendChild(unitsCol);
    editRow.appendChild(saveUnits);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(navForm);
    card.appendChild(editRow);
    root.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.style.cssText = 'margin-top:14px;padding:14px;background:var(--card-bg2);border:1px solid var(--line);border-radius:var(--radius-sm)';
  addCard.innerHTML =
    '<div class="lbl" style="margin-bottom:10px;font-weight:600">Add holding</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 120px;gap:10px;align-items:end">' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Fund name</label><input type="text" id="ut-name" maxlength="80" placeholder="e.g. ABC Growth"/></div>' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Fund code (optional)</label><input type="text" id="ut-code" maxlength="32" placeholder="for CSV match"/></div>' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Units</label><input type="number" id="ut-units" min="0" step="0.000001" placeholder="0"/></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;margin-top:10px">' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Avg cost / unit (optional)</label><input type="number" id="ut-avg" min="0" step="0.0001" placeholder="for P&amp;L"/></div>' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Purchase date</label><input type="date" id="ut-pdate"/></div>' +
    '<div><label class="lbl" style="font-size:var(--f-xs)">Notes</label><input type="text" id="ut-notes" maxlength="120"/></div>' +
    '<div style="display:flex;align-items:flex-end"><button type="button" class="btn btn-primary" id="ut-add-btn" style="height:38px">+ Add fund</button></div>' +
    '</div>';
  root.appendChild(addCard);
  const addBtn = document.getElementById('ut-add-btn');
  if (addBtn) addBtn.addEventListener('click', addUtHolding);
  ['ut-name', 'ut-units'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addUtHolding(); });
  });

  const chartSlot = document.createElement('div');
  chartSlot.id = 'ut-chart';
  chartSlot.style.marginTop = '16px';
  root.appendChild(chartSlot);
  renderUtChart(chartSlot);
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
    const { icon } = meta;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn' + (name === selectedCat ? ' active' : '');
    btn.dataset.cat = name;
    const iconEl = document.createElement('span');
    iconEl.className = 'ci';
    iconEl.textContent = icon;
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
  } catch (e) {}
  load();
})();

// ── Settings ───────────────────────────────────────────────
function applySettings() {
  const b = document.body;
  b.classList.toggle('dark', !!settings.dark);
  const darkEl = document.getElementById('set-dark');
  if (darkEl) darkEl.checked = !!settings.dark;
  b.classList.remove('fs-sm','fs-md','fs-lg');
  b.classList.add(settings.fontSize || 'fs-md');
  document.querySelectorAll('.fs-btn').forEach(x =>
    x.classList.toggle('active', x.dataset.fs === (settings.fontSize||'fs-md'))
  );
  const curEl = document.getElementById('set-currency');
  if (curEl) curEl.value = settings.currency || 'RM';
  const dragEl = document.getElementById('set-drag');
  if (dragEl) dragEl.checked = settings.showDrag !== false;
  const compEl = document.getElementById('set-compact');
  if (compEl) compEl.checked = !!settings.compact;
  b.classList.toggle('compact', !!settings.compact);
  let cs = document.getElementById('compact-style');
  if (!cs) { cs = document.createElement('style'); cs.id = 'compact-style'; document.head.appendChild(cs); }
  cs.textContent = settings.compact
    ? '.tx-item{padding:4px 0!important}.tx-icon{width:24px!important;height:24px!important;font-size:12px!important}'
    : '';
}

// ── Add expenses ───────────────────────────────────────────
function addExpense() {
  const nEl = document.getElementById('exp-name');
  const aEl = document.getElementById('exp-amount');
  const name   = nEl.value.trim();
  const amount = parseFloat(aEl.value);
  const date   = document.getElementById('exp-date').value || todayStr();
  let ok = true;
  if (!name)                        { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { shake(aEl); ok = false; }
  if (!ok) return;
  expenses.push({ id: Date.now(), name, amount, cat: selectedCat, date });
  saveExp();
  nEl.value = ''; aEl.value = '';
  nEl.focus();
  render();
}
function deleteExpense(id) { expenses = expenses.filter(e => e.id !== id); saveExp(); render(); }

// ── Add income ─────────────────────────────────────────────
function addIncome() {
  const nEl = document.getElementById('inc-name');
  const aEl = document.getElementById('inc-amount');
  const name   = nEl.value.trim();
  const amount = parseFloat(aEl.value);
  const cat    = document.getElementById('inc-cat').value;
  const date   = document.getElementById('inc-date').value || todayStr();
  let ok = true;
  if (!name)                        { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { shake(aEl); ok = false; }
  if (!ok) return;
  incomes.push({ id: Date.now(), name, amount, cat, date });
  saveInc();
  nEl.value = ''; aEl.value = '';
  render();
}
function deleteIncome(id) { incomes = incomes.filter(i => i.id !== id); saveInc(); render(); }

// ── Add banks ──────────────────────────────────────────────
function addBank() {
  const nEl = document.getElementById('bk-name');
  const aEl = document.getElementById('bk-acct');
  const bEl = document.getElementById('bk-balance');
  const name    = nEl.value.trim();
  const acct    = aEl.value.trim();
  const balance = parseFloat(bEl.value);
  let ok = true;
  if (!name)                       { shake(nEl); ok = false; }
  if (isNaN(balance) || balance<0) { shake(bEl); ok = false; }
  if (!ok) return;
  banks.push({ id: Date.now(), name, acct: acct || 'Account', balance });
  saveBanks();
  nEl.value = ''; aEl.value = ''; bEl.value = '';
  render();
}
function deleteBank(id) { banks = banks.filter(b => b.id !== id); saveBanks(); render(); }

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
  document.getElementById('edit-amount').value = entry.amount;
  document.getElementById('edit-date').value   = entry.date;

  const sel = document.getElementById('edit-cat');
  sel.innerHTML = '';
  Object.keys(catMap).forEach(c => {
    const opt = document.createElement('option');
    const info = catMap[c] || {};
    opt.value = c;
    opt.textContent = (info.icon ? info.icon + ' ' : '') + c;
    if (c === entry.cat) opt.selected = true;
    sel.appendChild(opt);
  });

  const noteEl = document.getElementById('edit-note');
  if (noteEl) noteEl.value = entry.note || '';

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
  const amount = parseFloat(aEl.value);
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

  if (editCtx.type === 'exp') saveExp(); else saveInc();
  closeEditModal();
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

  document.getElementById('cd-title').textContent = info.icon + ' ' + cat;
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
    ico.style.background = info.color + '22';
    ico.textContent = info.icon;

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
function render() {
  const me       = mExp(), mi = mInc(), today = todayStr();
  const totalExp = me.reduce((a,e)=>a+e.amount, 0);
  const todayExp = expenses.filter(e=>e.date===today).reduce((a,e)=>a+e.amount, 0);
  const totalInc = mi.reduce((a,i)=>a+i.amount, 0);
  const totalBanks = banks.reduce((a,b)=>a+b.balance, 0);
  const net = totalInc - totalExp;

  document.getElementById('month-label').textContent =
    viewMonth.toLocaleString('default',{month:'short',year:'numeric'});

  // Expense stats
  document.getElementById('c-total').textContent = fmt(totalExp);
  document.getElementById('c-today').textContent = fmt(todayExp);
  document.getElementById('c-count').textContent = me.length;

  // Filter pills
  const usedCats = [...new Set(me.map(e=>e.cat))];
  const fb = document.getElementById('filter-bar');
  fb.innerHTML = '';
  ['All', ...usedCats].forEach(c => {
    const b = document.createElement('button');
    b.className = 'pill' + (activeFilter===c ? ' active' : '');
    b.textContent = c;
    b.addEventListener('click', () => { activeFilter = c; render(); });
    fb.appendChild(b);
  });

  const filtered = activeFilter==='All' ? me : me.filter(e=>e.cat===activeFilter);
  renderTxList('expense-list', [...filtered].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id), EXP_CATS, false);
  renderBarChart('bar-chart', me, EXP_CATS, false);

  // Income stats
  document.getElementById('ic-total').textContent = fmt(totalInc);
  document.getElementById('ic-exp').textContent   = fmt(totalExp);
  const nel = document.getElementById('ic-net');
  nel.textContent = fmt(Math.abs(net));
  nel.className   = 's-value ' + (net>=0 ? 'green' : 'red');
  renderTxList('income-list', [...mi].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id), INC_CATS, true);
  renderBarChart('inc-chart', mi, INC_CATS, true);

  // Assets
  document.getElementById('ns-banks').textContent  = fmt(totalBanks);
  document.getElementById('ns-income').textContent = fmt(totalInc);
  document.getElementById('ns-exp').textContent    = fmt(totalExp);
  const nnet = document.getElementById('ns-net');
  const na   = totalBanks + totalInc - totalExp;
  nnet.textContent = fmt(na);
  nnet.className   = 'n-val ' + (na>=0 ? 'green' : 'red');

  renderBankList();
  renderUnitTrustPanel();

  // Feature hooks (defined in other files)
  if (typeof renderMoMDeltas  === 'function') renderMoMDeltas();
  if (typeof renderBudgets    === 'function') renderBudgets();
  if (typeof renderRecurring  === 'function') renderRecurring();
}

// ── Transaction list ───────────────────────────────────────
function renderTxList(id, items, catMap, isIncome) {
  const el   = document.getElementById(id);
  const arr  = isIncome ? incomes : expenses;
  const save = isIncome ? saveInc : saveExp;
  el.innerHTML = '';

  if (!items.length) {
    const em = document.createElement('div');
    em.className = 'empty';
    const ico = document.createElement('div');
    ico.className = 'empty-icon';
    ico.textContent = isIncome ? '💵' : '💸';
    em.appendChild(ico);
    em.appendChild(document.createTextNode('No ' + (isIncome?'income':'expenses') + ' this month'));
    el.appendChild(em);
    return;
  }

  items.forEach(entry => {
    const cat      = catMap[entry.cat] || catMap['Other'];
    const pd     = parseTxDate(entry.date);
    const dlbl   = pd ? pd.toLocaleDateString('en-MY',{month:'short',day:'numeric'}) : '';
    const showDrag = settings.showDrag !== false;

    const item = document.createElement('div');
    item.className = 'tx-item';
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
    ico.textContent = cat.icon;
    item.appendChild(ico);

    const info = document.createElement('div');
    info.className = 'tx-info';

    const nm = document.createElement('div');
    nm.className = 'tx-name';
    nm.textContent = entry.name;
    info.appendChild(nm);

    const meta = document.createElement('div');
    meta.className = 'tx-meta';
    meta.textContent = entry.cat + ' · ' + dlbl;
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
    item.appendChild(actions);

    el.appendChild(item);
    if (showDrag) makeDraggable(item, el, arr, save);
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

// ── Bank list ──────────────────────────────────────────────
function renderBankList() {
  const el = document.getElementById('bank-list');
  el.innerHTML = '';

  if (!banks.length) {
    el.innerHTML = '<div class="empty" style="padding:8px 0"><div class="empty-icon">🏦</div>No accounts yet</div>';
    return;
  }

  banks.forEach(b => {
    const wrap = document.createElement('div');
    wrap.className = 'bank-card';

    const main = document.createElement('div');
    main.className = 'bank-main';
    main.innerHTML =
      '<div class="bank-ico">🏦</div>' +
      '<div class="bank-info">' +
        '<div class="bank-name">' + esc(b.name) + '</div>' +
        '<div class="bank-type">' + esc(b.acct) + '</div>' +
      '</div>' +
      '<div class="bank-bal">' + fmt(b.balance) + '</div>';

    const editBtn = document.createElement('button');
    editBtn.className = 'bank-card-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✏';
    editBtn.addEventListener('click', () => {
      const form = wrap.querySelector('.bank-edit-form');
      const isOpen = form.classList.contains('open');
      document.querySelectorAll('.bank-edit-form.open').forEach(f => f.classList.remove('open'));
      if (!isOpen) form.classList.add('open');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'bank-card-btn del';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm('Delete this account?')) deleteBank(b.id);
    });

    main.appendChild(editBtn);
    main.appendChild(delBtn);
    wrap.appendChild(main);

    // Edit form
    const form = document.createElement('div');
    form.className = 'bank-edit-form';
    form.innerHTML =
      '<div><label class="lbl" style="font-size:var(--f-xs)">Bank</label>' +
        '<input type="text" class="be-name" value="' + esc(b.name) + '" maxlength="24"/></div>' +
      '<div><label class="lbl" style="font-size:var(--f-xs)">Type</label>' +
        '<input type="text" class="be-acct" value="' + esc(b.acct) + '" maxlength="24"/></div>' +
      '<div><label class="lbl" style="font-size:var(--f-xs)">Balance</label>' +
        '<input type="number" class="be-bal" value="' + b.balance + '" min="0" step="0.01"/></div>';

    const btnWrap = document.createElement('div');
    btnWrap.className = 'bank-edit-btns';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.cssText = 'height:38px;font-size:var(--f-sm)';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const nameVal = form.querySelector('.be-name').value.trim();
      const acctVal = form.querySelector('.be-acct').value.trim();
      const balVal  = parseFloat(form.querySelector('.be-bal').value);
      if (!nameVal || isNaN(balVal) || balVal < 0) { shake(form.querySelector('.be-name')); return; }
      b.name = nameVal; b.acct = acctVal || 'Account'; b.balance = balVal;
      saveBanks();
      if (typeof snapshotNetWorth === 'function') snapshotNetWorth();
      render();
      showToast('Account updated');
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-ghost';
    cancelBtn.style.cssText = 'height:38px;font-size:var(--f-sm)';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => form.classList.remove('open'));

    btnWrap.appendChild(saveBtn);
    btnWrap.appendChild(cancelBtn);
    form.appendChild(btnWrap);
    wrap.appendChild(form);
    el.appendChild(wrap);
  });
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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
        expenses = d.expenses; incomes = d.incomes; banks = d.banks;
        if (Array.isArray(d.unitTrustHoldings)) utHoldings = utSanitizeHoldings(d.unitTrustHoldings);
        else utHoldings = [];
        if (Array.isArray(d.unitTrustNav)) utNavPoints = utSanitizeNav(d.unitTrustNav);
        else utNavPoints = [];
        if (d.recurring    && typeof recurring    !== 'undefined') recurring    = d.recurring;
        if (d.networthHist && typeof networthHist !== 'undefined') networthHist = d.networthHist;
        if (d.budgets      && typeof budgets      !== 'undefined') budgets      = d.budgets;
        if (d.petrolLog    && typeof petrolLog    !== 'undefined') petrolLog    = d.petrolLog;
      } else {
        expRes = mergeByDateAmount(expenses, d.expenses); expenses = expRes.merged;
        incRes = mergeByDateAmount(incomes,  d.incomes);  incomes  = incRes.merged;
        if (Array.isArray(d.banks)) banks = mergeById(banks, d.banks);
        if (d.recurring    && typeof recurring    !== 'undefined') recurring    = mergeById(recurring, d.recurring);
        if (d.petrolLog    && typeof petrolLog    !== 'undefined') petrolLog    = mergeById(petrolLog, d.petrolLog);
        if (d.networthHist && typeof networthHist !== 'undefined') {
          const nDates = new Set(d.networthHist.map(n => n.date));
          networthHist = networthHist.filter(x => !nDates.has(x.date)).concat(d.networthHist);
        }
        if (d.budgets && typeof budgets !== 'undefined') {
          budgets = Object.assign({}, budgets, d.budgets);
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
document.getElementById('set-dark').addEventListener('change', e => {
  settings.dark = e.target.checked; saveSets(); applySettings();
});
document.querySelectorAll('.fs-btn').forEach(b => b.addEventListener('click', () => {
  settings.fontSize = b.dataset.fs; saveSets(); applySettings();
}));
document.getElementById('set-currency').addEventListener('input', e => {
  settings.currency = e.target.value || 'RM'; saveSets(); render();
});
document.getElementById('set-drag').addEventListener('change', e => {
  settings.showDrag = e.target.checked; saveSets(); render();
});
document.getElementById('set-compact').addEventListener('change', e => {
  settings.compact = e.target.checked; saveSets(); applySettings();
});

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

function openMobileNavMore() {
  const sheet = document.getElementById('mobile-nav-more-sheet');
  const opener = document.getElementById('nav-more-open');
  if (!sheet || !(window.matchMedia && window.matchMedia('(max-width: 680px)').matches)) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  if (opener) opener.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-nav-sheet-open');
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
  if (tab === 'petrol' && typeof renderPetrolLog === 'function') setTimeout(renderPetrolLog, 10);
  if (tab === 'report' && typeof renderReport === 'function') setTimeout(renderReport, 10);
}

function scrollNavItemIntoView(btn) {
  if (!btn) return;
  const strip = btn.closest('.sb-nav');
  if (!strip) return;
}

document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateNavTab(btn.dataset.tab));
});

const navMoreOpen = document.getElementById('nav-more-open');
if (navMoreOpen) {
  navMoreOpen.addEventListener('click', e => {
    e.preventDefault();
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

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1, 1); render();
});
document.getElementById('next-month').addEventListener('click', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 1); render();
});

// ── Action buttons ─────────────────────────────────────────
document.getElementById('add-exp-btn').addEventListener('click', addExpense);
document.getElementById('add-inc-btn').addEventListener('click', addIncome);
document.getElementById('add-bank-btn').addEventListener('click', addBank);
document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').value = '';
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', e => importBackup(e.target.files[0]));

['exp-name','exp-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addExpense(); })
);
['inc-name','inc-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addIncome(); })
);
['bk-name','bk-acct','bk-balance'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addBank(); })
);

