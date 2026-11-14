const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { PassThrough } = require('node:stream');
const { createServer } = require('../service/core');

function upstream(status, headers, body, calls) {
  return (options, callback) => {
    calls.push(options);
    const request = new PassThrough();
    request.setTimeout = () => request;
    request.on('finish', () => {
      if (status === 'error') { request.emit('error', new Error('secret')); return; }
      const response = new PassThrough();
      response.statusCode = status;
      response.headers = headers;
      callback(response);
      response.end(body);
    });
    request.resume();
    return request;
  };
}

async function withServer(request, run) {
  const server = createServer({ request });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  function get(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(origin + path, options, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end(options.body);
    });
  }
  try { await run(get, origin); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const proxy = url => '/proxy?url=' + encodeURIComponent(url);

test('only HTTPS approved hosts and default TLS port are forwarded', async () => {
  const calls = [];
  await withServer(upstream(200, {}, 'ok', calls), async get => {
    const bad = ['http://www.yangshipin.cn/a', 'https://www.yangshipin.cn.evil.test/a', 'https://a.ysp.cctv.cn.evil/a', 'https://user@www.yangshipin.cn/', 'https://www.yangshipin.cn:444/', 'https://127.0.0.1/', 'file:///etc/passwd'];
    for (const url of bad) assert.equal((await get(proxy(url))).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await get(proxy('https://player-api.yangshipin.cn/path?q=1'))).status, 200);
    assert.equal(calls[0].rejectUnauthorized, true);
    assert.equal(calls[0].path, '/path?q=1');
    assert.equal((await get(proxy('https://capi.yangshipin.cn/api/oms/pc/navigation/home_top_nav'))).status, 200);
    assert.equal(calls[1].hostname, 'capi.yangshipin.cn');
    assert.equal((await get(proxy('https://capi.yangshipin.cn.evil.test/'))).status, 403);
  });
});

test('range, media bytes and status survive; credentials and Origin do not leak to media', async () => {
  const calls = [];
  await withServer(upstream(206, { 'content-range': 'bytes 0-2/9', 'content-length': '3', 'content-type': 'video/mp2t', 'content-encoding': 'identity', 'set-cookie': 'secret=1' }, 'abc', calls), async (get, origin) => {
    const res = await get(proxy('https://a.ysp.cctv.cn/a.ts'), { headers: { origin, range: 'bytes=0-2', cookie: 'secret=1', authorization: 'Bearer secret' } });
    assert.equal(res.status, 206);
    assert.equal(res.text, 'abc');
    assert.equal(res.headers['content-range'], 'bytes 0-2/9');
    assert.equal(res.headers['content-encoding'], 'identity');
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(calls[0].headers.range, 'bytes=0-2');
    assert.equal(calls[0].headers['accept-encoding'], 'identity');
    for (const key of ['origin', 'cookie', 'authorization', 'host']) assert.equal(calls[0].headers[key], undefined);
  });
});

test('foreign origins, referers, hosts and unsupported methods never reach upstream', async () => {
  const calls = [];
  await withServer(upstream(200, {}, '', calls), async get => {
    for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { referer: 'https://evil.test/' }, { host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
      assert.equal((await get(proxy('https://www.yangshipin.cn/'), { headers })).status, 403);
    }
    assert.equal((await get(proxy('https://www.yangshipin.cn/'), { method: 'DELETE' })).status, 405);
    assert.equal(calls.length, 0);
  });
});

test('API requests receive only approved business headers and official origin', async () => {
  const calls = [];
  await withServer(upstream(200, { 'content-type': 'application/json' }, '{}', calls), async (get, origin) => {
    const res = await get(proxy('https://player-api.yangshipin.cn/v1/player/auth'), { method: 'POST', body: '{}', headers: { origin, 'content-type': 'application/json', yspticket: 'ephemeral', 'user-agent': 'TV-test-UA', 'x-unknown': 'ignored' } });
    assert.equal(res.status, 200);
    assert.equal(calls[0].headers.origin, 'https://www.yangshipin.cn');
    assert.equal(calls[0].headers.yspticket, 'ephemeral');
    assert.equal(calls[0].headers['user-agent'], 'TV-test-UA');
    assert.equal(calls[0].headers['x-unknown'], undefined);
  });
});

