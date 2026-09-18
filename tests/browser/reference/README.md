# Launchpad 浏览器参考宿主（Reference Host）

本目录保留旧浏览器产品入口的最小可用形态，仅用于回归共享动画、文件夹与手势逻辑。
它取代了此前的仓库根 `index.html` + `src/main.ts` + `src/App.vue` 组合：

- `index.html`：浏览器参考测试入口页面，只在 Vite 开发服务器（`import.meta.env.DEV`）下挂载。
- `main.ts`：旧 `src/main.ts` 的迁移版本，移除 MotionLab query 分流（MotionLab 已独立为 `motion-lab.html`）。
- `ReferenceApp.vue`：旧 `src/App.vue` 的迁移版本，业务代码仍从 `src/` 复用，只改写相对路径。
- `vue-sfc-module.d.ts`：`main.ts` 由 `tsconfig.tools.json`（纯 `tsc`）检查，需要 SFC 模块声明。

## 保留理由

- 共享动画、文件夹开合/回滚、多选与手势实现仍在 `src/` 中被 Native 与参考宿主共用；
  `tests/browser` 下的 G4/G5 等规格依赖真实浏览器输入（真实鼠标事件、framebuffer 采样、
  Fluent Web Components 布局）来回归这些共享逻辑。
- Native 侧（electrobun/WebGPU）目前无法等价复现部分浏览器输入与 DOM/Fluent 布局行为，
  参考宿主是这些规格唯一可运行的宿主。

## 边界（不是产品入口）

- 参考宿主不进入 Native 产品：它不作为任何生产构建（rollup）入口，根 `index.html`
  与产品入口已由 Native 侧整理移除；`main.ts` 在非 DEV 环境直接渲染提示，不挂载应用。
- 参考宿主不能在 Tauri 中运行：`src/api/launchpadApi.ts` 与 `src/api/windowChromeApi.ts`
  已移除 `@tauri-apps/api` 运行导入，也不再寻找全局 Tauri 注入。默认没有 bridge，
  所有命令走"bridge 不可用"的既有约定返回值；命令/事件字符串只是测试 mock 协议，
  不会被真正执行。测试通过 `setLaunchpadApiBridgeForTests` /
  `setWindowChromeBridgeForTests` 注入假实现。
- 参考宿主不连接真实用户数据：不读写真实布局文件、不扫描真实应用目录、不启动 Native 进程。

## 启动与测试

```powershell
# 开发服务器（Playwright 配置会自动启动同样的命令）
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort

# 打开参考宿主
#   http://127.0.0.1:4175/tests/browser/reference/index.html
#   http://127.0.0.1:4175/tests/browser/reference/index.html?fixture=multi-select

# 浏览器回归
npm run test:ui                      # 全部 chromium 规格
npm run test:i18n-ui                 # 单规格示例
npm run test:multi-select-ui
npm run test:trusted-mouse-ui
```

`tests/browser/fixtures/*.html` 是独立的 fixture-only 页面，不经过参考宿主，保持原样。

## 退役与退出条件

该宿主的 Playwright WebView2 CDP 入口（`LUMERIA_WEBVIEW_CDP_ENDPOINT`、
`playwright.webview.config.ts`、`npm run test:trusted-mouse-webview`）已退役。
`launchpad-folder-alternation-race.spec.ts` 中两条 WebView2 专属用例保留原有断言，
维持历史状态（它们在 Chromium project 中本来就因缺少真实 WebView2 合成器而跳过），
现在把跳过条件写死为显式说明，不再依赖已退役的环境变量：

- 交替打开两个文件夹不得复活/串线旧文件夹视觉；
- 接受开启请求后 0ms 与 32ms 关闭第二个文件夹仍保持原子性。

两条用例的回归意图在 Native 侧已有等价覆盖：`src/native/diagnostics/nativeFolderSmoke.ts`
（由 `src/native/product/nativeProduct.ts` 调用）断言了 cross-folder opening/handoff、
latest cross-folder request wins，以及未呈现开启取消、部分开启后中断关闭与清理。
仅有"需要真实 WebView2 合成器像素采样"这一部分尚无等价覆盖，后续由 Native 侧补足或
随本宿主一起退役。

满足以下条件后应删除本目录及依赖它的规格：

1. Native 侧逐项覆盖对应回归意图（文件夹开合/回滚/交替竞态、手势与取消帧采样、
   多选管理、设置面板与语言下拉、图标栅格、resize/wheel 等），且这些覆盖在 CI 或
   常规 Native 验收流程中稳定运行。
2. 共享 fixture 迁移完成：共享动画/手势逻辑有宿主无关的替代 fixture，或对应逻辑
   已完全归属 Native，浏览器 DOM/Fluent 依赖不再需要真实浏览器验证。

在此之前，本目录只做参考回归，不作为产品验收入口。
