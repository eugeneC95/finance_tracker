'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   STORAGE
// ╚══════════════════════════════════════════════════════════╝
var KEY_PETROL = 'petrol_v1';

var petrolLog = [];
var lastPetrolTpl = null;
const KEY_LAST_PETROL = 'last_petrol_v1';

function loadExtras() {
  if (typeof window !== 'undefined' && window.__ftForceSheetSource) {
    petrolLog = [];
    lastPetrolTpl = null;
    renderPetrolLog();
    buildCatSelects();
    return;
  }
  chromeStorage.local.get([KEY_PETROL, KEY_LAST_PETROL], function(r) {
    petrolLog = r[KEY_PETROL] || [];
    lastPetrolTpl = r[KEY_LAST_PETROL] || null;
    renderPetrolLog();
    buildCatSelects();
  });
}

function savePetrol() {
  chromeStorage.local.set({ [KEY_PETROL]: petrolLog, [KEY_LAST_PETROL]: lastPetrolTpl });
}

function repeatLastPetrol() {
  if (!lastPetrolTpl) {
    showToast('No recent petrol fill to repeat');
    return false;
  }
  var litres = lastPetrolTpl.litres;
  var ppl = lastPetrolTpl.ppl || DEFAULT_PETROL_PPL;
  var station = lastPetrolTpl.station || 'Petrol';
  var date = todayStr();
  var total = parseFloat((litres * ppl).toFixed(2));
  petrolLog.unshift({
    id: Date.now(),
    station: station,
    litres: litres,
    ppl: ppl,
    odo: lastPetrolTpl.odo || null,
    date: date,
    total: total,
  });
  savePetrol();
  expenses.push({ id: Date.now() + 1, name: station, amount: total, cat: 'Petrol', date: date });
  saveExp();
  render();
  renderPetrolLog();
  showToast('Repeated petrol: ' + litres.toFixed(1) + ' L');
  return true;
}

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
var DEFAULT_PETROL_PPL = 1.99;
var PETROL_PPL_PRESETS = [1.99, 2.05, 2.15, 2.99];
var ptLastEdit = 'litres';

function petrolViewYm() {
  if (typeof viewMonth !== 'undefined' && viewMonth) {
    return viewMonth.getFullYear() + '-' + String(viewMonth.getMonth() + 1).padStart(2, '0');
  }
  return typeof todayStr === 'function' ? todayStr().slice(0, 7) : '';
}

function petrolEntriesForView() {
  var ym = petrolViewYm();
  return petrolLog.filter(function(e) { return e.date && e.date.indexOf(ym) === 0; });
}

function petrolOdoSorted() {
  return petrolLog
    .filter(function(e) { return e.odo > 0; })
    .sort(function(a, b) { return a.date.localeCompare(b.date) || a.odo - b.odo; });
}

function petrolLastOdoEntry() {
  var list = petrolOdoSorted();
  return list.length ? list[list.length - 1] : null;
}

function petrolFillEfficiency(entry, withOdo) {
  var idx = withOdo.findIndex(function(x) { return x.id === entry.id; });
  if (!entry.odo || idx <= 0) return null;
  var km = entry.odo - withOdo[idx - 1].odo;
  if (km <= 0) return null;
  return { km: km, l100: (entry.litres / km) * 100 };
}

function petrolAvgL100(withOdo) {
  if (withOdo.length < 2) return 0;
  var totalKm = 0;
  var totalL = 0;
  for (var i = 1; i < withOdo.length; i++) {
    var km = withOdo[i].odo - withOdo[i - 1].odo;
    if (km > 0) {
      totalKm += km;
      totalL += withOdo[i].litres;
    }
  }
  return totalKm > 0 ? (totalL / totalKm) * 100 : 0;
}

