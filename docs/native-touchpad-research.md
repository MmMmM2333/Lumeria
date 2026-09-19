# Native触控板研究（2026-09-08）

## 限速提交与预览清理授权（2026-09-09）

用户明确要求提交默认4页/秒方案并清理已打开预览。按已通过swipe-speed-default-smoke.log及相关检查提交，录制工具与原始JSON保留；只关闭本轮隔离预览进程及对照服务，不删除运行目录或采集文件。下文“未提交/预览已打开”为当时状态。

## 默认档位确认（2026-09-09）

最终默认4档完整GPU回归exit0（swipe-speed-default-smoke.log），普通鼠标、列表、触控板阶段、窗口与文件夹流程通过；独立模块检查默认及F9循环为4→0→6→4。未自动提交，已运行且用户选4的旧预览可继续试用，重新构建/启动后默认4。

用户试用后确认“4页的手感刚好”。共享DEFAULT_PAGE_SWIPE_SPEED设为4，普通运行/Web/native采集预览一致；6与0保留为会话内F9调试对照，不写用户配置。测试临时切换后恢复先前档位，避免测试把生产默认污染成0；F9自测更新为4→0→6→4。三套类型、领域与scene测试通过；默认启用GPU回归日志swipe-speed-default-smoke.log待收取。限速修改尚未提交，基线1d9271f不变。下文“仅预览启用、默认0”为选择档位前的历史记录。

## 快滑显示限速对照已实现（2026-09-09）

基线1d9271f已提交，用户授权继续做基线/6页每秒/4页每秒对照并保留录制。本轮仅预览启用限速，普通运行默认0（基线），不保存用户设置。公开渲染入口pageSwipePreview拥有会话档位，native和Web采集面板F9/按钮循环6→4→0→6；录制start和speed事件保存档位。消费者本轮未提交，上游/vendor无新增改动。

共享引擎为连续wheel presentation增加continuousWheel/sampleTime，Web和native沿同一scene契约传递；离散滚轮、鼠标拖动、列表和页边界反馈不套用该限速。pageTrackMotion普通低速仍直接scrub；极快请求以实际显示位置为起点追向最新目标，不缓存或重播增量。主动期线性速度上限，释放期以二次ease-out减速并按2×剩余距离/上限计算时长，保持峰值不超档位。数值是最大显示速度，不承诺完整页固定167/250ms完成。反向位置连续、下一帧响应；同帧输入/释放也不能绕过限速；输入presentation提前过期时同目标动画继续，避免切回普通spring。

验证：慢滑立即跟随、4/6档逐帧速度、反向连续、松手无跳变无过冲、同帧释放、重复render不重启、presentation过期、非wheel不变均有确定性回归。swipe-speed-check.log完整npm check通过；其后presentation过期保护/档位录制断言补验app/native类型、领域/场景测试通过。swipe-speed-smoke.log完整实际GPU exit0，含两档中间帧和实际含页间距终点，原鼠标/列表/窗口/文件夹回归通过；首次失败暴露同帧输入释放跳过限速并已修复，另一次测试误将输入页宽作渲染跨度，已改实际目标比较。F9三档/录制导出native自测通过（swipe-speed-ui-selftest.log）。Web实际用户轨迹回放三档无过冲，结果swipe-speed-web.json及UI截图已查看；回放受浏览器调度影响，不视为硬件精确时长。两档native中间帧已查看。

最终预览标题LaunchPad · Swipe speed preview，.codex-dev/swipe-speed-final-preview，日志swipe-speed-final-preview.log；默认6，F9切4/基线。下一步用户比较主观手感后决定默认档位；不自动提交或将实验参数称为macOS参数。用户真实录制和旧基线保留。

## 基线提交授权（2026-09-09）

用户明确要求先提交当前触控板接管与过冲修复，再继续快速滑动显示限速对照。当前提交包含采集工具、真实录制验证、Starter0.2.16及页面结算修复。下文“未提交”为历史状态。下一阶段只做极快显示进度的平滑限速，保留当前基线和两档对照，不改变普通滚轮/列表策略。

## 当前交付结论（2026-09-09 01:38）

已完成这轮已确认范围：共享落页过冲/反向隐藏距离修复，native系统触控板阶段与像素适配，鼠标回退、列表惯性单次消费、上下文取消、正式Starter0.2.16接入。用户第三份449事件真实触控板接管成功，8主动手势各一次提交、388惯性事件不连翻。正式vendor547文件/ABI通过；上游091148a本地固定发行提交，未推送。消费者未提交。

