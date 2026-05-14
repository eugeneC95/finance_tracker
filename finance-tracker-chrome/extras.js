'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   STORAGE
// ╚══════════════════════════════════════════════════════════╝
var KEY_PETROL = 'petrol_v1';

var petrolLog = [];

function loadExtras() {
  chrome.storage.local.get([KEY_PETROL], function(r) {
    petrolLog = r[KEY_PETROL] || [];
    renderPetrolLog();
    buildCatSelects();
  });
}

function savePetrol() { chrome.storage.local.set({[KEY_PETROL]: petrolLog}); }

// ╔══════════════════════════════════════════════════════════╗
//   CATEGORY SELECT REBUILD
//   Keeps all <select> dropdowns in sync with full EXP/INC_CATS
// ╚══════════════════════════════════════════════════════════╝
function buildCatSelects() {
  // Income category
  var incCat = document.getElementById('inc-cat');
  if (incCat) {
    incCat.innerHTML = '';
    Object.keys(INC_CATS).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = INC_CATS[c].icon + ' ' + c;
      incCat.appendChild(o);
    });
  }

  // Budget category
  var budCat = document.getElementById('bud-cat');
  if (budCat) {
    budCat.innerHTML = '';
    Object.keys(EXP_CATS).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = EXP_CATS[c].icon + ' ' + c;
      budCat.appendChild(o);
    });
  }

  // Recurring category (combined)
  var recCat = document.getElementById('rec-cat');
  if (recCat) {
    recCat.innerHTML = '';
    var expGrp = document.createElement('optgroup');
    expGrp.label = 'Expense';
    Object.keys(EXP_CATS).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = EXP_CATS[c].icon + ' ' + c;
      expGrp.appendChild(o);
    });
    var incGrp = document.createElement('optgroup');
    incGrp.label = 'Income';
    Object.keys(INC_CATS).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = INC_CATS[c].icon + ' ' + c;
      incGrp.appendChild(o);
    });
    recCat.appendChild(expGrp);
    recCat.appendChild(incGrp);
  }

  // Edit modal category — populated dynamically in openEditModal
  // but rebuild cat buttons to ensure they match too
  if (typeof buildCatButtons === 'function') buildCatButtons();
}

// ╔══════════════════════════════════════════════════════════╗
//   PETROL TRACKER
// ╚══════════════════════════════════════════════════════════╝
/** Subsidised RON95-style ceiling; user can override per fill-up. */
var DEFAULT_PETROL_PPL = 1.99;

function ensurePetrolPplDefault() {
  var pEl = document.getElementById('pt-ppl-in');
  if (!pEl) return;
  var raw = String(pEl.value != null ? pEl.value : '').trim();
  if (raw === '' || raw === '-' || isNaN(parseFloat(raw))) pEl.value = String(DEFAULT_PETROL_PPL);
}

function updatePetrolHint() {
  var l   = parseFloat(document.getElementById('pt-litres-in') ? document.getElementById('pt-litres-in').value : '');
  var ppl = parseFloat(document.getElementById('pt-ppl-in')    ? document.getElementById('pt-ppl-in').value    : '');
  var hint = document.getElementById('pt-calc-hint');
  if (!hint) return;
  hint.textContent = (l > 0 && ppl > 0) ? 'Total: RM ' + (l * ppl).toFixed(2) : '';
}

