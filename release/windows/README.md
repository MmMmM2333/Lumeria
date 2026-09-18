# Windows 独立发行

Windows x64 产品入口为 `Lumeria.exe`，安装与升级由本目录的 NSIS 脚本管理。
产品名、标识和版本分别来自 `src/platform/product.ts` 与根目录 `package.json`。

## 构建

首次克隆先按 [Native 工具链指南](../../docs/native-toolchain.md) 完成 `npm ci` 和
`npm run native:prepare -- --archive <固定工具链附件>`。当前工具链附件尚未对外发布；
构建不再依赖作者未登记的本机 SDK，也不会在 npm 安装脚本中隐式构建 Starter。

```powershell
npm run native:release           # ESM，默认正式安装包
npm run native:release:bytecode  # 可选 CJS + 字节码安装包
```

流水线也可逐步运行：

```powershell
npm run native:build
npm run native:stage
npm run native:package
```

Rust 使用根目录 Cargo workspace 与 `Cargo.lock`。`native:build` 的前置步骤只构建
`lumeria-native-data` 包，产物为 `target/release/lumeria_native_data.exe`，暂存到
运行包时命名为 `lumeria-native-data.exe`。旧 Tauri 宿主仍作为独立 workspace 成员保留，
不参与 Native 数据服务构建。`npm run test:native-data` 运行共享核心/协议测试，并使用
真实 release 数据服务与 TS 客户端验证隔离数据读写和通信。
暂存后可运行 `npm run test:native-staged`，检查手动/登录启动后立即退出、保存、
单实例释放及运行日志中的隐藏异常。它不安装产品、不修改真实用户数据，也不替代 UI 验收。

构建工具要求 Node/npm、Rust 的 Windows MSVC 工具链、Zig **0.16.0**、NSIS **3.11**。
用户安装后不需要这些开发工具。Zig 可通过 `LUMERIA_ZIG` 指定，也可放在
`.codex-dev/toolchains/zig-x86_64-windows-0.16.0/`。NSIS 可通过 `LUMERIA_NSIS`
指定；现有 Tauri NSIS 缓存也会被识别。Visual C++ x64 运行库从已安装的 MSVC
Redistributable 目录复制，亦可用 `LUMERIA_VC_REDIST` 指向 `Microsoft.VC14x.CRT`。
它们以应用本地 DLL 的方式分发，不安装系统运行库或请求管理员权限。

输出：

- `build/electrobun-artifacts/`：当前构建适配器产生的中间压缩包。
- `release/staging/windows-x64/Lumeria/`：已展开、可直接启动的完整产品目录。
- `release/staging/windows-x64/Lumeria.files.json`：暂存文件清单及 SHA-256；制作安装器前重新校验。
- `artifacts/Lumeria-<version>-x64-Setup.exe`：独立安装包。
- 同名 `.exe.sha256` / `.exe.json`：最终安装包校验信息。

暂存步骤只接受经过验证的完整应用归档，拒绝路径穿越、链接和特殊文件。
正式安装包拒绝诊断构建和测试替身。当前构建不进行 Authenticode 签名，产物清单明确标记
`signed: false`；以后接入签名时，应先签名，再生成最终校验信息。

暂存步骤只附带 `licenses/third-party/THIRD_PARTY_NOTICES.md` 和 `LICENSES.txt`，
按 Native 包内容收集声明并合并原文。完整依赖盘点可独立生成到 `artifacts/`；
待核项不阻塞打包，实际再分发义务仍按相关许可处理。见 [许可材料说明](../../legal/README.md)。

## 安装和使用

```text
%LOCALAPPDATA%\Programs\Lumeria\
  Lumeria.exe
  lumeria.json
  install.ini
  uninstall.exe
  licenses\
  runtime\
    bin\LumeriaRuntime.exe
    bin\*.dll
    control.js
    Resources\app\bun\...
```

首次安装可以选择空目录。后续安装器识别已有目录，支持同版本重装和向上升级；迁移安装
位置时，应先卸载并保留数据。默认只操作当前用户的快捷方式、卸载项和自启动项。

