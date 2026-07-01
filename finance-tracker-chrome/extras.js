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

function petrolKmPerL(l100) {
  if (!l100 || l100 <= 0) return 0;
  return 100 / l100;
}

function petrolFmtEfficiency(l100) {
  if (!l100 || l100 <= 0) return '—';
  return l100.toFixed(1) + ' L/100 km · ' + petrolKmPerL(l100).toFixed(2) + ' km/L';
}

function petrolFillEfficiency(entry, withOdo) {
  var idx = withOdo.findIndex(function(x) { return x.id === entry.id; });
  if (!entry.odo || idx <= 0) return null;
  var km = entry.odo - withOdo[idx - 1].odo;
  if (km <= 0) return null;
  var l100 = (entry.litres / km) * 100;
  return { km: km, l100: l100, kmL: petrolKmPerL(l100) };
}

function petrolAvgL100(withOdo) {
  var summary = petrolEfficiencyRangeSummary_(withOdo);
  return summary.ok ? summary.avgL100 : 0;
}

/** Weighted average L/100 km over a date range (default: all odometer fill-ups). */
function getPetrolEffRange_() {
  if (typeof settings === 'undefined' || !settings.petrolEffRange) return { from: '', to: '' };
  var r = settings.petrolEffRange;
  return {
    from: String(r.from || '').slice(0, 10),
    to: String(r.to || '').slice(0, 10),
  };
}

function savePetrolEffRange_(from, to) {
  if (typeof settings === 'undefined' || typeof saveSets !== 'function') return;
  settings.petrolEffRange = {
    from: from ? String(from).slice(0, 10) : '',
    to: to ? String(to).slice(0, 10) : '',
  };
  saveSets();
}

function petrolOdoDateBounds_() {
  var list = petrolOdoSorted();
  if (!list.length) return null;
  return {
    min: String(list[0].date || '').slice(0, 10),
    max: String(list[list.length - 1].date || '').slice(0, 10),
  };
}

function petrolEfficiencyRangeSummary_(withOdo, rangeOpts) {
  var list = withOdo || petrolOdoSorted();
  var range = rangeOpts || getPetrolEffRange_();
  var from = range.from || '';
  var to = range.to || '';
  var customRange = !!(from || to);
  if (list.length < 2) {
    return { ok: false, fills: list.length, trips: 0, totalKm: 0, totalLitres: 0, customRange: customRange };
  }
  var totalKm = 0;
  var totalL = 0;
  var trips = 0;
  var fillsInRange = 0;
  var actualFrom = '';
  var actualTo = '';
  for (var i = 1; i < list.length; i++) {
    var fillDate = String(list[i].date || '').slice(0, 10);
    if (from && fillDate < from) continue;
    if (to && fillDate > to) continue;
    var km = list[i].odo - list[i - 1].odo;
    if (km > 0) {
      totalKm += km;
      totalL += list[i].litres;
      trips++;
      fillsInRange++;
      if (!actualFrom) actualFrom = fillDate;
      actualTo = fillDate;
    }
  }
  if (totalKm <= 0 || totalL <= 0) {
    return {
      ok: false,
      fills: fillsInRange,
      trips: trips,
      totalKm: 0,
      totalLitres: 0,
      customRange: customRange,
      rangeFrom: from,
      rangeTo: to,
    };
  }
  var avgL100 = (totalL / totalKm) * 100;
  return {
    ok: true,
    avgL100: avgL100,
    kmL: petrolKmPerL(avgL100),
    totalKm: totalKm,
    totalLitres: totalL,
    trips: trips,
    fills: fillsInRange,
    fromDate: actualFrom,
    toDate: actualTo,
    fromOdo: list[0].odo,
    toOdo: list[list.length - 1].odo,
    customRange: customRange,
    rangeFrom: from,
    rangeTo: to,
  };
}

