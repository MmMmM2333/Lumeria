# Bun 1.4.2 升级记录

2026-09-10；产品基线 `bdff857`；Starter 从0.3.2升级为0.3.3，最终上游提交 `5f2b04f`
（实现提交 `31ab2e2`）。仅升级运行时，不启用 compile/bytecode，不改变全局 Bun。

## 版本与交付

Starter `electrobunPixiStarter.bunVersion` 固定1.4.2，prepare在上游将已支持的Electrobun2.0.1
devkit中 `toolchains.bun.defaultVersion` 和 SDK `BUN_VERSION` 从1.4.0同步迁移；不接受未知
版本或不一致状态。消费者只验证已发布版本，不改写vendor。制品生成也校验这两个声明，
独立consumer smoke解开stable压缩载荷并实际执行 `bin/bun.exe --version`。

Hutch最初经本机代理下载出现HttpConnectionClosing，单次构建命令取消代理变量后直连下载
成功，未改变系统代理。受管工具链与消费者dependencies.lock均指向1.4.2；开发包、正式包
解压后的二进制均确认为1.4.2（运行时revision744846f84）。Electrobun2.0.1、Pixi8.20.1、
原生DLL ABI和业务配置不变。`@types/bun`暂保持1.4.0，现有代码类型检查通过；类型包不选择
运行时版本。正式Starter制品563文件校验通过，旧vendor升级备份已清理。

## 验证结果

- 上游Bun1.4.2下46项host测试/223断言通过；4项资源准备测试/17断言通过；版本迁移测试
  覆盖检查模式拒绝旧版本、显式迁移、重复执行和版本漂移拒绝；typecheck通过。
- 上游独立consumer完整smoke通过（PID60136），stable包实际Bun版本校验通过。
- 消费者 `npm run check` 最终通过，既有大chunk提示保留。`npm run native:build`通过，
  解开LaunchPad正式载荷确认Bun1.4.2。
- 消费者最终 `npm run native:smoke` 通过（PID66888），包括GPU上传/回收/设备丢失后像素
  逐字节恢复、搜索/IME、设置、拖拽、文件夹、窗口和退出。120个白框呈现帧通过。
- 两组1000图标样本均全量加载/上传、pending0/failed0、上传后CPU RGBA0、保留编码28.71MiB；
  12次键盘输入、设备恢复和恢复后复访通过，恢复截图已查看，测试实例正常退出。

首次完整smoke在拖拽悬停会话结束时失败，后续同测试通过，未确认首次中断原因。另两次在
模糊方差阈值失败。诊断发现旧测试只渲染12px高的采样条，但滤镜依赖上下40px背景，截断了
滤镜输入域。同次8次读回值一致，排除了等待GPU读回完成的猜测；现改为渲染完整384×240
条纹场景，再计算原中央160×12区域。阈值保持0.4，最终方差64→2通过。产品滤镜未改。
同JS/DLL仅切换Bun1.4.0的控制组也完整通过（PID2728）。临时诊断代码及运行包已删除，
原始失败和诊断日志保留，不把失败记录删除或伪装成通过。

## 性能对照与限制

沿用1000独立真实图标fixture、900×600窗口、48页、加载并发4和既有诊断。下表1.4.0为
本轮同环境控制组，1.4.2为两组样本。启动时间从诊断模块初始化计时，包含本地数据宿主等
初始化；不等同于操作系统启动进程到首帧的完整冷启动，也不是纯JS解析耗时。

| 指标 | Bun1.4.0控制组 | Bun1.4.2两组 |
|---|---:|---:|
| 宿主首帧 ms | 4276 | 4316–4447 |
| 可交互 ms | 4844 | 4894–5017 |
| 图标加载 ms | 305.57 | 306.09–318.08 |
| 全页闲置Windows工作集 MiB | 548.18 | 528.89–530.81 |
| 全程峰值工作集 MiB | 1199.99 | 1287.60–1316.89 |
| 私有提交 MiB | 1576.43 | 1612.73–1612.98 |
| 12次输入至呈现中位数 ms | 37.38 | 41.21–42.24 |
| 设备丢失至恢复首帧 ms | 313.46 | 355.64–361.52 |

本机样本中，1.4.2闲置工作集低约17–19MiB，但峰值高约88–117MiB，私有提交高约36MiB；
启动/输入/恢复没有改善，恢复首帧约多42–48ms。历史1.4.0闲置样本为521–553MiB，说明
存在明显跨运行波动。样本不足以证明普遍性能回退或改善，不能把本次版本升级宣传为性能优化；
如后续目标是峰值内存，应以这组回退迹象作为跟进项。现有1.4.0正式制品和Git基线仍可回退。

## 证据

上游：`bun142-host-tests.log`、`bun142-release-smoke.log`、`bun142-build-direct.log`。
消费者：`.codex-dev/bun142-check-final.log`、`bun142-native-smoke-final.log`、
`bun142-stable-build.log`、`bun142-stable-version.json`。原始失败日志为
`bun142-native-smoke.log`、`bun142-native-smoke-retry.log`、`bun142-smoke-isolated.log`；
诊断/控制组为 `bun142-blur-probe.log`、`bun140-smoke-control.log`。
性能样本在 `.codex-dev/icon-stress/run-1000-{bun140-control,bun142-1,bun142-2}`，汇总
`.codex-dev/bun142-results.json`，方法脚本 `summarize-bun-upgrade.py`。