最终验证：touchpad-final-check.log完整npm check通过；之后仅补列表GPU验证与测试清理调用，native/tools类型补验通过。touchpad-final-smoke.log正式vendor全量GPU exit0，包含真实Pixi阶段路由、40帧惯性不二次提交、打开设置取消旧手势、列表28+40=68逻辑像素不额外惯性且不翻页，以及原窗口/鼠标/保存/20次文件夹/启动回归。上游46host tests/217断言、release generate/verify、独立空目录consumer typecheck/build/实际app smoke均通过。16次用户Web释放回放无过冲，实际Web图已验证。新平滑限速未实施，待体验方案确认；本机触控板以外设备/混合DPI仍需额外硬件验收。

已清理临时SDK/Pixi源码覆盖和限量诊断，0.2.15备份已删除；用户原始JSON保留。最终预览Touchpad preview，.codex-dev/touchpad-complete-runtime，日志touchpad-complete-preview.log。后文是过程与历史失败记录，不再作为当前状态。

## 当前实施（2026-09-09）

硬件反馈3成功：touchpad-native-1788887760650.json，449wheel全部source=touchpad，其中begin8/update45/inertia388/cancel7/end1；8个真实主动手势分别仅提交一页，尾段没有第二次提交。cancel紧接下一次begin，是打断旧惯性，不是加载错误；最终end自然结束。整份实录重放commit [1,2,1,0,1,2,1,0]与现场一致。根因确认viewport必须注册实际surfaceWindow，根窗口注册+子窗口监听仍不够。

已清除头文件限量诊断，保留错误提示；源码补丁可重建，C++编译/上游类型/46host tests(217断言)通过。上游本地提交091148a，Starter0.2.16，wrapper SHA256=22a30e5a31ed3e95c4005d63605dc91e2498c3732bef0a022d92ec27650f1cb4，547文件manifest generate/verify和正式install-consumer通过。正式vendor已安装，临时上游/Pixi路径覆盖已移除。消费者新增手势开始时区域归属保护，设置或文件夹上下文改变后丢弃旧阶段，避免惯性跨上下文。完整项目check已通过，最终touchpad-verified-smoke.log及上游touchpad-release-smoke.log收尾中。0.2.15备份暂存.codex-dev/starter-0.2.15-touchpad-backup，完成后按授权范围清理。消费者仍未提交。

### 快速滑动动画过短：追加分析，尚未修改

用户要求等当前修复结束后分析限速及macOS做法。第三份实录的主动阶段仅66–120ms，8次中后5次在首个inertia前progress已到1，因此修掉过冲后几乎没有剩余落页行程；只限制松手速度/加最低settle时长无效，可能只是停在终点空等。需要分别设计输入目标进度与显示进度，平常滑动即时跟随，仅极快输入做平滑速度饱和；不能丢弃增量或排队播放多页。新的反向输入可立即重定向，单次目标仍限相邻一页，松手从当前显示位置单调收敛。建议比较约4–6页/秒视觉上限（完整页约167–250ms）作为实验起点，而非Apple参数；不把全局鼠标/列表一起限速。另选项是压缩高速输入到进度的映射，但会改变操作距离，需要对照体验确认。

Apple公开AppKit trackSwipeEvent文档提供经过处理的gestureAmount、phase与isComplete，物理手势结束后继续回调动画至-1/0/1，边界自动阻尼：https://developer.apple.com/documentation/appkit/nsevent/trackswipeevent(options:dampenamountthresholdmin:max:usinghandler:)
官方Handling Trackpad Events区分phase/momentumPhase并解释惯性路由保持原视图：https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingTouchEvents/HandlingTouchEvents.html
这些可支撑交互结构，不能证明Launchpad/Spaces具体曲线、最大速度或固定时长；没有Mac实机测量，不宣称逐像素复刻。

硬件反馈2（01:08）：touchpad-native-1788885931333.json，schema2、315wheel全部unknown/null、12页提交，无溢出；touchpad-child.log只有input windows=3，完全没有DM_POINTERHITTEST/SetContact/content update。证明加子窗口监听仍未接管，不能归咎Pixi元数据丢失。候选修正：native-app现在将Direct Manipulation viewport绑定surfaceWindow（实际WGPU HWND），而非resolveInputWindow返回的顶层HWND；输入头文件沿父链监听生命周期，坐标属于表面，timer也在表面。原始wheel限量打印GetCurrentInputMessageSource与是否viewport窗口。头文件仍在独立源码工作树，改后尚未refresh正式patch或发行。

