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
const KEY_BUD_ROLL = 'budget_rollover_v1';

// ╔══════════════════════════════════════════════════════════╗
//   STATE (shared with app.js via globals)
// ╚══════════════════════════════════════════════════════════╝
var recurring    = [];   // [{id,name,amount,type,cat,day,active,lastApplied}]
var networthHist = [];   // [{date,total}]
var budgets      = {};   // {catName: amount}
var budgetRollover = {}; // {catName: true|false}
var catRules     = {};   // normalized merchant key -> category name
var savingsGoal  = null; // { target, byDate, startDate }
var selectedTrendYm = null;

// ╔══════════════════════════════════════════════════════════╗
//   LOAD
// ╚══════════════════════════════════════════════════════════╝
function loadFeatures() {
  if (typeof window !== 'undefined' && window.__ftForceSheetSource) {
    recurring = [];
    networthHist = [];
    budgets = {};
    catRules = {};
    savingsGoal = null;
    renderRecurring();
    renderBudgets();
    renderSavingsGoal();
    return;
  }
  var gen = typeof _storageReadGen !== 'undefined' ? _storageReadGen : 0;
  chromeStorage.local.get([KEY_REC, KEY_NWH, KEY_BUD, KEY_LAST_CAT, KEY_CAT_RULES, KEY_SAVGOAL, KEY_BUD_ROLL], function(r) {
    if (typeof _storageReadGen !== 'undefined' && gen !== _storageReadGen) return;
    recurring    = r[KEY_REC]      || [];
    networthHist = r[KEY_NWH]      || [];
    budgets      = r[KEY_BUD]      || {};
    budgetRollover = r[KEY_BUD_ROLL] || {};
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
    maybeNotifyUpcomingRecurring_();
    if (changed) render();
  });
}

function saveRec()  { chromeStorage.local.set({[KEY_REC]:  recurring}); }
function saveNWH()  { chromeStorage.local.set({[KEY_NWH]:  networthHist}); }
function saveBud()  { chromeStorage.local.set({[KEY_BUD]:  budgets}); }
function saveBudRoll() { chromeStorage.local.set({ [KEY_BUD_ROLL]: budgetRollover }); }
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
      var cur = moneyCentsFromInput(amtInput);
      moneySetCents(amtInput, cur + val * 100);
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
  renderMonthChecklist(totalExp, totalInc);
}

function renderMonthChecklist(totalExp, totalInc) {
  var box = document.getElementById('today-widget');
  if (!box) return;
  var ym = typeof viewYM === 'function' ? viewYM() : '';
  var last = ym ? new Date(ym + '-01T12:00:00') : new Date();
  last = new Date(last.getFullYear(), last.getMonth() + 1, 0);
  var now = new Date();
  var nearEnd = now.getFullYear() === last.getFullYear() && now.getMonth() === last.getMonth() && (last.getDate() - now.getDate()) <= 5;
  var net = totalInc - totalExp;
  box.hidden = false;
  box.innerHTML =
    '<div class="panel-hd"><span class="panel-title">Today + month-end checklist</span></div>' +
    '<div class="panel-bd">' +
    '<div class="ft-note" style="margin-bottom:8px">Today: ' + fmt(expenses.filter(function(e){ return e.date === todayStr(); }).reduce(function(a, e){ return a + e.amount; }, 0)) +
    ' spent · ' + fmt(incomes.filter(function(i){ return i.date === todayStr(); }).reduce(function(a, i){ return a + i.amount; }, 0)) + ' income · Net ' + fmt(net) + '</div>' +
    '<div class="ft-note">Checklist: ' + (nearEnd ? 'End of month near — export backup, snapshot net worth, then share monthly report.' : 'Keep month tidy — export backup weekly and snapshot net worth after major changes.') + '</div>' +
    '</div>';
}

function homeNavTab_(tab) {
  if (typeof activateNavTab === 'function') activateNavTab(tab);
}