test('oversized bodies, redirects and upstream errors fail safely', async () => {
  const calls = [];
  await withServer(upstream(200, {}, '', calls), async get => {
    assert.equal((await get(proxy('https://www.yangshipin.cn/'), { method: 'POST', body: 'x'.repeat(1048577) })).status, 413);
    assert.equal(calls.length, 0);
  });
  await withServer(upstream(302, { location: 'https://evil.test/' }, '', []), async get => {
    const res = await get(proxy('https://www.yangshipin.cn/'));
    assert.equal(res.status, 502);
    assert.equal(res.headers.location, undefined);
  });
  await withServer(upstream('error', {}, '', []), async get => {
    const res = await get(proxy('https://www.yangshipin.cn/'));
    assert.equal(res.status, 502);
    assert.doesNotMatch(res.text, /secret/);
  });
});

test('official HTML keeps local navigation and receives adapter before its scripts', async () => {
  await withServer(upstream(200, { 'content-type': 'text/html' }, '<html><head><script src="/app.js"></script></head></html>', []), async (get, origin) => {
    const res = await get('/tv/home');
    assert.equal(res.status, 200);
    const declaredBase = res.text.match(/<base[^>]+href="([^"]+)/i);
    const effectiveBase = declaredBase ? declaredBase[1] : origin + '/tv/home';
    assert.equal(new URL('?pid=test-channel', effectiveBase).origin, origin);
    assert.doesNotMatch(res.text, /<base/i);
    assert.ok(res.text.indexOf(origin + '/adapter.js') < res.text.indexOf('/app.js'));
    assert.ok(res.text.indexOf(origin + '/player-context.js') >= 0);
    assert.ok(res.text.indexOf(origin + '/player-context.js') < res.text.indexOf(origin + '/session.js'));
    assert.ok(res.text.indexOf(origin + '/session.js') < res.text.indexOf(origin + '/adapter.js'));
    assert.equal((await get('/unknown')).status, 404);
  });
});

test('bad HTML and compressed HTML fail without emitting a corrupted page', async () => {
  for (const fixture of [
    { headers: { 'content-type': 'text/html' }, body: 'missing head' },
    { headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: 'compressed' },
    { headers: { 'content-type': 'application/json' }, body: '{}' },
    { headers: { 'content-type': 'text/html' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) }
  ]) {
    await withServer(upstream(200, fixture.headers, fixture.body, []), async get => {
      assert.equal((await get('/tv/home')).status, 502);
      assert.equal((await get('/tv/home', { method: 'POST' })).status, 405);
    });
  }
});

test('upstream timeout destroys the request and returns a bounded failure', async () => {
  let destroyed = false;
  const transport = () => {
    const request = new PassThrough();
    request.setTimeout = (milliseconds, callback) => {
      assert.equal(milliseconds, 10000);
      process.nextTick(callback);
    };
    request.on('close', () => { destroyed = true; });
    request.resume();
    return request;
  };
  await withServer(transport, async get => {
    assert.equal((await get(proxy('https://www.yangshipin.cn/'))).status, 502);
    assert.equal(destroyed, true);
  });
});

test('client disconnect closes both upstream response and upstream request', async () => {
  let source;
  let upstreamRequest;
  let disconnected;
  const closed = new Promise(resolve => { disconnected = resolve; });
  const transport = (options, callback) => {
    upstreamRequest = new PassThrough();
    upstreamRequest.setTimeout = () => {};
    upstreamRequest.resume();
    upstreamRequest.on('finish', () => {
      source = new PassThrough();
      source.statusCode = 200;
      source.headers = { 'content-type': 'video/mp2t' };
      source.on('close', disconnected);
      callback(source);
      source.write('first-chunk');
    });
    return upstreamRequest;
  };
  await withServer(transport, async (get, origin) => {
    await new Promise((resolve, reject) => {
      const request = http.get(origin + proxy('https://a.ysp.cctv.cn/a.ts'), response => {
        response.once('data', () => { request.destroy(); resolve(); });
      });
      request.on('error', reject);
    });
    await closed;
    assert.equal(source.destroyed, true);
    assert.equal(upstreamRequest.destroyed, true);
  });
});

