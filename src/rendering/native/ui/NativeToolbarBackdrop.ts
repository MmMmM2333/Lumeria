import { Filter, GlProgram, GpuProgram } from "pixi.js";

const vertex=`
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
  vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  gl_Position=vec4(p.x*2.0/uOutputTexture.x-1.0,p.y*2.0*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z,0.0,1.0);
  vTextureCoord=aPosition*uOutputFrame.zw*uInputSize.zw;
}`;
const fragment=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
void main(){
  vec4 front=texture(uTexture,vTextureCoord);
  if(front.a<0.001){finalColor=vec4(0.0);return;}
  vec4 back=vec4(0.0);float total=0.0;
  for(int y=-4;y<=4;y++)for(int x=-4;x<=4;x++){
    vec2 offset=vec2(float(x),float(y));float weight=exp(-dot(offset,offset)/8.0);
    back+=texture(uBackTexture,clamp(vTextureCoord+offset*10.0*uInputSize.zw,uInputClamp.xy,uInputClamp.zw))*weight;total+=weight;
  }
  back/=total;float luminance=dot(back.rgb,vec3(0.2126,0.7152,0.0722));
  back.rgb=clamp(mix(vec3(luminance),back.rgb,1.08),vec3(0.0),vec3(back.a));
  float coverage=min(1.0,front.a/0.94);
  finalColor=front+back*(coverage-front.a);
}`;
const source=`
struct Globals {uInputSize:vec4<f32>,uInputPixel:vec4<f32>,uInputClamp:vec4<f32>,uOutputFrame:vec4<f32>,uGlobalFrame:vec4<f32>,uOutputTexture:vec4<f32>};
@group(0) @binding(0) var<uniform> g:Globals;
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@group(0) @binding(3) var uBackTexture:texture_2d<f32>;
struct VertexOutput {@builtin(position) position:vec4<f32>,@location(0) uv:vec2<f32>};
@vertex fn mainVertex(@location(0) a:vec2<f32>)->VertexOutput {
  let p=a*g.uOutputFrame.zw+g.uOutputFrame.xy;
  return VertexOutput(vec4(p.x*2.0/g.uOutputTexture.x-1.0,p.y*2.0*g.uOutputTexture.z/g.uOutputTexture.y-g.uOutputTexture.z,0.0,1.0),a*g.uOutputFrame.zw*g.uInputSize.zw);
}
@fragment fn mainFragment(@location(0) uv:vec2<f32>)->@location(0) vec4<f32> {
  let front=textureSample(uTexture,uSampler,uv);
  if(front.a<0.001){return vec4(0.0);}
  var back=vec4<f32>(0.0);var total:f32=0.0;
  for(var y:i32=-4;y<=4;y++){for(var x:i32=-4;x<=4;x++){
    let offset=vec2<f32>(f32(x),f32(y));let weight=exp(-dot(offset,offset)/8.0);
    back+=textureSampleLevel(uBackTexture,uSampler,clamp(uv+offset*10.0*g.uInputSize.zw,g.uInputClamp.xy,g.uInputClamp.zw),0.0)*weight;total+=weight;
  }}
  back/=total;let luminance=dot(back.rgb,vec3(0.2126,0.7152,0.0722));
  back=vec4(clamp(mix(vec3(luminance),back.rgb,1.08),vec3(0.0),vec3(back.a)),back.a);
  let coverage=min(1.0,front.a/0.94);
  return front+back*(coverage-front.a);
}`;

/** Blur only the pixels behind the toolbar; its text and action icons stay crisp. */
export class NativeToolbarBackdrop extends Filter {
  constructor(){
    super({blendRequired:true,padding:40,resolution:"inherit",
      glProgram:GlProgram.from({vertex,fragment,name:"native-toolbar-backdrop"}),
      gpuProgram:GpuProgram.from({vertex:{source,entryPoint:"mainVertex"},fragment:{source,entryPoint:"mainFragment"}})});
  }
}
