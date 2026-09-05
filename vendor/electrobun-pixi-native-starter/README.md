# Electrobun + PixiJS Native Starter

这是一个固定版本、可直接替换业务场景的 Windows Starter。它完全不创建 WebView、`BrowserWindow` 或 HTML canvas：

```text
PixiJS scene → WebGPURenderer → Electrobun adapter → Dawn/WebGPU → GpuWindow
              ↘ Skia Canvas2D（文字、图片解码、离屏导出）
```

版本固定为 Electrobun 2.0.1、Bun 1.4、PixiJS 8.20.1 和 `@napi-rs/canvas` 1.0.8。`src/runtime/native-app.ts` 是 Runtime，`src/demo/demo.ts` 只展示能力，`src/main.ts` 只读取启动参数并装配两者。应用代码只从公开的 `pixi.js` 和 `src/native-host.ts` 导入；DLL symbol、FFI 布局、Electrobun 私有路径和 Pixi renderer 私有初始化都封装在 Runtime 内。`prepare:electrobun` 会以可重复、带版本检查的方式应用固定补丁，版本不匹配时直接失败。

## 运行

0.2.4 新增系统界面字体 `readNativeSystemPreferences().value.uiFontFamily`（读取失败为 null），以及以下公开窗口能力：

- `getWindowFrame()` 返回只读外框物理像素及缩放比例，无需使用 testing 入口。
- `setWindowMode("fullscreen" | "windowed", overscanPixels = 0)` 和只读 `windowMode` 使用拥有的 Win32 窗口样式/矩形完成切换和恢复；0.2.5 修复 Electrobun 将隐藏标题栏窗口误判为全屏的问题。可扩展全屏外框每边 0–16 个物理像素，渲染内容随客户区扩展。
- 0.2.6 修复 Canvas/ImageSource 上传到 BGRA 纹理时的红蓝通道互换；原生渐变颜色已通过实际 GPU 像素读回验证。
- 0.2.7 为透明 GPU 窗口初始化完整的顶层 layered 输入覆盖，避免扩大窗口/全屏后原始区域外点击透传；透明像素继续由子视图 DirectComposition 合成。窗口、全屏、补偿全屏和恢复各验证 25 个 Windows 实际命中点。
- 0.2.8 公开 `NativeGlobalShortcut`，注册与 Starter 的原生回调模块使用同一实例，避免混用 `electrobun/main` 时出现已注册但回调丢失。实际 Alt+Space 输入已验收。
- 0.2.9 公开 `NativeTray` 和 `openNativePath`。托盘与同一 FFI 事件实例绑定，移除时清理监听；Windows 左键发送主操作，右键显示原生菜单。固定 DLL 包含这项托盘分发修复，保留 DComp 原子 resize。
- 0.2.10 的隐藏标题栏窗口保留 Win32 缩放/最大化能力，自定义客户区覆盖整个窗口并处理标题重绘；透明 GPU 窗口从创建时使用 DComp 无重定向根。透明窗口使用标准 Pixi pass，避免旧 bundle ABI 的不透明固定清屏色造成 Acrylic 闪变。`beforeClose` 返回 `false` 可取消关闭，供启动台隐藏与退出分流。
- `titleBarStyle` 创建选项、`startWindowDrag()`、`startWindowResize(direction)` 用于自定义窗口栏；移动/缩放仅投递到当前应用窗口。
- `transparent: true` 与 `setWindowPresentation(material, appearance)` 提供透明 surface 和系统材质；先检查 `windowMaterialSupport`，Acrylic/Mica/Mica Alt 仅支持 Windows 11 build 22621+。
- `supportsColorDialog` / `chooseColor(0xRRGGBB)` 打开当前窗口所属的 Windows 颜色对话框，返回 `NativePlatformResult<number>`；取消为 `CANCELLED`，不改变调用方颜色。

实际宿主验证：`$env:PIXI_PRESENTED_SMOKE='1'; $env:PIXI_COLOR_DIALOG_SMOKE='1'; npm start`。颜色验证需要 Python，仅定位本次测试 PID 的对话框；确认/取消、全屏/overscan往返、窗口外框、材质、图标及关闭守卫均有断言。此版本未增加 UIA Provider，也未增加 Win10 的旧 Acrylic 回退。