test('prefixed anonymous cookies remain isolated from unrelated hosts', async () => {
  const calls = [];
  const cookie = 'other_app_session=private; guid=other-app; ysp_tv_guid=anon-id; ysp_tv_versionName=1.0; ysp_tv_nseqId=7; ysp_tv_nrequest-id=req-test; ysp_tv_ysp_uinfo_pc=private-user; ysp_tv_unknown=private';
  await withServer(upstream(200, {}, 'ok', calls), async get => {
    for (const host of ['player-api.yangshipin.cn', 'h5access.yangshipin.cn', 'capi.yangshipin.cn']) {
      assert.equal((await get(proxy('https://' + host + '/test'), { headers: { cookie } })).status, 200);
    }
    for (const call of calls) assert.equal(call.headers.cookie, 'guid=anon-id; versionName=1.0; nseqId=7; nrequest-id=req-test' + (call.hostname === 'player-api.yangshipin.cn' ? '; ysp_uinfo_pc=private-user' : ''));
    for (const host of ['cdn.ysp.cctv.cn', 'www.yangshipin.cn', 's.yangshipin.cn']) {
      await get(proxy('https://' + host + '/test'), { headers: { cookie } });
      assert.equal(calls[calls.length - 1].headers.cookie, undefined);
    }
  });
});

test('cookie translation rejects controls, invalid names and unsafe value characters', () => {
  const { anonymousCookies } = require('../service/core');
  assert.equal(anonymousCookies('ysp_tv_guid=good; other=value; ysp_tv_nseqid=wrongcase'), 'guid=good');
  assert.equal(anonymousCookies('ysp_tv_guid=bad\r\nvalue'), '');
  assert.equal(anonymousCookies('ysp_tv_guid=bad\r'), '');
  assert.equal(anonymousCookies('ysp_tv_guid="bad"; ysp_tv_versionCode=1,2'), '');
  assert.equal(anonymousCookies('ysp_tv_guid=good; injected=bad'), 'guid=good');
  assert.equal(anonymousCookies('ysp_tv_guid=has space; ysp_tv_versionCode=1'), 'versionCode=1');
  assert.equal(anonymousCookies(undefined), '');
});


test('channel query survives page reload and static paths use only the official host', async () => {
  const calls = [];
  await withServer(upstream(200, { 'content-type': 'text/html' }, '<head></head>', calls), async get => {
    assert.equal((await get('/tv/home?pid=test-channel&a=1%2B2')).status, 200);
    assert.equal(calls[0].path, '/tv/home?pid=test-channel&a=1%2B2');
    for (const file of ['/js/app.hash.js', '/css/chunk.hash.css', '/img/logo.hash.png']) {
      assert.equal((await get(file + '?url=https%3A%2F%2Fevil.test%2F')).status, 200);
      const call = calls[calls.length - 1];
      assert.equal(call.hostname, 'www.yangshipin.cn');
      assert.equal(call.path, file + '?url=https%3A%2F%2Fevil.test%2F');
      assert.equal((await get(file, {method: 'HEAD'})).status, 200);
      assert.equal((await get(file, {method: 'POST'})).status, 405);
    }
    for (const file of ['/arbitrary/data', '/js/%2fsecret', '/css/%5csecret', '/img/../../api/private']) {
      const count = calls.length;
      assert.equal((await get(file)).status, 404);
      assert.equal(calls.length, count);
    }
  });
});

