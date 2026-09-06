# Native UI 基础组件

本目录维护跨设置页面共用的绘制和布局规则，不接入设置草稿、扫描或保存业务。

- `nativeUiTheme`：保留 Alpha 的语义颜色，以及分组/展开/滚动间距。Switch 与 Checkbox 使用各自的状态颜色。
- `NativeSingleLineText` / `nativeRowSummary`：普通行说明和摘要按字形边界省略，摘要右对齐到箭头列前的固定间距；侧栏动画插值可用宽度，不拉伸文字。
- `NativeDisclosureSurface`：展开背景、顶部分隔线、上下内边距、内容裁剪；进度由上层动画控制，收起时禁用输入。
- `NativeDisclosureCard`：标题与详情共享的外部圆角背景及边框，随详情高度变化；标题作为内部无边框行，避免两张卡片之间出现缝隙。
- `NativeInputFrame`：输入背景、内部圆角裁剪和最后绘制的统一外框，避免子按钮吞掉描边。
- `nativeSettingsTransition`：侧栏切换前捕获当前几何，将新宽度布局从该画面连续过渡到目标；文字保持字号并按中间宽度换行，快速反向使用当前插值位置，滚动高度同步过渡。过渡期间右侧鼠标输入暂停，避免使用终态命中框操作中间画面。

现有 `NativeFluentButton`、`NativeFluentToggle`、`NativeSpinButton`、`NativeScrollView`、`NativeSegmentedControl` 和 `nativeSettingsInput` 是公共控件入口。沿用入口逐步迁移内部实现，避免无行为收益的路径搬迁。`NativeScrollView` 的 padding 属于内容，滚动轨道位于视口边缘。页面不能再通过额外透明按钮覆盖标题，或将 RGBA 颜色直接转换成不带 Alpha 的 RGB 背景。

每个控件修改至少检查深浅主题、普通/悬停/按下、选中/禁用/键盘焦点。布局验证包含完整边缘、裁剪与命中；动画验证包含中途反向及销毁。真实 GPU 状态对照图由 `nativeUiGallery` 生成，不能仅凭业务值变化认定样式正确。

透明按钮禁用后仍保持透明背景；额外绘制的图标通过 `addStateGraphic` 接收禁用前景色。输入焦点移动只更新相关控件，来源字段失焦保存不销毁仍在编辑的页面；设置事务开始时锁住交互并保留现有预览，完成后才同步页面。

取消/应用由设置外壳长期持有，内容重绘不能销毁这两个按钮。保存忙碌使用逻辑交互锁，不将短暂忙碌绘制成禁用色闪变；遮罩关闭要求完整点击，不能在一次按下时立即销毁对话框。
