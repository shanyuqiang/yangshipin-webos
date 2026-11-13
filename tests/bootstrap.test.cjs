const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function boot(response) {
  const status = { textContent: '' };
  const retry = { focus() {}, addEventListener(name, fn) { listeners[name] = fn; } };
  const assigned = [];
  const listeners = {};
  let closed = false;
  const callbacks = [];
  const timers = new Map();
  let sequence = 0;
  const context = {
    document: { getElementById: id => id === 'status' ? status : retry, addEventListener: (name, fn) => { listeners[name] = fn; } },
    window: { location: { replace: url => assigned.push(url) }, close() { closed = true; } },
    setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
    clearTimeout(id) { timers.delete(id); },
    PalmServiceBridge: function () {
      this.call = (uri, body) => {
        assert.equal(uri, 'luna://com.shanyuqiang.yangshipin.service/start');
        assert.deepEqual(JSON.parse(body), {});
        callbacks.push(value => this.onservicecallback(JSON.stringify(value)));
        if (response !== undefined) this.onservicecallback(JSON.stringify(response));
      };
    }
  };
  context.window.PalmServiceBridge = context.PalmServiceBridge;
  vm.runInNewContext(fs.readFileSync('app/start.js', 'utf8'), context);
  return { assigned, status, callbacks, timers, retry: () => listeners.click(), back() { listeners.keydown({keyCode: 461, preventDefault() {}}); return closed; } };
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

test('retry ignores a timed-out startup response and navigates only once', () => {
  const result = boot();
  Array.from(result.timers.values())[0]();
  assert.match(result.status.textContent, /重试/);
  result.retry();
  result.callbacks[0]({returnValue:true,url:'http://127.0.0.1:42123/restore'});
  assert.deepEqual(result.assigned, []);
  assert.match(result.status.textContent, /正在启动/);
  result.callbacks[1]({returnValue:true,url:'http://127.0.0.1:42124/restore'});
  result.callbacks[1]({returnValue:true,url:'http://127.0.0.1:42125/restore'});
  assert.deepEqual(result.assigned, ['http://127.0.0.1:42124/restore']);
});
