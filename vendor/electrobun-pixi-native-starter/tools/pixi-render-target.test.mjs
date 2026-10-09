import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as esm from "pixi.js";

const require = createRequire(import.meta.url);
const starter = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(starter, "../..");
const scales = [1, 1.25, 1.5, 1.75, 2, 2.25, 1.92, 2.88, 3.36];
const dimensions = [[1350, 900], [1351, 901], [1921, 1081]];

for (const [name, pixi] of [["ESM", esm], ["CommonJS", require("pixi.js")]]) {
  const { TextureSource, Texture, RenderTarget, RenderTexture, TexturePoolClass, FilterSystem, RenderTargetSystem, TexturePool } = pixi;
  test(name + ": lazy depth/stencil attachments match integer color extents", () => {
    for (const resolution of scales) for (const [width, height] of dimensions) {
      const color = new TextureSource({ width: width / resolution, height: height / resolution, resolution });
      const target = new RenderTarget({ colorTextures: [new Texture({ source: color })], isRoot: true });
      try {
        assert.deepEqual([color.pixelWidth, color.pixelHeight], [width, height]);
        assert.equal(target.depthStencilAttachment, undefined);
        target.ensureDepthStencilTexture();
        const depth = target.depthStencilAttachment.texture;
        assert.deepEqual([depth.pixelWidth, depth.pixelHeight], [width, height], "initial " + resolution);
        assert.deepEqual([Math.ceil(depth.pixelWidth), Math.ceil(depth.pixelHeight)], [width, height], "GPU allocation " + resolution);
        depth.sampleCount = 4;
        color.resize((width + 3) / resolution, (height + 1) / resolution, resolution);
        assert.deepEqual([depth.pixelWidth, depth.pixelHeight], [color.pixelWidth, color.pixelHeight], "resize " + resolution);
        assert.equal(depth.sampleCount, 4, "normalizing dimensions must retain multisampling");
        target.ensureDepthStencilTexture();
        assert.equal(target.depthStencilAttachment.texture, depth, "reuse must retain the original attachment");
      } finally { target.destroy(); color.destroy(); }
    }
  });
  test(name + ": fresh targets recreate depth/stencil correctly after resource replacement", () => {
    for (let generation = 0; generation < 3; generation++) {
      const resolution = 1.75;
      const target = new RenderTarget({ width: 1350 / resolution, height: 900 / resolution, resolution, depthStencilTexture: true });
      try {
        assert.deepEqual([target.pixelWidth, target.pixelHeight], [1350, 900]);
        assert.deepEqual([target.depthStencilAttachment.texture.pixelWidth, target.depthStencilAttachment.texture.pixelHeight], [1350, 900]);
      } finally { target.destroy(); }
    }
  });
  test(name + ": explicit external depth/stencil textures remain untouched", () => {
    const external = new TextureSource({ width: 900 / 1.75, height: 900 / 1.75, resolution: 1.75, format: "depth24plus-stencil8", sampleCount: 4 });
    const target = new RenderTarget({ colorTextures: 0, depthStencilTexture: external });
    const before = { width: external.pixelWidth, height: external.pixelHeight, resolution: external.resolution };
    try {
      target.ensureDepthStencilTexture();
      assert.equal(target.depthStencilAttachment.texture, external);
      assert.deepEqual({ width: external.pixelWidth, height: external.pixelHeight, resolution: external.resolution }, before);
      assert.equal(external.sampleCount, 4);
    } finally { target.destroy(); }
  });
  test(name + ": zero-sized depth-only targets retain their default extent", () => {
    const target = new RenderTarget({ colorTextures: 0, depth: true, width: 0, height: 0 });
    try { assert.deepEqual([target.pixelWidth, target.pixelHeight], [1, 1]); } finally { target.destroy(); }
  });
  test(name + ": backdrop copies clamp floating-point DPI bounds to physical source extents", () => {
    const resolution = 1.75, width = 1350, height = 900;
    const source = new RenderTarget({ width: width / resolution, height: height / resolution, resolution });
    const copies = [];
    const system = {
      getRenderTarget: () => source,
      adaptor: { copyToTexture: (_source, _destination, originSrc, size, originDest) => copies.push({ originSrc, size, originDest }) },
    };
    const filter = { renderer: { renderTarget: {
      copyToTexture: (...args) => RenderTargetSystem.prototype.copyToTexture.call(system, ...args),
    } } };
    let back;
    try {
      assert.equal(Math.ceil(source.colorTexture.height * resolution), 901, "probe must exercise the floating-point boundary");
      back = FilterSystem.prototype.getBackTexture.call(filter, source, {
        width: source.colorTexture.width, height: source.colorTexture.height, minX: 0, minY: 0,
      });
      assert.equal(copies.length, 1);
      assert.deepEqual(copies[0].size, { width, height }, "copy path must clamp the extra pixel");
      assert.ok(back.source.pixelWidth >= width && back.source.pixelHeight >= height);
    } finally {
      if (back) TexturePool.returnTexture(back);
      source.destroy();
    }
  });
  test(name + ": offscreen render textures and pooled caches retain matching masks", () => {
    const pool = new TexturePoolClass();
    try {
      for (const resolution of scales) {
        const textures = [
          RenderTexture.create({ width: 1350 / resolution, height: 900 / resolution, resolution, antialias: true }),
          pool.getOptimalTexture(137.25, 86.75, resolution, true),
        ];
        for (const [index, texture] of textures.entries()) {
          const target = new RenderTarget({ colorTextures: [texture] });
          try {
            target.ensureDepthStencilTexture();
            const color = texture.source, depth = target.depthStencilAttachment.texture;
            assert.ok(Number.isInteger(color.pixelWidth) && Number.isInteger(color.pixelHeight));
            assert.deepEqual([depth.pixelWidth, depth.pixelHeight], [color.pixelWidth, color.pixelHeight]);
          } finally { target.destroy(); }
          if (index === 0) texture.destroy(true); else pool.returnTexture(texture);
        }
      }
    } finally { pool.clear(true); }
  });
}

