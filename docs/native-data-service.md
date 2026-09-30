# Native 数据服务

Rust 工作区将共享 Windows/数据能力放在 `lumeria-core`，按行收发 JSON 的子进程放在 `lumeria-native-data`，进程内桌面捕获库放在 `lumeria-live-desktop`。核心包不依赖 Tauri 或 Electrobun，Windows 专用实现保留明确的平台边界。旧 Tauri 宿主已退役，最终版本保存在 `archive/tauri-vue-final`。

## 构建与测试

在仓库根目录运行 `npm run native:data:build`。工作区共用根目录的 `Cargo.lock` 和 `target`；产物为 `target/release/lumeria_native_data.exe`，打包时复制为 `bun/lumeria-native-data.exe`。

`npm run test:native-data` 运行 Rust 测试，并通过生产使用的 TypeScript 客户端调用实际 release 数据服务，验证通信与数据行为。

`npm run test:data-optimization` 验证刷新调度、图标临时引用、保存去重和真实数据服务。先运行 `native:data:build`。`npm run test:native-data-icons` 在隔离 Native 窗口验证真实候选、可见项加载、滚动复用、重开、设备恢复、键盘导航和选图保存，结果与截图保存在 `artifacts/data-icons-native-*`。

`npm run test:auto-scan` 验证事件过滤、调度、请求合并、内容身份和真实数据服务；`npm run test:native-auto-scan` 验证隔离 Native 界面的无变化结果、来源改名、真实目录通知以及设置忙时只接管最新目录，结果与截图写入 `artifacts/auto-scan-native-*`。

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
| `startIconChoicesLoad` | `targetPath` | 后台提取图标候选，返回 `null`；已有任务时拒绝重复启动 |
| `pollIconChoicesLoad` | — | 未完成返回 `null`，完成返回候选 ID／缓存路径或错误并释放任务 |
| `cacheCustomIcon` | `dataUrl` | 以内容确定缓存标识的 PNG 结果 |
| `cacheBackground` | `path` | 校验后的背景图片缓存结果 |
| `wallpaper` | `rect` | 桌面壁纸缓存或 `null` |
| `autostart` | 可选 `enabled` | 当前自启动状态 |

`launchApp` 根据服务端应用目录和校验后的已保存布局解析 ID，调用方不能直接注入可执行文件路径。自启动注册只使用经过验证的已安装产品启动器，不注册数据服务自身，也不把开发版可执行文件视为已安装产品。

## 数据与兼容性

数据保存在 `%APPDATA%/com.lumeria.app` 下，包括 `layout.json`、`catalog-cache.json`、`catalog-metadata.json`、`icons/` 和 `backgrounds/`。测试可用绝对路径环境变量 `LUMERIA_NATIVE_DATA_DIR` 指定隔离目录。两份目录缓存都是派生数据，损坏时重新扫描。

布局保持版本 2，启动错误类别与协议封套保持版本 1。图标候选已迁移至成套后台操作，不再传输全量 PNG Base64；客户端和服务必须来自同一构建。旧布局中的图标路径保持有效。TypeScript 客户端保持请求顺序，正常退出先排空任务，再关闭通道。

产品的手动和自动扫描统一在后台线程执行，相同配置的待执行／进行中请求共享实际工作，不同配置顺序排队；新文件事件到来后，不复用早于该事件已经开始的扫描。完成后的结果不作为后续显式扫描的命中缓存。过期结果不接管。图标候选另有一个后台线程，冷提取期间仍可启动和保存。正常 EOF 等待线程完成写入。原始 `scanApps` 保留给同步服务调用，并先等待旧扫描；产品客户端使用 `startCatalogScan`／`pollCatalogScan`。

## 增量复用与刷新

每轮仍枚举扫描目录和 Windows AppsFolder，按现有规则完成全局来源覆盖、身份合并与筛选。快捷方式解析、Internet Shortcut URL 和 Shell 显示名称按路径、文件大小、创建／修改时间持久复用；显示名称还校验相邻 `desktop.ini`。一次扫描内共享结果，扫描结束释放线程内会话。失败结果不持久缓存，完整扫描删除未访问项，部分扫描保留未访问缓存。统计包含 `metadataCacheHits` 和 `metadataReads`。

目录通知在最后一次相关事件后等待 250 ms，连续通知最多等待 2 秒发起扫描请求；已有扫描正在运行时仍需等待它结束。明确无关的文件内容变化、扫描深度以外和开始菜单 Startup 子目录事件被过滤；未知名称与目录改名／删除事件保守保留。图片、图标资源、快捷方式和 desktop.ini 的相关变化继续校验。每轮仍扫描全部启用来源并完成全局合并，没有将局部目录结果直接当成完整目录。

监听按实际展开后的目录路径复用，同目录来源共享监听。来源改名复用最近完整目录并更新来源标签；筛选／深度变化重新扫描，但保持路径未变的监听。只有路径添加／移除、周期校准或监听失败重试需要重新绑定。

5 分钟校准从最近一次同配置完整成功扫描计时，包括手动扫描。完成的扫描只覆盖开始前已知的通知，途中出现的新通知仍安排后续扫描。首次缓存启动继续校准，Windows 应用、目录移动、遗漏通知和目录外资源依赖由校准检查。扫描失败按 1／2／4 秒递增退避，最长 60 秒；新通知不能绕过退避，同一连续失败只显示一次错误，成功后恢复正常计时。没有启用来源时不保留周期扫描定时器。

目录内容身份不包含扫描统计。内容未变化时跳过服务目录接管、布局协调和保存，仍保留失败图标修复重试。忙时只保留最新有效结果，通过交互产生的场景／现有帧／运行态通知应用，不使用 200 ms 轮询。设置、弹窗、拖拽、选择、文件夹和启动动画期间不会重排布局。

服务复核图标来源修订与缓存文件修订。相同大小和时间元数据的内容替换不在检测范围内；这是增量复用的边界。商店应用或目录外资源变化可能需要等待一次校准。

## 布局快照

服务缓存成功校验的布局，保存后重新确认磁盘状态，并建立应用 ID 索引供启动解析。每次读取或启动先检查文件修订；外部变化重新读取与校验，连续变化重试后返回错误。损坏文件不能用旧快照假装读取成功，失败保存不会更新成功状态。前端写队列与服务跳过内容相同的成功保存，显式保存、启动前和退出的排空语义保持。

## 性能与清理工具

`node --import tsx scripts/benchmarkNativeData.ts <标签> [layout.json]` 只读取给定布局的扫描配置，全部写入隔离目录，记录扫描、布局和选图的耗时与响应字节。首次样本并未清空 OS 文件缓存，不能当作稳定性能保证。

`node --import tsx scripts/auditNativeIconCache.ts [数据目录] [报告路径]` 只读核对当前布局、目录缓存、备份和最近 7 天文件，生成候选及重复内容统计。存在活动会话或无法读取的引用文件时需继续检查；工具不提供删除选项。

Native 运行时声明收集以 `lumeria-native-data` 和 Live Desktop 库为入口。旧 Tauri 代码保存在历史中，不代表当前数据服务依赖 Tauri。实际依赖图可在根目录查看：

```powershell
cargo tree -p lumeria-native-data --edges normal,build --locked
```
