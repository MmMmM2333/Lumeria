# 批量创建文件夹性能定位

## 优化完成与验收（2026-09-19 后续授权）

用户随后授权完整优化，以下结果取代下文“仅诊断/未修改”的阶段状态；下文保留原始基线。

- Native 按通知类型区分结构更新与交互更新：group-transfer、池预热，以及没有活动文件夹 handoff 的视觉所有权通知走交互更新。待处理位在提交前清除，提交中产生的新通知保留到下一帧。真实布局和文件夹生命周期仍走结构路径。
- 所有权集合未变化的图标不再反复 setState；一个交互提交中汇总当前最终所有权，目标文件夹只在缩略图抑制集合变化时刷新。仍扫描轻量所有权状态，没有引入第二套成员索引。
- 动画诊断关闭时跳过无消费者的元数据构造；开启时缓存平坦且稳定的描述，名称/来源/overlay 改变会刷新，嵌套可变数据不缓存。reset、配置变化及 adapter 更换清缓存；target 使用 WeakMap，overlay 使用 WeakRef，生命周期测试通过。
- 结构计划仍可全量计算，但未变化的不可变 app 视觉状态复用，避免执行昂贵的图标重设；可变 Web 输入与文件夹/ghost 状态保持原处理。名称/图标变化有回归验证。
- Native 结构提交直接遍历节点，去掉逐项线性查找。文字密度只在 DPI 变化时全树同步，新增 app、文件夹预览与拖拽层分别同步。

| 总应用 / 选中数 | 首次呈现：之前 → 之后 | P95 帧间隔：之前 → 之后 | 之后完整结构更新 | 之后图标 setState |
| --- | ---: | ---: | ---: | ---: |
| 300 / 48 | 119.6 → 43.0 ms | 43.6 → 6.8 ms | 2 | 25 |
| 600 / 48 | 228.7 → 58.8 ms | 108.4 → 10.9 ms | 2 | 25 |
| 300 / 2 | 124.2 → 50.1 ms | 48.6 → 10.0 ms | 2 | 56 |
| 300 / 跨页 72 | 无同场景基线 → 55.4 ms | 5.6 ms | 2 | 50 |

同机隔离自动输入、重复图标素材；优化前带细分探针，优化后为轻量基准，因此时间比较包含探针差异，更新次数下降另有回归测试支持。不是所有真实图标/设备的帧率保证。300 最终样本 208 帧中 2 帧超过 16.67ms，最大约 40.9ms；600 最大约 54.9ms。首次呈现与必要结构边界仍有一次性长帧，未声称每帧都达到 60FPS；不扩大为新的布局索引架构，之后若首帧延迟仍影响体验，下一优化目标是剩余计划构建/快照成本。

验证：完整 `npm test` 通过；最终调整补跑场景和共享布局/动画套件通过；Native/工具类型检查、项目 build、policy、i18n、诊断生命周期通过。完整 Native smoke 通过，1476 帧/10 次拖拽重入、取消、文件夹创建/重开/隐藏恢复、IME 与保存回归。基准断言最终成员完整、无重复成员、无可见遗留 actor、缩略图显示权已返还，最终 300 场景还验证实际预览子节点数量并检查截图。全量 app 类型检查的既有两文件问题未纳入本任务。

证据：`artifacts/folder-create-optimized/{300-verified,600-final,300-select2,300-cross72}/proof.json`；对应 `folder-complete.png`（早期图像包含离屏场景边界，300-verified 为窗口范围）。`artifacts/folder-create-native-smoke.log`、`folder-create-tests.log`、`folder-create-{scene,layout}-final.log`、`folder-create-build.log`。正式诊断基准保留在 nativeInteractionBench 与 rendering/native/nativeCreationBenchmark；没有临时探针留在产品路径，没有提交或发布。

基准复现：使用隔离数据启动 `node --import tsx scripts/runNativeElectrobun.ts --dev --isolated`，设置 `LAUNCHPAD_INTERACTION_BENCH` 为输出目录、`LAUNCHPAD_INTERACTION_BENCH_APPS=300` 或 `600`。可设置 `LAUNCHPAD_INTERACTION_BENCH_SELECTED=2`；跨页用 `LAUNCHPAD_INTERACTION_BENCH_CROSS_PAGE=1` 与 `SELECTED=72`。工具链环境同 native:dev。

2026-09-19。用户反馈从批量管理选择应用创建文件夹时动画不稳定。本轮仅诊断；产品源码保持本轮开始时状态，临时性能探针已移出源码，基准文件恢复并核对 SHA-256 一致。

## 结论

主要瓶颈是 Native 把局部视觉交接通知升级为全桌面结构更新。创建期间多次重建布局、重设全部保留页面的图标状态，导致轻帧之间出现长 CPU 阻塞。上轮普通拖拽优化处理的是 groupDragState 的位置变化；这条显式 invalidateStructure 路径仍会绕过交互更新入口。

第二个显著成本是 IconNode.setState 无条件调用 describeMotionTargets：每个图标描述约 14 个动画目标；motionRuntime.describeTarget 在判断是否发送诊断事件之前就生成、清洗并复制元数据。即使没有开启事件记录，也先付出这部分工作。

## 实测

