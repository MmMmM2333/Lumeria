#[allow(unused_imports)]
use super::*;

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopShaderPipeline {
    device: ID3D11Device,
    input_resource: ID3D11Resource,
    input_srv: ID3D11ShaderResourceView,
    vertex_shader: ID3D11VertexShader,
    copy_pixel_shader: ID3D11PixelShader,
    kawase_pixel_shader: ID3D11PixelShader,
    gaussian_pixel_shader: ID3D11PixelShader,
    acrylic_pixel_shader: ID3D11PixelShader,
    input_layout: ID3D11InputLayout,
    vertex_buffer: ID3D11Buffer,
    point_sampler: ID3D11SamplerState,
    linear_sampler: ID3D11SamplerState,
    kawase_constants: ID3D11Buffer,
    acrylic_constants: ID3D11Buffer,
    effect_source: LiveDesktopShaderTexture,
    down_textures: Vec<LiveDesktopShaderTexture>,
    up_textures: Vec<LiveDesktopShaderTexture>,
    final_blur_texture: LiveDesktopShaderTexture,
    final_render_texture: LiveDesktopShaderTexture,
    noise_texture: LiveDesktopShaderNoiseTexture,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct LiveDesktopShaderVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopShaderTexture {
    srv: ID3D11ShaderResourceView,
    rtv: ID3D11RenderTargetView,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopShaderNoiseTexture {
    srv: ID3D11ShaderResourceView,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct LiveDesktopKawaseConstants {
    values0: [f32; 4],
    values1: [f32; 4],
    values2: [f32; 4],
    values3: [f32; 4],
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct LiveDesktopAcrylicConstants {
    values0: [f32; 4],
    values1: [f32; 4],
    values2: [f32; 4],
    values3: [f32; 4],
}

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_COPY_SHADER_HLSL: &str = r#"
struct VsInput {
    float2 position : POSITION;
    float2 uv : TEXCOORD0;
};

struct PsInput {
    float4 position : SV_POSITION;
    float2 uv : TEXCOORD0;
};

PsInput main_vs(VsInput input) {
    PsInput output;
    output.position = float4(input.position, 0.0, 1.0);
    output.uv = input.uv;
    return output;
}

Texture2D source_texture : register(t0);
Texture2D noise_texture : register(t1);
SamplerState point_sampler : register(s0);
SamplerState linear_sampler : register(s1);

cbuffer EffectConstants : register(b0) {
    float4 effect_values0;
    float4 effect_values1;
    float4 effect_values2;
    float4 effect_values3;
};

float4 copy_ps(PsInput input) : SV_TARGET {
    return source_texture.Sample(linear_sampler, input.uv);
}

float4 kawase_ps(PsInput input) : SV_TARGET {
    float2 offset = effect_values0.xy * effect_values0.z;
    float4 color = source_texture.Sample(linear_sampler, input.uv + float2(-offset.x, -offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(offset.x, -offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(offset.x, offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(-offset.x, offset.y));
    return color * 0.25;
}

float4 gaussian_ps(PsInput input) : SV_TARGET {
    float2 texel_size = effect_values0.xy;
    float2 direction = effect_values0.zw;
    float sigma = max(effect_values1.x, 0.001);
    int radius = min(32, max(0, (int)(effect_values1.y + 0.5)));
    float4 color = float4(0.0, 0.0, 0.0, 0.0);
    float total_weight = 0.0;

    [loop]
    for (int index = -32; index <= 32; index++) {
        if (abs(index) <= radius) {
            float sample_index = (float)index;
            float weight = exp(-(sample_index * sample_index) / (2.0 * sigma * sigma));
            color += source_texture.Sample(linear_sampler, input.uv + texel_size * direction * sample_index) * weight;
            total_weight += weight;
        }
    }

    return color / max(total_weight, 0.0001);
}

float3 acrylic_soft_light(float3 base, float blend) {
    float3 safe_base = saturate(base);
    float3 low = safe_base - (1.0 - 2.0 * blend) * safe_base * (1.0 - safe_base);
    float3 high = safe_base + (2.0 * blend - 1.0) * (sqrt(safe_base) - safe_base);
    return lerp(low, high, step(0.5, blend));
}

float4 acrylic_ps(PsInput input) : SV_TARGET {
    float alpha = effect_values0.x;
    float saturation = effect_values0.y;
    float contrast = effect_values0.z;
    float brightness = effect_values0.w;
    float tint_strength = effect_values1.x;
    float noise_amount = effect_values1.y;
    float seed = effect_values1.z;
    float2 noise_size = max(effect_values2.xy, float2(1.0, 1.0));
    float3 tint_color = float3(effect_values2.z, effect_values2.w, effect_values3.x);

    float4 color = source_texture.Sample(linear_sampler, input.uv);
    if (color.a > 0.0) {
        color.rgb /= color.a;
    }

    float luminance = dot(color.rgb, float3(0.299, 0.587, 0.114));
    color.rgb = lerp(float3(luminance, luminance, luminance), color.rgb, saturation);
    color.rgb = (color.rgb - 0.5) * contrast + 0.5;
    color.rgb *= brightness;
    color.rgb = lerp(color.rgb, tint_color, tint_strength);

    float2 noise_offset = float2(seed * 17.0, seed * 31.0);
    float2 noise_uv = frac((input.position.xy + noise_offset) / noise_size);
    float noise_sample = noise_texture.Sample(point_sampler, noise_uv).r;
    color.rgb = lerp(color.rgb, acrylic_soft_light(color.rgb, noise_sample), noise_amount);
    color.rgb = saturate(color.rgb);
    color.a *= alpha;
    color.rgb *= color.a;
    return color;
}
"#;

#[cfg(target_os = "windows")]
impl LiveDesktopShaderPipeline {
    pub(crate) unsafe fn create(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        config: &LiveDesktopRuntimeConfig,
    ) -> Result<Self, String> {
        let width = width.max(1);
        let height = height.max(1);
        let vertex_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("main_vs"),
                s!("vs_4_0"),
                "copy vertex shader",
            )
        }?;
        let copy_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("copy_ps"),
                s!("ps_4_0"),
                "copy pixel shader",
            )
        }?;
        let kawase_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("kawase_ps"),
                s!("ps_4_0"),
                "kawase pixel shader",
            )
        }?;
        let gaussian_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("gaussian_ps"),
                s!("ps_4_0"),
                "gaussian pixel shader",
            )
        }?;
        let acrylic_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("acrylic_ps"),
                s!("ps_4_0"),
                "acrylic pixel shader",
            )
        }?;
        let vertex_shader_bytes = unsafe { live_desktop_d3d_blob_bytes(&vertex_shader_blob) };
        let copy_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&copy_pixel_shader_blob) };
        let kawase_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&kawase_pixel_shader_blob) };
        let gaussian_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&gaussian_pixel_shader_blob) };
        let acrylic_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&acrylic_pixel_shader_blob) };

        let mut vertex_shader = None;
        unsafe {
            device.CreateVertexShader(
                vertex_shader_bytes,
                None::<&ID3D11ClassLinkage>,
                Some(&mut vertex_shader),
            )
        }
        .map_err(|error| format!("CreateVertexShader(copy) failed: {error}"))?;
        let vertex_shader = vertex_shader
            .ok_or_else(|| "CreateVertexShader(copy) returned no shader".to_string())?;

        let copy_pixel_shader =
            unsafe { create_live_desktop_pixel_shader(device, copy_pixel_shader_bytes, "copy") }?;
        let kawase_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, kawase_pixel_shader_bytes, "kawase")
        }?;
        let gaussian_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, gaussian_pixel_shader_bytes, "gaussian")
        }?;
        let acrylic_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, acrylic_pixel_shader_bytes, "acrylic")
        }?;

        let input_elements = [
            D3D11_INPUT_ELEMENT_DESC {
                SemanticName: s!("POSITION"),
                SemanticIndex: 0,
                Format: DXGI_FORMAT_R32G32_FLOAT,
                InputSlot: 0,
                AlignedByteOffset: 0,
                InputSlotClass: D3D11_INPUT_PER_VERTEX_DATA,
                InstanceDataStepRate: 0,
            },
            D3D11_INPUT_ELEMENT_DESC {
                SemanticName: s!("TEXCOORD"),
                SemanticIndex: 0,
                Format: DXGI_FORMAT_R32G32_FLOAT,
                InputSlot: 0,
                AlignedByteOffset: 8,
                InputSlotClass: D3D11_INPUT_PER_VERTEX_DATA,
                InstanceDataStepRate: 0,
            },
        ];
        let mut input_layout = None;
        unsafe {
            device.CreateInputLayout(
                &input_elements,
                vertex_shader_bytes,
                Some(&mut input_layout),
            )
        }
        .map_err(|error| format!("CreateInputLayout(copy) failed: {error}"))?;
        let input_layout =
            input_layout.ok_or_else(|| "CreateInputLayout(copy) returned no layout".to_string())?;

        let vertices = [
            LiveDesktopShaderVertex {
                position: [-1.0, -1.0],
                uv: [0.0, 1.0],
            },
            LiveDesktopShaderVertex {
                position: [-1.0, 3.0],
                uv: [0.0, -1.0],
            },
            LiveDesktopShaderVertex {
                position: [3.0, -1.0],
                uv: [2.0, 1.0],
            },
        ];
        let vertex_buffer_desc = D3D11_BUFFER_DESC {
            ByteWidth: std::mem::size_of_val(&vertices) as u32,
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_VERTEX_BUFFER.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
            StructureByteStride: 0,
        };
        let vertex_buffer_data = D3D11_SUBRESOURCE_DATA {
            pSysMem: vertices.as_ptr() as *const std::ffi::c_void,
            SysMemPitch: 0,
            SysMemSlicePitch: 0,
        };
        let mut vertex_buffer = None;
        unsafe {
            device.CreateBuffer(
                &vertex_buffer_desc,
                Some(&vertex_buffer_data),
                Some(&mut vertex_buffer),
            )
        }
        .map_err(|error| format!("CreateBuffer(copy vertex buffer) failed: {error}"))?;
        let vertex_buffer = vertex_buffer
            .ok_or_else(|| "CreateBuffer(copy vertex buffer) returned no buffer".to_string())?;

        let point_sampler = unsafe {
            create_live_desktop_sampler(device, D3D11_FILTER_MIN_MAG_MIP_POINT, "point")
        }?;
        let linear_sampler = unsafe {
            create_live_desktop_sampler(device, D3D11_FILTER_MIN_MAG_MIP_LINEAR, "linear")
        }?;
        let kawase_constants = unsafe {
            create_live_desktop_constant_buffer::<LiveDesktopKawaseConstants>(
                device,
                "kawase constants",
            )
        }?;
        let acrylic_constants = unsafe {
            create_live_desktop_constant_buffer::<LiveDesktopAcrylicConstants>(
                device,
                "acrylic constants",
            )
        }?;

        let input_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut input_texture = None;
        unsafe { device.CreateTexture2D(&input_desc, None, Some(&mut input_texture)) }.map_err(
            |error| format!("CreateTexture2D(shader input {width}x{height}) failed: {error}"),
        )?;
        let input_texture = input_texture
            .ok_or_else(|| "CreateTexture2D(shader input) returned no texture".to_string())?;
        let input_resource = input_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("Shader input texture resource cast failed: {error}"))?;
        let mut input_srv = None;
        unsafe { device.CreateShaderResourceView(&input_resource, None, Some(&mut input_srv)) }
            .map_err(|error| format!("CreateShaderResourceView(shader input) failed: {error}"))?;
        let input_srv = input_srv
            .ok_or_else(|| "CreateShaderResourceView(shader input) returned no view".to_string())?;
        let (effect_width, effect_height) =
            resolve_live_desktop_effect_render_size(width, height, config.effect_plan.as_ref());
        let levels = create_live_desktop_dual_kawase_levels(
            effect_width,
            effect_height,
            4,
            config
                .effect_plan
                .as_ref()
                .map(|plan| plan.blur.min_size)
                .unwrap_or(16),
        );
        let effect_source = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "effect source")
        }?;
        let final_blur_texture = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "final blur")
        }?;
        let final_render_texture = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "final render")
        }?;
        let down_textures =
            unsafe { create_live_desktop_shader_textures(device, &levels, "dual kawase down") }?;
        let up_textures =
            unsafe { create_live_desktop_shader_textures(device, &levels, "dual kawase up") }?;
        let noise_texture = unsafe { LiveDesktopShaderNoiseTexture::create(device, 128, 0) }?;

        Ok(Self {
            device: device.clone(),
            input_resource,
            input_srv,
            vertex_shader,
            copy_pixel_shader,
            kawase_pixel_shader,
            gaussian_pixel_shader,
            acrylic_pixel_shader,
            input_layout,
            vertex_buffer,
            point_sampler,
            linear_sampler,
            kawase_constants,
            acrylic_constants,
            effect_source,
            down_textures,
            up_textures,
            final_blur_texture,
            final_render_texture,
            noise_texture,
            width,
            height,
        })
    }

    unsafe fn copy_source_region_to_input(
        &self,
        context: &ID3D11DeviceContext,
        source_resource: &ID3D11Resource,
        source_width: u32,
        source_height: u32,
        copy_crop: LiveDesktopFrameCrop,
        label: &str,
    ) -> Result<(), String> {
        if copy_crop.width == 0 || copy_crop.height == 0 {
            return Err(format!("{label} shader copy crop has invalid size"));
        }
        if copy_crop.left.saturating_add(copy_crop.width) > source_width
            || copy_crop.top.saturating_add(copy_crop.height) > source_height
            || copy_crop.width > self.width
            || copy_crop.height > self.height
        {
            return Err(format!(
                "{label} shader copy crop {}x{}@{},{} is outside source {}x{} or input {}x{}",
                copy_crop.width,
                copy_crop.height,
                copy_crop.left,
                copy_crop.top,
                source_width,
                source_height,
                self.width,
                self.height
            ));
        }

        if copy_crop.left == 0
            && copy_crop.top == 0
            && copy_crop.width == source_width
            && copy_crop.height == source_height
            && source_width == self.width
            && source_height == self.height
        {
            unsafe { context.CopyResource(&self.input_resource, source_resource) };
            return Ok(());
        }

        let source_box = D3D11_BOX {
            left: copy_crop.left,
            top: copy_crop.top,
            front: 0,
            right: copy_crop.left + copy_crop.width,
            bottom: copy_crop.top + copy_crop.height,
            back: 1,
        };
        unsafe {
            context.CopySubresourceRegion(
                &self.input_resource,
                0,
                0,
                0,
                0,
                source_resource,
                0,
                Some(&source_box),
            )
        };
        Ok(())
    }

    pub(crate) fn should_apply_effects(&self, config: &LiveDesktopRuntimeConfig) -> bool {
        config.effect_plan.as_ref().is_some_and(|plan| {
            matches!(
                plan.effect,
                LiveDesktopBackgroundEffect::Blur | LiveDesktopBackgroundEffect::AcrylicWebgl
            ) && !self.down_textures.is_empty()
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) unsafe fn render_source_region_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        source_resource: &ID3D11Resource,
        source_width: u32,
        source_height: u32,
        copy_crop: LiveDesktopFrameCrop,
        target_texture: &ID3D11Texture2D,
        config: &LiveDesktopRuntimeConfig,
        label: &str,
    ) -> Result<(), String> {
        unsafe {
            self.copy_source_region_to_input(
                context,
                source_resource,
                source_width,
                source_height,
                copy_crop,
                label,
            )?;
        }
        if self.should_apply_effects(config) {
            unsafe { self.render_effect_to_texture(context, target_texture, config, label) }
        } else {
            unsafe { self.draw_to_texture(context, target_texture, label) }
        }
    }

    unsafe fn render_effect_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        target_texture: &ID3D11Texture2D,
        config: &LiveDesktopRuntimeConfig,
        label: &str,
    ) -> Result<(), String> {
        let effect_plan = config
            .effect_plan
            .as_ref()
            .ok_or_else(|| format!("{label} shader effect requested without effect plan"))?;

        unsafe {
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(self.input_srv.clone())],
                &self.copy_pixel_shader,
                None,
                &self.effect_source.rtv,
                self.effect_source.width,
                self.effect_source.height,
            );
        }
        let mut current_srv = self.effect_source.srv.clone();
        let mut current_width = self.effect_source.width;
        let mut current_height = self.effect_source.height;

        if effect_plan.blur.kernel == LiveDesktopBlurKernel::Gaussian {
            let horizontal_sigma = resolve_live_desktop_gaussian_sigma(
                effect_plan.blur.gaussian_radius_px,
                self.effect_source.width,
                self.width,
            );
            let vertical_sigma = resolve_live_desktop_gaussian_sigma(
                effect_plan.blur.gaussian_radius_px,
                self.effect_source.height,
                self.height,
            );
            unsafe {
                self.draw_gaussian_pass(
                    context,
                    &self.effect_source.srv,
                    self.effect_source.width,
                    self.effect_source.height,
                    &self.final_render_texture,
                    horizontal_sigma,
                    [1.0, 0.0],
                    label,
                )?;
                self.draw_gaussian_pass(
                    context,
                    &self.final_render_texture.srv,
                    self.final_render_texture.width,
                    self.final_render_texture.height,
                    &self.final_blur_texture,
                    vertical_sigma,
                    [0.0, 1.0],
                    label,
                )?;
            }
        } else {
            let active_pass_count = (effect_plan.blur.pass_count.max(1) as usize)
                .min(self.down_textures.len())
                .max(1);

            for (index, target) in self
                .down_textures
                .iter()
                .take(active_pass_count)
                .enumerate()
            {
                let offset = effect_plan
                    .blur
                    .down_offsets
                    .get(index)
                    .copied()
                    .unwrap_or((1.0 + index as f32 * 0.35) * effect_plan.blur.offset_scale);
                unsafe {
                    self.draw_kawase_pass(
                        context,
                        &current_srv,
                        current_width,
                        current_height,
                        target,
                        offset,
                        label,
                    )?;
                }
                current_srv = target.srv.clone();
                current_width = target.width;
                current_height = target.height;
            }

            for index in (0..active_pass_count.saturating_sub(1)).rev() {
                let target = &self.up_textures[index];
                let offset = effect_plan
                    .blur
                    .up_offsets
                    .get(index)
                    .copied()
                    .unwrap_or((1.1 + index as f32 * 0.25) * effect_plan.blur.offset_scale);
                unsafe {
                    self.draw_kawase_pass(
                        context,
                        &current_srv,
                        current_width,
                        current_height,
                        target,
                        offset,
                        label,
                    )?;
                }
                current_srv = target.srv.clone();
                current_width = target.width;
                current_height = target.height;
            }

            unsafe {
                self.draw_kawase_pass(
                    context,
                    &current_srv,
                    current_width,
                    current_height,
                    &self.final_blur_texture,
                    effect_plan.blur.final_up_offset,
                    label,
                )?;
            }
        }

        let final_srv = if effect_plan.acrylic.enabled
            && effect_plan.effect == LiveDesktopBackgroundEffect::AcrylicWebgl
        {
            unsafe {
                self.draw_acrylic_pass(
                    context,
                    &self.final_blur_texture.srv,
                    &self.final_render_texture,
                    &effect_plan.acrylic,
                    label,
                )?;
            }
            &self.final_render_texture.srv
        } else {
            &self.final_blur_texture.srv
        };

        unsafe {
            self.draw_shader_resource_to_texture(
                context,
                final_srv,
                &self.copy_pixel_shader,
                None,
                target_texture,
                label,
            )
        }
    }

    unsafe fn draw_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        target_texture: &ID3D11Texture2D,
        label: &str,
    ) -> Result<(), String> {
        unsafe {
            self.draw_shader_resource_to_texture(
                context,
                &self.input_srv,
                &self.copy_pixel_shader,
                None,
                target_texture,
                label,
            )
        }
    }

    unsafe fn draw_shader_resource_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        pixel_shader: &ID3D11PixelShader,
        constant_buffer: Option<&ID3D11Buffer>,
        target_texture: &ID3D11Texture2D,
        label: &str,
    ) -> Result<(), String> {
        let mut target_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { target_texture.GetDesc(&mut target_desc) };
        let target_resource = target_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("{label} shader target resource cast failed: {error}"))?;
        let mut render_target_view = None;
        unsafe {
            self.device.CreateRenderTargetView(
                &target_resource,
                None,
                Some(&mut render_target_view),
            )
        }
        .map_err(|error| {
            format!("{label} CreateRenderTargetView(shader target) failed: {error}")
        })?;
        let render_target_view = render_target_view
            .ok_or_else(|| format!("{label} CreateRenderTargetView returned no view"))?;
        unsafe {
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                pixel_shader,
                constant_buffer,
                &render_target_view,
                target_desc.Width,
                target_desc.Height,
            );
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_shader_resource_to_render_target(
        &self,
        context: &ID3D11DeviceContext,
        shader_resources: &[Option<ID3D11ShaderResourceView>],
        pixel_shader: &ID3D11PixelShader,
        constant_buffer: Option<&ID3D11Buffer>,
        render_target_view: &ID3D11RenderTargetView,
        target_width: u32,
        target_height: u32,
    ) {
        let render_targets = [Some(render_target_view.clone())];
        let viewport = D3D11_VIEWPORT {
            TopLeftX: 0.0,
            TopLeftY: 0.0,
            Width: target_width.max(1) as f32,
            Height: target_height.max(1) as f32,
            MinDepth: 0.0,
            MaxDepth: 1.0,
        };
        let vertex_buffers = [Some(self.vertex_buffer.clone())];
        let stride = std::mem::size_of::<LiveDesktopShaderVertex>() as u32;
        let offset = 0u32;
        let samplers = [
            Some(self.point_sampler.clone()),
            Some(self.linear_sampler.clone()),
        ];
        let empty_shader_resources = vec![None; shader_resources.len().max(1)];
        unsafe {
            context.OMSetRenderTargets(Some(&render_targets), None::<&ID3D11DepthStencilView>);
            context.RSSetViewports(Some(&[viewport]));
            context.IASetInputLayout(&self.input_layout);
            context.IASetVertexBuffers(
                0,
                1,
                Some(vertex_buffers.as_ptr()),
                Some(&stride as *const u32),
                Some(&offset as *const u32),
            );
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&self.vertex_shader, None);
            context.PSSetShader(pixel_shader, None);
            if let Some(constant_buffer) = constant_buffer {
                context.PSSetConstantBuffers(0, Some(&[Some(constant_buffer.clone())]));
            } else {
                context.PSSetConstantBuffers(0, Some(&[None]));
            }
            context.PSSetShaderResources(0, Some(shader_resources));
            context.PSSetSamplers(0, Some(&samplers));
            context.Draw(3, 0);
            context.PSSetShaderResources(0, Some(&empty_shader_resources));
            context.PSSetConstantBuffers(0, Some(&[None]));
            context.OMSetRenderTargets(None, None::<&ID3D11DepthStencilView>);
        }
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_kawase_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        source_width: u32,
        source_height: u32,
        target: &LiveDesktopShaderTexture,
        offset: f32,
        label: &str,
    ) -> Result<(), String> {
        let constants = LiveDesktopKawaseConstants {
            values0: [
                1.0 / source_width.max(1) as f32,
                1.0 / source_height.max(1) as f32,
                if offset.is_finite() { offset } else { 1.0 },
                0.0,
            ],
            values1: [0.0; 4],
            values2: [0.0; 4],
            values3: [0.0; 4],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.kawase_constants,
                &constants,
                "kawase constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                &self.kawase_pixel_shader,
                Some(&self.kawase_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        if target.width == 0 || target.height == 0 {
            return Err(format!("{label} kawase target has invalid size"));
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_gaussian_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        source_width: u32,
        source_height: u32,
        target: &LiveDesktopShaderTexture,
        sigma: f32,
        direction: [f32; 2],
        label: &str,
    ) -> Result<(), String> {
        let sigma = if sigma.is_finite() {
            sigma.max(0.001)
        } else {
            0.001
        };
        let radius = (sigma * 3.0).ceil().clamp(0.0, 32.0);
        let constants = LiveDesktopKawaseConstants {
            values0: [
                1.0 / source_width.max(1) as f32,
                1.0 / source_height.max(1) as f32,
                direction[0],
                direction[1],
            ],
            values1: [sigma, radius, 0.0, 0.0],
            values2: [0.0; 4],
            values3: [0.0; 4],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.kawase_constants,
                &constants,
                "gaussian constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                &self.gaussian_pixel_shader,
                Some(&self.kawase_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        if target.width == 0 || target.height == 0 {
            return Err(format!("{label} gaussian target has invalid size"));
        }
        Ok(())
    }

    unsafe fn draw_acrylic_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        target: &LiveDesktopShaderTexture,
        acrylic: &LiveDesktopAcrylicEffectPlan,
        _label: &str,
    ) -> Result<(), String> {
        let constants = LiveDesktopAcrylicConstants {
            values0: [
                acrylic.alpha.clamp(0.0, 1.0),
                acrylic.saturation.clamp(0.4, 1.8),
                acrylic.contrast.clamp(0.6, 1.4),
                acrylic.brightness.clamp(0.4, 1.4),
            ],
            values1: [
                acrylic.tint_strength.clamp(0.0, 0.8),
                acrylic.noise.clamp(0.0, 0.08),
                if acrylic.seed.is_finite() {
                    acrylic.seed
                } else {
                    0.0
                },
                0.0,
            ],
            values2: [
                self.noise_texture.width.max(1) as f32,
                self.noise_texture.height.max(1) as f32,
                acrylic.tint_color[0].clamp(0.0, 1.0),
                acrylic.tint_color[1].clamp(0.0, 1.0),
            ],
            values3: [acrylic.tint_color[2].clamp(0.0, 1.0), 0.0, 0.0, 0.0],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.acrylic_constants,
                &constants,
                "acrylic constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[
                    Some(source_srv.clone()),
                    Some(self.noise_texture.srv.clone()),
                ],
                &self.acrylic_pixel_shader,
                Some(&self.acrylic_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopShaderTexture {
    pub(crate) unsafe fn create(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        label: &str,
    ) -> Result<Self, String> {
        let width = width.max(1);
        let height = height.max(1);
        let texture_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut texture = None;
        unsafe { device.CreateTexture2D(&texture_desc, None, Some(&mut texture)) }.map_err(
            |error| format!("CreateTexture2D({label} {width}x{height}) failed: {error}"),
        )?;
        let texture =
            texture.ok_or_else(|| format!("CreateTexture2D({label}) returned no texture"))?;
        let resource = texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("{label} texture resource cast failed: {error}"))?;
        let mut srv = None;
        unsafe { device.CreateShaderResourceView(&resource, None, Some(&mut srv)) }
            .map_err(|error| format!("CreateShaderResourceView({label}) failed: {error}"))?;
        let srv =
            srv.ok_or_else(|| format!("CreateShaderResourceView({label}) returned no view"))?;
        let mut rtv = None;
        unsafe { device.CreateRenderTargetView(&resource, None, Some(&mut rtv)) }
            .map_err(|error| format!("CreateRenderTargetView({label}) failed: {error}"))?;
        let rtv = rtv.ok_or_else(|| format!("CreateRenderTargetView({label}) returned no view"))?;
        Ok(Self {
            srv,
            rtv,
            width,
            height,
        })
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopShaderNoiseTexture {
    pub(crate) unsafe fn create(
        device: &ID3D11Device,
        size: u32,
        seed: u32,
    ) -> Result<Self, String> {
        let size = size.clamp(16, 512);
        let pixels = make_live_desktop_acrylic_noise_pixels(size, seed);
        let texture_desc = D3D11_TEXTURE2D_DESC {
            Width: size,
            Height: size,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let initial_data = D3D11_SUBRESOURCE_DATA {
            pSysMem: pixels.as_ptr() as *const std::ffi::c_void,
            SysMemPitch: size * 4,
            SysMemSlicePitch: 0,
        };
        let mut texture = None;
        unsafe { device.CreateTexture2D(&texture_desc, Some(&initial_data), Some(&mut texture)) }
            .map_err(|error| format!("CreateTexture2D(acrylic noise {size}x{size}) failed: {error}"))?;
        let texture = texture
            .ok_or_else(|| "CreateTexture2D(acrylic noise) returned no texture".to_string())?;
        let resource = texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("Acrylic noise texture resource cast failed: {error}"))?;
        let mut srv = None;
        unsafe { device.CreateShaderResourceView(&resource, None, Some(&mut srv)) }
            .map_err(|error| format!("CreateShaderResourceView(acrylic noise) failed: {error}"))?;
        let srv = srv.ok_or_else(|| {
            "CreateShaderResourceView(acrylic noise) returned no view".to_string()
        })?;
        Ok(Self {
            srv,
            width: size,
            height: size,
        })
    }
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_shader_textures(
    device: &ID3D11Device,
    levels: &[(u32, u32)],
    label: &str,
) -> Result<Vec<LiveDesktopShaderTexture>, String> {
    let mut textures = Vec::with_capacity(levels.len());
    for (index, (width, height)) in levels.iter().copied().enumerate() {
        textures.push(unsafe {
            LiveDesktopShaderTexture::create(
                device,
                width,
                height,
                &format!("{label} level {index}"),
            )
        }?);
    }
    Ok(textures)
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_pixel_shader(
    device: &ID3D11Device,
    shader_bytes: &[u8],
    label: &str,
) -> Result<ID3D11PixelShader, String> {
    let mut pixel_shader = None;
    unsafe {
        device.CreatePixelShader(
            shader_bytes,
            None::<&ID3D11ClassLinkage>,
            Some(&mut pixel_shader),
        )
    }
    .map_err(|error| format!("CreatePixelShader({label}) failed: {error}"))?;
    pixel_shader.ok_or_else(|| format!("CreatePixelShader({label}) returned no shader"))
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_sampler(
    device: &ID3D11Device,
    filter: windows::Win32::Graphics::Direct3D11::D3D11_FILTER,
    label: &str,
) -> Result<ID3D11SamplerState, String> {
    let sampler_desc = D3D11_SAMPLER_DESC {
        Filter: filter,
        AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
        MipLODBias: 0.0,
        MaxAnisotropy: 1,
        ComparisonFunc: D3D11_COMPARISON_NEVER,
        BorderColor: [0.0, 0.0, 0.0, 0.0],
        MinLOD: 0.0,
        MaxLOD: D3D11_FLOAT32_MAX,
    };
    let mut sampler = None;
    unsafe { device.CreateSamplerState(&sampler_desc, Some(&mut sampler)) }
        .map_err(|error| format!("CreateSamplerState({label}) failed: {error}"))?;
    sampler.ok_or_else(|| format!("CreateSamplerState({label}) returned no sampler"))
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_constant_buffer<T>(
    device: &ID3D11Device,
    label: &str,
) -> Result<ID3D11Buffer, String> {
    let byte_width = (std::mem::size_of::<T>() as u32).div_ceil(16) * 16;
    let desc = D3D11_BUFFER_DESC {
        ByteWidth: byte_width.max(16),
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
        StructureByteStride: 0,
    };
    let mut buffer = None;
    unsafe { device.CreateBuffer(&desc, None, Some(&mut buffer)) }
        .map_err(|error| format!("CreateBuffer({label}) failed: {error}"))?;
    buffer.ok_or_else(|| format!("CreateBuffer({label}) returned no buffer"))
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn update_live_desktop_constant_buffer<T>(
    context: &ID3D11DeviceContext,
    buffer: &ID3D11Buffer,
    value: &T,
    label: &str,
) -> Result<(), String> {
    let resource = buffer
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("{label} resource cast failed: {error}"))?;
    unsafe {
        context.UpdateSubresource(
            &resource,
            0,
            None,
            value as *const T as *const std::ffi::c_void,
            0,
            0,
        )
    };
    Ok(())
}

pub(crate) fn resolve_live_desktop_effect_render_size(
    width: u32,
    height: u32,
    effect_plan: Option<&LiveDesktopEffectPlan>,
) -> (u32, u32) {
    let width = width.max(1);
    let height = height.max(1);
    let max_width = effect_plan
        .map(|plan| plan.blur.render_max_width.max(1))
        .unwrap_or(960);
    let max_height = effect_plan
        .map(|plan| plan.blur.render_max_height.max(1))
        .unwrap_or(540);
    let scale = 1.0_f32
        .min(max_width as f32 / width as f32)
        .min(max_height as f32 / height as f32);
    (
        ((width as f32 * scale).round() as u32).max(1),
        ((height as f32 * scale).round() as u32).max(1),
    )
}

pub(crate) fn resolve_live_desktop_gaussian_sigma(
    radius_px: f32,
    render_axis: u32,
    target_axis: u32,
) -> f32 {
    let radius_px = if radius_px.is_finite() {
        radius_px.max(0.0)
    } else {
        0.0
    };
    (radius_px * render_axis.max(1) as f32 / target_axis.max(1) as f32).max(0.001)
}

pub(crate) fn create_live_desktop_dual_kawase_levels(
    width: u32,
    height: u32,
    pass_count: u32,
    min_size: u32,
) -> Vec<(u32, u32)> {
    let mut levels = Vec::new();
    let mut current_width = width.max(1);
    let mut current_height = height.max(1);
    let count = pass_count.max(1);
    let min_size = min_size.max(1);
    for _ in 0..count {
        current_width = current_width.div_ceil(2).max(min_size);
        current_height = current_height.div_ceil(2).max(min_size);
        levels.push((current_width, current_height));
        if current_width == min_size && current_height == min_size {
            break;
        }
    }
    levels
}

pub(crate) fn make_live_desktop_acrylic_noise_pixels(size: u32, seed: u32) -> Vec<u8> {
    let size = size.clamp(16, 512) as usize;
    let mut pixels = vec![0u8; size.saturating_mul(size).saturating_mul(4)];
    let mut state = seed.wrapping_add(0x9e3779b9);
    for offset in (0..pixels.len()).step_by(4) {
        state = state.wrapping_add(0x6d2b79f5);
        let mut value = state;
        value = (value ^ (value >> 15)).wrapping_mul(value | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        let sample = ((value ^ (value >> 14)) >> 24) as u8;
        pixels[offset] = sample;
        pixels[offset + 1] = sample;
        pixels[offset + 2] = sample;
        pixels[offset + 3] = 255;
    }
    pixels
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn compile_live_desktop_shader(
    source: &str,
    entry_point: PCSTR,
    target: PCSTR,
    label: &str,
) -> Result<ID3DBlob, String> {
    let mut code = None;
    let mut errors = None;
    let result = unsafe {
        D3DCompile(
            source.as_ptr() as *const std::ffi::c_void,
            source.len(),
            s!("live_desktop_shader"),
            None,
            None::<&ID3DInclude>,
            entry_point,
            target,
            D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_OPTIMIZATION_LEVEL1,
            0,
            &mut code,
            Some(&mut errors),
        )
    };
    match result {
        Ok(()) => code.ok_or_else(|| format!("D3DCompile({label}) returned no blob")),
        Err(error) => {
            let message = errors
                .as_ref()
                .map(|blob| unsafe { live_desktop_d3d_blob_string(blob) })
                .filter(|message| !message.is_empty())
                .unwrap_or_else(|| "no compiler diagnostics".to_string());
            Err(format!("D3DCompile({label}) failed: {error}; {message}"))
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn live_desktop_d3d_blob_bytes(blob: &ID3DBlob) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize())
    }
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn live_desktop_d3d_blob_string(blob: &ID3DBlob) -> String {
    let bytes = unsafe { live_desktop_d3d_blob_bytes(blob) };
    String::from_utf8_lossy(bytes)
        .trim_matches(char::from(0))
        .trim()
        .to_string()
}
