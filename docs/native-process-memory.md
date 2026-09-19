# native:dev进程内存分析

2026-09-09，基线035e7c0/Starter0.3.0。用户要求分析，不实施优化。

## 当前用户进程

PID55088，900×600、DPI1、RTX3060，桌面页2，设置/批量/拖拽均未打开，长时间没有新呈现。
只读统计布局：190应用、36文件夹、3页、图标设置128，systemMaterial背景，无内嵌base64图标。

Windows计数首次采样：工作集580.66MiB，私有工作集464.77MiB，私有提交1119.21MiB，
峰值工作集758.71MiB。随后总工作集575–581MiB，私有提交约1119MiB。
工作集不是JS堆，私有提交也不是当前驻留物理内存。逐页扫描期间数值有轻微变化。

映射驻留分布约：私有数据448.14MiB、私有可执行/JIT12.50MiB、映像101.46MiB、
文件/共享映射20.60MiB。其中bun.exe映像24.60MiB、Skia映像5.07MiB、Dawn映像3.82MiB，
其余含NVIDIA/Intel/D3D系统库及输入法。不能用DLL文件大小当实际RAM。

GPU计数独立报告：专用约168MiB、共享约43MiB；不要直接与RSS相加视作独占物理内存。
当前场景可达72个图片source基础RGBA约14.01MiB、460个Text节点；不包含离场景仓库、
内部文字纹理和全局池，不能拿它当总显存。

## 隔离对照

未复制真实布局：自动审批拒绝该复制，后续只统计数量并使用公开夹具生成合成数据。
三个完整应用组为0应用、190占位应用+36文件夹、190张独立256×256图片+36文件夹；
相同900×600、DPI1、图标128、纯色底/无系统材质，无扫描和快捷键。
内存探针仅通过本地构建插件注入独立运行包，产品源码未修改。GC只在隔离组执行。

| 条件 | RSS MiB | 存活JS堆 MiB（含extraMemorySize） |
|---|---:|---:|
| 空Bun，同应用二进制 | 39.3 | 0.13 |
| 导入Pixi | 69.1 | 4.11 |
| 再导入Skia并栅格化 | 88.1 | 5.27 |
| 仅原生WebGPU窗口，3秒附近 | 248.6 | 6.99 |
| 完整LaunchPad，0应用，闲置 | 约336–349 | 约41.6–42.0 |
| 190占位应用/36文件夹，闲置 | 约416–419 | 约49.8–50.0 |
| 190图片应用/36文件夹，闲置 | 约455–477 | 约98.5–99.0 |

这些为分阶段/独立进程测量，不是可严格相加的同一进程归因账单。Windows驻留、GC与
分配器保留会改变RSS；heapStats.heapSize已包含extraMemorySize，不可再次相加。

190图标CPU RGBA精确47.5MiB；仓库估算GPU含mipmap63.33MiB。图片组存活堆比占位组
增加约48.5MiB，与CPU像素副本吻合。原生loader还会暂时创建解码Image、Canvas、ImageData
和复制后的Uint8Array，加载高峰可能显著高于稳态。

## 已确认的优化机会

1. **空闲RAF/Ticker空转，优先级最高。** 原生runtime-shim将RAF直接映射setImmediate；
   Ticker.system启动、1监听、maxFPS0，即使无新present仍持续执行。隔离空应用出现数万
   Immediate/闭包等短命对象。3秒CPU原组3.02s，诊断包仅改RAF为16ms后0.14s；RSS约342.4
   对310.1MiB，存活堆约41.6对41.4MiB。证明调度带来分配压力和高水位，不等于所有私有
   内存都因此产生。产品修复应整合事件ticker/宿主节拍，回归动态命中和动画，不能盲目停ticker。
2. **品牌预览过大且全量常驻。** 四个SVG启动即栅格成1254×1254，各5.999MiB，CPU总约24MiB；
   GPU若上传含mipmap约32MiB。主要为设置预览，可按使用尺寸栅格化并延迟加载。四个256²
   CPU仅1MiB，理论可去掉约23MiB像素保留，不保证RSS同量下降。
3. **全布局图片保留。** collectTextureItems遍历所有页和文件夹，仓库保留全部图片CPU副本。
   可按当前页/相邻页/文件夹预览及拖拽lease管理，冷资源保留压缩来源或可重载路径。
   190张256²缩到128²理论CPU节约35.625MiB，GPU约47.5MiB；但用户图标128，放大/高DPI
   场景需要更高分辨率，不应一刀切降图质。释放CPU像素须保留device-lost恢复来源。
