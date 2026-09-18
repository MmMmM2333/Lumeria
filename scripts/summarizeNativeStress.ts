import { createReadStream, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

type Sample = { timeUtc: string; kind?: string; cycle?: number; process?: { rss: number }; js?: { heapSize: number; extraMemorySize: number };
  nodes?: { count: number }; icons?: { gpuBytes: number }; runtime?: { deviceGeneration: number }; privateBytes?: number;
  privateWorkingSetBytes?: number | null; workingSetBytes?: number; counterError?: string;
  virtualMemoryTimeUtc?: string; virtualMemoryError?: string;
  virtualMemory?: { privateCommittedBytes: number; writeCombineCommittedBytes: number; readWriteCommittedBytes: number } };

async function* samples(path: string): AsyncGenerator<Sample> {
  if (!existsSync(path)) return;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line.replace(/^\uFEFF/, "")) as Sample;
}

/** Stream logs so reporting doesn't retain a second copy of a long run's samples. */
export async function summarizeNativeStress(directory: string): Promise<void> {
  let first: Sample | undefined, last: Sample | undefined, count = 0;
  const checkpoints: { sample: Sample; windows?: Sample; windowsDeltaMs: number; virtualMemory?: Sample["virtualMemory"]; virtualMemoryDeltaMs: number }[] = [];
  const peaks = { rss: 0, jsHeap: 0, jsExtra: 0, nodes: 0, iconGpuEstimate: 0, privateBytes: 0, privateWorkingSet: 0 };
  for await (const sample of samples(join(directory, "metrics.jsonl"))) {
    count++;
    if (sample.kind === "baseline") first = sample;
    if (sample.kind === "settled" || sample.kind === "after-idle-reopen" || sample.kind === "after-idle-rewarm") last = sample;
    if (["baseline", "settled", "after-idle-reopen", "after-idle-rewarm"].includes(sample.kind ?? "")) {
      checkpoints.push({ sample, windowsDeltaMs: Infinity, virtualMemoryDeltaMs: Infinity });
    }
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
      if (sample.virtualMemoryError) warnings.add(sample.virtualMemoryError);
      if (typeof sample.privateBytes !== "number") continue;
      windowsCount++;
      peaks.privateBytes = Math.max(peaks.privateBytes, sample.privateBytes);
      peaks.privateWorkingSet = Math.max(peaks.privateWorkingSet, sample.privateWorkingSetBytes ?? 0);
      const time = Date.parse(sample.timeUtc);
      const vmTime = Date.parse(sample.virtualMemoryTimeUtc ?? sample.timeUtc);
      // Only nearby checkpoints can match this sample; avoid O(all samples × all cycles).
      let low = 0, high = checkpoints.length;
      while (low < high) { const middle = (low + high) >>> 1;
        if (Date.parse(checkpoints[middle]!.sample.timeUtc) < Math.min(time, vmTime) - 6500) low = middle + 1; else high = middle; }
      for (let index = low; index < checkpoints.length; index++) {
        const cp = checkpoints[index]!, cpTime = Date.parse(cp.sample.timeUtc);
        if (cpTime > Math.max(time, vmTime) + 6500) break;
        const delta = Math.abs(cpTime - time), vmDelta = Math.abs(cpTime - vmTime);
        if (delta <= 3000 && delta < cp.windowsDeltaMs) { cp.windows = sample; cp.windowsDeltaMs = delta; }
        if (sample.virtualMemory && vmDelta <= 6500 && vmDelta < cp.virtualMemoryDeltaMs) {
          cp.virtualMemory = sample.virtualMemory; cp.virtualMemoryDeltaMs = vmDelta;
        }
      }
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
      last: Number.isFinite(lastDistance) ? lastDistance : null }, peaks, warnings: [...warnings], checkpoints };
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
    [...warnings].map(value => `- ${value}`).join("\n") + "\n\n## 每轮检查点\n\n" +
    "单位 MiB。WC/RW是VirtualQueryEx已提交区域分类，不是工作集或显存；VM分类匹配容差6.5秒（采样每5秒），进程计数容差3秒。\n\n" +
    "| 轮次/阶段 | 私有提交 | 私有WS | WC提交 | RW提交 | JS堆 | 图标GPU估算 | 节点 | 设备代次 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n" +
    checkpoints.map(cp => `| ${cp.sample.cycle ?? 0}/${cp.sample.kind} | ${mib(cp.windows?.privateBytes)} | ${mib(cp.windows?.privateWorkingSetBytes)} | ${mib(cp.virtualMemory?.writeCombineCommittedBytes)} | ${mib(cp.virtualMemory?.readWriteCommittedBytes)} | ${mib(cp.sample.js?.heapSize)} | ${mib(cp.sample.icons?.gpuBytes)} | ${cp.sample.nodes?.count ?? "?"} | ${cp.sample.runtime?.deviceGeneration ?? "?"} |`).join("\n") + "\n");
}
