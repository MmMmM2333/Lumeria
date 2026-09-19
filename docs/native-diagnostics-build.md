# 生产包与诊断包

开发和 smoke 构建包含截图、性能测量、预览及 DevTools；生产构建默认移除这些应用诊断入口。

| 入口 | 诊断能力 |
| --- | --- |
| `npm run native:dev` | 启用 |
| `npm run native:smoke` | 启用 |
| `npm run native:build` | 默认排除 |
| `npm run native:build:bytecode` | 默认排除 |

## 构建开关

`LUMERIA_NATIVE_DIAGNOSTICS_BUILD` 只接受 `0` 或 `1`，未设置时排除诊断。dev/smoke 启动器在构建时设置为 `1`，生成 `__LUMERIA_DIAGNOSTICS__` 编译期定义。

这个开关不能在运行时找回已被移除的代码。生产包收到 `LAUNCHPAD_NATIVE_MODE=dev/smoke` 时，会在创建场景前报错，提示改用开发或测试入口。

ESM 和可选 CJS bytecode 构建共用 `nativeBuildDefines()`。构建后检查诊断标记是否与开关一致，避免 bytecode 的再次构建把诊断代码带回生产包。底层宿主的状态查询和设备恢复能力仍然保留。

## 检查方式

`npm run native:build` 和 `npm run native:build:bytecode` 都会检查产物中的诊断标记。开发场景使用 `npm run native:smoke` 验证；它使用诊断构建，不代表生产包的启动检查。

检查生产包启动和退出流程时，先执行 `npm run native:stage`，再运行 `npm run test:native-staged`。该测试使用隔离数据，不安装产品，也不替代实际 UI 验证。
