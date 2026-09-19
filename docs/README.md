# 开发文档

产品介绍和安装见[项目首页](../README.md)。这里说明当前实现、构建方法和调试工具。

## 构建与调试

- [工具链与首次构建](native-toolchain.md)
- [Windows 安装包](windows-release.md)
- [DevTools](native-devtools.md)、[产品诊断命令](native-product-diagnostics.md)
- [生产包与诊断包](native-diagnostics-build.md)
- [压力测试](native-stress-testing.md)、[内存取证](native-memory-capture.md)
- [Motion Lab](motion-lab.md)

## 实现与设计

- [模块职责](native-architecture.md)、[数据服务协议](native-data-service.md)
- [Live Desktop](native-live-desktop.md)
- [场景更新与帧顺序](rendering.md)
- [图标资源生命周期](icon-resources.md)
- [启动与恢复](startup-preparation-policy.md)
- [输入、搜索与窗口](input-and-window.md)

文档中的源码、测试和脚本随仓库提供。命令生成的日志与构建产物不进入 Git，相关章节会说明输出位置。
