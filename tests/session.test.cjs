const test = require('node:test');
const assert = require('node:assert/strict');

test('persists only account cookies and preserves explicit expiry', () => {
  const { parseCookie } = require('../service/session');
  const now = Date.now();
  assert.equal(parseCookie('guid=anonymous', now), null);
  const result = parseCookie('ysp_openid=encoded%2Bvalue; Domain=yangshipin.cn; Max-Age=60; Path=/', now);
  assert.deepEqual(result, { name: 'ysp_openid', value: 'encoded%2Bvalue', expiresAt: now + 60000 });
});

test('expiration and session-only writes remove old persistent credentials', () => {
  const { parseCookie } = require('../service/session');
  assert.deepEqual(parseCookie('ysp_openid=; expires=Thu, 01 Jan 1970 00:00:00 GMT', 1000),
    { name: 'ysp_openid', value: '', expiresAt: 0 });
  assert.deepEqual(parseCookie('strVideotoken=session-value', 1000),
    { name: 'strVideotoken', value: 'session-value', expiresAt: null });
});

test('invalid cookie input is not sent to the private service', () => {
  const { parseCookie } = require('../service/session');
  for (const value of ['ysp_openid=a\nb', 'ysp_openid="quoted"', 'unknown=value', 'ysp_openid=' + 'a'.repeat(8193)]) {
    assert.equal(parseCookie(value, 0), null);
  }
});