function wirePetrolEffRangeUi_() {
  if (document.body.dataset.ptEffRangeWired) return;
  document.body.dataset.ptEffRangeWired = '1';

  var fromEl = document.getElementById('pt-eff-from');
  var toEl = document.getElementById('pt-eff-to');
  var resetBtn = document.getElementById('pt-eff-range-reset');
  var lastMonthBtn = document.getElementById('pt-eff-range-last-month');

  function applyRange_() {
    var from = fromEl ? String(fromEl.value || '').slice(0, 10) : '';
    var to = toEl ? String(toEl.value || '').slice(0, 10) : '';
    if (from && to && from > to) {
      if (document.activeElement === fromEl && toEl) toEl.value = from;
      else if (fromEl) fromEl.value = to;
      from = fromEl ? fromEl.value : from;
      to = toEl ? toEl.value : to;
    }
    savePetrolEffRange_(from, to);
    renderPetrolLog();
  }

  if (fromEl) fromEl.addEventListener('change', applyRange_);
  if (toEl) toEl.addEventListener('change', applyRange_);
  if (resetBtn) resetBtn.addEventListener('click', function() {
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    savePetrolEffRange_('', '');
    renderPetrolLog();
  });
  if (lastMonthBtn) lastMonthBtn.addEventListener('click', function() {
    var base = typeof viewMonth !== 'undefined' && viewMonth ? viewMonth : new Date();
    var lastMonth = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    var y = lastMonth.getFullYear();
    var m = lastMonth.getMonth();
    var first = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    var lastDay = new Date(y, m + 1, 0).getDate();
    var last = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    if (fromEl) fromEl.value = first;
    if (toEl) toEl.value = last;
    savePetrolEffRange_(first, last);
    renderPetrolLog();
  });
}

function syncPetrolEffRangeInputs_() {
  wirePetrolEffRangeUi_();
  var fromEl = document.getElementById('pt-eff-from');
  var toEl = document.getElementById('pt-eff-to');
  if (!fromEl && !toEl) return;
  var bounds = petrolOdoDateBounds_();
  var range = getPetrolEffRange_();
  if (bounds) {
    if (fromEl) {
      fromEl.min = bounds.min;
      fromEl.max = bounds.max;
      if (document.activeElement !== fromEl) fromEl.value = range.from || '';
    }
    if (toEl) {
      toEl.min = bounds.min;
      toEl.max = bounds.max;
      if (document.activeElement !== toEl) toEl.value = range.to || '';
    }
  } else {
    if (fromEl && document.activeElement !== fromEl) fromEl.value = '';
    if (toEl && document.activeElement !== toEl) toEl.value = '';
  }
}

function petrolEffRangeTitle_(summary) {
  if (!summary || !summary.customRange) return 'All-time average';
  if (summary.rangeFrom && summary.rangeTo) return 'Average efficiency';
  if (summary.rangeFrom) return 'Average since ' + petrolFmtRangeDate_(summary.rangeFrom);
  if (summary.rangeTo) return 'Average until ' + petrolFmtRangeDate_(summary.rangeTo);
  return 'Average efficiency';
}

function petrolEffRangeDatesLabel_(summary) {
  if (!summary || !summary.ok) return '';
  if (summary.customRange) {
    var fromLbl = summary.rangeFrom ? petrolFmtRangeDate_(summary.rangeFrom) : 'start';
    var toLbl = summary.rangeTo ? petrolFmtRangeDate_(summary.rangeTo) : 'now';
    return fromLbl + ' \u2013 ' + toLbl;
  }
  return petrolFmtRangeDate_(summary.fromDate) + ' \u2013 ' + petrolFmtRangeDate_(summary.toDate);
}

