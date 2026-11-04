import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NAV_COLLAPSED_STORAGE_KEY, parseNavCollapsed, serializeNavCollapsed } from './nav-collapse';

describe('collapsible navigation preference', () => {
  it('starts open unless the device saved it closed', () => {
    assert.strictEqual(parseNavCollapsed(null), false);
    assert.strictEqual(parseNavCollapsed('garbage'), false);
    assert.strictEqual(parseNavCollapsed('true'), true);
    assert.strictEqual(parseNavCollapsed('false'), false);
  });

  it('round-trips through its storage value', () => {
    for (const collapsed of [true, false]) {
      assert.strictEqual(parseNavCollapsed(serializeNavCollapsed(collapsed)), collapsed);
    }
    assert.strictEqual(NAV_COLLAPSED_STORAGE_KEY, 'hoop-nav-collapsed');
  });
});
