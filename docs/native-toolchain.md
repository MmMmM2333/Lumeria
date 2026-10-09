# Windows Native 工具链与首次构建

Lumeria 的 Native 运行支持随本仓库维护。按本文准备 SDK 即可构建，目前支持 Windows x64。

## 开发工具

| 工具 | 要求 |
| --- | --- |
| Node/npm | 建议 Node 26.x、npm 11.x；已验证环境为 Node 26.5.0、npm 11.17.0 |
| Rust | `x86_64-pc-windows-msvc` 工具链及 Cargo；已验证版本为 1.97.1 |
| MSVC | Visual Studio C++ Build Tools、Windows SDK；Rust 链接和 CRT 暂存需要它 |
| Zig | **0.16.0**；放入 PATH，或通过 `LUMERIA_ZIG` 指定 `zig.exe` |
| NSIS | **3.11**；仅制作安装器需要，通过 PATH 或 `LUMERIA_NSIS` 指定 `makensis.exe` |
| tar | Windows 自带 `tar.exe`，用于清单检查及离线包解压 |
| Git | 获取源码及维护者重建 SDK 时需要 |
| PowerShell 7 | 执行 `scripts/rebuildElectrobunDevkit.ps1` 时需要 |

普通产品构建不要求全局 Bun。Electrobun npm 启动器配对 Hutch 0.24.3，由 Hutch 获取工具链清单指定的 Bun 1.4.2。不要通过升级全局 Bun 改变应用运行时。

## 首次准备

在仓库根目录执行：

```powershell
npm ci
npm run native:prepare:source
npm run native:toolchain:check
npm run native:dev
```

源码准备额外需要 Bun 1.4.x、CMake 和 PowerShell 7。命令克隆固定上游到 `build/electrobun-source`，核对提交、应用补丁、编译、打包并逐文件校验，校验通过后安装到应用使用的 SDK 目录。

复用专用源码目录时使用 `npm run native:prepare:source -- --source build/electrobun-source`。该目录必须位于项目 `build` 或 `.codex-dev` 内；请使用专用源码副本，避免影响正在开发的上游仓库。上游构建会下载第三方预编译依赖，并非所有组件都从源码编译。

本地选择记录位于 Starter 的 `.hutch/native-toolchain.local.json`，绑定官方锁文件哈希，不进入 Git。构建和类型检查共用这个 SDK；本地编译结果通过该记录校验，官方锁保持不变。

切换前先验证候选，原 SDK 与记录保留在 `.hutch/activate-*/previous-sdk` 和 `previous-lock.json`；切换失败尝试回滚。先关闭使用该 SDK 的进程。若中断留下 activation lock，确认没有运行中的准备进程后再清理，不自动抢占。

### 使用预编译附件

官方附件由 `native-toolchain.lock.json` 固定大小、哈希和文件清单；当前 `archive.url` 未配置，不能直接公开下载。已有匹配附件时运行：

```powershell
npm run native:prepare -- --archive C:\Downloads\lumeria-toolchain-electrobun-2.0.1-win-x64-r4-tray-recovery.tar.gz
npm run native:toolchain:check
```

也支持 `native:prepare -- --url <HTTPS地址>`，内容仍须匹配官方锁。显式导入官方包会验证后备份当前 SDK，再移除本地选择记录；不带参数的 prepare 保留已选中的有效本地 SDK。

`npm ci` 只安装 npm 依赖并应用 Pixi 补丁，不隐式构建 SDK。准备 SDK 后才能执行 Native 类型检查和完整 `npm run check`。原生桥接 DLL 由 Starter 的独立 Cargo crate（`native/frame/Cargo.toml`）按需构建，edition、链接参数和测试随 crate 维护；手动构建可用 `npm run native:host:build`。工具不会为覆盖已加载 DLL 自动结束用户实例。`npm run test:native-frame` 可独立运行桥接测试；构建记录同时校验 Cargo 清单、锁文件、构建脚本和 Rust 源码。应用自己的触发角 DLL 属于根 Rust workspace，由 `native:dev`／`native:build` 自动构建和复制。

## 清单、来源与本地记录

| 内容 | 保存位置 | 修改方式 |
| --- | --- | --- |
| 应用与 Starter 当前源码 | 当前 Git 提交 | 正常代码审查 |
| 上游 C++/SDK 变更 | `vendor/electrobun-pixi-native-starter/patches/` | 对固定官方提交维护可审查补丁 |
| 固定 SDK 与附件 | `vendor/electrobun-pixi-native-starter/native-toolchain.lock.json` | 维护者显式更新、审阅后提交 |
| 当前原生桥接构建 | `vendor/electrobun-pixi-native-starter/.hutch/native-frame/build.json` | 自动生成；记录源码哈希、编译器和二进制哈希，不提交 |
| 导入时 Starter 来源 | 同目录 `starter-manifest.json` | 历史记录，普通构建不再改写，不作为当前源码完整性依据 |
| 本地验证与打包产物 | `artifacts/`、`.codex-dev/` | 忽略，不混入源码分发 |

当前 r4 SDK 包含 461 个文件，Electrobun 上游固定为 `8d09d15db791f346e419efd452d6759750addb62`（官方 v2.0.1）。Windows DComp、输入及托盘恢复补丁保存在仓库，Bun 声明固定 1.4.2，WebGPU SDK 投影补丁保存在 tools/patch-electrobun.mjs。SDK 保留完整上游组成（含当前 Native 产品未使用的 CEF 和其他语言 SDK），运行日志 app.log 不进入附件。

校验通过表示文件与锁定附件一致。源码重建、应用构建和发行验收是不同检查；发布前还需核对实际分发内容和第三方许可材料。