test('HLS rewrites variants, segments and key/map URIs against the real upstream URL', async () => {
  const original = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key.bin?token=a%2Bb"\n#EXT-X-MAP:URI="init.mp4?part=1"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nsub/variant.m3u8?quality=1\n#EXTINF:3,\nsegment.ts?sig=a%2Bb\n';
  await withServer(upstream(200, { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': String(Buffer.byteLength(original)) }, original, []), async (get, origin) => {
    const res = await get(proxy('https://a.ysp.cctv.cn/live/main.m3u8?auth=original'));
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('URI="' + origin + proxy('https://a.ysp.cctv.cn/key.bin?token=a%2Bb') + '"'));
    assert.ok(res.text.includes('URI="' + origin + proxy('https://a.ysp.cctv.cn/live/init.mp4?part=1') + '"'));
    assert.ok(res.text.includes(origin + proxy('https://a.ysp.cctv.cn/live/sub/variant.m3u8?quality=1')));
    assert.ok(res.text.includes(origin + proxy('https://a.ysp.cctv.cn/live/segment.ts?sig=a%2Bb')));
    assert.equal(Number(res.headers['content-length'] || Buffer.byteLength(res.text)), Buffer.byteLength(res.text));
    assert.notEqual(res.headers['content-length'], String(Buffer.byteLength(original)));
  });
});

test('HLS rewrite also applies to MIME-discovered manifests and rejects unsafe references', async () => {
  for (const fixture of [
    { text:'#EXTM3U\nhttps://evil.test/segment.ts\n', encoding: '' },
    { text:'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="http://a.ysp.cctv.cn/key"\n', encoding:'' },
    { text:'#EXTM3U\nhttps://u:p@a.ysp.cctv.cn/s.ts\n', encoding:'' },
    { text:'#EXTM3U\npart.ts\n', encoding:'gzip' },
    { text:'<html>blocked</html>', encoding:'' },
    { text:'#EXTM3U\n' + 'x'.repeat(2097153), encoding:'' }
  ]) {
    await withServer(upstream(200, { 'content-type':'application/x-mpegURL', 'content-encoding':fixture.encoding }, fixture.text, []), async get => {
      assert.equal((await get(proxy('https://a.ysp.cctv.cn/live/no-extension'))).status, 502);
    });
  }
  await withServer(upstream(200, { 'content-type':'text/plain' }, '#EXTM3U\npart.ts\n', []), async (get, origin) => {
    const result = await get(proxy('https://a.ysp.cctv.cn/live/main.m3u8'));
    assert.ok(result.text.includes(origin + proxy('https://a.ysp.cctv.cn/live/part.ts')));
  });
});

test('serverTime exact host is allowed without forwarding anonymous cookies', async () => {
  const calls = [];
  await withServer(upstream(200, { 'content-type':'application/json' }, '{}', calls), async get => {
    assert.equal((await get(proxy('https://csapi.yangshipin.cn/serverTime'), {headers:{cookie:'ysp_tv_guid=test'}})).status, 200);
    assert.equal(calls[0].headers.cookie, undefined);
    assert.equal((await get(proxy('https://csapi.yangshipin.cn.evil.test/serverTime'))).status, 403);
  });
});

test('page failures retain 502 and present a Chinese remote recovery page', async () => {
  const vm = require('node:vm');
  for (const transport of [upstream('error', {}, '', []), upstream(200, {'content-type':'text/html'}, 'invalid markup', [])]) {
    await withServer(transport, async get => {
      const result = await get('/tv/home');
      assert.equal(result.status, 502);
      assert.match(result.headers['content-type'], /text\/html/);
      assert.match(result.text, /暂时无法加载央视频/);
      assert.match(result.text, /重试/);
      assert.doesNotMatch(result.text, /secret|invalid markup/);
      const script = result.text.match(/<script>([\s\S]*?)<\/script>/)[1];
      let focused = 0;
      let reloaded = 0;
      let closed = 0;
      const events = {};
      const button = { focus() { focused++; }, addEventListener(type, fn) { events[type] = fn; } };
      vm.runInNewContext(script, {
        document: { getElementById() { return button; }, addEventListener(type, fn) { events[type] = fn; } },
        window: { location: { reload() { reloaded++; } }, close() { closed++; } }
      });
      assert.equal(focused, 1);
      events.click();
      events.keydown({ keyCode:13, preventDefault() {} });
      events.keydown({ keyCode:40, preventDefault() {} });
      events.keydown({ keyCode:461, preventDefault() {} });
      assert.equal(reloaded, 2);
      assert.equal(focused, 2);
      assert.equal(closed, 1);
    });
  }
});

