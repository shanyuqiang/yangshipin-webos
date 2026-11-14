# Yangshipin webOS

面向 LG webOS 5+ 的非官方央视频电视客户端，目前可通过 Developer Mode 安装实验版，尚未发布正式版本。

目标：遥控器操作、央视/卫视直播、节目单及官网支持的相关播放功能；安装后独立运行，无需电脑常驻。参考 [央视频网页](https://www.yangshipin.cn/tv/home) 与 [bili-webos](https://github.com/asdf17128/bili-webos)。

正常启动直接进入独立电视界面。频道、节目单和遥控器操作由本应用负责，视频使用央视频播放器组件。LG CX 已验证央视和卫视直播、遥控器导航，以及模拟频道目录连接中断后按确定恢复播放。真实登录测试按当前验收范围暂缓。官网历史节目单可浏览，暂未观察到可用的回看或时移操作。

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

电视兼容基线为 Chromium 68 / Node.js 8。进度与验收记录见 GitHub Issues。项目与央视频、LG 无官方关系。
