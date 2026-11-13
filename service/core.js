'use strict';
var http = require('http');
var https = require('https');
var URL = require('url').URL;
var fs = require('fs');
var path = require('path');
var OFFICIAL = 'https://www.yangshipin.cn';
var HOSTS = ['www.yangshipin.cn', 'ucenter-api.yangshipin.cn', 'csapi.yangshipin.cn', 'capi.yangshipin.cn', 'player-api.yangshipin.cn', 'h5access.yangshipin.cn', 's.yangshipin.cn', 'sapi.yangshipin.cn', 'm.yangshipin.cn'];
var REQUEST_HEADERS = ['user-agent', 'accept', 'content-type', 'range', 'yspappid', 'yspplayertoken', 'yspticket', 'yspsdkinput', 'yspsdksign', 'seqid', 'request-id'];
var COOKIE_HOSTS = ['player-api.yangshipin.cn', 'h5access.yangshipin.cn', 'capi.yangshipin.cn'];
var ANONYMOUS_COOKIES = ['guid', 'versionName', 'versionCode', 'vplatform', 'platformVersion', 'deviceModel', 'newLogin', 'pc_version', 'nseqId', 'nrequest-id'];
var ACCOUNT_HOSTS = ['ucenter-api.yangshipin.cn', 'player-api.yangshipin.cn'];
var ACCOUNT_COOKIES = ["ysp_openid", "ysp_yspOpenid", "strVideotoken", "endtime", "ysp_appid", "ysp_strAccesstoken", "ysp_strRefreshtoken", "ysp_strOpenid", "ysp_currentLoginId", "uinfo_logintype", "uinfo_refreshed", "uinfo_expired_time", "yspopenid", "ysp_uinfo_pc"];
var ACCOUNT_ROUTES = {
  '/v1/user/userinfo': 'GET',
  '/v1/verify/codes/phone': 'POST',
  '/v1/auth/login': 'POST',
  '/v1/auth/account/refresh': 'POST',
  '/v1/auth/account/logout': 'POST'
};
var RESPONSE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-encoding'];

