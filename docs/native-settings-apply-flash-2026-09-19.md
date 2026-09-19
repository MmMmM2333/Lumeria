# 设置“应用”期间导航文字闪烁

2026-09-19，基于 `5a3788c` 及当前工作区已有修改。

用户描述“设置点击应用时侧边导航文字会闪”。本次已复现底部“应用”按钮的明确颜色闪烁；未将它泛化为左侧“应用”分类切换问题。

原因：`NativeSettingsShell.#apply()` 开始保存时，底部按钮用 `busy` 锁定，其余外壳按钮用 `disabled=true`。导航文字由 `NativeFluentButton` 改成禁用色，完成保存后重绘回正常色。快速保存表现为闪一下。不是本次证据所显示的 GPU 丢字。

修复：设置外壳所有按钮保存期间统一用已有 `busy` 状态。面板仍禁止指针交互，`handleKey` 仍阻止键盘修改，按钮的 `activate()` 仍拒绝 busy 状态，因此没有放开重复保存或导航。保存中由尺寸/设置刷新导致的重绘也使用 busy，避免中途再次变灰。保留保存完成后的现有内容重绘，以更新已应用配置。

真实 Native 隔离试验：展开导航，使用可控制完成时间的保存 Promise，捕获点击前、保存中、保存后画面。浅色主题一个导航标题从 `#242424` 变到 `#bdbdbd`，271 个标题像素改变；修复后颜色保持 `#242424`，变化像素为 0。前后截图已查看。

证据：`artifacts/settings-apply-flash/before.json`、`after.json`，`pending-before.png`、`pending-after.png`，`before.log`、`after.log`。首次 after 运行未提供 dev 截图目录而失败，补齐目录后的重跑通过；这是测试启动参数错误。

回归：`src/native/scene.test.ts` 覆盖 dark 主题保存中颜色、直接导航调用受阻、保存中重绘后保持锁定、失败重试；新增 `nativeSettingsApplyVisualSmoke.ts` 接入 Native 设置 smoke，验证真实指针点击、重复应用和导航受阻及标题像素不变。场景测试、app/tools/native 全量类型检查、policy/i18n、build 已通过。完整 Native smoke exit 0（`artifacts/settings-apply-flash/native-smoke.log`），包含导航像素 0 变化、快速重复应用、保存失败保留窗口/重试、195 帧拖拽及文件夹/隐藏恢复流程。

临时独立诊断入口已移除，nativeProduct 与本轮原始备份逐字一致。之前的全屏 DPI 修复、SDK/CopySrc/stress 等工作区改动保持；本轮没有提交或推送。