该候选C++编译及上游typecheck通过；touchpad-surface-runtime正在完整GPU验证（72904，touchpad-surface-smoke.log）。通过后启动标题Touchpad test 3，仅需用户慢滑/快甩一次确认DM命中，若仍无DM消息需进一步独立系统探针，不能假称已修。前两份硬件失败样本均保留。正式vendor保持0.2.15。

硬件反馈1：用户新文件touchpad-native-1788884471783.json来自touchpad-ready-runtime，609 wheel全部unknown/null，无任何DM阶段，确认初始化成功不代表真实接管。已查Pixi nativeEvent保留路径，转查HWND命中：原桥仅顶层；当前候选将同一DM viewport的命中监听覆盖顶层及两个GPU子窗口（日志input windows=3），timer/viewport尺寸仍由顶层拥有。增加前5次DM_POINTERHITTEST/SetContact与前3次content update诊断。Touchpad test 2实例PID20964，目录touchpad-child-runtime，日志touchpad-child.log，输出1788885931333；已异步请用户只录慢滑/快甩各两次并导出。目前未发行，正式vendor仍0.2.15，不能声称硬件通过。

补充验证：最终领域、场景、npm check通过；实际Web页面重放快速样本采到页面spring，无过冲（web-settle-fixed.png和web-settle-frames.json）。上游输入4 tests/23断言通过，候选DM宿主完整GPU touchpad-integrated-smoke.log exit0（不代表硬件接管）。最初无界面失败的dm/dm2/dm3运行包进程已按路径确认后结束；用户采集实例未结束。新头文件已生成进正式上游补丁，但子窗口修正后需要再次refresh并编译/hash更新。

用户已授权完整推进共用落页过冲及native触控板适配。保留前轮采集工具未提交变更，不重置工作区。

共用实现：pageTrackMotion按非振荡弹簧慢极点与剩余距离约束释放速度，只作用于页面；用户16次Web释放回放过冲均归零，双方向单调收敛测试加入pageTrackMotionTests。手势引擎分离意图速度/视觉速度，travel饱和到相邻页消除反向“隐形欠账”；领域测试通过。新增wheelSource/phase处理明确触控板begin/update/inertia/end/cancel，不进离散重复，不靠140ms静默终止主动阶段。鼠标保持原路径。

上游候选：独立Electrobun源码工作树webgpu test/.cottontail-tmp/acrylic-native-source新增package/src/native/win/native_touchpad.h（尚未汇入正式patch）。Direct Manipulation只识别输入，COM创建/销毁与WM_POINTERHITTEST/SetContact/活动期8ms更新在UI线程，事件通过有界队列和process-lived线程安全wake给Bun；含焦点/隐藏/resize取消。新增4个wrapper导出ABI1。src/platform/native-touchpad.ts及native-app/native-events/native-host已接入，像素DPI仅转换一次、与raw输入用GetTickCount64统一时钟并按时序合流，fallback wheel不篡改。宿主类型、输入归一化4 tests/23断言通过。

隔离构建脚本临时TOUCHPAD_UPSTREAM_PROBE引用上游src和同一SDK/Pixi，最初混合两份Pixi导致browserExt2 ReferenceError已定位修正；旧dm/dm2/dm3诊断启动进程需清理（仅这些本任务实例）。正式vendor未改，未发行。当前可操作的Touchpad test为touchpad-ready-runtime，日志touchpad-ready.log，采集输出178888454…见日志；已异步请用户F6滑动/F8导出验证真实阶段，目前尚无新实录。之后修了共享时钟及去除伪重置阶段，下一候选需重新编译/完整GPU。不能声称已硬件验收。

进行中：上游编译会话77381；消费者npm check会话2103，日志.codex-dev/touchpad-check.log。下一步收结果，完整GPU、Web界面回放、实际硬件录制；若系统桥正确再生成完整patch、哈希/版本发行及安装。最终清理临时源码覆盖，保留采集用户数据。尚未提交。

状态：研究，未实施。基线24b66e7。用户反馈偶尔多滑、手感不及原版；尚无真实触控板输入录制，不能将合成样本认定为用户设备根因。

## 采集入口已准备（2026-09-08）

### 第一份用户实录分析

### Web对照与长滑过冲（用户文件1788882155576）

来源本地触控板采样 touchpad-web-1788882155576.json，34.447秒，3246 wheel/169 decision/16翻页，无异常标记、无溢出。视口887×695、DPI1.25；从首个进度与dx反推实际分页跨度695.200012像素。关键证据：momentum=false137条、true3109条，此浏览器确实提供惯性信息；native记录全部null。不能把此前“原版未必提供”继续当本机事实；本次是已提供。大段惯性跨越手势间隔，不能再用360ms空隙等同单个手势。Web首帧常1–11，native各段首帧均大于80；两次并非同一物理动作，不能据此拟合固定缩放比例。

