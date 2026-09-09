# private:data 分配来源调查

2026-09-09。只调查，不改产品实现。当前Starter0.3.1，隔离900×600空原生窗口。
纠正此前口径：约347MiB私有工作集来自完整LaunchPad空布局旧样本，不能归到约249MiB
最小WebGPU窗口。private:data是自定义VirtualQuery按MEM_PRIVATE/非执行页归类，
并非VMMap经过heap/stack细分后的Private Data。

## 方法和限制

- 首次自动启动WPR被Windows拒绝（0x80070005），当时未取得allocation stacks。
  随后用户在管理员终端完成录制并安装WPA，已完成下文的ETL分析；未更改注册表或系统权限。
- 诊断构建在host导入、surface、requestAdapter、requestDevice、复制自检、renderer、
  首帧闲置及dispose之间插入同步采样；产品源码和vendor未修改。
- JSC/Bun mimalloc统计与外部VirtualQueryEx/QueryWorkingSetEx映射类别同时采集。
  GC只用于隔离进程；会扰动时序，所有数值均为本机阶段归因线索，不是生产容量保证。
- 私有驻留与JS存活堆/mimalloc提交不能直接相加。后者是不同、可能重叠的统计口径。

## 同进程分阶段结果（MiB）

|阶段|私有驻留页合计|进程私有提交|JSC存活堆（含extra）|
|---|---:|---:|---:|
|worker开始|27.98|141.36|2.56|
|导入native host|37.25|231.57|5.49|
|创建窗口与surface后|53.61|264.95|5.76|
|requestAdapter后|48.16|265.07|5.82|
|requestDevice后|110.22|424.48|5.86|
|GPU复制自检后|116.62|436.10|6.01|
|createGpu返回|111.47|430.83|6.03|
|Pixi renderer初始化后|113.47|436.43|6.86|
|窗口闲置|126.37|495.09|7.63|
|再次闲置采样|126.21|495.31|5.45|
|dispose刚完成|116.64|470.48|5.25|

requestDevice阶段增量约62.06MiB私有驻留、159.41MiB私有提交，JSC仅约0.04MiB。
本实现requestAdapter创建包装，requestDevice通过__electrobunCreateAdapterDevice进入
nativeFrameHost.createAdapterDevice / pixi_create_adapter_device，内部调用Dawn的
wgpuInstanceRequestAdapter/wgpuAdapterRequestDevice。不能将函数名误读为只有JS分配。
未看到正常启动直接重复创建设备的证据。

另一轮同样初始化，host→闲置RSS约77→228MiB；其中映像驻留约28.5→87MiB，
MEM_PRIVATE驻留约37→126MiB，映射驻留约13→18MiB。即约150MiB RSS增量包含约
58MiB DLL/EXE映像页与约89MiB私有页，不是全部DLL也不是全部私有堆。
同轮Bun mimalloc提交仅约110→113MiB，JS约5.5→7.6MiB，主要新增量不在它们内。

## 对照

仅关闭MSAA：闲置RSS约230MiB、私有提交476MiB；默认约228/489MiB。
再关闭透明窗口（仍无MSAA）：约229/480MiB。RSS无显著下降；不能用抗锯齿或透明纹理
单独解释主增量。三组各一次，非统计显著性测试。
dispose后RSS短时未明显归还，不代表泄漏：模块仍加载、分配器/驱动缓存及异步释放仍可能
存在。应做长期同进程create/destroy循环及分配栈后才能判定。

## 首轮结论（后续WPR结果见下文）

已将private:data最大的启动增量收敛到原生adapter/device创建链路，其次是窗口/surface与
首帧/输入完整初始化。Pixi renderer构造和JS存活对象本身不是本样本的主增量。
尚不能精确拆成Dawn多少、NVIDIA多少、D3D heap多少；也不能据此承诺可释放同等RAM。
下一步最有效证据是管理员上下文的WPR VirtualAllocation调用栈，并在WPA按目标PID、
Commit Stack与模块汇总；必要时增加Windows heap跟踪。无需先更改应用图标策略。

原始数据：.codex-dev/private-stages-default.json、private-stages-noaa.json、
private-stages-opaque.json、private-native-breakdown.json、private-device-breakdown.json及
对应各阶段.map.json。诊断实例自动退出，用户PID1044未操作。

## WPR / WPA分配栈结果（2026-09-09，分析完成）

用户管理员录制的原始ETL为`.codex-dev/private-allocation.etl`。目标为隔离最小窗口
`bun.exe (69080)`，不是完整LaunchPad应用布局。WPA导出VirtualAlloc Commit LifeTimes，
筛出5195条目标记录。使用本地已下载符号缓存成功完成全部导出，退出码0；逐条按地址、
提交时间、解除提交时间、大小对比无符号版本，计数及记录多重集合完全一致。
在线符号导出的中间文件不作为统计依据。

