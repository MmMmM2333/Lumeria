#[allow(unused_imports)]
use super::*;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeConfig {
    pub(crate) effect: LiveDesktopBackgroundEffect,
    #[serde(default)]
    pub(crate) debug_frame_source_override: Option<LiveDesktopDebugFrameSourceOverride>,
    pub(crate) blur_strength: u32,
    pub(crate) darken_strength: u32,
    pub(crate) darken_color: String,
    #[serde(default = "default_live_desktop_opacity")]
    pub(crate) opacity: u32,
    #[serde(default)]
    pub(crate) effect_plan: Option<LiveDesktopEffectPlan>,
    pub(crate) acrylic_appearance: LiveDesktopAcrylicAppearance,
    pub(crate) acrylic_params: LiveDesktopAcrylicParams,
    #[serde(default = "default_live_desktop_disable_mouse_relay")]
    pub(crate) disable_mouse_relay: bool,
    #[serde(default)]
    pub(crate) skip_blank_frames: bool,
    #[serde(default)]
    pub(crate) force_dwm_flush: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LiveDesktopBackgroundEffect {
    None,
    Dimmed,
    Blur,
    Acrylic,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopEffectPlan {
    pub(crate) effect: LiveDesktopBackgroundEffect,
    pub(crate) blur: LiveDesktopBlurEffectPlan,
    pub(crate) acrylic: LiveDesktopAcrylicEffectPlan,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopBlurEffectPlan {
    #[serde(default)]
    pub(crate) kernel: LiveDesktopBlurKernel,
    #[serde(default)]
    pub(crate) gaussian_radius_px: f32,
    pub(crate) render_max_width: u32,
    pub(crate) render_max_height: u32,
    pub(crate) pass_count: u32,
    pub(crate) min_size: u32,
    pub(crate) offset_scale: f32,
    pub(crate) down_offsets: Vec<f32>,
    pub(crate) up_offsets: Vec<f32>,
    pub(crate) final_up_offset: f32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LiveDesktopBlurKernel {
    #[default]
    DualKawase,
    Gaussian,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopAcrylicEffectPlan {
    pub(crate) brightness: f32,
    pub(crate) contrast: f32,
    pub(crate) noise: f32,
    pub(crate) saturation: f32,
    pub(crate) seed: f32,
    pub(crate) tint_color: [f32; 3],
    pub(crate) tint_strength: f32,
    pub(crate) alpha: f32,
    pub(crate) enabled: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum LiveDesktopFrameSource {
    #[default]
    WallpaperEnginePopupCapture,
    TestPattern,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LiveDesktopDebugFrameSourceOverride {
    TestPattern,
}

pub(crate) fn default_live_desktop_disable_mouse_relay() -> bool {
    true
}

pub(crate) fn default_live_desktop_opacity() -> u32 {
    100
}

impl LiveDesktopFrameSource {
    pub(crate) fn uses_window_capture(&self) -> bool {
        matches!(self, Self::WallpaperEnginePopupCapture)
    }

    pub(crate) fn window_capture_label(&self) -> &'static str {
        "Wallpaper Engine popup WGC"
    }

    pub(crate) fn window_capture_unavailable_reason(&self) -> &'static str {
        "wallpaperEnginePopupCaptureUnavailable"
    }
}

impl LiveDesktopRuntimeConfig {
    pub(crate) fn effective_frame_source(&self) -> LiveDesktopFrameSource {
        match self.debug_frame_source_override {
            Some(LiveDesktopDebugFrameSourceOverride::TestPattern) => {
                LiveDesktopFrameSource::TestPattern
            }
            None => LiveDesktopFrameSource::WallpaperEnginePopupCapture,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LiveDesktopAcrylicAppearance {
    System,
    Dark,
    Light,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopAcrylicParams {
    pub(crate) brightness: f32,
    pub(crate) contrast: f32,
    pub(crate) noise: f32,
    pub(crate) saturation: f32,
    pub(crate) seed: f32,
    pub(crate) tint_color: [f32; 3],
    pub(crate) tint_strength: f32,
}

impl Default for LiveDesktopRuntimeConfig {
    fn default() -> Self {
        Self {
            effect: LiveDesktopBackgroundEffect::Dimmed,
            debug_frame_source_override: None,
            blur_strength: 50,
            darken_strength: 28,
            darken_color: "#1c1c1c".to_string(),
            opacity: default_live_desktop_opacity(),
            effect_plan: None,
            acrylic_appearance: LiveDesktopAcrylicAppearance::System,
            acrylic_params: LiveDesktopAcrylicParams::default(),
            disable_mouse_relay: default_live_desktop_disable_mouse_relay(),
            skip_blank_frames: false,
            force_dwm_flush: false,
        }
    }
}

impl Default for LiveDesktopAcrylicParams {
    fn default() -> Self {
        Self {
            brightness: 0.8,
            contrast: 0.85,
            noise: 0.005,
            saturation: 1.5,
            seed: 0.0,
            tint_color: [0.23529412, 0.23529412, 0.23529412],
            tint_strength: 0.2,
        }
    }
}
