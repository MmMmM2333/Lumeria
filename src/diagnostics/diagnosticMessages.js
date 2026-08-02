import { DiagnosticError } from "./diagnosticError.js";

export const DEFAULT_DIAGNOSTIC_LOCALE = "zh-CN";

const ZH_CN_MESSAGES = Object.freeze({
  "diagnostics.analysis.dataQuality.good": "捕获数据完整，可用于分析",
  "diagnostics.analysis.dataQuality.insufficient": "捕获数据不足，当前结论不可靠",
  "diagnostics.analysis.dataQuality.limited": "捕获数据存在缺口，分析结论需要结合上下文复核",
  "diagnostics.analysis.dataQuality.issue.coverage": "实际捕获时长只覆盖请求时长的 {coveragePercent}%",
  "diagnostics.analysis.dataQuality.issue.frameGap": "最大帧间隔 {maxFrameGapMs}ms，高于期望间隔 {expectedFrameGapMs}ms",
  "diagnostics.analysis.dataQuality.issue.noFrames": "捕获中没有帧采样，无法分析属性运动曲线",
  "diagnostics.analysis.finding.cancel.message": "捕获中记录了 {count} 次取消；取消可能是正常替换，也可能暴露生命周期中断。",
  "diagnostics.analysis.finding.cancel.observation": "最强取消事件发生在 {timeMs}ms，原因是 {reason}",
  "diagnostics.analysis.finding.cancel.title": "发生动画取消",
  "diagnostics.analysis.finding.counterEvidence.settled": "后续采样已回到目标附近，异常可能是短暂且已自行收敛",
  "diagnostics.analysis.finding.maxDelta.message": "这是捕获范围内观测到的最大目标差值，用于定位变化幅度最大的轨道；它本身不等同于故障。",
  "diagnostics.analysis.finding.maxDelta.observation": "{sourceLabel}.{prop} 在 {timeMs}ms 的绝对目标差值为 {value}",
  "diagnostics.analysis.finding.maxDelta.title": "最大目标差值",
  "diagnostics.analysis.finding.maxVelocity.message": "这是捕获范围内观测到的最大绝对速度，用于定位变化最快的轨道；它本身不等同于故障。",
  "diagnostics.analysis.finding.maxVelocity.observation": "{sourceLabel}.{prop} 在 {timeMs}ms 的绝对速度为 {value}",
  "diagnostics.analysis.finding.maxVelocity.title": "最大绝对速度",
  "diagnostics.analysis.finding.overshoot.message": "运行时明确记录了过冲警告，目标值曾越过预期终点。",
  "diagnostics.analysis.finding.overshoot.observation": "{sourceLabel}.{prop} 在 {timeMs}ms 附近触发 overshoot warning",
  "diagnostics.analysis.finding.overshoot.title": "检测到过冲",
  "diagnostics.analysis.finding.retarget.message": "捕获中记录了 {count} 次重定向；这是有用的生命周期事实，但不应脱离交互上下文直接判为故障。",
  "diagnostics.analysis.finding.retarget.observation": "最强重定向发生在 {timeMs}ms，原因是 {reason}",
  "diagnostics.analysis.finding.retarget.title": "发生目标重定向",
  "diagnostics.analysis.finding.warning.message": "运行时记录了 {warningType} 警告，需要检查对应轨道及其上下文。",
  "diagnostics.analysis.finding.warning.observation": "{sourceLabel}.{prop} 在 {timeMs}ms 附近触发 {warningType} warning",
  "diagnostics.analysis.finding.warning.title": "运行时报告警告",
  "diagnostics.analysis.nextAction.inspect": "检查 {timeMs}ms 附近的轨道状态与事件",
  "diagnostics.analysis.nextAction.reviewCancel": "确认取消是否来自预期的动画替换或组件销毁",
  "diagnostics.analysis.nextAction.reviewRetarget": "核对重定向前后的目标值与触发来源",
  "diagnostics.analysis.nextAction.reviewWarning": "检查警告轨道的驱动器、目标值和速度",
  "diagnostics.analysis.summary.attention": "发现 {warningCount} 项需关注问题，另有 {infoCount} 项观测",
  "diagnostics.analysis.summary.empty": "当前范围内没有可报告的诊断发现",
  "diagnostics.analysis.summary.insufficient": "捕获数据不足，暂时无法形成可靠结论",
  "diagnostics.analysis.summary.ok": "未发现需关注问题，共记录 {infoCount} 项观测",
  "diagnostics.analysis.motion.title": "Motion 捕获分析",
  "diagnostics.analysis.metric.duration": "捕获时长",
  "diagnostics.analysis.metric.eventCount": "事件数",
  "diagnostics.analysis.metric.frameCount": "帧数",
  "diagnostics.analysis.metric.maxDelta": "最大绝对目标差值",
  "diagnostics.analysis.metric.maxVelocity": "最大绝对速度",
  "diagnostics.analysis.metric.trackCount": "轨道数",
  "diagnostics.analysis.metric.warningCount": "运行时警告数",
  "diagnostics.confidence.high": "高置信",
  "diagnostics.confidence.low": "低置信",
  "diagnostics.confidence.medium": "中置信",
  "diagnostics.format.counterEvidence": "反证",
  "diagnostics.format.dataQuality": "数据质量",
  "diagnostics.format.evidence": "证据",
  "diagnostics.format.findings": "诊断发现",
  "diagnostics.format.metrics": "关键指标",
  "diagnostics.format.nextActions": "下一步",
  "diagnostics.format.noCounterEvidence": "未发现足以削弱该结论的反证",
  "diagnostics.format.observations": "观测",
  "diagnostics.format.summary": "结论",
  "diagnostics.severity.critical": "严重",
  "diagnostics.severity.error": "错误",
  "diagnostics.severity.info": "观测",
  "diagnostics.severity.warning": "需关注",
  "diagnostics.tools.motion.description": "捕获、回放并分析 Motion 运行时状态、轨道、事件和警告。",
  "diagnostics.tools.motion.operations.history.clear.title": "清除 Motion 历史",
  "diagnostics.tools.motion.operations.overlay.snapshot.title": "读取 Motion 覆盖层快照",
  "diagnostics.tools.motion.operations.replay.capture.start.title": "开始回放捕获",
  "diagnostics.tools.motion.operations.replay.capture.stop.title": "停止回放捕获",
  "diagnostics.tools.motion.operations.replay.document.analyze.title": "分析捕获文档",
  "diagnostics.tools.motion.operations.replay.document.close.title": "关闭捕获文档",
  "diagnostics.tools.motion.operations.replay.document.export.title": "导出捕获文档",
  "diagnostics.tools.motion.operations.replay.document.load.title": "载入捕获文档",
  "diagnostics.tools.motion.operations.replay.document.status.title": "读取捕获文档状态",
  "diagnostics.tools.motion.operations.replay.document.view.title": "查询捕获文档视图",
  "diagnostics.tools.motion.operations.replay.export.title": "导出运行时回放",
  "diagnostics.tools.motion.operations.report.generate.title": "生成 Motion 报告",
  "diagnostics.tools.motion.operations.report.read.title": "读取 Motion 原始报告",
  "diagnostics.tools.motion.operations.runtime.configure.title": "配置 Motion 诊断",
  "diagnostics.tools.motion.operations.runtime.snapshot.title": "读取 Motion 运行时快照",
  "diagnostics.tools.motion.title": "Motion 动画诊断",
  "diagnostics.tools.motion-lab.description": "运行 Motion 场景、调整参数、保存基线、比较结果并导出可分析捕获。",
  "diagnostics.tools.motion-lab.operations.baseline.save.title": "保存 Motion Lab 基线",
  "diagnostics.tools.motion-lab.operations.compare.run.title": "比较 Motion Lab 运行结果",
  "diagnostics.tools.motion-lab.operations.export.read.title": "导出 Motion Lab 数据",
  "diagnostics.tools.motion-lab.operations.params.update.title": "更新 Motion Lab 参数",
  "diagnostics.tools.motion-lab.operations.preset.apply.title": "应用 Motion Lab 参数预设",
  "diagnostics.tools.motion-lab.operations.replay.capture.title": "捕获 Motion Lab 回放",
  "diagnostics.tools.motion-lab.operations.scenario.run.title": "运行 Motion Lab 场景",
  "diagnostics.tools.motion-lab.operations.scenario.select.title": "选择 Motion Lab 场景",
  "diagnostics.tools.motion-lab.operations.scene.reset.title": "重置 Motion Lab 场景",
  "diagnostics.tools.motion-lab.operations.state.read.title": "读取 Motion Lab 状态",
  "diagnostics.tools.motion-lab.title": "Motion Lab 诊断",
  "diagnostics.tools.live-desktop.description": "读取 Live Desktop 运行时状态，并以可审计方式更新、应用和持久化调试设置。",
  "diagnostics.tools.live-desktop.operations.runtime.apply.title": "重新应用当前设置",
  "diagnostics.tools.live-desktop.operations.runtime.refresh.title": "刷新运行时状态",
  "diagnostics.tools.live-desktop.operations.settings.update.title": "更新调试设置",
  "diagnostics.tools.live-desktop.operations.state.read.title": "读取完整诊断状态",
  "diagnostics.tools.live-desktop.title": "Live Desktop 诊断",
  "diagnostics.tools.render.description": "捕获并检查 Pixi 渲染批次、帧缓冲、合成与文件夹视觉状态。",
  "diagnostics.tools.render.operations.capture.inspect.title": "捕获并检查渲染状态",
  "diagnostics.tools.render.operations.capture.manual.title": "手动捕获渲染状态",
  "diagnostics.tools.render.operations.folder-visual.snapshot.title": "读取文件夹视觉快照",
  "diagnostics.tools.render.operations.probe.arm.title": "启用渲染探针",
  "diagnostics.tools.render.operations.probe.clear.title": "清除渲染捕获",
  "diagnostics.tools.render.operations.probe.disarm.title": "停用渲染探针",
  "diagnostics.tools.render.operations.probe.freeze.title": "冻结渲染捕获",
  "diagnostics.tools.render.operations.report.export.title": "导出渲染报告",
  "diagnostics.tools.render.operations.report.read.title": "读取渲染报告",
  "diagnostics.tools.render.operations.report.summary.title": "读取渲染摘要",
  "diagnostics.tools.render.title": "Pixi 渲染诊断",
  "diagnostics.tools.scene.description": "读取、配置并清理拖拽命中、文件夹 handoff 与单舞台几何诊断状态。",
  "diagnostics.tools.scene.operations.folder-handoff.configure.title": "配置文件夹 handoff 诊断",
  "diagnostics.tools.scene.operations.state.clear.title": "清理场景诊断状态",
  "diagnostics.tools.scene.operations.state.read.title": "读取场景诊断状态",
  "diagnostics.tools.scene.title": "Pixi 场景诊断",
});

