'use strict';

// ╔══════════════════════════════════════════════════════════╗
//   STORAGE KEYS
// ╚══════════════════════════════════════════════════════════╝
const KEY_REC      = 'recurring_v1';
const KEY_NWH      = 'networth_history_v1';
const KEY_BUD      = 'budgets_v1';
const KEY_LAST_CAT = 'lastcat_v1';
const KEY_CAT_RULES = 'cat_rules_v1';
const KEY_SAVGOAL  = 'savings_goal_v1';

// ╔══════════════════════════════════════════════════════════╗
//   STATE (shared with app.js via globals)
// ╚══════════════════════════════════════════════════════════╝
var recurring    = [];   // [{id,name,amount,type,cat,day,active,lastApplied}]
var networthHist = [];   // [{date,total}]
var budgets      = {};   // {catName: amount}
var catRules     = {};   // normalized merchant key -> category name
var savingsGoal  = null; // { target, byDate, startDate }
var selectedTrendYm = null;

// ╔══════════════════════════════════════════════════════════╗
//   LOAD
// ╚══════════════════════════════════════════════════════════╝
function loadFeatures() {
  chromeStorage.local.get([KEY_REC, KEY_NWH, KEY_BUD, KEY_LAST_CAT, KEY_CAT_RULES, KEY_SAVGOAL], function(r) {
    recurring    = r[KEY_REC]      || [];
    networthHist = r[KEY_NWH]      || [];
    budgets      = r[KEY_BUD]      || {};
    catRules     = r[KEY_CAT_RULES] || {};
    savingsGoal  = r[KEY_SAVGOAL] || null;

    // Restore last used category
    var lastCat = r[KEY_LAST_CAT];
    if (lastCat && EXP_CATS[lastCat]) {
      selectedCat = lastCat;
      buildCatButtons();
    }

    // Apply recurring entries for this month
    var changed = applyRecurring();
    renderRecurring();
    renderBudgets();
    renderSavingsGoal();
    if (changed) render();
  });
}

function saveRec()  { chromeStorage.local.set({[KEY_REC]:  recurring}); }
function saveNWH()  { chromeStorage.local.set({[KEY_NWH]:  networthHist}); }
function saveBud()  { chromeStorage.local.set({[KEY_BUD]:  budgets}); }
function saveSavGoal() { chromeStorage.local.set({ [KEY_SAVGOAL]: savingsGoal }); }
function saveCatRules() { chromeStorage.local.set({ [KEY_CAT_RULES]: catRules }); }

function normMerchantKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 48);
}

function learnCatRule(name, cat) {
  if (!name || !cat || typeof EXP_CATS === 'undefined' || !EXP_CATS[cat]) return;
  var key = normMerchantKey(name);
  if (key.length < 3) return;
  catRules[key] = cat;
  saveCatRules();
}

function suggestCatForName(name) {
  var n = normMerchantKey(name);
  if (!n) return null;
  if (catRules[n]) return catRules[n];
  var best = null;
  var bestLen = 0;
  Object.keys(catRules).forEach(function(k) {
    if (n.indexOf(k) >= 0 && k.length > bestLen) {
      best = catRules[k];
      bestLen = k.length;
    }
  });
  return best;
}

function applySuggestedCategory(name, opts) {
  opts = opts || {};
  var cat = suggestCatForName(name);
  if (!cat || typeof selectedCat === 'undefined' || cat === selectedCat) return false;
  selectedCat = cat;
  if (typeof buildCatButtons === 'function') buildCatButtons();
  if (!opts.silent && typeof showToast === 'function') {
    showToast('Category: ' + cat);
  }
  return true;
}

// ╔══════════════════════════════════════════════════════════╗
//   REMEMBER LAST CATEGORY
// ╚══════════════════════════════════════════════════════════╝
document.getElementById('cat-btns').addEventListener('click', function(e) {
  var btn = e.target.closest('.cat-btn');
  if (btn && btn.dataset.cat) {
    chromeStorage.local.set({[KEY_LAST_CAT]: btn.dataset.cat});
  }
});

// ╔══════════════════════════════════════════════════════════╗
//   QUICK AMOUNT BUTTONS
// ╚══════════════════════════════════════════════════════════╝
(function buildQuickAmounts() {
  var amtInput = document.getElementById('exp-amount');
  if (!amtInput) return;
  var mount = document.getElementById('exp-quick-amt');
  if (!mount) return;
  mount.innerHTML = '';
  [10, 20, 50, 100, 200].forEach(function(val) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost exp-quick-btn';
    btn.textContent = '+' + val;
    btn.addEventListener('click', function() {
      var cur = parseFloat(amtInput.value) || 0;
      amtInput.value = (cur + val).toFixed(2);
      amtInput.focus();
    });
    mount.appendChild(btn);
  });
})();

// ╔══════════════════════════════════════════════════════════╗
//   MONTH-OVER-MONTH DELTAS
// ╚══════════════════════════════════════════════════════════╝
function renderMoMDeltas() {
  var now    = new Date();
  var curYM  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var prev   = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var prvYM  = prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0');

  var curExp = expenses.filter(function(e){return e.date.startsWith(curYM);}).reduce(function(a,e){return a+e.amount;},0);
  var prvExp = expenses.filter(function(e){return e.date.startsWith(prvYM);}).reduce(function(a,e){return a+e.amount;},0);
  var curInc = incomes.filter(function(e){return e.date.startsWith(curYM);}).reduce(function(a,e){return a+e.amount;},0);
  var prvInc = incomes.filter(function(e){return e.date.startsWith(prvYM);}).reduce(function(a,e){return a+e.amount;},0);

  setDelta('mom-exp', curExp, prvExp, true);
  setDelta('mom-inc', curInc, prvInc, false);
}

