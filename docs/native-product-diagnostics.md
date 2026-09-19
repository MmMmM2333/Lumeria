# 产品诊断命令

这些命令通过 [Native DevTools](native-devtools.md) 查看动画、背景和布局。当前产品状态位于 DevTools status 的 `product` 字段；生产构建默认不包含此模块。

## 接入方式

```ts
const diagnostics = createNativeProductDiagnostics({
  motion: motionRuntime,             // 可选，默认使用全局动画运行时
  background: { getState, preview, restore },
  layout: { getState, preview, restore },
  liveDesktop: { getState },
  now: () => new Date(),             // 可选，用于错误时间戳
});

attachNativeDevtools(app, {
  statusExtension: diagnostics.status,
  commandExtension: diagnostics.command,
});

// 产品销毁时撤销预览并清理诊断
await diagnostics.dispose();
```

`getState()` 读取状态，`preview(patch)` 临时修改，`restore()` 撤销预览。预览不保存用户布局或设置；销毁时只恢复实际预览过的端口。预览失败也会登记为需要恢复。

## 命令与参数

命令格式为 `{ action, ...params }`。未知命令或字段、类型错误及越界值返回 `DiagnosticError`，并记录到 `status().lastError`。

| 命令 | 支持的参数 | 行为 |
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


这些命令只接受表中的参数。`recordFilter`、自定义 profile、函数和任意代码不受支持。

## 使用限制

- 要取得动画历史，先启用 `recordHistory`。`motion-trace` 导出有数量上限的采样快照，可交给 Motion Lab 读取；它不是连续录像。
- 当前 Native 布局来自 viewport 和场景几何。表中旧 CSS 高度、内边距参数由扩展协议定义，当前产品的 `layout-preview` 会拒绝它们；请用 `tree`、`inspect`、`hit-test` 检查布局。
- 背景预览作用于临时 GPU/Live Desktop 配置。状态表示应用配置，实际画面仍需截图确认；缺少所需端口时返回 `capability-unavailable`。
- Live Desktop 默认关闭，状态中包含 `enabled` 和 `loaded`；这些命令不写其持久配置。
- 模块启用动画诊断适配器，最后一个实例销毁后恢复生产 no-op。运行时无法取得先前的自定义适配器，因此不能保证恢复外部另行安装的适配器。

通用渲染检查使用 DevTools 现有的资源、截图、节点和逐帧操作。Native 不提供旧 WebView 的 DOM/CSS 检查；运行日志可从设置中的“打开日志文件夹”查看。

诊断工具会增加采样和对象跟踪开销。分析内存时应对照启用与关闭诊断的运行，避免把工具产生的保留归因于产品。