0.2.2 公开 `createTextInputHost`/`TextInput`/相关类型；`chrome:false` 仅绘制编辑内容，由消费者提供外观，保留 IME、选择、撤销、剪贴板及既有 focus/blur/change 事件。`focused`/`composing` 可供宿主路由键盘。`app.beforeClose(async () => save())` 在正常窗口关闭前等待；reject 保留窗口，成功才清理并关闭。直接 dispose 为强制清理接口，不运行 guard。

Starter 0.2.1 新增 `app.on("presented", listener)`：在普通渲染或 fast-bundle 成功提交后同步通知，早于 `nextPresent()` Promise 的 continuation 和动画排入的微任务。事件包含 `frameNumber/deviceGeneration/surfaceGeneration`；失败帧不通知。回调只保存已呈现的场景快照或 invalidate，不可重入渲染；监听器抛错会进入 fatal 状态。返回的函数用于取消订阅，dispose 清理所有订阅。DLL ABI 保持 4。

回调实际宿主验证：`$env:PIXI_PRESENTED_SMOKE='1'; npm start`。

```powershell
npm install
npm start
```

新应用的入口只需要：

```ts
import { Container, Graphics } from "pixi.js";
import { createNativePixiApplication } from "./native-host";

const app = await createNativePixiApplication({
  title: "My App",
  width: 900,
  height: 600,
  background: 0x080b14,
});

const scene = new Container();
scene.addChild(new Graphics().circle(100, 100, 40).fill(0x6c63ff));
app.stage.addChild(scene);
const presented = app.nextPresent();
app.invalidate();
await presented;
```

返回对象提供动态 `renderer`、`screen`、`resolution`、原生输入/文本会话、`invalidate()`、`nextPresent()`、`animate()`、生命周期事件和逆序 `dispose()`。Runtime 内部统一负责窗口、WebGPU/Pixi 初始化、输入 wake、resize/DPI、帧调度、surface/device 恢复和资源销毁。`nextPresent()` 等待调用之后下一次成功或 suboptimal 的真实 surface present；timeout、outdated 和恢复过程会继续等待，应用进入 failed/closing/closed 时拒绝。它不会主动请求绘制，因此应先取得 Promise 再调用 `invalidate()`。

版本化 release 本身就是完整项目，不需要旁边存在本仓库、兄弟仓库、原仓库 `node_modules` 或全局 Electrobun devkit。解压后直接：

```powershell
cd C:\path\to\electrobun-pixi-native-starter-0.2.2-win-x64
npm install
npm run dev
npm run build
```

发行目录自带固定 patched devkit 和 `native-frame.dll`；`.hutch` 只是 Starter 内部运行时目录，不是业务公共入口。

