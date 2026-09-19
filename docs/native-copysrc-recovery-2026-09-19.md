# Native DComp CopySrc修复与工具链r3

## 提交前整理（2026-09-19）

以下专项记录保留当时的基线与限制。后续搜索/选择、全屏 DPI 和设置应用修复的完整 Native smoke 均在本工作区 r3 工具链上运行通过；最近一次为 `artifacts/settings-apply-flash/native-smoke.log`（195 帧拖拽，设置保存/失败重试、文件夹与隐藏恢复）。这些后来结果不覆盖下文未复现的 1070Ti 故障。

本次整理重新核验 `native:toolchain:check`、离线附件大小/SHA-256，并补跑压力测试参数/汇总、隔离控制及 surface usage 单测。工具链附件仍仅在本地，未上传；离线准备步骤见 `docs/native-toolchain.md`。后文“未重跑全套”等陈述属于原专项时间点，不是最新整体验证状态。

提交前 surface-copy 实机补验：`artifacts/native-stress/2026-09-19T14-34-23-676Z-17544`，200 图标，3 次恢复/模式切换及透明、最小化恢复、工具条像素断言通过，exit 0；工具条截图已查看。记录到 12 条已有 Pixi BindGroup bufferResource 销毁警告，没有隐藏或认定已修复。专项单测在本机 Bun 1.4.0 下 3 项/13 断言通过；产品实测使用工具链固定的运行时。

## 改变与原因

Windows DComp共享纹理原先硬编码CopyDst|RenderAttachment，Pixi请求的CopySrc没有落到实际纹理。批量管理为背景取样另开整页AlphaFilter，1920×1080下变成2048²中间目标及MSAA/depth附件，首次WC阶跃约208.5MiB。

补丁将surface configure usage传入共享纹理创建，并与SharedTextureMemory支持用途取交集；必要的RenderAttachment缺失则保留已有构建失败/回退流程。用途加入表面代次匹配，避免相同尺寸但用途改变时复用旧纹理。SDK在getCurrentTexture后读取wgpuTextureGetUsage，公开实际usage而非请求值。

产品通过NativePixiApplication.surfaceTextureUsage判断CopySrc：支持时由Pixi直接做工具条区域背景复制，不启用整页AlphaFilter；未知/不支持时保留旧路径。模糊shader、工具条视觉及MSAA设置未降低。native-frame ABI未变。

## 工具链

已规范重建、打包并采用r3-copysrc。固定上游Electrobun2.0.1 commit8d09d15db791f346e419efd452d6759750addb62，461files，相对r2仅libNativeWrapper.dll与api/sdks/main/webgpuAdapter.ts变化。其余Dawn/Bun等二进制未升级。

附件：artifacts/toolchain-r3-copysrc/lumeria-toolchain-electrobun-2.0.1-win-x64-r3-copysrc.tar.gz，SHA256 d1bc3f1e20477ad3168b429a174a500884c33f5717d8df39f4cbee885f169780；patch/source diff SHA256 0a4e53a3941ee0fb505edd88304e8e31df31a9f6703bd486a88b3a11a5e060b3。目录内保留source.diff、build-environment与完整清单。未上传，archive.url仍null。

旧SDK与锁保留.codex-dev/render-corruption/sdk-r2-before-copysrc及r2-native-toolchain.lock.json。实际源码补丁在vendor，普通开发通过锁校验，不靠手改缓存DLL。SDK投影工具兼容新增用途观察行，正式构建与check均通过。

## 证据

- 独立DLL探针：支持用途0x17，新实际0x13（仅探针主动请求RenderAttachment/CopyDst/CopySrc）；移除副本stage Alpha后selection正常。正式原生层按请求得到0x17。
- 800图标selection四轮：artifacts/native-stress/2026-09-18T20-25-34-318Z-31224。WC329.23→333.23MiB，仅+4；首次空选择不增。旧r2同条件约+208.5首次阶跃，4轮约+216.5。JS堆与普通RW仍有别的分配，不宣称全部内存问题解决。
- surface-copy专项：2026-09-18T20-23-04-759Z-33400；windowed/fullscreen/windowed、3次device loss，恢复后usage0x17且stage.filters为空；工具条条纹模糊像素方差断言与MSAA边缘（无MSAA0、有MSAA61部分覆盖像素）通过，系统截图已查看。
- 附件补验：2026-09-18T20-28-38-139Z-35796，三次恢复后没有height>512的antialias空闲池纹理；避免恢复瞬间回退留下旧大表面。
- 旧DLL回退：2026-09-18T20-30-29-519Z-30184，新bundle在独立副本使用旧r2 DLL，实际usage0x12，自动保留2048²中间目标，选择测试通过。未覆盖当前r3安装。
- 混合四轮：2026-09-18T20-32-27-943Z-2996，800图标、文件夹创建解散/翻页/显隐/4次设备丢失通过。退出日志一次WM_CLOSE/DestroyWindow error1400（句柄已不存在），进程正常退出；未将其计作完全无警告。
- 最终扩展专项：2026-09-18T20-34-21-941Z-48280，补760×540/1040×700实际resize、透明背景、最小化恢复，结果另见目录result与截图。

测试：scene、完整domain/布局边界、native/tools类型、native release/许可证测试、toolchain7项、surface context3项、stress/isolation、policy通过。现有Pixi BufferResource teardown警告在device loss中仍存在，本轮未修改/隐藏。全量native smoke此前设置按钮问题未重跑，不冒称全套端到端通过。

本地许可证审计artifacts/copysrc-license-audit已生成251records，仍有14个既有advisory，未发布工具链或产品。未生成安装器。

## 边界

实际能力按设备读取，CopySrc支持不作全平台承诺。测试机器RTX3060 Laptop，原1070Ti上的大三角形与约748MiB WC总增量未复现，不能称根因已全部修复。透明路径测试覆盖当前Native窗口和本机DWM，不替代多GPU/多DPI、多显示器或LiveDesktop所有场景。