function setDelta(id, cur, prv, lowerIsBetter) {
  var el = document.getElementById(id);
  if (!el) return;
  if (!prv) { el.textContent = ''; return; }
  var pct  = Math.round(((cur-prv)/prv)*100);
  var up   = cur >= prv;
  var good = lowerIsBetter ? !up : up;
  el.textContent = (up ? '\u2191' : '\u2193') + ' ' + Math.abs(pct) + '% vs last month';
  el.style.color = good ? 'var(--green)' : 'var(--red)';
}

// ╔══════════════════════════════════════════════════════════╗
//   EXPENSES MONTH SUMMARY CHIPS
// ╚══════════════════════════════════════════════════════════╝
function renderExpMonthSummary() {
  var wrap = document.getElementById('exp-month-summary');
  if (!wrap) return;
  var me = typeof mExp === 'function' ? mExp() : [];
  var mi = typeof mInc === 'function' ? mInc() : [];
  var totalExp = me.reduce(function(a, e) { return a + e.amount; }, 0);
  var totalInc = mi.reduce(function(a, i) { return a + i.amount; }, 0);
  var net = totalInc - totalExp;
  var chips = [];

  var budKeys = Object.keys(budgets || {});
  if (budKeys.length) {
    var limit = 0;
    var spentOnBudgets = 0;
    budKeys.forEach(function(cat) {
      limit += budgets[cat];
      spentOnBudgets += me.filter(function(e) { return e.cat === cat; })
        .reduce(function(a, e) { return a + e.amount; }, 0);
    });
    var left = limit - spentOnBudgets;
    var pct = limit > 0 ? Math.round((spentOnBudgets / limit) * 100) : 0;
    var cls = left < 0 ? 'over' : (pct >= 75 ? 'warn' : 'ok');
    chips.push({
      label: 'Budgets',
      value: left >= 0 ? fmt(left) + ' left (' + pct + '%)' : fmt(Math.abs(left)) + ' over',
      cls: cls,
    });
  }

  if (totalInc > 0 || totalExp > 0) {
    chips.push({
      label: 'Month net',
      value: (net >= 0 ? '+' : '\u2212') + fmt(Math.abs(net)),
      cls: net >= 0 ? 'ok' : 'over',
    });
  }

  if (!chips.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = chips.map(function(c) {
    return (
      '<div class="ft-chip ft-chip--summary ft-chip--summary-' + c.cls + '">' +
      '<span>' + esc(c.label) + '</span><strong>' + esc(c.value) + '</strong></div>'
    );
  }).join('');
}

// ╔══════════════════════════════════════════════════════════╗
//   BUDGET TARGETS
// ╚══════════════════════════════════════════════════════════╝
function renderExpBudgetChips() {
  var wrap = document.getElementById('exp-budget-chips');
  if (!wrap) return;
  var keys = Object.keys(budgets || {});
  if (!keys.length) {
    wrap.innerHTML = '';
    wrap.hidden = true;
    return;
  }
  var catTotals = {};
  var ym = typeof viewYM === 'function' ? viewYM() : '';
  expenses.filter(function(e) {
    return typeof inVM === 'function' ? inVM(e.date) : (ym && String(e.date).indexOf(ym) === 0);
  }).forEach(function(e) {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
  });
  var chips = [];
  keys.forEach(function(cat) {
    var limit = budgets[cat];
    var spent = catTotals[cat] || 0;
    var pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    if (pct < 75) return;
    var over = spent > limit;
    var info = EXP_CATS[cat] || { icon: '📦' };
    var cls = over ? 'ft-budget-chip ft-budget-chip--over' : 'ft-budget-chip ft-budget-chip--warn';
    chips.push(
      '<button type="button" class="' + cls + '" data-bud-cat="' + esc(cat) + '" title="Show ' + esc(cat) + ' transactions">' +
      esc(info.icon + ' ' + cat) + ' ' + pct + '% · ' + fmt(spent) + '/' + fmt(limit) +
      '</button>'
    );
  });
  if (!chips.length) {
    wrap.innerHTML = '';
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = chips.join('');
  wrap.querySelectorAll('[data-bud-cat]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var cat = btn.dataset.budCat;
      if (cat && typeof activeFilter !== 'undefined') {
        activeFilter = cat;
        if (typeof render === 'function') render();
        var listCard = document.getElementById('expense-list');
        if (listCard) {
          var card = listCard.closest('.card') || listCard;
          try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { card.scrollIntoView(); }
        }
        if (typeof showToast === 'function') showToast('Showing ' + cat);
      }
    });
  });
}

