#!/usr/bin/env node
'use strict';

/** Lightweight regression tests for sync merge helpers (no app storage). */
function cloneJson(v) { return JSON.parse(JSON.stringify(v)); }

function txMonthKey_(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim().slice(0, 7);
  return '';
}

function countExpensesByMonth_(arr) {
  const out = {};
  (arr || []).forEach((e) => {
    const ym = txMonthKey_(e && e.date);
    if (ym) out[ym] = (out[ym] || 0) + 1;
  });
  return out;
}

function localRowsMissingBaselineMonths_(localRows, baselineRows) {
  const localByM = countExpensesByMonth_(localRows);
  const baseByM = countExpensesByMonth_(baselineRows);
  for (const ym of Object.keys(baseByM)) {
    if (baseByM[ym] > 0 && !(localByM[ym] > 0)) return true;
  }
  const lc = (localRows || []).length;
  const bc = (baselineRows || []).length;
  if (bc > 0 && lc === 0) return true;
  if (bc >= 8 && lc > 0 && lc < Math.floor(bc * 0.45)) return true;
  return false;
}

function mergeRowArraysForSave_(localRows, baselineRows) {
  const map = {};
  (localRows || []).forEach((e) => { if (e && e.id != null) map[e.id] = e; });
  if (localRowsMissingBaselineMonths_(localRows, baselineRows)) {
    (baselineRows || []).forEach((e) => {
      if (e && e.id != null && !map[e.id]) map[e.id] = e;
    });
  }
  return Object.keys(map).map((k) => map[k]);
}

function buildPayloadForSave_(local, baseline, opts = {}) {
  const preserveTx = !!opts.preserveTxFromBaseline;
  return {
    expenses: preserveTx ? cloneJson(baseline.expenses || []) : mergeRowArraysForSave_(local.expenses, baseline.expenses),
    recurring: mergeRowArraysForSave_(local.recurring, baseline.recurring),
    catRules: Object.assign({}, baseline.catRules || {}, local.catRules || {}),
    savingsGoal: (local.savingsGoal && local.savingsGoal.target) ? local.savingsGoal : (baseline.savingsGoal || null),
  };
}

const baseline = {
  expenses: [
    { id: 1, date: '2026-04-10', amount: 50 },
    { id: 2, date: '2026-05-05', amount: 80 },
  ],
  recurring: [{ id: 10, name: 'Netflix', amount: 55 }],
  catRules: { starbucks: 'Coffee' },
  savingsGoal: { target: 5000, byDate: '2026-12-31', startDate: '2026-01-01' },
};

let failed = 0;
function assert(name, cond) {
  if (!cond) { console.error('FAIL:', name); failed++; }
  else console.log('PASS:', name);
}

const localRecOnly = {
  expenses: [],
  recurring: baseline.recurring.concat([{ id: 11, name: 'Insurance', amount: 120 }]),
  catRules: { starbucks: 'Coffee', shell: 'Petrol' },
  savingsGoal: null,
};
const saved = buildPayloadForSave_(localRecOnly, baseline, { preserveTxFromBaseline: true });
assert('recurring-only preserves baseline expenses', saved.expenses.length === 2);
assert('recurring-only merges new recurring', saved.recurring.length === 2);
assert('catRules merge keeps both', Object.keys(saved.catRules).length === 2);
assert('savingsGoal falls back to baseline', saved.savingsGoal && saved.savingsGoal.target === 5000);

const localBadDates = {
  expenses: baseline.expenses.map((e) => ({ ...e, date: '2026-06-24' })),
  recurring: baseline.recurring,
  catRules: {},
  savingsGoal: { target: 6000, byDate: '2026-12-31', startDate: '2026-06-01' },
};
const preserved = buildPayloadForSave_(localRecOnly, baseline, { preserveTxFromBaseline: true });
assert('preserve skips bad local tx dates', preserved.expenses[0].date === '2026-04-10');

process.exit(failed === 0 ? 0 : 1);
