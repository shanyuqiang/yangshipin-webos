const assert = require('node:assert/strict');
const test = require('node:test');
const adapter = require('../service/adapter.js');
const base = 'https://www.yangshipin.cn/tv/home';
const origin = 'http://127.0.0.1:18972';

test('rewrites allowed official requests and preserves query bytes', () => {
  const source = 'https://player-api.yangshipin.cn/v1/player/auth?a=1%2B2&b=3';
  assert.equal(adapter.proxyUrl('https://csapi.yangshipin.cn/serverTime', base, origin), origin + '/proxy?url=' + encodeURIComponent('https://csapi.yangshipin.cn/serverTime'));
  assert.equal(adapter.proxyUrl(source, base, origin), origin + '/proxy?url=' + encodeURIComponent(source));
  assert.equal(adapter.proxyUrl('/api/feed', base, origin), origin + '/proxy?url=' + encodeURIComponent('https://www.yangshipin.cn/api/feed'));
  assert.match(adapter.proxyUrl('https://cdn.ysp.cctv.cn/live/a.ts', base, origin), /\/proxy\?url=/);
  assert.equal(adapter.proxyUrl('https://capi.yangshipin.cn/api/navigation/home_top_nav', base, origin), origin + '/proxy?url=' + encodeURIComponent('https://capi.yangshipin.cn/api/navigation/home_top_nav'));
});

test('does not wrap local proxy or unapproved domains, schemes, credentials or ports', () => {
  for (const source of [origin+'/proxy?url=x', 'https://evil.example/a', 'https://yangshipin.cn.evil.example/a', 'http://player-api.yangshipin.cn/a', 'https://u:p@player-api.yangshipin.cn/a', 'https://player-api.yangshipin.cn:8443/a', 'data:text/plain,x', 'https://[']) {
    assert.equal(adapter.proxyUrl(source, base, origin), source);
  }
});

const rect = (x, y) => ({left:x, top:y, right:x+40, bottom:y+40});
test('directional nearest focus selects the requested direction and aligned target', () => {
  const current = rect(100,100);
  const choices = [rect(200,100),rect(110,250),rect(0,100),rect(100,0)];
  assert.equal(adapter.nextIndex(current, choices, 39), 0);
  assert.equal(adapter.nextIndex(current, choices, 40), 1);
  assert.equal(adapter.nextIndex(current, choices, 37), 2);
  assert.equal(adapter.nextIndex(current, choices, 38), 3);
});

test('focus safely handles empty lists, boundaries and unknown keys', () => {
  assert.equal(adapter.nextIndex(rect(0,0), [], 39), -1);
  assert.equal(adapter.nextIndex(rect(0,0), [rect(0,0)], 39), -1);
  assert.equal(adapter.nextIndex(rect(0,0), [rect(100,0)], 65), -1);
});