function petrolFmtRangeDate_(dateStr) {
  if (!dateStr) return '—';
  var pd = typeof parseTxDate === 'function' ? parseTxDate(dateStr) : null;
  return pd
    ? pd.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : String(dateStr);
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
    parts.push(petrolFmtEfficiency((litres / km) * 100));
  }
  if (liveSub) liveSub.textContent = parts.length ? parts.join(' · ') : 'Enter litres and price per litre (or total RM)';

  var odoHint = document.getElementById('pt-odo-hint');
  if (odoHint) {
    odoHint.textContent = last && last.odo
      ? 'Last odometer: ' + last.odo.toLocaleString() + ' km (' + last.date + ')'
      : 'Optional — two readings unlock cost/km, L/100 km, and km/L';
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
      if ((l100 > 20 || l100 < 2) && !confirm('Unusual petrol efficiency (' + petrolFmtEfficiency(l100) + '). Save anyway?')) {
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
  var rangeSummary = petrolEfficiencyRangeSummary_(withOdo);
  var cpk = petrolCostPerKm(withOdo, avgPpl);
  var avgL100 = rangeSummary.ok ? rangeSummary.avgL100 : 0;
  var viewYm = petrolViewYm();
  syncPetrolEffRangeInputs_();

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
  setEl('pt-eff', avgL100 > 0 ? avgL100.toFixed(1) + ' L/100 km' : '—');
  setEl('pt-kml', avgL100 > 0 ? petrolKmPerL(avgL100).toFixed(2) + ' km/L' : '—');
  var effChipNote = document.getElementById('pt-eff-chip-note');
  if (effChipNote) {
    if (rangeSummary.ok) {
      effChipNote.textContent = petrolEffRangeTitle_(rangeSummary) + ' · ' + petrolEffRangeDatesLabel_(rangeSummary);
    } else if (rangeSummary.customRange) {
      effChipNote.textContent = 'No odometer trips in selected date range';
    } else {
      effChipNote.textContent = 'All-time avg (needs 2+ odometer fills)';
    }
  }

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
      if (eff) bits.push(eff.km.toLocaleString() + ' km trip · ' + petrolFmtEfficiency(eff.l100));
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
  syncPetrolEffRangeInputs_();
  var rangeEl = document.getElementById('pt-eff-range-summary');
  var summary = petrolEfficiencyRangeSummary_();
  if (rangeEl) {
    if (!summary.ok) {
      var emptyMsg = summary.customRange
        ? 'No odometer fill-ups fall in this date range. Try widening the range or tap All time.'
        : 'Log odometer on at least two fill-ups to see your average over the full date range.';
      rangeEl.innerHTML =
        '<div class="pt-eff-range pt-eff-range--empty">' +
        '<div class="pt-eff-range__title">' + esc(petrolEffRangeTitle_(summary)) + '</div>' +
        '<p class="ft-note">' + esc(emptyMsg) + '</p></div>';
    } else {
      rangeEl.innerHTML =
        '<div class="pt-eff-range">' +
        '<div class="pt-eff-range__head">' +
        '<div class="pt-eff-range__title">' + esc(petrolEffRangeTitle_(summary)) + '</div>' +
        '<div class="pt-eff-range__dates">' + esc(petrolEffRangeDatesLabel_(summary)) + '</div></div>' +
        '<div class="pt-eff-range__main">' +
        '<strong class="pt-eff-range__value">' + petrolFmtEfficiency(summary.avgL100) + '</strong></div>' +
        '<div class="pt-eff-range__meta">' +
        summary.totalKm.toLocaleString() + ' km tracked \u00b7 ' +
        summary.totalLitres.toFixed(1) + ' L \u00b7 ' +
        summary.trips + ' trip' + (summary.trips === 1 ? '' : 's') + ' \u00b7 ' +
        summary.fills + ' fill-up' + (summary.fills === 1 ? '' : 's') +
        '</div></div>';
    }
  }
  var series = petrolEfficiencyByMonth();
  if (!series.length) {
    el.innerHTML = '<div class="ft-note" style="padding:12px 0">Log odometer on fill-ups to see monthly L/100 km trend.</div>';
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
function reportCashflowTimeline(daysAhead) {
  var now = new Date();
  var end = new Date(now.getTime() + (daysAhead || 30) * 86400000);
  var items = [];
  (recurring || []).forEach(function(r) {
    if (!r || !r.active) return;
    var d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (var i = 0; i < 3; i++) {
      var y = d.getFullYear();
      var m = d.getMonth();
      var ld = new Date(y, m + 1, 0).getDate();
      var fire = r.day === 'last' ? ld : Math.min(Number(r.day) || 1, ld);
      var when = new Date(y, m, fire);
      if (when >= now && when <= end) {
        items.push({ date: when, label: r.name, amount: Number(r.amount) || 0, type: r.type });
      }
      d = new Date(y, m + 1, 1);
    }
  });
  items.sort(function(a, b) { return a.date - b.date; });
  return items;
}

function reportAnomalyRows(ym) {
  var vm = typeof viewMonth !== 'undefined' && viewMonth ? viewMonth : new Date();
  var rows = [];
  Object.keys(EXP_CATS || {}).forEach(function(cat) {
    var cur = expenses.filter(function(e) { return e.cat === cat && String(e.date || '').indexOf(ym) === 0; })
      .reduce(function(a, e) { return a + (Number(e.amount) || 0); }, 0);
    if (cur <= 0) return;
    var hist = [];
    for (var i = 1; i <= 3; i++) {
      var d = new Date(vm.getFullYear(), vm.getMonth() - i, 1);
      var ymPast = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var v = expenses.filter(function(e) { return e.cat === cat && String(e.date || '').indexOf(ymPast) === 0; })
        .reduce(function(a, e) { return a + (Number(e.amount) || 0); }, 0);
      if (v > 0) hist.push(v);
    }
    if (!hist.length) return;
    var avg = hist.reduce(function(a, v) { return a + v; }, 0) / hist.length;
    if (avg <= 0) return;
    var ratio = cur / avg;
    if (ratio >= 1.8) rows.push({ cat: cat, cur: cur, avg: avg, ratio: ratio });
  });
  return rows.sort(function(a, b) { return b.ratio - a.ratio; }).slice(0, 4);
}

function reportPrevMonthYM_() {
  var d = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function reportMonthTotals_(ym) {
  var exp = expenses.filter(function(e) { return String(e.date || '').indexOf(ym) === 0; })
    .reduce(function(a, e) { return a + Number(e.amount || 0); }, 0);
  var inc = incomes.filter(function(i) { return String(i.date || '').indexOf(ym) === 0; })
    .reduce(function(a, i) { return a + Number(i.amount || 0); }, 0);
  return { exp: exp, inc: inc, net: inc - exp };
}

function reportDeltaHint_(cur, prev, higherIsGood) {
  if (prev <= 0) return { text: 'no data last month', cls: '' };
  var pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: 'same as last month', cls: '' };
  var up = cur > prev;
  var good = higherIsGood ? up : !up;
  return {
    text: (up ? '\u2191' : '\u2193') + ' ' + Math.abs(pct) + '% vs last month',
    cls: good ? 'green' : 'red',
  };
}

function reportGroupCategories_(catSorted, topN) {
  topN = topN || 5;
  if (!catSorted.length) return [];
  var top = catSorted.slice(0, topN);
  var rest = catSorted.slice(topN);
  var rows = top.map(function(entry) {
    return { cat: entry[0], amt: entry[1], isOthers: false };
  });
  if (rest.length) {
    var othersAmt = rest.reduce(function(a, e) { return a + e[1]; }, 0);
    rows.push({ cat: 'Others', amt: othersAmt, isOthers: true, count: rest.length });
  }
  return rows;
}

function getReportNotesForMonth_(ym) {
  if (typeof settings === 'undefined' || !settings.reportNotes) return '';
  return String(settings.reportNotes[ym] || '').trim();
}

function saveReportNotesForMonth_(ym, text) {
  if (typeof settings === 'undefined' || typeof saveSets !== 'function') return;
  if (!settings.reportNotes || typeof settings.reportNotes !== 'object') settings.reportNotes = {};
  var trimmed = String(text || '').trim();
  if (!trimmed) delete settings.reportNotes[ym];
  else settings.reportNotes[ym] = trimmed;
  saveSets();
}

function syncReportNotesInput_(ym) {
  var input = document.getElementById('report-notes-input');
  if (!input || document.activeElement === input) return;
  input.value = getReportNotesForMonth_(ym);
}

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
  var prevYm   = reportPrevMonthYM_();
  var prev     = reportMonthTotals_(prevYm);
  syncReportNotesInput_(ym);

  // Category totals
  var catTotals = {};
  me.forEach(function(e) { catTotals[e.cat] = (catTotals[e.cat]||0) + e.amount; });
  var catSorted = Object.entries(catTotals).sort(function(a,b){ return b[1]-a[1]; });
  var catDisplay = reportGroupCategories_(catSorted, 5);

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

  function addRowDelta(sec, label, value, cls, delta) {
    var row = document.createElement('div'); row.className = 'report-row';
    var lb = document.createElement('span'); lb.className = 'rr-label'; lb.textContent = label;
    var right = document.createElement('span'); right.className = 'report-row__right';
    var vl = document.createElement('span'); vl.className = 'rr-val' + (cls ? ' ' + cls : ''); vl.textContent = value;
    right.appendChild(vl);
    if (delta && delta.text) {
      var hint = document.createElement('span'); hint.className = 'report-row__delta' + (delta.cls ? ' ' + delta.cls : '');
      hint.textContent = delta.text;
      right.appendChild(hint);
    }
    row.appendChild(lb); row.appendChild(right); sec.appendChild(row);
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
  addRowDelta(sec1, 'Total income', fmt(totalInc), 'green', reportDeltaHint_(totalInc, prev.inc, true));
  addRowDelta(sec1, 'Total expenses', fmt(totalExp), 'red', reportDeltaHint_(totalExp, prev.exp, false));
  addRow(sec1, 'Savings rate', savings.toFixed(1) + '%');
  var totRow = document.createElement('div'); totRow.className = 'report-total';
  var totLeft = document.createElement('span');
  totLeft.textContent = 'Net';
  var netDelta = reportDeltaHint_(net, prev.net, true);
  if (netDelta.text) {
    var netHint = document.createElement('span');
    netHint.className = 'report-row__delta' + (netDelta.cls ? ' ' + netDelta.cls : '');
    netHint.textContent = netDelta.text;
    totLeft.appendChild(netHint);
  }
  var totVal = document.createElement('span');
  totVal.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  totVal.textContent = (net>=0?'+':'') + fmt(net);
  totRow.appendChild(totLeft); totRow.appendChild(totVal); sec1.appendChild(totRow);

  var missedRec = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
  if (missedRec.length) {
    var secMiss = section('Missed recurring bills');
    missedRec.forEach(function(m) {
      var r = m.r;
      var pd = typeof parseTxDate === 'function' ? parseTxDate(m.dateStr) : null;
      var dlbl = pd ? pd.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : m.dateStr;
      var typeLbl = r.type === 'inc' ? 'Income' : 'Expense';
      addRow(
        secMiss,
        (r.name || 'Recurring') + ' \u00b7 ' + typeLbl + ' \u00b7 due ' + dlbl,
        fmt(Number(r.amount) || 0),
        r.type === 'inc' ? 'green' : 'red'
      );
    });
  }

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

  var cashflow = reportCashflowTimeline(30);
  if (cashflow.length) {
    var secCf = section('Upcoming cashflow (30 days)');
    cashflow.slice(0, 10).forEach(function(x) {
      addRow(
        secCf,
        x.date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) + ' · ' + x.label,
        (x.type === 'inc' ? '+ ' : '') + fmt(x.amount),
        x.type === 'inc' ? 'green' : 'red'
      );
    });
  }
  var anomalies = reportAnomalyRows(ym);
  if (anomalies.length) {
    var secAn = section('Anomaly alerts');
    anomalies.forEach(function(a) {
      var info = EXP_CATS[a.cat] || { icon: '📦' };
      addRow(secAn, info.icon + ' ' + a.cat, fmt(a.cur) + ' (avg ' + fmt(a.avg) + ')', 'red');
    });
  }

  // By category (top 5 + Others)
  if (catDisplay.length) {
    var sec2 = section('Spending by category');
    if (catSorted.length > 5) {
      var note = document.createElement('p');
      note.className = 'ft-note report-cat-note';
      note.textContent = 'Top 5 categories; remaining ' + (catSorted.length - 5) + ' grouped as Others.';
      sec2.appendChild(note);
    }
    catDisplay.forEach(function(entry) {
      var cat = entry.cat;
      var amt = entry.amt;
      var info = entry.isOthers ? { icon: '\u{1F4E6}' } : (EXP_CATS[cat] || { icon: '\u{1F4E6}' });
      var pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) : 0;
      var label = entry.isOthers
        ? info.icon + ' Others (' + entry.count + ' categories)'
        : info.icon + ' ' + cat;
      var row = document.createElement('div'); row.className = 'report-row';
      var lb = document.createElement('span'); lb.className = 'rr-label'; lb.textContent = label;
      var rv = document.createElement('span'); rv.style.display = 'flex'; rv.style.gap = '16px';
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

  var reportNotes = getReportNotesForMonth_(ym);
  if (!reportNotes) {
    var notesInput = document.getElementById('report-notes-input');
    if (notesInput) reportNotes = String(notesInput.value || '').trim();
  }
  if (reportNotes) {
    var secNotes = section('Notes');
    var notesBody = document.createElement('p');
    notesBody.className = 'report-notes-body';
    notesBody.textContent = reportNotes;
    secNotes.appendChild(notesBody);
  }
}

function buildReportShareText() {
  var me = mExp();
  var mi = mInc();
  var ym = viewYM();
  var ymLabel = viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  var totalExp = me.reduce(function(a, e) { return a + e.amount; }, 0);
  var totalInc = mi.reduce(function(a, i) { return a + i.amount; }, 0);
  var net = totalInc - totalExp;
  var prev = reportMonthTotals_(reportPrevMonthYM_());
  var lines = [
    'Finance Tracker · ' + ymLabel,
    'Income: ' + fmt(totalInc) + formatShareDelta_(totalInc, prev.inc),
    'Expenses: ' + fmt(totalExp) + formatShareDelta_(totalExp, prev.exp),
    'Net: ' + (net >= 0 ? '+' : '-') + fmt(Math.abs(net)) + formatShareDelta_(net, prev.net),
  ];
  var missedRec = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
  if (missedRec.length) {
    lines.push('Missed recurring: ' + missedRec.length + ' bill' + (missedRec.length === 1 ? '' : 's'));
    missedRec.slice(0, 3).forEach(function(m) {
      lines.push('  · ' + (m.r.name || 'Bill') + ' ' + fmt(Number(m.r.amount) || 0));
    });
  }
  var notes = getReportNotesForMonth_(ym);
  if (!notes) {
    var notesInput = document.getElementById('report-notes-input');
    if (notesInput) notes = String(notesInput.value || '').trim();
  }
  if (notes) lines.push('Notes: ' + notes);
  return lines.join('\n');
}

function formatShareDelta_(cur, prev) {
  if (prev <= 0) return '';
  var pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return ' (same vs last month)';
  return ' (' + (pct > 0 ? '+' : '') + pct + '% vs last month)';
}

/** Used as document.title so Save-as-PDF picks up month + generation date/time. */
function buildReportPrintTitle() {
  var ymLabel = viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  var now = new Date();
  var datePart = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  var timePart = String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0');
  return 'Finance Tracker - ' + ymLabel + ' Report - ' + datePart + ' ' + timePart;
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
var reportNotesInput = document.getElementById('report-notes-input');
if (reportNotesInput) {
  var reportNotesTimer = null;
  reportNotesInput.addEventListener('input', function() {
    clearTimeout(reportNotesTimer);
    reportNotesTimer = setTimeout(function() {
      if (typeof viewYM === 'function') saveReportNotesForMonth_(viewYM(), reportNotesInput.value);
    }, 400);
  });
  reportNotesInput.addEventListener('blur', function() {
    if (typeof viewYM === 'function') saveReportNotesForMonth_(viewYM(), reportNotesInput.value);
  });
}
var printBtn = document.getElementById('print-report-btn');
if (printBtn) printBtn.addEventListener('click', function() {
  if (typeof renderReport === 'function') renderReport();
  var prevTitle = document.title;
  document.title = buildReportPrintTitle();
  function restoreTitle() {
    document.title = prevTitle;
    window.removeEventListener('afterprint', restoreTitle);
  }
  window.addEventListener('afterprint', restoreTitle);
  window.print();
});
var shareBtn = document.getElementById('share-report-btn');
if (shareBtn) shareBtn.addEventListener('click', function() {
  var text = buildReportShareText();
  var title = buildReportPrintTitle();
  if (navigator.share) {
    navigator.share({ title: title, text: text }).catch(function() {});
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
