# Yangshipin webOS

面向 LG webOS 5+ 的非官方央视频电视客户端，目前可通过 Developer Mode 安装实验版，尚未发布正式版本。

目标：遥控器操作、央视/卫视直播、节目单及官网支持的相关播放功能；安装后独立运行，无需电脑常驻。参考 [央视频网页](https://www.yangshipin.cn/tv/home) 与 [bili-webos](https://github.com/asdf17128/bili-webos)。

正常启动直接进入独立电视界面。频道、节目单和遥控器操作由本应用负责，视频使用央视频播放器组件。LG CX 已验证央视和卫视直播、遥控器导航，以及模拟频道目录连接中断后按确定恢复播放。真实登录测试按当前验收范围暂缓。直播支持回到已缓冲的直播点，播放出错时可重试。历史节目单可浏览，暂未观察到官网公开电视页面提供可用的历史节目回看。

开发机需要 Node.js 20+、Google Chrome 和配置好的 webOS Developer Mode 设备。运行单测和浏览器测试：

```sh
npm ci
npm test
npm run test:e2e
```

构建安装包：

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package app service -o dist
```

真机流畅度验收需要 Node.js 22+ 和当前电视应用的 webOS 调试端口。打开目标频道并进入全屏后执行：

```sh
node tools/watch-video.mjs "http://127.0.0.1:$INSPECT_PORT" 320 --strict
```

采样在电视应用页面内进行。严格验收通过时报告 `acceptancePassed: true`，进程退出码为 0。采样不完整、分辨率改变或检测到掉帧、等待、跳转、停滞时，退出码为 1。

电视兼容基线为 Chromium 68 / Node.js 8。进度与验收记录见 GitHub Issues。项目与央视频、LG 无官方关系。
