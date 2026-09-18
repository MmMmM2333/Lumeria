# Windows Native 工具链与首次构建

Lumeria 将 Starter 作为本仓库内部运行支持维护。无需克隆另一个 Starter 仓库；也无需复制作者的 `.hutch`、`.codex-dev` 或已安装应用。当前产品只支持 Windows x64 构建。

## 开发工具

| 工具 | 要求 |
| --- | --- |
| Node/npm | 建议 Node 26.x、npm 11.x；阶段二验证环境为 Node 26.5.0、npm 11.17.0 |
| Rust | `x86_64-pc-windows-msvc` 工具链及 Cargo；阶段二验证版本为 1.97.1 |
| MSVC | Visual Studio C++ Build Tools、Windows SDK；Rust 链接和 CRT 暂存需要它 |
| Zig | **0.16.0**；放入 PATH，或通过 `LUMERIA_ZIG` 指定 `zig.exe` |
| NSIS | **3.11**；仅制作安装器需要，通过 PATH 或 `LUMERIA_NSIS` 指定 `makensis.exe` |
| tar | Windows 自带 `tar.exe`，用于清单检查及离线包解压 |
| Git | 获取源码及维护者重建 SDK 时需要 |
| PowerShell 7 | 执行 `scripts/rebuildElectrobunDevkit.ps1` 时需要 |

普通产品构建不要求全局 Bun。Electrobun npm 启动器配对 Hutch 0.24.3，由 Hutch 获取工具链清单指定的 Bun 1.4.2。不要通过升级全局 Bun 改变应用运行时。

## 首次准备

从仓库根目录运行：

```powershell
npm ci
npm run native:prepare -- --archive C:\Downloads\lumeria-toolchain-electrobun-2.0.1-win-x64-r1.tar.gz
npm run native:toolchain:check
npm run check
npm run native:build
```

`npm ci` 只安装锁定 npm 依赖并应用 Pixi 补丁，不在安装脚本里隐式下载整个 Native SDK，也不要求已经有 SDK。准备 SDK 后才能进行 Native 类型检查和完整项目检查。

当前工具链附件**已经在本地准备，但尚未对外发布**，锁文件的 `archive.url` 为 null，不能声称新用户已经能从公开地址下载。维护者阶段二产物位于 `artifacts/open-source-stage2/toolchain-r1-final/`。正式发布时应上传已校验的附件并补入真实不可变 URL，不能填一个尚不存在的下载地址。

发布 URL 配置后可直接使用 `npm run native:prepare`。也支持显式 HTTPS 地址：

```powershell
npm run native:prepare -- --url https://example.org/releases/toolchain.tar.gz
```

此处是命令示意，不是本项目下载地址。地址只是传输位置，内容仍必须匹配仓库锁定的大小、SHA-256 和逐文件清单。带凭据 URL、非 HTTPS、超长下载、损坏包、重复路径、路径穿越、链接及未列入清单的文件都会被拒绝。已有不同/损坏的 SDK 不会自动覆盖；应保留供调查，在新的源码目录安装。

SDK 安装完成后从当前 `native-frame.rs` 编译本地 DLL。修改原生桥接源码后，运行 `npm run native:host:build`；`native:build`、`native:dev` 的消费者入口也会检查源码并按需重建。请先关闭使用该 DLL 的开发实例，Windows 不允许覆盖加载中的 DLL。工具不会为了替换 DLL 结束用户实例。

## 清单、来源与本地记录

| 内容 | 权威位置 | 修改方式 |
| --- | --- | --- |
| 应用与 Starter 当前源码 | 当前 Git 提交 | 正常代码审查 |
| 上游 C++/SDK 变更 | `vendor/electrobun-pixi-native-starter/patches/` | 对固定官方提交维护可审查补丁 |
| 固定 SDK 与附件 | `vendor/electrobun-pixi-native-starter/native-toolchain.lock.json` | 维护者显式更新、审阅后提交 |
| 当前原生桥接构建 | `vendor/electrobun-pixi-native-starter/.hutch/native-frame/build.json` | 自动生成；记录源码哈希、编译器和二进制哈希，不提交 |
| 导入时 Starter 来源 | 同目录 `starter-manifest.json` | 历史记录，普通构建不再改写，不作为当前源码完整性依据 |
| 本地验证与打包产物 | `artifacts/`、`.codex-dev/` | 忽略，不混入源码分发 |

