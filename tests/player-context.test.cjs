const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const source = fs.readFileSync('service/player-context.js', 'utf8');
  const location = new URL('http://127.0.0.1:12345/tv/home');
  const script = { src: 'https://sapi.yangshipin.cn/assets/2025/wasm/cmg.worker.js?ver=test' };
  const window = { location, origin: location.origin, extra: 'retained' };
  const context = { window, document: { currentScript: script }, URL, Proxy, Reflect, WeakMap, WeakSet };
  vm.runInNewContext(source, context);
  return { window, script, context, source };
}

test('decoder has upstream context while real window keeps its local origin', () => {
  const { window } = load();
  window.CMGDecModule = function (input) {
    return { host: window.location.host, origin: self.origin, href: location.href,
      globalHost: globalThis.location.host, script: _scriptDir, extra: window.extra,
      input: input, receiver: this };
  };
  const receiver = {};
  const result = window.CMGDecModule.call(receiver, 'unchanged');
  assert.equal(result.host, 'www.yangshipin.cn');
  assert.equal(result.origin, 'https://www.yangshipin.cn');
  assert.equal(result.href, 'https://www.yangshipin.cn/tv/home');
  assert.equal(result.globalHost, result.host);
  assert.match(result.script, /^https:\/\/sapi\.yangshipin\.cn\/assets\/2025\/wasm\/cmg\.worker\.js/);
  assert.equal(result.extra, 'retained');
  assert.equal(result.input, 'unchanged');
  assert.equal(result.receiver, receiver);
  assert.equal(window.location.origin, 'http://127.0.0.1:12345');
});

test('only local activeURL maps to upstream; repeat installation is stable', () => {
  const { window, context, source } = load();
  window.activeURL = window.location.origin;
  assert.equal(window.activeURL, 'https://www.yangshipin.cn');
  window.activeURL = 'https://another.example';
  assert.equal(window.activeURL, 'https://another.example');
  vm.runInNewContext(source, context);
  assert.equal(window.activeURL, 'https://another.example');
});

test('untrusted factory origin is not evaluated and sets compatibility error', () => {
  const { window, script } = load();
  script.src = 'https://sapi.yangshipin.cn.evil.test/assets/2025/wasm/cmg.worker.js';
  const original = function () { return 'original'; };
  window.CMGDecModule = original;
  assert.equal(window.CMGDecModule, original);
  assert.equal(window.__yspTvPlayerContextError, true);
});

test('non-functions and repeated factory assignments do not rewrap', () => {
  const { window } = load();
  window.CMGDecModule = null;
  assert.equal(window.CMGDecModule, null);
  const original = function () { return location.host; };
  window.CMGDecModule = original;
  const wrapped = window.CMGDecModule;
  window.CMGDecModule = original;
  assert.equal(window.CMGDecModule, wrapped);
  window.CMGDecModule = wrapped;
  assert.equal(window.CMGDecModule, wrapped);
});
