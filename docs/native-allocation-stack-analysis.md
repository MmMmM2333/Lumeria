# Native 原生分配调用栈与静止驻留内存

日期：2026-09-12。承接 [静止内存分析](native-idle-memory-analysis.md)。本轮实际采集了 ETW VirtualAllocation 调用栈，并与隔离进程的私有驻留页地址相交；不再仅靠模块 DLL 大小或初始化前后的差值推断。

## 结果

完整桌面约 249 MiB 私有工作集中，约 133 MiB 的驻留页来自 Bun/JavaScriptCore 的原生分配路径；约 70 MiB 来自图形内核、NVIDIA/Intel 用户态驱动及 Dawn 的直接分配。Bun 部分包含程序解析、字节码、JIT 编译、运行时结构及分配器保留空间，不能等同于 JS 存活对象。

即使清空所有应用，完整程序仍加载和编译了不少代码。空桌面比原生空窗口多约 62 MiB，其中约 53 MiB 增量落在 Bun 分配路径。

## 分项驻留页

单位 MiB。取相应实例最后一个静止采样点，按实际驻留页的提交调用链归属，各项不重复计算。

| 分配来源 | 原生空窗口 | 完整应用、空桌面 | 完整实际桌面 |
|---|---:|---:|---:|
| Bun / JSC / 运行时分配器 | 31.11 | 83.88 | 132.80 |
| 图形内核创建的 CPU 地址空间 backing | 46.18 | 46.23 | 46.24 |
| NVIDIA 用户态驱动 | 10.41 | 10.23 | 10.62 |
| Intel 用户态驱动 | 11.99 | 11.20 | 11.60 |
| Skia / canvas | 2.86 | 6.09 | 9.51 |
| Dawn 直接分配 | 1.23 | 2.71 | 3.69 |
| 输入法与 IME 集成 | 11.01 | 13.19 | 13.41 |
| EXE / DLL 写时复制私有页 | 6.12 | 6.42 | 6.17 |
| 其他 Windows、线程、桥接与未归属页 | 13.65 | 17.22 | 16.12 |
| **页扫描合计** | **134.56** | **197.18** | **250.16** |
| **同次进程计数器的私有工作集** | **133.22** | **195.61** | **248.59** |

页扫描与进程计数器相差约 1.3–1.6 MiB；这两个接口的记账及非原子读取并未完全对齐。本表不通过归一化隐藏差异，也不宣称字节级精确的任务管理器占比。分配栈匹配时刻在采样区间起止间移动，三个实例的归属变化分别仅 0.168 / 0.148 / 0.020 MiB。

Dawn 发起、最终由显卡驱动或图形内核提交的内存，已经记在下游分配来源，不再计入“Dawn 直接分配”。因此不能用 1–4 MiB 推断整个 Dawn 渲染栈的总成本。这些是 CPU 地址空间中的私有驻留页，不是把独立显存加入进程内存。

## 图形底座的具体调用链

最大的固定项已能追到原生函数。代表性路径：

```text
Dawn / native-frame
  → D3D12Core!CDevice::CreateCommandQueue
  → D3D12Core!CCommandQueue<14>::FinalConstruct
  → nvwgf2umx.dll
  → D3D12Core!NDXGI::CDevice::AllocateCB_0022
  → dxgkrnl!DXGDEVICE::CreateVidMmAllocations
  → dxgmms2!VIDMM_GLOBAL::CommitLocalBackingStore
  → dxgmms2!VIDMM_RECYCLE_HEAP_MGR::Allocate
  → NtAllocateVirtualMemory
```

仅这一组队列创建相关栈，在完整桌面中对应约 12.03 MiB 驻留页。另有多组约 4 MiB 的设备/队列 backing 分配。原生空窗口就已出现这些成本，不能归因为“每个 Pixi 节点都分配了一个 heap”。

Intel 分配也有明确路径：

```text
native-frame / Dawn
  → D3D12CreateDevice
  → D3D12Core!CCreateDeviceCache::ResolveUMDAndVersion
  → D3D12Core!CCreateDeviceCache::LoadUMD
  → D3D12Core!NDXGI::CUMDAdapter::OpenAdapter
  → igd12umd64.dll
  → NtAllocateVirtualMemoryEx
```

当前渲染选择的是 RTX 3060，但初始化期间仍触发了 Intel 驱动加载/设备探测分配。约 12 MiB 是此机器上的实测，不代表所有电脑都会有相同额外成本，也尚未证明能直接省去全部这部分。

