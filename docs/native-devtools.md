# Native DevTools

运行 `npm run native:dev` 会自动启用 DevTools。产品模式默认关闭；可在启动前设置 `LAUNCHPAD_DEVTOOLS=1` 临时启用，`PIXI_AGENT_DEBUG=0` 则始终关闭。构建是否包含诊断代码见[诊断构建](native-diagnostics-build.md)。

## 连接应用

在项目目录运行 `npm run devtools:mcp`。支持 stdio MCP 的客户端也可以配置：

```json
{
  "command": "node",
  "args": [
    "C:/path/to/Lumeria/vendor/electrobun-pixi-native-starter/tools/devtools-mcp.mjs"
  ]
}
```

先用 `list_instances` 列出实例，再用 `select_instance` 选择目标，最后查询 `capabilities`。多个实例同时运行时必须明确选择；列表不会返回访问 token。可用 `LAUNCHPAD_DEBUG_BUILD` 标注构建版本。

## 常用操作

| 操作 | 用途 |
| --- | --- |
| `runtime_status` | 查看窗口、GPU、输入、页面、拖拽、文件夹和动画状态 |
| `inspect_scene` | 查看节点树；`detail:true` 包含透明度、边界、命中区、滤镜、文字分辨率和纹理 |
| `hit_test` | 检查逻辑客户区坐标实际命中了哪个节点 |
| `watch_node` | 记录节点可见性和透明度变化，最多 8 个监视器，每个保留 120 个呈现样本 |
| `replay_input` | 回放 down/move/up/cancel/wait/wheel/key 序列，最长 60 秒、256 步 |
| `capture_evidence` | 导出 PNG、JSON 和同次呈现回调中的节点、应用状态 |
| `frame_control` | 暂停、恢复呈现，或等待指定数量的呈现帧 |

节点同名时用 ID 定位。输入回放默认使用独立触点 71，可按 label 或 ID 查找目标；失败或取消后释放触点。

脚本也可以通过 CLI 调用：

```powershell
npm run devtools:cli -- list
npm run devtools:cli -- status <instanceId>
npm run devtools:cli -- command <instanceId> '{"action":"inspect","target":{"label":"launchpad-item:native-layout-icon"}}'
```

## 如何理解结果

- capture 会重新渲染诊断图像，并标记 `afterPresentedFrame`。它不是系统截图，也不是上一帧交换链的像素副本，不包含系统材质或弹窗。
- replay 注入原生事件；真实鼠标、触控板和 IME 仍需实机验证。
- pause 只暂停渲染，业务计时器和外部 IO 仍会运行。
- 纹理统计只覆盖场景可达资源，不代表全部显存。无法查询的回退字体返回 `unavailable`；遮挡、mask 和透明像素需结合图像判断。

动画、背景和布局命令见[产品诊断](native-product-diagnostics.md)。
