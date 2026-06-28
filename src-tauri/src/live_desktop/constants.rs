#[allow(unused_imports)]
use super::*;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_D3D_FEATURE_LEVELS: [D3D_FEATURE_LEVEL; 4] = [
    D3D_FEATURE_LEVEL_11_1,
    D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_10_0,
];

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS: u32 = 100;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS: u64 = 16;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_WGC_FRAME_POOL_BUFFER_COUNT: i32 = 3;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_WGC_FRAME_EVENT_FALLBACK_MS: u64 = 16;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_FRAME_ERROR_CIRCUIT_BREAK: u32 = 5;

pub(crate) const LIVE_DESKTOP_RECENT_ERROR_LIMIT: usize = 16;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS: u64 = 10_000;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS: u64 = 1_000;

#[cfg(target_os = "windows")]
pub(crate) const LIVE_DESKTOP_RENDERER_STARTUP_CANCEL_JOIN_TIMEOUT_MS: u64 = 1_000;
