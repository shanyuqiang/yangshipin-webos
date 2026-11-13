const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function boot(response) {
  const status = { textContent: '' };
  const retry = { focus() {}, addEventListener() {} };
  const assigned = [];
  const listeners = {};
  let closed = false;
  const context = {
    document: { getElementById: id => id === 'status' ? status : retry, addEventListener: (name, fn) => { listeners[name] = fn; } },
    window: { location: { replace: url => assigned.push(url) }, close() { closed = true; } },
    setTimeout: () => 1, clearTimeout() {},
    PalmServiceBridge: function () {
      this.call = (uri, body) => {
        assert.equal(uri, 'luna://com.shanyuqiang.yangshipin.service/start');
        assert.deepEqual(JSON.parse(body), {});
        this.onservicecallback(JSON.stringify(response));
      };
    }
  };
  context.window.PalmServiceBridge = context.PalmServiceBridge;
  vm.runInNewContext(fs.readFileSync('app/start.js', 'utf8'), context);
  return { assigned, status, back() { listeners.keydown({keyCode: 461, preventDefault() {}}); return closed; } };
}

test('opens only the local TV service page', () => {
  assert.deepEqual(boot({ returnValue: true, url: 'http://127.0.0.1:42123/restore' }).assigned,
    ['http://127.0.0.1:42123/restore']);
});

test('Back exits even when startup fails', () => {
  assert.equal(boot({ returnValue: false }).back(), true);
});

test('rejects remote service destination and shows retryable failure', () => {
  for (const response of [{ returnValue: false }, { returnValue: true, url: 'https://evil.test/tv/home' }]) {
    const result = boot(response);
    assert.equal(result.assigned.length, 0);
    assert.match(result.status.textContent, /重试/);
  }
});
