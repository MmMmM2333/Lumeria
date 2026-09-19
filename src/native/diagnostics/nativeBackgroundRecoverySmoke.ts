import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sprite } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NativeBackground, type NativeBackgroundConfig } from "../../rendering/native/NativeBackground.js";

/** OS capture precedes readback; reading a RenderTexture cannot regenerate its contents. */
export async function runNativeBackgroundRecoverySmoke(o: {
  app: NativePixiApplication; background: NativeBackground; config: NativeBackgroundConfig; directory: string;
  present(): Promise<void>; recover(): Promise<void>; screenshot(name: string): Promise<void>;
}) {
  const proof: unknown[] = [];
  const read = async (background = o.background) => {
    const sprite = background.getChildByLabel("native-background-image") as Sprite;
    assert.ok(sprite.visible && sprite.texture.width > 1, "Background must have a rendered image");
    const result = await o.app.renderer.extract.pixels({ target: sprite.texture });
    return Uint8Array.from(result.pixels);
  };
  // Same independently configured instance used by the settings preview cards.
  const preview = new NativeBackground(o.app, () => o.app.invalidate());
  preview.position.set(640, 360); o.app.stage.addChild(preview);
  try {
  for (const effect of ["none", "blur", "acrylic"] as const) {
    await o.background.configure({ ...o.config, backgroundEffect: effect }, o.app.contentSize.width, o.app.contentSize.height);
    await preview.configure({ ...o.config, backgroundEffect: effect }, 160, 100);
    await o.present(); await o.screenshot(`background-${effect}-before`);
    const expected = await read();
    const previewExpected = await read(preview);
    assert.ok(expected.some((value, index) => index % 4 !== 3 && value > 30), "Baseline must contain colored background pixels");
    await o.recover(); await o.present();
    await o.screenshot(`background-${effect}-after`);
    assert.deepEqual(await read(preview), previewExpected, "Independent settings preview must recover with the live renderer");
    const compare = async (trigger: string) => {
      const actual = await read();
      let changed = 0, maxDifference = 0;
      for (let index = 0; index < expected.length; index++) {
        const difference = Math.abs(expected[index]! - (actual[index] ?? -255));
        if (difference > 1) changed++;
        maxDifference = Math.max(maxDifference, difference);
      }
      proof.push({ effect, trigger, bytes: expected.length, actualBytes: actual.length, changed, maxDifference });
      writeFileSync(join(o.directory, "background-recovery.json"), JSON.stringify(proof, null, 2));
      assert.equal(actual.length, expected.length);
      assert.equal(changed, 0, `${effect}: ${trigger} must regenerate the same background pixels`);
    };
    await compare("device-loss");
    const sprite = o.background.getChildByLabel("native-background-image") as Sprite;
    sprite.texture.source.unload();
    await o.present(); await compare("output-unload");
    // Pixi GC removes GPU data without emitting unload. Exercise that exact path.
    const system = o.app.renderer.texture as unknown as { _managedTextures: { remove(source: typeof sprite.texture.source): void } };
    system._managedTextures.remove(sprite.texture.source);
    await o.present(); await compare("output-gc");
  }
  } finally { preview.destroy(); }
}
