# Native 数据服务

Rust 工作区将共享 Windows/数据能力放在 `lumeria-core`，按行收发 JSON 的子进程放在 `lumeria-native-data`，进程内桌面捕获库放在 `lumeria-live-desktop`。核心包不依赖 Tauri 或 Electrobun，Windows 专用实现保留明确的平台边界。旧 Tauri 宿主已退役，最终版本保存在 `archive/tauri-vue-final`。

## 构建与测试

在仓库根目录运行 `npm run native:data:build`。工作区共用根目录的 `Cargo.lock` 和 `target`；产物为 `target/release/lumeria_native_data.exe`，打包时复制为 `bun/lumeria-native-data.exe`。

`npm run test:native-data` 运行 Rust 测试，并通过生产使用的 TypeScript 客户端调用实际 release 数据服务，验证通信与数据行为。

## 通信协议

Windows 产品和开发启动器预启动数据服务，传入 `--pipe` 与随机管道名。管道只允许所有者访问、拒绝远程客户端且只接受一个连接。Bun 从 `LUMERIA_DATA_PIPE` 连接后删除私有环境标记，避免传给用户启动的应用。启动器用 kill-on-close Job 持有数据进程；正常关闭先排空请求并断开，异常退出回收进程，未连接服务有超时。控制入口不预启动服务，二次激活已有实例会立即关闭自己的多余服务。

无启动器环境的独立测试保留标准输入输出协议。命名管道与标准输入输出使用同一 JSON 协议和服务处理逻辑。验证命令：`node --import tsx scripts/testNativeDataPipe.ts`、`npm run test:native-launcher`。

请求与响应使用 UTF-8 JSON，每行一条消息。请求包含 `version: 1`、无符号整数 `id` 和 `operation`；响应包含相同版本、相同 `id` 及 `ok`。成功响应包含 `value`，无返回值时显式写 `null`；失败响应包含 `error`。

无法解析的请求尽量保留可恢复的请求 ID，否则使用 0。遇到未知操作、字段或协议版本时返回错误。服务按顺序处理请求，读到 EOF 后结束；输出失败也按错误处理。标准输出只承载协议消息，诊断信息写入标准错误。

| 操作 | 请求字段 | 返回结果 |
| --- | --- | --- |
| `hello` | — | 协议版本与自启动能力是否可用 |
| `loadLayout` | — | 校验后的布局或 `null` |
| `saveLayout` | `layout` | 校验并原子保存后返回 `null` |
| `scanApps` | `roots`，可选 `filters` | 应用目录、排除项、警告与统计 |
| `startCatalogScan` | `roots`，可选 `filters` | 启动一个后台扫描线程，返回 `null`；重复启动报错 |
| `pollCatalogScan` | — | 未完成返回 `null`，完成返回扫描结果或错误并释放任务 |
| `adoptCatalog` | `apps` | 将已校验的缓存或刷新结果用于后续启动解析，返回 `null` |
| `launchApp` | `appId` | 成功返回 `null`；启动错误保留 `kind` 和 `detail` |
| `checkLaunchTargets` | `targets` | 各 ID 对应的 `ok`、`missing` 或 `unknown` 状态 |
| `loadIconChoices` | `targetPath` | 图标候选，含缓存路径与 PNG data URL |
| `cacheCustomIcon` | `dataUrl` | 以内容确定缓存标识的 PNG 结果 |
| `cacheBackground` | `path` | 校验后的背景图片缓存结果 |
| `wallpaper` | `rect` | 桌面壁纸缓存或 `null` |
| `autostart` | 可选 `enabled` | 当前自启动状态 |

`launchApp` 根据服务端应用目录和校验后的已保存布局解析 ID，调用方不能直接注入可执行文件路径。自启动注册只使用经过验证的已安装产品启动器，不注册数据服务自身，也不把开发版可执行文件视为已安装产品。

## 数据与兼容性

数据保存在 `%APPDATA%/com.lumeria.app` 下，包括 `layout.json`、`catalog-cache.json`、`icons/` 和 `backgrounds/`。测试可用绝对路径环境变量 `LUMERIA_NATIVE_DATA_DIR` 指定隔离目录。目录缓存不是布局的替代品，损坏时重新扫描。

工作区拆分没有迁移用户数据，也没有改变布局版本 2、缓存命名、启动错误类别或协议版本。TypeScript 客户端保持请求顺序，正常退出前等待未完成请求收尾。

后台目录扫描在独立线程执行，轮询本身不阻塞主通道。显式扫描会等待并取代旧后台扫描，避免并发改写图标缓存；正常 EOF 退出也等待线程完成图标写入。客户端用配置键和扫描版本丢弃过期刷新，缓存与后台结果的接管不会跳过实际启动目标校验。

Native 运行时声明收集以 `lumeria-native-data` 和 Live Desktop 库为入口。旧 Tauri 代码保存在历史中，不代表当前数据服务依赖 Tauri。实际依赖图可在根目录查看：

```powershell
cargo tree -p lumeria-native-data --edges normal,build --locked
```
