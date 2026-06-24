'use strict';

// ── Category definitions ───────────────────────────────────
const EXP_CATS = {
  Food:           { icon: '🍜', color: '#1D9E75' },
  Shopping:       { icon: '🛍', color: '#D85A30' },
  Health:         { icon: '💊', color: '#D4537E' },
  Bills:          { icon: '🧾', color: '#BA7517' },
  Entertainment:  { icon: '🎬', color: '#7F77DD' },
  Petrol:         { icon: '⛽', color: '#E24B4A' },
  'Car Service':  { icon: '🔧', color: '#378ADD' },
  Toll:           { icon: '🛣', color: '#888780' },
  Parking:        { icon: '🅿️', color: '#78909C' },
  'Car Expenses': { icon: '🚗', color: '#5F5E5A' },
  Transport:      { icon: '🚌', color: '#63A0C8' },
  Other:          { icon: '📦', color: '#B4B2A9' },
};

const INC_CATS = {
  Salary:     { icon: '💼', color: '#1D9E75' },
  Freelance:  { icon: '💻', color: '#378ADD' },
  Business:   { icon: '🏪', color: '#BA7517' },
  Investment: { icon: '📈', color: '#7F77DD' },
  Rental:     { icon: '🏠', color: '#D85A30' },
  Gift:       { icon: '🎁', color: '#D4537E' },
  Other:      { icon: '📦', color: '#B4B2A9' },
};

// ── Storage keys ───────────────────────────────────────────
const KEY_EXP      = 'expenses_v2';
const KEY_INC      = 'incomes_v1';
const KEY_BANKS    = 'banks_v1';
const KEY_SETTINGS = 'settings_v1';

// ── App state ──────────────────────────────────────────────
let expenses = [];
let incomes  = [];
let banks    = [];
let settings = { dark: false, fontSize: 'fs-md', currency: 'RM', showDrag: true, compact: false };

let viewMonth    = new Date(); viewMonth.setDate(1);
let activeFilter = 'All';

// ── Helpers ────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmt(n) {
  const cur = settings.currency || 'RM';
  return cur + ' ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function inViewMonth(dateStr) {
  const d = parseTxDate(dateStr);
  if (!d) return false;
  return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
}

function monthExpenses() { return expenses.filter(e => inViewMonth(e.date)); }
function monthIncomes()   { return incomes.filter(i => inViewMonth(i.date)); }

function shake(el) {
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 300);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Storage ────────────────────────────────────────────────
function load() {
  chrome.storage.local.get([KEY_EXP, KEY_INC, KEY_BANKS, KEY_SETTINGS], r => {
    expenses = r[KEY_EXP]      || [];
    incomes  = r[KEY_INC]      || [];
    banks    = (r[KEY_BANKS] || []).map(normalizeBankRow);
    if (r[KEY_SETTINGS]) settings = { ...settings, ...r[KEY_SETTINGS] };
    applySettings();
    render();
  });
}

function saveExpenses() { chrome.storage.local.set({ [KEY_EXP]: expenses }); }
function saveIncomes()  { chrome.storage.local.set({ [KEY_INC]: incomes }); }
function saveBanks()    { chrome.storage.local.set({ [KEY_BANKS]: banks }); }
function saveSettings() { chrome.storage.local.set({ [KEY_SETTINGS]: settings }); }

// ── Settings: apply ────────────────────────────────────────
function applySettings() {
  const body = document.body;

  // dark / light
  body.classList.toggle('dark', settings.dark);
  document.getElementById('set-dark').checked = settings.dark;

  // font size
  body.classList.remove('fs-sm','fs-md','fs-lg');
  body.classList.add(settings.fontSize || 'fs-md');
  document.querySelectorAll('.fs-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.fs === (settings.fontSize || 'fs-md'));
  });

  // currency
  document.getElementById('set-currency').value = settings.currency || 'RM';

  // drag handles
  document.getElementById('set-drag').checked = settings.showDrag !== false;

  // compact
  document.getElementById('set-compact').checked = !!settings.compact;
  body.classList.toggle('compact', !!settings.compact);
}

