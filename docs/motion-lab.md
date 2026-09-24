# Motion Lab

Motion Lab 是独立的动画调试页面，可运行预设场景、录制回放并比较结果。

## 启动

在仓库根目录运行：

```powershell
npm run dev:motion-lab
```

该命令使用根目录的 `vite.config.ts`，也为浏览器参考宿主测试提供开发服务器。`npm run dev` 启动 Native 产品。

打开终端输出的地址，再加 `/src/motionLab/index.html`，通常为 `http://127.0.0.1:5173/src/motionLab/index.html`。交互入口只在 Vite 开发模式启用。

用 `npm run build:motion-lab` 检查工具是否能独立构建，入口产物为 `dist/motion-lab/index.html`。构建只包含这个工具，不包含旧产品入口；Vue 是工具自身的依赖。

## 可以做什么

- 运行 12 个动画场景及内建断言。
- 使用四组预设，调整弹簧、时长、中断、拖拽、图标和文件夹参数。
- 录制 replay trace，与上次运行或保存的基线比较，导出报告。
- 通过 `window.__LUMERIA_DEBUG__.diagnostics` 的 `motion-lab` 工具读取状态、运行场景、更新参数和导出结果。

## 初始化状态

页面根节点的 `data-motion-lab-state` 可用于自动化检查：

| 状态 | 含义 |
| --- | --- |
| `initializing` | 正在创建动画运行时和 Pixi 渲染器 |
| `ready` | 场景和诊断工具已就绪，可以运行或录制 |
| `failed` | 初始化失败；按钮禁用，详细错误在控制台 |

页面卸载时停止轮询并销毁渲染器；未完成的异步初始化或场景运行不会继续写入页面状态。
