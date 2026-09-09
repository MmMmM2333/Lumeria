import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";
import { loadNativeBrandingTexture,nativeBrandingPixelSize,createNativeBrandingTextures } from "../rendering/native/nativeBrandingTextures.js";
import { fileURLToPath } from "node:url";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "launchpad-native-icon-"));
try {
  const fixturePath = join(fixtureDirectory, "icon.png");
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ef3b6d";
  context.fillRect(0, 0, 8, 8);
  writeFileSync(fixturePath, canvas.toBuffer("image/png"));

  const texture = await loadNativeIconTexture(fixturePath);
  try {
    assert.equal(texture.source.pixelWidth, 8);
    assert.equal(texture.source.pixelHeight, 8);
    assert.equal(texture.source.format, "rgba8unorm");
    const pixels = texture.source.resource;
    assert.ok(pixels instanceof Uint8Array);
    assert.deepEqual(Array.from(pixels.subarray(0, 4)), [239, 59, 109, 255]);
  } finally {
    texture.destroy(true);
  }

  await assert.rejects(loadNativeIconTexture(join(fixtureDirectory, "missing.png")), { code: "ENOENT" });

  await assert.rejects(
    loadNativeIconTexture("https://example.com/icon.png"),
    /image data URL or absolute file path/,
  );
} finally {
  rmSync(fixtureDirectory, { force: true, recursive: true });
}

console.log("Native icon texture loader tests passed");

assert.equal(nativeBrandingPixelSize(1),256);assert.equal(nativeBrandingPixelSize(2.5),320);
assert.throws(()=>nativeBrandingPixelSize(NaN));
const svg=fileURLToPath(new URL("../assets/branding/lumeria-app-icon.svg",import.meta.url));
for(const size of [256,320]){
  const texture=await loadNativeBrandingTexture(svg,size);
  try{assert.equal(texture.source.pixelWidth,size);assert.equal(texture.source.pixelHeight,size);
    const pixels=texture.source.resource as Uint8Array;assert.equal(pixels.byteLength,size*size*4);assert.ok(pixels.some((value,index)=>index%4===3&&value>0));
  }finally{texture.destroy(true);}
}
const brandingDirectory=mkdtempSync(join(tmpdir(),"launchpad-branding-"));
try{
  const content='<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>';
  for(const variant of ["light","dark","pastelLight","pastelDark"])writeFileSync(join(brandingDirectory,variant+".svg"),content);
  let changed=0;const cache=createNativeBrandingTextures(brandingDirectory,()=>changed++);
  await cache.synchronize(1);const old=cache.textures.get("light")!;await cache.synchronize(2);assert.equal(changed,1);
  await Promise.all([cache.synchronize(2.5),cache.synchronize(3)]);assert.equal(cache.textures.get("light")!.source.pixelWidth,384);assert.ok(old.destroyed);
  cache.destroy();assert.equal(cache.textures.size,0);
}finally{rmSync(brandingDirectory,{recursive:true,force:true});}
console.log("Native branding raster size and lifecycle tests passed");
