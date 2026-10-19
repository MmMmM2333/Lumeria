# Native 模块职责与边界

Native 产品与浏览器参考测试宿主共用业务规则。宿主提供平台能力和状态适配，不另存一份业务数据。Rust 包的职责见[数据服务](native-data-service.md)。

## 模块分工

| 模块 | 职责 |
| --- | --- |
| `src/domain` | 持久化数据契约、布局与输入规则、共享常量 |
| `src/application` | 应用管理、设置事务、布局、选择、拖拽、通知与保存协调 |
| `src/platform/launchpadContracts.ts` | 宿主共用的结果和值类型，不依赖 Tauri 运行时 |
| `src/platform/launchpadPortContracts.ts` | 共享应用服务使用的平台能力接口 |
| `src/platform/launchpadPorts.ts`、`src/api/launchpadApi.ts` | 可注入的浏览器参考测试适配器，不依赖 Tauri 运行时 |
| `src/i18n/translationPort.ts` | 业务规则所需的文本查询，不引入 Vue 响应式类型 |
| `src/native/nativeDataHost.ts` | 校验业务请求，并通过 Rust 数据服务执行 |
| `src/native/nativeDataTransport.ts` | 子进程串行通信、请求顺序与退出前的请求收尾 |
| `src/native/nativeDataProtocol.ts` | 协议版本、消息格式校验及结构化启动错误 |
| `src/native/nativeClipboard.ts` | 注入搜索编辑器的原生剪贴板适配器 |
| `src/native/nativeMain.ts` | 创建宿主、单实例入口与外层生命周期 |
| `src/native/product/nativeProduct.ts` | 组装产品、接入平台能力，统一协调呈现帧 |
| `src/native/product/nativeSettingsController.ts` | 设置外壳、导航、面板状态、应用/取消与快捷键录制 |
| `src/native/product/nativeSceneController.ts` | 同步场景提交、投影快照与布局缓存 |
| `src/native/product/nativeVisibilityController.ts` | 显示/隐藏代次校验与应用启动定时器 |
| `src/native/product/nativeInputRouter.ts` | 滚轮和触控归属、指针捕获、页面跟手滑动与手势期限 |
| `src/native/product/nativeKeyboardRouter.ts` | 键盘、输入法组合文本、模态状态与焦点的同步路由 |
| `src/native/nativeCloseCoordinator.ts` | 关闭意图、外部退出请求、设置与保存顺序，以及重启保护 |
| `src/native/nativeRuntimeLifecycle.ts` | 启动、组装或销毁失败时清理窗口和数据服务 |
| `src/native/nativeSession.ts` | 单实例控制与经过身份校验的进程控制通道 |
| `src/native/nativeSceneScheduler.ts` | 待处理和同步场景任务；销毁期间阻止继续调度 |
| `src/native/nativeStartupPreparation.ts` | 启动准备的时间预算与窗口显示时机 |
| `src/rendering/native` | Pixi 场景与控件呈现、文本和输入适配 |
| `src/native/diagnostics` | 显式启用的验证场景、故障注入与证据采集 |

## 依赖与状态管理

共享应用模块可以依赖纯渲染契约和能力判断，不能依赖 composable、具体宿主、Vue、Tauri、Electrobun、Bun、Node 或 vendor 宿主代码。这也包括类型导入、动态导入和重新导出。`npm run check:policy` 检查本地依赖的传递关系；集成测试不按这条生产代码规则检查。

导入渲染类型时使用具体的纯模块，避免从同时导出宿主预览实现的 Web 入口间接引入运行时依赖。Native 文本控件可以在实现边界使用 Starter 的文本输入类型；业务逻辑只接收所需能力，不持有整个宿主对象。

输入路由统一管理当前触控 ID、滚轮期限及桌面/文件夹滑动状态。场景层读取这些状态进行呈现，不维护另一套交互状态。帧顺序与更新规则见[场景更新](rendering.md)。

## 设置与首次引导

普通设置应用按事务处理快捷键与其他平台操作，失败时恢复此前的实际生效组合及设置。首次引导允许将明确的快捷键注册不可用降为警告，保留所选组合并继续应用其他设置；注销、回滚、其他平台操作及保存失败仍按错误处理。已保存但未生效的快捷键警告跨设置编辑保留，成功重试或清空后移除；此前的有效组合继续可用时，提示中标明该组合。

## 通信与退出

数据服务正常关闭前完成尚未处理的串行请求，再关闭标准输入。协议解析失败必须可见，不能转成成功结果；子进程退出后拒绝排队请求。EPIPE 等流错误由通信层处理，避免未处理事件导致产品崩溃。通信层不自动重试，请求按顺序发送。

产品关闭时先等待设置应用和待保存数据，再执行关闭动画或重启。失败后恢复交互，沿用现有错误提示和重试路径。

## 诊断与兼容范围

诊断场景执行真实产品路径，在 `finally` 中恢复注入的错误和测试数据。诊断模块由编译期开关 `__LUMERIA_DIAGNOSTICS__` 控制动态导入，生产打包检查产物中没有诊断标记。GPU 截图只证明捕获时的渲染结果；跳过混合 DPI 或物理设备检查不构成该环境的通过证据。

旧 Tauri 产品已退役，浏览器参考宿主暂时保留，直到共享回归覆盖有替代方案。当前边界没有承诺渲染器可以任意替换，也不意味着未来迁移到 Rust 无需成本。打包说明见 [Windows 发行指南](windows-release.md)。
