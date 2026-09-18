import type { Batch, Batcher, Container, RenderGroup } from "pixi.js";

/** Read submitted CPU-side default batches only. Packed color words are not floats. */
export function inspectStressGeometry(stage: Container) {
  const batchers = new Set<Batcher>(), unsupported = new Set<string>();
  let draws = 0, vertices = 0, indices = 0, maxAbsPosition = 0;
  const visit = (group: RenderGroup) => {
    const set = group.instructionSet;
    for (let i = 0; i < set.instructionSize; i++) {
      const instruction = set.instructions[i];
      if (instruction?.renderPipeId !== "batch") continue;
      const batch = instruction as Batch, batcher = batch.batcher;
      draws++;
      if (batch.start < 0 || batch.size < 0 || batch.start + batch.size > batcher.indexSize) throw new Error("Batch draw range exceeds active indices");
      if (batchers.has(batcher)) continue;
      batchers.add(batcher);
      if (batcher.name !== "default") { unsupported.add(batcher.name); continue; }
      const attributes = batcher.attributeBuffer.float32View;
      const count = batcher.attributeSize / 6;
      if (!Number.isInteger(count) || batcher.attributeSize > attributes.length || batcher.indexSize > batcher.indexBuffer.length) {
        throw new Error("Default batch size exceeds allocated CPU buffer");
      }
      for (let n = 0; n < batcher.attributeSize; n += 6) {
        for (let offset = 0; offset < 4; offset++) if (!Number.isFinite(attributes[n + offset])) throw new Error(`Non-finite vertex/UV in batcher ${batcher.uid}`);
        maxAbsPosition = Math.max(maxAbsPosition, Math.abs(attributes[n]!), Math.abs(attributes[n + 1]!));
      }
      for (let n = 0; n < batcher.indexSize; n++) if (batcher.indexBuffer[n]! >= count) throw new Error(`Index outside active vertices in batcher ${batcher.uid}`);
      vertices += count; indices += batcher.indexSize;
    }
    for (const child of group.renderGroupChildren) visit(child);
  };
  if (stage.renderGroup) visit(stage.renderGroup);
  return { stats: { draws, vertices, indices, maxAbsPosition, unsupported: [...unsupported] }, batchers };
}
