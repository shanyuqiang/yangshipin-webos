const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function setup(page, failure) {
  const source = await fs.readFile('service/session.js', 'utf8');
  await page.route('**/session.js', route => route.fulfill({contentType: 'application/javascript; charset=utf-8', body: source}));
  await page.route('**/restore', route => route.fulfill({contentType: 'text/html; charset=utf-8', body:
    '<p id="status" role="status"></p><button id="retry">重试</button><script src="/session.js"></script>'}));
  await page.route('**/standalone', route => route.fulfill({contentType: 'text/html; charset=utf-8', body:
    '<p id="ysp-tv-status">restored</p><script src="/session.js"></script><script>window.yspLogin={default:{signout:function(){sessionStorage.setItem("originalSawCookie",String(document.cookie.includes("test-only")));return Promise.resolve(true)}}}</script>'}));
  await page.addInitScript(failure => {
    window.close = () => { window.closedForTest = true; };
    window.PalmServiceBridge = function () {
      this.call = (uri, body) => {
        const payload = JSON.parse(body);
        let response = {returnValue: true};
        if (uri.endsWith('/loadSession')) response = failure === 'load' ? {returnValue: false} : {
          returnValue: true, generation: 3, quality: 'shd',
          cookies: [{name: 'ysp_openid', value: 'test-only', expiresAt: failure === 'session-only' ? null : Date.now() + 60000}]
        };
        if (uri.endsWith('/saveSessionCookie')) sessionStorage.setItem('savedPayload', JSON.stringify(payload));
        if (uri.endsWith('/saveQuality')) sessionStorage.setItem('savedQualityPayload', JSON.stringify(payload));
        if (uri.endsWith('/clearSession')) response = failure === 'clear' ? {returnValue: false} : {returnValue: true, generation: 4};
        this.onservicecallback(JSON.stringify(response));
      };
    };
  }, failure || null);
}

test('private restore replaces stale credentials before opening the page and saves its generation', async ({page, context}) => {
  await setup(page);
  await context.addCookies([{name: 'ysp_tv_ysp_openid', value: 'stale', url: 'http://127.0.0.1:41973'}]);
  await page.goto('/restore');
  await expect(page).toHaveURL(/\/standalone$/);
  expect((await context.cookies()).find(c => c.name === 'ysp_tv_ysp_openid').value).toBe('test-only');
  await page.evaluate(() => window.__yspTvSessionCookieChanged('strVideotoken=test-only; Max-Age=60'));
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('savedPayload')));
  expect(saved).toMatchObject({name: 'strVideotoken', value: 'test-only', generation: 3});
});

test('failed private restore preserves browser credentials and exposes retry and Back', async ({page, context}) => {
  await setup(page, 'load');
  await context.addCookies([{name: 'ysp_tv_ysp_openid', value: 'prior-test-only', url: 'http://127.0.0.1:41973'}]);
  await page.goto('/restore');
  await expect(page.getByRole('status')).toContainText('原有记录未被清除');
  await expect(page.getByRole('button', {name: '重试'})).toBeFocused();
  expect((await context.cookies()).find(c => c.name === 'ysp_tv_ysp_openid').value).toBe('prior-test-only');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', {type:'keyDown', windowsVirtualKeyCode:461, nativeVirtualKeyCode:461});
  expect(await page.evaluate(() => window.closedForTest)).toBe(true);
  await cdp.detach();
});

test('signout revokes using the current cookie then clears persistent generation and reloads', async ({page, context}) => {
  await setup(page);
  await page.goto('/restore');
  await expect(page).toHaveURL(/\/standalone$/);
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => { window.yspLogin.default.signout(); });
  await reloaded;
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ysp-tv-session-generation'))).toBe('4');
  expect(await page.evaluate(() => sessionStorage.getItem('originalSawCookie'))).toBe('true');
  await expect.poll(async () => (await context.cookies()).some(c => c.name === 'ysp_tv_ysp_openid')).toBe(false);
});

test('same-service restart restores session-only cookies without making them persistent', async ({page, context}) => {
  await setup(page, 'session-only');
  await page.goto('/restore');
  await expect(page).toHaveURL(/\/standalone$/);
  const cookie = (await context.cookies()).find(c => c.name === 'ysp_tv_ysp_openid');
  expect(cookie.value).toBe('test-only');
  expect(cookie.expires).toBe(-1);
});

test('failed persistent signout is not reported as success and blocks late refresh saves', async ({page, context}) => {
  await setup(page, 'clear');
  await page.goto('/restore');
  await expect(page).toHaveURL(/\/standalone$/);
  const rejected = await page.evaluate(() => window.yspLogin.default.signout().then(() => false, () => true));
  expect(rejected).toBe(true);
  await expect(page.locator('#ysp-tv-status')).toContainText('请重试退出登录');
  await page.evaluate(() => window.__yspTvSessionCookieChanged('strVideotoken=late; Max-Age=60'));
  expect(await page.evaluate(() => sessionStorage.getItem('savedPayload'))).toBe(null);
  expect((await context.cookies()).find(c => c.name === 'ysp_tv_ysp_openid').value).toBe('test-only');
});

test('restored quality is available at startup and a manual choice is persisted privately', async ({page}) => {
  await setup(page);
  await page.goto('/restore');
  await expect(page).toHaveURL(/\/standalone$/);
  expect(await page.evaluate(() => sessionStorage.getItem('ysp-tv-quality'))).toBe('shd');
  await page.evaluate(() => window.__yspTvSaveQuality('hd'));
  expect(await page.evaluate(() => sessionStorage.getItem('ysp-tv-quality'))).toBe('hd');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('savedQualityPayload')))).toEqual({quality:'hd'});
});
