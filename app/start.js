(function () {
  'use strict';
  var status = document.getElementById('status');
  var retry = document.getElementById('retry');
  var bridge;
  var timer;
  function fail() {
    status.textContent = '电视播放服务启动失败，请重试。';
    retry.focus();
  }
  function start() {
    clearTimeout(timer);
    status.textContent = '正在启动电视端服务…';
    if (!window.PalmServiceBridge) { fail(); return; }
    timer = setTimeout(fail, 15000);
    try {
      bridge = new PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        clearTimeout(timer);
        try {
          var response = JSON.parse(raw);
          if (!response.returnValue || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/restore$/.test(response.url)) {
            fail(); return;
          }
          window.location.replace(response.url);
        } catch (error) { fail(); }
      };
      bridge.call('luna://com.shanyuqiang.yangshipin.service/start', '{}');
    } catch (error) { clearTimeout(timer); fail(); }
  }
  retry.addEventListener('click', start);
  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 461) { event.preventDefault(); window.close(); }
  });
  start();
}());
