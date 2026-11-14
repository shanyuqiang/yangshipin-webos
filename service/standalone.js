(function () {
  'use strict';
  function notifyVideoReady(player, original, event) {
    var video = player.myVideo && player.myVideo.myvideo;
    if (!video || video.paused) return original.call(player, event);
    // The SDK pauses every video on repeated readiness, even its own active video.
    var pause = Object.getOwnPropertyDescriptor(video, 'pause');
    if (pause && !pause.configurable) return original.call(player, event);
    Object.defineProperty(video, 'pause', {configurable:true, value:function () {}});
    try { return original.call(player, event); }
    finally {
      if (pause) Object.defineProperty(video, 'pause', pause);
      else delete video.pause;
    }
  }

  function configureLiveHls(Hls, platform) {
    var config = Hls && Hls.DefaultConfig;
    if (!config) return;
    if (config.backBufferLength > 24) config.backBufferLength = 24;
    // Let the SDK use its FetchLoader where streaming APIs are available.
    if (['fetch', 'AbortController', 'ReadableStream', 'Request'].every(function (name) {
      return typeof platform[name] === 'function';
    })) config.progressive = true;
  }

  function manageLiveHeartbeat(live, cancel) {
    var disposed = false;
    function clear() {
      if (live.cycleInterTime != null) cancel(live.cycleInterTime);
      live.cycleInterTime = null;
    }
    // The SDK overwrites the timer ID on source initialization and quality reset.
    ['initTimes', 'initStep5'].forEach(function (name) {
      var original = live[name];
      if (typeof original !== 'function') return;
      live[name] = function () {
        if (disposed) return;
        clear();
        return original.apply(this, arguments);
      };
    });
    return function () {
      disposed = true;
      clear();
    };
  }

  if (typeof module === 'object' && typeof window === 'undefined') {
    module.exports = {notifyVideoReady:notifyVideoReady, configureLiveHls:configureLiveHls, rollGuideDate:rollGuideDate, manageLiveHeartbeat:manageLiveHeartbeat};
    return;
  }

  var expired = false;
  var assets = [
    'https://s.yangshipin.cn/CCTVVideo/CCTVVideoAssets/v11/js/zepto.min.js',
    'https://s.yangshipin.cn/CCTVVideo/cctvh5-openapi/cctvh5-openapi.min.js?ver=24722',
    'https://s.yangshipin.cn/CCTVVideo/cctvh5-trace/cctvh5-trace.min.js',
    'https://sapi.yangshipin.cn/assets/2022/ysp_account/yspLogin.min.js?ver=240723',
    'https://sapi.yangshipin.cn/assets/2024/wasm/RJq7sO71JF.js',
    'https://sapi.yangshipin.cn/assets/2025/wasm/hls.cmg.js?ver=250813',
    'https://sapi.yangshipin.cn/assets/2025/wasm/cmg.worker.js?ver=250813',
    '/js/chunk-vendors.86ef4b5a.js'
  ];

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timer = setTimeout(function () { script.remove(); reject(new Error('Player download timed out')); }, 15000);
      script.onload = function () { clearTimeout(timer); resolve(); };
      script.onerror = function () { clearTimeout(timer); reject(new Error('Player download failed')); };
      script.src = url;
      document.head.appendChild(script);
    });
  }

  function requirePlayer() {
    configureLiveHls(window.Hls, window);
    var modules = window.webpackJsonp[0][1];
    var cache = Object.create(null);
    function load(id) {
      if (!Object.prototype.hasOwnProperty.call(modules, id)) throw new Error('Player module unavailable');
      if (cache[id]) return cache[id].exports;
      var module = cache[id] = {exports:{}};
      modules[id].call(module.exports, module, module.exports, load);
      return module.exports;
    }
    load.r = function (exports) { Object.defineProperty(exports, '__esModule', {value:true}); };
    load.d = function (exports, name, get) { Object.defineProperty(exports, name, {enumerable:true, get:get}); };
    return {Vue:load('a026').default, Player:load('ed4d').default.livePlayer};
  }

  function read(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('Catalogue request failed');
      return response.arrayBuffer();
    }).then(function (data) { return new Uint8Array(data); });
  }

  function dates(channel, today) {
    var available = channel.programDates.indexOf(today) === -1 ? channel.programDates.concat(today).sort() : channel.programDates;
    var day = available.indexOf(today);
    var start = Math.max(day - 3, 0);
    return available.slice(start, start + 7).map(function (date) {
      return {day:date.slice(5).replace('-', '/'), fullDay:date.replace(/-/g, '')};
    });
  }

  function rollGuideDate(vm, previous, current) {
    if (previous === current) return;
    // Keep the date picker usable if the startup catalogue is older than today.
    var choices = dates(vm.tvIndex, current);
    if (!vm.followGuideToday && !choices.some(function (choice) { return choice.fullDay === vm.jiemuNowDate; })) {
      var day = vm.jiemuNowDate;
      choices = [{day:day.slice(4, 6) + '/' + day.slice(6), fullDay:day}].concat(choices);
    }
    vm.guideDates = choices;
    if (vm.followGuideToday) vm.changeDay(current.replace(/-/g, ''));
  }

  function mount(libraries, groups, serverTime) {
    var offset = serverTime - Date.now();
    var catalogue = window.yspCatalogue;
    var currentRequest = 0;
    var programmeTimer;
    var guideToday;
    function now() { return Date.now() + offset; }
    function today() { return new Date(now() + 8 * 3600000).toISOString().slice(0, 10); }
    var selected = new URLSearchParams(location.search).get('pid');
    var group = groups[1].some(function (channel) { return channel.pid === selected; }) ? 1 : 0;
    var initial = groups[group].find(function (channel) { return channel.pid === selected; }) || groups[0][0];
    var ChannelPlayer = libraries.Vue.extend({
      extends: libraries.Player,
      methods: {
        getLiveUrlsByVid: function (pid, vid, definition, adjust) {
          var original = libraries.Player.methods.getLiveUrlsByVid;
          if (definition !== undefined || adjust !== undefined) return original.apply(this, arguments);
          if (!this.initialQualityRequested && this.videoConfig.requestedDefinition) {
            this.initialQualityRequested = true;
            return original.call(this, pid, vid, this.videoConfig.requestedDefinition, 0);
          }
          var preferred;
          try { preferred = window.sessionStorage.getItem('ysp-tv-quality'); }
          catch (error) { /* Let the SDK use its default. */ }
          if (['fhd', 'shd', 'hd'].indexOf(preferred) !== -1) return original.call(this, pid, vid, preferred, 1);
          return original.apply(this, arguments);
        },
        onPvTotal: function (event) {
          return notifyVideoReady(this, libraries.Player.methods.onPvTotal, event);
        }
      },
      mounted: function () {
        if (this.myVideo) this.disposeLiveHeartbeat = manageLiveHeartbeat(this.myVideo, clearInterval);
      },
      beforeDestroy: function () {
        if (this.disposeLiveHeartbeat) this.disposeLiveHeartbeat();
        if (this.myVideo) this.destroyedLive();
      }
    });
    return new libraries.Vue({
      data: {
        tvTabs:groups, selectIndex:group, tvIndex:null, jiemudanInfo:[],
        jiemuNowDate:'', guideDates:[], followGuideToday:true, nowPlayItem:'', videoConfig:null, playerRevision:0
      },
      created: function () {
        this.changeTV(initial);
        programmeTimer = setInterval(this.updateLiveProgramme, 5000);
      },
      beforeDestroy: function () { clearInterval(programmeTimer); currentRequest++; },
      methods: {
        changeIndex: function (index) { this.selectIndex = index; },
        changeTV: function (channel) {
          window.yspChannelGeneration = (window.yspChannelGeneration || 0) + 1;
          var date = today();
          guideToday = date;
          this.tvIndex = channel;
          this.guideDates = dates(channel, date);
          this.videoConfig = {pid:channel.pid, vid:channel.streamId, isTV:true, autoplay:true,
            viewRights:channel.viewRights, payType:channel.payType};
          history.replaceState(null, '', '?pid=' + encodeURIComponent(channel.pid));
          this.changeDay(date.replace(/-/g, ''));
        },
        selectPlaybackQuality: function (definition) {
          if (['fhd', 'shd', 'hd'].indexOf(definition) === -1) return;
          this.videoConfig = Object.assign({}, this.videoConfig, {requestedDefinition:definition});
          this.retryPlayback();
        },
        retryPlayback: function () {
          window.yspChannelGeneration++;
          this.playerRevision++;
        },
        updateLiveProgramme: function () {
          var previous = guideToday;
          guideToday = today();
          rollGuideDate(this, previous, guideToday);
          if (!this.jiemudanInfo.length) return;
          var marked = catalogue.markCurrentProgramme(this.jiemudanInfo, Math.floor(now() / 1000));
          if (marked.entries.some(function (entry, index) { return entry !== this.jiemudanInfo[index]; }, this)) {
            this.jiemudanInfo = marked.entries;
          }
          this.nowPlayItem = marked.currentName;
        },
        changeDay: function (day) {
          var vm = this;
          var request = ++currentRequest;
          vm.followGuideToday = day === today().replace(/-/g, '');
          vm.jiemuNowDate = day;
          vm.jiemudanInfo = [];
          vm.nowPlayItem = '';
          read('https://capi.yangshipin.cn/api/yspepg/program/' + vm.tvIndex.pid + '/' + day).then(function (data) {
            if (request !== currentRequest) return;
            vm.jiemudanInfo = catalogue.guide(data);
            vm.updateLiveProgramme();
          }).catch(function () {
            if (request === currentRequest) vm.nowPlayItem = '节目单暂时不可用';
          });
        }
      },
      render: function (h) {
        return h(ChannelPlayer, {key:this.videoConfig.pid + ':' + this.playerRevision, ref:'player', props:{videoConfig:this.videoConfig}});
      }
    }).$mount('#player-mount');
  }

  var parameters = {versionName:'99.99.99', versionCode:'999999', vplatform:'109', platformVersion:'Chrome',
    deviceModel:(navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || '68', newLogin:'1', pc_version:'1.1.16'};
  Object.keys(parameters).forEach(function (key) { document.cookie = key + '=' + parameters[key] + '; Path=/'; });
  window.activeURL = location.origin;
  var scripts = assets.reduce(function (previous, asset) {
    return previous.then(function () {
      if (expired) throw new Error('Startup deadline exceeded');
      return loadScript(asset);
    });
  }, Promise.resolve());
  var timer = setTimeout(function () {
    expired = true;
    window.yspStandaloneFailed = true;
  }, 30000);
  Promise.all([
    scripts.then(requirePlayer),
    read('https://capi.yangshipin.cn/api/oms/pc/page/PG00000004').then(window.yspCatalogue.channels),
    read('https://csapi.yangshipin.cn/voapi/omsot/serverTime').then(window.yspCatalogue.serverTime)
  ]).then(function (data) {
    if (expired) return;
    clearTimeout(timer);
    window.yspStandaloneTV = mount(data[0], data[1], data[2]);
  }).catch(function () {
    clearTimeout(timer);
    expired = true;
    window.yspStandaloneFailed = true;
  });
}());