const CATALOGS = Object.freeze({
  [DEFAULT_DIAGNOSTIC_LOCALE]: ZH_CN_MESSAGES,
});

function requireCatalog(locale) {
  const normalized = String(locale || DEFAULT_DIAGNOSTIC_LOCALE);
  const catalog = CATALOGS[normalized];
  if (!catalog) {
    throw new DiagnosticError("diagnostic-locale-not-supported", `诊断输出暂不支持语言 ${normalized}`, {
      details: { locale: normalized, supportedLocales: Object.keys(CATALOGS) },
      nextActions: [`使用 ${DEFAULT_DIAGNOSTIC_LOCALE} 作为 locale`],
    });
  }
  return { catalog, locale: normalized };
}

function interpolate(template, values) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(values, name) ? String(values[name]) : match
  ));
}

export function hasDiagnosticMessage(key, options = {}) {
  const { catalog } = requireCatalog(options.locale);
  return Object.hasOwn(catalog, String(key || ""));
}

export function translateDiagnosticMessage(key, values = {}, options = {}) {
  const normalizedKey = String(key || "");
  const { catalog, locale } = requireCatalog(options.locale);
  if (!Object.hasOwn(catalog, normalizedKey)) {
    throw new DiagnosticError("diagnostic-message-not-found", `诊断消息目录缺少 ${normalizedKey || "(empty)"}`, {
      details: { key: normalizedKey || null, locale },
      nextActions: ["补充对应消息目录条目，或修正消息 key"],
    });
  }
  return interpolate(catalog[normalizedKey], values && typeof values === "object" ? values : {});
}

export function localizeDiagnosticDescriptor(descriptor = {}, options = {}) {
  const locale = String(options.locale || DEFAULT_DIAGNOSTIC_LOCALE);
  const titleKey = String(descriptor.titleKey || "");
  const descriptionKey = String(descriptor.descriptionKey || "");
  return {
    ...descriptor,
    description: descriptionKey ? translateDiagnosticMessage(descriptionKey, {}, { locale }) : undefined,
    locale,
    operations: (descriptor.operations || []).map((operation) => {
      const operationTitleKey = String(
        operation.titleKey
        || `diagnostics.tools.${descriptor.id}.operations.${operation.id}.title`,
      );
      return {
        ...operation,
        ...(hasDiagnosticMessage(operationTitleKey, { locale })
          ? { title: translateDiagnosticMessage(operationTitleKey, {}, { locale }) }
          : {}),
      };
    }),
    title: titleKey ? translateDiagnosticMessage(titleKey, {}, { locale }) : undefined,
  };
}
