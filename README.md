# Lumeria

Lumeria 是一个 Windows 应用启动台。把常用应用放进网格，用文件夹分类，也可以直接输入名称或拼音搜索。

支持拖拽排序、批量整理、自定义图标和背景，以及窗口与全屏模式。界面使用 PixiJS 和 WebGPU 渲染，基于 Electrobun 运行。

## 安装

目前处于开发阶段，暂未发布安装包，当前开发与测试平台为 Windows 11 x64。

后续安装包会放在 [Releases](https://github.com/MmMmM2333/Lumeria/releases)。下载 `Lumeria-<版本>-x64-Setup.exe` 后运行即可，安装后从开始菜单打开 Lumeria。

## 编译

需要 Node.js 26、Rust MSVC 工具链、Visual Studio C++ Build Tools（含 Windows SDK）和 Zig 0.16.0。制作安装包还需要 NSIS 3.11。

```powershell
git clone https://github.com/MmMmM2333/Lumeria.git
cd Lumeria
npm ci
```

首次构建还需要 Bun 1.4.x、CMake 和 PowerShell 7。运行下面的命令会下载固定版本的 Electrobun 源码，应用补丁、编译并校验 SDK，然后接入本地构建：

```powershell
npm run native:prepare:source
npm run native:dev
```

构建安装包：

```powershell
npm run native:release
```

安装包输出到 `artifacts/Lumeria-<版本>-x64-Setup.exe`。更多打包选项见 [Windows 构建说明](release/windows/README.md)。

首次编译 SDK 耗时较长；已有预编译工具链附件时也可以直接导入，见 [工具链说明](docs/native-toolchain.md)。

## 许可

[GPL-3.0-only](LICENSE)。第三方依赖保留各自的许可，见 [第三方声明](THIRD_PARTY_NOTICES.txt)。
