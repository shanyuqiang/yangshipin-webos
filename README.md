<p align="center">
  <img src="docs/assets/logo.png" alt="Yangshipin webOS 标志，红底白色央字" width="96" height="96">
</p>

# Yangshipin webOS

为 LG 电视遥控器设计的非官方央视频直播客户端。打开应用即可浏览央视和卫视频道、查看节目单、调整画质和全屏观看。安装完成后，应用和播放服务都在电视上运行，日常观看无需电脑常驻。

当前为开发者模式安装版 **0.0.5**，已在 LG OLED65CXPCA（webOS 5、Chromium 68、Node.js 8）上验证。

## 可以做什么

- **看直播**：在央视和卫视列表中选择频道，确认后切台。频道目录、节目单和直播地址来自央视频。
- **查节目单**：查看当前节目和其他日期的安排。默认查看当天时，跨过北京时间午夜会自动更新。历史节目单供浏览。
- **调整画质与全屏**：切换频道提供的清晰度，退出重进后恢复上次选择。播放器右下角保留电视全屏。
- **恢复播放**：取流失败时可按「重试播放」。当前缓冲足够时，可以「后退 10 秒」或「回到直播」，可用范围取决于频道和缓冲。
- **查看权益提示**：清晰度、会员和地域可用性以央视频为准。真实账号登录尚未纳入真机验收。

## 遥控器操作

| 按键 | 操作 |
| --- | --- |
| 方向键 | 在频道、日期、节目和播放工具栏之间移动焦点 |
| 确定 | 选择频道或画质、切换节目单日期、执行当前按钮 |
| 返回 | 退出全屏或画质菜单，从节目返回日期，再返回播放工具栏 |

## 安装到 LG 电视

准备一台已开启 **Developer Mode** 的 LG 电视。让电脑与电视处于同一局域网，按 LG 的流程把电视添加到 webOS CLI。下面假设添加时使用的设备名是 `lg-tv`。 [LG Developer Mode 配置指南](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)

在仓库根目录使用 Node.js 20 或更新版本运行：

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package app service -o dist
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-install -d lg-tv dist/com.shanyuqiang.yangshipin_0.0.5_all.ipk
```

安装后，从电视桌面打开红底「央」字图标 **央视频电视实验版**。Developer Mode 会话期限可在电视的 Developer Mode 应用中查看。

## 开发与验证

`app/` 提供电视启动入口，`service/` 提供在电视本机运行的 HTTP 服务、电视界面和播放组件接入。频道、节目单和遥控交互由应用渲染。

本地测试需要 Node.js 20+ 和 Google Chrome：

```sh
npm ci
npm test
npm run test:e2e
```

真机流畅度测试使用 Node.js 22+。打开目标频道并切到全屏，把 `INSPECT_PORT` 设为 webOS 调试端口：

```sh
node tools/watch-video.mjs "http://127.0.0.1:$INSPECT_PORT" 320 --strict
```

测试在电视页面内采样。采样完整、分辨率保持稳定且未检测到掉帧、等待、跳转或停滞时，报告 `acceptancePassed: true`。CCTV-1 和湖南卫视的 720p 与 1080p 全屏测试数据见[真机验收记录](docs/research/playback-feasibility.md)。

本项目与央视频、LG 无官方关系。电视遥控交互参考了 [bili-webos](https://github.com/asdf17128/bili-webos)。

## 开源许可证

本项目代码采用 [MIT 许可证](LICENSE)。央视频的名称、节目内容及相关服务权利归其各自权利人所有。
