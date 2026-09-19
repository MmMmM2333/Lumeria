# Native 生产诊断边界

默认生产构建不携带应用的 smoke、截图辅助、benchmark、预览和 devtools 入口。开发与 smoke 使用同一套源码，通过显式编译期能力保留这些功能。

| 入口 | 诊断能力 |
|---|---|
| `npm run native:dev` | 启用 |
| `npm run native:smoke` | 启用 |
| `npm run native:build` | 默认排除 |
| `npm run native:build:bytecode` | 默认排除 |

`LUMERIA_NATIVE_DIAGNOSTICS_BUILD` 只接受 `0` / `1`，未设置时排除。项目 dev/smoke runner 在构建子进程环境中显式设置为 `1`。该值产生构建器的 `__LUMERIA_DIAGNOSTICS__` 定义，不是运行时恢复诊断代码的开关。生产包若收到 `LAUNCHPAD_NATIVE_MODE=dev/smoke`，会在创建场景前报错，并提示使用项目开发/测试入口。

`nativeMain.ts` 用编译期区块包住共享当前应用状态的大段 smoke 流程，避免为了源码搬迁引入一个庞大的测试上下文接口。原生点击、截图和像素辅助已移至 `nativeSmokeSupport.ts`，只在诊断构建中加载。devtools 同样使用受保护的动态导入。正常设置、文件夹、输入、窗口恢复和错误处理保留。

普通 Electrobun 构建和可选 CJS bytecode 构建使用 `nativeBuildDefines()` 的同一份定义。字节码 hook 增加了显式 `define` 参数；原生模块位置的 import.meta 适配保持优先。默认模块格式和 minify 策略没有改变。

postBuild 会检查产物：构建标记必须已被替换，代表性的 smoke/截图/benchmark 标记必须与诊断能力一致。检查在运行时品牌处理和打包前执行，避免字节码的第二次构建把诊断代码重新带回来。这里排除的是应用诊断入口，底层原生宿主必要的状态观测和恢复支持保留。

验证记录（2026-09-12）：

- `npm run check` 完整通过；新增构建开关测试及可选 bytecode hook 测试通过。
- 普通 ESM 和可选 bytecode 生产包均实际构建成功，产物诊断检查通过；bytecode 文件哈希与 receipt 一致。
- 开发产物检查确认诊断存在；完整原生 smoke 通过，包含布局、设置、文件夹、拖拽、输入、窗口尺寸和恢复检查。
- 诊断关闭的 ESM 与 bytecode 构建，在隔离数据下完成翻页、设置和文件夹检查；其桌面截图与此前实验基准逐像素一致，bytecode 缓存命中已确认。这两个 UI 检查使用编译前注入的私有验证探针，未修改正式产物或形成生产探针入口。
- 未注入探针的生产 ESM 包另验证了诊断模式拒绝：日志出现明确错误，且没有创建场景。

完整检查期间修正了两项测试前提：既有虚拟列表测试改用真实 FederatedPointerEvent；焦点丢失 smoke 显式先建立 focused 状态，避免窗口已经失焦时把“没有发生第二次失焦”误判为手势清理失败。产品焦点逻辑未修改。

内存收益仍参考 [构建对照报告](native-build-memory-comparison.md) 中的几 MiB 级结果；字节码和压缩未作为省内存方案默认启用。正式验证中的一次 ESM 采样约 238 MiB，说明工作集仍存在波动，不将实验的最低值作为保证。
