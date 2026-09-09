# 可选正式 bytecode 构建与 compile 评估

2026-09-10；应用入口基线18a6679，Starter0.3.4 / 0ae8210，Bun1.4.2。

## 使用方式

```powershell
npm run native:build           # 默认 ESM 正式包
npm run native:build:bytecode  # 可选 CommonJS + bytecode 正式包
```

两者使用同一输出目录，后运行的命令覆盖构建产物。字节码仍为可选项，开发与普通构建保留ESM。
本次未启用 `--compile`。`scripts/nativePostBuild.ts` 调用Starter公开钩子；该钩子在应用和资源
生成后、Electrobun压缩包装前执行，用实际随包Bun1.4.2编译。

钩子先生成到临时目录，要求JS/JSC齐全且无undefined产物、源码绝对路径和残留import.meta，
然后将匹配的JS/JSC/原生资产一起复制到正式载荷，生成 `bytecode-manifest.json` 哈希清单。
命令同时要求构建回执，未安装postBuild钩子时不会宣称bytecode成功。支持Windows x64与
当前平铺载荷；不支持启动器会重写JS的ASAR分支。自定义bundler配置需明确集成，不能自动
假定其被此模式复用。技术细节见vendor内 `consumer/bytecode.md`。

## 正式验证

- Starter类型检查、bytecode开关/环境边界测试、Bun版本固定测试通过。
- 独立consumer正常ESM smoke通过（PID41240）；bytecode正式压缩包解压校验、哈希、
  Bun版本、Worker缓存命中断言、原生生命周期smoke通过（PID68792）。
- Starter0.3.4正式制品568文件验证并安装；消费者未私改vendor。
- LaunchPad `native:build:bytecode`、`native:build`、`npm run check`通过。
- 从LaunchPad正式压缩载荷解包核对JS/JSC清单后，通过原 `launcher.exe` 执行完整smoke，
  重验通过（PID51968），包括GPU恢复、搜索/IME、设置、拖拽、文件夹及窗口。首轮在收集
  日志时出现ENOENT，未计为通过，保留原始记录；未删除断言或降低验证要求。
- 正式bytecode应用错误审计确认缓存命中，无效启动模式仍报告Worker异常，不吞掉错误。

## 压缩包与外层启动器测量

相同代码、资源和Bun版本，各自通过正式构建命令打包，再从压缩载荷解包。压缩运行载荷：

| 格式 | 压缩载荷字节 | MiB |
|---|---:|---:|
| ESM | 52,527,327 | 50.09 |
| CJS字节码 | 56,224,047 | 53.62 |

增加3,696,720字节，约3.53MiB（7.04%）。这是运行载荷增量，不把外层安装器stub大小误作
完整应用大小；未压缩JSC约8.45MiB。构建目录的Setup.exe两组均为3,255,296字节。

空布局，从父进程启动真实launcher.exe到日志记录首个应用场景已呈现，交错执行各3次：

| 格式 | 三次首场景时间 ms | 中位数 ms |
|---|---|---:|
| ESM | 1357、4582、4552 | 4552 |
| CJS字节码 | 4313、4280、4269 | 4280 |

中位数差272ms（约6%），但ESM首样本显著更快，初始化波动很大。未清OS文件缓存，不能
据此声称严格冷启动稳定提高6%。这组包含外层启动器，与前一阶段直接运行Bun主线程的
三轮数据分开记录。日志仅增加一次 `first-scene-presented` 事件，不注入自动操作脚本。

## 1000 图标正式包压力对照

两个未经诊断注入的正式包各运行一组相同1000独立图标布局，21项/页，通过原生键盘重放
逐页浏览48页，检查当前页及运行错误，闲置8秒后采集Windows内存，最后通过托盘正常退出。
最终均到第48页、running、lastError=null，已查看bytecode末页截图。

| 指标 | ESM | CJS字节码 |
|---|---:|---:|
| launcher至首场景 ms | 5008 | 4809 |
| 全页闲置工作集 MiB | 482.54 | 504.59 |
| 全程峰值工作集 MiB | 886.95 | 930.75 |

单组中bytecode首场景早199ms，但闲置内存高22.05MiB、峰值高43.80MiB。不能从单组推断
普遍差异，也不能与此前含注入探针的内存绝对值直接混比。这是保持可选、暂不默认开启的依据。
证据 `.codex-dev/formal-results-1000.json` 与 `formal-test-1000-{esm,bytecode}-0`。

## compile 结论

结论：当前不需要为bytecode引入compile，暂不接入正式构建。

已实际运行最小 `--compile --bytecode --format=esm` 双入口实验，主程序和内嵌Worker都
成功执行，验证compile能够保留Worker。但模块位置变为 `B:/~BUN/root` 虚拟路径；最小
可执行文件86,091,264字节（约82MiB），与当前bun.exe运行时体量接近，不能据此宣称包体缩小。

若把真实应用切换到compile，还需要将现有原生主线程脚本和应用Worker一起设计为编译入口，
处理动态Worker路径、DLL加载、品牌资源、数据宿主与更新器启动路径。它不能自动消除GPU
资源或现有其他初始化耗时。现有CJS字节码已获得可验证收益，无需承担这一额外迁移。
本轮没有真实完整应用compile包或性能对照，因此不宣称compile更慢，也不承诺它更快。

## 证据路径

上游：`bytecode-release-final.log`、`bytecode-default-esm-smoke.log`。
消费者：`.codex-dev/bytecode-formal-{build,check,smoke,smoke-retry}.log`、
`bytecode-formal-esm-build.log`、`bytecode-formal-error-audit.log`。
正式解包为 `.codex-dev/formal-{esm,bytecode}`，各有proof.json；启动数据为
`.codex-dev/formal-results-0.json`。compile实验与日志在 `.codex-dev/compile-proof`。
参考：[Bun独立可执行文件与Worker文档](https://bun.com/docs/bundler/executables)。
