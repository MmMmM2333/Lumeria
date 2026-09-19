# 2026-09-19 批量管理WC阶跃：因果隔离

## 已证实的范围

在本机RTX3060 Laptop、800独立图标、1920×1080全屏、dev隔离数据中，进入空批量管理后WC已提交区域增加约208.5MiB。暂停节点池预热不能消除阶跃；同时暂停工具条backdrop取样与对应stage AlphaFilter中间表面，阶跃消失。关闭背景是诊断实验，不是产品修复或建议默认关闭效果。

| 实验 | 拖动节点池 | WC基线→进入空批量管理 MiB | 差额 |
|---|---:|---:|---:|
| 全屏正常路径复测 | 0→80 | 325.40→533.90 | +208.50 |
| 全屏暂停节点预热 | 0→0 | 328.86→537.36 | +208.50 |
| 全屏暂停背景路径 | 0→80 | 326.98→326.98 | 0.00 |
| 900×600窗口正常路径 | 0→70（有选择阶段到80） | 250.22→306.37 | +56.15 |
| 全屏正常路径，补全附件记录 | 0→80 | 330.73→539.23 | +208.50 |

各组串行、独立进程、选择前全页预热、selection-empty/filled各停留6秒，无强制GC、heap snapshot或full dump。VirtualQueryEx取检查点前≤6.5秒样本；分类非原子且不同于显存，不应和JS堆相加。所有最终有效实验通过并退出，原1070Ti巨大三角形未复现。

## 渲染资源证据

正常全屏路径首次出现额外2048×2048 bgra8unorm池化颜色纹理（antialias=true）。同时新增同尺寸4×MSAA颜色附件和depth24plus-stencil8的4×MSAA深度模板附件。Root的1920×1080附件本来就存在，不计入新增。

正常900×600窗口新增1024×1024池化颜色纹理与同尺寸4×MSAA颜色附件；采样记录深度模板附件。暂停背景路径时没有新增上述大尺寸中间目标，即使拖动池已到80。

本地Pixi8.20.1 TexturePool.getOptimalTexture将两轴向上取2次幂：1920×1080→2048×2048，900×600→1024×1024。GpuRenderTargetAdaptor在antialias=true时使用sampleCount4。空闲纹理池source设置autoGarbageCollect=false，退出选择后资源继续保留供复用，所以一轮退出未回落并不单独证明泄漏。

观察器只读，记录free TexturePool与cached render target附件，不遍历全部Dawn/driver资源。RenderTargetSystem可能有多个surface键指向同一target，最终观察器按对象身份去重；较早full原始日志depth列表中uid22两行是别名，不是两张附件。测试覆盖null缓存条目及别名去重，不能对重复行直接求和。

## 容量吻合：推断，不冒充分配栈

上游Dawn D3D12实现中depth24plus-stencil8映射到DXGI_FORMAT_D32_FLOAT_S8X24_UINT；微软格式定义为64bit（32深度+8模板+24空位）。来源：[Dawn TextureD3D12](https://dawn.googlesource.com/dawn/+/6cbe0154290f124cf26ecc9627f4998f38c97f7c/src/dawn/native/d3d12/TextureD3D12.cpp)、[微软DXGI_FORMAT](https://learn.microsoft.com/en-us/windows/win32/api/dxgiformat/ne-dxgiformat-dxgi_format)。本机Dawn二进制的精确源码revision未核实，下面按此常见映射估算：

- 2048²×4bytes 单采样颜色：16MiB。
- 2048²×4bytes×4samples MSAA颜色：64MiB。
- 2048²×8bytes×4samples 深度模板：128MiB。
- 合计208MiB，与WC实测208.5MiB很接近。

1024²对应理论52MiB，窗口实测56.15MiB，方向和规模一致，但并非完全相等。理论纹理payload不能直接等同CPU WC、驱动私有提交或专用显存；分配对齐、额外资源、映射/驱动内存需原生栈/PIX进一步验证。当前可以确认应用触发路径、附件尺寸和阶跃相关性，不声称已证明每个WC字节属于哪一个D3D资源。

## WPR限制

已先确认无WPR会话。最初单独start被自动审批拒绝，原因是未配限定时长和停止；随后改成40秒、明确输出文件、try/finally stop命令获准，但Windows返回0x80070005 Access denied。WPR status确认未开始，没有遗留会话，也未生成ETL。未尝试绕过UAC或提升Windows令牌。

继续分配栈取证需要管理员权限的终端/运行环境。在有权限的环境应保持短时采集，开始前确认无其他录制，限定时间并finally停止保存；不要关闭或取消他人的WPR会话。文件留本地。

## 代码与验证

新增--stress-isolation=none/no-prewarm/no-backdrop/neither，仅selection模式可用。NativeSelectionToolbar默认backdropEnabled=true；正常产品行为不变。dev隔离stress入口临时覆盖prewarm或关闭backdrop，成功结束恢复，失败保持现场。不会在release日常流程自动关闭效果。

- test:selection-isolation：独立开关、恢复默认、GPU缓存空条目、别名去重通过。
- test:native-stress：参数范围/隔离模式约束通过。
- scene.test、完整domain/布局/渲染边界、native/tools类型、check:policy通过。
- 最终全屏selection-empty系统截图已人工查看：工具条和图标正常，背景存在；不是所有图形问题的像素回归。
- 初次windowed因新增观察器遇null target而提前失败，已修并重跑；该失败是诊断器错误，不是产品device loss。

## 证据目录

均在artifacts/native-stress：

- no-prewarm：2026-09-18T19-41-05-046Z-41300。
- no-backdrop：2026-09-18T19-43-24-076Z-41636。
- normal pool：2026-09-18T19-45-04-089Z-30588。
- windowed有效：2026-09-18T19-48-31-520Z-34644。
- full附件与截图：2026-09-18T19-50-36-870Z-44708。

## 后续可验证方向

后续记录：已完成的 CopySrc 实现与旧 SDK 回退证据见 `native-copysrc-recovery-2026-09-19.md`。下方是隔离试验完成时提出的方向，保留作调查历史；不代表当前仍未实现中间表面优化。

优先研究保留视觉效果的中间表面优化：避免2次幂扩大到整张2048²、减少不需要的深度模板/采样附件、或局部背景取样。任何方案都必须验证图标/圆角/文字抗锯齿、mask裁剪、文件夹动画及设备恢复，不能直接取消MSAA来省数值。实现方案涉及渲染路径变化，应单独确认范围并做A/B。当前未修改产品渲染架构或清空共享纹理池，原1070Ti约748MiB WC增长仍不能全部由本机208.5MiB阶跃解释。