function addPetrolEntry() {
  var stEl  = document.getElementById('pt-station');
  var lEl   = document.getElementById('pt-litres-in');
  var pEl   = document.getElementById('pt-ppl-in');
  var oEl   = document.getElementById('pt-odo');
  var dEl   = document.getElementById('pt-date');

  var station = stEl ? stEl.value.trim() : '';
  var litres  = parseFloat(lEl ? lEl.value : '');
  var ppl     = parseFloat(pEl ? pEl.value : '');
  var odo     = parseFloat(oEl ? oEl.value : '') || null;
  var date    = (dEl && dEl.value) ? dEl.value : todayStr();

  if (isNaN(litres) || litres <= 0) { if(lEl) shake(lEl); return; }
  if (isNaN(ppl)    || ppl    <= 0) { if(pEl) shake(pEl); return; }

  var total = parseFloat((litres * ppl).toFixed(2));
  petrolLog.unshift({ id: Date.now(), station: station, litres: litres, ppl: ppl, odo: odo, date: date, total: total });
  savePetrol();

  // Auto-add as Petrol expense
  expenses.push({ id: Date.now() + 1, name: station || 'Petrol', amount: total, cat: 'Petrol', date: date });
  saveExp();
  render();

  if (stEl) stEl.value = '';
  if (lEl)  lEl.value  = '';
  if (pEl)  pEl.value  = String(DEFAULT_PETROL_PPL);
  if (oEl)  oEl.value  = '';
  var hint = document.getElementById('pt-calc-hint');
  if (hint) hint.textContent = '';

  renderPetrolLog();
  showToast('Logged ' + litres + 'L for RM ' + total.toFixed(2));
}

function deletePetrolEntry(id) {
  petrolLog = petrolLog.filter(function(e) { return e.id !== id; });
  savePetrol();
  renderPetrolLog();
}

