import {
  Filter,
  GlProgram,
  GpuProgram,
  UniformGroup,
  type Texture,
  type TextureSource,
} from "pixi.js";
import { DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE } from "./acrylicNoiseTexture.js";
import { DEFAULT_ACRYLIC_COMPOSITE_PARAMS, normalizeAcrylicCompositeParams } from "./acrylicParams.js";

type AcrylicParameters = ReturnType<typeof normalizeAcrylicCompositeParams>;

type InputSizeFilter = Filter & {
  setInputSize: (width: unknown, height: unknown) => void;
};

type KawaseFilter = InputSizeFilter & {
  setOffset: (offset: unknown) => void;
};

type GaussianFilter = InputSizeFilter & {
  setParams: (params: Readonly<{ radius?: unknown; sigma?: unknown }>) => void;
};

type AcrylicCompositeFilter = Filter & {
  setAlpha: (alpha: unknown) => void;
  setParams: (params?: unknown) => void;
};

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

export const KAWASE_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform vec2 uTexelSize;
uniform float uOffset;

vec4 sampleInput(vec2 uv)
{
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void)
{
  vec2 offset = uTexelSize * uOffset;
  vec4 color = sampleInput(vTextureCoord + vec2(-offset.x, -offset.y));
  color += sampleInput(vTextureCoord + vec2(offset.x, -offset.y));
  color += sampleInput(vTextureCoord + vec2(offset.x, offset.y));
  color += sampleInput(vTextureCoord + vec2(-offset.x, offset.y));
  finalColor = color * 0.25;
}
`;

export const GAUSSIAN_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
uniform float uSigma;
uniform float uRadius;

const int MAX_GAUSSIAN_RADIUS = 32;

vec4 sampleInput(vec2 uv)
{
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void)
{
  float sigma = max(uSigma, 0.001);
  float radius = clamp(floor(uRadius + 0.5), 0.0, float(MAX_GAUSSIAN_RADIUS));
  vec2 stepOffset = uTexelSize * uDirection;
  vec4 color = vec4(0.0);
  float totalWeight = 0.0;

  for (int index = -MAX_GAUSSIAN_RADIUS; index <= MAX_GAUSSIAN_RADIUS; index += 1) {
    float sampleIndex = float(index);
    if (abs(sampleIndex) <= radius) {
      float weight = exp(-(sampleIndex * sampleIndex) / (2.0 * sigma * sigma));
      color += sampleInput(vTextureCoord + stepOffset * sampleIndex) * weight;
      totalWeight += weight;
    }
  }

  finalColor = color / max(totalWeight, 0.0001);
}
`;

export const ACRYLIC_COMPOSITE_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uAlpha;
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform float uTintStrength;
uniform float uNoise;
uniform float uSeed;
uniform vec2 uNoiseTextureSize;
uniform vec3 uTintColor;
uniform sampler2D uNoiseTexture;

vec3 acrylicSoftLight(vec3 base, float blend)
{
  vec3 safeBase = clamp(base, 0.0, 1.0);
  vec3 low = safeBase - (1.0 - 2.0 * blend) * safeBase * (1.0 - safeBase);
  vec3 high = safeBase + (2.0 * blend - 1.0) * (sqrt(safeBase) - safeBase);
  return mix(low, high, step(0.5, blend));
}

void main(void)
{
  vec4 color = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));

  if (color.a > 0.0) {
    color.rgb /= color.a;
  }

  float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(luminance), color.rgb, uSaturation);
  color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
  color.rgb *= uBrightness;
  color.rgb = mix(color.rgb, uTintColor, uTintStrength);
  vec2 noiseOffset = vec2(uSeed * 17.0, uSeed * 31.0);
  vec2 noiseUv = fract((gl_FragCoord.xy + noiseOffset) / uNoiseTextureSize);
  float noiseSample = texture(uNoiseTexture, noiseUv).r;
  color.rgb = mix(color.rgb, acrylicSoftLight(color.rgb, noiseSample), uNoise);
  color.rgb = clamp(color.rgb, 0.0, 1.0);
  color.a *= uAlpha;
  color.rgb *= color.a;

  finalColor = color;
}
`;

const FILTER_WGSL_HEADER = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

struct FilterVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4<f32>(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> FilterVertexOutput {
  return FilterVertexOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}
`;

export const KAWASE_WGSL = `${FILTER_WGSL_HEADER}
struct KawaseUniforms {
  uTexelSize: vec2<f32>,
  uOffset: f32,
};

@group(1) @binding(0) var<uniform> kawaseUniforms: KawaseUniforms;

fn sampleInput(uv: vec2<f32>) -> vec4<f32> {
  return textureSample(uTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let offset = kawaseUniforms.uTexelSize * kawaseUniforms.uOffset;
  var color = sampleInput(uv + vec2<f32>(-offset.x, -offset.y));
  color += sampleInput(uv + vec2<f32>(offset.x, -offset.y));
  color += sampleInput(uv + vec2<f32>(offset.x, offset.y));
  color += sampleInput(uv + vec2<f32>(-offset.x, offset.y));
  return color * 0.25;
}
`;