// ── Add / Delete Expenses ──────────────────────────────────
function addExpense() {
  const nEl = document.getElementById('exp-name');
  const aEl = document.getElementById('exp-amount');
  const name   = nEl.value.trim();
  const amount = parseFloat(aEl.value);
  const cat    = document.getElementById('exp-cat').value;
  const date   = document.getElementById('exp-date').value || todayStr();
  let ok = true;
  if (!name)                         { shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0)  { shake(aEl); ok = false; }
  if (!ok) return;
  expenses.push({ id: Date.now(), name, amount, cat, date });
  saveExpenses();
  nEl.value = ''; aEl.value = '';
  render();
}

function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  saveExpenses(); render();
}

// ── Add / Delete Income ────────────────────────────────────
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
  saveIncomes();
  nEl.value = ''; aEl.value = '';
  render();
}

function deleteIncome(id) {
  incomes = incomes.filter(i => i.id !== id);
  saveIncomes(); render();
}

// ── Add / Delete Banks ─────────────────────────────────────
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
  if (!name)                          { shake(nEl); ok = false; }
  if (isNaN(balance) || balance < 0)  { shake(bEl); ok = false; }
  if (!ok) return;
  banks.push({ id: Date.now(), name, acct: acct || 'Account', balance, currency });
  saveBanks();
  nEl.value = ''; aEl.value = ''; bEl.value = '';
  render();
}

function deleteBank(id) {
  banks = banks.filter(b => b.id !== id);
  saveBanks(); render();
}

// ── Drag & drop (expense list) ─────────────────────────────
let dragSrc = null;

function makeDraggable(el, list, arr, saveFunc) {
  el.setAttribute('draggable', 'true');

  el.addEventListener('dragstart', e => {
    dragSrc = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    list.querySelectorAll('.item').forEach(i => i.classList.remove('drag-over'));
    // Sync arr order to DOM order
    const newOrder = [];
    list.querySelectorAll('.item').forEach(i => {
      const id = Number(i.dataset.id);
      const found = arr.find(a => a.id === id);
      if (found) newOrder.push(found);
    });
    arr.length = 0;
    newOrder.forEach(o => arr.push(o));
    saveFunc();
  });

  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (el !== dragSrc) {
      list.querySelectorAll('.item').forEach(i => i.classList.remove('drag-over'));
      el.classList.add('drag-over');
    }
  });

  el.addEventListener('drop', e => {
    e.preventDefault();
    if (dragSrc && dragSrc !== el) {
      const allItems = [...list.querySelectorAll('.item')];
      const srcIdx  = allItems.indexOf(dragSrc);
      const dstIdx  = allItems.indexOf(el);
      if (srcIdx < dstIdx) el.after(dragSrc);
      else el.before(dragSrc);
    }
  });
}

// ── Render ─────────────────────────────────────────────────
function render() {
  const me    = monthExpenses();
  const mi    = monthIncomes();
  const today = todayStr();

  const totalExp   = me.reduce((a, e) => a + e.amount, 0);
  const todayExp   = expenses.filter(e => e.date === today).reduce((a, e) => a + e.amount, 0);
  const totalInc   = mi.reduce((a, i) => a + i.amount, 0);
  const totalBanks = totalBanksBase();
  const net        = totalInc - totalExp;

  document.getElementById('month-label').textContent =
    viewMonth.toLocaleString('default', { month: 'short', year: 'numeric' });

  renderExpenses(me, todayExp, totalExp);
  renderIncome(mi, totalInc, totalExp, net);
  renderAssets(totalBanks, totalInc, totalExp);
}