function targetURL(raw) {
  var parsed = new URL(raw);
  var allowed = HOSTS.indexOf(parsed.hostname) !== -1 || parsed.hostname.endsWith('.ysp.cctv.cn');
  if (!allowed || parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('Target not allowed');
  return parsed;
}

function reply(res, status, body, type) {
  if (res.finished || res.destroyed) return;
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'content-type': type || 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

function failurePage() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>央视频加载失败</title>
<style>body{background:#141414;color:#fff;font:28px sans-serif;margin:90px}p{line-height:1.6}button{font:28px sans-serif;padding:20px 40px}button:focus{outline:5px solid #ffcc00}</style>
</head><body><h1>暂时无法加载央视频</h1><p>请检查电视网络后重试。确定键重试，返回键退出。</p>
<button id="retry" type="button" autofocus>重试</button>
<script>(function(){
  var button=document.getElementById('retry');
  function retry(){window.location.reload();}
  button.addEventListener('click',retry);
  document.addEventListener('keydown',function(event){
    if(event.keyCode===461)window.close();
    else if(event.keyCode===13)retry();
    else if(event.keyCode>=37&&event.keyCode<=40)button.focus();
    else return;
    event.preventDefault();
  });
  button.focus();
}());</script></body></html>`;
}

function sameOrigin(req, origin) {
  if (req.headers.host !== origin.slice(7)) return false;
  if (req.headers.origin && req.headers.origin !== origin) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.referer) {
    try { if (new URL(req.headers.referer).origin !== origin) return false; }
    catch (error) { return false; }
  }
  return true;
}

function filteredCookies(raw, names) {
  if (typeof raw !== 'string') return '';
  return raw.split(';').map(function (part) {
    if (/[\x00-\x1f\x7f]/.test(part)) return '';
    var pair = part.trim();
    var separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, 7) !== 'ysp_tv_') return '';
    var name = pair.slice(7, separator);
    var value = pair.slice(separator + 1);
    if (names.indexOf(name) === -1 || !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(value)) return '';
    return name + '=' + value;
  }).filter(function (pair) { return pair !== ''; }).join('; ');
}

function anonymousCookies(raw) { return filteredCookies(raw, ANONYMOUS_COOKIES); }

function requestHeaders(req, target) {
  var headers = { 'accept-encoding': 'identity', referer: OFFICIAL + '/tv/home' };
  REQUEST_HEADERS.forEach(function (key) { if (req.headers[key]) headers[key] = req.headers[key]; });
  if (!target.hostname.endsWith('.ysp.cctv.cn')) headers.origin = OFFICIAL;
  var accountHost = ACCOUNT_HOSTS.indexOf(target.hostname) !== -1;
  if (accountHost || COOKIE_HOSTS.indexOf(target.hostname) !== -1) {
    var cookie = filteredCookies(req.headers.cookie, accountHost ? ANONYMOUS_COOKIES.concat(ACCOUNT_COOKIES) : ANONYMOUS_COOKIES);
    if (cookie) headers.cookie = cookie;
  }
  return headers;
}

function collect(stream, limit, done) {
  var chunks = [];
  var size = 0;
  var finished = false;
  function complete(error, body) {
    if (finished) return;
    finished = true;
    done(error, body);
  }
  stream.on('data', function (chunk) {
    size += chunk.length;
    if (size > limit) { chunks = []; complete(new Error('Too large')); }
    else if (!finished) chunks.push(chunk);
  });
  stream.on('end', function () { complete(null, Buffer.concat(chunks)); });
  stream.on('error', function () { complete(new Error('Read failed')); });
  stream.on('aborted', function () { complete(new Error('Aborted')); });
}

function rewriteManifest(text, base, origin) {
  if (!/^#EXTM3U(?:\r?\n|$)/.test(text.trim())) throw new Error('Invalid manifest');
  function rewrite(value) {
    var absolute = new URL(value, base).href;
    return origin + '/proxy?url=' + encodeURIComponent(targetURL(absolute).href);
  }
  return text.split(/\r?\n/).map(function (line) {
    var value = line.trim();
    if (!value) return line;
    if (value.charAt(0) !== '#') return rewrite(value);
    return line.replace(/URI="([^"\r\n]*)"/g, function (attribute, uri) {
      return 'URI="' + rewrite(uri) + '"';
    });
  }).join('\n');
}

function forward(req, res, target, body, page, origin, transport, agent) {
  var upstream;
  var timer;
  var source;
  function stop() {
    clearTimeout(timer);
    if (source) source.destroy();
    if (upstream) upstream.destroy();
  }
  function fail() {
    reply(res, 502, page ? failurePage() : 'Upstream request failed', page ? 'text/html; charset=utf-8' : undefined);
    stop();
  }
  function receive(response) {
    source = response;
    source.on('error', fail);
    source.on('aborted', fail);
    source.on('end', function () { clearTimeout(timer); });
    if (source.statusCode >= 300 && source.statusCode < 400) { fail(); return; }
    if (page) {
      if (source.statusCode !== 200 || !/text\/html/i.test(source.headers['content-type'] || '') || (source.headers['content-encoding'] && source.headers['content-encoding'] !== 'identity')) { fail(); return; }
      collect(source, 2 * 1024 * 1024, function (error, data) {
        if (error) { fail(); return; }
        var html = data.toString('utf8');
        if (!/<head\b[^>]*>/i.test(html)) { fail(); return; }
        var injection = '<script src="' + origin + '/player-context.js"></script><script src="' + origin + '/session.js"></script><script src="' + origin + '/adapter.js"></script><link rel="stylesheet" href="/tv-shell.css"><script src="/tv-shell.js"></script>';
        reply(res, 200, html.replace(/<head\b[^>]*>/i, function (head) { return head + injection; }), 'text/html; charset=utf-8');
      });
      return;
    }
    var manifest = /\.m3u8$/i.test(target.pathname) || /mpegurl/i.test(source.headers['content-type'] || '');
    if (manifest && req.method !== 'HEAD' && source.statusCode >= 200 && source.statusCode < 300) {
      if (source.headers['content-encoding'] && source.headers['content-encoding'] !== 'identity') { fail(); return; }
      collect(source, 2 * 1024 * 1024, function (error, data) {
        if (error) { fail(); return; }
        try { reply(res, source.statusCode, rewriteManifest(data.toString('utf8'), target.href, origin), 'application/vnd.apple.mpegurl'); }
        catch (invalidManifest) { fail(); }
      });
      return;
    }
    var headers = { 'cache-control': 'no-store' };
    RESPONSE_HEADERS.forEach(function (key) { if (source.headers[key]) headers[key] = source.headers[key]; });
    res.writeHead(source.statusCode, headers);
    source.pipe(res);
  }
  res.on('close', stop);
  req.on('aborted', stop);
  try {
    upstream = transport({ hostname: target.hostname, port: 443, path: target.pathname + target.search, method: req.method, headers: requestHeaders(req, target), rejectUnauthorized: true, agent: agent }, receive);
    timer = setTimeout(fail, 10000);
    upstream.setTimeout(10000, fail);
    upstream.on('error', fail);
    upstream.end(body);
  } catch (error) { fail(); }
}

function createServer(options) {
  options = options || {};
  var transport = options.request || https.request;
  var agent = new https.Agent({ keepAlive: true, maxSockets: 8 });
  var server = http.createServer(function (req, res) {
    var origin = 'http://127.0.0.1:' + server.address().port;
    if (!sameOrigin(req, origin)) { reply(res, 403, 'Local origin required'); return; }
    if (['GET', 'POST', 'HEAD'].indexOf(req.method) === -1) { reply(res, 405, 'Method not allowed'); return; }
    var local;
    try { local = new URL(req.url, origin); }
    catch (error) { reply(res, 400, 'Invalid request'); return; }
    if (local.pathname === '/restore') {
      if (req.method !== 'GET') { reply(res, 405, 'Method not allowed'); return; }
      reply(res, 200, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>恢复登录状态</title><style>body{background:#141414;color:white;font:28px sans-serif;margin:90px}button{font:28px sans-serif;padding:20px 40px}button:focus{outline:5px solid #ffcc00}</style></head><body><h1>央视频电视实验版</h1><p id="status" role="status">正在恢复登录状态…</p><button id="retry" type="button">重试</button><script src="/session.js"></script></body></html>', 'text/html; charset=utf-8');
      return;
    }
    if (['/adapter.js', '/player-context.js', '/session.js', '/tv-shell.js', '/tv-shell.css'].indexOf(local.pathname) !== -1 && req.method === 'GET') {
      fs.readFile(path.join(__dirname, local.pathname.slice(1)), function (error, data) {
        reply(res, error ? 503 : 200, error ? 'Adapter unavailable' : data, local.pathname === '/tv-shell.css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
      });
      return;
    }
    var page = local.pathname === '/tv/home';
    var staticFile = /^\/(js|css|img)\/[A-Za-z0-9_./-]+$/.test(local.pathname);
    if (!page && !staticFile && local.pathname !== '/proxy') { reply(res, 404, 'Not found'); return; }
    if ((page && req.method !== 'GET') || (staticFile && req.method !== 'GET' && req.method !== 'HEAD')) { reply(res, 405, 'Method not allowed'); return; }
    var target;
    try { target = targetURL(page || staticFile ? OFFICIAL + local.pathname + local.search : local.searchParams.get('url')); }
    catch (error) { reply(res, 403, 'Target not allowed'); return; }
    if (target.hostname === 'ucenter-api.yangshipin.cn' && ACCOUNT_ROUTES[target.pathname] !== req.method) { reply(res, 403, 'Account endpoint not allowed'); return; }
    collect(req, 1024 * 1024, function (error, body) {
      if (error) { reply(res, 413, 'Request body too large or incomplete'); return; }
      forward(req, res, target, body, page, origin, transport, agent);
    });
  });
  // Allow the upstream deadline to render a recoverable response before closing the client.
  server.timeout = 15000;
  server.on('close', function () { agent.destroy(); });
  return server;
}

module.exports = { createServer: createServer, anonymousCookies: anonymousCookies };
