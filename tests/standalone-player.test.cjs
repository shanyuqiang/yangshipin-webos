const {test} = require('node:test');
const assert = require('node:assert/strict');
const {notifyVideoReady} = require('../service/standalone');

test('repeated readiness notification keeps the active video playing and preserves SDK side effects', () => {
  let pauses = 0;
  const video = {paused:false, pause() { pauses++; }};
  const original = video.pause;
  const player = {myVideo:{myvideo:video}, volume:0};
  const onReady = function (event) { video.pause(); this.volume = event.volume; };
  notifyVideoReady(player, onReady, {volume:0.5});
  assert.equal(pauses, 0);
  assert.equal(player.volume, 0.5);
  assert.equal(video.pause, original);
  video.pause();
  assert.equal(pauses, 1);
  video.paused = true;
  notifyVideoReady(player, onReady, {volume:1});
  assert.equal(pauses, 2);
});

test('restores native pause even if the official readiness handler fails', () => {
  const prototype = {pause() {}};
  const video = Object.assign(Object.create(prototype), {paused:false});
  const player = {myVideo:{myvideo:video}};
  assert.throws(() => notifyVideoReady(player, () => { throw new Error('failure'); }, {}), /failure/);
  assert.equal(Object.hasOwn(video, 'pause'), false);
  assert.equal(video.pause, prototype.pause);
});
