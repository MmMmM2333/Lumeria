# Native 内存占用取证

单次任务管理器数值不等于泄漏。先记录同一进程在重复操作后是否持续增长，再区分私有提交、工作集与 GPU 内存。保留仍可复现渲染故障的实例，勿为取得启动基线先重启它。

若主要问题是“从约 300 MB 增长到 1.3 GB，多出的内存分给谁”，优先获取高占用进程的 VMMap 原生 `.mmp` 快照，再在后续新启动的低占用阶段保存基线。对比相同内存列和类别；VMMap 提供 Heap / Private Data / Mapped File / Image 等分类，不能直接把所有内存映射到 Pixi、JSC 或驱动。归属仍不明确时，按增长类别增加原生分配调用栈或应用资源统计，不先要求大量重复 full dump。

## 无需诊断构建的采样

将 `scripts/Capture-LumeriaMemory.ps1` 复制到故障机，在 PowerShell 中运行（PID 用任务管理器“详细信息”页的 LumeriaRuntime.exe PID）：

```powershell
.\Capture-LumeriaMemory.ps1 -ProcessId 24880
```

默认每 5 秒采一次、持续 15 分钟，写入桌面新建的 `Lumeria-memory-时间-随机后缀` 文件夹。Ctrl+C 可提前停止，已写入的样本保留。脚本只读进程计数器，不抓全内存、不强制 GC、不裁剪工作集。它记录累计 CPU 秒数，不把它当 CPU 百分比；不包含 GPU 显存计数。私有工作集计数器不可用时明确记错，其余计数继续。

需要进一步区分WC/RW提交趋势时，可在64位PowerShell追加 `-ClassifyVirtualMemory`。它通过VirtualQueryEx约每5秒遍历地址空间，分类私有已提交区域（WRITECOMBINE、普通READWRITE、其他）和Mapped/Image，不读取区域内容。低于5秒的普通采样间隔不会提高该分类频率；它不是显存计数、工作集分类或调用栈归属，遍历期间分配变化可能产生偏差。Native压力测试默认启用此分类。

建议记录如下阶段及实际操作时间，写到同目录 `actions.txt`：

1. 停在固定页面，等待 2 分钟。
2. 打开/关闭同一个文件夹 20 次，回到同一页，等待 2 分钟。
3. 再重复同一组 20 次，回同一页等待 2 分钟。
4. 隐藏启动台 2 分钟，再打开到同一页等待 2 分钟。

保持窗口尺寸、缩放、图标和背景一致。记录期间不要抓 full dump、主动清理内存或更新驱动；full dump 读取内存可能改变页面驻留，干扰工作集对比。原本已抓过 dump 的进程仍可采样，只需记明采样是在 dump 之后。

## 需要提供的文件

- 整个采样目录：`metadata.json`、`samples.jsonl`、`actions.txt`。
- 对应时段 `%APPDATA%\com.lumeria.app\logs` 中的日志。
- 任务管理器“详细信息”中目标 PID 的内存列截图，保留列标题；有条件同时显示提交大小、专用 GPU 内存、共享 GPU 内存。
- 若数值仍持续上升：用微软 VMMap 选择同一 PID，在上述操作前后各保存一份原生 `.mmp` 快照。保留同一安装版本，记录 VMMap 操作时间；不要执行 Empty Working Set。

目前已有三份完整 dump，优先补趋势与内存分类，无需重复大批量抓 dump。需要从分配调用栈证明泄漏时，再针对增长类别安排下一轮带分配跟踪的运行。

VMMap 可分类展示已提交虚拟内存和工作集并保存快照：[微软 VMMap 文档](https://learn.microsoft.com/en-us/sysinternals/downloads/vmmap)。Private Bytes 趋势可用于用户态泄漏调查，但增长也可能来自缓存、池或分配器保留：[微软 PerfMon 排查说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/using-performance-monitor-to-find-a-user-mode-memory-leak)。
