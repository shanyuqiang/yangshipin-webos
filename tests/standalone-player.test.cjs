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

test('the live player bounds retained history and leaves other HLS options intact', () => {
  const {configureLiveHls} = require('../service/standalone');
  const defaults = {backBufferLength:Infinity, maxBufferLength:30, enableWorker:false};
  configureLiveHls({DefaultConfig:defaults}, {});
  assert.deepEqual(defaults, {backBufferLength:24, maxBufferLength:30, enableWorker:false});
  const shorter = {backBufferLength:12};
  configureLiveHls({DefaultConfig:shorter}, {});
  assert.equal(shorter.backBufferLength,12);
  assert.doesNotThrow(() => configureLiveHls(undefined, {}));
});

test('SDK quality resets and repeated source setup release the old heartbeat', () => {
  const {manageLiveHeartbeat} = require('../service/standalone');
  const cleared = [];
  const live = {
    cycleInterTime: 1,
    initTimes() { this.cycleInterTime = null; },
    initStep5(value) { this.cycleInterTime = value; }
  };
  const dispose = manageLiveHeartbeat(live, id => cleared.push(id));
  live.initTimes();
  live.initStep5(2);
  live.initStep5(3);
  dispose();
  live.initStep5(4);
  assert.deepEqual(cleared, [1, 2, 3]);
  assert.equal(live.cycleInterTime, null);
});

test('live HLS reads fragments progressively on platforms with fetch streams', () => {
  const {configureLiveHls} = require('../service/standalone');
  const defaults = {backBufferLength:Infinity, progressive:false, maxBufferLength:30};
  configureLiveHls({DefaultConfig:defaults}, globalThis);
  assert.deepEqual(defaults, {backBufferLength:24, progressive:true, maxBufferLength:30});

  const legacy = {backBufferLength:12, progressive:false};
  configureLiveHls({DefaultConfig:legacy}, {fetch() {}});
  assert.deepEqual(legacy, {backBufferLength:12, progressive:false});
});

test('guide follows midnight once and keeps explicitly selected dates', () => {
  const {rollGuideDate} = require('../service/standalone');
  const channel = {programDates:['2026-11-13','2026-11-14']};
  const requests = [];
  const guide = {tvIndex:channel, followGuideToday:true, jiemuNowDate:'20261114', changeDay(day) {
    requests.push(day);
    this.jiemuNowDate = day;
  }};
  rollGuideDate(guide, '2026-11-14', '2026-11-15');
  rollGuideDate(guide, '2026-11-15', '2026-11-15');
  assert.deepEqual(requests, ['20261115']);
  assert.equal(guide.tvIndex, channel);
  assert.deepEqual(guide.guideDates.at(-1), {day:'11/15',fullDay:'20261115'});

  guide.followGuideToday = false;
  guide.jiemuNowDate = '20261113';
  rollGuideDate(guide, '2026-11-15', '2026-11-16');
  assert.deepEqual(requests, ['20261115']);
  assert.equal(guide.jiemuNowDate, '20261113');
});