function listOverBudgetCats_() {
  var results = [];
  if (typeof budgets === 'undefined') return results;
  var me = typeof mExp === 'function' ? mExp() : [];
  var catTotals = {};
  me.forEach(function(e) { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
  Object.keys(budgets || {}).forEach(function(cat) {
    var baseLimit = Number(budgets[cat]) || 0;
    var limit = baseLimit + budgetCarryFromPrevMonth(cat, baseLimit);
    var spent = catTotals[cat] || 0;
    if (limit > 0 && spent > limit) {
      results.push({ cat: cat, spent: spent, limit: limit, over: spent - limit });
    }
  });
  return results.sort(function(a, b) { return b.over - a.over; });
}

function renderHomeBudgetAlert_() {
  var el = document.getElementById('home-budget-alert');
  if (!el) return;
  var over = listOverBudgetCats_();
  if (!over.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  var top = over[0];
  var more = over.length > 1 ? ' (+ ' + (over.length - 1) + ' more)' : '';
  el.hidden = false;
  el.innerHTML =
    '<div class="ft-budget-alert__text"><strong>' + esc(top.cat) + '</strong> is over budget by ' +
    fmt(top.over) + more + '</div>' +
    '<button type="button" class="ft-budget-alert__btn" data-bud-cat="' + esc(top.cat) + '">View</button>';
  var btn = el.querySelector('[data-bud-cat]');
  if (btn) {
    btn.addEventListener('click', function() {
      if (typeof activateNavTab === 'function') activateNavTab('expenses');
      if (typeof activeFilter !== 'undefined') activeFilter = btn.getAttribute('data-bud-cat');
      if (typeof render === 'function') render();
    });
  }
}

function renderHomeOnboarding_() {
  var card = document.getElementById('home-onboarding');
  if (!card) return;
  var dismissed = false;
  try { dismissed = localStorage.getItem('ft-onboarding-dismissed-v1') === '1'; } catch (e) {}
  var empty = (!expenses || !expenses.length) && (!incomes || !incomes.length);
  card.hidden = dismissed || !empty;
}

function homePanel_(title, bodyHtml) {
  return (
    '<div class="panel-hd"><span class="panel-title">' + esc(title) + '</span></div>' +
    '<div class="panel-bd">' + bodyHtml + '</div>'
  );
}

function homeEmpty_(iconId, msg, opts) {
  opts = opts || {};
  var ico = typeof ftIconHtml_ === 'function' ? ftIconHtml_(iconId, 'ft-empty-state__svg') : '';
  var html = '<div class="ft-empty-state home-empty"><div class="ft-empty-state__ico">' + ico + '</div>';
  html += '<p class="ft-empty-state__msg">' + esc(msg) + '</p>';
  if (opts.ctaTab) {
    html += '<button type="button" class="btn btn-primary ft-empty-state__cta" data-goto-tab="' + esc(opts.ctaTab) + '">' + esc(opts.ctaLabel || 'Get started') + '</button>';
  }
  return html + '</div>';
}

function homeDateOffsetStr_(days) {
  var d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function homeSumExpBetween_(fromStr, toStr) {
  return expenses.filter(function(e) {
    var d = String(e.date || '').slice(0, 10);
    return d >= fromStr && d <= toStr;
  }).reduce(function(a, e) { return a + Number(e.amount || 0); }, 0);
}

function renderHomeWeekDigest_() {
  var heroWeek = document.getElementById('home-hero-week');
  var standCard = document.getElementById('home-week-digest');
  var el = heroWeek || standCard;
  if (!el) return;
  if (standCard) standCard.hidden = true;
  if (heroWeek) {
    heroWeek.hidden = false;
  }
  var today = todayStr();
  var weekStart = homeDateOffsetStr_(-6);
  var prevEnd = homeDateOffsetStr_(-7);
  var prevStart = homeDateOffsetStr_(-13);
  var thisWeek = homeSumExpBetween_(weekStart, today);
  var lastWeek = homeSumExpBetween_(prevStart, prevEnd);
  var delta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  var byCat = {};
  expenses.forEach(function(e) {
    var d = String(e.date || '').slice(0, 10);
    if (d < weekStart || d > today) return;
    byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.amount || 0);
  });
  var topCat = Object.keys(byCat).sort(function(a, b) { return byCat[b] - byCat[a]; })[0];
  var missed = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
  var rows = [
    '<div class="home-week-digest__row"><span>This week spent</span><strong class="red">' + fmt(thisWeek) + '</strong></div>',
    '<div class="home-week-digest__row"><span>Last week</span><strong>' + fmt(lastWeek) + '</strong></div>',
  ];
  if (delta != null) {
    rows.push(
      '<div class="home-week-digest__row"><span>Week-over-week</span><strong class="' +
      (delta >= 0 ? 'red' : 'green') + '">' + (delta >= 0 ? '+' : '') + delta + '%</strong></div>'
    );
  }
  if (topCat) {
    var topBadge = typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(topCat, EXP_CATS, 'ft-cat-badge--sm') : '';
    rows.push(
      '<div class="home-week-digest__row"><span>Top category</span><strong>' +
      topBadge + ' ' + esc(topCat) + ' · ' + fmt(byCat[topCat]) + '</strong></div>'
    );
  }
  if (missed.length) {
    rows.push(
      '<div class="home-week-digest__row home-week-digest__row--warn"><span>Missed bills</span><strong class="red">' +
      missed.length + ' due</strong></div>'
    );
  }
  if (heroWeek) {
    el.innerHTML =
      '<div class="home-hero-week__title">This week</div>' +
      '<div class="home-hero-week__grid home-week-digest">' + rows.join('') + '</div>';
    return;
  }
  el.innerHTML =
    '<div class="panel-hd"><span class="panel-title">This week</span></div>' +
    '<div class="panel-bd home-week-digest">' + rows.join('') + '</div>';
}

function anomalyInsightLines_(ym, vm) {
  var lines = [];
  Object.keys(EXP_CATS || {}).forEach(function(cat) {
    var cur = expenses.filter(function(e) { return e.cat === cat && String(e.date || '').indexOf(ym) === 0; })
      .reduce(function(a, e) { return a + (Number(e.amount) || 0); }, 0);
    if (cur <= 0) return;
    var hist = [];
    for (var i = 1; i <= 3; i++) {
      var d = new Date(vm.getFullYear(), vm.getMonth() - i, 1);
      var ymPast = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var past = expenses.filter(function(e) { return e.cat === cat && String(e.date || '').indexOf(ymPast) === 0; })
        .reduce(function(a, e) { return a + (Number(e.amount) || 0); }, 0);
      if (past > 0) hist.push(past);
    }
    if (!hist.length) return;
    var avg = hist.reduce(function(a, v) { return a + v; }, 0) / hist.length;
    if (avg <= 0) return;
    var ratio = cur / avg;
    if (ratio >= 1.8) {
      var badge = typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(cat, EXP_CATS, 'ft-cat-badge--sm') : '';
      lines.push({
        icon: 'chart',
        label: 'Unusual spending',
        value: badge + ' ' + esc(cat) + ' +' + Math.round((ratio - 1) * 100) + '%',
        valueIsHtml: true,
        note: 'Vs your 3-month average'
      });
    }
  });
  return lines.slice(0, 2);
}

function renderHomeDashboard() {
  renderHomeOnboarding_();
  renderHomeBudgetAlert_();
  if (typeof syncMonthChip_ === 'function') syncMonthChip_();

  var today = todayStr();
  var td = new Date();
  var me = typeof mExp === 'function' ? mExp() : [];
  var mi = typeof mInc === 'function' ? mInc() : [];
  var monthExp = me.reduce(function(a, e) { return a + e.amount; }, 0);
  var monthInc = mi.reduce(function(a, i) { return a + i.amount; }, 0);
  var monthNet = monthInc - monthExp;
  var todayExp = expenses.filter(function(e) { return e.date === today; }).reduce(function(a, e) { return a + e.amount; }, 0);
  var todayInc = incomes.filter(function(i) { return i.date === today; }).reduce(function(a, i) { return a + i.amount; }, 0);
  var todayNet = todayInc - todayExp;

  var vm = typeof viewMonth !== 'undefined' && viewMonth ? viewMonth : new Date();
  vm = new Date(vm.getFullYear(), vm.getMonth(), 1);
  var monthLbl = vm.toLocaleString('default', { month: 'long', year: 'numeric' });
  var lastDay = new Date(vm.getFullYear(), vm.getMonth() + 1, 0).getDate();
  var isCurrentVm = td.getFullYear() === vm.getFullYear() && td.getMonth() === vm.getMonth();
  var dayOfMonth = isCurrentVm ? td.getDate() : lastDay;
  var daysLeft = isCurrentVm ? Math.max(0, lastDay - td.getDate()) : 0;
  var monthPct = Math.round((dayOfMonth / lastDay) * 100);

  var dateLbl = document.getElementById('home-date-label');
  if (dateLbl) {
    dateLbl.textContent = td.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  var monthEl = document.getElementById('home-month-label');
  if (monthEl) monthEl.textContent = monthLbl;
  var daysEl = document.getElementById('home-days-left');
  if (daysEl) {
    daysEl.textContent = isCurrentVm
      ? (daysLeft === 0 ? 'Last day of month' : daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left')
      : 'Viewing past month';
  }
  var headerSub = document.getElementById('home-header-sub');
  if (headerSub) {
    if (isCurrentVm) {
      headerSub.textContent = 'Snapshot for ' + monthLbl + '.';
    } else {
      var hint = typeof ftMonthChangeHint_ === 'function' ? ftMonthChangeHint_() : ' \u2014 use sidebar arrows to change month';
      headerSub.textContent = 'Snapshot for ' + monthLbl + hint;
    }
  }

  var netEl = document.getElementById('home-month-net');
  if (netEl) {
    if (document.body.classList.contains('ft-sync-loading')) {
      netEl.className = 'home-hero-card__value ft-skeleton';
      netEl.textContent = '\u00a0';
    } else {
      netEl.textContent = (monthNet >= 0 ? '+' : '\u2212') + fmt(Math.abs(monthNet));
      netEl.className = 'home-hero-card__value ' + (monthNet >= 0 ? 'green' : 'red');
    }
  }
  var subEl = document.getElementById('home-month-sub');
  if (subEl) {
    var pace = dayOfMonth > 0 ? (monthExp / dayOfMonth) * lastDay : monthExp;
    subEl.textContent =
      'Income ' + fmt(monthInc) + ' \u00b7 Spend ' + fmt(monthExp) +
      (isCurrentVm && dayOfMonth > 0 ? ' \u00b7 Pace ~' + fmt(pace) + '/mo' : '');
  }

  var bankTotal = typeof totalBanksBase === 'function'
    ? totalBanksBase()
    : banks.reduce(function(a, b) { return a + (Number(b.balance) || 0); }, 0);
  var utMv = typeof computeUtTotalMarketValue === 'function' ? computeUtTotalMarketValue() : 0;
  var assetsTotal = bankTotal + (utMv > 0 ? utMv : 0);

  var prevD = new Date(vm.getFullYear(), vm.getMonth() - 1, 1);
  var prvYM = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0');
  var curYM = vm.getFullYear() + '-' + String(vm.getMonth() + 1).padStart(2, '0');
  var prvExp = expenses.filter(function(e) { return String(e.date).indexOf(prvYM) === 0; }).reduce(function(a, e) { return a + e.amount; }, 0);
  var prvInc = incomes.filter(function(i) { return String(i.date).indexOf(prvYM) === 0; }).reduce(function(a, i) { return a + i.amount; }, 0);

  var statGrid = document.getElementById('home-stat-grid');
  if (statGrid) {
    function statTile(lbl, val, mod, hint) {
      return (
        '<div class="home-stat home-stat--' + mod + '">' +
        '<div class="home-stat__lbl">' + esc(lbl) + '</div>' +
        '<div class="home-stat__val">' + esc(val) + '</div>' +
        (hint ? '<div class="home-stat__hint">' + esc(hint) + '</div>' : '') +
        '</div>'
      );
    }
    var expHint = prvExp > 0 ? (monthExp >= prvExp ? '\u2191' : '\u2193') + ' vs last mo' : me.length + ' txns';
    var incHint = prvInc > 0 ? (monthInc >= prvInc ? '\u2191' : '\u2193') + ' vs last mo' : mi.length + ' txns';
    statGrid.innerHTML =
      statTile('Today spent', fmt(todayExp), 'spend', todayExp > 0 ? 'Net today ' + fmt(todayNet) : 'No spend yet') +
      statTile('Today income', fmt(todayInc), 'income', todayInc > 0 ? '' : 'No income yet') +
      statTile('Month spend', fmt(monthExp), 'month', expHint) +
      statTile('Assets', fmt(assetsTotal), 'assets', banks.length + ' bank' + (banks.length === 1 ? '' : 's') + (utMv > 0 ? ' + funds' : ''));
    if (document.body.classList.contains('ft-sync-loading')) {
      statGrid.querySelectorAll('.home-stat__val').forEach(function(el) { el.classList.add('ft-skeleton'); });
    }
  }

  var qa = document.getElementById('home-quick-actions');
  if (qa) {
    var iconMap = { expenses: 'expenses', income: 'income', assets: 'assets', report: 'report' };
    var actions = [
      { tab: 'expenses', lbl: 'Expense' },
      { tab: 'income', lbl: 'Income' },
      { tab: 'assets', lbl: 'Assets' },
      { tab: 'report', lbl: 'Report' },
    ];
    qa.innerHTML = actions.map(function(a) {
      var ico = typeof ftIconHtml_ === 'function'
        ? ftIconHtml_(iconMap[a.tab], 'home-quick-btn__svg')
        : '';
      return '<button type="button" class="home-quick-btn" data-home-tab="' + a.tab + '">' +
        '<span class="home-quick-btn__ico" aria-hidden="true">' + ico + '</span>' + esc(a.lbl) + '</button>';
    }).join('');
    qa.querySelectorAll('[data-home-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() { homeNavTab_(btn.getAttribute('data-home-tab')); });
    });
  }

  renderHomeRecentMerchants_();

  var prog = document.getElementById('home-month-progress');
  var heroProg = document.getElementById('home-hero-progress');
  var progressHtml =
    '<div class="home-progress-card__head">' +
    '<span>Month progress</span><span>Day ' + dayOfMonth + ' / ' + lastDay + '</span></div>' +
    '<div class="home-progress-track"><div class="home-progress-fill" style="width:' + monthPct + '%"></div></div>' +
    '<div class="home-progress-note">' +
    (isCurrentVm
      ? monthPct + '% through the month · ' + me.length + ' expenses, ' + mi.length + ' income entries'
      : 'Historical view — ' + me.length + ' expenses, ' + mi.length + ' income in ' + monthLbl) +
    '</div>';
  if (heroProg) {
    heroProg.innerHTML = progressHtml;
  }
  if (prog) {
    prog.hidden = true;
    prog.innerHTML = '';
  }

  var recentEl = document.getElementById('home-recent');
  if (recentEl) {
    var merged = []
      .concat(expenses.map(function(e) { return Object.assign({ _type: 'exp' }, e); }))
      .concat(incomes.map(function(i) { return Object.assign({ _type: 'inc' }, i); }));
    merged.sort(function(a, b) {
      return String(b.date).localeCompare(String(a.date)) || (Number(b.id) - Number(a.id));
    });
    var recent = merged.slice(0, 6);
    if (!recent.length) {
      recentEl.innerHTML = homePanel_('Recent activity', homeEmpty_('clipboard', 'No transactions yet.', { ctaTab: 'expenses', ctaLabel: 'Add expense' }));
    } else {
      recentEl.innerHTML = homePanel_('Recent activity', '<div class="home-recent-list"></div><p class="ft-note home-recent-hint">Tap a row to edit</p>');
      var listEl = recentEl.querySelector('.home-recent-list');
      recent.forEach(function(e) {
        var catMap = e._type === 'inc' ? INC_CATS : EXP_CATS;
        var info = catMap[e.cat] || { icon: '\u{1F4E6}' };
        var pd = typeof parseTxDate === 'function' ? parseTxDate(e.date) : null;
        var dlbl = pd ? pd.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : String(e.date || '');
        var row = document.createElement('div');
        row.className = 'home-tx-row home-tx-row--clickable';
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.innerHTML =
          '<div class="home-tx-row__ico">' +
          (typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(e.cat, catMap, 'ft-cat-badge--row') : '') +
          '</div>' +
          '<div class="home-tx-row__body">' +
          '<div class="home-tx-row__name">' + esc(e.name || '') + '</div>' +
          '<div class="home-tx-row__meta">' +
          (e._type === 'exp' && e.place ? esc(e.place) + ' \u00b7 ' : '') +
          esc(e.cat || '') + ' \u00b7 ' + dlbl + '</div></div>' +
          '<div class="home-tx-row__amt ' + (e._type === 'inc' ? 'green' : 'red') + '">' +
          (e._type === 'inc' ? '+ ' : '') + fmt(e.amount) + '</div>';
        function openRow_() {
          if (typeof openEditModal === 'function') openEditModal(e._type, e.id);
        }
        row.addEventListener('click', openRow_);
        row.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRow_(); }
        });
        listEl.appendChild(row);
      });
    }
  }

  renderHomeWeekDigest_();
  renderBudgetPaceCard_('home-budget-pace');

  var catsEl = document.getElementById('home-top-cats');
  if (catsEl) {
    var catTotals = {};
    me.forEach(function(e) { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
    var top = Object.keys(catTotals).map(function(c) { return { cat: c, amt: catTotals[c] }; })
      .sort(function(a, b) { return b.amt - a.amt; }).slice(0, 5);
    if (!top.length) {
      catsEl.innerHTML = homePanel_('Top spending', homeEmpty_('chart', 'No spending this month yet.'));
    } else {
      catsEl.innerHTML = homePanel_('Top spending', top.map(function(t) {
        var info = EXP_CATS[t.cat] || { icon: '\u{1F4E6}', color: '#B4B2A9' };
        var pct = monthExp > 0 ? Math.round((t.amt / monthExp) * 100) : 0;
        return (
          '<div class="home-cat-row">' +
          '<span>' +
          (typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(t.cat, EXP_CATS, 'ft-cat-badge--sm') : '') +
          ' ' + esc(t.cat) + '</span>' +
          '<strong class="red">' + fmt(t.amt) + '</strong>' +
          '<div class="home-cat-row__bar"><div class="home-cat-row__fill" style="width:' + pct + '%;background:' + (info.color || '#888') + '"></div></div>' +
          '<span class="ft-note" style="grid-column:1/-1;margin-top:-2px">' + pct + '% of month spend</span></div>'
        );
      }).join(''));
    }
  }

  var insEl = document.getElementById('home-insights');
  if (insEl) {
    var cards = [];
    function insightCard(iconId, label, value, tone, note, valueIsHtml) {
      var ico = typeof ftIconHtml_ === 'function' ? ftIconHtml_(iconId, 'home-insight-card__svg') : '';
      var valCell = valueIsHtml ? value : esc(value);
      return (
        '<div class="home-insight-card ' + (tone || '') + '">' +
        '<div class="home-insight-card__icon">' + ico + '</div>' +
        '<div class="home-insight-card__body">' +
        '<div class="home-insight-card__label">' + esc(label) + '</div>' +
        '<div class="home-insight-card__value">' + valCell + '</div>' +
        (note ? '<div class="home-insight-card__note">' + esc(note) + '</div>' : '') +
        '</div></div>'
      );
    }
    if (prvExp > 0) {
      var expDelta = Math.round(((monthExp - prvExp) / prvExp) * 100);
      cards.push(insightCard(
        expDelta >= 0 ? 'trends' : 'chart',
        'Spending trend',
        (expDelta >= 0 ? 'Up ' : 'Down ') + Math.abs(expDelta) + '%',
        expDelta >= 0 ? 'warn' : 'good',
        'Compared to last month'
      ));
    }
    if (prvInc > 0) {
      var incDelta = Math.round(((monthInc - prvInc) / prvInc) * 100);
      cards.push(insightCard(
        incDelta >= 0 ? 'income' : 'wallet',
        'Income trend',
        (incDelta >= 0 ? 'Up ' : 'Down ') + Math.abs(incDelta) + '%',
        incDelta >= 0 ? 'good' : 'warn',
        'Compared to last month'
      ));
    }
    var savRate = monthInc > 0 ? Math.round((monthNet / monthInc) * 100) : null;
    if (savRate != null) {
      cards.push(insightCard(
        'target',
        'Savings rate',
        savRate + '%',
        savRate >= 20 ? 'good' : (savRate < 0 ? 'bad' : ''),
        'This month'
      ));
    }
    if (typeof petrolLog !== 'undefined' && petrolLog.length) {
      var ym = curYM;
      var pt = petrolLog.filter(function(p) { return p.date && String(p.date).indexOf(ym) === 0; });
      if (pt.length) {
        var ptSum = pt.reduce(function(a, p) { return a + (Number(p.total) || 0); }, 0);
        cards.push(insightCard(
          'petrol',
          'Petrol spend',
          fmt(ptSum),
          '',
          pt.length + ' fill-up' + (pt.length === 1 ? '' : 's') + ' this month'
        ));
      }
    }
    anomalyInsightLines_(curYM, vm).forEach(function(a) {
      cards.push(insightCard(a.icon, a.label, a.value, 'warn', a.note, a.valueIsHtml));
    });
    var missedRec = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
    if (missedRec.length) {
      cards.push(insightCard(
        'recurring',
        'Missed recurring',
        missedRec.length + ' bill' + (missedRec.length === 1 ? '' : 's'),
        'warn',
        'Due this month with no matching entry'
      ));
    }
    insEl.innerHTML = homePanel_('Insights', cards.length
      ? '<div class="home-insights-grid">' + cards.join('') + '</div>'
      : homeEmpty_('lightbulb', 'Add a few weeks of data for month-over-month insights.'));
  }

  var savEl = document.getElementById('home-savings');
  if (savEl) {
    if (savingsGoal && savingsGoal.target) {
      var saved = savingsProgressSince(savingsGoal.startDate);
      var target = savingsGoal.target;
      var pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
      var color = saved >= target ? '#1A9E6E' : pct >= 75 ? '#BA7517' : '#7F77DD';
      savEl.innerHTML = homePanel_('Savings goal',
        '<div class="ft-savings-goal">' +
        '<div class="ft-savings-goal__head"><strong>' + fmt(saved) + '</strong> of ' + fmt(target) + ' (' + pct + '%)</div>' +
        '<div class="ft-budget-track"><div class="ft-budget-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
        '<div class="ft-note" style="margin-top:8px">Target by ' + esc(savingsGoal.byDate) + '</div></div>');
    } else {
      savEl.innerHTML = homePanel_('Savings goal', homeEmpty_('target', 'Set a monthly savings target.', { ctaTab: 'expenses', ctaLabel: 'Set goal' }));
    }
  }

  var recBox = document.getElementById('home-recurring');
  if (recBox) {
    var missedRec = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
    var now = new Date();
    var preview = [];
    (recurring || []).forEach(function(r) {
      if (!r || !r.active) return;
      var d = new Date(now.getFullYear(), now.getMonth(), 1);
      for (var i = 0; i < 2; i++) {
        var y = d.getFullYear();
        var m = d.getMonth();
        var ld = new Date(y, m + 1, 0).getDate();
        var fire = r.day === 'last' ? ld : Math.min(Number(r.day) || 1, ld);
        var when = new Date(y, m, fire);
        if (when >= now && (when - now) <= 30 * 86400000) {
          preview.push({ date: when, amount: Number(r.amount) || 0, type: r.type, name: r.name || '' });
        }
        d = new Date(y, m + 1, 1);
      }
    });
    preview.sort(function(a, b) { return a.date - b.date; });
    var recExp = preview.filter(function(x) { return x.type === 'exp'; }).reduce(function(a, x) { return a + x.amount; }, 0);
    var recInc = preview.filter(function(x) { return x.type === 'inc'; }).reduce(function(a, x) { return a + x.amount; }, 0);
    var body = '';
    if (missedRec.length) {
      body += '<div class="home-rec-missed">' +
        '<div class="home-rec-missed__title">\u26A0\uFE0F ' + missedRec.length + ' missed this month</div>' +
        missedRec.slice(0, 3).map(function(m) {
          var r = m.r;
          var pd = typeof parseTxDate === 'function' ? parseTxDate(m.dateStr) : null;
          var dlbl = pd ? pd.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : m.dateStr;
          return (
            '<div class="home-rec-missed__row">' +
            '<span>' + esc(r.name || '') + ' \u00b7 due ' + dlbl +
            (m.daysOver > 0 ? ' (' + m.daysOver + 'd ago)' : '') + '</span>' +
            '<button type="button" class="btn-ghost home-rec-log-btn" data-rec-id="' + esc(String(r.id)) + '">Log</button></div>'
          );
        }).join('') +
        (missedRec.length > 3 ? '<div class="ft-note">+' + (missedRec.length - 3) + ' more on Recurring tab</div>' : '') +
        '</div>';
    }
    if (!preview.length && !missedRec.length) {
      recBox.innerHTML = homePanel_('Upcoming bills', homeEmpty_('recurring', 'No recurring items in the next 30 days.'));
    } else {
      if (preview.length) {
        body += '<div class="ft-note" style="margin-bottom:10px">Upcoming 30d: Out ' + fmt(recExp) + ' \u00b7 In ' + fmt(recInc) + ' \u00b7 Net ' + fmt(recInc - recExp) + '</div>' +
          preview.slice(0, 5).map(function(p) {
            return '<div class="report-row"><span class="rr-label">' + esc(p.name) + ' \u00b7 ' +
              p.date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) + '</span>' +
              '<span class="rr-val ' + (p.type === 'inc' ? 'green' : 'red') + '">' +
              (p.type === 'inc' ? '+' : '') + fmt(p.amount) + '</span></div>';
          }).join('');
      }
      recBox.innerHTML = homePanel_(missedRec.length ? 'Recurring' : 'Upcoming (30 days)', body || homeEmpty_('recurring', 'Nothing upcoming.'));
      recBox.querySelectorAll('.home-rec-log-btn').forEach(function(btn) {
        btn.addEventListener('click', function(ev) {
          ev.stopPropagation();
          var rid = btn.getAttribute('data-rec-id');
          var item = (recurring || []).find(function(x) { return String(x.id) === String(rid); });
          if (item) applyOneRecurring_(item);
        });
      });
    }
  }

  var budBox = document.getElementById('home-budgets');
  if (budBox && typeof budgets !== 'undefined') {
    var catTotalsB = {};
    me.forEach(function(e) { catTotalsB[e.cat] = (catTotalsB[e.cat] || 0) + e.amount; });
    var bkeys = Object.keys(budgets || {});
    if (!bkeys.length) {
      budBox.innerHTML = homePanel_('Budgets', homeEmpty_('wallet', 'Set category budgets to track spending.', { ctaTab: 'expenses', ctaLabel: 'Set budgets' }));
    } else {
      var rows = bkeys.map(function(cat) {
        var baseLimit = Number(budgets[cat]) || 0;
        var limit = baseLimit + budgetCarryFromPrevMonth(cat, baseLimit);
        var spent = catTotalsB[cat] || 0;
        var pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
        var over = spent > limit;
        var color = over ? '#E24B4A' : pct >= 75 ? '#BA7517' : '#1A9E6E';
        var info = EXP_CATS[cat] || { icon: '\u{1F4E6}' };
        return { cat: cat, spent: spent, limit: limit, pct: pct, color: color, info: info, over: over };
      }).sort(function(a, b) { return b.pct - a.pct; }).slice(0, 4);
      budBox.innerHTML = homePanel_('Budgets', rows.map(function(r) {
        return (
          '<div class="ft-budget-item" style="margin-bottom:10px">' +
          '<div class="ft-budget-item__head">' +
          '<span>' + (typeof ftCatLabelHtml_ === 'function' ? ftCatLabelHtml_(r.cat, EXP_CATS, 'ft-cat-badge--sm') : esc(r.cat)) + '</span>' +
          '<span class="ft-budget-item__nums">' + fmt(r.spent) + ' / ' + fmt(r.limit) + '</span></div>' +
          '<div class="ft-budget-track"><div class="ft-budget-fill" style="width:' + r.pct + '%;background:' + r.color + '"></div></div></div>'
        );
      }).join(''));
    }
  }

  var check = document.getElementById('home-checklist');
  if (check) {
    var nearEnd = isCurrentVm && daysLeft <= 5;
    var missedRecCheck = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
    var checklist = [
      { done: false, text: 'Review month spending on Expenses' },
      { done: monthInc > 0 && monthExp > 0, text: 'Income and expenses recorded this month' },
      { done: banks.length > 0, text: 'Bank balances up to date on Assets' },
      { done: !missedRecCheck.length, text: 'Recurring bills logged for this month' },
    ];
    if (nearEnd) {
      checklist.push({ done: false, text: 'Export JSON backup (Settings)' });
      checklist.push({ done: false, text: 'Share monthly report' });
    }
    check.innerHTML =
      '<div class="panel-hd"><span class="panel-title">' + (nearEnd ? 'Month-end checklist' : 'Quick checklist') + '</span></div>' +
      '<div class="panel-bd"><ul style="margin:0;padding-left:18px;line-height:1.7;font-size:var(--f-sm)">' +
      checklist.map(function(c) {
        return '<li style="color:' + (c.done ? 'var(--green)' : 'var(--ink2)') + '">' +
          (c.done ? '\u2713 ' : '\u25cb ') + esc(c.text) + '</li>';
      }).join('') +
      '</ul></div>';
  }

  renderHomeNwMini_();

  var tw = document.getElementById('today-widget');
  if (tw) tw.hidden = true;
}

function renderRecurringCalendar() {
  var el = document.getElementById('rec-calendar');
  if (!el) return;
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var firstDow = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var marks = {};
  (recurring || []).forEach(function(r) {
    if (!r || !r.active) return;
    var fire = r.day === 'last' ? daysInMonth : Math.min(Number(r.day) || 1, daysInMonth);
    if (!marks[fire]) marks[fire] = [];
    marks[fire].push(r);
  });
  var monthLbl = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  var hdr = '<div class="rec-cal__title">' + esc(monthLbl) + '</div>';
  var grid = '<div class="rec-cal__grid">';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function(d) {
    grid += '<div class="rec-cal__dow">' + d + '</div>';
  });
  for (var pad = 0; pad < firstDow; pad++) grid += '<div class="rec-cal__day rec-cal__day--pad"></div>';
  for (var day = 1; day <= daysInMonth; day++) {
    var cls = 'rec-cal__day';
    if (day === now.getDate()) cls += ' rec-cal__day--today';
    if (marks[day]) cls += ' rec-cal__day--mark';
    var tip = marks[day] ? marks[day].map(function(r) { return r.name; }).join(', ') : '';
    grid += '<div class="' + cls + '" title="' + esc(tip) + '">' + day +
      (marks[day] ? '<span class="rec-cal__dot"></span>' : '') + '</div>';
  }
  grid += '</div>';
  el.innerHTML = hdr + grid;
}

// ╔══════════════════════════════════════════════════════════╗
//   BUDGET TARGETS
// ╚══════════════════════════════════════════════════════════╝
function budgetCarryFromPrevMonth(cat, limit) {
  if (!budgetRollover || !budgetRollover[cat]) return 0;
  var vm = typeof viewMonth !== 'undefined' && viewMonth ? viewMonth : new Date();
  var prv = new Date(vm.getFullYear(), vm.getMonth() - 1, 1);
  var ym = prv.getFullYear() + '-' + String(prv.getMonth() + 1).padStart(2, '0');
  var spent = expenses.filter(function(e) {
    return e.cat === cat && String(e.date || '').indexOf(ym) === 0;
  }).reduce(function(a, e) {
    return a + (Number(e.amount) || 0);
  }, 0);
  var unused = (Number(limit) || 0) - spent;
  return unused > 0 ? Number(unused.toFixed(2)) : 0;
}

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
    var baseLimit = Number(budgets[cat]) || 0;
    var limit = baseLimit + budgetCarryFromPrevMonth(cat, baseLimit);
    var spent = catTotals[cat] || 0;
    var pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    if (pct < 75) return;
    var over = spent > limit;
    var info = EXP_CATS[cat] || { icon: '📦' };
    var cls = over ? 'ft-budget-chip ft-budget-chip--over' : 'ft-budget-chip ft-budget-chip--warn';
    chips.push(
      '<button type="button" class="' + cls + '" data-bud-cat="' + esc(cat) + '" title="Show ' + esc(cat) + ' transactions">' +
      (typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(cat, EXP_CATS, 'ft-cat-badge--sm') : '') +
      ' ' + esc(cat) + ' ' + pct + '% · ' + fmt(spent) + '/' + fmt(limit) +
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

function budgetPaceData_() {
  var vm = typeof viewMonth !== 'undefined' && viewMonth ? viewMonth : new Date();
  vm = new Date(vm.getFullYear(), vm.getMonth(), 1);
  var td = new Date();
  var isCurrent = td.getFullYear() === vm.getFullYear() && td.getMonth() === vm.getMonth();
  var lastDay = new Date(vm.getFullYear(), vm.getMonth() + 1, 0).getDate();
  var dayOfMonth = isCurrent ? td.getDate() : lastDay;
  var daysLeft = isCurrent ? Math.max(0, lastDay - td.getDate()) : 0;
  var me = typeof mExp === 'function' ? mExp() : [];
  var catTotals = {};
  me.forEach(function(e) { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
  var totalBudget = 0;
  var totalSpent = 0;
  var rows = [];
  Object.keys(budgets || {}).forEach(function(cat) {
    var base = Number(budgets[cat]) || 0;
    var limit = base + budgetCarryFromPrevMonth(cat, base);
    var spent = catTotals[cat] || 0;
    totalBudget += limit;
    totalSpent += spent;
    var left = limit - spent;
    rows.push({
      cat: cat,
      limit: limit,
      spent: spent,
      left: left,
      daily: daysLeft > 0 ? left / daysLeft : left,
      over: spent > limit,
    });
  });
  return {
    isCurrent: isCurrent,
    daysLeft: daysLeft,
    dayOfMonth: dayOfMonth,
    lastDay: lastDay,
    totalBudget: totalBudget,
    totalSpent: totalSpent,
    totalLeft: totalBudget - totalSpent,
    dailyAllowance: daysLeft > 0 ? (totalBudget - totalSpent) / daysLeft : (totalBudget - totalSpent),
    rows: rows.sort(function(a, b) { return (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)); }),
  };
}

function renderBudgetPaceCard_(elId) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!Object.keys(budgets || {}).length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  var p = budgetPaceData_();
  el.hidden = false;
  var tone = p.totalLeft < 0 ? 'budget-pace--over' : (p.dailyAllowance < 0 ? 'budget-pace--over' : '');
  var headline = p.totalLeft >= 0
    ? fmt(p.totalLeft) + ' left across budgets'
    : fmt(Math.abs(p.totalLeft)) + ' over budget';
  var sub = p.isCurrent
    ? (p.daysLeft > 0
      ? '~' + fmt(Math.max(0, p.dailyAllowance)) + '/day for ' + p.daysLeft + ' day' + (p.daysLeft === 1 ? '' : 's')
      : 'Last day — spend carefully')
    : 'Historical month view';
  var rowHtml = p.rows.slice(0, elId === 'home-budget-pace' ? 3 : 6).map(function(r) {
    var info = EXP_CATS[r.cat] || { icon: '\u{1F4E6}' };
    var pct = r.limit > 0 ? Math.min(100, Math.round((r.spent / r.limit) * 100)) : 0;
    var dailyTxt = p.isCurrent && p.daysLeft > 0
      ? (r.left >= 0 ? fmt(r.daily) + '/d' : 'Over')
      : (r.left >= 0 ? fmt(r.left) + ' left' : 'Over ' + fmt(Math.abs(r.left)));
    return (
      '<div class="budget-pace__row">' +
      '<span>' + (typeof ftCatLabelHtml_ === 'function' ? ftCatLabelHtml_(r.cat, EXP_CATS, 'ft-cat-badge--sm') : esc(r.cat)) + '</span>' +
      '<span class="budget-pace__nums">' + fmt(r.spent) + ' / ' + fmt(r.limit) + ' · ' + pct + '%</span>' +
      '<span class="budget-pace__daily ' + (r.over ? 'red' : '') + '">' + dailyTxt + '</span></div>'
    );
  }).join('');
  el.innerHTML =
    '<div class="panel-hd"><span class="panel-title">Budget pace</span></div>' +
    '<div class="panel-bd budget-pace ' + tone + '">' +
    '<div class="budget-pace__headline">' + esc(headline) + '</div>' +
    '<div class="budget-pace__sub">' + esc(sub) + '</div>' +
    (rowHtml ? '<div class="budget-pace__rows">' + rowHtml + '</div>' : '') +
    '</div>';
}

function recentMerchantChips_() {
  var seen = {};
  var list = [];
  expenses.slice().sort(function(a, b) {
    return String(b.date).localeCompare(String(a.date)) || (Number(b.id) - Number(a.id));
  }).forEach(function(e) {
    var n = String(e.name || '').trim();
    if (!n || seen[n]) return;
    seen[n] = true;
    list.push({ name: n, cat: e.cat, amount: Number(e.amount) || 0 });
  });
  return list.slice(0, 6);
}

function homeQuickAddMerchant_(name, cat, amount) {
  if (typeof activateNavTab === 'function') activateNavTab('expenses');
  var nEl = document.getElementById('exp-name');
  var aEl = document.getElementById('exp-amount');
  var dEl = document.getElementById('exp-date');
  if (nEl) nEl.value = name;
  if (aEl && typeof moneySetAmount === 'function') moneySetAmount(aEl, amount);
  else if (aEl) aEl.value = amount > 0 ? String(amount) : '';
  var pEl = document.getElementById('exp-place');
  if (pEl) pEl.value = name;
  if (dEl && typeof todayStr === 'function') dEl.value = todayStr();
  if (cat && typeof EXP_CATS !== 'undefined' && EXP_CATS[cat]) {
    selectedCat = cat;
    if (typeof buildCatButtons === 'function') buildCatButtons();
  }
  if (nEl) {
    try { nEl.focus(); nEl.select(); } catch (e) {}
  }
  if (typeof showToast === 'function') showToast('Quick add — adjust amount if needed');
}

function renderHomeRecentMerchants_() {
  var el = document.getElementById('home-recent-merchants');
  if (!el) return;
  var merchants = recentMerchantChips_();
  if (!merchants.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML =
    '<div class="panel-hd"><span class="panel-title">Quick add from recent</span></div>' +
    '<div class="panel-bd home-merchant-chips">' +
    merchants.map(function(m) {
      var info = EXP_CATS[m.cat] || { icon: '\u{1F4E6}' };
      return (
        '<button type="button" class="home-merchant-chip" data-merchant="' + esc(m.name) + '" data-cat="' + esc(m.cat) + '" data-amt="' + m.amount + '">' +
        '<span class="home-merchant-chip__ico">' +
        (typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(m.cat, EXP_CATS, 'ft-cat-badge--sm') : '') +
        '</span>' +
        '<span class="home-merchant-chip__name">' + esc(m.name) + '</span>' +
        (m.amount > 0 ? '<span class="home-merchant-chip__amt">' + fmt(m.amount) + '</span>' : '') +
        '</button>'
      );
    }).join('') +
    '</div>';
  el.querySelectorAll('.home-merchant-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      homeQuickAddMerchant_(btn.getAttribute('data-merchant'), btn.getAttribute('data-cat'), parseFloat(btn.getAttribute('data-amt') || '0'));
    });
  });
}