function renderBudgets() {
  var el = document.getElementById('budget-panel');
  if (!el) return;

  var ym = typeof viewYM === 'function' ? viewYM() : '';
  var catTotals = {};
  expenses.filter(function(e) {
    return typeof inVM === 'function' ? inVM(e.date) : (ym && String(e.date).indexOf(ym) === 0);
  }).forEach(function(e) {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
  });

  var keys = Object.keys(budgets);
  if (!keys.length) {
    el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="empty-icon">🎯</div>No budgets set. Add limits below.</div>';
    renderExpBudgetChips();
    return;
  }

  el.innerHTML = '';
  el.className = 'ft-budget-list';
  keys.sort().forEach(function(cat) {
    var limit = budgets[cat];
    var spent = catTotals[cat] || 0;
    var pct   = Math.min(Math.round((spent/limit)*100), 100);
    var over  = spent > limit;
    var warn  = pct >= 75 && !over;
    var color = over ? '#E24B4A' : warn ? '#BA7517' : '#1A9E6E';
    var catInfo = EXP_CATS[cat] || {icon:'📦'};

    var row = document.createElement('div');
    row.className = 'ft-budget-item';

    var header = document.createElement('div');
    header.className = 'ft-budget-item__head';
    header.innerHTML =
      '<span style="font-size:18px" aria-hidden="true">' + catInfo.icon + '</span>' +
      '<span class="ft-budget-item__cat">' + esc(cat) + '</span>' +
      '<span class="ft-budget-item__nums">' + fmt(spent) + ' / ' + fmt(limit) + '</span>' +
      '<span class="ft-budget-item__pct" style="color:' + color + '">' + pct + '%</span>' +
      (over ? '<span class="ft-badge ft-badge--over">Over</span>' : '') +
      (warn ? '<span class="ft-badge ft-badge--warn">75%+</span>' : '');

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'assets-icon-btn del';
    delBtn.title = 'Remove budget';
    delBtn.textContent = '\u2715';
    delBtn.dataset.cat = cat;
    delBtn.addEventListener('click', function() {
      delete budgets[delBtn.dataset.cat]; saveBud(); renderBudgets();
    });
    header.appendChild(delBtn);

    var track = document.createElement('div');
    track.className = 'ft-budget-track';
    var fill = document.createElement('div');
    fill.className = 'ft-budget-fill';
    fill.style.width = pct + '%';
    fill.style.background = color;
    track.appendChild(fill);

    row.appendChild(header);
    row.appendChild(track);
    el.appendChild(row);

    // Over-budget toast (once per month per category)
    if (over) {
      var key = 'bud-warned-'+cat;
      if (sessionStorage.getItem(key) !== ym) {
        sessionStorage.setItem(key, ym);
        showToast('Over budget: ' + cat);
      }
    }
  });
  renderExpBudgetChips();
}

function addBudget() {
  var catEl = document.getElementById('bud-cat');
  var amtEl = document.getElementById('bud-amount');
  var cat   = catEl ? catEl.value : '';
  var amt   = parseFloat(amtEl ? amtEl.value : '');
  if (!cat || isNaN(amt) || amt <= 0) { if(amtEl) shake(amtEl); return; }
  budgets[cat] = amt;
  saveBud();
  if (amtEl) amtEl.value = '';
  renderBudgets();
  showToast('Budget set for ' + cat);
}

// ╔══════════════════════════════════════════════════════════╗
//   SAVINGS GOAL
// ╚══════════════════════════════════════════════════════════╝
function savingsProgressSince(startDate) {
  if (!startDate) return 0;
  var inc = 0, exp = 0;
  incomes.forEach(function(i) {
    if (i.date >= startDate) inc += i.amount;
  });
  expenses.forEach(function(e) {
    if (e.date >= startDate) exp += e.amount;
  });
  return Math.max(0, inc - exp);
}

function renderSavingsGoal() {
  var panel = document.getElementById('savings-goal-panel');
  if (!panel) return;
  if (!savingsGoal || !savingsGoal.target) {
    panel.innerHTML = '<p class="ft-note">Set a target amount and date to track how much you have saved (income minus expenses since the goal started).</p>';
    return;
  }
  var saved = savingsProgressSince(savingsGoal.startDate);
  var target = savingsGoal.target;
  var pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  var byD = typeof parseTxDate === 'function' ? parseTxDate(savingsGoal.byDate) : null;
  var daysLeft = byD ? Math.ceil((byD.getTime() - Date.now()) / 86400000) : null;
  var color = saved >= target ? '#1A9E6E' : pct >= 75 ? '#BA7517' : '#7F77DD';
  var dl = daysLeft == null ? '' : (daysLeft < 0 ? ' · past due' : ' · ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left');
  panel.innerHTML =
    '<div class="ft-savings-goal">' +
    '<div class="ft-savings-goal__head"><strong>' + fmt(saved) + '</strong> of ' + fmt(target) + ' (' + pct + '%)' + esc(dl) + '</div>' +
    '<div class="ft-budget-track"><div class="ft-budget-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
    '<div class="ft-note" style="margin-top:8px">Since ' + esc(savingsGoal.startDate) + ' · target by ' + esc(savingsGoal.byDate) + '</div>' +
    '</div>';
}

function saveSavingsGoalFromForm() {
  var tgtEl = document.getElementById('sg-target');
  var dateEl = document.getElementById('sg-date');
  var target = parseFloat(tgtEl ? tgtEl.value : '');
  var byDate = dateEl ? dateEl.value : '';
  if (isNaN(target) || target <= 0) { if (tgtEl) shake(tgtEl); return; }
  if (!byDate) { if (dateEl) shake(dateEl); return; }
  var prevStart = savingsGoal && savingsGoal.startDate;
  savingsGoal = {
    target: target,
    byDate: byDate,
    startDate: prevStart || (typeof todayStr === 'function' ? todayStr() : byDate),
  };
  saveSavGoal();
  if (tgtEl) tgtEl.value = '';
  renderSavingsGoal();
  showToast('Savings goal saved');
}

function clearSavingsGoal() {
  savingsGoal = null;
  saveSavGoal();
  renderSavingsGoal();
  showToast('Savings goal cleared');
}

// ╔══════════════════════════════════════════════════════════╗
//   SEARCH
// ╚══════════════════════════════════════════════════════════╝
var searchQuery = '';

function searchTxStr(v) {
  return String(v == null ? '' : v).toLowerCase();
}

