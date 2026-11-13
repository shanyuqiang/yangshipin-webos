(function () {
  'use strict';
  var buttons = document.querySelectorAll('button');
  var status = document.getElementById('status');
  var focused = 0;

  function openOfficialPage() {
    try {
      status.textContent = '正在打开官网；后续播放和错误页面由官网提供。';
      // shortcut: top-level navigation leaves this probe, replace with a native client after compatibility is proven.
      window.location.assign('https://www.yangshipin.cn/tv/home');
    } catch (error) {
      status.textContent = '无法打开央视频官网，请检查网络后重试。';
    }
  }

  function exit() {
    window.close();
  }

  buttons[0].addEventListener('click', openOfficialPage);
  buttons[1].addEventListener('click', exit);
  Array.prototype.forEach.call(buttons, function (button, index) {
    button.addEventListener('focus', function () { focused = index; });
  });
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode;
    if (key >= 37 && key <= 40) {
      focused = key === 37 || key === 38 ? 0 : 1;
      buttons[focused].focus();
    } else if (key === 13) {
      if (focused === 0) openOfficialPage();
      else exit();
    } else if (key === 461) {
      exit();
    } else {
      return;
    }
    event.preventDefault();
  });
  buttons[0].focus();
}());