r1 来源为已有 Starter 0.3.4 的 SDK，已对原清单的 462 个条目逐个核实，其中 app.log 作为运行记录排除，最终分发 461 个 SDK 文件。Electrobun 上游固定为 `8d09d15db791f346e419efd452d6759750addb62`（官方 v2.0.1），C++ DComp/输入补丁保存在仓库，Bun 声明固定 1.4.2，WebGPU SDK 投影补丁保存在 `tools/patch-electrobun.mjs`。r1 保留完整导入 SDK（含当前 Native 产品未使用的 CEF 和其他语言 SDK）；不在本阶段裁剪底层组成以避免改变现有构建行为。运行日志 `app.log` 不进入附件。

内容校验只证明与锁定附件一致，不证明这些导入二进制在本轮由源码重新构建。源码重建和应用构建分别记录结果。许可证清单与原生第三方再分发材料由开源准备阶段三完成；当前附件不能提前视为已获正式发行验收。

## 制作离线附件

已有 SDK 必须先满足当前锁定清单。指定一个尚不存在的输出目录：

```powershell
npm run native:toolchain:pack -- --output artifacts/toolchain-candidate
```

生成压缩包、文件列表和候选 `native-toolchain.lock.json`。不会改写已提交清单，也不会上传。压缩包哈希与文件时间戳相关，重新打包不保证得到相同字节；发布时使用与锁文件对应的那一份附件，不覆盖已发布附件。

维护者应审查候选内容、来源和验证结果，再显式采用候选锁文件。普通构建不能通过重写清单来接受漂移的文件。

## 从官方源码重建 SDK

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
npm run native:toolchain:pack -- --source build/electrobun-source --id lumeria-toolchain-electrobun-2.0.1-win-x64-r2 --output artifacts/toolchain-r2
```

候选中包含新的 SDK 文件清单、源码 diff 哈希、源码差异和构建环境记录。因为编译器、构建目录和生成文件可能不同，新二进制不要求与 r1 字节相同；必须按新版本验收，不能静默改写 r1 的哈希。采用前在新的源码目录安装候选包、验证 ABI/实际应用行为与运行时版本，再审阅和更新锁文件。

原生桥接 DLL 与上游 SDK 不同：它直接从仓库源码构建，已有本地构建凭据，不需要为每次修改发布整套 SDK。

## 代理与首次下载故障

Hutch 的网络客户端会读取 `HTTP_PROXY` / `HTTPS_PROXY` 等环境变量。阶段二实测中，继承本机代理时固定 Cottontail 0.5.0 下载报 `ReleaseDownloadFailed`；仅对测试子进程移除代理变量后，同版本下载与上游完整性校验成功。该错误来自 HTTP 非 2xx 响应，不能一概归因于沙箱、缺失附件或校验失败。Node 直接下载成功也不代表使用环境代理的 Hutch 能成功。

先检查代理日志和官方固定版本地址。若确认是代理路径问题，并且网络允许直连，可以在**新开的构建 PowerShell 窗口**中临时清除环境代理，再执行构建：

```powershell
Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY, Env:ALL_PROXY -ErrorAction SilentlyContinue
npm run native:build
```

这只影响该窗口及子进程，关闭窗口即可；不要修改系统代理，也不要关闭 TLS 或文件哈希校验。工具本身不自动删除用户的代理配置。无法直连时应修正代理路由，而不是复制某个未知本机缓存来假装首次构建通过。

## 产品安装包

```powershell
npm run native:release
# 或显式选择字节码
npm run native:release:bytecode
```

以上还需要 NSIS 3.11 与 MSVC CRT；路径变量和安装器说明见 [Windows 发行说明](../release/windows/README.md)。ESM 为默认。源码构建通过不代表 UI、安装/卸载或升级已验收，应针对具体候选产物完成相应验证。