const fs = require('node:fs');
const vm = require('node:vm');
function browser(fetchImpl, cookieStore) {
  const opened = [];
  function XHR() {}
  XHR.prototype.open = function () { opened.push(Array.from(arguments)); };
  const window = new EventTarget();
  Object.assign(window, { location: { origin }, fetch: fetchImpl });
  const document = { baseURI: base, readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
  if (cookieStore) Object.defineProperty(document, 'cookie', { configurable: true, get() { return cookieStore.raw; }, set(value) { cookieStore.writes.push(value); } });
  vm.runInNewContext(fs.readFileSync(require.resolve('../service/adapter.js'), 'utf8'), {window, document, XMLHttpRequest:XHR, URL, Request, CustomEvent});
  return {window, XHR, opened, document};
}

test('fetch preserves Request method, headers and supplied options through proxy', async () => {
  let received;
  const env = browser(async (request, options) => { received = {request, options}; return {ok:true}; });
  const request = new Request('https://player-api.yangshipin.cn/v1/player/auth', {method:'POST', headers:{'yspappid':'test-app'}, body:'{"channel":"test"}'});
  const options = {cache:'no-store'};
  await env.window.fetch(request, options);
  assert.equal(received.request.method, 'POST');
  assert.equal(received.request.headers.get('yspappid'), 'test-app');
  assert.equal(await received.request.text(), '{"channel":"test"}');
  assert.equal(received.options, options);
  assert.match(received.request.url, /127\.0\.0\.1.*\/proxy\?url=/);
});

test('XHR proxy retains method, async flag and credentials arguments', () => {
  const env = browser(async () => ({ok:true}));
  const xhr = new env.XHR();
  xhr.open('POST', '/v1/test', true, undefined, undefined);
  assert.deepEqual(env.opened[0], ['POST', origin+'/proxy?url='+encodeURIComponent('https://www.yangshipin.cn/v1/test'), true, undefined, undefined]);
});

test('fetch failure remains observable to official caller', async () => {
  const error = new Error('offline');
  const env = browser(async () => { throw error; });
  await assert.rejects(env.window.fetch('https://player-api.yangshipin.cn/v1/player/auth'), value => value === error);
});

test('cookie namespace excludes unrelated cookies and unwraps own names only', () => {
  assert.equal(adapter.readCookies('other=secret; ysp_tv_guid=abc; ysp_tv_token=a=b; ysp_tv_=bad'), 'guid=abc; token=a=b');
});
test('cookie writes remove official domain and preserve expiry with isolated root path', () => {
  assert.equal(adapter.writeCookie('guid=abc; Domain=.yangshipin.cn; Path=/tv; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax'), 'ysp_tv_guid=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Path=/');
});
test('cookie writes reject injection, invalid names and Secure without silently downgrading', () => {
  for (const value of ['guid=a\r\nx:bad', 'guid=a\nb', 'bad name=x', 'guid=x; Secure', 'guid=x; domain=evil.example', 'guid=x; HttpOnly']) assert.throws(() => adapter.writeCookie(value), /cookie/i);
});


test('native cookie descriptor is wrapped without exposing unrelated state', () => {
  const jar = {raw:'unrelated=secret; ysp_tv_guid=anonymous', writes:[]};
  const env = browser(async () => ({ok:true}), jar);
  assert.equal(env.document.cookie, 'guid=anonymous');
  env.document.cookie = 'guid=new; domain=yangshipin.cn; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  assert.deepEqual(jar.writes, ['ysp_tv_guid=new; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/']);
  env.document.cookie = 'auth=secret; Secure';
  assert.equal(jar.writes.length, 1);
});

test('OpenAPI environment maps only original page host and protocol', () => {
  const state = {marker: 'original'};
  const calls = [];
  const sdk = {state, get(path, extra) { calls.push({receiver:this, path, extra}); return state; }};
  adapter.wrapSdk(sdk);
  assert.equal(sdk.get('window.location.host'), 'www.yangshipin.cn');
  assert.equal(sdk.get('window.location.protocol'), 'https:');
  assert.equal(sdk.get('window.location.hostname', 'preserved'), state);
  assert.equal(calls[0].receiver, sdk);
  assert.equal(calls[0].extra, 'preserved');
  assert.equal(sdk.state, state);
});
test('OpenAPI wrapper retains receiver and does not stack on repeated setup', () => {
  const sdk = {get() { return this; }};
  adapter.wrapSdk(sdk);
  const once = sdk.get;
  adapter.wrapSdk(sdk);
  assert.equal(sdk.get, once);
  const receiver = {};
  assert.equal(sdk.get.call(receiver, 'other.path'), receiver);
  for (const absent of [null, undefined, false, {}, {get:42}]) assert.doesNotThrow(() => adapter.wrapSdk(absent));
});

test('account API is proxied only for the exact hostname', () => {
  const url = 'https://ucenter-api.yangshipin.cn/v1/user/userinfo';
  assert.equal(adapter.proxyUrl(url,base,origin),origin+'/proxy?url='+encodeURIComponent(url));
  const other = 'https://ucenter-api.yangshipin.cn.evil.test/v1/user/userinfo';
  assert.equal(adapter.proxyUrl(other,base,origin),other);
});

test('cookie persistence notification follows successful native writes only', () => {
  const jar = {raw:'',writes:[]};
  const env = browser(async () => ({ok:true}),jar);
  const notified = [];
  env.window.__yspTvSessionCookieChanged = value => notified.push(value);
  const source = 'ysp_strAccesstoken=test-token; Domain=yangshipin.cn; Max-Age=30';
  env.document.cookie = source;
  assert.deepEqual(notified,[source]);
  env.document.cookie = 'ysp_strAccesstoken=blocked; Secure';
  assert.deepEqual(notified,[source]);
  assert.equal(jar.writes.length,1);
});
