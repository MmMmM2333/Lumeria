import { createReadStream, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

type Sample = { timeUtc: string; kind?: string; process?: { rss: number }; js?: { heapSize: number; extraMemorySize: number };
  nodes?: { count: number }; icons?: { gpuBytes: number }; runtime?: { deviceGeneration: number }; privateBytes?: number;
  privateWorkingSetBytes?: number | null; workingSetBytes?: number; counterError?: string };

async function* samples(path: string): AsyncGenerator<Sample> {
  if (!existsSync(path)) return;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line.replace(/^\uFEFF/, "")) as Sample;
}

/** Stream logs so reporting doesn't retain a second copy of a long run's samples. */
export async function summarizeNativeStress(directory: string): Promise<void> {
  let first: Sample | undefined, last: Sample | undefined, count = 0;
  const peaks = { rss: 0, jsHeap: 0, jsExtra: 0, nodes: 0, iconGpuEstimate: 0, privateBytes: 0, privateWorkingSet: 0 };
  for await (const sample of samples(join(directory, "metrics.jsonl"))) {
    count++;
    if (sample.kind === "baseline") first = sample;
    if (sample.kind === "settled" || sample.kind === "after-idle-reopen") last = sample;
    peaks.rss = Math.max(peaks.rss, sample.process?.rss ?? 0);
    peaks.jsHeap = Math.max(peaks.jsHeap, sample.js?.heapSize ?? 0);
    peaks.jsExtra = Math.max(peaks.jsExtra, sample.js?.extraMemorySize ?? 0);
    peaks.nodes = Math.max(peaks.nodes, sample.nodes?.count ?? 0);
    peaks.iconGpuEstimate = Math.max(peaks.iconGpuEstimate, sample.icons?.gpuBytes ?? 0);
  }
  let windowsFirst: Sample | undefined, windowsLast: Sample | undefined, firstDistance = Infinity, lastDistance = Infinity, windowsCount = 0;
  const warnings = new Set<string>();
  for (const entry of readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith("Lumeria-memory-"))) {
    for await (const sample of samples(join(directory, entry.name, "samples.jsonl"))) {
      if (sample.counterError) warnings.add(sample.counterError);
      if (typeof sample.privateBytes !== "number") continue;
      windowsCount++;
      peaks.privateBytes = Math.max(peaks.privateBytes, sample.privateBytes);
      peaks.privateWorkingSet = Math.max(peaks.privateWorkingSet, sample.privateWorkingSetBytes ?? 0);
      const time = Date.parse(sample.timeUtc);
      const d1 = first ? Math.abs(time - Date.parse(first.timeUtc)) : Infinity;
      const d2 = last ? Math.abs(time - Date.parse(last.timeUtc)) : Infinity;
      if (d1 < firstDistance) { firstDistance = d1; windowsFirst = sample; }
      if (d2 < lastDistance) { lastDistance = d2; windowsLast = sample; }
    }
  }
  if (firstDistance > 3000) { windowsFirst = undefined; warnings.add("No Windows baseline sample within 3 seconds"); }
  if (lastDistance > 3000) { windowsLast = undefined; warnings.add("No Windows final checkpoint sample within 3 seconds"); }
  const report = { metricsSamples: count, windowsSamples: windowsCount, firstCheckpoint: first, lastCheckpoint: last,
    windowsFirst, windowsLast, windowsMatchDeltaMs: { first: Number.isFinite(firstDistance) ? firstDistance : null,
      last: Number.isFinite(lastDistance) ? lastDistance : null }, peaks, warnings: [...warnings] };
  writeFileSync(join(directory, "summary.json"), JSON.stringify(report, null, 2));
  const rows: [string, number | undefined | null, number | undefined | null, number][] = [
    ["Windows 私有提交", windowsFirst?.privateBytes, windowsLast?.privateBytes, peaks.privateBytes],
    ["Windows 私有工作集", windowsFirst?.privateWorkingSetBytes, windowsLast?.privateWorkingSetBytes, peaks.privateWorkingSet],
    ["进程 RSS", first?.process?.rss, last?.process?.rss, peaks.rss],
    ["JSC 堆", first?.js?.heapSize, last?.js?.heapSize, peaks.jsHeap],
    ["JSC 堆外附属内存", first?.js?.extraMemorySize, last?.js?.extraMemorySize, peaks.jsExtra],
    ["图标 GPU 驻留估算", first?.icons?.gpuBytes, last?.icons?.gpuBytes, peaks.iconGpuEstimate],
  ];
  const mib = (value: number | null | undefined) => value == null ? "不可用" : (value / 1048576).toFixed(2);
  writeFileSync(join(directory, "summary.md"), `# Native 压测内存观察\n\n单位 MiB；预热基线与最后一次相同场景检查点比较。峰值包含活动期。各行存在重叠，不能相加。\n\n` +
    `| 指标 | 基线 | 最后检查点 | 差额 | 峰值 |\n|---|---:|---:|---:|---:|\n` +
    rows.map(([label, a, b, peak]) => `| ${label} | ${mib(a)} | ${mib(b)} | ${mib(a == null || b == null ? null : b - a)} | ${mib(peak || null)} |`).join("\n") +
    `\n\n场景节点：${first?.nodes?.count ?? "未知"} → ${last?.nodes?.count ?? "未知"}；设备代次：${first?.runtime?.deviceGeneration ?? "未知"} → ${last?.runtime?.deviceGeneration ?? "未知"}。\n\n` +
    `这些计数不能单独证明泄漏，也不能确定 WC 分配属于 Dawn 还是驱动。查看 metrics.jsonl 中各轮 settled/idle 趋势；需要分配归属时补 VirtualAlloc 调用栈。\n\n` +
    [...warnings].map(value => `- ${value}`).join("\n") + "\n");
}
