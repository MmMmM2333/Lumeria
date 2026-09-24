# Native 应用导入与预览

首次引导、手动扫描和新增应用使用统一的导入规划。布局契约直接增加 `settings.importState`，不迁移旧格式；应先使用独立数据测试。

## 启动测试

先准备项目依赖和 Native 工具链，然后运行：

```powershell
npm run native:import-preview
```

`native:import-preview` 和 `native:import-real` 都会先通过 `native:deps:build` 构建数据服务、Live Desktop 和触发角组件，再构建当前应用。预览使用独立临时数据和示例应用组、工具合集、示例播放器等 `.url` 样本，地址为 `example.invalid`。退出后清理临时数据。窗口默认 1100×760，仅影响预览模式。

真实来源测试：

```powershell
npm run native:import-real
```

该命令通过正常项目构建入口构建当前代码，扫描真实默认来源；布局保存在 `artifacts/native-import-real-data`，退出后保留，不覆盖正式 APPDATA 布局。重置时先退出，再备份或移走该目录中的 `layout.json`。

也可以复用自行准备的运行时，明确指定路径：

```powershell
npx tsx scripts/runNativeElectrobun.ts --dev --import-real --runtime=C:/path/to/runtime
```

运行时需包含 `bin/launcher.exe` 及与当前源码、数据契约一致的资源。仓库不提供 `artifacts` 下的预生成运行时；本机曾用于绕过 Hutch 投影错误的副本不是干净检出的依赖。

首次引导中的快捷键、窗口模式和开机自启动连接真实平台接口，并非模拟开关。应用发现发生在启动扫描或主动扫描时，没有目录实时监听。

## 交互规则

- 引导为欢迎、偏好、来源三步，默认浅色，主题可选浅色/深色/系统；图标随明暗主题变化。
- 面板为 800×640 逻辑尺寸并受窗口大小限制，内容滚动、导航固定，无跳过或关闭入口。来源确认后直接分组导入，不再逐组预览；提交期间显示旋转圈。
- 首次独立应用在前、文件夹在后；各类别内按数字、英文、中文拼音、其他符号排序，名称数字自然排序。
- 手动扫描先选择应用，再预览末尾/建议两种放置方式。新发现优先，已移除与暂不添加默认不选。
- 自动新增先追加，桌面胶囊打开共用放置预览。确认后清除对应待处理状态，原布局不自动重排。
- 文件夹来源绑定不依赖显示名称；移出、解散记录用户意图。隐藏、暂不添加、永久排除分别保存。
- 预览顶部固定汇总；成员列表可展开且最多显示四行，超出内部滚动，边界向外层传递滚轮。勾选和单选原位更新，不重建图标。
- 来源旁的说明提供首次导入、后续新增、规则变化的图文演示；演示操作不写真实配置。
- 过期方案需重新确认；保存重试不重复导入；后续布局变化使旧快照撤销失效。

## 定向验证

```powershell
npm run test:native-import
npx tsx scripts/runNativeElectrobun.ts --dev --import-check
```

`--import-check` 只运行导入专项：引导、固定高度、加载动画、初始分组、保存、两种预览、图标节点稳定性、说明页及滚动。它不运行完整 Native smoke。截图输出到 `artifacts/native-smoke`。

本轮已执行类型、文案、导入逻辑和 Native 定向检查；全量回归按用户要求延后。快捷键占用、系统设置失败、跨 DPI、长文本及大数据量等场景仍需在最终验收阶段覆盖。