function renderHomeNwMini_() {
  var wrap = document.getElementById('home-nw-mini');
  if (!wrap) return;
  if (typeof renderNetWorthChart === 'function') renderNetWorthChart('home-nw-chart');
  wrap.hidden = !networthHist || networthHist.length < 2;
}

function renderCatRulesPanel_() {
  var el = document.getElementById('settings-cat-rules-list');
  if (!el) return;
  var keys = Object.keys(catRules || {}).sort();
  if (!keys.length) {
    el.innerHTML = '<p class="ft-note" style="margin:0">No merchant rules yet — they are learned when you categorize expenses, or add one below.</p>';
    return;
  }
  el.innerHTML = keys.map(function(k) {
    var cat = catRules[k];
    var info = (typeof EXP_CATS !== 'undefined' && EXP_CATS[cat]) ? EXP_CATS[cat] : { icon: '\u{1F4E6}' };
    return (
      '<div class="cat-rule-row">' +
      '<span class="cat-rule-row__pattern">' + esc(k) + '</span>' +
      '<span class="cat-rule-row__arrow">\u2192</span>' +
      '<span class="cat-rule-row__cat">' +
      (typeof ftCatLabelHtml_ === 'function' ? ftCatLabelHtml_(cat, EXP_CATS, 'ft-cat-badge--sm') : esc(cat)) +
      '</span>' +
      '<button type="button" class="assets-icon-btn del cat-rule-del" data-rule-key="' + esc(k) + '" title="Remove rule">\u2715</button></div>'
    );
  }).join('');
  el.querySelectorAll('.cat-rule-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.getAttribute('data-rule-key');
      if (key && catRules[key]) {
        delete catRules[key];
        saveCatRules();
        renderCatRulesPanel_();
        if (typeof showToast === 'function') showToast('Rule removed');
      }
    });
  });
}

