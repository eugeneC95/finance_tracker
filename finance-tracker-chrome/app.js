'use strict';

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
  'Car Expenses':  { icon:'🚗', color:'#5F5E5A' },
  'Car Insurance': { icon:'🚘', color:'#4472CA' },
  // Transport
  'Transport':     { icon:'🚌', color:'#63A0C8' },
  'Grab':          { icon:'🟢', color:'#00B14F' },
  'Flight':        { icon:'✈', color:'#1A73E8' },
  // Entertainment
  'Entertainment': { icon:'🎬', color:'#7F77DD' },
  'Subscription':  { icon:'📺', color:'#9B59B6' },
  'Travel':        { icon:'🌍', color:'#1ABC9C' },
  'Hobbies':       { icon:'🎮', color:'#E91E63' },
  // Family
  'Education':     { icon:'📚', color:'#2196F3' },
  'Childcare':     { icon:'👶', color:'#FF9800' },
  'Pet care':      { icon:'🐾', color:'#795548' },
  // Giving
  'Donation':      { icon:'🤲', color:'#4CAF50' },
  'Zakat':         { icon:'☽', color:'#009688' },
  // Other
  'Other':         { icon:'📦', color:'#B4B2A9' },
};

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

// ── Storage read generation (avoid stale load() overwriting a fresh Sheet load)
let _storageReadGen = 0;
function bumpStorageReadGeneration() { _storageReadGen++; }

// ── State ──────────────────────────────────────────────────
let expenses = [], incomes = [], banks = [];
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
  chrome.storage.local.get([KEY_EXP,KEY_INC,KEY_BANKS,KEY_SETS], r => {
    if (gen !== _storageReadGen) return;
    expenses = r[KEY_EXP]   || [];
    incomes  = r[KEY_INC]   || [];
    banks    = r[KEY_BANKS] || [];
    if (r[KEY_SETS]) settings = Object.assign({}, settings, r[KEY_SETS]);
    applySettings();
    render();
    window.__ftAppReady = true;
    try { window.dispatchEvent(new Event('ft-app-ready')); } catch (e) {}
  });
}
function saveExp()   { chrome.storage.local.set({[KEY_EXP]:   expenses}); }
function saveInc()   { chrome.storage.local.set({[KEY_INC]:   incomes}); }
function saveBanks() { chrome.storage.local.set({[KEY_BANKS]: banks}); }
function saveSets()  { chrome.storage.local.set({[KEY_SETS]:  settings}); }

// ── Category buttons ───────────────────────────────────────
var CAT_PAGE_SIZE = 4;

function buildCatButtons() {
  const wrap = document.getElementById('cat-btns');
  if (!wrap) return;
  wrap.innerHTML = '';
  const entries = Object.entries(EXP_CATS);
  for (let i = 0; i < entries.length; i += CAT_PAGE_SIZE) {
    const page = document.createElement('div');
    page.className = 'cat-page';
    const slice = entries.slice(i, i + CAT_PAGE_SIZE);
    slice.forEach(([name, {icon}]) => {
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
      page.appendChild(btn);
    });
    wrap.appendChild(page);
  }
}

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
    ? '.tx-item{padding:5px 0!important}.tx-icon{width:28px!important;height:28px!important;font-size:13px!important}'
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
    amt.textContent = (isIncome ? '+' : '−') + ' ' + fmt(entry.amount);

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
    amt.textContent = (isIncome ? '+' : '−') + ' ' + fmt(entry.amount);
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
    version: 4,
    exported: new Date().toISOString(),
    expenses, incomes, banks,
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
      }

      saveExp(); saveInc(); saveBanks();
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
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
  });
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

// ── Init ───────────────────────────────────────────────────
document.getElementById('exp-date').value = todayStr();
document.getElementById('inc-date').value = todayStr();
buildCatButtons();
load();