function renderPetrolLog() {
  var totalSpent  = petrolLog.reduce(function(a,e){ return a+e.total;  }, 0);
  var totalLitres = petrolLog.reduce(function(a,e){ return a+e.litres; }, 0);
  var avgPpl      = totalLitres > 0 ? totalSpent / totalLitres : 0;

  // Cost per km from consecutive odometer readings
  var cpk = 0;
  var withOdo = petrolLog.filter(function(e){ return e.odo; })
    .sort(function(a,b){ return a.date.localeCompare(b.date); });
  if (withOdo.length >= 2) {
    var first = withOdo[0], last = withOdo[withOdo.length-1];
    var kmDriven = last.odo - first.odo;
    var fuelUsed = withOdo.slice(1).reduce(function(a,e){ return a+e.litres; }, 0);
    if (kmDriven > 0 && fuelUsed > 0) cpk = (fuelUsed / kmDriven) * avgPpl;
  }

  function setEl(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }
  setEl('pt-total',  fmt(totalSpent));
  setEl('pt-litres', totalLitres.toFixed(1) + ' L');
  setEl('pt-ppl',    'RM ' + avgPpl.toFixed(3));
  setEl('pt-cpk',    cpk > 0 ? 'RM ' + cpk.toFixed(3) + '/km' : '—');

  ensurePetrolPplDefault();

  var el = document.getElementById('pt-list');
  if (!el) return;

  if (!petrolLog.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⛽</div>No fill-ups logged yet</div>';
    return;
  }

  // Build table
  var table = document.createElement('table');
  table.className = 'pt-table';

  var thead = document.createElement('thead');
  var hrow  = document.createElement('tr');
  ['Date','Station','Litres','RM/L','Total','Odometer','Efficiency',''].forEach(function(h) {
    var th = document.createElement('th'); th.textContent = h; hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  var sorted = petrolLog.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });

  sorted.forEach(function(e) {
    // Efficiency: find adjacent odo reading
    var odoIdx = withOdo.findIndex(function(x){ return x.id===e.id; });
    var effStr = '—';
    if (e.odo && odoIdx > 0) {
      var km = e.odo - withOdo[odoIdx-1].odo;
      if (km > 0) effStr = (e.litres / km * 100).toFixed(1) + ' L/100km';
    }

    var row = document.createElement('tr');

    function td(txt, bold, label) {
      var c = document.createElement('td');
      c.textContent = txt;
      if (bold) c.style.fontWeight = '600';
      if (label) c.setAttribute('data-label', label);
      return c;
    }

    row.appendChild(td(e.date, false, 'Date'));
    row.appendChild(td(e.station || '—', false, 'Station'));
    row.appendChild(td(e.litres.toFixed(2) + ' L', false, 'Litres'));
    row.appendChild(td('RM ' + e.ppl.toFixed(3), false, 'RM/L'));
    row.appendChild(td(fmt(e.total), true, 'Total'));
    row.appendChild(td(e.odo ? e.odo.toLocaleString() + ' km' : '—', false, 'Odometer'));
    row.appendChild(td(effStr, false, 'Efficiency'));

    var delTd  = document.createElement('td');
    delTd.className = 'pt-td--actions';
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'del-btn';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete fill-up');
    (function(id) {
      delBtn.addEventListener('click', function() {
        if (confirm('Delete this fill-up?')) deletePetrolEntry(id);
      });
    })(e.id);
    delTd.appendChild(delBtn);
    row.appendChild(delTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  el.innerHTML = '';
  el.appendChild(table);
}

// ╔══════════════════════════════════════════════════════════╗
//   MONTHLY REPORT
// ╚══════════════════════════════════════════════════════════╝
function renderReport() {
  var el = document.getElementById('report-content');
  if (!el) return;

  var me       = mExp();
  var mi       = mInc();
  var ym       = viewYM();
  var ymLabel  = viewMonth.toLocaleString('default', {month:'long', year:'numeric'});
  var totalExp = me.reduce(function(a,e){ return a+e.amount; }, 0);
  var totalInc = mi.reduce(function(a,i){ return a+i.amount; }, 0);
  var net      = totalInc - totalExp;
  var savings  = totalInc > 0 ? Math.max(0, (net / totalInc) * 100) : 0;

  // Category totals
  var catTotals = {};
  me.forEach(function(e) { catTotals[e.cat] = (catTotals[e.cat]||0) + e.amount; });
  var catSorted = Object.entries(catTotals).sort(function(a,b){ return b[1]-a[1]; });

  // Income by source
  var incBySource = {};
  mi.forEach(function(i) { incBySource[i.cat] = (incBySource[i.cat]||0) + i.amount; });

  // Top 5 expenses
  var top5 = me.slice().sort(function(a,b){ return b.amount-a.amount; }).slice(0,5);

  // Petrol this month
  var mPetrol = (typeof petrolLog !== 'undefined')
    ? petrolLog.filter(function(p){ return p.date.startsWith(ym); })
    : [];

  // Build report DOM
  el.innerHTML = '';

  function section(title) {
    var s = document.createElement('div'); s.className = 'report-section';
    var h = document.createElement('h3'); h.textContent = title;
    s.appendChild(h); el.appendChild(s); return s;
  }

  function addRow(sec, label, value, cls) {
    var row = document.createElement('div'); row.className = 'report-row';
    var lb  = document.createElement('span'); lb.className = 'rr-label'; lb.textContent = label;
    var vl  = document.createElement('span'); vl.className = 'rr-val' + (cls ? ' '+cls : ''); vl.textContent = value;
    row.appendChild(lb); row.appendChild(vl); sec.appendChild(row);
  }

  // Header
  var hdr = document.createElement('div');
  hdr.innerHTML =
    '<div style="font-size:var(--f-2xl);font-weight:700;margin-bottom:4px">' + ymLabel + '</div>' +
    '<div style="font-size:var(--f-sm);color:var(--ink3);margin-bottom:24px">Generated ' +
    new Date().toLocaleDateString('en-MY',{day:'numeric',month:'long',year:'numeric'}) + '</div>';
  el.appendChild(hdr);

  // Summary
  var sec1 = section('Summary');
  addRow(sec1, 'Total income',   fmt(totalInc), 'green');
  addRow(sec1, 'Total expenses', fmt(totalExp), 'red');
  addRow(sec1, 'Savings rate',   savings.toFixed(1) + '%');
  var totRow = document.createElement('div'); totRow.className = 'report-total';
  var totLbl = document.createElement('span'); totLbl.textContent = 'Net';
  var totVal = document.createElement('span');
  totVal.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  totVal.textContent = (net>=0?'+':'') + fmt(net);
  totRow.appendChild(totLbl); totRow.appendChild(totVal); sec1.appendChild(totRow);

  // By category
  if (catSorted.length) {
    var sec2 = section('Spending by category');
    catSorted.forEach(function(entry) {
      var cat  = entry[0], amt = entry[1];
      var info = EXP_CATS[cat] || {icon:'📦'};
      var pct  = totalExp > 0 ? ((amt/totalExp)*100).toFixed(1) : 0;
      var row  = document.createElement('div'); row.className = 'report-row';
      var lb   = document.createElement('span'); lb.className = 'rr-label';
      lb.textContent = info.icon + ' ' + cat;
      var rv   = document.createElement('span'); rv.style.display = 'flex'; rv.style.gap = '16px';
      var pctS = document.createElement('span'); pctS.style.cssText = 'color:var(--ink3);font-size:var(--f-xs)'; pctS.textContent = pct + '%';
      var amtS = document.createElement('span'); amtS.className = 'rr-val red'; amtS.textContent = fmt(amt);
      rv.appendChild(pctS); rv.appendChild(amtS);
      row.appendChild(lb); row.appendChild(rv); sec2.appendChild(row);
    });
  }

  // Income breakdown
  if (mi.length) {
    var sec3 = section('Income breakdown');
    Object.entries(incBySource).forEach(function(entry) {
      var cat = entry[0], amt = entry[1];
      var info = INC_CATS[cat] || {icon:'📦'};
      addRow(sec3, info.icon + ' ' + cat, fmt(amt), 'green');
    });
  }

  // Top 5
  if (top5.length) {
    var sec4 = section('Top 5 expenses');
    top5.forEach(function(e, i) {
      var info = EXP_CATS[e.cat] || {icon:'📦'};
      var _pd = typeof parseTxDate === 'function' ? parseTxDate(e.date) : null;
      var dlbl = _pd ? _pd.toLocaleDateString('en-MY',{day:'numeric',month:'short'}) : String(e.date || '');
      var row  = document.createElement('div'); row.className = 'report-row';
      var lb   = document.createElement('span'); lb.className = 'rr-label';
      lb.textContent = (i+1) + '. ' + info.icon + ' ' + e.name + ' · ' + dlbl;
      var vl   = document.createElement('span'); vl.className = 'rr-val red'; vl.textContent = fmt(e.amount);
      row.appendChild(lb); row.appendChild(vl); sec4.appendChild(row);
    });
  }

  // Petrol section
  if (mPetrol.length) {
    var sec5 = section('Petrol this month');
    var ptTotal  = mPetrol.reduce(function(a,p){ return a+p.total;  }, 0);
    var ptLitres = mPetrol.reduce(function(a,p){ return a+p.litres; }, 0);
    addRow(sec5, 'Fill-ups',     mPetrol.length);
    addRow(sec5, 'Total litres', ptLitres.toFixed(1) + ' L');
    addRow(sec5, 'Total cost',   fmt(ptTotal), 'red');
  }
}

// ╔══════════════════════════════════════════════════════════╗
//   WIRING
// ╚══════════════════════════════════════════════════════════╝
// Petrol
var addPtBtn = document.getElementById('add-pt-btn');
if (addPtBtn) addPtBtn.addEventListener('click', addPetrolEntry);
['pt-litres-in','pt-ppl-in'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePetrolHint);
});
['pt-station','pt-litres-in','pt-ppl-in','pt-odo'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('keydown', function(e){ if(e.key==='Enter') addPetrolEntry(); });
});
var ptDate = document.getElementById('pt-date');
if (ptDate && typeof todayStr === 'function') ptDate.value = todayStr();

// Report
var printBtn = document.getElementById('print-report-btn');
if (printBtn) printBtn.addEventListener('click', function() { window.print(); });

// Nav triggers for petrol/report pages
document.querySelectorAll('.nav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = btn.dataset.tab;
    if (tab === 'petrol') setTimeout(renderPetrolLog, 10);
    if (tab === 'report') setTimeout(renderReport, 10);
  });
});

loadExtras();