业务数据仍在 `%APPDATA%\com.lumeria.app`。日志（包括原生库的 `app.log`）位于其
`logs` 子目录。运行时不向产品目录写日志。自启动只对已登记、具有完整安装记录的产品
可用，始终指向根目录 `Lumeria.exe`；开发和隔离环境不注册系统自启动。

安装器先展开新文件，随后通过产品控制接口请求旧程序保存并退出。目录替换失败时恢复
旧版本。升级只清理旧版拥有的文件；未知文件保留在旁边的旧目录，并记录位置。正常启动
在安装事务期间被阻止，避免与文件替换竞争；状态查询和受控退出仍可运行。

卸载默认保留数据。交互卸载中的数据删除选项默认不勾选；静默卸载也保留数据。
明确指定 `/PURGEDATA` 才清理本产品的数据目录，并在递归删除前检查目录链接。

```powershell
# /D 必须是最后一个参数；NSIS 将剩余文本作为完整目录。
Lumeria-0.1.0-x64-Setup.exe /S /D=C:\Users\example\Apps\Lumeria
uninstall.exe /S
uninstall.exe /S /PURGEDATA
```

`Lumeria.exe --lumeria-status` 返回本机实例状态；`--lumeria-shutdown` 请求保存后退出并
等待运行时及其启动器结束。控制接口以用户数据目录隔离，通过私有会话凭据验证请求；
它不会根据不可信 PID 任意结束进程。`--lumeria-autostart` 启动到托盘，也不会唤醒已有窗口。

## 旧预览版的一次性迁移

此前 Electrobun 预览版在 Windows 中名为 **LaunchPad Native**，安装身份为
`dev.lumeria.launchpad-native.stable`。正式安装器发现这个旧身份时会停止并提示：先从
Windows“已安装的应用”卸载旧预览版并保留数据，再运行新安装包。

两版业务数据均使用 `%APPDATA%\com.lumeria.app`，无需搬迁布局、图标和背景。新安装器
不擅自执行旧卸载器，也不维护已废弃安装格式的长期更新协议。显式使用
`LUMERIA_NATIVE_DATA_DIR` 的隔离测试不共享旧版数据，因此可以在保留旧测试环境时验证新包。

## 验证

```powershell
npm run check
npm run test:native-launcher
npm run test:native-installer
npm run test:native-product
npm run native:smoke
```

若 `Alt+Space` 被正在运行的应用占用，可使用既有
`npm run native:smoke -- --smoke --settings-only` 验证其余路径，并单独记录该物理快捷键未验证。

后两项安装测试需要可交互的 Windows 桌面，并且不能已经登记另一份独立 Lumeria 安装。
测试安装在项目 `.codex-dev` 中，保存并恢复当前用户相关快捷方式和自启动值；真实业务
数据不参与测试。测试证据、日志及界面截图保留在各自的测试目录。

安装器测试验证真实 NSIS 安装/升级/恢复/卸载，使用小型程序替身和隔离数据。产品测试
使用真正的安装包，验证 GPU、数据服务、本地 CRT 加载、单实例、托盘重启、自启动、
运行中重装和界面。`--ui-only` 可在其他代码未变时只补验界面与卸载。

可针对另一份暂存目录单独验证启动与退出：

```powershell
node --import tsx scripts/smokeWindowsRuntime.ts .codex-dev/windows-bytecode-runtime
```

实施状态和最终证据以 `docs/windows-release-plan.md` 为准。

## 跨平台边界

产品身份、版本、数据路径策略、单实例/退出协议和构建/暂存/安装器分工已经独立。
TS / Rust 的数据路径分别支持 Windows、macOS Application Support 和 Linux XDG 规则。
macOS / Linux 尚未具备可运行的 Native 宿主、安装器或自启动适配；不会因此声称已能构建它们。

当前 `runtime` 内保留完整 Electrobun 运行内容，以维持现有 GPU、资源和字节码加载行为；
旧构建启动器与卸载管理器不进入产品包。未来替换宿主时，调整构建适配器和内部运行时，
保持产品入口、安装身份及数据位置。macOS 应单独产出标准 `.app`，在对应平台实现签名、
公证与 Login Item；这些不复用 Windows 的物理目录布局。
