const {test, expect} = require('@playwright/test');
const fs = require('node:fs/promises');

test.beforeEach(async ({page}) => {
  await page.coverage.startJSCoverage();
  await page.addInitScript(() => { window.close = () => { window.testCloseCount = (window.testCloseCount || 0) + 1; }; });
});
test.afterEach(async ({page}, info) => {
  const coverage = (await page.coverage.stopJSCoverage()).filter(entry => /\/(adapter|start)\.js$/.test(entry.url));
  const file = info.outputPath('browser-v8-coverage.json');
  await fs.writeFile(file, JSON.stringify(coverage));
  await info.attach('browser-v8-coverage', {path:file, contentType:'application/json'});
});
async function back(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchKeyEvent', {type:'keyDown', key:'BrowserBack', code:'BrowserBack', windowsVirtualKeyCode:461, nativeVirtualKeyCode:461});
  await session.send('Input.dispatchKeyEvent', {type:'keyUp', key:'BrowserBack', code:'BrowserBack', windowsVirtualKeyCode:461, nativeVirtualKeyCode:461});
  await session.detach();
}

test('trusted direction keys and Enter activate the official-style channel control', async ({page}) => {
  await page.goto('/fixture');
  await expect(page.getByRole('button', {name:'全屏', exact:true})).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-channel="CCTV2"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-channel="CCTV1"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#channel')).toHaveText('CCTV2');
});

test('fullscreen enters through Enter and webOS Back returns without closing', async ({page}) => {
  await page.goto('/fixture');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await back(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  expect(await page.evaluate(() => window.testCloseCount || 0)).toBe(0);
});

test('network failure is visible and remains an error to the caller', async ({page}) => {
  await page.route('**/proxy?**', route => route.abort('internetdisconnected'));
  await page.goto('/fixture');
  const rejected = await page.evaluate(() => fetch('https://player-api.yangshipin.cn/v1/player/auth').then(() => false, () => true));
  expect(rejected).toBe(true);
  await expect(page.locator('#ysp-tv-status')).toContainText('网络请求失败');
});

test('cookie bridge uses actual browser host-only storage and hides unrelated cookies', async ({page, context}) => {
  await context.addCookies([{name:'other_app', value:'unrelated', url:'http://127.0.0.1:41973'}]);
  await page.goto('/fixture');
  await page.evaluate(() => { document.cookie = 'guid=anonymous-test; Domain=.yangshipin.cn; Path=/tv; SameSite=Lax'; });
  expect(await page.evaluate(() => document.cookie)).toBe('guid=anonymous-test');
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'ysp_tv_guid')).toMatchObject({value:'anonymous-test', domain:'127.0.0.1', path:'/', sameSite:'Lax'});
  expect(cookies.some(cookie => cookie.name === 'guid')).toBe(false);
  await page.evaluate(() => { document.cookie = 'guid=; Domain=yangshipin.cn; Max-Age=0'; });
  expect(await page.evaluate(() => document.cookie)).toBe('');
  const priorStatus = await page.locator('#ysp-tv-status').textContent();
  await page.evaluate(() => { document.cookie = 'tracking=ignored; Secure'; document.cookie = 'ysp_strAccesstoken=; Secure'; });
  await expect(page.locator('#ysp-tv-status')).toHaveText(priorStatus);
  await page.evaluate(() => { document.cookie = 'ysp_strAccesstoken=secret-test; Secure'; });
  await expect(page.locator('#ysp-tv-status')).toContainText('不能保存');
  expect((await context.cookies()).some(cookie => cookie.name === 'ysp_tv_ysp_strAccesstoken')).toBe(false);
});

test('failed bootstrap focuses retry and webOS Back exits', async ({page}) => {
  await page.goto('/bootstrap');
  await expect(page.getByRole('status')).toContainText('启动失败');
  await expect(page.getByRole('button', {name:'重试'})).toBeFocused();
  await back(page);
  expect(await page.evaluate(() => window.testCloseCount)).toBe(1);
});

test('late official SDK assignment retains state while mapping two environment reads', async ({page}) => {
  await page.goto('/fixture');
  const result = await page.evaluate(() => {
    const actualLocation = window.location.href;
    const state = {marker:'unchanged'};
    window.cctvh5openapi = {state, get(path, extra) { return {path, extra, sameReceiver:this === window.cctvh5openapi}; }};
    const once = window.cctvh5openapi.get;
    window.cctvh5openapi = window.cctvh5openapi;
    return {
      host:window.cctvh5openapi.get('window.location.host'),
      protocol:window.cctvh5openapi.get('window.location.protocol'),
      other:window.cctvh5openapi.get('window.location.hostname', 'kept'),
      sameState:window.cctvh5openapi.state === state,
      sameWrapper:window.cctvh5openapi.get === once,
      sameLocation:window.location.href === actualLocation
    };
  });
  expect(result).toEqual({host:'www.yangshipin.cn', protocol:'https:', other:{path:'window.location.hostname', extra:'kept', sameReceiver:true}, sameState:true, sameWrapper:true, sameLocation:true});
});