function renderSearch() {
  var el = document.getElementById('search-results');
  if (!el) return;

  var q = searchQuery.trim().toLowerCase();
  if (!q) {
    el.innerHTML = '<div class="empty" style="padding:24px 0"><div class="empty-icon">🔍</div>Type to search all transactions across every month</div>';
    return;
  }

  var allExp = expenses.filter(function(e){ return searchTxStr(e.name).includes(q) || searchTxStr(e.cat).includes(q); });
  var allInc = incomes.filter(function(i){ return searchTxStr(i.name).includes(q) || searchTxStr(i.cat).includes(q); });
  var all = allExp.map(function(e){ return Object.assign({},e,{_type:'exp'}); })
    .concat(allInc.map(function(i){ return Object.assign({},i,{_type:'inc'}); }))
    .sort(function(a,b){ return b.date.localeCompare(a.date) || b.id-a.id; });

  el.innerHTML = '';

  if (!all.length) {
    el.innerHTML = '<div class="empty" style="padding:24px 0"><div class="empty-icon">🔍</div>No results for "' + esc(q) + '"</div>';
    return;
  }

  var totalExp2 = allExp.reduce(function(a,e){return a+e.amount;},0);
  var totalInc2 = allInc.reduce(function(a,i){return a+i.amount;},0);

  var summary = document.createElement('div');
  summary.style.cssText = 'display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap';
  summary.innerHTML =
    '<div class="iw-sc" style="flex:1;min-width:100px"><div class="il">Results</div><div class="iv">' + all.length + '</div></div>' +
    '<div class="iw-sc" style="flex:1;min-width:100px"><div class="il">Expenses</div><div class="iv red">' + fmt(totalExp2) + '</div></div>' +
    '<div class="iw-sc" style="flex:1;min-width:100px"><div class="il">Income</div><div class="iv green">' + fmt(totalInc2) + '</div></div>';
  el.appendChild(summary);

  var list = document.createElement('div');
  list.className = 'tx-list';
  var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');

  all.forEach(function(entry) {
    var catMap = entry._type==='exp' ? EXP_CATS : INC_CATS;
    var cat    = catMap[entry.cat] || catMap['Other'];
    var _pd    = typeof parseTxDate === 'function' ? parseTxDate(entry.date) : null;
    var dlbl   = _pd ? _pd.toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'}) : String(entry.date || '');

    var row = document.createElement('div');
    row.className = 'tx-item';
    row.style.cursor = 'pointer';

    var ico = document.createElement('div');
    ico.className = 'tx-icon';
    ico.style.background = cat.color+'22';
    ico.textContent = cat.icon;
    row.appendChild(ico);

    var info = document.createElement('div');
    info.className = 'tx-info';
    var nm = document.createElement('div');
    nm.className = 'tx-name';
    nm.innerHTML = esc(entry.name != null ? entry.name : '').replace(re, '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>');
    var meta = document.createElement('div');
    meta.className = 'tx-meta';
    meta.textContent = String(entry.cat != null ? entry.cat : '') + ' · ' + dlbl;
    info.appendChild(nm); info.appendChild(meta);
    row.appendChild(info);

    var amt = document.createElement('div');
    amt.className = 'tx-amount ' + (entry._type==='inc' ? 'green' : 'red');
    amt.textContent = (entry._type === 'inc' ? '+ ' : '') + fmt(entry.amount);
    row.appendChild(amt);

    row.addEventListener('click', function() {
      openEditModal(entry._type, entry.id);
    });
    list.appendChild(row);
  });
  el.appendChild(list);
}