function renderExpenses(me, todayExp, totalExp) {
  document.getElementById('c-total').textContent = fmt(totalExp);
  document.getElementById('c-today').textContent = fmt(todayExp);
  document.getElementById('c-count').textContent = me.length;

  const usedCats  = [...new Set(me.map(e => e.cat))];
  const filterBar = document.getElementById('filter-bar');
  filterBar.innerHTML = '';
  ['All', ...usedCats].forEach(c => {
    const b = document.createElement('button');
    b.className = 'pill' + (activeFilter === c ? ' active' : '');
    b.textContent = c;
    b.onclick = () => { activeFilter = c; render(); };
    filterBar.appendChild(b);
  });

  const filtered = activeFilter === 'All' ? me : me.filter(e => e.cat === activeFilter);
  const sorted   = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  renderList('expense-list', sorted, EXP_CATS, false);

  const catTotals = {};
  me.forEach(e => { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
  const maxVal  = Math.max(...Object.values(catTotals), 1);
  const chartEl = document.getElementById('bar-chart');
  chartEl.innerHTML = '';
  const sorted2 = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  if (sorted2.length === 0) {
    chartEl.innerHTML = `<div class="empty" style="padding:6px 0">Nothing to chart yet</div>`;
  } else {
    sorted2.forEach(([cat, val]) => {
      const color = (EXP_CATS[cat] || EXP_CATS.Other).color;
      const pct   = Math.round((val / maxVal) * 100);
      const row   = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-cat">${escHtml(cat)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-val">${fmt(val)}</div>`;
      chartEl.appendChild(row);
    });
  }
}

function renderIncome(mi, totalInc, totalExp, net) {
  document.getElementById('ic-total').textContent = fmt(totalInc);
  document.getElementById('ic-exp').textContent   = fmt(totalExp);
  const netEl = document.getElementById('ic-net');
  netEl.textContent = fmt(Math.abs(net));
  netEl.className   = 'val ' + (net >= 0 ? 'green' : 'red');
  const sorted = [...mi].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  renderList('income-list', sorted, INC_CATS, true);
}

function renderList(containerId, items, catMap, isIncome) {
  const listEl   = document.getElementById(containerId);
  const dataArr  = isIncome ? incomes : expenses;
  const saveFunc = isIncome ? saveIncomes : saveExpenses;
  listEl.innerHTML = '';

  if (items.length === 0) {
    const em = document.createElement('div');
    em.className = 'empty';
    em.textContent = isIncome ? 'No income this month' : 'No expenses this month';
    listEl.appendChild(em);
    return;
  }

  items.forEach(entry => {
    const cat  = catMap[entry.cat] || catMap.Other;
    const pd = parseTxDate(entry.date);
    const dlbl = pd ? pd.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }) : '';

    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.id = entry.id;

    const showDrag = settings.showDrag !== false;
    item.innerHTML = `
      ${showDrag ? '<div class="drag-handle">⠿</div>' : ''}
      <div class="ico" style="background:${cat.color}22">${cat.icon}</div>
      <div class="info">
        <div class="iname">${escHtml(entry.name)}</div>
        <div class="imeta">${escHtml(entry.cat)} · ${dlbl}</div>
      </div>
      <div class="amt${isIncome ? ' green' : ''}">${fmt(entry.amount)}</div>
      <button class="del" data-id="${entry.id}">×</button>`;

    listEl.appendChild(item);

    if (showDrag) makeDraggable(item, listEl, dataArr, saveFunc);
  });

  listEl.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      isIncome ? deleteIncome(id) : deleteExpense(id);
    });
  });
}

function renderAssets(totalBanks, totalInc, totalExp) {
  const bankListEl = document.getElementById('bank-list');
  bankListEl.innerHTML = '';

  if (banks.length === 0) {
    const em = document.createElement('div');
    em.className = 'empty';
    em.textContent = 'No accounts added yet';
    bankListEl.appendChild(em);
  } else {
    banks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'bank-item';
      item.innerHTML = `
        <div class="bank-ico">🏦</div>
        <div class="bank-info">
          <div class="bank-name">${escHtml(b.name)}</div>
          <div class="bank-sub">${escHtml(b.acct)} · ${escHtml(normalizeBankCurrency(b.currency))}</div>
        </div>
        <div class="bank-bal">${fmtBankAmount(b.balance, b.currency)}</div>
        <button class="bank-del" data-id="${b.id}">×</button>`;
      bankListEl.appendChild(item);
    });
    bankListEl.querySelectorAll('.bank-del').forEach(btn => {
      btn.addEventListener('click', () => deleteBank(Number(btn.dataset.id)));
    });
  }

  const netAssets = totalBanks + totalInc - totalExp;
  document.getElementById('ns-banks').textContent  = fmt(totalBanks);
  document.getElementById('ns-income').textContent = fmt(totalInc);
  document.getElementById('ns-exp').textContent    = fmt(totalExp);
  const netEl = document.getElementById('ns-net');
  netEl.textContent = fmt(netAssets);
  netEl.className   = 'nval big ' + (netAssets >= 0 ? 'green' : 'red');
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Export / Import ────────────────────────────────────────
function exportData() {
  const payload = { version: 2, exported: new Date().toISOString(), expenses, incomes, banks };
  const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `finance-tracker-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Backup exported');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.expenses) || !Array.isArray(data.incomes) || !Array.isArray(data.banks)) {
        showToast('✗ Invalid backup file'); return;
      }
      const from = data.exported ? data.exported.slice(0,10) : 'unknown date';
      if (!confirm(`Restore backup from ${from}?\n\nThis will REPLACE all current data.`)) return;
      expenses = data.expenses;
      incomes  = data.incomes;
      banks    = data.banks;
      saveExpenses(); saveIncomes(); saveBanks();
      render();
      showToast('✓ Data restored');
    } catch { showToast('✗ Could not read file'); }
  };
  reader.readAsText(file);
}

// ── Settings listeners ─────────────────────────────────────
document.getElementById('set-dark').addEventListener('change', e => {
  settings.dark = e.target.checked;
  saveSettings(); applySettings();
});

document.querySelectorAll('.fs-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.fontSize = btn.dataset.fs;
    saveSettings(); applySettings();
  });
});

