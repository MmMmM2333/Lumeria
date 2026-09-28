# 启动与恢复

启动准备只执行一次。普通隐藏和显示不会重新进入启动等待流程。

## 当前策略

原生窗口从创建时隐藏，加载失败后的重试或取消通知必须可见。主动启动在当前页准备好后显示，不增加固定等待；`NATIVE_STARTUP_PREPARE_MS` 为 0。

登录后台启动在首个可用场景后准备桌面图标与文字，准备结束仍保持隐藏。用户提前唤出时取消启动等待，优先当前页，其余工作继续分批处理。

图标准备只覆盖桌面清单及有限文件夹缩略图，详见[图标资源](icon-resources.md)。文字每批最多 8 个标签或 2 ms，批间通过 `setImmediate` 让出事件循环；单次栅格化不可中断。文字预热使用缓存引用，不把离屏节点临时挂到可见场景中。

后台恢复复用未变化的布局与选择快照；仅视觉开关变化不应重建网格。设备恢复后重新取得 renderer 和资源，不能复用旧设备纹理。

同一次系统唤醒的自动/用户通知合并，恢复任务完成前禁止重入。新输入对象从原生焦点快照初始化，产品绑定完成后再处理输入队列。`recovered` 表示资源已重建，`recovery-presented` 表示新设备已成功呈现首帧；`frame-error` 保存原始堆栈、阶段与设备代次。30 秒最多 5 次自动恢复的保护保持不变。

Pixi 8.20.1 的 `CanvasTextPipe` 接管新 renderer 数据时必须标记文字待更新；否则被保留的离屏文字可能沿用旧的更新标记，将未创建的纹理交给批处理。依赖补丁由 `check:pixi-patch` 验证，回归在 `nativeTextRecovery.test.ts`。

## 启动测量

`startup-phase` 记录会话、数据进程创建、GPU、目录、背景及首屏阶段。`node --import tsx scripts/benchmarkNativeStartup.ts <dev runtime目录> <标签> [布局文件]` 使用隔离布局副本，采集三次主动和一次后台启动，并通过 Python WinEvent 观察器验证原生窗口在首屏前不显示、后台启动不显示；产物写入 `artifacts/startup-*`。该测试不触发真实系统休眠或注册开机自启。

基准脚本可追加次数参数，例如 `[布局文件] 11`，采集一次无目录缓存、十次缓存启动及一次后台启动。`launchToSceneMs` 为首屏准备日志，`launchToReadyMs` 为显示/激活和输入准备完成；后台入口对应隐藏预热完成，不等同真实系统登录。

## 为什么不固定等待

固定等待会推迟窗口显示，已有对照没有显示足够的首次远跳收益，因此主动启动的额外等待预算为 0。后台准备可以减少后续加载，但用户立即访问冷内容时仍可能需要等待。

实现与回归：[启动准备](../src/native/nativeStartupPreparation.ts)、[状态测试](../src/native/nativeStartupPreparation.test.ts)、[文字预热](../src/rendering/native/nativeTextPrewarm.ts)。