function addCatRuleManual_() {
  var patEl = document.getElementById('cat-rule-pattern');
  var catEl = document.getElementById('cat-rule-cat');
  if (!patEl || !catEl) return;
  var key = normMerchantKey(patEl.value);
  var cat = catEl.value;
  if (key.length < 3) { shake(patEl); return; }
  if (!cat || typeof EXP_CATS === 'undefined' || !EXP_CATS[cat]) { shake(catEl); return; }
  catRules[key] = cat;
  saveCatRules();
  patEl.value = '';
  renderCatRulesPanel_();
  if (typeof showToast === 'function') showToast('Rule saved: ' + key + ' \u2192 ' + cat);
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
    el.innerHTML = homeEmpty_('target', 'No budgets set. Add limits below.');
    renderExpBudgetChips();
    renderBudgetPaceCard_('exp-budget-pace');
    return;
  }

  el.innerHTML = '';
  el.className = 'ft-budget-list';
  keys.sort().forEach(function(cat) {
    var baseLimit = Number(budgets[cat]) || 0;
    var carry = budgetCarryFromPrevMonth(cat, baseLimit);
    var limit = baseLimit + carry;
    var spent = catTotals[cat] || 0;
    var pct   = Math.min(Math.round((spent/limit)*100), 100);
    var over  = spent > limit;
    var warn  = pct >= 75 && !over;
    var color = over ? '#E24B4A' : warn ? '#BA7517' : '#1A9E6E';
    var catBadge = typeof ftCatBadgeHtml_ === 'function' ? ftCatBadgeHtml_(cat, EXP_CATS, 'ft-cat-badge--sm') : '';

    var row = document.createElement('div');
    row.className = 'ft-budget-item';

    var header = document.createElement('div');
    header.className = 'ft-budget-item__head';
    header.innerHTML =
      catBadge +
      '<span class="ft-budget-item__cat">' + esc(cat) + '</span>' +
      '<span class="ft-budget-item__nums">' + fmt(spent) + ' / ' + fmt(limit) + '</span>' +
      '<span class="ft-budget-item__pct" style="color:' + color + '">' + pct + '%</span>' +
      (over ? '<span class="ft-badge ft-badge--over">Over</span>' : '') +
      (warn ? '<span class="ft-badge ft-badge--warn">75%+</span>' : '') +
      (carry > 0 ? '<span class="ft-badge">+Carry ' + fmt(carry) + '</span>' : '');

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
  renderBudgetPaceCard_('exp-budget-pace');
}

function addBudget() {
  var catEl = document.getElementById('bud-cat');
  var amtEl = document.getElementById('bud-amount');
  var rollEl = document.getElementById('bud-rollover');
  var cat   = catEl ? catEl.value : '';
  var amt   = parseFloat(amtEl ? amtEl.value : '');
  if (!cat || isNaN(amt) || amt <= 0) { if(amtEl) shake(amtEl); return; }
  budgets[cat] = amt;
  budgetRollover[cat] = !!(rollEl && rollEl.checked);
  saveBud();
  saveBudRoll();
  if (amtEl) amtEl.value = '';
  renderBudgets();
  showToast('Budget set for ' + cat + (budgetRollover[cat] ? ' (rollover on)' : ''));
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
  var tgtIn = document.getElementById('sg-target');
  var dateIn = document.getElementById('sg-date');
  if (!savingsGoal || !savingsGoal.target) {
    panel.innerHTML = '<p class="ft-note">Set a target amount and date to track how much you have saved (income minus expenses since the goal started).</p>';
    if (tgtIn) tgtIn.value = '';
    if (dateIn) dateIn.value = '';
    return;
  }
  if (dateIn && savingsGoal.byDate) dateIn.value = savingsGoal.byDate;
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
var searchFilters = { type: 'all', cat: 'all', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };

function searchTxStr(v) {
  return String(v == null ? '' : v).toLowerCase();
}

function renderSearch() {
  var el = document.getElementById('search-results');
  if (!el) return;

  var q = searchQuery.trim().toLowerCase();
  if (!q) {
    var searchIco = typeof ftIconHtml_ === 'function' ? ftIconHtml_('search', 'ft-empty-state__svg') : '';
    el.innerHTML = '<div class="empty" style="padding:24px 0"><div class="empty-icon">' + searchIco + '</div>Type to search all transactions across every month</div>';
    return;
  }

  var allExp = expenses.filter(function(e) {
    return searchTxStr(e.name).includes(q) || searchTxStr(e.cat).includes(q) ||
      searchTxStr(e.place).includes(q);
  });
  var allInc = incomes.filter(function(i){ return searchTxStr(i.name).includes(q) || searchTxStr(i.cat).includes(q); });
  if (searchFilters.type === 'exp') allInc = [];
  if (searchFilters.type === 'inc') allExp = [];
  var min = parseFloat(searchFilters.amountMin);
  var max = parseFloat(searchFilters.amountMax);
  var hasMin = !isNaN(min) && min > 0;
  var hasMax = !isNaN(max) && max > 0;
  function passCommon(e) {
    if (searchFilters.cat !== 'all' && e.cat !== searchFilters.cat) return false;
    if (searchFilters.dateFrom && String(e.date || '') < searchFilters.dateFrom) return false;
    if (searchFilters.dateTo && String(e.date || '') > searchFilters.dateTo) return false;
    if (hasMin && Number(e.amount) < min) return false;
    if (hasMax && Number(e.amount) > max) return false;
    return true;
  }
  allExp = allExp.filter(passCommon);
  allInc = allInc.filter(passCommon);
  var all = allExp.map(function(e){ return Object.assign({},e,{_type:'exp'}); })
    .concat(allInc.map(function(i){ return Object.assign({},i,{_type:'inc'}); }))
    .sort(function(a,b){ return b.date.localeCompare(a.date) || b.id-a.id; });

  el.innerHTML = '';

  if (!all.length) {
    var noIco = typeof ftIconHtml_ === 'function' ? ftIconHtml_('search', 'ft-empty-state__svg') : '';
    el.innerHTML = '<div class="empty" style="padding:24px 0"><div class="empty-icon">' + noIco + '</div>No results for "' + esc(q) + '"</div>';
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
  var filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:14px';
  var catOpts = ['all'].concat(Object.keys(EXP_CATS || {}), Object.keys(INC_CATS || {}).filter(function(c){ return !EXP_CATS[c]; }));
  filterBar.innerHTML =
    '<select id="srch-type"><option value="all">All types</option><option value="exp">Expense only</option><option value="inc">Income only</option></select>' +
    '<select id="srch-cat">' + catOpts.map(function(c){ return '<option value="' + esc(c) + '">' + (c === 'all' ? 'All categories' : c) + '</option>'; }).join('') + '</select>' +
    '<input id="srch-date-from" type="date" placeholder="From"/>' +
    '<input id="srch-date-to" type="date" placeholder="To"/>' +
    '<input id="srch-min" type="number" min="0" step="0.01" placeholder="Min amount"/>' +
    '<input id="srch-max" type="number" min="0" step="0.01" placeholder="Max amount"/>' +
    '<button type="button" id="srch-clear" class="btn-ghost" style="height:34px">Clear filters</button>';
  el.appendChild(filterBar);
  ['type', 'cat', 'dateFrom', 'dateTo', 'amountMin', 'amountMax'].forEach(function(k) {
    var map = { type: 'srch-type', cat: 'srch-cat', dateFrom: 'srch-date-from', dateTo: 'srch-date-to', amountMin: 'srch-min', amountMax: 'srch-max' };
    var node = document.getElementById(map[k]);
    if (!node) return;
    node.value = searchFilters[k] || '';
    node.addEventListener('change', function() {
      searchFilters[k] = node.value || '';
      renderSearch();
    });
  });
  var clrBtn = document.getElementById('srch-clear');
  if (clrBtn) {
    clrBtn.addEventListener('click', function() {
      searchFilters = { type: 'all', cat: 'all', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };
      renderSearch();
    });
  }

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
    var useSwipe = typeof ftUseSwipeRows === 'function' && ftUseSwipeRows();
    row.style.cursor = useSwipe ? 'default' : 'pointer';

    var ico = document.createElement('div');
    ico.className = 'tx-icon';
    ico.innerHTML = typeof ftCatBadgeHtml_ === 'function'
      ? ftCatBadgeHtml_(entry.cat, catMap, 'ft-cat-badge--tx')
      : '';
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

    if (useSwipe && typeof ftMountSwipeRow === 'function') {
      list.appendChild(ftMountSwipeRow(row, [
        { label: 'Edit', kind: 'edit', onClick: function() { openEditModal(entry._type, entry.id); } },
        { label: 'Delete', kind: 'del', onClick: function() {
          if (!confirm('Delete this entry?')) return;
          if (entry._type === 'inc') deleteIncome(entry.id);
          else deleteExpense(entry.id);
          renderSearch();
        }},
      ]));
    } else {
      row.addEventListener('click', function() {
        openEditModal(entry._type, entry.id);
      });
      list.appendChild(row);
    }
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

/** Normalize lastApplied from sheet (YYYY-MM or YYYY-MM-DD) to YYYY-MM for comparison. */
function recurringAppliedYm_(la) {
  if (la == null || la === '') return '';
  var t = String(la).trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 7);
  return '';
}

function recurringFireMeta_(r, y, m) {
  var dayVal = r.day || 1;
  var fireDay;
  if (dayVal === 'last') {
    fireDay = new Date(y, m+1, 0).getDate();
  } else {
    fireDay = Number(dayVal);
    var lastDay = new Date(y, m+1, 0).getDate();
    fireDay = Math.min(fireDay, lastDay);
  }
  var dateStr = y+'-'+String(m+1).padStart(2,'0')+'-'+String(fireDay).padStart(2,'0');
  return { fireDay: fireDay, dateStr: dateStr };
}

/** If lastApplied was lost on sync but the auto line already exists, do not duplicate. */
function recurringHasAutoMirror_(r, dateStr) {
  var list = r.type === 'inc' ? incomes : expenses;
  var amt = Number(r.amount) || 0;
  var nm = String(r.name || '');
  var cat = String(r.cat || '');
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || !e.auto) continue;
    var d = String(e.date || '').slice(0, 10);
    if (d !== dateStr) continue;
    if (String(e.name || '') !== nm) continue;
    if (String(e.cat || '') !== cat) continue;
    if (Math.abs((Number(e.amount) || 0) - amt) > 0.009) continue;
    return true;
  }
  return false;
}

/** Manual payment logged this month that matches a recurring item (name/amount/cat). */
function recurringHasManualMatch_(r, dateStr) {
  var list = r.type === 'inc' ? incomes : expenses;
  var ym = dateStr.slice(0, 7);
  var amt = Number(r.amount) || 0;
  var nm = String(r.name || '').toLowerCase().trim();
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || e.auto) continue;
    if (String(e.date || '').slice(0, 7) !== ym) continue;
    if (Math.abs(Number(e.amount) - amt) > 0.009) continue;
    if (String(e.cat || '') !== String(r.cat || '')) continue;
    var en = String(e.name || '').toLowerCase().trim();
    if (!en || !nm) continue;
    if (en === nm || en.indexOf(nm) >= 0 || nm.indexOf(en) >= 0) return true;
  }
  return false;
}

