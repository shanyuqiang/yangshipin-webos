(function () {
  'use strict';
  var categories = ['央视', '卫视'];
  var keys = [37, 38, 39, 40, 13, 461];
  document.documentElement.classList.add('tv-shell-loading');

  function make(tag, text, parent) {
    var element = document.createElement(tag);
    if (text) element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function button(parent, name, action) {
    var element = make('button', name, parent);
    element.type = 'button';
    element.onclick = action;
    return element;
  }

  function findTV() {
    if (window.yspStandaloneTV) return window.yspStandaloneTV;
    for (var node = document.querySelector('.tv-main-con-l-vid'); node; node = node.parentElement) {
      var vm = node.__vue__;
      if (vm && typeof vm.changeTV === 'function' && Array.isArray(vm.tvTabs) &&
          vm.tvTabs.some(function (group) { return group.length; }) && vm.$refs.player) return vm;
    }
    return null;
  }

  function install(vm) {
    var root = make('main', '', document.body);
    root.id = 'ysp-tv-shell';
    root.setAttribute('aria-label', '央视频直播');
    var toolbar = make('nav', '', root);
    toolbar.className = 'tv-shell-actions';
    var guide = make('section', '', root);
    guide.className = 'tv-shell-guide';
    var title = make('h1', '', guide);
    var status = make('p', '', guide);
    status.setAttribute('role', 'status');
    status.id = 'ysp-tv-shell-status';
    window.addEventListener('ysp-tv-network-status', function (event) {
      status.textContent = event.detail;
    });
    var dates = make('div', '', guide);
    var programmes = make('ul', '', guide);
    var sidebar = make('aside', '', root);
    var tabs = make('nav', '', sidebar);
    var channels = make('div', '', sidebar);
    channels.className = 'tv-shell-channels';
    var group = vm.selectIndex || 0;
    var rows = [[], [], [], [], []];
    var column = 2;
    var positions = [0, group, 0, 0, 0];
    var qualityMenu = false;
    var pendingChannel = null;

    function focus(nextColumn, index) {
      if (!rows[nextColumn].length) return;
      column = nextColumn;
      positions[column] = Math.min(Math.max(index, 0), rows[column].length - 1);
      rows[column][positions[column]].focus();
    }

    function renderChannels() {
      channels.textContent = '';
      var groupForChannel = group;
      rows[2] = (vm.tvTabs[group] || []).map(function (channel, index) {
        var badge = String(channel.payType) === '880' ? ' · 会员' : '';
        var item = button(channels, channel.channelName + badge, function () {
          focus(2, index);
          if (vm.tvIndex && channel.pid === vm.tvIndex.pid) return;
          pendingChannel = channel;
          status.textContent = '正在切换到 ' + channel.channelName + '…';
          window.requestAnimationFrame(function () {
            if (pendingChannel !== channel) return;
            pendingChannel = null;
            vm.changeIndex(groupForChannel);
            vm.changeTV(channel);
            updateProgramme();
          });
        });
        if (vm.tvIndex && vm.tvIndex.pid === channel.pid) {
          positions[2] = index;
          item.setAttribute('aria-current', 'true');
        }
        return item;
      });
    }

    function updateProgramme() {
      var current = vm.tvIndex;
      if (!current) return;
      title.textContent = current.channelName;
      rows[2].forEach(function (element, index) {
        if (vm.tvTabs[group][index].pid === current.pid) element.setAttribute('aria-current', 'true');
        else element.removeAttribute('aria-current');
      });
      var player = vm.$refs.player;
      var failed = player && player.errorInfos;
      status.textContent = failed ? '播放遇到问题，可查看播放器提示或重试。' :
        (typeof vm.nowPlayItem === 'string' ? vm.nowPlayItem : vm.nowPlayItem && vm.nowPlayItem.name) || '';
      var wasFocused = programmes.contains(document.activeElement);
      programmes.textContent = '';
      var entries = Array.isArray(vm.jiemudanInfo) ? vm.jiemudanInfo : [];
      var playing = entries.findIndex(function (entry) { return Number(entry.sta) === 2; });
      rows[4] = entries.map(function (entry) {
        var item = make('li', [entry.startTime, entry.name].filter(Boolean).join('  '), programmes);
        item.tabIndex = -1;
        if (Number(entry.sta) === 2) item.setAttribute('aria-current', 'true');
        return item;
      });
      positions[4] = wasFocused ? positions[4] : Math.max(0, playing);
      if (wasFocused && !rows[4].length) focus(3, positions[3]);
      else if (wasFocused) focus(4, positions[4]);
      else if (playing >= 0) programmes.scrollTop = rows[4][playing].offsetTop;
    }

    function renderDates() {
      var wasFocused = dates.contains(document.activeElement);
      dates.textContent = '';
      rows[3] = ((vm.tvIndex && vm.tvIndex.parseDateList1) || []).map(function (date, index) {
        return button(dates, date.day, function () {
          focus(3, index);
          vm.changeDay(date.fullDay);
          renderDateSelection();
        });
      });
      renderDateSelection();
      if (wasFocused) focus(3, positions[3]);
    }

    function renderDateSelection() {
      var choices = vm.tvIndex && vm.tvIndex.parseDateList1 || [];
      rows[3].forEach(function (element, index) {
        element.setAttribute('aria-pressed', String(choices[index].fullDay === vm.jiemuNowDate));
      });
    }

    function qualityControl(player) {
      return player && player.myPoster && player.myPoster.$refs && player.myPoster.$refs.controlBar;
    }

    function selectQuality(definition) {
      var control = qualityControl(vm.$refs.player);
      var choice = control && Array.isArray(control.qualityList) && control.qualityList.find(function (item) {
        return item.fn === definition;
      });
      toggleQuality(false);
      if (!choice || typeof control.setQuality !== 'function') {
        status.textContent = '当前频道的画质选项尚未加载。';
        return;
      }
      control.setQuality(choice);
    }

    function renderActions() {
      toolbar.textContent = '';
      rows[0] = [];
      if (qualityMenu) {
        var player = vm.$refs.player;
        var control = qualityControl(player);
        var options = control && Array.isArray(control.qualityList) ? control.qualityList : [];
        if (!options.length) status.textContent = '画质选项正在加载，请稍后再试。';
        options.forEach(function (option) {
          var item = button(toolbar, [option.cname, option.name].filter(Boolean).join(' '), function () {
            selectQuality(option.fn);
          });
          item.setAttribute('aria-pressed', String(option.fn === player.currDef));
          rows[0].push(item);
        });
        rows[0].push(button(toolbar, '返回', function () { toggleQuality(false); }));
      } else {
        rows[0].push(button(toolbar, '全屏', function () {
          var video = document.querySelector('.tv-main-con-l-vid video');
          var request = video && (video.requestFullscreen || video.webkitRequestFullscreen);
          if (request) {
            var result = request.call(video);
            if (result && result.catch) result.catch(function () { status.textContent = '暂时无法进入全屏。'; });
          } else status.textContent = '视频正在加载。';
        }));
        rows[0].push(button(toolbar, '画质', function () { toggleQuality(true); }));
        rows[0].push(button(toolbar, '账号', function () {
          if (window.yspStandaloneTV) {
            openAccount();
            return;
          }
          var account = document.querySelector('.header-b-r-item5');
          if (account) {
            document.body.classList.add('tv-shell-account');
            account.tabIndex = -1;
            account.focus();
            account.dispatchEvent(new MouseEvent('mouseenter'));
          }
        }));
        rows[0].push(button(toolbar, '刷新', function () { window.location.reload(); }));
      }
    }

    function openAccount() {
      var sdk = window.yspLogin && window.yspLogin.default;
      if (!sdk || typeof sdk.signin !== 'function' || typeof sdk.isSigned !== 'function') {
        status.textContent = '账号服务暂时不可用。';
        return;
      }
      document.body.classList.add('tv-shell-account');
      Promise.resolve().then(function () { return sdk.isSigned(); }).then(function (signed) {
        if (!document.body.classList.contains('tv-shell-account')) return;
        if (!signed) return sdk.signin({mobile:true, wechat:false, qq:false, weibo:false});
        if (window.confirm('已登录央视频。退出此账号？')) return sdk.signout();
        document.body.classList.remove('tv-shell-account');
        focus(0, 2);
      }).catch(function () {
        document.body.classList.remove('tv-shell-account');
        status.textContent = '账号操作失败，请重试。';
        focus(0, 2);
      });
    }

    function toggleQuality(show) {
      qualityMenu = show;
      renderActions();
      focus(0, show ? 0 : 1);
    }

    function accountOpen() {
      var close = window.yspStandaloneTV && document.querySelector('.ysplogin-signin-close');
      return document.body.classList.contains('tv-shell-account') || Boolean(close && close.getClientRects().length);
    }

    function onKey(event) {
      var key = event.keyCode;
      if (keys.indexOf(key) === -1) return;
      var full = document.fullscreenElement || document.webkitFullscreenElement;
      if (full) {
        if (key === 461) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (accountOpen()) {
        var closeLogin = document.querySelector('.ysplogin-signin-close');
        if (key !== 461) return;
        if (closeLogin && closeLogin.getClientRects().length) {
          if (!window.yspStandaloneTV || document.activeElement && document.activeElement.matches('input,textarea')) return;
          closeLogin.click();
        }
        var account = document.querySelector('.header-b-r-item5');
        if (account) account.dispatchEvent(new MouseEvent('mouseleave'));
        document.body.classList.remove('tv-shell-account');
        focus(0, 2);
      } else if (key === 461) {
        if (qualityMenu) toggleQuality(false);
        else window.close();
      } else if (key === 13) {
        var selected = rows[column][positions[column]];
        if (!event.repeat && selected && column !== 4) selected.click();
      } else if (column === 4) {
        if (key === 38 && positions[4] === 0) focus(3, positions[3]);
        else if (key === 38 || key === 40) focus(4, positions[4] + (key === 38 ? -1 : 1));
        else if (key === 37) focus(3, positions[3]);
        else if (key === 39) focus(1, group);
      } else if (column === 1 || column === 2) {
        if (key === 38 || key === 40) focus(column, positions[column] + (key === 38 ? -1 : 1));
        else if (key === 37) focus(column === 2 ? 1 : 0, positions[column === 2 ? 1 : 0]);
        else if (column === 1) focus(2, positions[2]);
      } else if (key === 38 || key === 40) {
        var next = key === 38 ? 0 : (column === 3 ? 4 : 3);
        focus(next, positions[next]);
      } else if (key === 39 && positions[column] === rows[column].length - 1) {
        focus(1, group);
      } else focus(column, positions[column] + (key === 37 ? -1 : 1));
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    rows[1] = categories.map(function (name, index) {
      return button(tabs, name, function () {
        group = index;
        positions[2] = 0;
        renderChannels();
        rows[1].forEach(function (tab, i) { tab.setAttribute('aria-pressed', String(i === group)); });
        focus(2, positions[2]);
      });
    });
    rows[1][group].setAttribute('aria-pressed', 'true');
    renderActions();
    renderChannels();
    renderDates();
    updateProgramme();
    vm.$watch('jiemudanInfo', updateProgramme);
    vm.$watch('nowPlayItem', updateProgramme);
    vm.$watch('jiemuNowDate', renderDateSelection);
    vm.$watch('tvIndex', function () { renderDates(); updateProgramme(); });
    vm.$watch(function () { return vm.$refs.player && vm.$refs.player.errorInfos; }, updateProgramme);
    root.addEventListener('focusin', function (event) {
      rows.some(function (items, index) {
        var position = items.indexOf(event.target);
        if (position === -1) return false;
        column = index;
        positions[index] = position;
        return true;
      });
    });
    document.body.classList.add('tv-shell-active');
    window.addEventListener('keydown', onKey, true);
    function restoreFocus() {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) focus(column, positions[column]);
    }
    document.addEventListener('fullscreenchange', restoreFocus);
    document.addEventListener('webkitfullscreenchange', restoreFocus);
    focus(2, positions[2]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var loading = make('main', '', document.body);
    loading.id = 'ysp-tv-loading';
    make('h1', '央视频直播', loading);
    var message = make('p', '正在加载频道…', loading);
    var retry = button(loading, '重试', function () { window.location.reload(); });
    retry.hidden = true;
    function exit(event) {
      if (event.keyCode !== 461) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.close();
    }
    window.addEventListener('keydown', exit, true);
    var attempts = 0;
    function start() {
      var vm = findTV();
      if (vm) {
        loading.remove();
        document.documentElement.classList.remove('tv-shell-loading');
        install(vm);
        window.removeEventListener('keydown', exit, true);
      } else if (attempts++ < 120) window.setTimeout(start, 250);
      else {
        message.textContent = '暂时无法加载频道，请重试。';
        retry.hidden = false;
        retry.focus();
      }
    }
    start();
  });
}());
