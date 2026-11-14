const assert = require('node:assert/strict');
const test = require('node:test');
const load = () => import('../tools/watch-video.mjs');
const sample = (elapsed, currentTime = elapsed, extra = {}) => ({ elapsed, exists: true, currentTime, readyState: 4, paused: false, error: null, width: 1920, height: 1080, decodedFrames: elapsed * 25, droppedFrames: 0, channel: 'CCTV1', ...extra });

test('normal progression passes after bounded startup grace', async () => {
  const { analyzeSamples } = await load();
  const result = analyzeSamples([sample(0, 0, {exists:false}), sample(5, 0), sample(10, 5), sample(15, 10), sample(20, 15)]);
  assert.equal(result.passed, true);
  assert.equal(result.progressSeconds, 10);
});

test('stalled or substantially slow playback fails', async () => {
  const { analyzeSamples } = await load();
  assert.equal(analyzeSamples([0,5,10,15,20,25,30].map(t => sample(t, 1))).passed, false);
  const slow = analyzeSamples([0,5,10,15,20].map(t => sample(t, t * 0.2)));
  assert.equal(slow.reason, 'insufficient_progress');
});

test('decoding failures and absent video fail without exposing arbitrary messages', async () => {
  const { analyzeSamples } = await load();
  assert.equal(analyzeSamples([sample(0), sample(10), sample(20, 0, {error:3})]).reason, 'media_error');
  assert.equal(analyzeSamples([0,10,20].map(t => sample(t, 0, {exists:false}))).reason, 'no_video');
  assert.equal(analyzeSamples([]).passed, false);
  assert.equal(analyzeSamples([sample(0), sample(10)]).passed, false);
});

test('inspection selects only an unambiguous local TV page', async () => {
  const { selectTarget } = await load();
  const target = {id:'one', type:'page', url:'http://127.0.0.1:1234/standalone?pid=1'};
  assert.equal(selectTarget([target]), target);
  assert.throws(() => selectTarget([target, {...target,id:'two'}]), /ambiguous_target/);
  assert.equal(selectTarget([target, {...target,id:'two'}], 'two').id, 'two');
  assert.throws(() => selectTarget([{...target,url:'https://www.yangshipin.cn/tv/home'}]), /no_target/);
  assert.throws(() => selectTarget([{...target,url:'http://127.0.0.1:1234/tv/home'}]), /no_target/);
});