function recurringHasLoggedMatch_(r, dateStr) {
  return recurringHasAutoMirror_(r, dateStr) || recurringHasManualMatch_(r, dateStr);
}

/** Active recurring items due this month with no matching transaction logged. */
function recurringMissedThisMonth_() {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var todayD = now.getDate();
  var missed = [];
  (recurring || []).forEach(function(r) {
    if (!r || !r.active) return;
    var fd = recurringFireMeta_(r, y, m);
    if (todayD < fd.fireDay) return;
    if (recurringHasLoggedMatch_(r, fd.dateStr)) return;
    missed.push({
      r: r,
      dateStr: fd.dateStr,
      daysOver: todayD - fd.fireDay,
    });
  });
  missed.sort(function(a, b) { return b.daysOver - a.daysOver; });
  return missed;
}

function applyOneRecurring_(r) {
  if (!r) return;
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var ym = y + '-' + String(m + 1).padStart(2, '0');
  var fd = recurringFireMeta_(r, y, m);
  if (recurringHasLoggedMatch_(r, fd.dateStr)) {
    r.lastApplied = ym;
    saveRec();
    if (typeof render === 'function') render();
    return;
  }
  var entry = {
    id: Date.now() + Math.random(),
    name: r.name,
    amount: r.amount,
    cat: r.cat,
    date: fd.dateStr,
    auto: true,
  };
  if (r.type === 'exp') expenses.push(entry);
  else incomes.push(entry);
  r.lastApplied = ym;
  saveExp();
  saveInc();
  saveRec();
  if (typeof render === 'function') render();
  if (typeof showToast === 'function') showToast('Recurring entry logged');
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
    if (recurringAppliedYm_(r.lastApplied) === ym) return;

    var fd = recurringFireMeta_(r, y, m);
    if (todayD < fd.fireDay) return;

    if (recurringHasLoggedMatch_(r, fd.dateStr)) {
      r.lastApplied = ym;
      changed = true;
      return;
    }

    var entry   = { id: Date.now()+Math.random(), name:r.name, amount:r.amount, cat:r.cat, date:fd.dateStr, auto:true };
    if (r.type === 'exp') expenses.push(entry);
    else incomes.push(entry);
    r.lastApplied = ym;
    changed = true;
  });

  if (changed) { saveExp(); saveInc(); saveRec(); }
  return changed;
}

