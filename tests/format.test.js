import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAmount } from '../shared/core/format.js';

describe('fmtAmount', () => {
  it('formats with default RM currency', () => {
    assert.equal(fmtAmount(1234.5), 'RM 1,234.50');
  });

  it('formats with custom currency', () => {
    assert.equal(fmtAmount(0, 'USD'), 'USD 0.00');
  });

  it('coerces string numbers', () => {
    assert.equal(fmtAmount('99.9'), 'RM 99.90');
  });
});
