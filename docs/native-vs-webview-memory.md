# WebView2 与 native 内存差异分析

> 后续同尺寸实验更新了最初判断：空native私有驻留并不比WebView2-WebGL更高；
> native的提交量明显较高。最新结论以文末“管理员跟踪与同后端对照”章节为准。

2026-09-10；用户报告相同190图标布局，WebView2任务管理器约200MB，stable native启动约270MB以上。
本轮为调查，不修改产品内存策略。此前可选bytecode构建已提交f4a3d17，未推送。

## 当前用户进程与口径

只读统计布局：190应用、36文件夹、3页、图标设置128、3×7网格、systemMaterial背景、无内嵌
data URL图标。没有复制用户布局到测试目录，没有操作用户窗口或强制用户进程GC。

识别Lumeria WebView2进程树，排除了SearchHost、Clash、商店等其他WebView2实例。首轮采样：

| 进程角色 | 工作集 MiB | 私有工作集 MiB | 私有提交 MiB |
|---|---:|---:|---:|
| lumeria.exe主进程 | 89.28 | 23.50 | 33.78 |
| WebView2 browser | 156.73 | 44.30 | 60.74 |
| WebView2 renderer | 160.66 | 88.51 | 103.11 |
| WebView2 GPU | 104.27 | 43.58 | 248.36 |
| crashpad及2个utility合计 | 80.73 | 14.25 | 26.48 |
| 合计 | 591.67 | 214.14 | 472.47 |

工作集直接求和重复计算跨进程共享页，不代表独占物理RAM；私有工作集合计更适合这里比较。
因此用户看到约200MB与整组214MiB相符，不能简单断言用户漏算子进程。第二轮Web renderer
私有工作集增加到103.89MiB，说明实时状态也在变化。

用户启动的native确认为已安装stable/Bun1.4.2。曾读到bun.exe总工作集约389MiB、launcher约
11MiB、Rust数据进程约36MiB；进一步采样时该实例已经退出，未获取其私有工作集。因此不能把
389MiB与用户270MB直接相减，不能给出同一时刻两者精确差额。native提交约847MiB不是其物理
驻留量。当前Web为debug路径、native为stable，尚未完成同窗口/DPI/可见状态/页面历史的严格配对。

## 当前版本分层证据

使用随包Bun1.4.2与当前Starter0.3.4，在隔离测试进程中加载模块、创建空900×600原生窗口。
阶段采样有显式诊断GC和页属性扫描，不代表用户正常启动时间；各层结果不是可以严格相加的账单。

| 阶段 | RSS约MiB | JS存活堆约MiB（含external） |
|---|---:|---:|
| 裸Bun | 18.95 | 0.13 |
| 导入Pixi | 51.90 | 4.03 |
| 导入Skia | 70.59 | 5.05 |
| 字体栅格化 | 72.92 | 5.05 |
| 原生主线程/Worker内导入host | 76.51 | 5.06 |
| 创建窗口表面并取得adapter | 82.33 | 5.39 |
| requestDevice返回 | 174.86 | 5.42 |
| Pixi renderer创建后 | 189.38 | 6.41 |
| 空窗口晚期闲置 | 228.57 | 7.24 |

最有区分度的证据：adapter→device阶段RSS增加约92.5MiB，JS堆只增加约0.03MiB；
Windows私有工作集约37.27→96.32MiB，私有数据驻留约35.38→91.68MiB，并出现更多NVIDIA/
Intel/D3D相关映像。此时Bun/JSC分配器报告的当前提交基本不增，因此不能将增量归为JS对象。
这把主要调查范围收敛到Dawn/WebGPU设备、D3D/显卡驱动、原生资源/分配器；尚无原生分配栈，
不能精确说其中多少属于Dawn或某一家驱动。

空窗口末期私有工作集131.83MiB、私有提交486.29MiB，JS堆仅7.24MiB。总RSS包含映像/共享页，
不能用RSS减JS堆就精确算出泄漏。Bun分配器保留/提交也不等于实际物理驻留，更不能把约1GiB
虚拟保留当成耗掉1GiB RAM。dispose后RSS不会立刻归零也不能单独证明泄漏。

## 低成本开关实验

每种1个隔离最小窗口，900×600，末期Windows计数：

| 条件 | 工作集 MiB | 私有工作集 MiB |
|---|---:|---:|
| 默认透明+AA | 228.57 | 131.83 |
| 关闭AA | 225.92 | 130.28 |
| 不透明 | 229.26 | 130.75 |
| 请求集成GPU | 237.08 | 137.70 |

这些单样本不能精确比较几MiB差异，但没有出现可解释百MiB差额的改善。集成GPU组仅确认
请求了该偏好，未独立核实最后选中GPU名称，不把它当作核显/独显完整结论。无需先牺牲透明
视觉或抗锯齿来争取没有证据支持的大幅收益。

## 为什么去掉浏览器仍可能更重

