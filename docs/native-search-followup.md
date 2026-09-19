# 原生搜索性能、清理与设置背景栏（2026-09-17）

## 目标
修复反复 w/Backspace 的切换卡顿、搜索启动应用后输入残留，并对齐设置打开时原版搜索栏的可见性。

## 调查
- 原版 computed 缓存 searchDocuments；native changeSearch 每次收集全布局应用并重建含拼音的索引，包括空查询。
- native 根据 activePages 调用 retainLayout；搜索范围缩小会将布局中未命中的图标移出 ownership，存在销毁/重新解码上传的风险。
- launchFlow.clearSearch 直接调用 changeSearch("")，没有同步 TextInput.value。
- native 显隐条件包含 settingsShell，原版 homeChromeAnimate 不因设置打开而隐藏；设置仍须阻止底层输入。

## 进度与验证
已完成修正：
- 按布局引用缓存搜索索引，空查询不建索引；改名/增删/扫描等布局提交使索引失效。
- 原生图标 ownership 保留完整布局及当前投影；搜索不再注销未命中项，128MiB GPU 预算不变。
- 原生 DesktopLayer 可复用桌面/搜索之间的普通 app 节点。缓存脱离场景、停掉动画且不能接收输入；上限为当前/上一帧已实例化页节点量，布局变化及销毁时清理。Web 路径保持默认不启用。
- 清搜索统一经 NativeSearchBar.setQuery，同时清输入框和结果状态。
- 设置打开时保留背景搜索栏/按钮，输入仍禁用且失焦；关闭设置恢复原搜索内容与交互。

相同基准（180 个 256px 图标＋扫描样本，16 次 w/Backspace、共32次编辑，先预热纹理）：
|指标|修改前|最终专项|
|---|---:|---:|
|同步输入中位数|21.38ms|10.78ms|
|同步输入 P95|30.89ms|15.26ms|
|至下一帧中位数|49.91ms|16.56ms|
|至下一帧 P95|64.66ms|24.37ms|
|新纹理 source|2|0|

中间探针显示重复创建56个 IconNode 是主要剩余成本，索引复用后单次匹配约0.1ms、节点创建约5–9ms。所有阶段计时探针已移除。另一轮节点复用测量为10.42/14.45ms（输入P50/P95）、16.32/27.07ms（呈现），方向一致。

测量通过实际 native 编辑器、场景和 GPU 呈现，但 w 以 text commit 注入、Backspace 以 native key 注入；不冒充物理键盘端到端或远程机性能。原版仅核对缓存及显隐实现，未声称同机实测性能相等。

专项通过：真实 helper 启动→隐藏→重开后的状态/文字为空；设置背景栏可见但不可交互，关闭后保留原查询；改名后同查询更新；热切换不创建新纹理。设置截图已查看。
节点测试通过：12次双向切换身份复用、脱离场景、旧缓存清理，以及8组不同查询的容量上限/释放。
全套 npm tests 通过；后续补充的缓存容量/交互状态清理用例通过；app/tools/native 类型检查、策略、i18n、Vite build、diff 空白检查均通过。新增原生 smoke 归属 tsconfig.electrobun，Web 编译排除，沿用项目现有原生测试配置边界。
原生完整 smoke（settings-only，PID30224）通过，含搜索/IME/拖拽/保存、文件夹中断与改名、应用启动、resize/恢复；全局 Alt+Space 测试按 settings-only 参数跳过，其余保留。
排查时一轮计时探针局部变量遗漏导致验证失败，已移除全部临时探针；共享层原型测试对未初始化私有字段的兼容问题已修正并全套通过，不遗留假成功或跳过断言。

证据：`artifacts/search-followup/{baseline,after-initial,after-reuse,final}.json` 与对应日志；`artifacts/native-smoke/search-settings-header.png`。
复验：`npx tsx scripts/runNativeElectrobun.ts --smoke --search`（隔离数据、独立验收标记）。

## 交付
已重建开发版并打开供用户实际输入验收；用户随后于2026-09-17授权提交。未提供物理键盘或另一台机器的量化结果，不扩大性能验证结论。缓存用额外一份有限的已实例化 app 节点换取切换速度，不预建整个目录，布局修改与宿主退出释放。

## 约束
保留用户未跟踪的 native-code-dependency-audit.md；本轮仅按明确授权提交相关文件。不用 debounce 掩盖重复构建或资源抖动；缓存随布局变化失效，保留 GPU 预算。
