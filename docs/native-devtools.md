# Native DevTools 使用

Starter 0.3.0 的通用 DevTools 已接入 LaunchPad。`native:dev` 自动注册，产品模式默认关闭；
需要临时开启时由启动环境显式设置 `LAUNCHPAD_DEVTOOLS=1`。`PIXI_AGENT_DEBUG=0` 始终关闭。

## MCP 服务

在项目目录运行 `npm run devtools:mcp`，或在支持 stdio MCP 的客户端中使用：

```json
{
  "command": "node",
  "args": [
    "C:/path/to/Lumeria/vendor/electrobun-pixi-native-starter/tools/devtools-mcp.mjs"
  ]
}
```

本轮没有修改用户级客户端配置。服务使用项目锁定的官方 MCP SDK，应用运行时不导入 SDK。
先 `list_instances`，再 `select_instance`，然后查询 `capabilities`。多实例下必须明确选中
目标；实例列表不会返回访问 token。构建可通过 `LAUNCHPAD_DEBUG_BUILD` 标注版本。

## 常用流程

1. `runtime_status`：读取窗口、GPU、输入、当前页面、拖拽/悬停、文件夹和动画状态。
2. `inspect_scene`：查树和节点ID；`detail:true` 查看祖先透明度、边界、命中区域、
   滤镜、文字分辨率和纹理身份。同名label必须改用明确ID。
3. `hit_test`：用逻辑客户区坐标查看实际命中节点。
4. `watch_node`：监视节点可见性或有效透明度，保存异常前后的呈现帧状态。
5. `replay_input`：提交含down/move/up/cancel/wait/wheel/key的时序；默认独立触点71，
   可按label或ID解析目标，避免写死窗口坐标。最长60秒、256步，失败/取消释放触点。
6. `capture_evidence`：返回PNG、JSON及同一呈现回调内采集的选定节点/应用状态。
7. `frame_control`：暂停/恢复呈现，或等待指定数量的实际呈现帧。

CLI可用于脚本：

```powershell
npm run devtools:cli -- list
npm run devtools:cli -- status <instanceId>
npm run devtools:cli -- command <instanceId> '{"action":"inspect","target":{"label":"launchpad-item:native-layout-icon"}}'
```

## 证据边界

- capture是`diagnostic-rerender`，带`afterPresentedFrame`；状态与图像提交在呈现回调内
  同步采集。它不是操作系统截图，不包含系统材质/系统弹窗，也不是上一帧交换链像素副本。
  取证后恢复正常呈现，确保随后输入仍路由到应用舞台。
- replay是原生事件注入，不冒充真实硬件输入。真实鼠标/触摸板/IME仍需对应硬件验收。
- LaunchPad未注册业务可控时钟，pause只暂停渲染，不冻结业务计时器或外部IO。
- watch最多8个，每个保留120个呈现状态样本；不是连续视频。
- 纹理检查只统计场景可达资源，不代表进程全部显存；实际字形回退字体无法查询时明确
  返回unavailable。遮挡、mask覆盖和透明像素需要结合图像判断。

## 本轮验证

- 官方MCP客户端经stdio连接LaunchPad隔离实例，完成选择、图标检查、带图取证、
  拿起/悬停/取消，截图后输入正常且最终无活动拖拽。
- 通用watch捕获27个呈现帧，包含拖拽活动和悬停业务状态。
- Starter Demo验证精确3帧单步、重放激活、取消后捕获释放。
- 上游严格类型、调试/输入/调度回归13测试80断言、MCP协议回归通过；LaunchPad完整
  npm run check通过。固定Starter556文件哈希和ABI验证通过。
- 验证记录位于`.codex-dev/devtools-mcp-acceptance.json`、
  `.codex-dev/devtools-watch-acceptance.json`和`.codex-dev/devtools-check.log`。

更完整的通用接口及限制见
[Starter DEVTOOLS.md](../vendor/electrobun-pixi-native-starter/consumer/DEVTOOLS.md)。
