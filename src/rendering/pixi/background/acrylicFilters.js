import { Filter, GlProgram, UniformGroup } from "pixi.js";

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
uniform vec3 uTintColor;

float acrylicNoise(vec2 point)
{
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
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
  color.rgb += (acrylicNoise(gl_FragCoord.xy + uSeed) - 0.5) * uNoise;
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

export function createAcrylicCompositeFilter() {
  const uniforms = new UniformGroup({
    uAlpha: { value: 1, type: "f32" },
    uSaturation: { value: 1.22, type: "f32" },
    uContrast: { value: 0.92, type: "f32" },
    uBrightness: { value: 0.78, type: "f32" },
    uTintStrength: { value: 0.34, type: "f32" },
    uNoise: { value: 0.035, type: "f32" },
    uSeed: { value: 19.37, type: "f32" },
    uTintColor: { value: [0.07, 0.085, 0.115], type: "vec3<f32>" },
  });
  const filter = new Filter({
    glProgram: createProgram(ACRYLIC_COMPOSITE_FRAGMENT, "launchpad-acrylic-composite-filter"),
    resources: {
      acrylicUniforms: uniforms,
    },
  });
  filter.setAlpha = (alpha) => {
    uniforms.uniforms.uAlpha = Math.min(1, Math.max(0, Number(alpha) || 0));
    uniforms.update();
  };
  return filter;
}