4. **渲染目标与文字池按高水位保留。** 有明确源码机制，但当前量测的文字池并不大；不要
   把它当数百MB主因。设置三次开关节点回1911、文字528、活跃文字纹理回1.22MiB；池保留
   23纹理约1.27MiB，Canvas池约0.53MiB。RSS最高597MiB，GC后483MiB，存活堆105.2MiB，
   较之前99MiB多约6MiB。三次不足以判断泄漏，需要长期同阶段post-GC/分配栈证据。
5. **native:dev启动链额外进程。** npm/tsx/Node构建包装进程在bun之外，已识别四个Node
   总工作集约259MiB、私有提交约238MiB，另有约11MiB launcher及26MiB Rust数据进程。
   正式启动链或精简dev包装可优化整体占用，但不会直接降低bun.exe这一行。

## 必要开销与不建议的方向

在现有架构下需要Bun/JSC、Skia、Dawn/D3D/驱动、窗口表面、实际图标文字与可恢复资源。
最小原生窗口约249MiB是本机当前实现基线，不是理论最低；其中原生堆/驱动/分配器需
原生分配栈进一步拆分，不能精确归因剩余每一MiB。无CEF/WebView映像证据，不应把它
笼统归为隐藏浏览器。用户systemMaterial背景不走壁纸图片管线，不能归因4K壁纸。

不建议先降2×文字（本组活跃文字纹理约1–5MiB）、定时强制GC或调用工作集裁剪来制造
任务管理器低数值；不建议猜测MCP SDK常驻，SDK只在独立工具进程导入，应用只接轻量Bridge。
构建bundle约4.45MiB，源码/编译元数据有成本但文件大小不能直接解释400MiB。

## 原始证据

### 后续渲染池调查：能否把RAM放到显存（2026-09-09）

用户允许继续调查，仍未授权改变应用图标方案。仅构建隔离探针，不修改产品源码。
使用190张合成256²图标/36文件夹、DPI1，经历900×600→批量管理→关闭→1920×1080→
批量管理→关闭→900×600。池基础RGBA预算依次0、7.5、7.5、8.34、24.34、24.34、24.34MiB；
诊断GC后仍24.34MiB。大窗口新留下一个2048²/16MiB纹理，缩小后未回收。已核实这些池纹理
cpuResource=false、gpuResident=true，因此已经GPU驻留，不能再次“转移到显存”来省RAM。
活跃主目标随窗口缩回900×600，MSAA颜色及depth-stencil均4samples、无CPU像素resource。
主canvas source.resource为native canvas shim，其存在不代表等尺寸CPU位图。

整段RSS约398→448→430MiB，GC后425MiB；这不是24.34MiB池与RSS的直接对应关系。
池预算是逻辑像素量，不含全部驱动/MSAA/资源对齐。Windows GPU进程计数在恢复小窗口后
约230MiB专用、44MiB共享（含其他资源）。原始render-memory-results.json及
render-memory-idle-later.json保留在.codex-dev。

结论：可转为GPU主存储的主要是静态图片CPU RGBA副本，但图像GPU副本本就存在，实际收益
来自删除/压缩CPU副本并提供按需重载与device-lost恢复；190×256²理论CPU像素47.5MiB，
不是把数百MiB JS/原生堆搬走。该方向属于用户暂缓的应用图标策略，未实施。
文字上传后复用Canvas池，实测Canvas池很小；JS对象、布局、字体匹配、事件和驱动控制数据
仍需CPU访问，不能透明换到VRAM。核显共享物理RAM，也没有同等“搬出系统内存”的收益。
下一项更明确的优化是限制临时GPU目标尺寸及池的闲置预算，尤其批量工具栏整舞台中间目标；
其收益主要体现为GPU资源预算，RSS是否下降需独立测量。

本地`.codex-dev/memory-user-55088.json`、memory-empty/glyphs/images.json、
memory-idle-later.json、memory-minimal.json、memory-paced.json、memory-settings-cycle.json；
memory-map.py只读页属性，不读取进程内存内容。保留诊断脚本和合成夹具，产品源码无优化。

口径参考：
- https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex2
- https://bun.sh/reference/bun/jsc/HeapStats
