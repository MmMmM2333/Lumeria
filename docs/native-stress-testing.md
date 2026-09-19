# Native 压力测试

测试使用独立数据目录，不读取或修改日常布局。默认 800 个图标、每页 80 个，每个图标使用独立 PNG。先运行短测确认环境，再做长测。

## 运行

```powershell
# 短测：2/20/80/200 项批量选择各一次，不等待自然 GC 窗口
npm run native:stress -- --stress-cycles=4 --stress-idle-every=0

# 操作组：100 轮，每10轮可见与隐藏各停留90秒
npm run native:stress

# 设备恢复组：保留相同页面，独立观察恢复导致的变化
npm run native:stress -- --stress-mode=recovery --stress-cycles=100

# 混合组：文件夹操作、翻页中注入设备丢失
npm run native:stress -- --stress-mode=mixed --stress-icons=2000 --stress-cycles=100 --stress-seed=20260919

# 单独验证30秒内第6次自动恢复触发限流失败（预期行为算通过）
npm run native:stress -- --stress-mode=recovery-limit

# 背景专项：三种效果的设备恢复、显式卸载与GPU GC像素回归
npm run native:stress -- --stress-mode=background-recovery --stress-icons=200 --stress-windowed

# Native CopySrc专项：窗口/全屏切换、设备恢复、工具条模糊及MSAA回归
npm run native:stress -- --stress-mode=surface-copy --stress-icons=200 --stress-windowed

# 可比较的内存检查点：每轮重新遍历全部图标，再回首页测量
npm run native:stress -- --stress-mode=recovery --stress-cycles=20 --stress-rewarm-checkpoints --stress-idle-every=20
npm run native:stress -- --stress-mode=operations --stress-cycles=20 --stress-rewarm-checkpoints --stress-idle-every=20

# 独立GC取证：每轮完整GC，基线/结束堆快照（有明显时间/内存开销）
npm run native:stress -- --stress-cycles=5 --stress-rewarm-checkpoints --stress-idle-every=0 --stress-gc-every=1 --stress-heap-snapshots

# 同序列关闭动画遥测适配器，排除诊断工具保留（不是release构建）
npm run native:stress -- --stress-cycles=5 --stress-rewarm-checkpoints --stress-idle-every=0 --stress-gc-every=1 --stress-motion-diagnostics-off

# 完整操作预热4轮，再测20轮自然回收（不强制GC）
npm run native:stress -- --stress-warmup-cycles=4 --stress-cycles=20 --stress-rewarm-checkpoints --stress-idle-every=20

# 分别缩小触发序列；这些模式不隐式混入其他操作
npm run native:stress -- --stress-mode=selection --stress-cycles=4 --stress-idle-every=0
npm run native:stress -- --stress-mode=folders --stress-cycles=4 --stress-idle-every=0
npm run native:stress -- --stress-mode=paging --stress-cycles=4 --stress-idle-every=0

# 因果隔离，仅selection模式允许；日常默认行为不变
npm run native:stress -- --stress-mode=selection --stress-isolation=no-prewarm --stress-cycles=1 --stress-idle-every=0 --stress-settle-ms=6000
npm run native:stress -- --stress-mode=selection --stress-isolation=no-backdrop --stress-cycles=1 --stress-idle-every=0 --stress-settle-ms=6000
```

默认全屏，加 `--stress-windowed` 可改为窗口。一次只运行一个测试，期间不要手动操作测试窗口；可以同时录屏。

## 测试内容

- 先遍历全部页面预热，回首页记录基线。
- `operations` 循环选择 2/20/80/200 项，创建、打开、翻页和解散文件夹，再来回翻桌面。选择通过产品控制器执行，打开文件夹则注入指针事件并检查命中，并非全程物理鼠标操作。
- 每 4 轮尝试在创建动画中隐藏窗口。产品可以按交互保护忽略请求，测试不会绕过保护。
- `recovery` 用 Dawn `wgpuDeviceForceLoss` 注入设备丢失，等待设备代次、恢复计数增加并实际呈现新画面。相邻注入至少间隔 8 秒；它不模拟 OS TDR 或驱动崩溃。
- `mixed` 在文件夹翻页过程中注入设备丢失，再继续操作。
- 每轮回到首页，检查图标数量、重复 ID、文件夹覆盖层与命中。默认不强制 GC，也不裁剪工作集。
- 呈现时检查 Pixi 默认批次的有效顶点、UV、索引和绘制范围。只检查实际使用的数据；其他批次类型在结果中列明。

## 结果与停止

运行后，结果会生成到 `artifacts/native-stress/<时间-PID>/`。启动时打印具体位置，请保留整个目录：

| 文件 | 用途 |
|---|---|
| `config.json`、`initial-layout.json` | 参数、随机种子、原始测试布局 |
| `runtime.json` | 实际应用 PID、运行时版本、GPU 与窗口信息 |
| `actions.jsonl` | 操作顺序、延迟、实际时刻、恢复及前1000条 console warning |
| `metrics.jsonl` | 每秒进程 RSS、JSC 堆、节点、场景纹理及图标驻留估算；轮末检查点 |
| `Lumeria-memory-*/samples.jsonl` | Windows 私有提交、工作集、私有工作集、线程/句柄等 |
| `data/logs/native-runtime.log` | 产品与设备恢复日志 |
| `last-frames.json` | 最后180个实际呈现帧的阶段、代次、运动与批次摘要 |
| `baseline.png`、`checkpoint-*.png`、`final.png` | 系统窗口区域截图，不调用 Pixi extract 重绘 |
| `failure.json`、`failure.png` | 首次失败或手动停止的现场 |
| `result.json`、`summary.md`、`summary.json` | 结果及内存对照；summary 在应用退出后生成 |

