import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../shared/core/dom.js';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    assert.equal(esc('<script>"&"</script>'), '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
  });

  it('coerces non-strings', () => {
    assert.equal(esc(42), '42');
  });
});