test('real service failure HTML is retryable and handles webOS Back', async ({page}) => {
  const url = 'http://127.0.0.1:41974/tv/home';
  const response = await page.goto(url);
  expect(response.status()).toBe(502);
  await expect(page.getByRole('heading')).toHaveText('暂时无法加载央视频');
  await expect(page.getByRole('button', {name:'重试'})).toBeFocused();
  const retry = page.waitForResponse(url);
  await page.keyboard.press('Enter');
  expect((await retry).status()).toBe(502);
  await expect(page.getByRole('button', {name:'重试'})).toBeFocused();
  await back(page);
  expect(await page.evaluate(() => window.testCloseCount)).toBe(1);
});

test('remote retry returns from an upstream failure to the recovered page', async ({page}) => {
  const url = 'http://127.0.0.1:41974/tv/home?fixture=recovery-' + Date.now();
  expect((await page.goto(url)).status()).toBe(502);
  await expect(page.getByRole('button', {name:'重试'})).toBeFocused();
  const retry = page.waitForResponse(url);
  await page.keyboard.press('Enter');
  expect((await retry).status()).toBe(200);
  await expect(page.locator('h1').filter({hasText:'央视频已恢复'})).toBeAttached();
  await expect(page.getByText('正在加载频道…')).toBeVisible();
});

test('TV toolbar stays within 1080p safe area and has readable text at focus edges', async ({page}) => {
  await page.setViewportSize({width:1920, height:1080});
  await page.goto('/fixture');
  const bar = page.locator('#ysp-tv-tools');
  const rect = await bar.boundingBox();
  expect(rect.x + rect.width).toBeLessThanOrEqual(1830);
  expect(rect.y + rect.height).toBeLessThanOrEqual(1020);
  expect(rect.x).toBeGreaterThanOrEqual(90);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name:'退出', exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name:'退出', exact:true})).toBeFocused();
  const sizes = await bar.locator('button,span,p').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(sizes.every(size => size >= 24)).toBe(true);
});

test('official channel and programme text remains readable with rights labels intact', async ({page}) => {
  await page.setViewportSize({width:1920, height:1080});
  await page.goto('/readability');
  const text = page.locator('.tv-main-con-r-list-left-imga > span,.tv-main-con-r-list-left-imgb > span,.tv-zhan-list-week-item-t-a,.tv-zhan-list-b-r-item > div');
  const sizes = await text.evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(sizes.every(size => size >= 24)).toBe(true);
  await expect(page.getByText('VIP', {exact:true})).toBeVisible();
  await expect(page.getByText('节目标题（版权原因不可回看）', {exact:true})).toBeVisible();
  const image = await page.getByAltText('央视').boundingBox();
  expect(image.height).toBeGreaterThanOrEqual(32);
  await page.locator('.tv-main-con-r-list-left-imga').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tv-main-con-r-list-left-imgb')).toBeFocused();
});

test('remote input focus can leave before editing, and Back leaves editing before exiting', async ({page}) => {
  await page.goto('/input');
  const input = page.getByRole('searchbox', {name:'搜索'});
  await input.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name:'搜索频道'})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(input).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('CCTV');
  await page.keyboard.press('ArrowRight');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('CCTV');
  await back(page);
  await expect(input).not.toBeFocused();
  expect(await page.evaluate(() => window.testCloseCount || 0)).toBe(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name:'搜索频道'})).toBeFocused();
  await back(page);
  expect(await page.evaluate(() => window.testCloseCount)).toBe(1);
});

test('pointer click enters native editing and Enter still submits the official form', async ({page}) => {
  await page.goto('/input');
  const input = page.getByRole('searchbox', {name:'搜索'});
  await input.click();
  await page.keyboard.type('CCTV1');
  await page.keyboard.press('ArrowLeft');
  await expect(input).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-submitted', 'yes');
  await back(page);
  expect(await page.evaluate(() => window.testCloseCount || 0)).toBe(0);
});

test('two-line dates fit all date containers without overlapping the programme list', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/readability');
  const metrics = await page.locator('.tv-zhan-list-week,.tv-zhan-list-week2,.tv-zhan-list-week-item,.tv-zhan-list-week-item-t').evaluateAll(elements => elements.map(element => ({client:element.clientHeight, scroll:element.scrollHeight})));
  for (const metric of metrics) expect(metric.scroll).toBeLessThanOrEqual(metric.client);
  const date = await page.locator('.tv-zhan-list-week-item-t-a').boundingBox();
  const programme = await page.locator('.tv-zhan-list-b-r-item').boundingBox();
  expect(date.y+date.height).toBeLessThanOrEqual(programme.y);
});

test('remote hover opens account menu without clicking the membership link or sending SMS', async ({page}) => {
  await page.goto('/login');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.header-b-r-item5')).toBeFocused();
  await expect(page.locator('.winA-mask-unLogin-bottom-img')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.winA-mask-unLogin-bottom-img')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox',{name:'手机号'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox',{name:'验证码'})).toBeFocused();
  expect(await page.locator('body').getAttribute('data-membership')).toBeNull();
  expect(await page.locator('body').getAttribute('data-agreed')).toBeNull();
  expect(await page.locator('body').getAttribute('data-sms')).toBeNull();
});