export const GAUSSIAN_WGSL = `${FILTER_WGSL_HEADER}
struct GaussianUniforms {
  uTexelSize: vec2<f32>,
  uDirection: vec2<f32>,
  uSigma: f32,
  uRadius: f32,
};

@group(1) @binding(0) var<uniform> gaussianUniforms: GaussianUniforms;

const MAX_GAUSSIAN_RADIUS: i32 = 32;

fn sampleInput(uv: vec2<f32>) -> vec4<f32> {
  return textureSample(uTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let sigma = max(gaussianUniforms.uSigma, 0.001);
  let radius = clamp(floor(gaussianUniforms.uRadius + 0.5), 0.0, f32(MAX_GAUSSIAN_RADIUS));
  let stepOffset = gaussianUniforms.uTexelSize * gaussianUniforms.uDirection;
  var color = vec4<f32>(0.0);
  var totalWeight = 0.0;

  for (var index = -MAX_GAUSSIAN_RADIUS; index <= MAX_GAUSSIAN_RADIUS; index += 1) {
    let sampleIndex = f32(index);
    if (abs(sampleIndex) <= radius) {
      let weight = exp(-(sampleIndex * sampleIndex) / (2.0 * sigma * sigma));
      color += sampleInput(uv + stepOffset * sampleIndex) * weight;
      totalWeight += weight;
    }
  }

  return color / max(totalWeight, 0.0001);
}
`;

export const ACRYLIC_COMPOSITE_WGSL = `${FILTER_WGSL_HEADER}
struct AcrylicUniforms {
  uAlpha: f32,
  uSaturation: f32,
  uContrast: f32,
  uBrightness: f32,
  uTintStrength: f32,
  uNoise: f32,
  uSeed: f32,
  uNoiseTextureSize: vec2<f32>,
  uTintColor: vec3<f32>,
};

@group(1) @binding(0) var<uniform> acrylicUniforms: AcrylicUniforms;
@group(1) @binding(1) var uNoiseSampler: sampler;
@group(1) @binding(2) var uNoiseTexture: texture_2d<f32>;

fn acrylicSoftLight(base: vec3<f32>, blend: f32) -> vec3<f32> {
  let safeBase = clamp(base, vec3<f32>(0.0), vec3<f32>(1.0));
  let low = safeBase - (1.0 - 2.0 * blend) * safeBase * (1.0 - safeBase);
  let high = safeBase + (2.0 * blend - 1.0) * (sqrt(safeBase) - safeBase);
  return select(low, high, blend >= 0.5);
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>,
) -> @location(0) vec4<f32> {
  let sampled = textureSample(uTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
  var rgb = sampled.rgb;
  if (sampled.a > 0.0) {
    rgb /= sampled.a;
  }

  let luminance = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
  rgb = mix(vec3<f32>(luminance), rgb, acrylicUniforms.uSaturation);
  rgb = (rgb - 0.5) * acrylicUniforms.uContrast + 0.5;
  rgb *= acrylicUniforms.uBrightness;
  rgb = mix(rgb, acrylicUniforms.uTintColor, acrylicUniforms.uTintStrength);
  let noiseOffset = vec2<f32>(acrylicUniforms.uSeed * 17.0, acrylicUniforms.uSeed * 31.0);
  let noiseUv = fract((position.xy + noiseOffset) / acrylicUniforms.uNoiseTextureSize);
  let noiseSample = textureSample(uNoiseTexture, uNoiseSampler, noiseUv).r;
  rgb = mix(rgb, acrylicSoftLight(rgb, noiseSample), acrylicUniforms.uNoise);
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let alpha = sampled.a * acrylicUniforms.uAlpha;
  return vec4<f32>(rgb * alpha, alpha);
}
`;

function createPrograms(fragment: string, source: string, name: string) {
  return {
    glProgram: GlProgram.from({
      vertex: FILTER_VERTEX,
      fragment,
      name,
    }),
    gpuProgram: GpuProgram.from({
      fragment: { entryPoint: "mainFragment", source },
      name,
      vertex: { entryPoint: "mainVertex", source },
    }),
  };
}

function clampAlpha(value: unknown, fallback = 1): number {
  const alpha = Number(value);
  if (!Number.isFinite(alpha)) return fallback;
  return Math.min(1, Math.max(0, alpha));
}

