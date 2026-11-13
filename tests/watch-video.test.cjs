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
  const target = {id:'one', type:'page', url:'http://127.0.0.1:1234/tv/home?pid=1'};
  assert.equal(selectTarget([target]), target);
  assert.throws(() => selectTarget([target, {...target,id:'two'}]), /ambiguous_target/);
  assert.equal(selectTarget([target, {...target,id:'two'}], 'two').id, 'two');
  assert.throws(() => selectTarget([{...target,url:'https://www.yangshipin.cn/tv/home'}]), /no_target/);
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
  const unavailable = analyzeSamples(times.map(t => sample(t,t,{decodedFrames:null})));
  assert.equal(unavailable.passed, true);
  assert.equal(unavailable.frameCheck, 'unavailable');
  assert.equal(analyzeSamples(times.map(t => sample(t))).frameCheck, 'passed');
});