NVIDIA、Intel、Skia 和部分 Electrobun DLL 没有匹配的私有 PDB，因此其内部函数仍有缺失；Windows 系统函数已解析。模块归属仍可确定。

## Bun 的 133 MiB 进一步拆分

下面按 Bun 原生提交栈的用途分组。分类根据最近的分配路径以及解析/编译调用链，**是这些路径提交、至采样时仍驻留的页**，可能包含 allocator 内空闲和同页复用；不是对应数据结构当前活跃对象大小。

| Bun 内部分配路径 | 原生空窗口 | 空桌面 | 完整桌面 |
|---|---:|---:|---:|
| JSC 解析 / 字节码相关 | 2.74 | 26.49 | 30.59 |
| JIT 编译器 / 编译元数据 | 0.67 | 6.05 | 25.63 |
| JIT 可执行代码页 | 0.43 | 1.76 | 5.64 |
| JSC 对象堆 / GC | 3.37 | 12.54 | 23.35 |
| 源码加载 / 转译 / 文件缓冲 | 1.00 | 7.33 | 19.25 |
| Bun parser / AST | 6.54 | 9.31 | 3.89 |
| VM / 线程栈提交 | 8.07 | 8.13 | 8.22 |
| 数组 / buffer backing | 0.06 | 0.16 | 1.36 |
| 字符串 / interned names | 0.05 | 0.55 | 0.96 |
| 其他 Bun 运行时原生分配 | 8.17 | 11.56 | 13.89 |

代表性证据：

- JIT 编译约 5.73 MiB 的一组驻留页：`JSC::DFG::ConstantFoldingPhase::foldConstants → JSC::DFG::InPlaceAbstractState::beginBasicBlock → JSC::DFG::FlowMap::resize → mimalloc → _mi_os_commit_ex`。
- JIT 机器码：`JSC::JIT::compileAndLinkWithoutFinalizing → JSC::LinkBuffer::linkCode → JSC::ExecutableAllocator::allocate → JSC::FixedVMPoolExecutableAllocator::Allocator::notifyNeedPage`。
- 源码文本：约 5.29 MiB 的一组页来自 `Bun__transpileFile → bun_runtime::jsc_hooks::transpile_source_code_inner → bun_core::string::String::clone_latin1 → mimalloc`。
- 字节码：`JSC::BytecodeGenerator::emitDirectPutById → JSC::OpPutById::emitWithSmallestSizeRequirement → WTF::Vector::growImpl → mimalloc`。
- 源码/文件读取：`bun_runtime::node::fs::NodeFS::read_file_with_options` 和 Bundler 的 `read_file_with_allocator` 路径。
- VM/线程：同时看到主运行线程和 WebWorker 的 `JSC::VM::tryCreate → JSC::VM::updateStackLimits`；还有 `WebWorker__create → std::sys::thread::windows::Thread::new`。

完整桌面与空桌面的 Bun 差额约 49 MiB，其中 JIT 编译/元数据与可执行代码页合计增加约 23.5 MiB，对象堆路径增加约 10.8 MiB。上轮 JS heapStats 只见约 49 MiB 存活统计，不能据此把其余所有内存统称为 Dawn；本轮调用栈已证明其中不少仍在 Bun/JSC 内部。

## 输入法的额外成本

搜狗输入法在窗口焦点/输入上下文激活时进入进程，代表性链为：

```text
窗口创建 / 焦点激活
  → imm32!ImmSetActiveContext
  → msctf!CtfImeAssociateFocus
  → msctf!CThreadInputMgr::ActivateInputProfile
  → SogouTSF.ime / SogouPY.ime
  → 原生 heap 或 CreateDIBSection
```

对应约 11–13 MiB 私有驻留页，另有部分输入法 DLL 的写时复制页归在表中的统一 COW 行。这是当前机器的集成成本，不属于 Pixi 场景节点。

## 测量与符号验证