function maybeNotifyUpcomingRecurring_() {
  if (typeof Notification === 'undefined') return;
  if (typeof settings !== 'undefined' && settings.notifyRecurring === false) return;
  if (Notification.permission === 'denied') return;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  var noticeKey = 'ft_notice_rec_' + ym + '_' + String(today.getDate());
  try {
    if (localStorage.getItem(noticeKey)) return;
  } catch (e) {}
  var lines = [];
  (recurring || []).forEach(function(r) {
    if (!r || !r.active) return;
    var fd = recurringFireMeta_(r, today.getFullYear(), today.getMonth());
    var fire = new Date(today.getFullYear(), today.getMonth(), fd.fireDay);
    var days = Math.round((fire.getTime() - today.getTime()) / 86400000);
    if (days >= 0 && days <= 7) {
      lines.push((r.type === 'inc' ? '+' : '-') + fmt(Number(r.amount) || 0) + ' ' + r.name + ' (' + (days === 0 ? 'today' : 'in ' + days + 'd') + ')');
    }
  });
  var missed = typeof recurringMissedThisMonth_ === 'function' ? recurringMissedThisMonth_() : [];
  missed.slice(0, 3).forEach(function(m) {
    var r = m.r;
    lines.unshift('Missed: ' + (r.name || 'Bill') + ' ' + fmt(Number(r.amount) || 0) + (m.daysOver > 0 ? ' (' + m.daysOver + 'd ago)' : ''));
  });
  if (!lines.length) return;
  function trigger() {
    try {
      new Notification(missed.length ? 'Bills need attention' : 'Upcoming bills', {
        body: lines.slice(0, 4).join(' \u2022 '),
        tag: 'ft-recurring-due',
      });
      localStorage.setItem(noticeKey, '1');
    } catch (e) {}
  }
  if (Notification.permission === 'granted') trigger();
  else if (Notification.permission === 'default') {
    Notification.requestPermission().then(function(p) {
      if (p === 'granted') trigger();
    });
  }
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
  renderRecurringCalendar();
  var el = document.getElementById('rec-list');
  if (!el) return;
  el.innerHTML = '';
  var missedRec = recurringMissedThisMonth_();
  if (missedRec.length) {
    var missBox = document.createElement('div');
    missBox.className = 'ft-inline-hint home-rec-missed';
    missBox.style.marginBottom = '12px';
    missBox.innerHTML =
      '<div class="home-rec-missed__title">\u26A0\uFE0F ' + missedRec.length + ' expected bill' +
      (missedRec.length === 1 ? '' : 's') + ' not logged this month</div>' +
      missedRec.map(function(m) {
        var r = m.r;
        var pd = typeof parseTxDate === 'function' ? parseTxDate(m.dateStr) : null;
        var dlbl = pd ? pd.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : m.dateStr;
        return (
          '<div class="home-rec-missed__row">' +
          '<span><strong>' + esc(r.name || '') + '</strong> \u00b7 ' + fmt(Number(r.amount) || 0) +
          ' \u00b7 due ' + dlbl + '</span>' +
          '<button type="button" class="btn-ghost rec-apply-one-btn" data-rec-id="' + esc(String(r.id)) + '">Log now</button></div>'
        );
      }).join('');
    el.appendChild(missBox);
    missBox.querySelectorAll('.rec-apply-one-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rid = btn.getAttribute('data-rec-id');
        var item = (recurring || []).find(function(x) { return String(x.id) === String(rid); });
        if (item) applyOneRecurring_(item);
      });
    });
  }
  var now = new Date();
  var preview = [];
  (recurring || []).forEach(function(r) {
    if (!r || !r.active) return;
    var d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (var i = 0; i < 2; i++) {
      var y = d.getFullYear();
      var m = d.getMonth();
      var lastDay = new Date(y, m + 1, 0).getDate();
      var fire = r.day === 'last' ? lastDay : Math.min(Number(r.day) || 1, lastDay);
      var when = new Date(y, m, fire);
      if (when >= now && (when - now) <= 30 * 86400000) {
        preview.push({ date: when, amount: Number(r.amount) || 0, type: r.type, name: r.name || '' });
      }
      d = new Date(y, m + 1, 1);
    }
  });
  if (preview.length) {
    preview.sort(function(a, b) { return a.date - b.date; });
    var exp = preview.filter(function(x) { return x.type === 'exp'; }).reduce(function(a, x) { return a + x.amount; }, 0);
    var inc = preview.filter(function(x) { return x.type === 'inc'; }).reduce(function(a, x) { return a + x.amount; }, 0);
    var pv = document.createElement('div');
    pv.className = 'ft-inline-hint';
    pv.style.marginBottom = '10px';
    pv.innerHTML = 'Next 30 days: ' + preview.length + ' recurring item(s) · Income ' + fmt(inc) + ' · Expense ' + fmt(exp) + ' · Net ' + fmt(inc - exp);
    el.appendChild(pv);
  }

  if (!recurring.length && !missedRec.length) {
    el.innerHTML = homeEmpty_('recurring', 'No recurring entries yet.');
    return;
  }
  if (!recurring.length) return;

  recurring.forEach(function(r) {
    var catMap  = r.type==='exp' ? EXP_CATS : INC_CATS;
    var catInfo = catMap[r.cat] || catMap['Other'];
    var isInc   = r.type === 'inc';
    var dayTxt  = r.day==='last' ? 'last day' : ordinal(r.day||1);

    var item = document.createElement('div');
    item.className = 'rec-item';
    var useSwipe = typeof ftUseSwipeRows === 'function' && ftUseSwipeRows();

    var ico = document.createElement('div');
    ico.className = 'rec-icon';
    ico.innerHTML = typeof ftCatBadgeHtml_ === 'function'
      ? ftCatBadgeHtml_(r.cat, catMap, 'ft-cat-badge--row')
      : '';

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

    if (!useSwipe) {
      actions.appendChild(toggleBtn);
      actions.appendChild(delBtn);
    }

    item.appendChild(ico);
    item.appendChild(info);
    item.appendChild(amt);
    item.appendChild(badge);
    if (!useSwipe) item.appendChild(actions);

    if (useSwipe && typeof ftMountSwipeRow === 'function') {
      el.appendChild(ftMountSwipeRow(item, [
        { label: r.active ? 'Pause' : 'Resume', kind: 'edit', onClick: function() {
          r.active = !r.active; saveRec(); renderRecurring();
        }},
        { label: 'Delete', kind: 'del', onClick: function() {
          if (confirm('Delete this recurring entry?')) {
            recurring = recurring.filter(function(x) { return x.id !== r.id; });
            saveRec(); renderRecurring();
          }
        }},
      ]));
    } else {
      el.appendChild(item);
    }
  });
}