## 制作离线附件

已有 SDK 必须先满足当前锁定清单。指定一个尚不存在的输出目录：

```powershell
npm run native:toolchain:pack -- --output artifacts/toolchain-candidate
```

运行后，候选附件和清单会生成到指定的 `artifacts/toolchain-candidate` 目录。

生成压缩包、文件列表和候选 `native-toolchain.lock.json`。不会改写已提交清单，也不会上传。压缩包哈希与文件时间戳相关，重新打包不保证得到相同字节；发布时使用与锁文件对应的那一份附件，不覆盖已发布附件。

维护者应审查候选内容、来源和验证结果，再显式采用候选锁文件。普通构建不能通过重写清单来接受漂移的文件。

## 维护者分步重建 SDK

日常开发使用前面的 `native:prepare:source`。以下流程用于检查上游构建或制作分发候选，不自动选择 SDK。

该流程下载上游固定的 Dawn、CEF、Zig 等构建依赖，耗时和磁盘需求明显高于普通应用构建。需要额外安装 Bun 1.4.x 作为上游构建脚本执行器，以及 CMake。上游脚本会编译 Electrobun 原生组件，但其中的第三方库仍按上游方式获取，不能称为所有第三方库均从源代码构建。

先准备根目录 npm 依赖，再在专用构建目录克隆固定提交：

```powershell
npm ci
git clone --depth 1 --branch v2.0.1 https://github.com/blackboardsh/electrobun.git build/electrobun-source
pwsh -NoProfile -File scripts/rebuildElectrobunDevkit.ps1 -SourceDirectory build/electrobun-source
```

脚本检查实际 HEAD，而非仅信任标签；应用现有补丁，以 `bun build.ts` 调用官方构建入口，固定应用 Bun 声明并应用 SDK 投影补丁。CMake 可以来自已安装的 MSVC Build Tools；缺少前提时报告错误。脚本设置上游的非交互标记，避免其请求管理员权限安装系统工具；不修改全局 PATH。上游会清理其自身构建目录，所以这里只接受本仓库 `build/` 或 `.codex-dev/` 下的专用 checkout，不接受链接路径。

成功后生成 `package/dist/` 和 `lumeria-build-environment.json`；当前安装的 SDK 与锁文件保持不变。为新编译器产物选择新的工具链 id，然后生成候选包：

```powershell
npm run native:toolchain:pack -- --source build/electrobun-source --id lumeria-toolchain-electrobun-2.0.1-win-x64-candidate --output artifacts/toolchain-candidate
```

候选中包含新的 SDK 文件清单、源码 diff 哈希、源码差异和构建环境记录。因为编译器、构建目录和生成文件可能不同，新二进制不要求与官方附件字节相同；本地开发通过选择记录使用它，不修改官方锁。用于正式分发时，先验证 ABI、实际应用行为与运行时版本，再审阅和更新锁文件。

原生桥接 DLL 与上游 SDK 不同：它直接从仓库源码构建，已有本地构建凭据，不需要为每次修改发布整套 SDK。

## 代理与首次下载故障

Hutch 会读取 `HTTP_PROXY` / `HTTPS_PROXY`。遇到 `ReleaseDownloadFailed` 时，先检查网络和代理；Node 下载成功不代表使用代理的 Hutch 也能下载。可以在新的 PowerShell 窗口中临时去掉代理变量后重试：

```powershell
Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY, Env:ALL_PROXY -ErrorAction SilentlyContinue
npm run native:build
```

这只影响该窗口及子进程，关闭窗口即可；不要修改系统代理，也不要关闭 TLS 或文件哈希校验。工具本身不自动删除用户的代理配置。无法直连时应修正代理路由，保持下载来源和完整性校验可追溯。

## 产品安装包

```powershell
npm run native:release
# 或显式选择字节码
npm run native:release:bytecode
```

以上还需要 NSIS 3.11 与 MSVC CRT；路径变量和安装器说明见 [Windows 发行说明](windows-release.md)。ESM 为默认。源码构建通过不代表 UI、安装/卸载或升级已验收，应针对具体候选产物完成相应验证。

## 原生补丁边界

启动隐藏需要 `GpuWindow` 的 `hidden` 参数投影补丁，底层 ABI 已支持该能力。已有 r3 SDK 请通过 `native:prepare:source` 重建并选择本地 SDK；不要手工修改受清单保护的缓存文件。`check:pixi-patch` 同时检查该映射，以及 Pixi 文字恢复和深度模板整数尺寸补丁。

DComp 合成桥接和 CopySrc surface 是固定 SDK 补丁的一部分。构建应使用匹配的源码、补丁和锁文件，不能通过手工替换缓存 DLL 跳过校验。CopySrc 按设备实际能力启用，不支持时保留回退，详见[渲染说明](rendering.md)。Live Desktop 的宿主边界见[实现说明](native-live-desktop.md)。

托盘恢复包含在 r4 SDK 中：隐藏顶层窗口接收 Windows 的 TaskbarCreated 通知后，重新注册原图标；若任务栏暂未就绪，每秒重试直到成功，移除托盘时同步清理窗口与定时器。Windows 决定图标在托盘或折叠菜单的位置。使用旧 SDK 的开发环境需通过 native:prepare:source 重建，或导入与当前锁匹配的 r4 附件。

## 构建格式

ESM 是默认格式，`npm run native:build:bytecode` 提供可选的 CJS 字节码构建。两者共用输出目录，后运行的构建会覆盖产物。已有对照没有显示 bytecode 能稳定降低内存，不应把它当作省内存开关。安装包命令见 [Windows 发行指南](windows-release.md)。
