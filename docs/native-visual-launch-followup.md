# 原生动画、启动取消与全屏布局修正

## 已确认范围（2026-09-16）
用户授权推进三批：UAC 用户取消保持隐藏、不报错；搜索栏恢复原版间距；启动图标基准/阴影对齐原版，时长 560ms，末帧呈现后隐藏；整体开关动画对照；全屏灰边与冷启动 DPI 初始化排查。

## 基线与约束
- 保留本轮之前的原生键盘路由修复与未提交文件，不改用户的 native-code-dependency-audit.md。
- 原版代码参考兄弟目录 LaunchPad，只读。启动动画对照证据在 artifacts/launch-animation-comparison。
- 真正的 UAC 安全桌面由用户操作；远程 2K/150% 灰边最终需用户机器复验。
- 不将受控时间/消息测试表述为真实 UAC、远程帧率或 DPI 环境复现。

## 进度
已实现：
- ShellExecuteExW 保留 Win32 1223（用户取消），沿 Rust payload 和 TS LaunchResult 传递；取消静默保持隐藏，真实错误仍提示。
- 搜索栏与同行按钮使用原版根容器顶部留白：常规全屏 34px，窄屏 28px；网格、文件夹/设置 inset 沿统一布局入口更新，底部通知原位置无需变动。
- 启动图标以配置尺寸绘制（而非点击时 getBounds 的按压/紧凑尺寸），位图补同参数投影，图标和阴影缓存为同一组合后整体淡出，避免阴影透入图标；动画改为 560ms。
- 启动动画完成后才进入已有末帧呈现/隐藏流程，清理不再抢跑；重开使旧 completion 失效。额外 2 秒停滞兜底会记录警告并完成视觉，不改变共享弹簧引擎时间步上限。
- 全屏 DWM 边框显式关闭。回归发现原有 readAttribute(34/33) 能力探测错误：BORDER_COLOR、CORNER_PREFERENCE 只支持设置，Get 返回 E_INVALIDARG 导致旧设置始终跳过。现以受支持系统版本启用并检查 Set 返回码，退出宿主恢复系统默认。

## 已取得的证据
- `npm run check` 全量通过（当时包括 UAC 分类/流程/慢帧清理/图标尺寸单测）；后来受影响项已补验：domain suite、native scene suite、app/tools/native 类型检查、项目策略、diff 空白检查全部通过。
- Rust 21 项 launch 相关测试通过，1 项调用系统激活服务的既有测试按原标记忽略。
- 原生产品 smoke 一轮通过（PID45320），全屏超扫开/关的外框、client、GPU child、backing 完全一致，DPI96：1920×1080 / 1922×1082。截图已查看，未见灰边。
- 后续两轮全量 smoke（PID45224、14600）分别在既有 Alt 长按和鼠标拖拽断言失败，未确认触发原因，不能声称最新全量 smoke 通过；均在位图启动验证之前失败。未改写/跳过这些断言。
- 新增独立 `--launch-visual` 专项（明确不同验收标记，不冒充全量）：最终 PID33540 通过，覆盖真实 helper 启动、模拟取消（持续隐藏无弹窗）、模拟 accessDenied（恢复并报错）、实际位图阴影截图。33/35/34 个呈现采样，三次都在窗口仍可见时呈现 alpha=0、scale=1.92 末帧，然后隐藏；无完成超时警告。
- `desktop-probe.ts` 分别执行原版 LaunchPad 和 native 的真实 DesktopLayer 方法；相同时间步的 12 组中心/边缘/缩放/alpha 数据完全一致。中心位置不移动，尺寸仍随 1→1.08 放大；未更改整体缩放。
- 原生 GPU 50% 透明红色叠加灰底实测 RGB [183,93,118]，与标准 alpha 混合吻合；没有额外去饱和证据。此为隔离 GPU 测量，不代表远程 DWM 组合画面已复现。
- 证据：artifacts/launch-animation-comparison；全屏 geometry、截图和 alpha 测量：artifacts/native-smoke。

## 验收状态（2026-09-17）
用户回复“没问题，提交吧”，接受本轮结果并授权提交。开发版 PID15376 已用于验收；原版 Tauri PID42744 未改动。用户未提供逐项测试环境与次数，因此不将该反馈扩大为已完成远程 2K/150% 全部冷启动与 DPI 切换组合的验证；后续全量 smoke 的两项未明原因失败保留如上。

复验命令：`npx tsx scripts/runNativeElectrobun.ts --smoke --launch-visual`；全量为 `--smoke --settings-only`（跳过会冲突的全局快捷键测试，其余保留）。

本地入口：`build/dev-win-x64/Lumeria-dev/bin/launcher.exe`。另一台机器更新源码后，先退出使用 vendor DLL 的原生实例，执行 `npm run native:host:build`（上一任务的文本路由修复），再按正常 `npm run native:dev` / `npm run native:build` 构建。未打包或发布安装程序。

## 验收
1. 取消与真实启动失败分类测试，确保真实错误仍提示。
2. 560ms 图标动画与掉帧末帧呈现，尺寸/阴影实际界面检查。
3. 搜索栏/按钮/通知/网格对齐；原生与原版整体动画采样。
4. 全屏边框策略与 DPI 几何核验，记录远程复验缺口。
5. 相关类型/策略/原生测试和产品 smoke，清理临时探针，更新本文件。
