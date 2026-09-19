# 托盘唤起后连续输入故障

## 目标与范围
修复托盘打开后搜索仅接受首字母的问题；验证英文连续输入、焦点切换和输入法链路。不改变搜索语义，不使用按键补写规避原生文本输入。

## 已确认
- 用户实际复现 `word` 仅显示 `w`，开发实例记录完整 W/O/R/D 按下与松开，期间无失焦。证据：`artifacts/input-diagnosis/reproduced.json`。
- 首字母由 nativeMain 手动提交，后续字符依赖原生文本事件。
- native-app 同时 attachInput(root, route) 与 attachInput(surface, route)，文本会话仅绑定 root。
- native-frame 的 WM_CHAR/IME 使用接收窗口自身的 text_active；同 route 的另一窗口不会复用文本会话。

## 根因与修复
- `GetGUIThreadInfo` 采样确认同一个主窗口下，焦点在 BasicWindowClass（1314530）与 ElectrobunWGPUView（1904508）之间变化，文本会话却只绑定前者。证据：`artifacts/input-diagnosis/focus.jsonl`。
- 新增真实 Win32 父子窗口回归，旧实现的子窗口 WM_CHAR 全部丢失，内部 WM_KILLFOCUS 错误结束会话，两项断言均失败。
- native-frame 在相同根窗口、相同 route 下将子窗口字符、IME 和 composing 修饰状态交给活动的根文本会话；不同 route 不共享。
- 内部焦点转移保留会话；从子窗口离开应用则结束根会话。IME 定位和取消使用实际焦点窗口，候选框坐标从会话所属窗口转换到接收窗口。
- 无延时补丁、无后续按键手动补字，首字母搜索语义保持原样。

## 验证
- Rust 原生 9 项测试通过（新增 5 项）：英文/中文/emoji、根与子窗口字符只提交一次、内部与外部失焦、IME composition 与结果去重、候选框坐标、不同 route 隔离。
- 原生编辑器与文本会话 3 项 Bun 测试通过（48 assertions）。
- 新 DLL 加载到独立数据实例的产品 smoke 通过，日志 `artifacts/input-diagnosis/product-smoke.log`；该轮使用 settings-only，避免全局快捷键影响用户原实例，不声称覆盖真实 IME 操作。
- native/tools 类型检查、项目策略检查、Pixi 补丁检查、diff 空白检查通过。
- 初次 Rust 全量运行因 cwd 不是 Starter 根目录导致既有文件读取用例失败；改到正确 cwd 后全量通过。沙箱阻止产品数据子进程，获工具升级执行后 smoke 通过。
- 已通过应用会话接口保存并退出旧 PID 21152，重建 vendor DLL、更新 manifest 和开发运行时 DLL，启动新 PID 40724。待用户实际输入确认。

## 构建与复验
关闭使用本项目 DLL 的运行实例后执行 `npm run native:host:build`，重新构建宿主并同步 manifest 的源码、测试与 DLL hashes；随后照常执行原生应用构建。

原生测试：在项目根目录执行 `rustc --test vendor/electrobun-pixi-native-starter/src/platform/native-frame.rs -o artifacts/input-diagnosis/native-frame-tests.exe`，再以 `vendor/electrobun-pixi-native-starter` 为工作目录执行 `../../artifacts/input-diagnosis/native-frame-tests.exe --test-threads=1`。

## 验收与下一步
用户已回复“ok”，确认修复版实际验证通过。未获得具体重复次数，不将其表述为统计稳定性验证。任务完成。