// ╔══════════════════════════════════════════════════════════╗
//   RECURRING ENTRIES
// ╚══════════════════════════════════════════════════════════╝
function ordinal(n) {
  var s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function applyRecurring() {
  var now     = new Date();
  var y       = now.getFullYear();
  var m       = now.getMonth();
  var ym      = y+'-'+String(m+1).padStart(2,'0');
  var todayD  = now.getDate();
  var changed = false;

  recurring.forEach(function(r) {
    if (!r.active) return;
    if (r.lastApplied === ym) return;

    var dayVal  = r.day || 1;
    var fireDay;
    if (dayVal === 'last') {
      fireDay = new Date(y, m+1, 0).getDate();
    } else {
      fireDay = Number(dayVal);
      var lastDay = new Date(y, m+1, 0).getDate();
      fireDay = Math.min(fireDay, lastDay);
    }

    if (todayD < fireDay) return;

    var dateStr = ym+'-'+String(fireDay).padStart(2,'0');
    var entry   = { id: Date.now()+Math.random(), name:r.name, amount:r.amount, cat:r.cat, date:dateStr, auto:true };
    if (r.type === 'exp') expenses.push(entry);
    else incomes.push(entry);
    r.lastApplied = ym;
    changed = true;
  });

  if (changed) { saveExp(); saveInc(); saveRec(); }
  return changed;
}

function addRecurring() {
  var nEl    = document.getElementById('rec-name');
  var aEl    = document.getElementById('rec-amount');
  var name   = nEl ? nEl.value.trim() : '';
  var amount = parseFloat(aEl ? aEl.value : '');
  var type   = document.getElementById('rec-type') ? document.getElementById('rec-type').value : 'exp';
  var cat    = document.getElementById('rec-cat')  ? document.getElementById('rec-cat').value  : 'Other';
  var dayRaw = document.getElementById('rec-day')  ? document.getElementById('rec-day').value  : '1';
  var day    = dayRaw === 'last' ? 'last' : Number(dayRaw);

  var ok = true;
  if (!name)                        { if(nEl) shake(nEl); ok = false; }
  if (isNaN(amount) || amount <= 0) { if(aEl) shake(aEl); ok = false; }
  if (!ok) return;

  recurring.push({ id:Date.now(), name, amount, type, cat, day, active:true, lastApplied:null });
  saveRec();
  if (nEl) nEl.value = '';
  if (aEl) aEl.value = '';
  renderRecurring();
  showToast('Recurring entry added');
}

function renderRecurring() {
  var el = document.getElementById('rec-list');
  if (!el) return;
  el.innerHTML = '';

  if (!recurring.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔁</div>No recurring entries yet.</div>';
    return;
  }

  recurring.forEach(function(r) {
    var catMap  = r.type==='exp' ? EXP_CATS : INC_CATS;
    var catInfo = catMap[r.cat] || catMap['Other'];
    var isInc   = r.type === 'inc';
    var dayTxt  = r.day==='last' ? 'last day' : ordinal(r.day||1);

    var item = document.createElement('div');
    item.className = 'rec-item';

    var ico = document.createElement('div');
    ico.className = 'rec-icon';
    ico.style.background = catInfo.color+'22';
    ico.textContent = catInfo.icon;

    var info = document.createElement('div');
    info.className = 'rec-info';
    var nm = document.createElement('div');
    nm.className = 'rec-name';
    nm.textContent = r.name;
    var meta = document.createElement('div');
    meta.className = 'rec-meta';
    meta.innerHTML = esc(r.cat) + ' · ' + (isInc?'Income':'Expense') +
      ' · Every month on the <strong>' + dayTxt + '</strong>' +
      (r.lastApplied ? ' · Last: ' + r.lastApplied : ' · Not yet applied');
    info.appendChild(nm); info.appendChild(meta);

    var amt = document.createElement('div');
    amt.className = 'rec-amount ' + (isInc?'green':'red');
    amt.textContent = (isInc ? '+ ' : '') + fmt(r.amount);

    var badge = document.createElement('span');
    badge.className = 'rec-badge ' + (r.active?'active':'paused');
    badge.textContent = r.active ? 'Active' : 'Paused';

    var actions = document.createElement('div');
    actions.className = 'rec-actions';

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'tx-action-btn';
    toggleBtn.title = r.active ? 'Pause' : 'Resume';
    toggleBtn.textContent = r.active ? '⏸' : '▶';
    (function(rec){ toggleBtn.addEventListener('click', function() {
      rec.active = !rec.active; saveRec(); renderRecurring();
    }); })(r);

    var delBtn = document.createElement('button');
    delBtn.className = 'tx-action-btn del';
    delBtn.title = 'Delete';
    delBtn.textContent = '\u2715';
    (function(rid){ delBtn.addEventListener('click', function() {
      if (confirm('Delete this recurring entry?')) {
        recurring = recurring.filter(function(x){ return x.id !== rid; });
        saveRec(); renderRecurring();
      }
    }); })(r.id);

    actions.appendChild(toggleBtn);
    actions.appendChild(delBtn);

    item.appendChild(ico);
    item.appendChild(info);
    item.appendChild(amt);
    item.appendChild(badge);
    item.appendChild(actions);
    el.appendChild(item);
  });
}

// ╔══════════════════════════════════════════════════════════╗
//   NET WORTH SNAPSHOT
// ╚══════════════════════════════════════════════════════════╝
function snapshotNetWorth() {
  var total = banks.reduce(function(a,b){ return a+b.balance; }, 0);
  var today = todayStr();
  var ex    = networthHist.find(function(h){ return h.date===today; });
  if (ex) ex.total = total;
  else networthHist.push({ date:today, total:total });
  networthHist = networthHist.sort(function(a,b){ return a.date.localeCompare(b.date); }).slice(-365);
  saveNWH();
}

function renderNwSnapshotHint() {
  var el = document.getElementById('nw-snapshot-hint');
  if (!el) return;
  if (!banks.length) {
    el.style.display = 'none';
    return;
  }
  var needMore = networthHist.length < 2;
  var stale = false;
  if (networthHist.length) {
    var last = networthHist[networthHist.length - 1].date;
    var lastD = typeof parseTxDate === 'function' ? parseTxDate(last) : new Date(last + 'T12:00:00');
    if (lastD) {
      var days = (Date.now() - lastD.getTime()) / 86400000;
      stale = days > 30;
    }
  }
  if (!needMore && !stale) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  var autoOn = typeof settings !== 'undefined' && settings.nwAutoSnapshot !== false;
  el.innerHTML =
    (needMore
      ? 'Net worth chart needs at least <strong>two</strong> balance snapshots on different days.'
      : 'Last net worth snapshot was over 30 days ago.') +
    (autoOn
      ? ' Updating any bank balance will record today automatically.'
      : ' Turn on <strong>Auto-snapshot net worth</strong> in Settings, or edit a bank balance to record today.');
}

// ╔══════════════════════════════════════════════════════════╗
//   TRENDS PAGE
// ╚══════════════════════════════════════════════════════════╝
function txInCalendarMonth(dateStr, ym) {
  if (!dateStr || !ym) return false;
  if (typeof parseTxDate === 'function') {
    var d = parseTxDate(dateStr);
    if (d) {
      var got =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0');
      return got === ym;
    }
  }
  return String(dateStr).indexOf(ym) === 0;
}

function renderTrends() {
  var months = [];
  for (var i=5; i>=0; i--) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    var ym  = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    var lbl = d.toLocaleString('default',{month:'short',year:'2-digit'});
    var mE  = expenses.filter(function(e){ return txInCalendarMonth(e.date, ym); }).reduce(function(a,e){ return a+e.amount; },0);
    var mI  = incomes.filter(function(e){  return txInCalendarMonth(e.date, ym); }).reduce(function(a,e){ return a+e.amount; },0);
    months.push({ ym:ym, lbl:lbl, exp:mE, inc:mI, isCurrent:i===0 });
  }

  var maxVal  = Math.max.apply(null, months.map(function(m){ return Math.max(m.exp,m.inc); }).concat([1]));
  var avgExp  = months.reduce(function(a,m){return a+m.exp;},0) / months.length;
  var avgInc  = months.reduce(function(a,m){return a+m.inc;},0) / months.length;
  var bestM   = null, bestNet = -Infinity;
  months.forEach(function(m){ var net=m.inc-m.exp; if(net>bestNet){bestNet=net;bestM=m;} });

  var teEl = document.getElementById('tr-avg-exp'); if(teEl) teEl.textContent = fmt(avgExp);
  var tiEl = document.getElementById('tr-avg-inc'); if(tiEl) tiEl.textContent = fmt(avgInc);
  var tbEl = document.getElementById('tr-best');    if(tbEl) tbEl.textContent = bestM ? bestM.lbl + ' (+'+fmt(bestNet)+')' : '\u2014';

  var trendEl = document.getElementById('trend-chart');
  if (!trendEl) return;

  var legend = document.createElement('div');
  legend.className = 'trend-legend';
  legend.innerHTML =
    '<div class="trend-legend-item"><div class="trend-legend-dot" style="background:#E24B4A"></div>Expenses</div>' +
    '<div class="trend-legend-item"><div class="trend-legend-dot" style="background:#1A9E6E"></div>Income</div>';

  var cols = document.createElement('div');
  cols.className = 'trend-months';

  months.forEach(function(m) {
    var eH = Math.round((m.exp/maxVal)*140);
    var iH = Math.round((m.inc/maxVal)*140);
    var col = document.createElement('div');
    col.className = 'trend-month-col' + (m.isCurrent?' current':'') + (selectedTrendYm===m.ym?' selected':'');
    col.dataset.ym = m.ym;
    col.title = m.lbl + ': Exp ' + fmt(m.exp) + ', Inc ' + fmt(m.inc) + ' — tap for income breakdown';

    var bars = document.createElement('div'); bars.className='trend-bars';
    var eBar = document.createElement('div'); eBar.className='trend-bar';
    eBar.style.cssText = 'height:'+eH+'px;background:#E24B4A;opacity:.85';
    var iBar = document.createElement('div'); iBar.className='trend-bar';
    iBar.style.cssText = 'height:'+iH+'px;background:#1A9E6E;opacity:.85';
    bars.appendChild(eBar); bars.appendChild(iBar);

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:var(--f-xs);text-align:center;margin-top:4px';
    lbl.innerHTML =
      '<div style="font-weight:'+(m.isCurrent?700:400)+';color:'+(m.isCurrent?'var(--ink)':'var(--ink3)')+'">'+m.lbl+'</div>'+
      '<div style="color:var(--red);margin-top:1px">'+(m.exp>0?fmt(m.exp):'\u2014')+'</div>'+
      '<div style="color:var(--green);margin-top:1px">'+(m.inc>0?fmt(m.inc):'\u2014')+'</div>';

    col.appendChild(bars); col.appendChild(lbl);
    col.addEventListener('click', function() {
      selectedTrendYm = col.dataset.ym;
      renderTrendIncBreakdown();
      document.querySelectorAll('.trend-month-col').forEach(function(c) {
        c.classList.toggle('selected', c.dataset.ym === selectedTrendYm);
      });
    });
    cols.appendChild(col);
  });

  trendEl.innerHTML = '';
  trendEl.appendChild(legend);
  trendEl.appendChild(cols);

  renderTrendIncBreakdown();
  renderDayBreakdown();
  renderNwSnapshotHint();
  renderNetWorthChart();
  requestAnimationFrame(function() {
    if (document.getElementById('page-trends') && document.getElementById('page-trends').classList.contains('active')) {
      renderNetWorthChart();
    }
  });
}

