# Native 产品诊断扩展

本模块把旧 Vue 调试面板中仍有产品价值的能力接到现有 `attachNativeDevtools`，
不复制旧面板 UI，也不新增 HTTP 服务或依赖。产品入口通过
`commandExtension`、`statusExtension` 和清理路径接入。

## 工厂签名

```ts
const diagnostics = createNativeProductDiagnostics({
  motion: motionRuntime,             // 可选；默认使用现有全局 motionRuntime
  background: { getState, preview, restore },
  layout: { getState, preview, restore },
  liveDesktop: { getState },         // LiveDesktop 状态 getter
  now: () => new Date(),             // 可选；仅用于错误时间戳
});

attachNativeDevtools(app, {
  // ...
  statusExtension: diagnostics.status,
  commandExtension: diagnostics.command,
});

// 产品销毁路径
await diagnostics.dispose();
```

`background` 和 `layout` 端口是显式能力边界：

- `getState()` 返回当前只读状态。
- `preview(patch)` 只应用临时预览，不能写持久布局或设置文档。
- `restore()` 撤销临时预览；`dispose()` 只对曾经 preview 的端口调用 restore。
- 布局端口不得调用现有的 `updateDesktopLayoutDebugParams` 等持久化入口。

## 命令

命令统一使用 DevTools 的 `{ action, ...params }`。未知 action、未知字段、
错误类型和越界值都会抛出可观察的 `DiagnosticError`；失败同时记录在
`status().lastError`。

| 命令 | 参数白名单 | 行为 |
|---|---|---|
| `motion-config` | `enabled`、`recordHistory`、`overlayEnabled`、`timeScale`、`recordWindowMs`、`sampleHz`、`maxEvents`、`maxSamples` | 只配置现有全局 `motionRuntime`。空参数返回当前配置。 |
| `motion-report` | `includeChannels`、`includeCurveStats`、`includeHistory`、`includeTargets`、`maxAnimations`、`maxCurveStats`、`maxEvents`、`maxSamples`、`maxTargets`、`maxWarnings` | 返回当前快照、生命周期时间线/曲线统计和 targets；所有数组有界。 |
| `motion-clear` | 无 | 只清空 Motion 历史。 |
| `motion-trace` | `seconds` 或 `durationMs`、`sampleHz`、`maxFrames`、`maxEvents`、`maxTracks`、`maxTargets`、`maxWarnings`、`maxValuesPerFrame`、`maxCurveStats` | 复用 `createMotionReplayTraceFromRuntime` 生成 `pixi-motion-replay-trace/v1`，可被 MotionLab 导入，再按上限截断。 |
| `background-state` | 无 | 读取注入端口状态。 |
| `background-preview` | `source`、`effect`、`blurStrength`、`darkenStrength`、`darkenColor`、`liveDesktopOpacity` | 仅通过临时端口预览背景调参。 |
| `background-restore` | 无 | 撤销背景临时预览。 |
| `layout-state` | 无 | 读取注入端口状态。 |
| `layout-preview` | `enabled`、`dragHitZonesEnabled`、`gridPaddingTopPx`、`hostHeightOffsetPx`、`hostMaxHeightPx`、`mainPaddingYPx` | 仅通过临时端口预览布局调参，范围与旧面板模型一致。 |
| `layout-restore` | 无 | 撤销布局临时预览。 |

`motion-config`、report 和 trace 都不接受 `recordFilter` 或其他对象直传。
trace 不接受自定义 profile、函数或任意代码；参数只允许上面的标量和布尔字段。

## 五个旧 Debug Tab 映射

| 旧面板 Tab | Native 替代入口 | 保留方式 |
|---|---|---|
| Acrylic/背景 | `background-state`、`background-preview`、`background-restore`；`status().background` | 主代理注入临时背景端口；不复制滑块 UI。 |
| Layout | `layout-state`、`layout-preview`、`layout-restore`；`status().layout` | 只允许临时预览；不写持久布局。 |
| Render | 现有 DevTools `resources`、`capture`、`tree`、`inspect`、`hit-test`、`pause/resume/step`、`wait` | 不新增 render 命令，沿用现有原生诊断协议。 |
| Motion | `motion-config`、`motion-report`、`motion-clear`、`motion-trace`；现有 DevTools `pause/resume/step` | 报告复用 runtime；trace 交由 MotionLab 读取；时间线/曲线不是旧 DOM 面板 UI。 |
| Live Desktop | 现有 DevTools `status`，读取 `status().liveDesktop` | 主代理接入 getter；不通过诊断模块写 Live Desktop 配置。 |

旧面板当前另有 Notice 临时调试区；它不在上述五个核心产品诊断入口内，不迁入 Native
产品路径。

## 真实限制

- 默认 `motionRuntime` 使用生产 no-op adapter；本模块创建时只为自己安装 dev adapter，
  最后一个实例释放时恢复生产 no-op。若在模块外另有自定义 adapter，runtime 没有
  “读取并恢复前一 factory”的 API，因此无法保证恢复那个自定义 factory。
- `motion-trace` 是有界采样快照，不是连续录像。未先启用 `recordHistory` 时 trace 可为空，
  不会静默修改配置。`sampleHz`、帧数、事件数、track、target、warning 和每帧值都有上限。
- 旧 WebView DOM/CSS、旧 Vue 面板布局、浏览器元素检查、事件监听细节和 CSS 计算值不在
  Native 场景中，无法等价迁移；这些内容只保留在归档历史。
- 背景和布局状态是主代理端口提供的产品状态，不是对当前 GPU 输出的像素证明。端口缺失时
  对应命令明确返回 capability-unavailable。
- 模块不增加 HTTP 服务、网络请求、任意 JS 执行、持久布局写入或产品构建依赖。

### 当前产品接线与验收（阶段六）

Native 已接入此工厂，DevTools status 的 `product` 字段提供状态；生产宏关闭时整个模块不进入产物。motion 观察在场景创建前启用以保留 target 元数据，历史录制仍需显式打开。`motion-report`/`motion-trace` 已通过真实 Native 运行生成数据。设置中的旧 WebView console 按钮替换为“打开日志文件夹”；开发调试沿用 devtools:cli/devtools:mcp。

实际 Native 布局读取使用 viewport 数值和 scene geometry；旧 CSS 高度/内边距预览参数不适用，layout-preview 会明确拒绝，使用 tree/inspect/hit-test 检查真实几何。背景预览操作作用于临时 GPU/LiveDesktop 配置，不保存用户设置；失败仍登记为需恢复，退出会恢复。LiveDesktop 默认关闭，状态明确包含 enabled/loaded。上表列的是扩展协议可注入的端口能力，不代表所有旧 CSS 控件已在 Native 实现。
