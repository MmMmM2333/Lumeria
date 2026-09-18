# Native dev 压力测试

先运行短测确认环境，再运行长测。入口只在 dev 诊断构建启用，自动生成隔离数据目录，不读取或改写日常布局。每个图标使用独立 PNG；默认 800 图标、每页 80 个。

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

# 可比较的内存检查点：每轮重新遍历全部图标，再回首页测量
npm run native:stress -- --stress-mode=recovery --stress-cycles=20 --stress-rewarm-checkpoints --stress-idle-every=20
npm run native:stress -- --stress-mode=operations --stress-cycles=20 --stress-rewarm-checkpoints --stress-idle-every=20

# 独立GC取证：每轮完整GC，基线/结束堆快照（有明显时间/内存开销）
npm run native:stress -- --stress-cycles=5 --stress-rewarm-checkpoints --stress-idle-every=0 --stress-gc-every=1 --stress-heap-snapshots

# 同序列关闭动画遥测适配器，排除诊断工具保留（不是release构建）
npm run native:stress -- --stress-cycles=5 --stress-rewarm-checkpoints --stress-idle-every=0 --stress-gc-every=1 --stress-motion-diagnostics-off
```

默认全屏。需要窗口运行加 `--stress-windowed`。同一时间只运行一个测试，避免窗口互相遮挡和系统负载干扰。运行过程中不要手动操作测试窗口；系统录屏可以同时进行。

## 执行行为

- 先遍历全部页面预热，再返回首页取基线。
- 操作组循环选择 2/20/80/200 个图标，通过产品选择与创建命令创建文件夹，注入指针事件实际打开文件夹，翻页、显隐中断、解散，再快速来回翻桌面。
- 跨页批量选择通过产品选择控制器注入，不声称是逐个物理鼠标点击。点击文件夹会验证实际 Pixi 命中结果。
- 每4轮尝试在创建动画中隐藏；产品可能按现有保护忽略请求，这是合法结果。日志记录请求时是否拖动及重开前 alpha/可见性，不强行绕开保护。
- 设备组使用 Dawn `wgpuDeviceForceLoss`，随后等待 device generation 与 recoveryCount 增加，且新代次真正呈现画面。相邻注入至少间隔8秒，不关闭恢复限流。这不是 OS TDR 或硬件驱动崩溃模拟。
- 混合组在文件夹翻页切回时注入设备丢失，然后继续交互。
- 每轮返回无文件夹的首页，检查图标 ID 数量守恒、无重复、覆盖层隐藏、首页图标可命中；记录活动末尾与空闲后计数。默认不强制 JS GC 或裁剪工作集。
- 实际呈现帧检查 Pixi 默认批次的有效顶点/UV是否有限、索引及 draw 范围是否合法；不读取未使用的缓冲容量，也不把打包颜色当浮点数。其他 batcher 类型在结果中明确列出。

## 产物与停止

运行开始会打印 `artifacts/native-stress/<时间-PID>/`。保留整个目录：

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

截图使用已有 Python/Pillow 系统截图工具；若不可用，记录 `screenshot-unavailable`，其他测试继续。窗口被遮挡会影响系统截图。Windows 计数器失败也会保留错误，不伪造为0。

发现画面异常时，在该目录创建空文件 `stop.request`。测试最迟在下一个等待检查点停止发操作，保存现场，默认保留应用进程。随后可取 VMMap 或分配跟踪。关闭应用后启动器生成汇总并报告 stopped/failed。Ctrl+C 会终止测试进程树，不用于保留现场。

无人值守短测可加 `--stress-exit-on-failure`，失败后保存证据并退出。成功运行自动退出。测试数据、图标和日志保留，磁盘使用随运行时长增加；节点与帧日志不在内存无限积累。

## 参数

| 参数 | 默认 | 范围/说明 |
|---|---:|---|
| `--stress-mode` | operations | operations / recovery / mixed / recovery-limit / background-recovery |
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

相同 seed 重放相同的延迟选择与操作参数，不能保证 OS/GPU 调度时序一致；操作日志记录实际时刻。长测耗时受图标数与硬件影响，100轮不是固定时长。

## 如何判断问题

先比较 operations 与 recovery 两组每轮 `settled` 和 `after-idle-reopen` 的趋势，再看 mixed。`summary.md` 将预热基线与最后检查点对比，Windows 样本匹配误差超过3秒则标为不可用。峰值上涨不等于泄漏；需要关注返回相同场景后是否随轮数或设备代次持续增长。

做内存归属对照时两组都加 `--stress-rewarm-checkpoints`。否则恢复后的图标可能仅部分驻留，启动基线与最后检查点不能直接比较。开启后额外产生 `after-idle-rewarm`，汇总优先使用它作为末尾检查点；`after-idle-reopen`仍保留用于观察冷重开状态。每轮表格同时列出节点数和图标驻留估算，实际资源计数仍须核对，不把统一操作序列等同于强制相同缓存状态。

Windows采样器每5秒通过只读 `VirtualQueryEx` 分类已提交区域，记录MEM_PRIVATE的WRITECOMBINE、普通READWRITE及其他，以及Mapped/Image。它不读取内存内容，不提供分配栈、显存或工作集分类。一次遍历不是原子快照，变化中的进程可能有少量偏差。分类计数与检查点匹配容差6.5秒，在summary.json保留实际误差；普通Windows进程计数仍为每秒一次、匹配容差3秒。分类查询失败会记录错误，不当作零。

各层内存有重叠，不能相加。图标驻留只是估算，不含 renderer 池、Dawn、驱动及全部显存；场景可达纹理也不代表所有活跃 GPU 资源。此前 WC 提交增长应进一步用 WPR VirtualAlloc 分配/释放调用栈归属，而不是只抓 JS heap。

GC组单独解释：`gc.jsonl`包含每次完整回收后的heapStats、objectTypeCounts及节点保留统计；`metrics.jsonl`标记before-gc/after-gc。原summary.md中的settled仍是GC前检查点，不能当回收后数据。截图/快照序列化会产生额外分配，不用GC组的峰值替代自然组。堆快照只留本地，可用DevTools读取；Bun生成的Map内部槽位不一定展开全部引用边，不能盲信离线retained-size计算。

节点统计的retention单独列出desktop、detachedPages、searchCache、groupDragPool、folderIcons；场景树count不包含已经脱离舞台但仍在缓存中的节点。

几何合法不代表画面正确，有限但错误的巨大三角形可能通过检查。保留录屏与截图，首次异常用 `stop.request` 停止，不让后续翻页覆盖现场。截图未经自动视觉判定，因此 passed 只代表所列断言通过，不表示已排除所有图形问题。

## 2026-09-19 本机短程验收

- 800 图标 operations 4轮：2/20/80/200项的创建、打开、解散及显隐/翻页断言通过。
- 800 图标 mixed 4轮：4次设备恢复、可见/隐藏各90秒后重开，几何及交互断言通过。
- 2000 图标 recovery 2轮：device generation 1→3，场景节点5476→5476，恢复与显隐检查通过。
- recovery-limit：前5次恢复成功，第6次触发预期 `recovery-limit`；诊断器能保存 failed 状态。
- stop.request：结果为 stopped，停止动作后进程仍存活；验收完成后已清理该测试进程。
- 配置/随机序列/库存、几何损坏、汇总时间匹配测试，以及 Native/tools 类型和项目策略检查通过。

观察到但本轮未修复：设备恢复有 Pixi `bufferResource` 仍被 shader 绑定时销毁的警告；混合组系统截图中初始红色自定义背景在结束时变为接近黑色底色。自动断言未覆盖此背景像素变化，不能据 passed 称视觉恢复完整。800图标混合组最后空闲重开检查点的私有提交较预热基线增加约282MiB、JSC堆约87MiB；仅4轮不构成泄漏证明。原始证据在对应 `artifacts/native-stress` 目录；尚未完成100轮长测或复现故障机的巨大三角形。

后续背景专项已定位并修复上述变黑：离屏背景未参与设备恢复重绘及旧批次失效。背景现在在呈现前恢复原图、重绘派生纹理，同设备卸载/GC后重建派生目标；设置预览也使用当前 renderer 的帧准备入口。专项先保存系统截图，再读回背景 RenderTexture 进行像素比较，不借 extract 重绘背景本身。此专项含读回与额外预览，因此内存数据不能直接和普通压力组比较。Pixi 警告已增加调用栈与设备代次，当前栈指向旧 renderer 的 GpuUniformBatchPipe.destroy，尚未证明它造成原三角形。