function renderTrendIncBreakdown() {
  var card = document.getElementById('trend-inc-breakdown');
  var body = document.getElementById('trend-inc-breakdown-bd');
  if (!card || !body) return;
  if (!selectedTrendYm) {
    card.hidden = true;
    body.innerHTML = '';
    return;
  }
  card.hidden = false;
  var parts = selectedTrendYm.split('-');
  var monthLbl = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
  var rows = incomes.filter(function(i) { return txInCalendarMonth(i.date, selectedTrendYm); });
  var totals = {};
  rows.forEach(function(i) {
    totals[i.cat] = (totals[i.cat] || 0) + i.amount;
  });
  var sorted = Object.keys(totals).map(function(cat) {
    return { cat: cat, amount: totals[cat] };
  }).sort(function(a, b) { return b.amount - a.amount; });
  var total = sorted.reduce(function(a, r) { return a + r.amount; }, 0);
  if (!sorted.length) {
    body.innerHTML = '<p class="ft-note">No income recorded for ' + esc(monthLbl) + '.</p>';
    return;
  }
  var max = sorted[0].amount || 1;
  body.innerHTML = '';
  sorted.forEach(function(r) {
    var info = INC_CATS[r.cat] || { icon: '\uD83D\uDCE6' };
    var pct = Math.round((r.amount / max) * 100);
    var row = document.createElement('div');
    row.className = 'bar-row';
    row.style.cursor = 'default';
    var lbl = document.createElement('div');
    lbl.className = 'bar-label';
    lbl.style.cssText = 'width:auto;min-width:88px';
    lbl.textContent = info.icon + ' ' + r.cat;
    var track = document.createElement('div');
    track.className = 'bar-track';
    var fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.cssText = 'width:' + pct + '%;background:#1A9E6E';
    track.appendChild(fill);
    var val = document.createElement('div');
    val.className = 'bar-val';
    val.textContent = fmt(r.amount);
    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(val);
    body.appendChild(row);
  });
  var foot = document.createElement('p');
  foot.className = 'ft-note';
  foot.style.marginTop = '10px';
  foot.textContent = 'Total income: ' + fmt(total);
  body.appendChild(foot);
}