function petrolCostPerKm(withOdo, avgPpl) {
  if (withOdo.length < 2 || avgPpl <= 0) return 0;
  var first = withOdo[0];
  var last = withOdo[withOdo.length - 1];
  var kmDriven = last.odo - first.odo;
  var fuelUsed = withOdo.slice(1).reduce(function(a, e) { return a + e.litres; }, 0);
  if (kmDriven <= 0 || fuelUsed <= 0) return 0;
  return (fuelUsed / kmDriven) * avgPpl;
}

function ensurePetrolPplDefault() {
  var pEl = document.getElementById('pt-ppl-in');
  if (!pEl) return;
  var raw = String(pEl.value != null ? pEl.value : '').trim();
  if (raw === '' || raw === '-' || isNaN(parseFloat(raw))) pEl.value = String(DEFAULT_PETROL_PPL);
}

function wirePetrolUi() {
  if (document.body.dataset.ptUiWired) return;
  document.body.dataset.ptUiWired = '1';

  document.querySelectorAll('.pt-ppl-preset').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pEl = document.getElementById('pt-ppl-in');
      if (!pEl) return;
      pEl.value = btn.getAttribute('data-ppl') || String(DEFAULT_PETROL_PPL);
      ptLastEdit = 'ppl';
      updatePetrolCalc();
    });
  });

  var lEl = document.getElementById('pt-litres-in');
  var pEl = document.getElementById('pt-ppl-in');
  var tEl = document.getElementById('pt-total-in');
  if (lEl) lEl.addEventListener('input', function() { ptLastEdit = 'litres'; updatePetrolCalc(); });
  if (pEl) pEl.addEventListener('input', function() { ptLastEdit = 'ppl'; updatePetrolCalc(); });
  if (tEl) tEl.addEventListener('input', function() { ptLastEdit = 'total'; updatePetrolCalc(); });
  var oEl = document.getElementById('pt-odo');
  if (oEl) oEl.addEventListener('input', updatePetrolCalc);
}

function updatePetrolCalc() {
  ensurePetrolPplDefault();
  wirePetrolUi();

  var lEl = document.getElementById('pt-litres-in');
  var pEl = document.getElementById('pt-ppl-in');
  var tEl = document.getElementById('pt-total-in');
  var oEl = document.getElementById('pt-odo');

  var litres = parseFloat(lEl && lEl.value) || 0;
  var ppl = parseFloat(pEl && pEl.value) || 0;
  var totalIn = parseFloat(tEl && tEl.value);

  if (ptLastEdit === 'total' && !isNaN(totalIn) && totalIn > 0 && ppl > 0) {
    litres = totalIn / ppl;
    if (lEl) lEl.value = litres > 0 ? String(parseFloat(litres.toFixed(2))) : '';
  } else if (litres > 0 && ppl > 0 && tEl && ptLastEdit !== 'total') {
    tEl.value = (litres * ppl).toFixed(2);
  }

  var total = litres > 0 && ppl > 0 ? litres * ppl : (!isNaN(totalIn) && totalIn > 0 ? totalIn : 0);

  var liveTotal = document.getElementById('pt-live-total');
  var liveSub = document.getElementById('pt-live-sub');
  if (liveTotal) liveTotal.textContent = total > 0 ? fmt(total) : 'RM 0.00';

  var parts = [];
  if (litres > 0 && ppl > 0) parts.push(litres.toFixed(2) + ' L × RM ' + ppl.toFixed(2));
  else if (total > 0 && ppl > 0) parts.push('≈ ' + (total / ppl).toFixed(2) + ' L at RM ' + ppl.toFixed(2));

  var last = petrolLastOdoEntry();
  var odo = parseFloat(oEl && oEl.value) || 0;
  if (odo > 0 && last && last.odo > 0 && odo > last.odo && litres > 0) {
    var km = odo - last.odo;
    parts.push(km.toLocaleString() + ' km');
    parts.push((litres / km * 100).toFixed(1) + ' L/100 km');
  }
  if (liveSub) liveSub.textContent = parts.length ? parts.join(' · ') : 'Enter litres and price per litre (or total RM)';

  var odoHint = document.getElementById('pt-odo-hint');
  if (odoHint) {
    odoHint.textContent = last && last.odo
      ? 'Last odometer: ' + last.odo.toLocaleString() + ' km (' + last.date + ')'
      : 'Optional — two readings unlock cost/km and L/100 km';
  }
}