test('real upstream deadline renders recovery before the server idle timeout', { timeout: 15000 }, async () => {
  const stalled = () => {
    const request = new PassThrough();
    request.setTimeout = () => {};
    request.resume();
    return request;
  };
  await withServer(stalled, async get => {
    const response = await get('/tv/home');
    assert.equal(response.status, 502);
    assert.match(response.text, /暂时无法加载央视频/);
  });
});

test('account proxy accepts only explicit endpoint and method pairs', async () => {
  const calls = [];
  await withServer(upstream(200, {'set-cookie':'server-only=not-forwarded'}, '{}', calls), async get => {
    const allowed = [['GET','/v1/user/userinfo'],['POST','/v1/verify/codes/phone'],['POST','/v1/auth/login'],['POST','/v1/auth/account/refresh'],['POST','/v1/auth/account/logout']];
    for (const [method, path] of allowed) {
      const response = await get(proxy('https://ucenter-api.yangshipin.cn'+path), {method,body:method==='POST'?'{}':undefined});
      assert.equal(response.status,200);
      assert.equal(response.headers['set-cookie'],undefined);
    }
    const count = calls.length;
    for (const [method,path] of [['POST','/v1/user/userinfo'],['GET','/v1/auth/login'],['HEAD','/v1/user/userinfo'],['POST','/v1/auth/other'],['POST','/v1/auth/login/']]) assert.equal((await get(proxy('https://ucenter-api.yangshipin.cn'+path),{method})).status,403);
    assert.equal((await get(proxy('https://ucenter-api.yangshipin.cn.evil.test/v1/user/userinfo'))).status,403);
    assert.equal(calls.length,count);
  });
});

test('account cookies reach only exact user and player API hosts', async () => {
  const calls = [];
  const cookie = 'ysp_tv_guid=anon; ysp_tv_ysp_strAccesstoken=test-access; ysp_tv_ysp_uinfo_pc=test-profile; other_app=private; ysp_tv_unknown=unknown';
  await withServer(upstream(200,{},'{}',calls), async get => {
    for (const url of ['https://ucenter-api.yangshipin.cn/v1/user/userinfo','https://player-api.yangshipin.cn/v1/player/auth']) {
      await get(proxy(url),{headers:{cookie,authorization:'never-forward'}});
      assert.equal(calls[calls.length-1].headers.cookie,'guid=anon; ysp_strAccesstoken=test-access; ysp_uinfo_pc=test-profile');
      assert.equal(calls[calls.length-1].headers.authorization,undefined);
    }
    for (const host of ['h5access.yangshipin.cn','capi.yangshipin.cn','csapi.yangshipin.cn','cdn.ysp.cctv.cn','www.yangshipin.cn']) {
      await get(proxy('https://'+host+'/test'),{headers:{cookie}});
      assert.doesNotMatch(calls[calls.length-1].headers.cookie || '', /test-access|test-profile|private|unknown/);
    }
  });
});

test('restore route contains no session data and loads only the private-session helper', async () => {
  const calls = [];
  await withServer(upstream(200,{},'',calls), async (get,origin) => {
    const response = await get('/restore');
    assert.equal(response.status,200);
    assert.match(response.text, /id="status"/);
    assert.match(response.text, /id="retry"/);
    assert.match(response.text, /src="\/session.js"/);
    assert.doesNotMatch(response.text, /ysp_strAccesstoken|ysp_uinfo_pc|cookies|adapter\.js/);
    assert.equal(calls.length,0);
    assert.equal((await get('/restore',{headers:{origin:'https://evil.test'}})).status,403);
    assert.equal((await get('/restore',{method:'POST'})).status,405);
    assert.equal((await get('/session.js')).status,200);
  });
});

test('standalone TV route serves a local document without fetching the desktop page', async () => {
  const server = createServer({request() { throw new Error('Unexpected upstream request'); }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/standalone');
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /src="\/standalone\.js"/);
    assert.doesNotMatch(body, /\/js\/app\.|<iframe|header-fixed/);
    const script = await fetch(base + '/standalone.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
