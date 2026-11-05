import { describe, it } from 'node:test';
import assert from 'node:assert';
import { clientIp } from './client-ip';

const headers = (values: Record<string, string>) => new Headers(values);

describe('clientIp (S1)', () => {
  it('takes the first x-forwarded-for entry, trimmed', () => {
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2' })), '203.0.113.7');
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': '2001:db8::1, 10.0.0.1' })), '2001:db8::1');
  });

  it('returns null without the header or with an empty first entry', () => {
    assert.strictEqual(clientIp(headers({})), null);
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': '' })), null);
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': '   ' })), null);
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': ' , 10.0.0.1' })), null);
  });

  it('ignores other client address headers', () => {
    assert.strictEqual(clientIp(headers({ 'x-real-ip': '203.0.113.7' })), null);
  });

  it('ignores a first entry longer than any IP address', () => {
    assert.strictEqual(clientIp(headers({ 'x-forwarded-for': 'x'.repeat(65) })), null);
  });
});
