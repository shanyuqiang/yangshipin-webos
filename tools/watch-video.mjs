// Node 22+: node tools/watch-video.mjs <inspect-http-endpoint> <20..600 seconds> [target-id]
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export function analyzeSamples(samples) {
  const result = { passed: false, reason: 'incomplete_observation', progressSeconds: 0, observedSeconds: 0, frameCheck: 'unavailable', smoothness: 'unverified' };
  if (samples.length < 2 || samples.at(-1).elapsed - samples[0].elapsed < 20) return result;
  if (samples.some(sample => sample.error)) return { ...result, reason: 'media_error' };
  const stable = samples.filter(sample => sample.elapsed >= samples[0].elapsed + 10);
  if (stable.length < 2) return result;
  if (stable.some(sample => sample.visible === false)) return { ...result, reason: 'background_observation' };
  if (stable.some(sample => !sample.exists || !Number.isFinite(sample.currentTime))) return { ...result, reason: 'no_video' };
  if (stable.some(sample => !(sample.width > 0 && sample.height > 0))) return { ...result, reason: 'no_video_dimensions' };
  if (stable.some(sample => sample.paused !== false)) return { ...result, reason: 'paused' };
  const hasFrameCounts = stable.every(sample => Number.isFinite(sample.decodedFrames) && sample.decodedFrames >= 0);
  const frameCheck = !hasFrameCounts ? 'unavailable' : stable.at(-1).decodedFrames > stable[0].decodedFrames ? 'passed' : 'failed';
  if (frameCheck === 'failed') return { ...result, reason: 'no_decoded_frames', frameCheck };
  const observedSeconds = stable.at(-1).elapsed - stable[0].elapsed;
  const progressSeconds = stable.at(-1).currentTime - stable[0].currentTime;
  let lastAdvance = stable[0].elapsed;
  let longestStall = 0;
  let lowBufferStallIntervals = 0;
  let bufferedStallIntervals = 0;
  let monotonicFrames = hasFrameCounts && Number.isFinite(stable[0].droppedFrames) && stable[0].droppedFrames >= 0;
  for (let index = 1; index < stable.length; index++) {
    const previous = stable[index - 1];
    const current = stable[index];
    monotonicFrames = monotonicFrames && Number.isFinite(current.droppedFrames)
      && current.droppedFrames >= previous.droppedFrames && current.decodedFrames >= previous.decodedFrames;
    if (current.currentTime < previous.currentTime - 0.1) return { ...result, reason: 'timeline_reset' };
    if (current.currentTime > previous.currentTime + 0.05) lastAdvance = current.elapsed;
    else {
      longestStall = Math.max(longestStall, current.elapsed - lastAdvance);
      if (Number.isFinite(current.bufferAhead) && current.bufferAhead <= 0.5) lowBufferStallIntervals++;
      if (Number.isFinite(current.bufferAhead) && current.bufferAhead >= 2) bufferedStallIntervals++;
    }
  }
  const reason = longestStall > 15 ? 'playback_stalled' : progressSeconds < observedSeconds * 0.75 ? 'insufficient_progress' : 'advancing';
  const droppedFrameRatio = monotonicFrames && frameCheck === 'passed'
    ? (stable.at(-1).droppedFrames - stable[0].droppedFrames) / (stable.at(-1).decodedFrames - stable[0].decodedFrames)
    : null;
  // This sampling check is a warning threshold, not certification of smooth output.
  const smoothness = droppedFrameRatio === null ? 'unverified' : droppedFrameRatio >= 0.05 ? 'dropped_frames' : 'no_drop_warning';
  const buffers = stable.map(sample => sample.bufferAhead).filter(Number.isFinite);
  return { passed: reason === 'advancing', reason, progressSeconds, observedSeconds, longestStallSeconds: longestStall,
    frameCheck, smoothness, droppedFrameRatio, lowBufferStallIntervals, bufferedStallIntervals, minBufferAheadSeconds: buffers.length ? Math.min(...buffers) : null };
}

export function selectTarget(targets, targetId) {
  const matches = targets.filter(target => {
    try {
      const url = new URL(target.url);
      return target.type === 'page' && ['127.0.0.1', 'localhost'].includes(url.hostname)
        && ['/tv/home', '/standalone'].includes(url.pathname) && (!targetId || target.id === targetId);
    } catch { return false; }
  });
  if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous_target' : 'no_target');
  return matches[0];
}