function updatePetrolHint() {
  updatePetrolCalc();
}

function addPetrolEntry() {
  updatePetrolCalc();

  var stEl = document.getElementById('pt-station');
  var lEl = document.getElementById('pt-litres-in');
  var pEl = document.getElementById('pt-ppl-in');
  var tEl = document.getElementById('pt-total-in');
  var oEl = document.getElementById('pt-odo');
  var dEl = document.getElementById('pt-date');

  var station = stEl ? stEl.value.trim() : '';
  var litres = parseFloat(lEl ? lEl.value : '');
  var ppl = parseFloat(pEl ? pEl.value : '');
  var totalIn = parseFloat(tEl ? tEl.value : '');
  var odo = parseFloat(oEl ? oEl.value : '') || null;
  var date = dEl && dEl.value ? dEl.value : todayStr();

  if ((isNaN(litres) || litres <= 0) && !isNaN(totalIn) && totalIn > 0 && ppl > 0) litres = totalIn / ppl;
  if (isNaN(litres) || litres <= 0) {
    if (lEl) shake(lEl);
    if (tEl) shake(tEl);
    return;
  }
  if (isNaN(ppl) || ppl <= 0) {
    if (pEl) shake(pEl);
    return;
  }
  var last = petrolLastOdoEntry();
  if (odo && last && last.odo && odo > last.odo && litres > 0) {
    var km = odo - last.odo;
    if (km > 0) {
      var l100 = (litres / km) * 100;
      if ((l100 > 20 || l100 < 2) && !confirm('Unusual petrol efficiency (' + l100.toFixed(1) + ' L/100km). Save anyway?')) {
        return;
      }
    }
  }

  var total = parseFloat((litres * ppl).toFixed(2));
  petrolLog.unshift({ id: Date.now(), station: station, litres: litres, ppl: ppl, odo: odo, date: date, total: total });
  lastPetrolTpl = { station: station, litres: litres, ppl: ppl, odo: odo };
  savePetrol();

  expenses.push({ id: Date.now() + 1, name: station || 'Petrol', amount: total, cat: 'Petrol', date: date });
  saveExp();
  render();

  if (stEl) stEl.value = '';
  if (lEl) lEl.value = '';
  if (pEl) pEl.value = String(DEFAULT_PETROL_PPL);
  if (tEl) tEl.value = '';
  if (oEl) oEl.value = '';
  ptLastEdit = 'litres';
  updatePetrolCalc();

  renderPetrolLog();
  showToast('Logged ' + litres.toFixed(1) + ' L · ' + fmt(total));
}

function deletePetrolEntry(id) {
  var idx = petrolLog.findIndex(function(e) { return e.id === id; });
  if (idx < 0) return;
  var removed = petrolLog[idx];
  petrolLog.splice(idx, 1);
  savePetrol();
  renderPetrolLog();
  if (typeof registerUndoDelete === 'function') {
    registerUndoDelete('Petrol fill-up', function() {
      petrolLog.splice(Math.min(idx, petrolLog.length), 0, removed);
      savePetrol();
      renderPetrolLog();
    });
  }
}