同机 Native dev 隔离窗口，固定 8×6 网格，复用同一个图标纹理。使用现有 interaction benchmark：进入/退出/重新进入批量管理、完成拖拽取消，再选择当前页应用创建文件夹。记录 scene.commit、结构失效调用、图标状态、动画步进、renderer.render 的 CPU 时间和 presented 事件。单次探索性样本，不能作为不同机器/显卡性能保证；重复纹理减少 GPU 材质切换，不代表真实图标集全部成本。

| 总应用 / 选中数 | 首次呈现 | 创建期间帧间隔 P95 | 完整结构更新 | 图标 setState 调用 |
| --- | ---: | ---: | ---: | ---: |
| 300 / 48 | 119.6 ms | 43.6 ms | 19 | 4851 |
| 600 / 48 | 228.7 ms | 108.4 ms | 16 | 8888 |
| 300 / 2 | 124.2 ms | 48.6 ms | 9 | 2711 |
| 300 / 48，临时停用重复目标描述 | 88.1 ms | 26.3 ms | 19 | 4851 |

结构更新次数受动画时间推进及同帧通知合并影响，不能单独用次数比较快慢。300/48 的轻帧很多：中位帧间隔 3.0 ms，但 110 次呈现中 18 次超过 16.67 ms；这解释了平均帧率较高而动画仍有明显顿挫。

300/48 各次 scene.commit 约 29–49 ms，累计 680 ms；其中图标 setState 累计 460 ms。600/48 单次约 67–96 ms，累计 1268 ms；setState 917 ms，其中 describeMotionTargets 604 ms（约占 setState 的 66%）。方法耗时存在嵌套，不能把所有桶相加。

对照临时停用目标描述后，300/48 的布局更新次数仍为 19 次，scene.commit 累计降至 410 ms，帧间隔 P95 降至 26.3 ms，仍未消除长帧。这证明诊断开销是放大因素，完整重建范围过大是优先修复点。

创建命令本身同步耗时约 7–11 ms；300/48 的动画步进累计约 15 ms，group.update 累计约 21 ms，renderer.render CPU 单次最高约 6.5 ms。已证实 CPU 结构更新为主要长帧来源；没有采集 GPU timestamp，因此不声称完全排除 GPU 成本。

## 已确认调用链

1. `src/rendering/pixi/scene/DesktopLayer.ts:1154` 订阅 VisualOwnershipRegistry，发送 `visual-ownership-committed`。
2. `src/rendering/pixi/scene/GroupDragLayer.ts:945` 的 actor handoff 和 `finishFolderShellActor` 也发送交接通知。
3. `src/native/product/nativeProduct.ts:505` 对这些通知调用 `scene.invalidateStructure()`，随后请求场景更新。
4. `src/rendering/native/NativeDesktopScene.ts:398` 的快捷路径因 structureInvalidated 被跳过，执行 structure lane。
5. `src/rendering/pixi/scene/DesktopLayer.ts:1384` 调用 updateScene，明确禁止 plan reuse；对所有保留页面重建计划并调用 IconNode.setState。
6. `src/rendering/pixi/nodes/IconNode.ts:556` 无条件描述动画目标；`src/rendering/pixi/animation/motionRuntime.ts:953` 在发送事件前整理元数据。

300/48 捕获到 97 次 visual-ownership-committed、10 次 actor-handoff、1 次 shell-handoff 和 1 次 inactive 通知，它们经调度合并成 19 次结构更新。多次更新只有 groupDragState 的 settledActorKeys 变化，甚至结构输入完全不变。创建后的每次结构更新仍协调约 254 个图标。

另有次级开销：NativeDesktopScene 在每次结构更新中逐项 findIconNodeByItemId（内部线性扫描），再遍历整个场景同步文字分辨率。600 场景中前者约 27 ms 累计，低于重复图标状态设置，不应作为首要优化目标。

## 建议修复顺序与验收

1. 细分视觉交接与结构失效。普通交接通过已有 interaction/ownership 更新，确实影响目标文件夹缩略图的通知更新相关节点。真实布局变化仍走结构更新；不能简单丢弃通知，否则可能出现重复图标、残影或交接完成后图标消失。
2. 缓存稳定的动画目标描述，或在不需要诊断元数据时避免构建。保留诊断启用后的目标定位能力，不能把调试入口变成假成功。
3. 之后再根据测量处理重复查找、全树文字分辨率同步；预热图标池的通知也应避免强制刷新全桌面。

验收应观察创建开始到最后一个图标交接的 P95/max 帧间隔、结构更新次数及实际更新节点数，覆盖 2/多选/跨页选择、取消、隐藏恢复和最终缩略图。常态交接更新量应取决于受影响图标，而非桌面应用总数。此次未做正式优化，也未以 A/B 探针结果声称修复完成。

## 原始证据

- `artifacts/folder-create-profile/summary.json`
- `artifacts/folder-create-profile/{300,600,300-select2,300-no-metadata}/folder-profile.json`
- 各目录 `proof.json` 与同名 `.log`
- `artifacts/folder-create-profile/folderProfileProbe.ts`、`bench-instrumented.ts`：归档探针
- `artifacts/folder-create-profile/bench-original.ts`：本轮开始时基准源码，恢复后 SHA-256 为 `BE5C758715F52EAFF7FFA307397ACF76DD9F826789E6331BB1ECF354758A3B1A`