// ╔══════════════════════════════════════════════════════════╗
//   NET WORTH SNAPSHOT
// ╚══════════════════════════════════════════════════════════╝
function snapshotNetWorth() {
  var bankTotal = (typeof totalBanksBase === 'function')
    ? totalBanksBase()
    : banks.reduce(function(a,b){ return a+b.balance; }, 0);
  var utMv = typeof computeUtTotalMarketValue === 'function' ? computeUtTotalMarketValue() : 0;
  var total = bankTotal + utMv;
  var today = todayStr();
  var ex    = networthHist.find(function(h){ return h.date===today; });
  if (ex) ex.total = total;
  else networthHist.push({ date:today, total:total });
  networthHist = networthHist.sort(function(a,b){ return a.date.localeCompare(b.date); }).slice(-365);
  saveNWH();
}

function renderNwSnapshotHint() {
  var hints = document.querySelectorAll('.ft-nw-hint');
  if (!hints.length) return;
  if (!banks.length) {
    hints.forEach(function(el) { el.style.display = 'none'; });
    return;
  }
  var needMore = networthHist.length < 2;
  var stale = false;
  var staleDays = 0;
  if (networthHist.length) {
    var last = networthHist[networthHist.length - 1].date;
    var lastD = typeof parseTxDate === 'function' ? parseTxDate(last) : new Date(last + 'T12:00:00');
    if (lastD) {
      staleDays = Math.floor((Date.now() - lastD.getTime()) / 86400000);
      stale = staleDays >= 14;
    }
  }
  if (!needMore && !stale) {
    hints.forEach(function(el) { el.style.display = 'none'; });
    return;
  }
  var autoOn = typeof settings !== 'undefined' && settings.nwAutoSnapshot !== false;
  var msg = needMore
    ? 'Net worth chart needs at least <strong>two</strong> balance snapshots on different days.'
    : 'Last net worth snapshot was <strong>' + staleDays + ' day' + (staleDays === 1 ? '' : 's') + '</strong> ago (14+ days).';
  msg += autoOn
    ? ' Updating any bank balance will record today automatically.'
    : ' Turn on <strong>Auto-snapshot net worth</strong> in Settings, or edit a bank balance to record today.';
  hints.forEach(function(el) {
    el.style.display = 'block';
    el.innerHTML = msg;
  });
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
  renderInsightsPanel(months);
  renderNwSnapshotHint();
  renderAllNetWorthCharts();
  requestAnimationFrame(function() {
    if (document.getElementById('page-trends') && document.getElementById('page-trends').classList.contains('active')) {
      renderAllNetWorthCharts();
    }
  });
}