运行移植自 [GoodBoyDigital/pixi-bunnymark](https://github.com/GoodBoyDigital/pixi-bunnymark) 的 10 万 Sprite BunnyMark（也可在 `--` 后指定数量；兔子图片来自该上游项目）：

```powershell
npm run bunnymark
npm run bunnymark -- 20000
```

BunnyMark 关闭抗锯齿，左上角 HUD 显示当前 FPS 和 Sprite 数量；可同时调整 HUD 和显卡偏好：

```powershell
$env:PIXI_BUNNYMARK_HUD_SCALE="2.5"
$env:PIXI_GPU="integrated" # 集显优先；改为 discrete 则独显优先
$env:PIXI_MAX_FPS="120" # 0 表示不限帧
$env:PIXI_RESIZE_MODE="adaptive" # smooth 保帧率；live 作逐事件重配基线；adaptive 实时布局
npm run bunnymark
```

`PIXI_GPU` 可取 `default`、`integrated`、`discrete`。这是 WebGPU/Dawn 的功耗偏好而不是不稳定的 GPU0/GPU1 序号；`status` 会显示实际选中的适配器名称和类型。运行时按 `F6` 可在集显和独显间切换；Pixi 的 CPU 场景对象会保留，只重建 context、renderer/device 资源。`PIXI_MAX_FPS` 接受非负数，普通示例默认 60，BunnyMark 默认 0（不限帧）；调度器按绝对截止时间扣除本帧耗时，不会把渲染时间叠加到限帧等待上。它限制的是提交频率而不伪装成硬件 vsync，高于刷新率的 HUD 数字不代表屏幕真的扫描出了同样多帧。

### 窗口缩放模式

`PIXI_RESIZE_MODE` 默认为 `smooth`。三个模式都保持动画循环运行，区别是拖动期间何时更新 Pixi 逻辑布局和 GPU backing：

| 模式 | Pixi 逻辑布局 | GPU backing / surface | 拖动表现与适用场景 |
| --- | --- | --- | --- |
| `smooth` | 停止拖动 120ms 后更新 | 停止拖动后精确重配 | DComp 持续把当前 surface 缩放到窗口，文字和控件会随旧画面整体拉伸；重负载、游戏或优先保帧率时使用。 |
| `live` | 每个尺寸事件立即更新 | 每个尺寸事件立即精确重配 | UI 比例和像素尺寸始终同步，但连续拖动会频繁重建 backing，最容易掉帧；保留作逐事件精确重配的对照组。 |
| `adaptive` | 每个尺寸事件立即更新 | 停止拖动 120ms 后精确重配 | 根变换把实时布局映射到暂存 backing，控件重排、边缘锚定和命中区域立即跟随；兼顾实时 UI 与帧率，代价是文字和细线可能短暂变软。 |

跨 DPI 时 `adaptive` 会跳过延迟并立即精确重配。原生 surface 始终按所在显示器的 DPI 完整覆盖窗口；日志会打印真实 GPU 像素尺寸，比较官方固定 800×600、`resolution: 1` 的结果时必须把这项负载差异计算在内。

其他检查：

```powershell
npm run typecheck
npm run test:host
npm run verify:adapter
npm run build
npm run release:smoke
```

### 版本化制品

```powershell
npm run release:generate # 生成 ABI/capability/逐文件 SHA-256 manifest
npm run release:verify   # 校验当前 manifest 与本地 payload
npm run release:package  # 生成带版本号的发布目录
npm run release:smoke    # 在系统临时目录打包并运行独立 consumer smoke
```

发布目录包含仓库中同一份已测试 Runtime、Demo、配置、lockfile、资源、兼容补丁、完整 patched Electrobun devkit、`libNativeWrapper.dll`、`native-frame.dll`、consumer smoke 和 `starter-manifest.json`，不维护第二份模板。manifest schema v2 固化 Starter/Electrobun/Pixi 精确版本、最低 Windows 10.0.19041、win-x64、core/sdk/native ABI、capability mask、可复现构建时间、commit，以及全部文件的 size/SHA-256。缺文件、hash、ABI、capability、架构或固定依赖版本不匹配都会明确失败。

`release:smoke` 在系统临时空目录中只物化 release，扫描原仓库绝对路径泄漏，创建并安装独立 consumer，执行 `npm ci`、`npm run typecheck`、`npm run build`，再启动真实 Electrobun/Pixi 窗口并运行完整生命周期检查；关闭后还会确认没有指向临时 release 的残留进程。

### 安装到既有项目

LaunchPad 这类既有应用继续维护自己的 `package.json`，不把 Starter 当 npm 包。先精确声明并安装与 manifest 相同的依赖版本，再从解压后的 release 执行：

```powershell
npm run release:install-consumer -- <LaunchPad目录>
```

命令会完整校验 release 的 manifest、ABI、capabilities、平台和逐文件 SHA-256，再原子安装到 `LaunchPad/vendor/electrobun-pixi-native-starter`。相同 manifest 可重复执行且不改文件；目标中存在不同或损坏版本时会明确拒绝覆盖。安装目录内的 `starter-manifest.json` 记录 Starter commit 和全部制品 hash。

消费方入口直接引用 vendored Runtime，并通过随 release 提供的 runner 启动：

```ts
import { createNativePixiApplication } from "../vendor/electrobun-pixi-native-starter/src/native-host";
```

```json
{
  "scripts": {
    "start": "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs start",
    "dev": "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs dev",
    "build": "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs build",
    "typecheck": "tsc --noEmit"
  }
}
```

消费方 `tsconfig.json` 继承 release 内固定 Electrobun 2.0.1 类型映射，不依赖 Hutch 构建后才出现的 `.hutch/devkit` 投影目录：

```json
{
  "extends": "./vendor/electrobun-pixi-native-starter/consumer/tsconfig.json",
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "electrobun.config.ts"]
}
```

在消费方 `electrobun.config.ts` 合并固定 copy 配置：

```ts
import { nativePixiElectrobunCopy } from "./vendor/electrobun-pixi-native-starter/consumer/electrobun";

export default {
  // ...
  build: {
    // ...
    copy: {
      ...nativePixiElectrobunCopy,
      // LaunchPad 自己的资源
    },
  },
};
```

runner 会使用 vendored patched devkit、校验关键原生文件，并针对消费方唯一的 `pixi.js@8.20.1` 幂等应用固定兼容补丁。开发期 DLL 从经过 hash 校验的 vendor 绝对路径加载；stable build 则由 copy 配置放入应用 `bun/native-frame.dll`，运行时不依赖 Starter 仓库或兄弟仓库。

### 稳定应用边界

`src/native-host.ts` 是业务唯一入口：

```ts
import { Assets, Graphics, Sprite, Text } from "pixi.js";
import { createNativePixiApplication, nativeHost } from "./native-host";
```

业务通过 `createNativePixiApplication()` 获取 stage/renderer/window 和生命周期，通过 `nativeHost.platform`、`nativeHost.jobs` 使用桌面服务。底层 opaque context 仍内部固化 `create/reconfigure/present/status/release` 合同，但不再作为业务 API 暴露。present 状态统一为 `success`、`suboptimal`、`outdated`、`timeout`、`surface-lost`、`device-lost`、`out-of-memory`、`fatal`；标准 `renderer.render()` 和 Render Bundle fast path 共用恢复策略。

需要确认窗口 surface 已完成下一次提交时使用 `const done = app.nextPresent(); app.invalidate(); await done;`，不要用固定延时或导入非公共 testing seam。这里确认的是原生 surface present 调用成功，不承诺该帧已经被 DWM 扫描到物理显示器。

## 无 DevTools 调试

开发实例默认开放一个仅绑定 `127.0.0.1`、随机 token 鉴权的 Agent Debug Bridge；端口和 token 只写入系统临时目录，窗口退出时删除。它让 AI/脚本在没有 WebView 和 DevTools 时仍可读取运行状态、Pixi scene tree、真实 native present 计数和 GPU 错误，并可截图、点击带 `label` 的节点、单步帧循环及注入故障：

```powershell
npm run debug:pixi -- status
npm run debug:pixi -- tree 5 500
npm run debug:pixi -- capture
npm run debug:pixi -- hover interactive-mark
npm run debug:pixi -- click interactive-mark
npm run debug:pixi -- native-input-check
npm run debug:pixi -- native-touch-check
npm run debug:pixi -- pause
npm run debug:pixi -- step 1
npm run debug:pixi -- resume
npm run debug:pixi -- resize-check
npm run debug:pixi -- dpi-check
npm run debug:pixi -- switch integrated
npm run debug:pixi -- save-dialog . pixi-save-smoke.txt txt
npm run debug:pixi -- drag-out-prepare .\README.md
npm run debug:pixi -- file-drop-status
npm run test:lifecycle
```

`test:lifecycle` 会依次覆盖窗口原地 resize、DPI hit-test、真实 Win32 单击和滚轮、单指/双指触屏、触屏取消、capture 后拖出窗口并在窗口外释放、IME 会话、异步 jobs、dirty-frame 空闲、filter/mask/RenderTexture 标准渲染指纹、surface timeout/outdated/lost、device lost、internal GPU error、暂停/单步、最小化/恢复和 GPU 截图。validation 与 OOM 故意停在 `failed`，避免错误代码触发无休止的设备重建；确认原因后可手动恢复：

```powershell
npm run debug:pixi -- fault validation
npm run debug:pixi -- fault out-of-memory
npm run debug:pixi -- recover
```

生产环境不需要调试入口时设置 `$env:PIXI_AGENT_DEBUG="0"`。业务节点应设置稳定的 Pixi `label`，Agent 就能通过 scene tree 定位并用 `click <label>` 触发同一套 Federated Events，而不需要屏幕坐标猜测。

## GPU 与窗口生命周期

| 情况 | 当前处理 |
| --- | --- |
| `device.lost` / 驱动重置 | Rust callback 只复制事件到有界队列；Bun 主线程重建 surface、adapter、device 和 renderer，保留 CPU scene graph |
| uncaptured validation / OOM | 停帧并保留结构化错误，等待人工修复或 `recover`；不自动重启循环 |
| uncaptured internal / unknown | 自动执行完整 surface 恢复 |
| surface timeout | 丢弃该帧，16ms 后请求重试；不把偶发 timeout 误判为 device lost |
| surface outdated / suboptimal | 保留 renderer/device，原地重配 surface；重配失败才升级为完整 surface 恢复 |
| surface lost / present error | 释放旧 context，重建 surface、device 和 renderer |
| 睡眠与唤醒 | 原生 `WM_POWERBROADCAST` 事件暂停 present；恢复后验证并重建 surface/device，随后请求全量重绘 |
| 显示器插拔 / DPI 变化 | 原生 move/resize/DPI/display 事件触发一次原子 snapshot；用 `GetDpiForWindow` 的同一时刻尺寸与 DPI 重配 surface，再刷新离屏 RenderTexture resolution |
| 运行时显卡切换 | `F6` 或 `debug:pixi -- switch` 完整重建 surface/device，generation 隔离迟到 callback |
| 最小化 / 恢复 | 原生 lifecycle 事件最小化时完全停帧；恢复后读取原子 snapshot、同步尺寸/DPI 和计时器再继续 present |
| 正常关闭 | 拦截 `will-close`，先停调度/输入/调试服务并排空 queue，再依次销毁 bundle、renderer、纹理、device、context；纹理销毁会同步淘汰全局批处理 BindGroup，主进程可继续服务其他窗口 |

自动恢复限制为 30 秒内最多 5 次；超过后进入 `failed`，防止坏驱动或错误资源造成恢复风暴。`status` 中的 `deviceGeneration`、`surfaceGeneration`、事件环、render target 像素尺寸与 native `submitCount/presentCount/lastStatus` 可直接用于定位恢复是否真实完成。

开发实例退出前不要同时再启动一个 `electrobun dev`，Windows 会锁住 `build/dev-win-x64` 中的运行文件。

## 当前已经打通

| Pixi 能力 | 状态 | 原生实现 |
| --- | --- | --- |
| Container、Graphics、Sprite、Transform、Ticker | 可用 | Pixi CPU scene graph + WebGPU |
| WebGPU shader、uniform、geometry、RenderTexture | 可用 | 补齐格式映射、动态 offset、indirect draw 和 texture copy |
| blend modes | 可用 | adapter blend 常量映射 |
| BlurFilter 等 WebGPU filters | 可用 | 示例启动时检查 filter pipe |
| stencil / color / alpha mask | 可用 | SDK stencil 补丁 + texture copy |
| BufferImageSource | 可用 | 原生 `queue.writeTexture` |
| PNG/JPEG/WebP/AVIF/SVG texture | 可用 | Skia 解码成 RGBA8；SVG 在这里是栅格纹理 |
| `Text`、CJK、系统字体、描边和换行 | 可用 | Pixi CanvasText 走 Skia Canvas2D，不依赖浏览器 |
| pointer、wheel、keyboard、focus、capture/cancel | 可用 | Rust 在 WGPU HWND 所属 UI 线程挂接 Win32 消息，再通过有界队列投递给 Bun/Pixi |
| Windows 触屏和多点触控 | 可用 | `WM_POINTER`/`PT_TOUCH` 映射为 Pixi touch pointer；保留逐触点 ID、主触点、接触面积、压力、取消和隐式捕获 |
| 微软拼音 composition/commit/candidate | 可用 | 原生 IME 会话、UTF-16 commit 与物理 caret 定位 |
| Save As、文件拖入/拖出 | 可用 | Win32 Save dialog + `WM_DROPFILES` + OLE `CF_HDROP` |
| `renderer.extract.pixels/canvas/base64/image/download/log` | 可用 | GPU readback + Skia；这些方法在本项目中是异步的，`log` 输出尺寸信息 |
| 多屏与混合 DPI | 可用 | 按窗口交叠面积选择显示器，动态重设 Pixi resolution 和 surface 尺寸 |

启动时会执行 GPU buffer→texture→texture→buffer 像素校验并检查 Pixi 必需 pipes；Demo 的 `standard-render-check` 会进一步验证 filter/mask/RenderTexture 的 GPU readback 指纹。不能正常工作的适配不会只显示黑屏，而会抛出明确错误。

## Skia 图片和文字

普通 Pixi `Text` 不需要改业务代码：

```ts
const text = new Text({
  text: "English · 中文 · 日本語 · 한국어 · 🙂",
  style: {
    fontFamily: [
      "Inter",
      "Segoe UI Variable",
      "Segoe UI Variable Text",
      "Segoe UI",
      "Microsoft YaHei UI",
      "Microsoft YaHei",
      "Yu Gothic UI",
      "Yu Gothic",
      "Malgun Gothic",
      "Segoe UI Emoji",
      "sans-serif",
    ],
    fontSize: 28,
  },
});
```

字体列表按字形依次 fallback。不要直接照搬浏览器的 `system-ui`、`ui-sans-serif` 等 CSS 别名：Skia Canvas 不保证按 Chromium 的规则解析它们。应用应明确自己的字体顺序；Runtime 和输入控件不替业务选择中文字体。系统字体只有在目标 Windows 已安装时才可用，字体族名称也可能随 Windows 版本和语言包不同。

系统中没有的字体可以通过稳定公共入口注册；注册应在创建任何 `Text` 或输入控件之前完成：

```ts
import { registerNativeFont, registerNativeFontData } from "./native-host";

registerNativeFont("C:/absolute/path/to/AppInter.ttf", "App Inter");
registerNativeFontData(await Bun.file("C:/absolute/path/to/AppCJK.ttf").bytes(), "App CJK");
```

建议给 bundled font 使用应用专属别名，避免与机器上不同版本的同名字体冲突。字体必须具有随应用再发行的许可；微软雅黑等 Windows 系统字体不能直接打进应用。只打包拉丁字体只能保证拉丁字形一致，如需跨设备完全一致的 CJK 字形，还要提供有相应字形覆盖的可再发行字体。

图片继续走 Pixi Assets：

```ts
const texture = await Assets.load("file:///C:/absolute/image.png");
const sprite = new Sprite(texture);
```

随应用分发的资源可在 `electrobun.config.ts` 的 `build.copy` 中复制进 `bun/assets`（最终位于 `Resources/app/bun/assets`），再从 `import.meta.url` 构造绝对 `file:` URL。data URL 和 HTTP(S) URL 也由同一个 Skia loader 处理。

原生导出没有浏览器下载弹窗；`download` 的含义是直接写入本机文件：

```ts
const pixels = await renderer.extract.pixels(stage);
const png = await renderer.extract.base64({ target: stage, format: "png" });
await renderer.extract.download({ target: stage, filename: "capture.png" });
```

## 原生宿主能力

- `src/native-host.ts` 是业务侧唯一公共入口：应用生命周期、平台 I/O、异步 jobs 和 ABI/capability 信息从这里导出；输入、IME、帧调度及 GPU/surface 恢复由应用对象管理。
- `getWindowSnapshot()` 单次返回同一时刻的物理 client/frame 尺寸、`GetDpiForWindow` DPI、scale、HMONITOR、最小化/最大化/焦点；另提供 client/screen 双向坐标转换。
- 正式模式使用 FIFO + dirty frame；BunnyMark 使用 Mailbox + continuous frame。窗口最小化会停帧。
- 纯 root batch（包括多 batch）会编译为有序 render bundles，并在原生层一次 acquire、一次 submit、一次 present；filter/mask/RenderTexture 等复杂 pass 自动回退标准 `renderer.render()`。
- HWND ring 是启用后的唯一 pointer/keyboard/lifecycle 权威源；Windows 输入包含 capture/cancel、窗口外 move/up、pointerId、client/screen 坐标、完整 buttons、横纵滚轮、修饰键、物理 `code`、逻辑 `key`、repeat、focus/blur 和系统 cursor。
- `PT_TOUCH` 直接映射为 Pixi `FederatedPointerEvent`：每个触点独立维护 `pointerId`、`isPrimary`、`width/height`、`pressure` 和捕获路径；client 坐标、movement 与接触面积按窗口 DPI 转为逻辑像素。Pixi 继续公开 `pointerupoutside` 表示捕获后在命中区域外结束。
- Starter 不识别 pinch、swipe、翻页或惯性，也没有浏览器 `touch-action`；业务通过这些 pointer 字段自行实现手势。
- 对应用公开的 Pixi `FederatedWheelEvent` 固定为 `deltaMode = 0`：一个 Win32 `WHEEL_DELTA` 映射为 100 个逻辑像素，纵向符号与浏览器一致；小于一格的触控板/高精度滚轮增量按比例保留，delta 不随窗口 DPI 缩放。
- `onHostEvent` 仅用于底层诊断，保留 Win32 原始 wheel delta，不是 DOM/Pixi 兼容事件；业务手势必须监听 Pixi `wheel`。
- 100px 标定与 Chromium 在 Windows 默认“三行/格”设置下的换算一致；Starter 将它固定为手势强度，不把系统滚动行数伪装成 DOM `line` 单位。需要传统文本滚动的控件仍应按最终 `deltaMode` 处理。[Chromium Windows wheel builder](https://chromium.googlesource.com/chromium/src/+/e22d04949d069f7184b3233d1b83e26fe79e1bcc/ui/events/blink/web_input_event_builders_win.cc)
- input/text/file ring 由 Win32 empty→nonempty 回调主动唤醒 Bun，不再使用 8ms Screen polling；诊断可查询 queued/dropped/coalesced/duplicates、当前 capture 和最后 cursor。
- Device lost、uncaptured error 与 surface timeout/outdated/lost/OOM 都有独立状态和恢复策略。
- IME bridge 提供 composition/commit、caret/candidate 定位与会话生命周期；剪贴板、打开/保存文件、拖入/拖出和异步文件读取/目录扫描已有稳定 API。
- Accessibility 已有验证过的语义树、A11Y v1 原生快照和 action 回派；真正的 Windows UIA COM provider 尚未启用，capability 会诚实返回 `false`。

## 仍然不可用或不应伪装

| 功能 | 原因 / 替代方案 |
| --- | --- |
| `HTMLText`、DOM/CSS layout | 本质依赖浏览器 DOM；用 `Text`、`BitmapText` 或自己布局 Pixi 对象 |
| Windows UIA/Narrator provider | 语义桥已完成，但尚未实现 COM provider；不会用空 DOM shim 假装 |
| `<video>`、摄像头、MediaStream | 依赖浏览器媒体栈；用原生解码器逐帧写入 `BufferImageSource` |
| DOM SVG/`parseAsGraphicsContext` 完整语义 | 普通 SVG 图片已由 Skia 栅格化；需要可编辑矢量时直接构造 `Graphics` |
| 压缩 GPU texture 与 WebGPU 3D texture | 当前 native feature/adapter 没有可靠暴露；保持禁用，避免产生“创建成功但渲染错误”的假能力 |
| 触控笔 pressure/tilt/twist/hover | 0.2.0 只消费 `PT_TOUCH`；笔输入继续交给系统默认路径，待有明确业务需求时再扩 ABI |
| 触控板 source/momentum/phase | 双指滚动已作为高精度 wheel 工作，但 Windows 当前链路不可靠区分设备来源和惯性阶段 |
| Windows 系统触摸键盘 | 自定义 Pixi 文本控件不会自动获得系统文本服务焦点；当前只提供 IMM 输入法会话 |
| macOS/Linux 原生宿主 | 当前原生输入、IME、surface 与 DLL 是 Windows 实现；待 Windows 路径稳定后再拆平台层 |

这里没有实现大而全的 DOM polyfill。Pixi 真正只缺一小块 Canvas2D 的地方交给 Skia，GPU 路径直接补 adapter/device 命令；浏览器独有能力则留在明确的平台边界之外。

## 文件职责

- `src/main.ts`：读取环境变量并启动 Demo；替换业务场景时不复制 Runtime。
- `src/native-host.ts`：应用业务使用的唯一稳定公共 API 出口。
- `src/runtime/`：应用生命周期、帧调度、GPU/surface 恢复、销毁和非公共测试控制面。
- `src/rendering/`：Electrobun WebGPU 适配、context/status、Pixi/Skia、Extract 和 render bundle 快路。
- `src/input/`：原生事件桥、文本编辑器、输入控件和 IME 会话。
- `src/platform/`：Rust DLL、FFI host、桌面文件服务、异步 jobs 和 accessibility 语义桥。
- `src/diagnostics/`：无 DevTools 场景下的本机 Agent Debug Bridge。
- `src/demo/`：只通过公开应用 API 组装 showcase、输入控件、BunnyMark 和调试命令。
- `tools/patch-electrobun.mjs`：固定版本、幂等的 Electrobun SDK stencil、Bun FFI 与 Pixi BindGroup 生命周期补丁。
- `tools/pixi-debug.mjs`：Agent Debug Bridge 的命令行客户端与生命周期 smoke test。
- `tools/starter-release.mjs`：完整 Starter payload、manifest、package、install、verify 和 detached smoke。
- `starter-consumer-smoke/smoke.mjs`：在 release 内校验全部文件/ABI，并安装、构建、启动真实独立应用。
