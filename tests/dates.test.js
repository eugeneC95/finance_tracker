import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTxDate, todayStr } from '../shared/core/dates.js';

describe('parseTxDate', () => {
  it('parses YYYY-MM-DD', () => {
    const d = parseTxDate('2026-03-15');
    assert.ok(d instanceof Date);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 15);
  });

  it('returns null for empty input', () => {
    assert.equal(parseTxDate(''), null);
    assert.equal(parseTxDate(null), null);
  });

  it('returns null for invalid dates', () => {
    assert.equal(parseTxDate('not-a-date'), null);
  });
});

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