这次迁移是替换渲染栈，而非只删除WebView外壳。原版分支createPixiApp未指定preference，
安装的Pixi默认优先WebGL；背景明确WebGL。native固定WebGPU，并在进程内承担JSC、Skia、
Dawn/D3D/驱动、原生输入、表面与资源缓存。旧WebView2通过Chromium/V8/ANGLE/浏览器图像
管理完成相应工作，资源分布到renderer/GPU/browser并有共享页。两条路径的调度、缓存、驱动
初始化和回收粒度不同，native这一实现没有天然RAM优势。

Bun/JSC有成本，但裸Bun与存活JS堆数据不支持“主要是Bun堆吃掉几百MiB”；Electrobun
窗口/Worker/FFI也有固定成本，但同样不能把所有Dawn/驱动分配统称为框架本体。WebView2更低
可能是真实结果，不能仅靠多进程解释否定用户观察。真正可量化的差异需要统一后端和状态。

## 下一步优先级

1. **GPU宿主固定开销**：先做同尺寸、同DPI、同GPU的最小WebView2-WebGL、WebView2-WebGPU、
   native-WebGPU对照，分离“浏览器/宿主”与“WebGL/WebGPU后端”变量；对requestDevice前后
   做原生分配栈或ETW/堆归因。检查多adapter初始化、shader编译缓存、设备/队列/表面冗余与
   上传暂存资源。这是目前最值得针对启动270MB底座投入的方向。
2. **完整应用初始化与高水位**：把空窗口→空LaunchPad→190图标、文件夹预览、设置首次打开
   分阶段记录JSC heap/external、原生私有提交/驻留和GPU资源。优先找一次性解码/布局临时对象
   与分配器保留，区分活对象、可回收缓存与已空闲但未归还的页，避免仅凭任务管理器判断泄漏。
3. **图标需求加载和冷资源预算**：当前全布局加载，未上传图标仍留RGBA，已上传GPU纹理长期
   驻留。先按首屏/邻页/文件夹预览/拖拽需求加载，冷图标保留编码来源；再讨论GPU预算淘汰。
   主要改善190/1000图标的增量、启动峰值和全页浏览高水位，无法消除空窗口固定成本。
4. **滤镜/临时渲染目标预算**：已有证据显示大窗口后池可留24MiB级GPU目标，应限制作用域与
   闲置池预算，但收益先表现为GPU资源，不能承诺同量RAM下降。

不优先：compile/bytecode、盲目降文字分辨率、定时强制GC或工作集裁剪、直接更换语言。
bytecode已测出主要为几百ms启动收益且可能增内存；旧RAF空转与RGBA重复保留已经修复，
不把过期问题再列成当前待做优化。

## 证据与参考

`.codex-dev/memory-comparison/`：web-current.json及各web PID页属性、live-both.json（仅Web部分
有效，native根PID已退出的零值行无效）、bun-imports.log、minimal-{default,no-aa,opaque,integrated}
的JSON/日志/阶段map。只读用户页属性，不读取进程内容；测试实例均自行退出，未修改产品内存配置。

- [WebView2进程模型](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)
- [Windows内存计数定义](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex2)
- 既有测量见native-process-memory.md、native-icon-cpu-release.md；旧版本结果仅作机制线索。

## 管理员跟踪与同尺寸对照（2026-09-10后续）

用户授权按排查需要结束原版/native实例，并明确要求尝试Windows管理员权限。
本轮先获得同时运行的配对读数：native进程树工作集合计439.86MiB、私有驻留295.12MiB、
私有提交935.45MiB；原版WebView2树分别672.27/291.36/561.32MiB。
这次两组私有驻留接近，native提交明显高。用户此前200/270MB观察仍可能对应不同操作阶段，
不能将某个时点推广成固定差额。随后按授权结束这两棵启动台进程树，只运行隔离样本。

### 真正的管理员跟踪

普通工具扩展沙箱权限的Windows令牌经核实仍非管理员。WPR先报0x80070005，后通过UAC
启动独立管理员助手成功；只提升跟踪助手，测试Bun仍为普通权限。VirtualAllocation短时
跟踪含测试PID76848，随后停止，`wpr -status`确认没有遗留录制。采集1,673,497原始事件，
0丢失，含312,063 VirtualAlloc和320,448 StackWalk；只提取测试PID的4,813次分配、955次释放。

本机WPA旧模板导出不兼容，改用微软TraceEvent3.2.6读取ETL/ETLX，并按地址页去重重建
MEM_COMMIT、MEM_DECOMMIT、MEM_RELEASE。以下是进程启动后4.2秒（销毁前）的**已跟踪提交**，
按栈上靠近分配调用的第一个非系统模块归类；不是RSS，不是完整进程提交账单，也不是精确
组件所有权。底层代分配、共享/映射资源、缺失栈和符号不完整均限制解释。

