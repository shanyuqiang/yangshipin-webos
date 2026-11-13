(function () {
  'use strict';
  var hosts = ['www.yangshipin.cn', 'ucenter-api.yangshipin.cn', 'player-api.yangshipin.cn', 'h5access.yangshipin.cn', 'capi.yangshipin.cn', 'csapi.yangshipin.cn',
    's.yangshipin.cn', 'sapi.yangshipin.cn', 'm.yangshipin.cn'];

  var accountCookies = ["ysp_openid", "ysp_yspOpenid", "strVideotoken", "endtime", "ysp_appid", "ysp_strAccesstoken", "ysp_strRefreshtoken", "ysp_strOpenid", "ysp_currentLoginId", "uinfo_logintype", "uinfo_refreshed", "uinfo_expired_time", "yspopenid", "ysp_uinfo_pc"];

  var wrappedSdks = new WeakSet();
  function wrapSdk(sdk) {
    if (!sdk || (typeof sdk !== 'object' && typeof sdk !== 'function') || typeof sdk.get !== 'function' || wrappedSdks.has(sdk)) return;
    var original = sdk.get;
    // The proxied official page retains its upstream SDK origin; re-test these reads when the SDK changes.
    sdk.get = function (path) {
      if (path === 'window.location.host') return 'www.yangshipin.cn';
      if (path === 'window.location.protocol') return 'https:';
      return original.apply(this, arguments);
    };
    wrappedSdks.add(sdk);
  }

  function proxyUrl(value, base, origin) {
    try {
      var url = new URL(value, base);
      var allowed = hosts.indexOf(url.hostname) !== -1 || /\.ysp\.cctv\.cn$/.test(url.hostname);
      if (!allowed || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return value;
      return origin + '/proxy?url=' + encodeURIComponent(url.href);
    } catch (error) { return value; }
  }

  function readCookies(raw) {
    return raw.split(';').map(function (part) { return part.trim(); })
      .filter(function (part) { return /^ysp_tv_[^=]+=/.test(part); })
      .map(function (part) { return part.slice(7); }).join('; ');
  }

  function writeCookie(raw) {
    if (typeof raw !== 'string' || raw.length > 8192 || /[\x00-\x1f\x7f]/.test(raw)) throw new Error('Invalid cookie');
    var parts = raw.split(';');
    var pair = parts.shift().trim();
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=/.test(pair)) throw new Error('Invalid cookie name');
    var kept = parts.map(function (part) { return part.trim(); }).filter(function (part) {
      if (!part) return false;
      var name = part.split('=')[0].toLowerCase();
      if (name === 'domain') {
        if (!/^domain=\.?([a-z0-9-]+\.)*yangshipin\.cn$/i.test(part)) throw new Error('Invalid cookie domain');
        return false;
      }
      if (name === 'path') return false;
      if (name === 'secure' || name === 'httponly') throw new Error('Secure cookie unsupported on local HTTP');
      if (['expires', 'max-age', 'samesite'].indexOf(name) === -1) throw new Error('Unsupported cookie attribute');
      return true;
    });
    return ['ysp_tv_' + pair].concat(kept, ['Path=/']).join('; ');
  }

  function nextIndex(current, candidates, key) {
    if (key < 37 || key > 40) return -1;
    var horizontal = key === 37 || key === 39;
    var sign = key === 37 || key === 38 ? -1 : 1;
    var x = (current.left + current.right) / 2;
    var y = (current.top + current.bottom) / 2;
    var best = -1;
    var score = Infinity;
    candidates.forEach(function (rect, index) {
      var dx = (rect.left + rect.right) / 2 - x;
      var dy = (rect.top + rect.bottom) / 2 - y;
      var forward = (horizontal ? dx : dy) * sign;
      if (forward <= 1) return;
      var sideways = horizontal ? Math.abs(dy) : Math.abs(dx);
      var distance = forward + sideways * 3;
      if (distance < score) { best = index; score = distance; }
    });
    return best;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { proxyUrl: proxyUrl, nextIndex: nextIndex, readCookies: readCookies, writeCookie: writeCookie, wrapSdk: wrapSdk };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__yspTvAdapter) return;
  window.__yspTvAdapter = true;

  var pendingStatus = '';
  function status(message) {
    pendingStatus = message;
    var element = document.getElementById('ysp-tv-status');
    if (element) element.textContent = message;
    window.dispatchEvent(new CustomEvent('ysp-tv-network-status', { detail: message }));
  }

  var sdkValue = window.cctvh5openapi;
  try {
    wrapSdk(sdkValue);
    Object.defineProperty(window, 'cctvh5openapi', {
      configurable: true,
      get: function () { return sdkValue; },
      set: function (value) {
        sdkValue = value;
        try { wrapSdk(value); }
        catch (error) { status('官方播放器接口已变化，当前实验需要更新。'); }
      }
    });
  } catch (error) { status('官方播放器接口已变化，当前实验需要更新。'); }

  var owner = document;
  var cookieDescriptor;
  while (owner && !cookieDescriptor) {
    cookieDescriptor = Object.getOwnPropertyDescriptor(owner, 'cookie');
    owner = Object.getPrototypeOf(owner);
  }
  if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set) {
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () { return readCookies(cookieDescriptor.get.call(document)); },
        set: function (value) {
          var pair = typeof value === 'string' ? value.split(';')[0] : '';
          var separator = pair.indexOf('=');
          var account = accountCookies.indexOf(pair.slice(0, separator).trim()) !== -1;
          try { cookieDescriptor.set.call(document, writeCookie(value)); }
          catch (error) {
            if (account && pair.slice(separator + 1).trim()) status('当前实验不能保存此安全或不受支持的登录状态。');
            return;
          }
          if (typeof window.__yspTvSessionCookieChanged === 'function') {
            try { window.__yspTvSessionCookieChanged(value); }
            catch (error) { if (account) status('登录状态持久保存失败，请稍后重试。'); }
          }
        }
      });
    } catch (error) { status('当前实验无法保存网页状态，播放可能失败。'); }
  }

  var originalFetch = window.fetch;
  if (originalFetch) window.fetch = function (input, options) {
    var isRequest = typeof Request !== 'undefined' && input instanceof Request;
    var source = isRequest ? input.url : String(input);
    var target = proxyUrl(source, document.baseURI, window.location.origin);
    var request = target === source ? input : (isRequest ? new Request(target, input) : target);
    return originalFetch.call(window, request, options).catch(function (error) {
      status('网络请求失败，可选择“刷新”重试。');
      throw error;
    });
  };
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    var args = Array.prototype.slice.call(arguments);
    args[1] = proxyUrl(String(args[1]), document.baseURI, window.location.origin);
    return originalOpen.apply(this, args);
  };

  var loginSelector = '.ysplogin-signin-iptmb input,.ysplogin-signin-iptvc input,.ysplogin-signin-agree-chickable,'
    + '.ysplogin-signin-vcsend,.ysplogin-signin-btnmb,.ysplogin-signin-close,.ysplogin-signin-btnwx,#loginService,#loginPolicy';
  var selector = 'a[href],button,input,select,textarea,[role="button"],'
    + '.tv-main-con-r-list-left-imga,.tv-main-con-r-list-left-imgb,.tv-main-con-r-tab-img,.tv-zhan-list-week-item-t,'
    + '.tv-zhan-list-b-r-item,li.header-b-l-ul-li,.bei,.bei-list-inner .item,.header-b-r-item5,'
    + '.winA-mask-unLogin-bottom-img,.winA-mask-login-top-layout,' + loginSelector;

  function focusables() {
    var login = document.querySelector('.ysplogin-signin-iptmb input');
    var modal = login && login.getBoundingClientRect().height > 0 && window.getComputedStyle(login).visibility !== 'hidden';
    return Array.prototype.filter.call(document.querySelectorAll(selector), function (element) {
      var rect = element.getBoundingClientRect();
      var style = window.getComputedStyle(element);
      return (!modal || element.matches(loginSelector)) && !element.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
        && style.display !== 'none' && style.opacity !== '0' && !element.closest('[aria-hidden="true"]');
    });
  }

  var editingElement = null;
  var navigationElement = null;
  function editable(element) {
    if (!element) return false;
    return /^(TEXTAREA|SELECT)$/.test(element.tagName) || (element.tagName === 'INPUT'
      && !/^(button|submit|reset|checkbox|radio|hidden|image)$/.test(element.type));
  }

  function focus(element) {
    navigationElement = element;
    var account = document.querySelector('.header-b-r-item5');
    if (account) {
      var inMenu = element === account || element.closest('.winA-mask-unLogin,.winA-mask-login');
      account.dispatchEvent(new MouseEvent(inMenu ? 'mouseenter' : 'mouseleave', { bubbles: false }));
    }
    var previous = document.querySelector('.ysp-tv-focus');
    if (previous) previous.classList.remove('ysp-tv-focus');
    element.classList.add('ysp-tv-focus');
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
    element.focus();
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function fullscreen() {
    var video = document.querySelector('video');
    var request = video && (video.requestFullscreen || video.webkitRequestFullscreen);
    if (!request) { status('当前页面还没有可全屏的视频。'); return; }
    try {
      var result = request.call(video);
      if (result && result.catch) result.catch(function () { status('无法进入全屏，请重试。'); });
    } catch (error) { status('无法进入全屏，请重试。'); }
  }

  function onKey(event) {
    var key = event.keyCode;
    if (editingElement && document.activeElement !== editingElement) editingElement = null;
    if (key === 461 && editingElement) {
      navigationElement = editingElement;
      editingElement = null;
      navigationElement.blur();
    } else if (key === 461) {
      var active = document.fullscreenElement || document.webkitFullscreenElement;
      var leave = document.exitFullscreen || document.webkitExitFullscreen;
      var loginClose = document.querySelector('.ysplogin-signin-close');
      if (active && leave) leave.call(document);
      else if (loginClose && loginClose.offsetHeight) {
        loginClose.click();
        var account = document.querySelector('.header-b-r-item5');
        if (account) focus(account);
      } else window.close();
    } else {
      if (editingElement) return;
      var items = focusables();
      var selected = items.indexOf(document.activeElement) !== -1 ? document.activeElement : navigationElement;
      if (key >= 37 && key <= 40) {
        if (!items.length) return;
        var next = items.indexOf(selected) === -1 ? 0 : nextIndex(selected.getBoundingClientRect(), items.map(function (item) { return item.getBoundingClientRect(); }), key);
        if (next !== -1) focus(items[next]);
      } else if (key === 13 && items.indexOf(selected) !== -1) {
        if (editable(selected)) { editingElement = selected; selected.focus(); }
        if (selected.matches('.header-b-r-item5')) {
          var menu = focusables().filter(function (item) { return item.matches('.winA-mask-unLogin-bottom-img,.winA-mask-login-top-layout'); });
          if (menu.length) focus(menu[0]);
        } else selected.click();
      }
      else return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function installToolbar() {
    var style = document.createElement('style');
    style.textContent = '#ysp-tv-tools{position:fixed;bottom:60px;right:90px;z-index:2147483647;background:#102332;color:white;padding:12px;font:24px sans-serif;border-radius:6px}'
      + '#ysp-tv-tools button{font:24px sans-serif;padding:8px 16px;margin-left:8px;background:#e6e6e6;color:#102332;border:2px solid transparent}'
      + '.ysp-tv-focus{outline:4px solid #ffdb4d!important;outline-offset:-4px!important}'
      + '#ysp-tv-status{font:24px sans-serif;max-width:600px;margin:8px 0 0}'
      + '.tv-main-con-r-list-left-imga>span,.tv-main-con-r-list-left-imgb>span,.tv-zhan-list-week-item-t-a,.tv-zhan-list-b-r-item>div{font-size:24px!important;line-height:1.5!important}'
      + '.tv-main-con-r-list-left-tag{font-size:20px!important}'
      + '.tv-main-con-r-tab-img img{height:32px!important;width:auto!important;max-width:100%}'
      + '.tv-zhan-list-b-r-item{min-height:40px}'
      + '.tv-zhan-list-week,.tv-zhan-list-week2{height:118px!important;min-height:118px!important;box-sizing:border-box}'
      + '.tv-zhan-list-week-item,.tv-zhan-list-week-item-t{height:110px!important;min-height:110px!important;box-sizing:border-box}'
      + '.tv-zhan-list-week-item-t-a{height:auto!important;min-height:72px;line-height:36px!important;padding-top:12px!important;padding-bottom:12px!important;box-sizing:border-box}';
    document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.id = 'ysp-tv-tools';
    var label = document.createElement('span');
    label.textContent = '电视适配实验';
    bar.appendChild(label);
    [['全屏', fullscreen], ['刷新', function () { window.location.reload(); }], ['退出', function () { window.close(); }]].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[0];
      button.addEventListener('click', entry[1]);
      bar.appendChild(button);
    });
    var message = document.createElement('p');
    message.id = 'ysp-tv-status';
    message.setAttribute('role', 'status');
    message.textContent = pendingStatus || '账号登录尚未验证；方向键选择，确定键操作。';
    bar.appendChild(message);
    document.body.appendChild(bar);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', function (event) {
      if (editable(event.target)) { focus(event.target); editingElement = event.target; }
    }, true);
    focus(bar.querySelector('button'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installToolbar);
  else installToolbar();
}());