用现有共享引擎重放Web全部wheel（按eventTime调度deadline），得到16次settle；与录制进度/翻页匹配。再用实际pageTrackMotion与motionRuntime/layout弹簧（k190,c28,m0.9，1/120秒步长）重放这些释放状态：前4次慢滑无过冲，后12次快滑出现约37.8–297.4逻辑像素过冲。例：13.701秒progress1、velocity20.309页/秒→259.1px；31.013秒progress0.999712、velocity23.330→297.4px。不是实录屏幕位移，属于实录输入+现有实现的确定性计算，需后续界面验收。

根因：跟手progress被clamp到1，但原始轮速仍不断累积；进入惯性时把directionVelocity原样传给页面spring，即使已到目标也带巨大初速向前冲。layout弹簧本身近过阻尼（阻尼比约1.07），不能仅以“弹簧太弹”解释。零初速对照全部无过冲；实验按剩余距离限制结算初速min(v,10*(1-progress))也全部无过冲，10仅诊断参数、非生产方案。

体验建议：翻页意图速度与视觉释放速度分开；视觉速度跟踪实际呈现位移，夹到页终点后不能继续蓄积；接近目标按剩余距离降低速度，到目标时速度归零；正常跨页落点单调收敛，首尾边界保留有限橡皮筋反馈。避免全局改layout弹簧影响图标布局/拖放，也不取消短快甩的翻页意图。新的主动手势从当前实际位置接管、取消旧settle；仅惯性尾段不得启动第二页。Native需要补可靠来源/阶段及单位，不能把两份非同步手势得出某个固定倍率。本轮仅研究，未改行为。诊断脚本.codex-dev/analyze-web-touchpad.ts。

文件artifacts/touchpad-captures/touchpad-native-1788881094360.json，用户于23:28导出，非selftest。900×600逻辑视口、1.25DPI，124.44秒时间范围内5段录制，1632 wheel、92 decision、46 page提交、5异常标记，无溢出。全部desktop、横向dx，dy=0，momentum=null；没有列表或文件夹样本。以>360ms间隔分组得到40段事件流（仅分析分组，不等同硬件手势边界），所有段首abs(dx)>80。源事件未知，不能判断手指离开时刻。

5个标记时间107.254/110.057/112.815/118.568/120.608秒，紧前事件流分别63/73/92/53/64条，持续891/1064/1347/776/905ms；每段首帧提交一页，随后约302/304/303/311/300ms再提交一页。直接把这5段原始eventTime/dx/mode送入现有共享引擎，复现0与302/304/303/312/300ms两次提交，方向/目标页与采集结果一致。确认触控板实录被首帧>=80规则归为离散滚轮，第二页由300ms自动重复触发，不是纯绘制惯性假象。

增量范围-1766.67至1651.67，标记流累积绝对位移约3.66万至5.35万所谓像素；短流也常达千级。这是Win32滚轮单位经固定换算后的量，未校准为手指逻辑位移；不能只强制continuous否则跟手进度仍可能过大。当前事件流有非单调/大尾值，不可直接把尾段全标momentum。下一步请用户Web对照版录慢滑/快甩与异常标记（浏览器运行、非完整Tauri），比对数值幅度和交付节奏；必要时再补宿主原始来源/阶段。未修改行为。

用户授权开始准备采集版。尚未修改手势策略，新增可选开发采集：native通过scripts/runNativeElectrobun.ts --dev --isolated --touchpad-capture；Web通过本机Vite地址?touchpadCapture=1。F6开始/停止、F7异常标记、F8导出，面板按钮同样可用。暂停后继续保留旧片段；30000事件上限自动停止。只白名单导出增量/时间/决策/列表偏移/尺寸，去掉具体folder id，不记录文本和应用路径。设备来源及原始Win32输入当前不可用，显式unknown/false。Web是原版Vue链路在浏览器中运行，非完整Tauri宿主对照。

验证：场景测试含保留片段、隐私字段过滤、上限通过；三套类型、policy、i18n（1244词条）通过；native实际窗口F6/F7/F8与JSON自测通过并正常退出，截图artifacts/touchpad-captures/capture-ui.png已查看；Web Playwright真实wheel/mark/download通过，web-capture-ui.png已查看。自测文件由touchpad-selftest.log标识，分析时不得混入真实样本。

