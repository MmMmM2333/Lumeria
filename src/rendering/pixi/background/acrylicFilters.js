import { Filter, GlProgram, UniformGroup } from "pixi.js";
import { DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE } from "./acrylicNoiseTexture.js";
import { DEFAULT_ACRYLIC_COMPOSITE_PARAMS, normalizeAcrylicCompositeParams } from "./acrylicParams.js";

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

function createProgram(fragment, name) {
  return GlProgram.from({
    vertex: FILTER_VERTEX,
    fragment,
    name,
  });
}

function clampAlpha(value, fallback = 1) {
  const alpha = Number(value);
  if (!Number.isFinite(alpha)) return fallback;
  return Math.min(1, Math.max(0, alpha));
}

export function createKawaseFilter(name, offset = 1) {
  const uniforms = new UniformGroup({
    uTexelSize: { value: [1, 1], type: "vec2<f32>" },
    uOffset: { value: offset, type: "f32" },
  });
  const filter = new Filter({
    glProgram: createProgram(KAWASE_FRAGMENT, name),
    resources: {
      kawaseUniforms: uniforms,
    },
  });
  filter.setInputSize = (width, height) => {
    uniforms.uniforms.uTexelSize = [
      1 / Math.max(1, width),
      1 / Math.max(1, height),
    ];
    uniforms.update();
  };
  filter.setOffset = (nextOffset) => {
    uniforms.uniforms.uOffset = Number(nextOffset) || offset;
    uniforms.update();
  };
  return filter;
}

export function createGaussianFilter(name, direction = [1, 0]) {
  const uniforms = new UniformGroup({
    uTexelSize: { value: [1, 1], type: "vec2<f32>" },
    uDirection: { value: direction, type: "vec2<f32>" },
    uSigma: { value: 1, type: "f32" },
    uRadius: { value: 3, type: "f32" },
  });
  const filter = new Filter({
    glProgram: createProgram(GAUSSIAN_FRAGMENT, name),
    resources: {
      gaussianUniforms: uniforms,
    },
  });
  filter.setInputSize = (width, height) => {
    uniforms.uniforms.uTexelSize = [
      1 / Math.max(1, width),
      1 / Math.max(1, height),
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

export function createAcrylicCompositeFilter(noiseTexture) {
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
  const filter = new Filter({
    glProgram: createProgram(ACRYLIC_COMPOSITE_FRAGMENT, "launchpad-acrylic-composite-filter"),
    resources: {
      acrylicUniforms: uniforms,
      uNoiseSampler: noiseTexture.source.style,
      uNoiseTexture: noiseTexture.source,
    },
  });

  filter.setParams = (params = {}) => {
    const nextParams = params && typeof params === "object" ? params : {};
    const fallback = {
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