function openTrendMonthInExpenses() {
  if (!selectedTrendYm) return;
  var parts = selectedTrendYm.split('-');
  viewMonth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
  if (typeof activateNavTab === 'function') activateNavTab('expenses');
  else {
    document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var tab = document.querySelector('[data-tab="expenses"]');
    if (tab) tab.classList.add('active');
    var page = document.getElementById('page-expenses');
    if (page) page.classList.add('active');
  }
  render();
}

function renderNetWorthChart() {
  var el = document.getElementById('networth-chart');
  if (!el) return;

  if (networthHist.length < 2) {
    el.innerHTML = '<div class="nw-empty">Update your bank balances over time to build a net worth history chart.</div>';
    return;
  }

  var W   = el.clientWidth || 600;
  var H   = 160;
  var PAD = {t:10, r:20, b:30, l:72};
  var cW  = W-PAD.l-PAD.r, cH = H-PAD.t-PAD.b;
  var vals = networthHist.map(function(h){ return h.total; });
  var minV = Math.min.apply(null, vals);
  var maxV = Math.max.apply(null, vals);
  var rng  = maxV-minV || 1;
  var n    = networthHist.length;
  var xOf  = function(i){ return PAD.l+(i/(n-1))*cW; };
  var yOf  = function(v){ return PAD.t+cH-((v-minV)/rng)*cH; };
  var pts  = networthHist.map(function(h,i){ return xOf(i)+','+yOf(h.total); });
  var path = 'M '+pts.join(' L ');
  var area = 'M '+xOf(0)+','+(PAD.t+cH)+' L '+pts.join(' L ')+' L '+xOf(n-1)+','+(PAD.t+cH)+' Z';
  var trending = vals[vals.length-1] >= vals[0];
  var lc = trending ? '#1A9E6E' : '#E24B4A';
  var yMid = (minV+maxV)/2;
  var yLbls = [{v:maxV,y:yOf(maxV)},{v:yMid,y:yOf(yMid)},{v:minV,y:yOf(minV)}];
  var xIdxs = [0, Math.floor((n-1)/2), n-1].filter(function(v,i,a){ return a.indexOf(v)===i; });
  var xLbls = xIdxs.map(function(i){ return {lbl:networthHist[i].date.slice(0,7), x:xOf(i)}; });

  var circles = networthHist.map(function(h,i){
    return '<circle cx="'+xOf(i)+'" cy="'+yOf(h.total)+'" r="3.5" fill="'+lc+'" stroke="white" stroke-width="1.5"><title>'+h.date+': '+fmt(h.total)+'</title></circle>';
  }).join('');

  el.innerHTML = '<div class="nw-chart-wrap"><svg class="nw-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">' +
    '<defs><linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="'+lc+'" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="'+lc+'" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<path d="'+area+'" fill="url(#nw-grad)"/>' +
    '<path d="'+path+'" fill="none" stroke="'+lc+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    yLbls.map(function(l){ return '<text class="nw-axis-lbl" x="'+(PAD.l-6)+'" y="'+(l.y+3)+'" text-anchor="end">'+fmt(l.v)+'</text>'; }).join('') +
    xLbls.map(function(l){ return '<text class="nw-axis-lbl" x="'+l.x+'" y="'+(H-4)+'" text-anchor="middle">'+l.lbl+'</text>'; }).join('') +
    circles + '</svg></div>';
}

function renderDayBreakdown() {
  var el = document.getElementById('day-breakdown');
  if (!el) return;
  var days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var totals = [0,0,0,0,0,0,0];
  var counts = [0,0,0,0,0,0,0];
  var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-3);
  var cutStr = cutoff.getFullYear()+'-'+String(cutoff.getMonth()+1).padStart(2,'0')+'-'+String(cutoff.getDate()).padStart(2,'0');
  expenses.filter(function(e){ return e.date >= cutStr; }).forEach(function(e) {
    var pd = typeof parseTxDate === 'function' ? parseTxDate(e.date) : null;
    if (!pd) return;
    var dow = pd.getDay();
    totals[dow] += e.amount; counts[dow]++;
  });
  var avgs   = totals.map(function(t,i){ return counts[i] ? t/counts[i] : 0; });
  var maxAvg = Math.max.apply(null, avgs.concat([1]));
  el.innerHTML = '';
  days.forEach(function(day, i) {
    var pct = Math.round((avgs[i]/maxAvg)*100);
    var row = document.createElement('div'); row.className='bar-row'; row.style.cursor='default';
    var lbl = document.createElement('div'); lbl.className='bar-label'; lbl.style.width='36px'; lbl.textContent=day;
    var track = document.createElement('div'); track.className='bar-track';
    var fill  = document.createElement('div'); fill.className='bar-fill';
    fill.style.cssText = 'width:'+pct+'%;background:#7F77DD';
    track.appendChild(fill);
    var val = document.createElement('div'); val.className='bar-value'; val.style.width='100px';
    val.textContent = avgs[i]>0 ? fmt(avgs[i])+' avg' : '\u2014';
    row.appendChild(lbl); row.appendChild(track); row.appendChild(val);
    el.appendChild(row);
  });
}

