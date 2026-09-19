# Bun 1.4.2 bytecode 可行性实验

2026-09-10；基线4686848（已提交Bun1.4.2升级），未启用compile/bytecode。

实测结果：

| 路径 | 结果 |
|---|---|
| 当前ESM入口 + bytecode，不带compile | Bun明确拒绝：ESM bytecode requires --compile |
| 当前入口改用CJS + bytecode | 顶层await无法编译 |
| 已正常打包的应用bundle再转CJS + bytecode | 同样因顶层await失败，排除源文件tsconfig解析因素 |
| 最小CJS Worker + bytecode | 成功生成294字节JS、952字节JSC；运行结果正确，日志含Cache hit |

源码CJS尝试另出现Bun的directory mismatch内部提示；已bundle尝试不依赖该配置，仍遇到
顶层await错误，因此入口异步语义是独立确认的阻碍。应用在创建原生App、连接数据宿主、
准备品牌资源等位置使用顶层await，不能直接增加一个构建开关就保持现状运行。

现有启动器使用Bun主线程运行原生消息循环，并创建Worker加载应用。正式启动代码包含
ASAR读取`bun/index.js`、写临时JS及前置清理脚本的分支；实际核对当前stable载荷是平铺app目录，
未使用ASAR分支。CJS字节码需要匹配源文件和伴随
`.jsc`，后续必须核实正式载荷选择、提取路径及源文件一致性，不可据最小Worker实验宣称
正式应用已经使用字节码。

以下记录最初调查证据：`.codex-dev/bytecode-esm-probe.log`、`bytecode-cjs-probe.log`、
`bytecode-bundle-probe.log`、`bytecode-worker-proof.log`。最小样本在bytecode-worker-proof目录。

## 已授权的 async 入口与真实应用实验

用户确认后，`nativeMain.ts` 将原顶层流程收拢为 `runNativeApplication()`，保留原来初始化
顺序、try/finally与资源清理；拒绝结果通过微任务重新抛出，继续由Worker错误处理捕获。
未改变Worker与原生主线程划分，未启用compile。

完整CJS构建还需处理两个Bun1.4.2边界：

- `import.meta.env` 被原样保留到CJS内，导致字节码输出缺失。Bun返回success但outputs
  含undefined，只有带bytecode标记的JS、没有JSC。实验脚本显式拒绝这种结果，不过滤异常项。
  原生环境的该值本来是undefined，因此隔离构建将它定义为undefined，不改变原生标志语义。
- CJS构建会将`import.meta.dir`固化为源码目录，导致native-frame.dll和品牌资源加载错误。
  隔离构建将dir/path/url映射到运行时CJS模块位置，保持与原ESM bundle相同的资源定位语义。
  完整产物不再包含这些源码绝对路径。消费者vendor未修改。

修正后生成4,782,217字节JS、8,858,184字节JSC（约8.45MiB额外未压缩文件）及画布原生资产。
真实应用Worker日志在process-start前出现Cache hit，随后首帧、设置及正常退出，证明不是
仅生成文件。无测量注入的bytecode包通过完整原生smoke（PID5560，退出0且smoke完成标记存在），
包括GPU像素恢复、搜索/IME、设置、拖拽、文件夹、窗口与清理。已查看中文搜索截图。
`npm run check`通过。外层stable launcher隐藏控制台，smoke日志较短；完成状态由现有
runner验证标记，单独直接运行相同Resources/main.js记录缓存命中审计。

## 三种格式的对照

使用相同Bun1.4.2、同一async入口、相同正式包DLL/资源，空布局fixture。三轮交错执行
ESM、CJS、CJS字节码，各3次；独立测量程序直接启动随包bun.exe执行原有Resources/main.js，
保留原生主线程和Worker。启动计时从父进程spawn前到收到首帧/可交互标记，包含模块解析，
不包含外层launcher.exe和安装器启动。未清空OS文件缓存，不称为严格冷缓存测试。

| 指标（中位数） | ESM | 普通CJS | CJS字节码 |
|---|---:|---:|---:|
| 进程启动至首帧 ms | 4638.55 | 4441.64 | 4253.52 |
| 进程启动至可交互 ms | 4704.53 | 4505.83 | 4311.76 |
| 首次打开设置至呈现 ms | 63.30 | 58.60 | 51.74 |
| 设置呈现2秒后RSS MiB | 278.98 | 278.29 | 282.17 |
| 峰值RSS补测（每组1次）MiB | 284.61 | 282.37 | 287.87 |

字节码相对普通CJS可交互快约194ms（4.3%），相对ESM合计快约393ms（8.3%）；不能将
格式切换贡献全部归因于字节码。RSS高约3–4MiB，峰值单样本高约3–6MiB，额外JSC约8.45MiB。
压缩后安装包增量未测。本轮仅验证空布局启动和完整smoke，不代表1000图标压力或所有机器。
当前约4秒仍主要花在其他初始化环节，bytecode不能消除这些耗时。

性能日志不启用verboseDiskCache，命中审计另跑，避免日志开销混入结果。原始3轮结果在
`.codex-dev/bytecode-app/results.json`，峰值补测peak.json，汇总summary.json；方法脚本
build.ts/measure.mjs/summarize.py同目录。完整回归bytecode-smoke-fixed.log、静态检查check.log，
命中审计cache-hit-audit.log。最终候选重建时已移除测量注入，不会自动打开设置或退出。

结论：方案技术可行，有小幅可复现启动收益，但默认正式构建仍为ESM，无bytecode。
若正式接入，应在Starter上游提供明确的可选CJS/bytecode构建、元信息映射及产物完整性校验，
将JS/JSC一起纳入正式载荷并增加独立consumer命中验证；本阶段未把实验脚本直接接到正式发布。

参考：[Bun字节码文档](https://bun.com/docs/bundler/bytecode)。实际行为以随包Bun1.4.2实验为准。