| 调用路径分组 | 已跟踪提交约MiB |
|---|---:|
| Bun/JSC所在模块 | 140.21 |
| Skia原生模块 | 66.89 |
| GPU/D3D/驱动相关路径合计 | 168.27 |
| 其中Windows图形内存管理dxgmms2 | 82.02 |
| 其中NVIDIA用户态驱动nvwgf2umx | 45.57 |
| 其中D3D12Core | 24.19 |
| 输入法相关sogoupy/picface/sogoutsf合计 | 21.22 |
| libNativeWrapper直接路径 | 2.20 |
| native-frame直接路径 | 0.37 |

全部已跟踪提交约415.39MiB；分组内“其中”不可再与合计相加。直接归到webgpu_dawn模块
约1.96MiB，绝不意味着Dawn整体仅占2MiB，因为它发起的设备资源会由D3D和驱动分配。
同理，Bun140MiB不能称为140MiB存活JS对象；隔离窗口的JS堆只有约7MiB。
Skia在早期已有约66.88MiB提交，而其导入RSS增量远小于这个数，支持存在独立原生分配池，
不支持“这些页都已实际占用物理内存”。本轮没有私有PDB函数级归因，未确认泄漏。

代码复核另发现，JS层requestAdapter仅返回包装对象，原生adapter选择和device创建一起发生
在nativeFactory中；前文约92MiB增长应归为“原生适配器/设备初始化”，不能只算requestDevice。
当前Windows原生路径明确请求D3D12，WebView2 WebGL实际使用ANGLE/D3D11。

### WebView2后端隔离

使用原版Tauri外壳加载临时本地空HTML/Pixi页面，不加载真实布局JS，不复制用户布局。
每组独立WebView2用户数据目录，CDP端口启动前必须空闲，连接前检查监听PID属于新实例，
页面必须是本次本地地址。原版禁止直接set_size/show等API，改用其已有启动握手展示窗口，
保持实际1920×1080窗口，再匹配测试画布尺寸。结束时只关闭测试进程树。

第一组900×600画布、约1920×1080外层窗口：空HTML整组私有驻留119.49MiB，WebGL139.37，
WebGPU210.97。随后以1920×1080窗口/画布、DPI1、AA开启匹配再测：

| 空场景 | 私有驻留 MiB | 私有提交 MiB | 总工作集 MiB |
|---|---:|---:|---:|
| WebView2空HTML | 122.78 | 269.72 | 440.66（多进程共享页重复） |
| WebView2 + Pixi WebGL | 140.23 | 343.40 | 465.50（同上） |
| WebView2 + Pixi WebGPU | 209.74 | 388.38 | 549.40（同上） |
| native + Pixi WebGPU | 130.23 | 510.64 | 228.52 |

WebGL实际为NVIDIA RTX3060 Laptop的ANGLE/D3D11；WebGPU报告NVIDIA/ampere；native明确
报告同一RTX3060 Laptop、1920×1080。浏览器计数包括Tauri和所有WebView2子进程，native
最小样本直接执行原主线程+Worker脚本、不含小型launcher。native诊断采样有显式GC与页扫描，
浏览器没有强制GC；这仍不是完美的内存管理算法对照。各条件1组，禁止过度解读几MiB差额。

结果足以否定“native空GPU窗口必然比WebView2更占物理内存”的初步猜测。同一WebView2
外壳内WebGPU比WebGL增加约69.5MiB私有驻留，说明后端确有成本；但native省去浏览器相关
固定成本后，最小场景总私有驻留仍较低。同时native提交高167MiB（对WebGL），更符合
JSC/Skia/驱动各自持有分配池或资源地址页的证据。提交量不等于RAM。

### 修正后的下一步

1. 优先测**完整应用启动带来的增量**：最小native约130MiB私有驻留，对比当前完整native
   约295MiB，虽状态/尺寸未严格配对，已有约百MiB级调查空间。逐步隔离应用模块初始化、
   字体/文本缓存、品牌资源、图标读取解码、文件夹预览及首次设置。不能只盯GPU底座。
2. 对Bun/JSC与Skia分配池做“实际提交/驻留/存活对象”三口径对照，验证是否能延迟初始化、
   减少瞬时分配和重复解码；先找保留对象/高水位，避免用强制GC或裁剪工作集伪造收益。
3. 继续按首屏/邻页/文件夹/拖拽需求加载与冷资源预算，针对190/1000图标增量；native图形
   栈与驱动的高提交需要监测，但当前不建议仅为RAM节省重写回WebGL或换Bun。

本轮未修改产品实现，未关闭系统其他WebView2应用。测试结束后5173/9222服务和所有测试
实例已退出。用户原版/native实例按授权结束，未自动重开。

证据：`.codex-dev/memory-comparison/paired-*.json`；`wv-{blank,webgl,webgpu}`与
`wv-large-{blank,webgl,webgpu}`的result.json、截图、PID页属性；minimal-large.json与map；
`trace/minimal-admin.etl`、minimal.etlx、target-allocations.jsonl、target-stacks.json、
allocation-summary.json和相关分析脚本。跟踪只分析PID76848，其他进程事件不用于结论。
