(function () {
  'use strict';
  var names = ['ysp_openid', 'ysp_yspOpenid', 'strVideotoken', 'endtime', 'ysp_appid',
    'ysp_strAccesstoken', 'ysp_strRefreshtoken', 'ysp_strOpenid', 'ysp_currentLoginId',
    'uinfo_logintype', 'uinfo_refreshed', 'uinfo_expired_time', 'yspopenid', 'ysp_uinfo_pc'];

  function parseCookie(raw, now) {
    if (typeof raw !== 'string' || /[\x00-\x1f\x7f]/.test(raw)) return null;
    var parts = raw.split(';');
    var pair = parts[0].trim();
    var separator = pair.indexOf('=');
    var name = pair.slice(0, separator);
    var value = pair.slice(separator + 1);
    if (names.indexOf(name) === -1 || value.length > 8192 ||
        !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(value)) return null;
    var expiresAt = null;
    var maxAge = null;
    parts.slice(1).forEach(function (part) {
      var index = part.indexOf('=');
      var key = part.slice(0, index).trim().toLowerCase();
      var attribute = part.slice(index + 1).trim();
      if (key === 'expires' && isFinite(Date.parse(attribute))) expiresAt = Date.parse(attribute);
      if (key === 'max-age' && /^-?\d+$/.test(attribute)) maxAge = Number(attribute);
    });
    if (maxAge !== null && isFinite(maxAge)) expiresAt = now + maxAge * 1000;
    if (expiresAt !== null && !isFinite(expiresAt)) return null;
    return { name: name, value: value, expiresAt: expiresAt };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { parseCookie: parseCookie };
  if (typeof window === 'undefined') return;
  var pending = [];
  var generation = null;
  var loggingOut = false;
  try {
    var saved = window.sessionStorage.getItem('ysp-tv-session-generation');
    if (saved !== null && /^\d+$/.test(saved)) generation = Number(saved);
  } catch (error) { /* Private storage is optional until the restore page completes. */ }

  function call(method, payload, done) {
    var bridge;
    var settled = false;
    var timeout;
    function finish(response) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      pending = pending.filter(function (item) { return item !== bridge; });
      done(response);
    }
    try {
      bridge = new window.PalmServiceBridge();
      pending = pending.concat(bridge);
      timeout = setTimeout(function () { finish({ returnValue: false }); }, 10000);
      bridge.onservicecallback = function (raw) {
        try { finish(JSON.parse(raw)); } catch (error) { finish({ returnValue: false }); }
      };
      bridge.call('luna://com.shanyuqiang.yangshipin.service/' + method, JSON.stringify(payload));
    } catch (error) { finish({ returnValue: false }); }
  }

  window.__yspTvSessionCookieChanged = function (raw) {
    var cookie = parseCookie(raw, Date.now());
    if (!cookie || !window.PalmServiceBridge || loggingOut) return;
    if (generation === null) return;
    call('saveSessionCookie', { name: cookie.name, value: cookie.value,
      expiresAt: cookie.expiresAt, generation: generation }, function (result) {
      if (!result.returnValue) {
        var status = document.getElementById('ysp-tv-status');
        if (status) status.textContent = '登录状态暂未保存，重启后可能需要重新登录。';
      }
    });
  };

  function clearLocal() {
    names.forEach(function (name) {
      document.cookie = (window.__yspTvAdapter ? '' : 'ysp_tv_') + name + '=; Path=/; Max-Age=0';
    });
  }

  function restore() {
    var status = document.getElementById('status');
    var retry = document.getElementById('retry');
    function fail() {
      status.textContent = '无法读取登录记录，请重试。原有记录未被清除。';
      retry.focus();
    }
    status.textContent = '正在恢复登录状态…';
    if (!window.PalmServiceBridge) { window.location.replace('/tv/home'); return; }
    call('loadSession', {}, function (result) {
      if (!result.returnValue || !Array.isArray(result.cookies) ||
          !Number.isSafeInteger(result.generation) || result.generation < 0) { fail(); return; }
      var valid = result.cookies.filter(function (item) {
        return item && names.indexOf(item.name) !== -1 && typeof item.value === 'string' &&
          parseCookie(item.name + '=' + item.value, Date.now()) && (item.expiresAt === null ||
          (typeof item.expiresAt === 'number' && isFinite(item.expiresAt) && item.expiresAt > Date.now()));
      });
      if (valid.length !== result.cookies.length) { fail(); return; }
      try { window.sessionStorage.setItem('ysp-tv-session-generation', String(result.generation)); }
      catch (error) { fail(); return; }
      clearLocal();
      valid.forEach(function (item) {
        document.cookie = 'ysp_tv_' + item.name + '=' + item.value + '; Path=/' +
          (item.expiresAt === null ? '' : '; Expires=' + new Date(item.expiresAt).toUTCString());
      });
      window.location.replace('/tv/home');
    });
  }

  var loginSdk;
  var wrapped = new WeakSet();
  Object.defineProperty(window, 'yspLogin', {
    configurable: true,
    get: function () { return loginSdk; },
    set: function (sdk) {
      loginSdk = sdk;
      if (!sdk || !sdk.default || typeof sdk.default.signout !== 'function' || wrapped.has(sdk.default)) return;
      var original = sdk.default.signout;
      sdk.default.signout = function () {
        if (!window.PalmServiceBridge) return original.apply(this, arguments);
        loggingOut = true;
        var result;
        try { result = original.apply(this, arguments); } catch (error) { result = Promise.reject(error); }
        var finished = Promise.resolve(result).then(function () {}, function () {});
        return new Promise(function (resolve, reject) {
          call('clearSession', {}, function (response) {
            if (!response.returnValue || !Number.isSafeInteger(response.generation)) {
              var status = document.getElementById('ysp-tv-status');
              if (status) status.textContent = '退出记录尚未保存，请重试退出登录。';
              reject(new Error('Session removal failed'));
              return;
            }
            try { window.sessionStorage.setItem('ysp-tv-session-generation', String(response.generation)); }
            catch (error) { reject(new Error('Session removal failed')); return; }
            var completed = false;
            function finish() {
              if (completed) return;
              completed = true;
              clearTimeout(timer);
              clearLocal();
              window.location.reload();
              resolve(true);
            }
            var timer = setTimeout(finish, 10000);
            finished.then(finish);
          });
        });
      };
      wrapped.add(sdk.default);
    }
  });

  if (window.location.pathname === '/restore') {
    document.getElementById('retry').addEventListener('click', restore);
    document.addEventListener('keydown', function (event) {
      if (event.keyCode === 461) { event.preventDefault(); window.close(); }
    });
    restore();
  }
}());