const expression = `(function(){
  var video=document.querySelector('video');
  var label=document.querySelector('#ysp-tv-shell-status,.tv-zhan-title');
  var ahead=null;
  if(video){
    ahead=0;
    for(var i=0;i<video.buffered.length;i++){
      if(video.buffered.start(i)<=video.currentTime+0.05 && video.buffered.end(i)>=video.currentTime)
        ahead=Math.max(ahead,video.buffered.end(i)-video.currentTime);
    }
  }
  return {exists:!!video,currentTime:video?video.currentTime:null,
    visible:document.visibilityState==='visible',bufferAhead:ahead,
    readyState:video?video.readyState:null,paused:video?video.paused:null,
    error:video&&video.error?video.error.code:null,
    width:video?video.videoWidth:null,height:video?video.videoHeight:null,
    decodedFrames:video?video.webkitDecodedFrameCount:null,
    droppedFrames:video?video.webkitDroppedFrameCount:null,
    programLabel:label?label.textContent.trim().slice(0,80):null};
}())`;

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => { socket.close(); reject(new Error('inspection_failed')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); socket.close(); reject(new Error('inspection_failed')); }, { once: true });
    socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('inspection_failed')); }, { once: true });
  });
}

let requestId = 0;
function evaluate(socket) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => done(new Error('inspection_failed')), 5000);
    function done(error, value) {
      clearTimeout(timer);
      socket.removeEventListener('message', message);
      socket.removeEventListener('close', closed);
      if (error) reject(error); else resolve(value);
    }
    function closed() { done(new Error('inspection_failed')); }
    function message(event) {
      let response;
      try { response = JSON.parse(event.data); } catch { return; }
      if (response.id !== id) return;
      const value = response.result?.result?.value;
      if (response.error || response.result?.exceptionDetails || !value) return closed();
      done(null, value);
    }
    socket.addEventListener('message', message);
    socket.addEventListener('close', closed, { once: true });
    try { socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); }
    catch { closed(); }
  });
}

function sanitize(value, elapsed) {
  const numeric = key => Number.isFinite(value[key]) ? value[key] : null;
  return { elapsed, exists: value.exists === true, currentTime: numeric('currentTime'),
    readyState: numeric('readyState'), paused: typeof value.paused === 'boolean' ? value.paused : null,
    visible: typeof value.visible === 'boolean' ? value.visible : null, bufferAhead: numeric('bufferAhead'),
    error: numeric('error'), width: numeric('width'), height: numeric('height'),
    decodedFrames: numeric('decodedFrames'), droppedFrames: numeric('droppedFrames'),
    programLabel: typeof value.programLabel === 'string' ? value.programLabel.slice(0, 80).replace(/https?:\/\/\S+/g, '[redacted]') : null };
}

export async function watchVideo(endpoint, duration, targetId) {
  const samples = [];
  let socket;
  let deadline;
  try {
    if (!Number.isInteger(duration) || duration < 20 || duration > 600) throw new Error('invalid_arguments');
    const base = new URL(endpoint);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('invalid_arguments');
    const response = await fetch(new URL('/json/list', base), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('inspection_failed');
    const target = selectTarget(await response.json(), targetId);
    const address = new URL(target.webSocketDebuggerUrl);
    address.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    address.host = base.host;
    socket = await connect(address.href);
    deadline = setTimeout(() => socket.close(), (duration + 10) * 1000);
    let start;
    while (true) {
      const value = await evaluate(socket);
      if (start === undefined) start = performance.now();
      const elapsed = samples.length ? (performance.now() - start) / 1000 : 0;
      samples.push(sanitize(value, elapsed));
      if (elapsed >= duration) break;
      await sleep(Math.min(5000, (duration - elapsed) * 1000));
    }
    return { durationSeconds: duration, ...analyzeSamples(samples), samples };
  } catch (error) {
    const known = ['invalid_arguments', 'no_target', 'ambiguous_target'];
    return { passed: false, reason: known.includes(error.message) ? error.message : 'inspection_failed', samples };
  } finally {
    clearTimeout(deadline);
    if (socket) socket.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const duration = Number(process.argv[3]);
  const budget = Number.isInteger(duration) && duration >= 20 && duration <= 600 ? duration + 25 : 25;
  const watchdog = setTimeout(() => {
    process.stdout.write(JSON.stringify({ passed: false, reason: 'overall_timeout', samples: [] }) + '\n');
    process.exit(1);
  }, budget * 1000);
  const report = await watchVideo(process.argv[2], duration, process.argv[4]);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n', () => {
    clearTimeout(watchdog);
    process.exit(report.passed ? 0 : 1);
  });
}
