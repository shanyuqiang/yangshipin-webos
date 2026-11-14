(function () {
  'use strict';
  var status = document.getElementById('status');
  var retry = document.getElementById('retry');
  var bridge;
  var timer;
  function finish() {
    bridge = null;
    clearTimeout(timer);
    retry.disabled = false;
  }
  function fail() {
    status.textContent = '电视播放服务启动失败，请重试。';
    retry.focus();
  }
  function start() {
    if (bridge) return;
    status.textContent = '正在启动电视端服务…';
    if (!window.PalmServiceBridge) { fail(); return; }
    try {
      var attempt = new PalmServiceBridge();
      bridge = attempt;
      retry.disabled = true;
      timer = setTimeout(function () {
        if (bridge !== attempt) return;
        finish();
        fail();
      }, 15000);
      attempt.onservicecallback = function (raw) {
        if (bridge !== attempt) return;
        finish();
        try {
          var response = JSON.parse(raw);
          if (!response.returnValue || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/restore$/.test(response.url)) {
            fail(); return;
          }
          window.location.replace(response.url);
          retry.disabled = true;
        } catch (error) { fail(); }
      };
      attempt.call('luna://com.shanyuqiang.yangshipin.service/start', '{}');
    } catch (error) { finish(); fail(); }
  }
  retry.addEventListener('click', start);
  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 461) { event.preventDefault(); finish(); window.close(); }
  });
  start();
}());