用户采集实例：.codex-dev/touchpad-user-runtime，日志.codex-dev/touchpad-user.log；输出路径见日志Touchpad capture ready行，目录artifacts/touchpad-captures。Vite127.0.0.1:4186已启动。下一步等待用户录native慢滑/快甩并F8导出，读取该实例JSON分析；不把自动合成wheel当硬件验收。未提交。

## 已查证的实现

- native-frame.rs读取WM_MOUSEWHEEL/WM_MOUSEHWHEEL的有符号delta，事件默认pointer_type=mouse，不保存输入来源或手势阶段。wheel不属于coalescable_input，未发现该队列把多帧滚动直接合并放大的路径。
- native-events.ts将120单位换算100像素，deltaMode=0；这是统一约定，不是物理触控板位移。nativeMain.ts固定momentum=null。
- 共享引擎首样本abs(delta)>=80即可能判离散滚轮：立即翻页，300ms后允许重复，随后220ms间隔。连续分支靠140ms静默结束，提交由16%页面进度或0.55页/秒速度决定；有momentum时已有尾段draining，但并非所有宿主能提供。
- 原版Vue适配仅在事件确有boolean momentum时透传，否则也是null。因此不能说原版Windows必然有惯性标记。
- 合成重放delta100、时间0/16/32/320/550/780ms：momentum=null提交4页；首帧之后标惯性只提交1页。证明可触发机制，未证明真实设备事件形状。
- NativeScrollView直接累加deltaY，与桌面分页是不同消费路径；不应对列表也强制每次手势只移动一页。
- 宿主时间戳在消息处理时生成；若UI线程积压，需要同时记录消息时间/入队/消费时间，避免速度估计被压缩间隔放大。逐事件选主轴也值得用斜向样本验证，但未证实用户问题来自该处。

## 平台依据与限制

- Windows默认会把未接入高保真触控板技术的手势交给ninput处理，通常转成鼠标滚轮消息：https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/precision-touchpad-portal
- GetCurrentInputMessageSource可以查询设备与来源，但不能保证传统滚轮链路能识别触控板，更不能据此获得惯性阶段：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcurrentinputmessagesource
- 新RegisterTouchpadCapableWindow/Thread文档明确：注册后设备源才可能从MOUSE变为TOUCHPAD；GetCurrentInputMessageSource等行为要求线程级能力，注册也会改变WM_POINTER投递。文档仍带预发布提示，不能当现有全部Win10/Win11默认可用路径：https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- 成熟实现参考Flutter Windows Direct Manipulation：处理RUNNING/INERTIA、内容变换差分、结束/惯性取消和重置抑制。不是只给wheel附一个字段：https://raw.githubusercontent.com/flutter/flutter/master/engine/src/flutter/shell/platform/windows/direct_manipulation.cc

## 推荐推进

1. 先录制同设备原版/native短慢滑、快甩、尾段轻触停止、快速反向、连续两次、斜向、页边界、文件夹和列表滚动。只记数值/时间/来源/阶段/消费区域/页提交，不记应用名称、文本或路径。用轨迹重放验证，不以合成wheel冒充真实触控板验收。
2. 若需要长期接近原版手感，优先独立验证Direct Manipulation输入桥，保持Pixi为唯一绘制者。宿主输出来源、begin/update/end/cancel、inertia及统一逻辑位移；屏幕DPI仅转换一次。线程/COM生命周期、输入区域命中和resize/reset必须明确。
3. 桌面和文件夹接既有共享引擎：已知触控板不走首帧大delta离散分类；手指结束时结算，惯性不能新建同方向翻页，新的真实手势允许继续。列表使用同源连续位移及系统惯性或现有唯一惯性所有者，不叠加第二套惯性。
4. Direct Manipulation处理过的输入不能再通过兼容wheel处理一次；scroll目标在手势期间固定，失焦/隐藏/弹窗切换释放。传统鼠标与不支持的触控板保留wheel回退，无法识别保持unknown，不假装精确来源。
5. 如采样证明只需修现有wheel分类，可先做有明确局限的小修；不默认全局降灵敏度、延长冷却或“delta大就是鼠标”。纯启发式无法可靠区分惯性尾段与第二次主动滑动。

验收：普通鼠标滚轮不退化；快甩不多翻、慢滑跟手、反向及时、重新触碰能停止惯性；列表距离/尾段对齐；窗口100/125/150%DPI、一屏/文件夹边缘和后台负载；原始消息到屏幕延迟与提交页数有记录。新触控板API作为后续能力探测选项，不预建多套实现。