统计在trace时间74.0s取仍存活记录（commit <= t < decommit），共4203条，
大小合计约424.03。以下单位沿用WPA CSV的MB标签，原始输出保留3位小数，
因此不宣称字节级精度。这是该表的虚拟分配提交生命周期口径，**不是RSS、私有驻留、
物理显存、实际存活对象大小，也不是完整进程Private Bytes**。此前约495MiB私有提交
来自另一轮分阶段采样，不能用两轮不同范围的数值硬凑差额。

|互斥分配链分组|WPA MB（约）|解释|
|---|---:|---|
|Bun其余链路|153.05|排除以下已识别模块后仍含bun.exe；不能等同JS对象|
|图形内核dxgmms2|81.67|显存管理相关分配链，不代表同等独占显存或驻留RAM|
|Skia native模块|67.51|含模块初始化VirtualAlloc及线程创建|
|NVIDIA用户驱动|45.45|含D3D11宿主和D3D12设备链，包含线程栈|
|D3D12 runtime|26.90|排除上述驱动/内核链之后的部分，主要栈组涉及线程创建|
|输入法相关模块|22.51|Sogou/PicFace进程内链路，是本机环境贡献|
|其他|13.85|尚未细分|
|Intel用户驱动|13.09|证明经过Intel链，不证明同时用两张GPU渲染|

分组按完整栈匹配，优先级为图形内核>NVIDIA>Intel>Skia>D3D12>输入法>Bun>其他；
每条记录只算一次。它表达可见调用链归因，不是模块独占所有权，不能再与各模块含栈总数相加。

### 符号揭示的具体来源

1. Skia一组32.00：`LoadLibraryExW → LdrpCallInitRoutine → skia.node → VirtualAlloc`。
   可以确认加载初始化中发生大块虚拟分配；缺少匹配Skia PDB，不能直接命名其内部allocator函数。
2. Skia另一组32.00：`skia.node → CreateThreadStub → NtCreateThreadEx → RtlCreateUserStack`。
   明确属于线程栈创建链。纠正仅看模块和整块大小时“两块都可能为mimalloc segment”的猜测；
   不能说是64MB图像像素或两个已确认的allocator segment。
3. Dawn/D3D12一组24.144：`native-frame → webgpu_dawn → D3D12Core → _beginthreadex →
   NtCreateThreadEx → RtlCreateUserStack`，是多个相同可见栈记录的汇总，不是单个24MB对象。
4. NVIDIA一组16.00：`libNativeWrapper → D3D11CreateDevice → NVIDIA → CreateThread →
   RtlCreateUserStack`。确认宿主存在D3D11设备初始化路径；Dawn的D3D12链也同时存在。
   这不等于业务误创建了两个WebGPU设备，不应未经宿主互操作分析就删除D3D11路径。
5. 图形内核的一组12.028：`native-frame → Dawn → D3D12 → NVIDIA →
   ZwGdiDdDDICreateAllocation → DXGDEVICE::CreateVidMmAllocations → dxgmms2 → NtAllocateVirtualMemory`。
   直接支持原生图形资源创建是启动增量的重要来源。

74.0s快照中，包含已解析`RtlCreateUserStack`的记录合计约134.51 WPA MB：
Skia32.00、NVIDIA36.084、D3D12约24.176、Bun及其他约42.252。
这是跨上述互斥分组的另一个维度，**不能再加到424.03上**，也不代表线程栈已驻留134.51MB。

公开系统符号已解析到上述Windows函数；Bun、Skia、NVIDIA及部分D3D12模块缺匹配PDB，
Dawn/Wrapper存在Missing ImageId event。因此调查完成到调用链/系统分配类型这一层，
没有声称已得到所有第三方内部函数、对象类型或每条分配的驻留页数。

### 对后续优化的含义

- 原阶段采样requestDevice带来的约62MiB私有驻留增量仍有效；这次栈证据补充了Dawn、
  D3D12、驱动、图形内核及线程初始化路径。Pixi renderer构造和JS对象不是本样本主增量。
- Skia加载时32MB分配与32MB线程栈应分别调查；需匹配符号/源码构建及同地址驻留页关联，
  才能判断调整allocator或线程配置是否真正减少RAM。仅缩小虚拟提交不能承诺RSS同幅下降。
- 宿主D3D11与Dawn D3D12的生命周期/互操作开销值得独立对照；现有样本不支持直接移除任一路径。
- 输入法贡献是环境因素，未禁用或修改用户输入法。Intel链可能涉及适配器发现等路径，尚不能细化。
- dispose后短时保留不构成泄漏证据。本轮没有实施新的产品优化，没有改应用图标策略。

可复核材料：`.codex-dev/analyze-private-va.py`、`private-va-summary.json`、
`wpa-target-cached/VirtualAlloc_Commit_LifeTimes_RuleEngine.csv`及原始ETL。
分析脚本验证5195条记录一致并导出各时间快照及前16组完整符号栈。
