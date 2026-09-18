# Motion Lab 独立开发入口

Motion Lab 是 Pixi Motion 实验与调试页面。它现在可以脱离旧产品入口独立启动，不经过 `src/main.ts`、`App.vue`、`launchpadPorts` 或 Tauri 宿主初始化。

## 启动

在仓库根目录运行：

```powershell
npx vite --config vite.motion-lab.config.ts --host 127.0.0.1
```

然后打开 Vite 输出的地址加 `/motion-lab.html`，默认是：

```text
http://127.0.0.1:5173/motion-lab.html
```

专用配置复用根 `vite.config.ts` 的 Vue 与图标插件，只把 `motion-lab.html` 作为构建输入。需要验证工具入口可独立构建时运行：

```powershell
npx vite build --config vite.motion-lab.config.ts
```

产物位于 `dist/motion-lab/`，不会把 `index.html` 或旧产品入口纳入该构建。本轮没有修改 `package.json`；主代理如需固定命令，可增加：

```json
{
  "dev:motion-lab": "vite --config vite.motion-lab.config.ts",
  "build:motion-lab": "vite build --config vite.motion-lab.config.ts"
}
```

该入口在代码中检查 `import.meta.env.DEV`，仅用于 Vite 开发模式。

## 初始化状态

页面根节点以 `data-motion-lab-state` 暴露状态：

- `initializing`：正在创建 Motion runtime 与 Pixi renderer；状态栏复用现有“处理中”文案。
- `ready`：Pixi 场景、快照轮询和 `motion-lab` 诊断工具均已安装；运行与录制按钮可用。
- `failed`：初始化失败；状态栏显示现有“错误”文案，运行与录制按钮保持禁用，技术错误写入控制台。

运行和录制只会在 `ready` 状态执行，不再出现点击后静默无操作。初始化期间的异步卸载会销毁晚到的 Pixi Application，并停止快照轮询；卸载后等待中的场景运行不再写入断言或运行快照。

## 保留能力

独立入口加载现有 `MotionLabApp`，保留：

- 12 个 Motion 场景及内建断言。
- 四组参数预设与全部弹簧、定时、中断、拖拽、图标、文件夹参数。
- Replay trace 录制、上次运行/基线比较、报告与聚焦报告导出。
- `window.__LUMERIA_DEBUG__.diagnostics` 下的 `motion-lab` 工具，可读写状态、选择/运行场景、更新参数、捕获回放、保存基线、比较和导出。

Vue 仍是该开发工具的依赖；本入口不新增产品依赖或宿主桥接。