function renderPetrolLog() {
  wirePetrolUi();
  ensurePetrolPplDefault();

  var monthEntries = petrolEntriesForView();
  var allEntries = petrolLog.slice();
  var totalSpent = monthEntries.reduce(function(a, e) { return a + e.total; }, 0);
  var totalLitres = monthEntries.reduce(function(a, e) { return a + e.litres; }, 0);
  var avgPpl = totalLitres > 0 ? totalSpent / totalLitres : 0;

  var withOdo = petrolOdoSorted();
  var cpk = petrolCostPerKm(withOdo, avgPpl);
  var avgL100 = petrolAvgL100(withOdo);
  var viewYm = petrolViewYm();

  function setEl(id, txt) {
    var e = document.getElementById(id);
    if (e) e.textContent = txt;
  }

  if (typeof viewMonth !== 'undefined' && viewMonth) {
    setEl('pt-period-label', viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' }));
  }
  setEl('pt-total', fmt(totalSpent));
  setEl('pt-litres', totalLitres > 0 ? totalLitres.toFixed(1) + ' L' : '0 L');
  setEl('pt-ppl', avgPpl > 0 ? 'RM ' + avgPpl.toFixed(2) : '—');
  setEl('pt-cpk', cpk > 0 ? 'RM ' + cpk.toFixed(2) : '—');
  setEl('pt-eff', avgL100 > 0 ? avgL100.toFixed(1) + ' L/100km' : '—');

  var histNote = document.getElementById('pt-history-note');
  if (histNote) {
    if (!allEntries.length) histNote.textContent = '';
    else if (monthEntries.length === allEntries.length) {
      histNote.textContent = allEntries.length + (allEntries.length === 1 ? ' fill-up' : ' fill-ups');
    } else {
      histNote.textContent =
        allEntries.length + ' total · ' + monthEntries.length + ' this month';
    }
  }

  updatePetrolCalc();

  var el = document.getElementById('pt-list');
  if (!el) return;

  if (!allEntries.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⛽</div>No fill-ups logged yet</div>';
    return;
  }

  var root = document.createElement('div');
  root.className = 'pt-cards';

  var sorted = allEntries.slice().sort(function(a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  sorted.forEach(function(e) {
    var eff = petrolFillEfficiency(e, withOdo);

    var useSwipe = typeof ftUseSwipeRows === 'function' && ftUseSwipeRows();
    var card = document.createElement('article');
    card.className = 'pt-card';
    if (viewYm && e.date && e.date.indexOf(viewYm) !== 0) card.className += ' pt-card--other-month';

    var head = document.createElement('div');
    head.className = 'pt-card__head';
    var dateEl = document.createElement('span');
    dateEl.className = 'pt-card__date';
    dateEl.textContent = e.date;
    var totalEl = document.createElement('span');
    totalEl.className = 'pt-card__total';
    totalEl.textContent = fmt(e.total);
    head.appendChild(dateEl);
    head.appendChild(totalEl);

    var meta = document.createElement('div');
    meta.className = 'pt-card__meta';
    meta.textContent = e.litres.toFixed(2) + ' L @ RM ' + e.ppl.toFixed(2) + (e.station ? ' · ' + e.station : '');

    card.appendChild(head);
    card.appendChild(meta);

    if (e.odo || eff) {
      var extra = document.createElement('div');
      extra.className = 'pt-card__extra';
      var bits = [];
      if (e.odo) bits.push(e.odo.toLocaleString() + ' km');
      if (eff) bits.push(eff.km.toLocaleString() + ' km trip · ' + eff.l100.toFixed(1) + ' L/100 km');
      extra.textContent = bits.join(' · ');
      card.appendChild(extra);
    }

    if (!useSwipe) {
      var foot = document.createElement('div');
      foot.className = 'pt-card__foot';
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-ghost pt-card__del';
      delBtn.textContent = 'Delete';
      (function(id) {
        delBtn.addEventListener('click', function() {
          if (confirm('Delete this fill-up?')) deletePetrolEntry(id);
        });
      })(e.id);
      foot.appendChild(delBtn);
      card.appendChild(foot);
    }

    if (useSwipe && typeof ftMountSwipeRow === 'function') {
      root.appendChild(ftMountSwipeRow(card, [
        { label: 'Delete', kind: 'del', onClick: function() {
          if (confirm('Delete this fill-up?')) deletePetrolEntry(e.id);
        }},
      ]));
    } else {
      root.appendChild(card);
    }
  });

  el.innerHTML = '';
  el.appendChild(root);
  renderPetrolEfficiencyChart();
}

function petrolEfficiencyByMonth() {
  var byYm = {};
  var withOdo = petrolOdoSorted();
  for (var i = 1; i < withOdo.length; i++) {
    var km = withOdo[i].odo - withOdo[i - 1].odo;
    if (km <= 0) continue;
    var ym = String(withOdo[i].date || '').slice(0, 7);
    if (!ym) continue;
    if (!byYm[ym]) byYm[ym] = { km: 0, litres: 0 };
    byYm[ym].km += km;
    byYm[ym].litres += withOdo[i].litres;
  }
  return Object.keys(byYm).sort().slice(-6).map(function(ym) {
    var o = byYm[ym];
    return { ym: ym, l100: o.km > 0 ? (o.litres / o.km) * 100 : 0 };
  });
}

function renderPetrolEfficiencyChart() {
  var el = document.getElementById('pt-eff-chart');
  if (!el) return;
  var series = petrolEfficiencyByMonth();
  if (!series.length) {
    el.innerHTML = '<div class="ft-note" style="padding:12px 0">Log odometer on fill-ups to see L/100 km trend.</div>';
    return;
  }
  if (typeof renderMonthDailyLineChart !== 'function') return;
  renderMonthDailyLineChart(
    el,
    series.map(function(s) { return s.ym; }),
    series.map(function(s) { return s.l100; }),
    { stroke: '#378ADD', label: 'L/100 km' }
  );
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

  if (typeof budgets !== 'undefined' && budgets && Object.keys(budgets).length) {
    var overRows = [];
    var underRows = [];
    Object.keys(budgets).forEach(function(cat) {
      var limit = budgets[cat];
      var spent = catTotals[cat] || 0;
      var diff = limit - spent;
      if (spent <= 0) return;
      if (diff < 0) overRows.push({ cat: cat, msg: 'Over by ' + fmt(Math.abs(diff)), cls: 'red' });
      else if (diff > 0) underRows.push({ cat: cat, msg: 'Under by ' + fmt(diff), cls: 'green' });
    });
    if (overRows.length || underRows.length) {
      var secBud = section('Budget vs actual');
      overRows.concat(underRows).forEach(function(row) {
        var info = EXP_CATS[row.cat] || { icon: '📦' };
        addRow(secBud, info.icon + ' ' + row.cat, row.msg, row.cls);
      });
    }
  }

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

function buildReportShareText() {
  var me = mExp();
  var mi = mInc();
  var ymLabel = viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  var totalExp = me.reduce(function(a, e) { return a + e.amount; }, 0);
  var totalInc = mi.reduce(function(a, i) { return a + i.amount; }, 0);
  var net = totalInc - totalExp;
  return (
    'Finance Tracker · ' + ymLabel + '\n' +
    'Income: ' + fmt(totalInc) + '\n' +
    'Expenses: ' + fmt(totalExp) + '\n' +
    'Net: ' + (net >= 0 ? '+' : '-') + fmt(Math.abs(net))
  );
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
['pt-station','pt-litres-in','pt-ppl-in','pt-total-in','pt-odo'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('keydown', function(e){ if(e.key==='Enter') addPetrolEntry(); });
});
var ptDate = document.getElementById('pt-date');
if (ptDate && typeof todayStr === 'function') ptDate.value = todayStr();

// Report
var printBtn = document.getElementById('print-report-btn');
if (printBtn) printBtn.addEventListener('click', function() { window.print(); });
var shareBtn = document.getElementById('share-report-btn');
if (shareBtn) shareBtn.addEventListener('click', function() {
  var text = buildReportShareText();
  if (navigator.share) {
    navigator.share({ title: 'Monthly report', text: text }).catch(function() {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Report summary copied');
    }).catch(function() {
      showToast('Share not supported on this device');
    });
    return;
  }
  showToast('Share not supported on this device');
});

loadExtras();