function renderInsightsPanel(months) {
  var el = document.getElementById('insights-panel');
  if (!el) return;
  var me = typeof mExp === 'function' ? mExp() : [];
  var byCat = {};
  me.forEach(function(e) { byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.amount || 0); });
  var top = Object.keys(byCat).map(function(cat) { return { cat: cat, amount: byCat[cat] }; })
    .sort(function(a, b) { return b.amount - a.amount; }).slice(0, 3);
  var latest = months && months.length ? months[months.length - 1] : null;
  var prev = months && months.length > 1 ? months[months.length - 2] : null;
  var mom = (latest && prev && prev.exp > 0) ? Math.round(((latest.exp - prev.exp) / prev.exp) * 100) : null;
  var risk = [];
  Object.keys(budgets || {}).forEach(function(cat) {
    var lim = Number(budgets[cat]) || 0;
    if (!lim) return;
    var spent = byCat[cat] || 0;
    if (spent >= lim) risk.push(cat + ' over (' + Math.round((spent / lim) * 100) + '%)');
    else if (spent >= lim * 0.9) risk.push(cat + ' near limit (' + Math.round((spent / lim) * 100) + '%)');
  });
  el.innerHTML =
    '<div class="ft-note" style="margin-bottom:8px">Top spend: ' + (top.length ? top.map(function(t){ return esc(t.cat) + ' ' + fmt(t.amount); }).join(' · ') : 'No spending this month') + '</div>' +
    '<div class="ft-note" style="margin-bottom:8px">MoM spend delta: ' + (mom == null ? 'Not enough data yet' : ((mom >= 0 ? '+' : '') + mom + '%')) + '</div>' +
    '<div class="ft-note">Budget risk: ' + (risk.length ? esc(risk.join(' · ')) : 'No budget risks in current month') + '</div>';
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
    lbl.innerHTML = typeof ftCatLabelHtml_ === 'function'
      ? ftCatLabelHtml_(r.cat, INC_CATS, 'ft-cat-badge--sm')
      : esc(r.cat);
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

function renderAllNetWorthCharts() {
  renderNetWorthChart('networth-chart');
  renderNetWorthChart('assets-networth-chart');
  renderNetWorthChart('home-nw-chart');
}

function renderNetWorthChart(targetId) {
  var el = document.getElementById(targetId || 'networth-chart');
  if (!el) return;

  if (networthHist.length < 2) {
    el.innerHTML = '<div class="nw-empty">Update bank balances and unit trusts over time to build a portfolio history chart.</div>';
    return;
  }

  var chartKey = (targetId || 'networth-chart').replace(/[^a-z0-9]/gi, '');
  var gradId = 'nw-grad-' + chartKey;
  var isMini = targetId === 'home-nw-chart';

  var W   = el.clientWidth || (isMini ? 320 : 600);
  var H   = isMini ? 96 : 160;
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
    '<defs><linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="'+lc+'" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="'+lc+'" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<path d="'+area+'" fill="url(#'+gradId  +')"/>' +
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
var budCatEl = document.getElementById('bud-cat');
if (budCatEl) {
  var syncBudRoll = function() {
    var rollEl = document.getElementById('bud-rollover');
    if (rollEl) rollEl.checked = !!budgetRollover[budCatEl.value];
  };
  budCatEl.addEventListener('change', syncBudRoll);
  syncBudRoll();
}

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
//   INIT  — called after DOM ready
// ╚══════════════════════════════════════════════════════════╝
var assetsNwSnapBtn = document.getElementById('assets-nw-snapshot-btn');
if (assetsNwSnapBtn) {
  assetsNwSnapBtn.addEventListener('click', function() {
    if (typeof snapshotNetWorth === 'function') snapshotNetWorth();
    if (typeof renderAllNetWorthCharts === 'function') renderAllNetWorthCharts();
    if (typeof renderNwSnapshotHint === 'function') renderNwSnapshotHint();
    if (typeof showToast === 'function') showToast('Portfolio snapshot saved for today');
  });
}
var catRuleAddBtn = document.getElementById('cat-rule-add-btn');
if (catRuleAddBtn) catRuleAddBtn.addEventListener('click', addCatRuleManual_);
var catRulePat = document.getElementById('cat-rule-pattern');
if (catRulePat) catRulePat.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addCatRuleManual_();
});

loadFeatures();
