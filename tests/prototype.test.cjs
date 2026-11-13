const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function start(failNavigation = false) {
  const events = {};
  const opened = [];
  let closed = 0;
  let active;
  const buttons = ['open', 'exit'].map(id => ({
    id,
    listeners: {},
    focus() { active = id; if (this.listeners.focus) this.listeners.focus(); },
    click() { this.listeners.click(); },
    addEventListener(type, callback) { this.listeners[type] = callback; }
  }));
  const status = { textContent: '' };
  const document = {
    querySelectorAll: () => buttons,
    getElementById: () => status,
    addEventListener(type, callback) { events[type] = callback; }
  };
  const window = {
    location: { assign(url) {
      if (failNavigation) throw new Error('internal detail');
      opened.push(url);
    } },
    close() { closed += 1; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../prototype/app.js'), 'utf8'), { document, window }, { filename: path.join(__dirname, '../prototype/app.js') });
  return {
    buttons, opened, status,
    active: () => active,
    closed: () => closed,
    key(keyCode) {
      let prevented = false;
      events.keydown({ keyCode, preventDefault() { prevented = true; } });
      return prevented;
    }
  };
}

test('remote navigation moves focus and Enter opens only the official HTTPS page', () => {
  const app = start();
  assert.equal(app.active(), 'open');
  assert.equal(app.key(40), true);
  assert.equal(app.active(), 'exit');
  app.key(38);
  assert.equal(app.active(), 'open');
  app.key(13);
  assert.deepEqual(app.opened, ['https://www.yangshipin.cn/tv/home']);
});

test('left/right move focus; Enter on exit and webOS Back close the probe', () => {
  const app = start();
  app.key(39);
  assert.equal(app.active(), 'exit');
  app.key(37);
  assert.equal(app.active(), 'open');
  app.key(39);
  app.key(13);
  app.key(461);
  assert.equal(app.closed(), 2);
  assert.deepEqual(app.opened, []);
  assert.equal(app.key(65), false);
});

test('pointer click uses the same official destination', () => {
  const app = start();
  app.buttons[0].click();
  app.buttons[1].click();
  assert.deepEqual(app.opened, ['https://www.yangshipin.cn/tv/home']);
  assert.equal(app.closed(), 1);
});

test('navigation failure is explained without internal error details', () => {
  const app = start(true);
  app.key(13);
  assert.match(app.status.textContent, /无法打开/);
  assert.doesNotMatch(app.status.textContent, /internal detail/);
});

test('package metadata isolates the probe and uses local entry point', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../prototype/appinfo.json'), 'utf8'));
  assert.equal(meta.id, 'com.shanyuqiang.yangshipin.prototype');
  assert.equal(meta.main, 'index.html');
  assert.equal(meta.disableBackHistoryAPI, true);
  assert.equal(meta.requiredPermissions, undefined);
});
