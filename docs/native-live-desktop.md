# Native 动态桌面背景

Live Desktop 复用 `crates/lumeria-live-desktop` 中的 Windows 捕获与特效实现，通过 `bun/lumeria_live_desktop.dll` 加载到应用进程。它是实验功能，默认关闭。

## 启用方式

启动前设置 `LUMERIA_EXPERIMENTAL_LIVE_DESKTOP=1`；能力检测通过后，设置页才显示对应背景选项。移除该环境变量并重启即可恢复默认关闭状态。已保存的 `windowsLiveDesktop` 配置不能绕过这个开关。

关闭时不加载 DLL，也不探测或捕获桌面。启用后使用 Wallpaper Engine 弹出窗口作为 WGC 捕获来源，保留 D3D11 复制、特效和捕获线程；它不是通用视频壁纸播放器。不支持的来源、捕获失败或设备错误会明确报告，并回退到配置的基础背景。鼠标转发默认关闭。

## 合成与生命周期

DLL 管理自己的捕获设备和视觉节点。固定版本的 Electrobun SDK 将该节点挂到同一合成树中 Pixi 节点的下方，避免子 HWND 裁切和重复创建合成目标。SDK 持有 COM 引用，直到节点解除挂接或窗口销毁。

DLL 在进程退出前保持加载，避免未结束的工作线程调用已卸载代码；停止错误仍会报告。设置应用使用既有事务和回滚流程：隐藏或最小化暂停呈现，切换到其他背景停止捕获，窗口显示环境变化时重启捕获源。

关闭应用时先停止捕获，再确认关闭成功。清理失败进入既有关闭重试流程。

## 构建与接口

运行 `npm run native:live-desktop:build` 构建动态库。常规 Native 构建、开发和 smoke 的前置步骤也会构建它；运行时声明收集同时覆盖数据服务与 Live Desktop Rust 包。

DLL 接口通过 `lumeria_live_desktop_request` 接收有大小限制的 UTF-8 JSON 请求，通过 `lumeria_live_desktop_free` 释放返回数据。只接受当前进程拥有的 HWND。

## 使用限制

Live Desktop 是实验功能。普通窗口和壁纸测试不覆盖它的捕获设备、多显示器和混合 DPI 行为，这些场景需要单独测试。排查时分别检查捕获源、合成状态和实际画面，不能只看应用仍在运行。
