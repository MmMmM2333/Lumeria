# 文件夹打开与后台驻留异常诊断

## 静止重复排帧修复（2026-09-11）

按用户后续授权，仅修复进度驱动面板的稳态循环。实际面板位置/缩放/透明度变化、新目标或
新opening lease时才通知进度帧与边界；复用真实几何比较，不新增重复的进度缓存。
隐藏时文件夹延迟重置及打开瞬时峰值不属于此次修改范围。

新增场景回归在RAF存在的原生宿主条件下，修复前明确失败，修复后通过：打开后所有动画和
afterFrame任务归零、释放动画宿主，再提交相同场景也能保持空闲。补进度变化、目标移动、
外部几何恢复测试，既有resize/关闭交接回归继续通过。
独立原生smoke（PID21396）退出码0，含新增静止断言、文件夹翻页/重开/关闭、拖拽、尺寸变化。
为保留用户开发实例11564，用独立运行包及--settings-only跳过全局快捷键/托盘测试；未把它们
计为本轮通过。folder-page-1截图已检查。日志.codex-dev/folder-idle-smoke.log。
最终npm run check通过；中途进程退出测试一次时序失败，原断言单独及最终全量复测均通过。
日志.codex-dev/folder-idle-check.log，git diff --check通过。没有将此前诊断RAM数字冒充修复后实测。

2026-09-11，产品基线4913cd8。用户报告桌面约280MB，打开文件夹接近400MB，从其中启动应用后
Bun后台继续约400MB。本轮复现并定位两个生命周期问题，只有隔离诊断包修改，未实施正式修复。

## 复现

沿用190真实图案/36文件夹/3页独立夹具，900×600、resolution=1、无系统材质。
切到最大文件夹所在页，闲置8秒，打开23个应用/2页的文件夹，闲置5秒；从中激活真实本地
Node测试程序（只写本目录launched.txt后退出），走原Rust启动/动画/隐藏链路。隐藏10/30秒
继续采样，最后才做诊断GC；不操作用户安装实例。计数是主Bun私有工作集，不含子进程。

| 阶段 | 原实现私有工作集 MiB | 堆含external MiB | 场景节点 |
|---|---:|---:|---:|
| 桌面静置 | 248.70 | 48.77 | 2487 |
| 打开达到目标进度，部分交接仍在进行 | 344.10 | 60.06 | 4005 |
| 文件夹闲置5秒 | 346.90 | 78.05 | 3246 |
| 启动后隐藏 | 362.50 | 86.30 | 3247 |
| 隐藏10秒 | 347.60 | 81.80 | 3246 |
| 隐藏30秒 | 381.10 | 105.80 | 3246 |

原始精确数值以samples及map为准，此表保留到0.1MiB。此前paired实验只翻桌面页与设置，
没有覆盖打开文件夹后长时间静置，不能用那些结果排除此缺陷。

## 根因一：静止文件夹持续排帧，触发整场景重复提交

NativeDesktopScene.makeNativeFolderFrame持续给出folderOpenProgress=1。
FolderOverlayLayer.animatePanel在进度驱动分支，每次提交均调用updateOpeningPanelFrame，
即使targetKey、进度和几何没有变化，也markRegisteredBoundsDirty并用motionRuntime.afterFrame
排边界刷新。NativeDesktopScene.connectAnimationHost每次step后又host.commit，回到相同分支：

提交场景 → 标记边界脏/排afterFrame → 下一帧step → host.commit → 再排afterFrame。

静置和隐藏时activeAnimationCount已经是0，但hasActiveWork仍为true，因为afterFrame队列不空。
计数探针：文件夹闲置时registeredBounds回调累计304次，隐藏10秒时917次；重置文件夹后保持917。
这不是尚未结束的弹簧动画，也不是只有GPU缓存保留；重复场景提交持续制造短命JS对象和原生工作。
堆在隐藏期间可明显增长，GC虽能回收对象，驻留页不一定即时归还，形成较高后台工作集。

关键代码：FolderOverlayLayer.ts约4401–4435、3076；NativeDesktopScene.ts约398–403。

## 根因二：隐藏只隐藏窗口，文件夹延迟到下次显示才重置

nativeMain.hideAfterPresented只完成最后呈现并window.hide；showLaunchpad才folderFlow.reset。
启动流程的startFolderZoomFadeClose可选回调在native适配中未提供，NativeFolderFrame的
isAppLaunchClosing/isZoomFadeClosing固定false。隐藏时renderedFolder仍存在，节点维持3246。
因此前述排帧循环随文件夹一起保留在后台，而不是在启动动画结束后收尾。

诊断在隐藏10秒后调用已有folderFlow.reset并提交场景：两轮均让节点3246→2487、active→false，
随后闲置私有工作集降至263.9/267.0MiB。重置瞬间不一定降RAM，必须让清理与回收有机会完成。

## 因果对照：只阻止不变进度的重复帧

另一独立包仅在目标key或openProgress改变时通知进度帧，不执行隐藏重置。仍使用相同23子项，
保留全部3246节点和原打开/启动流程：

| 阶段 | 原实现 MiB | 诊断去掉重复进度帧 MiB |
|---|---:|---:|
| 桌面 | 248.7 | 249.04 |
| 打开到目标进度 | 344.1 | 344.99 |
| 文件夹闲置5秒 | 346.9 | 275.66 |
| 隐藏10秒 | 347.6 | 264.41 |
| 隐藏30秒，未强制GC | 381.1 | 256.18 |

诊断组静置及隐藏active=false，registeredBounds回调累计10次后不再增长。说明不必删除文件夹
全部节点即可停止持续分配并显著降低后台驻留；因此持续循环是重要原因。每条件样本少，不承诺
所有机器固定节省125MiB。这个按key+进度判定是定位用的简化，不是完成了边界/拖拽/重开/resize
契约验证的生产修复，不能直接移植当作最终实现。

## 打开瞬时峰值为何仍存在

去掉循环后打开瞬间仍约345MiB，说明还有打开动画本身的资源/临时分配成本。
此23子项样本静置新增759节点、207个Text（每项33节点、9个Text）；打开交接时新增1518节点，
即同时存在两套完整图标节点规模。代码ghostFactory复用完整IconNode，包含预建的编辑按钮、
标记、标签过渡等；全文件夹页以static-real挂载。Text数量不是已栅格化纹理数量。
实测CPU RGBA始终0，文字活跃纹理0.9→1.67MiB，池约1.38MiB，不能解释成又堆了100MiB图片。
瞬时约95MiB尚未分配栈精确归因；节点/ghost和场景准备是已见成本，不能把整笔全归JS对象。

## 建议修复边界

1. 在真实几何/进度改变时刷新边界，终止稳态自激排帧；不能全局禁用afterFrame或隐藏错误状态。
2. 启动/关闭动画最后一帧之后清理文件夹会话与场景，不等下次显示；处理隐藏中断/快速重开竞态。
3. 加静置和隐藏回归，断言动画+afterFrame任务真正归零，且启动/重开/命中边界行为正确。
4. 瞬时峰值另做完整ghost/预建控件的隔离，不以本次循环修复冒称打开峰值也已消除。

四次实例正常退出：25920原版、6640隐藏reset、33296回调计数+reset、7564去重复帧。
证据`.codex-dev/paired-memory/new-folder-{1,reset-2,reset-3,quiet-4}/`的samples.json、逐阶段map、
launched.txt、run.log、final.png；build.ts/run.mjs包含探针。所有产品源码保持4913cd8。