- WPR 自定义 VirtualAllocation 文件模式，128×256 KiB 缓冲。记录 ProcessThread、Loader、VirtualAllocation、MemoryInfo、MemoryInfoWS 及分配栈。
- 使用临时管理员辅助进程启动命名会话；设有 240 秒自动结束保护，实际采样结束后主动停止并保存。没有配置 IFEO heap tracing、没有修改长期跟踪设置。
- ETL 时间 2026-09-12 07:02:21.3742631–07:03:35.2745846 UTC，**0 丢失事件、0 丢失缓冲**。采集进程为隔离空窗口 PID 46172、空桌面 PID 41440、完整桌面 PID 27420。
- 完整布局为 195 个应用、36 个文件夹，900×600、resolution=1。空窗口及应用用同一 Electrobun/Bun/Dawn 运行包。原开发实例 PID 40484 未重启、未注入、未执行诊断 GC。
- `VirtualQueryEx + QueryWorkingSetEx` 记录私有驻留页地址；与 WPA 的提交/释放生命周期区间相交，同地址重叠时采用最近仍有效的提交。COW 私有页另计，未匹配页保留在剩余项中。
- WPA 导出大小到 MiB 的三位小数，本轮按 4 KiB 粒度恢复区间大小；半个末位小数小于半页，因此对页粒度大小不会产生歧义。
- WPA 共导出目标进程 24,591 个提交生命周期区间。另用 Windows `OpenTrace/ProcessTrace` 读取原始分配/StackWalk 事件，按 QPC、PID、线程、地址（包括区间拆分）匹配：24,591 个区间全部匹配，24,572 个取得原始栈。本表 Bun 驻留页对应的提交栈全部取得 Bun 函数。
- Bun 为 1.4.2。官方 profile 发行包 SHA256：`b79685e9a1d1bc8ba7c1b51ff6301c4650e524e4dfb73c16728903f16d9d8c5b`。PDB GUID `BD21AC2C-2607-5AF3-4C4C-44205044422E`、age 1，与当前 `Lumeria.exe` 的 PE 调试记录完全匹配。
- WPA 本轮仍报告 Bun PDB 未找到，查找失败原因未确定；通过原始 PC、映像基址与 LLVM Symbolizer 对匹配的 binary/PDB 直接解析，得到 2,128 个 Bun RVA 的函数信息。没有靠猜测符号、替换运行时或重编译产品来获得这组数据。

流程依据：[Microsoft 内存跟踪与 VirtualAllocation](https://learn.microsoft.com/en-us/windows/apps/develop/performance/disk-memory)、[WPA 符号支持](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/symbol-support)。符号来源：[Bun 1.4.2 官方发行包](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2)。

## 对后续优化的含义

1. **缩减启动时必须加载、解析和编译的 JS 范围。** 先对 native 入口、设置页、诊断/smoke 代码及生产构建做代码规模与内存对照，再决定按需加载或拆分；不是只缩减节点对象数。当前桌面增加的 JIT 编译页也值得做长期静置回收/构建模式对照。
2. **审计图形初始化和恢复。** 当前设备/队列 backing 为固定大头，核显驱动又被额外初始化。需要在 native/Dawn 适配器选择与生命周期上验证哪些是必要成本；减少普通纹理分辨率无法消除这约 70 MiB 底座。
3. **检查 IME 是否必须在启动时完整激活。** 可考虑首次真正输入时才初始化相关输入上下文，但必须保留中文输入、焦点和无障碍行为，不能直接禁用输入法来换指标。

本轮已经量化冷启动原生底座的主要组成，未改产品代码。上一轮 GPU 恢复后增长的具体存活分配，还需要围绕恢复过程做同样的调用栈差分；本次冷启动 trace 不能替代该证据。

## 本地证据

忽略目录 `.codex-dev/native-allocation-trace/`：`session-01/allocations.etl`、`results/` 各阶段地址快照、`allocations-raw-matched.jsonl`、`resident-attribution.json`、`final-component-table.json`、`bun-categories.json`。复现/分析脚本为 `capture-admin.ps1`、`run-minimal.py`、`run-app.py`、`map.py`、`raw-stacks.c`、`match-raw.py`、`attribute.py`、`categorize-bun.py`。

## 构建与诊断裁剪的后续验证

对 ESM/CJS/bytecode/minify 及诊断剥离做了 15 次有效隔离运行。bytecode 和 minify 没有显示稳定内存收益；同一 ESM 构建管线裁去诊断代码后，静止私有工作集降低约 5–9 MiB，交互后诊断 GC 约少 7 MiB。详情与适用边界见 [构建方式与诊断裁剪对照](native-build-memory-comparison.md)。因此不能将本报告中的解析/字节码提交页全部视为可通过 bytecode 消除。