test('CLI arguments and target discovery fail with reports that omit endpoint information', async () => {
  const { watchVideo } = await load();
  for (const duration of [0, 19, 601, NaN]) assert.equal((await watchVideo('http://private-host/', duration)).reason, 'invalid_arguments');
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/json/list');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify([{type:'page',id:'one',url:'https://private-host/cookie=secret'}]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const report = await watchVideo('http://127.0.0.1:' + server.address().port, 20);
    assert.equal(report.reason, 'no_target');
    assert.doesNotMatch(JSON.stringify(report), /127\.0\.0\.1|private-host|cookie|secret/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('advancing clock cannot pass without visible dimensions or while paused', async () => {
  const { analyzeSamples } = await load();
  const times = [0,5,10,15,20];
  assert.equal(analyzeSamples(times.map(t => sample(t,t,{width:0,height:0}))).passed, false);
  assert.equal(analyzeSamples(times.map(t => sample(t,t,{paused:true}))).reason, 'paused');
});

test('available decoded-frame counts must advance and unavailable counts are explicitly reported', async () => {
  const { analyzeSamples } = await load();
  const times = [0,5,10,15,20];
  const frozen = analyzeSamples(times.map(t => sample(t,t,{decodedFrames:0})));
  assert.equal(frozen.passed, false);
  assert.equal(frozen.reason, 'no_decoded_frames');
  assert.equal(frozen.frameCheck, 'failed');
  assert.equal(frozen.strictSmoothness, 'failed');
  const unavailable = analyzeSamples(times.map(t => sample(t,t,{decodedFrames:null})));
  assert.equal(unavailable.passed, true);
  assert.equal(unavailable.frameCheck, 'unavailable');
  assert.equal(analyzeSamples(times.map(t => sample(t))).frameCheck, 'passed');
});

test('foreground playback reports distinguish an empty buffer from a buffered stall', async () => {
  const {analyzeSamples} = await load();
  const samples = [sample(0), sample(10), sample(15, 10, {bufferAhead:0.1}),
    sample(20, 10, {bufferAhead:8}), sample(25, 15, {bufferAhead:4})];
  const result = analyzeSamples(samples);
  assert.equal(result.lowBufferStallIntervals, 1);
  assert.equal(result.bufferedStallIntervals, 1);
  assert.equal(result.minBufferAheadSeconds, 0.1);
  assert.equal(analyzeSamples(samples.map(s => ({...s, visible:false}))).reason, 'background_observation');
});

test('decoding pass does not certify smooth playback when dropped frames are excessive', async () => {
  const {analyzeSamples} = await load();
  const result = analyzeSamples([0,5,10,15,20,25,30].map(t => sample(t,t,{droppedFrames:t*2})));
  assert.equal(result.passed, true);
  assert.equal(result.smoothness, 'dropped_frames');
  assert.equal(result.droppedFrameRatio, 0.08);
});

test('smoothness is unverified when frame counters are missing or reset', async () => {
  const {analyzeSamples} = await load();
  const times = [0,5,10,15,20,25,30];
  for (const samples of [
    times.map(t => sample(t,t,{droppedFrames:null})),
    times.map(t => sample(t,t,{droppedFrames:t===15?7:t===20?2:0}))
  ]) assert.equal(analyzeSamples(samples).smoothness, 'unverified');
});

test('strict smoothness requires a full foreground run with no waiting or dropped frames', async () => {
  const {analyzeSamples} = await load();
  const clean = Array.from({length:311}, (_, t) => sample(t,t,{visible:true,waitingCount:0,seekingCount:0,videoGeneration:1}));
  assert.equal(analyzeSamples(clean).strictSmoothness, 'passed');
  assert.equal(analyzeSamples(clean.slice(0, 30)).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(clean.map(s => ({...s, waitingCount:s.elapsed >= 30 ? 1 : 0}))).strictSmoothness, 'failed');
  assert.equal(analyzeSamples(clean.map(s => ({...s, droppedFrames:s.elapsed >= 30 ? 1 : 0}))).strictSmoothness, 'failed');
  assert.equal(analyzeSamples(clean.map(s => ({...s, seekingCount:s.elapsed >= 30 ? 1 : 0}))).strictSmoothness, 'failed');
  assert.equal(analyzeSamples(clean.map(s => ({...s, waitingCount:null}))).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(clean.map(s => ({...s, videoGeneration:null}))).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(clean.filter(s => s.elapsed % 5 === 0)).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(clean.map(s => s.elapsed >= 30 && s.elapsed <= 40 ? {...s,decodedFrames:29*25} : s)).strictSmoothness, 'failed');
  assert.equal(analyzeSamples(clean.slice(0, 50).map(s => ({...s,waitingCount:s.elapsed >= 30 ? 1 : 0}))).strictSmoothness, 'failed');
  assert.equal(analyzeSamples(clean.map(s => ({...s,videoGeneration:s.elapsed >= 30 ? 2 : 1}))).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(clean.map(s => s.elapsed === 29 ? {...s,currentTime:28} : s)).strictSmoothness, 'failed');
});

test('strict CLI rejects a duration too short to establish smoothness', async () => {
  const {spawnSync} = require('node:child_process');
  const path = require('node:path');
  const cli = path.join(__dirname, '../tools/watch-video.mjs');
  for (const duration of ['20', '310']) {
    const result = spawnSync(process.execPath, [cli, 'http://127.0.0.1:1', duration, '--strict'], {encoding:'utf8', timeout:5000});
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reason, 'strict_duration_too_short');
    assert.equal(report.acceptancePassed, false);
  }
});

test('TV sampling uses its own clock and releases listeners at the end of a run', async () => {
  const { captureOnPage, readVideoSample } = await load();
  const {runInNewContext} = require('node:vm');
  let now = 0;
  let timer;
  const video = new EventTarget();
  Object.assign(video, {currentTime:0, buffered:{length:0}, paused:false, videoWidth:1280, videoHeight:720});
  const document = new EventTarget();
  Object.assign(document, {visibilityState:'visible', querySelector:selector => selector === 'video' ? video : null});
  const completion = runInNewContext(readVideoSample + ';(' + captureOnPage + ')(0.6)', {
    document, performance:{now:()=>now},
    setInterval(fn) { timer = fn; return 1; },
    clearInterval() { timer = null; }
  });
  now = 250;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.visibilityState = 'visible';
  video.dispatchEvent(new Event('waiting'));
  timer();
  now = 700;
  timer();
  const samples = await completion;
  assert.deepEqual(Array.from(samples, row => row.elapsed), [0, 0.25, 0.7]);
  assert.equal(samples.at(-1).waitingCount, 1);
  assert.deepEqual(Array.from(samples, row => row.visible), [true, false, true]);
  assert.equal(timer, null);
});

test('strict playback certifies a single resolution after startup grace', async () => {
  const { analyzeSamples } = await load();
  const clean = Array.from({length:311}, (_, t) => sample(t,t,{visible:true,waitingCount:0,seekingCount:0,videoGeneration:1}));
  const resized = clean.map(s => s.elapsed === 160 ? {...s,width:960,height:540} : s);
  assert.equal(analyzeSamples(resized).strictSmoothness, 'unverified');
  assert.equal(analyzeSamples(resized.map(s=>({...s,droppedFrames:s.elapsed >= 165 ? 1 : 0}))).strictSmoothness,'failed');
  const warmup = clean.map(s => s.elapsed < 10 ? {...s,width:960,height:540} : s);
  assert.deepEqual(analyzeSamples(warmup).observedResolutions, ['1920x1080']);
  assert.equal(analyzeSamples(warmup).strictSmoothness, 'passed');
});
