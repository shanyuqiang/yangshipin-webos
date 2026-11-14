const {test, expect} = require('@playwright/test');

test('TV focus and category browsing leave the live channel playing until confirmation', async ({page}) => {
  await page.goto('/tv-shell');
  const tv = page.getByRole('main', {name:'央视频直播'});
  await expect(tv.getByRole('button', {name:'CCTV1'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tv.getByRole('button', {name:'CCTV2'})).toBeFocused();
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(tv.getByRole('button', {name:'CCTV2'})).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(tv.getByRole('button', {name:'湖南卫视'})).toBeFocused();
  expect(await page.evaluate(() => window.calls)).toEqual(['group:0', 'channel:2']);
  await page.keyboard.press('Enter');
  await expect(tv.getByRole('button', {name:'湖南卫视'})).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => window.calls)).toEqual(['group:0', 'channel:2', 'group:1', 'channel:3']);
});

test('fullscreen ignores hidden controls and Back restores the TV controls', async ({page}) => {
  await page.goto('/tv-shell');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name:'画质', includeHidden:true})).toBeAttached();
  await expect(page.getByRole('button', {name:'返回', includeHidden:true})).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {keyCode:461})));
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByRole('button', {name:'全屏'})).toBeFocused();
});

test('guide dates can be changed and later programmes are reachable without switching channels', async ({page}) => {
  await page.goto('/tv-shell');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name:'11/15'})).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('01:00 第二条')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('03:00 第四条')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('节目单仅供查看');
  const back = () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {keyCode:461})));
  await back();
  await expect(page.getByRole('button', {name:'11/15'})).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {keyCode:461, repeat:true})));
  await expect(page.getByRole('button', {name:'11/15'})).toBeFocused();
  await back();
  await expect(page.getByRole('button', {name:'全屏'})).toBeFocused();
  expect(await page.evaluate(() => window.closedByApp)).toBe(0);
  expect(await page.evaluate(() => window.calls)).toEqual(['date:20261115']);
  await back();
  expect(await page.evaluate(() => window.closedByApp)).toBe(1);
});

test('quality menu uses the current player and identifies the active resolution', async ({page}) => {
  await page.goto('/tv-shell');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name:'蓝光 1080P'})).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { window.replacePlayer(); });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.calls)).toEqual(['quality:replacement:shd']);
  await expect(page.getByRole('button', {name:'画质'})).toBeFocused();
});

test('failed playback requests show an error in the visible TV interface', async ({page}) => {
  await page.route('**/proxy?**', route => route.abort());
  await page.goto('/tv-shell');
  await page.evaluate(() => fetch('https://player-api.yangshipin.cn/v1/player/auth').catch(() => {}));
  await expect(page.getByRole('main', {name:'央视频直播'}).getByRole('status')).toContainText('网络请求失败');
});

test('Back closes the login dialog before returning to the TV interface', async ({page}) => {
  await page.goto('/tv-shell');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('手机号')).toBeVisible();
  await expect(page.locator('#desktop-nav')).toBeHidden();
  await expect(page.getByRole('main', {name:'央视频直播'})).toBeVisible();
  const back = () => page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {keyCode:461, bubbles:true})));
  await back();
  await expect(page.getByLabel('手机号')).toBeHidden();
  await back();
  await expect(page.getByRole('main', {name:'央视频直播'}).getByRole('button', {name:'账号'})).toBeFocused();
  expect(await page.evaluate(() => window.closedByApp)).toBe(0);
});

test('startup keeps the desktop page hidden while the TV controls load', async ({page}) => {
  await page.goto('/tv-shell?pending');
  await expect(page.getByRole('heading', {name:'央视频直播'})).toBeVisible();
  await expect(page.getByText('正在加载频道…')).toBeVisible();
  await expect(page.locator('#desktop-nav')).toBeHidden();
});

test('standalone account dialog can return to TV even if SDK rewrites body classes', async ({page}) => {
  await page.goto('/tv-shell?standalone');
  await page.getByRole('main', {name:'央视频直播'}).getByRole('button', {name:'账号'}).click();
  await expect(page.getByLabel('手机号')).toBeVisible();
  await expect(page.locator('#desktop-nav')).toBeHidden();
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {keyCode:461, bubbles:true})));
  await expect(page.getByLabel('手机号')).toBeHidden();
  await expect(page.getByRole('main', {name:'央视频直播'}).getByRole('button', {name:'账号'})).toBeFocused();
  expect(await page.evaluate(() => window.closedByApp)).toBe(0);
});

test('sustained buffering is shown without moving focus and clears when video resumes', async ({page}) => {
  await page.goto('/tv-shell');
  const cctv = page.getByRole('button', {name:'CCTV1'});
  await expect(cctv).toBeFocused();
  await page.locator('video').dispatchEvent('waiting');
  const buffering = page.getByText('正在缓冲…', {exact:true});
  await expect(buffering).toBeVisible({timeout:4000});
  await expect(cctv).toBeFocused();
  await page.locator('video').dispatchEvent('playing');
  await expect(buffering).toBeHidden();
});

test('confirming the current channel cancels a queued switch', async ({page}) => {
  await page.goto('/tv-shell');
  await page.evaluate(() => {
    const slots = [];
    window.requestAnimationFrame = callback => slots.push(callback);
    const buttons = document.querySelectorAll('.tv-shell-channels button');
    buttons[1].click();
    buttons[0].click();
    slots.forEach(callback => callback());
  });
  await expect(page.getByRole('button', {name:'CCTV1'})).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('status')).not.toContainText('正在切换');
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

test('TV retry restarts only the current stream and preserves focus', async ({page}) => {
  await page.goto('/tv-shell?standalone');
  const retry = page.getByRole('button', {name:'重试播放'});
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(retry).toBeFocused();
  await expect(page.getByRole('button', {name:'CCTV1'})).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('status')).toContainText('正在重试');
  expect(await page.evaluate(() => window.calls)).toEqual(['retry:1']);
});

test('standalone can change its mind while a quality selection is loading', async ({page}) => {
  await page.goto('/tv-shell?standalone');
  await page.evaluate(() => {
    const vm = window.yspStandaloneTV;
    vm.selectPlaybackQuality = definition => {
      window.calls.push('choose:'+definition);
      vm.$refs.player.myPoster = null;
    };
  });
  const open = () => page.getByRole('button', {name:'画质', exact:true}).click();
  await open();
  await page.getByRole('button', {name:'超清 720P'}).click();
  await open();
  await page.getByRole('button', {name:'蓝光 1080P'}).click();
  expect(await page.evaluate(() => window.calls)).toEqual(['choose:shd','choose:fhd']);
});