document.getElementById('set-currency').addEventListener('input', e => {
  settings.currency = e.target.value || 'RM';
  saveSettings(); render();
});

document.getElementById('set-drag').addEventListener('change', e => {
  settings.showDrag = e.target.checked;
  saveSettings(); render();
});

document.getElementById('set-compact').addEventListener('change', e => {
  settings.compact = e.target.checked;
  saveSettings(); applySettings();
  // Apply compact spacing via inline style override
  const style = document.getElementById('compact-style') || (() => {
    const s = document.createElement('style'); s.id = 'compact-style'; document.head.appendChild(s); return s;
  })();
  style.textContent = settings.compact ? '.item { padding: 4px 0 !important; } .item .ico { width:24px;height:24px;font-size:11px; }' : '';
});

// ── Tab switching ──────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Month nav ──────────────────────────────────────────────
document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  render();
});
document.getElementById('next-month').addEventListener('click', () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  render();
});

// ── Button listeners ───────────────────────────────────────
document.getElementById('add-exp-btn').addEventListener('click', addExpense);
document.getElementById('add-inc-btn').addEventListener('click', addIncome);
document.getElementById('add-bank-btn').addEventListener('click', addBank);
document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').value = '';
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', e => importData(e.target.files[0]));

// Enter key shortcuts
['exp-name','exp-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') addExpense(); }));
['inc-name','inc-amount'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') addIncome(); }));
['bk-name','bk-acct','bk-balance'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') addBank(); }));

// ── Init ───────────────────────────────────────────────────
document.getElementById('exp-date').value = todayStr();
document.getElementById('inc-date').value = todayStr();
load();

// ── Open import wizard ─────────────────────────────────────
document.getElementById('open-import-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('import.html') });
});