// ╔══════════════════════════════════════════════════════════╗
//   DUPLICATE DETECTION (called from import-inline.js)
// ╚══════════════════════════════════════════════════════════╝
function deduplicateImportRows(rows) {
  var expKeys = new Set(expenses.map(function(e){ return e.date+'|'+e.amount+'|'+e.name.toLowerCase().slice(0,20); }));
  var incKeys = new Set(incomes.map(function(e){  return e.date+'|'+e.amount+'|'+e.name.toLowerCase().slice(0,20); }));
  var dupes = 0;
  rows.forEach(function(r) {
    var key   = r.date+'|'+r.amount+'|'+r.desc.toLowerCase().slice(0,20);
    var isDupe= r.type==='exp' ? expKeys.has(key) : incKeys.has(key);
    if (isDupe) { r.skip=true; r._dupe=true; dupes++; }
  });
  return dupes;
}

// ╔══════════════════════════════════════════════════════════╗
//   WIRING
// ╚══════════════════════════════════════════════════════════╝

// Budget
var addBudBtn = document.getElementById('add-bud-btn');
if (addBudBtn) addBudBtn.addEventListener('click', addBudget);
var budAmtEl = document.getElementById('bud-amount');
if (budAmtEl) budAmtEl.addEventListener('keydown', function(e){ if(e.key==='Enter') addBudget(); });

var sgSaveBtn = document.getElementById('sg-save-btn');
if (sgSaveBtn) sgSaveBtn.addEventListener('click', saveSavingsGoalFromForm);
var sgClearBtn = document.getElementById('sg-clear-btn');
if (sgClearBtn) sgClearBtn.addEventListener('click', clearSavingsGoal);
var trendExpBtn = document.getElementById('trend-open-expenses');
if (trendExpBtn) trendExpBtn.addEventListener('click', openTrendMonthInExpenses);

// Recurring
var addRecBtn = document.getElementById('add-rec-btn');
if (addRecBtn) addRecBtn.addEventListener('click', addRecurring);
['rec-name','rec-amount'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('keydown', function(e){ if(e.key==='Enter') addRecurring(); });
});

// Search (icon + top sheet on Expenses; same #search-input / #search-results)
function expSearchPop() { return document.getElementById('exp-search-pop'); }
function expSearchToggle() { return document.getElementById('exp-search-toggle'); }

function setExpSearchOpen(open) {
  var pop = expSearchPop();
  var tgl = expSearchToggle();
  if (!pop) return;
  if (!open) {
    var ae = document.activeElement;
    if (ae && pop.contains(ae)) {
      if (tgl) tgl.focus();
      else try { ae.blur(); } catch (err) {}
    }
  }
  pop.classList.toggle('open', !!open);
  pop.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (tgl) tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeExpSearch() {
  setExpSearchOpen(false);
}

function openExpSearch(opts) {
  opts = opts || {};
  setExpSearchOpen(true);
  var si = document.getElementById('search-input');
  if (!si) {
    if (typeof renderSearch === 'function') renderSearch();
    return;
  }
  setTimeout(function() {
    var popAfter = expSearchPop();
    if (!popAfter || !popAfter.classList.contains('open')) return;
    try {
      si.focus();
      if (opts.selectAll) si.select();
    } catch (err) {
      try { si.focus(); } catch (e2) {}
    }
    if (typeof renderSearch === 'function') renderSearch();
  }, opts.delay != null ? opts.delay : 50);
}

var searchInput = document.getElementById('search-input');
if (searchInput) searchInput.addEventListener('input', function(e) {
  searchQuery = e.target.value;
  renderSearch();
});

var expSearchTgl = document.getElementById('exp-search-toggle');
if (expSearchTgl) {
  expSearchTgl.addEventListener('click', function() {
    var pop = expSearchPop();
    if (pop && pop.classList.contains('open')) closeExpSearch();
    else openExpSearch();
  });
}
var expSearchBd = document.getElementById('exp-search-backdrop');
if (expSearchBd) expSearchBd.addEventListener('click', closeExpSearch);
var expSearchCls = document.getElementById('exp-search-close');
if (expSearchCls) expSearchCls.addEventListener('click', closeExpSearch);

// Keyboard shortcut: Ctrl+F opens global search on Expenses
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    var si = document.getElementById('search-input');
    if (si) {
      e.preventDefault();
      if (typeof activateNavTab === 'function') activateNavTab('expenses');
      else {
        document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
        var expTab = document.querySelector('[data-tab="expenses"]');
        var expPage = document.getElementById('page-expenses');
        if (expTab) expTab.classList.add('active');
        if (expPage) expPage.classList.add('active');
      }
      openExpSearch({ selectAll: true, delay: 60 });
    }
  }
  if (e.key === 'Escape') {
    var esp = expSearchPop();
    if (esp && esp.classList.contains('open')) {
      e.preventDefault();
      closeExpSearch();
      return;
    }
    var eo = document.getElementById('edit-overlay');
    if (eo) eo.classList.remove('open');
    var co = document.getElementById('cat-detail-overlay');
    if (co) co.classList.remove('open');
  }
});

// ╔══════════════════════════════════════════════════════════╗
//   INIT  Ecalled after DOM ready
// ╚══════════════════════════════════════════════════════════╝
loadFeatures();
