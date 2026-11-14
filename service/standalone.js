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

  function limitLiveHistory(Hls) {
    var config = Hls && Hls.DefaultConfig;
    if (config && config.backBufferLength > 24) config.backBufferLength = 24;
  }

  if (typeof module === 'object' && typeof window === 'undefined') {
    module.exports = {notifyVideoReady:notifyVideoReady, limitLiveHistory:limitLiveHistory};
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
    limitLiveHistory(window.Hls);
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
    var day = channel.programDates.indexOf(today);
    var start = day === -1 ? 0 : Math.max(day - 3, 0);
    return channel.programDates.slice(start, start + 7).map(function (date) {
      return {day:date.slice(5).replace('-', '/'), fullDay:date.replace(/-/g, '')};
    });
  }

  function mount(libraries, groups, serverTime) {
    var offset = serverTime - Date.now();
    var catalogue = window.yspCatalogue;
    var currentRequest = 0;
    var today = new Date(serverTime + 8 * 3600000).toISOString().slice(0, 10);
    var selected = new URLSearchParams(location.search).get('pid');
    var group = groups[1].some(function (channel) { return channel.pid === selected; }) ? 1 : 0;
    var initial = groups[group].find(function (channel) { return channel.pid === selected; }) || groups[0][0];
    var ChannelPlayer = libraries.Vue.extend({
      extends: libraries.Player,
      methods: {
        getLiveUrlsByVid: function (pid, vid, definition, adjust) {
          var original = libraries.Player.methods.getLiveUrlsByVid;
          if (definition !== undefined || adjust !== undefined) return original.apply(this, arguments);
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
      beforeDestroy: function () {
        if (this.myVideo) {
          clearInterval(this.myVideo.cycleInterTime);
          this.destroyedLive();
        }
      }
    });
    return new libraries.Vue({
      data: {
        tvTabs:groups, selectIndex:group, tvIndex:null, jiemudanInfo:[],
        jiemuNowDate:'', nowPlayItem:'', videoConfig:null, playerRevision:0
      },
      created: function () { this.changeTV(initial); },
      methods: {
        changeIndex: function (index) { this.selectIndex = index; },
        changeTV: function (channel) {
          window.yspChannelGeneration = (window.yspChannelGeneration || 0) + 1;
          this.tvIndex = Object.assign({}, channel, {parseDateList1:dates(channel, today)});
          this.videoConfig = {pid:channel.pid, vid:channel.streamId, isTV:true, autoplay:true,
            viewRights:channel.viewRights, payType:channel.payType};
          history.replaceState(null, '', '?pid=' + encodeURIComponent(channel.pid));
          this.changeDay(today.replace(/-/g, ''));
        },
        retryPlayback: function () {
          window.yspChannelGeneration++;
          this.playerRevision++;
        },
        changeDay: function (day) {
          var vm = this;
          var request = ++currentRequest;
          vm.jiemuNowDate = day;
          vm.jiemudanInfo = [];
          vm.nowPlayItem = '';
          read('https://capi.yangshipin.cn/api/yspepg/program/' + vm.tvIndex.pid + '/' + day).then(function (data) {
            if (request !== currentRequest) return;
            vm.jiemudanInfo = catalogue.guide(data, Math.floor((Date.now() + offset) / 1000));
            var current = vm.jiemudanInfo.find(function (entry) { return entry.sta === 2; });
            vm.nowPlayItem = current ? current.name : '';
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