export function createKawaseFilter(name: string, offset = 1): KawaseFilter {
  const uniforms = new UniformGroup({
    uTexelSize: { value: [1, 1], type: "vec2<f32>" },
    uOffset: { value: offset, type: "f32" },
  });
  const filter = new Filter({
    ...createPrograms(KAWASE_FRAGMENT, KAWASE_WGSL, name),
    resources: {
      kawaseUniforms: uniforms,
    },
  }) as KawaseFilter;
  filter.setInputSize = (width, height) => {
    uniforms.uniforms.uTexelSize = [
      1 / Math.max(1, Number(width)),
      1 / Math.max(1, Number(height)),
    ];
    uniforms.update();
  };
  filter.setOffset = (nextOffset) => {
    uniforms.uniforms.uOffset = Number(nextOffset) || offset;
    uniforms.update();
  };
  return filter;
}

export function createGaussianFilter(
  name: string,
  direction: [number, number] = [1, 0],
): GaussianFilter {
  const uniforms = new UniformGroup({
    uTexelSize: { value: [1, 1], type: "vec2<f32>" },
    uDirection: { value: direction, type: "vec2<f32>" },
    uSigma: { value: 1, type: "f32" },
    uRadius: { value: 3, type: "f32" },
  });
  const filter = new Filter({
    ...createPrograms(GAUSSIAN_FRAGMENT, GAUSSIAN_WGSL, name),
    resources: {
      gaussianUniforms: uniforms,
    },
  }) as GaussianFilter;
  filter.setInputSize = (width, height) => {
    uniforms.uniforms.uTexelSize = [
      1 / Math.max(1, Number(width)),
      1 / Math.max(1, Number(height)),
    ];
    uniforms.update();
  };
  filter.setParams = ({ radius, sigma }) => {
    const nextSigma = Number(sigma);
    const nextRadius = Number(radius);
    uniforms.uniforms.uSigma = Number.isFinite(nextSigma) ? Math.max(0.001, nextSigma) : 1;
    uniforms.uniforms.uRadius = Number.isFinite(nextRadius) ? Math.max(0, nextRadius) : 3;
    uniforms.update();
  };
  return filter;
}

export function createAcrylicCompositeFilter(noiseTexture: Texture): AcrylicCompositeFilter {
  const defaults = DEFAULT_ACRYLIC_COMPOSITE_PARAMS;
  const noiseTextureSize = [
    Math.max(1, noiseTexture?.width || DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE),
    Math.max(1, noiseTexture?.height || DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE),
  ];
  const uniforms = new UniformGroup({
    uAlpha: { value: 1, type: "f32" },
    uSaturation: { value: defaults.saturation, type: "f32" },
    uContrast: { value: defaults.contrast, type: "f32" },
    uBrightness: { value: defaults.brightness, type: "f32" },
    uTintStrength: { value: defaults.tintStrength, type: "f32" },
    uNoise: { value: defaults.noise, type: "f32" },
    uSeed: { value: defaults.seed, type: "f32" },
    uNoiseTextureSize: { value: noiseTextureSize, type: "vec2<f32>" },
    uTintColor: { value: defaults.tintColor, type: "vec3<f32>" },
  });
  const noiseTextureSource: TextureSource = noiseTexture.source;
  const filter = new Filter({
    ...createPrograms(
      ACRYLIC_COMPOSITE_FRAGMENT,
      ACRYLIC_COMPOSITE_WGSL,
      "launchpad-acrylic-composite-filter",
    ),
    resources: {
      acrylicUniforms: uniforms,
      uNoiseSampler: noiseTextureSource.style,
      uNoiseTexture: noiseTextureSource,
    },
  }) as AcrylicCompositeFilter;

  filter.setParams = (params = {}) => {
    const nextParams: Record<string, unknown> = params && typeof params === "object"
      ? params as Record<string, unknown>
      : {};
    const fallback: AcrylicParameters = {
      brightness: uniforms.uniforms.uBrightness,
      contrast: uniforms.uniforms.uContrast,
      noise: uniforms.uniforms.uNoise,
      saturation: uniforms.uniforms.uSaturation,
      seed: uniforms.uniforms.uSeed,
      tintColor: uniforms.uniforms.uTintColor,
      tintStrength: uniforms.uniforms.uTintStrength,
    };
    const normalized = normalizeAcrylicCompositeParams(nextParams, fallback);
    uniforms.uniforms.uSaturation = normalized.saturation;
    uniforms.uniforms.uContrast = normalized.contrast;
    uniforms.uniforms.uBrightness = normalized.brightness;
    uniforms.uniforms.uTintStrength = normalized.tintStrength;
    uniforms.uniforms.uNoise = normalized.noise;
    uniforms.uniforms.uSeed = normalized.seed;
    uniforms.uniforms.uTintColor = normalized.tintColor;
    if (Object.prototype.hasOwnProperty.call(nextParams, "alpha")) {
      uniforms.uniforms.uAlpha = clampAlpha(nextParams.alpha, uniforms.uniforms.uAlpha);
    }
    uniforms.update();
  };
  filter.setAlpha = (alpha) => {
    filter.setParams({ alpha });
  };
  return filter;
}