截图使用 Python/Pillow 捕获系统画面，窗口遮挡会影响结果。工具不可用时记录 `screenshot-unavailable`，其他检查继续；Windows 计数器读取失败也会明确记错。

发现异常时，在输出目录创建空文件 `stop.request`。测试会在下个等待检查点停止操作、保存现场并保留进程，便于继续用 VMMap 或分配跟踪调查。关闭应用后生成汇总。**Ctrl+C 会终止测试进程树，不能用来保留现场。**

无人值守测试可加 `--stress-exit-on-failure`，失败保存后退出；成功时自动退出。日志、图标和测试数据留在磁盘，空间占用随测试时长增加。

## 参数

| 参数 | 默认 | 范围/说明 |
|---|---:|---|
| `--stress-mode` | operations | operations / selection / surface-copy / folders / paging / recovery / mixed / recovery-limit / background-recovery |
| `--stress-icons` | 800 | 200–5000 |
| `--stress-cycles` | 100 | 1–100000；recovery-limit 固定验证一次限流 |
| `--stress-seed` | 20260919 | 1–4294967295 |
| `--stress-settle-ms` | 2000 | 每轮运动停止后等待0–60000ms |
| `--stress-idle-every` | 10 | 0禁用；每N轮执行可见/隐藏空闲 |
| `--stress-idle-ms` | 90000 | 每次空闲0–600000ms |
| `--stress-screenshots-every` | 10 | 0禁用周期截图；基线、结束、故障仍尝试截图 |
| `--stress-rewarm-checkpoints` | 关闭 | 每轮检查点和隐藏重开后统一全页遍历，再等待settle时间采样 |
| `--stress-gc-every` | 0 | 0禁用；每N轮及基线/结束执行JSC gcAndSweep，写gc.jsonl |
| `--stress-heap-snapshots` | 关闭 | 必须配合gc-every；保存baseline/final.heapsnapshot（Bun V8格式） |
| `--stress-motion-diagnostics-off` | 关闭 | 将动画遥测替换为noop，其他dev诊断仍保留 |
| `--stress-warmup-cycles` | 0 | 0–100；先运行N轮相同操作，完成后记录baseline，再执行cycles轮测量 |
| `--stress-isolation` | none | 仅selection：none / no-prewarm / no-backdrop / neither |

相同 seed 会生成相同操作参数和延迟选择，但 OS/GPU 调度仍可能不同；实际时刻记录在日志中。

### 缩小问题范围

| 模式 | 操作 |
| --- | --- |
| `selection` | 进入批量管理，选择 2/20/80/200 项，再取消；记录空选择和有选择状态 |
| `folders` | 只创建和解散文件夹，不打开文件夹、不隐藏窗口 |
| `paging` | 只快速翻页 |

`--stress-warmup-cycles` 在正式计量前运行相同操作。轮次继续累计，例如预热 4 轮后，第一测量轮是 cycle 5。完成预热不保证所有节点池已到容量上限，要结合 retention 计数判断。

selection 支持三种隔离实验：`no-prewarm` 暂停拖动节点池预热；`no-backdrop` 暂停工具栏背景取样及其整场景中间表面，保留按钮和选择行为；`neither` 同时暂停两者。成功结束后恢复默认，失败时保留现场。这些仅用于隔离测试，不是产品设置。

## 看结果时注意什么

**先看回到同一场景后的趋势。** 比较 operations、recovery 的 `settled` 和 `after-idle-reopen`，再看 mixed。峰值增加不等于泄漏；重点是内存是否随轮数或设备代次持续增长。

**比较前让资源状态尽量一致。** 两组都加 `--stress-rewarm-checkpoints`，每轮及隐藏重开后重新遍历全部图标。汇总优先使用 `after-idle-rewarm`，同时保留冷重开的值。仍需核对节点数和图标驻留量，不能只看操作序列相同。

**采样时间有误差。** 普通 Windows 计数每秒一次，匹配容差 3 秒；VirtualQueryEx 分类约每 5 秒一次，容差 6.5 秒。只匹配检查点之前的样本，避免下一操作污染基线，实际误差保存在 `summary.json`。早期报告曾采用前后最近样本，跨报告比较时要区分。

**内存指标不能相加。** VirtualQueryEx 分类的是已提交区域，包括私有 WC、RW 和其他，以及 Mapped/Image；遍历不是原子快照，不读取内存内容，也不提供分配栈。WC 不是显存，纹理估算不包含所有渲染器、Dawn 和驱动资源。selection 的纹理池检查依赖 Pixi 8.20.1 私有字段，升级后需要复核。

**GC 组单独解释。** `gc.jsonl` 是完整回收后的堆和对象统计，`metrics.jsonl` 标记回收前后；summary 的 `settled` 仍是 GC 前检查点。堆快照和截图会产生额外分配，不能拿这组峰值代替自然运行结果。Bun 快照未必展示 Map 的全部内部引用，离线 retained-size 计算可能不完整。

retention 分别统计 `desktop`、`detachedPages`、`searchCache`、`groupDragPool`、`folderIcons`；普通场景树计数不包含已脱离舞台的缓存节点。

**断言通过不等于画面一定正确。** 数值合法但位置错误的巨大三角形可能通过几何检查，截图也没有自动视觉判定。首次异常时用 `stop.request` 停止，避免后续操作覆盖现场。