test("dependency patch is repeatable and rejects partial or changed source", () => {
  const root = mkdtempSync(join(tmpdir(), "lumeria-pixi-depth-test-"));
  const relative = "node_modules/pixi.js/lib/rendering/renderers/shared/renderTarget/RenderTarget.mjs";
  const files = [
    relative, relative.replace(".mjs", ".js"),
    ...["mjs", "js"].flatMap(extension => [
      "node_modules/pixi.js/lib/rendering/batcher/gpu/getTextureBatchBindGroup." + extension,
      "node_modules/pixi.js/lib/scene/text/canvas/CanvasTextPipe." + extension,
    ]),
  ];
  const run = () => spawnSync(process.execPath, [join(starter, "tools/patch-electrobun.mjs"), "--consumer-root", root, "--dependencies-only", "--check"], { windowsHide: true, encoding: "utf8" });
  try {
    for (const file of files) { mkdirSync(dirname(join(root, file)), { recursive: true }); copyFileSync(join(project, file), join(root, file)); }
    for (const [name, version] of [["pixi.js", "8.20.1"], ["electrobun", "2.0.1"]]) {
      mkdirSync(join(root, "node_modules", name), { recursive: true });
      writeFileSync(join(root, "node_modules", name, "package.json"), JSON.stringify({ version }));
    }
    const original = readFileSync(join(root, relative), "utf8");
    const checked = run(); assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    const args = [join(starter, "tools/patch-electrobun.mjs"), "--consumer-root", root, "--dependencies-only"];
    for (let attempt = 0; attempt < 2; attempt++) {
      const repeated = spawnSync(process.execPath, args, { windowsHide: true, encoding: "utf8" });
      assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
      assert.equal(readFileSync(join(root, relative), "utf8"), original);
    }
    writeFileSync(join(root, relative), original + "\n  _createDepthStencilTexture(width, height, resolution) {\n");
    const duplicate = run(); assert.notEqual(duplicate.status, 0);
    writeFileSync(join(root, relative), original.replace("      texture.resize();", ""));
    const missing = run(); assert.notEqual(missing.status, 0); assert.match(missing.stderr, /depth\/stencil creation changed/);
    const refused = spawnSync(process.execPath, args, { windowsHide: true, encoding: "utf8" });
    assert.notEqual(refused.status, 0, "applying must not silently accept a partial patch");
  } finally {
    const resolved = resolve(root), parent = resolve(tmpdir());
    assert.equal(dirname(resolved), parent);
    rmSync(resolved, { recursive: true, force: true });
  }
});
