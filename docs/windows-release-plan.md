# Windows 独立发行实施记录

本文件是本次工作的权威状态记录。Windows x64 的安装、启动、升级、重启、自启动和卸载改造已落实；验证完成，环境边界列在下方。默认交付为 ESM。使用说明见 [Windows 发行说明](../release/windows/README.md)。

## 产品约定与结果

- 名称 `Lumeria`，标识 `com.lumeria.app`，版本来源 `package.json`，当前通道 `stable`。
- 当前用户安装，默认 `%LOCALAPPDATA%\Programs\Lumeria`，长期入口为根目录 `Lumeria.exe`。
- 业务数据保留在 `%APPDATA%\com.lumeria.app`，升级和默认卸载保留数据；日志统一到其 `logs` 子目录。
- 产品入口负责运行时启动、参数、退出码及安装期间的启动保护；应用负责单实例、激活和保存守卫。安装器通过受控退出接口等待程序及启动器退出后替换文件。
- Electrobun 保留为内部运行时。其构建/开发适配器保留并注明退出条件；旧启动器与卸载管理器不进入独立产品包。
- 构建、完整目录整理和 NSIS 打包分开。中间产物位于 `build/electrobun-artifacts`，最终程序目录位于 `release/staging/windows-x64/Lumeria`。
- Visual C++ 14.51.36231 x64 运行库随应用分发。已检查真实进程模块，确认主程序和 Rust 数据服务使用包内 DLL。
- 安装器支持中文/空格路径、同版本重装、新版升级、失败恢复、拒绝降级、交互/静默卸载。未知文件保留，数据清理需明确选择，并检查目录链接。
- 旧 Electrobun 预览版采用一次性迁移：安装器提示先卸载 `LaunchPad Native` 并保留数据。本次没有卸载用户已有预览版。
- TS / Rust 数据路径规则已覆盖 Windows、macOS Application Support 和 Linux XDG；macOS/Linux 的原生宿主、安装器和自启动实现留待对应平台实施。

## 交付产物

- 安装包：`artifacts/Lumeria-0.1.0-x64-Setup.exe`
- 大小：49,007,868 bytes，约 46.74 MiB。
- SHA-256：`798edde14d1ca43b2a4fbbaa085d0bafbda6976d30aae03b37cd59d44530ea35`
- 同名 `.exe.sha256` / `.exe.json` 与实际文件复核一致。
- 默认目录的 `lumeria.json` 确认为 `format: esm`、`diagnostics: false`。
- 当前未进行 Authenticode 签名，清单标记 `signed: false`。

生成命令：

```powershell
npm run native:release
# 可选字节码版本：
npm run native:release:bytecode
```

## 验收证据

| 项目 | 结果 / 证据 |
| --- | --- |
| 项目完整检查 | `npm run check` 通过：单元测试、三组 typecheck、源码策略、i18n 和 Vite build |
| Rust | 185 项 lib 测试通过；3 项已有系统集成用例按原标记忽略 |
| Zig / 产品入口 | `zig build test` 及 `testWindowsLauncher.ts` 通过；覆盖 Unicode 路径、工作目录、参数、非法清单与完整 Windows 退出码 |
| NSIS 生命周期 | `.codex-dev/windows-installer-test-0B0efu/proof.json`：首次安装、同版重装、新版升级、旧文件清理、失败恢复、降级拒绝、卸载保留/明确清除隔离数据通过 |
| 真实应用流程 | `.codex-dev/windows-product-test-J0pQUP/proof.json`：主程序与数据服务使用包内 CRT；单实例、实际托盘重启、自启动、运行中重装、日志外置和安装锁通过 |
| 最终安装器与 UI | `.codex-dev/windows-product-test-Yffjo9/proof.json`：最终品牌图标、目录自动识别、安装/卸载界面、默认数据选项、真实卸载无程序残留通过；截图已人工查看 |
| Native 回归 | `npm run native:smoke -- --smoke --settings-only` 通过；日志 `.codex-dev/windows-release-native-smoke-settings.log`，包含 GPU 恢复、输入、文件夹、设置、托盘、窗口与持久化验证 |
| 字节码 | `native:build:bytecode` 与独立暂存通过；`.codex-dev/runtime-smoke-b930AQ/proof.json` 验证字节码哈希、GPU 首帧和正常退出 |
| 旧预览版保护 | `.codex-dev/legacy-install-guard-33986ff1/proof.json`：正常用户环境下正确拒绝旧预览版共存，未创建新的程序目录 |
| 系统状态恢复 | 最终逐项对照最初 `.codex-dev/windows-installer-test-0Rx850/system-state.json`，自启动值/类型、快捷方式存在性与文件哈希一致；测试安装与卸载注册表项已移除 |
| 最终文件 | 安装包大小、SHA-256 和两份校验清单一致；`git diff --check` 通过 |

## 验证边界

- 默认 Native smoke 的物理 `Alt+Space` 用例因已有程序占用而返回 Windows 1409。保留原始失败日志 `.codex-dev/windows-release-native-smoke.log`；使用已有 `--settings-only` 选项跑完其余回归，没有删除断言或更改用户快捷键。
- 当前没有混合 DPI 显示器，相关迁屏用例按已有测试逻辑跳过；窗口缩放、恢复及当前 DPI 路径通过。
- 验证在当前 Windows x64 桌面进行，未声称已在全新虚拟机或其他操作系统运行。包内 CRT 的实际加载路径已核对。
- 当前安装包未签名；签名、公证、发布服务器和自动更新不属于本轮实施范围。
- `J0pQUP` 的目录页文本断言受末尾分隔符影响，后续规范化后在 `0SEdqV`、最终 `Yffjo9` 中通过；有效的运行时验证按代码和环境未变化复用。

## 清理与保留

- 原根目录的 Electrobun ZIP、更新归档和更新清单已归档到 `build/electrobun-artifacts/legacy-preview`。正式输出区保留新的独立安装包及其校验信息。
- 批量删除失败测试安装被工具策略拦截，已采用保留文件的安全替代：将四次失败测试的程序目录及相关旧目录归档到 `build/release-test-archives`。这些副本不是发行入口，未宣称已释放其磁盘空间。
- 测试日志、截图、系统快照和隔离数据保留在各自 `.codex-dev` 证据目录；Python 编译缓存已清除。
- 工作区原有 `docs/native-code-dependency-audit.md` 未改动，不纳入本次提交。本次提交仅包含 Windows 发行改造，尚未对外发布。

本轮 Windows 发行改造无剩余实现项。后续可按需求接入代码签名，或开始 macOS 原生宿主与发行适配。
