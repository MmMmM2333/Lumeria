use tauri::WebviewWindow;

use crate::native_error::NativeError;

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::HWND,
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMNCRP_USEWINDOWSTYLE, DWMWA_BORDER_COLOR, DWMWA_CLOAK,
        DWMWA_COLOR_DEFAULT, DWMWA_COLOR_NONE, DWMWA_NCRENDERING_POLICY,
        DWMWA_TRANSITIONS_FORCEDISABLED, DWMWA_USE_IMMERSIVE_DARK_MODE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND, DWMWINDOWATTRIBUTE,
    },
    UI::WindowsAndMessaging::{
        IsWindowVisible, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE, SW_HIDE,
    },
};

#[cfg(target_os = "windows")]
const WINDOWS_DWM_FRAME_ATTRIBUTES_MIN_BUILD: u32 = 22000;

pub(crate) fn set_window_shadow_enabled(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_shadow(enabled)
        .map_err(|source| NativeError::Tauri {
            context: "WebviewWindow::set_shadow",
            source,
        })?;
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn set_dwm_attribute_for_hwnd<T>(
    hwnd: HWND,
    attribute: DWMWINDOWATTRIBUTE,
    value: &T,
) -> Result<(), NativeError> {
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            value as *const _ as _,
            std::mem::size_of_val(value) as u32,
        )
    }
    .map_err(|source| NativeError::dwm("DwmSetWindowAttribute", source))
}

#[cfg(target_os = "windows")]
fn set_dwm_attribute<T>(
    window: &WebviewWindow,
    attribute: DWMWINDOWATTRIBUTE,
    value: &T,
) -> Result<(), NativeError> {
    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd",
        source,
    })?;
    unsafe { set_dwm_attribute_for_hwnd(hwnd, attribute, value) }
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_border_enabled(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    if windows_version::OsVersion::current().build < WINDOWS_DWM_FRAME_ATTRIBUTES_MIN_BUILD {
        return Ok(());
    }
    let color = if enabled {
        DWMWA_COLOR_DEFAULT
    } else {
        DWMWA_COLOR_NONE
    };
    if let Err(error) = set_dwm_attribute(window, DWMWA_BORDER_COLOR, &color) {
        let border_state = if enabled { "default" } else { "none" };
        log::warn!(
            target: "dwm",
            "Failed to set window border color {border_state}: {error}"
        );
        return Err(error.into());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_border_enabled(
    _window: &WebviewWindow,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_corner_rounding_enabled(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    if windows_version::OsVersion::current().build < WINDOWS_DWM_FRAME_ATTRIBUTES_MIN_BUILD {
        return Ok(());
    }
    let preference = if enabled {
        DWMWCP_ROUND
    } else {
        DWMWCP_DONOTROUND
    };
    if let Err(error) = set_dwm_attribute(window, DWMWA_WINDOW_CORNER_PREFERENCE, &preference) {
        let preference_name = if enabled { "round" } else { "doNotRound" };
        log::warn!(
            target: "dwm",
            "Failed to set window corner preference {preference_name}: {error}"
        );
        return Err(error.into());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_corner_rounding_enabled(
    _window: &WebviewWindow,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_cloaked(window: &WebviewWindow, cloaked: bool) -> Result<(), String> {
    let cloak = if cloaked { 1i32 } else { 0i32 };
    set_dwm_attribute(window, DWMWA_CLOAK, &cloak)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_cloaked(_window: &WebviewWindow, _cloaked: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_non_client_rendering(window: &WebviewWindow) -> Result<(), String> {
    let policy = DWMNCRP_USEWINDOWSTYLE;
    set_dwm_attribute(window, DWMWA_NCRENDERING_POLICY, &policy)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_non_client_rendering(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_transitions_enabled(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    let disabled = if enabled { 0i32 } else { 1i32 };
    set_dwm_attribute(window, DWMWA_TRANSITIONS_FORCEDISABLED, &disabled)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_transitions_enabled(
    _window: &WebviewWindow,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_window_backdrop_dark_mode(
    window: &WebviewWindow,
    dark: bool,
) -> Result<(), String> {
    let enabled = if dark { 1i32 } else { 0i32 };
    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for backdrop dark mode",
        source,
    })?;
    unsafe {
        let _ = set_dwm_attribute_for_hwnd(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &enabled);
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_backdrop_dark_mode(
    _window: &WebviewWindow,
    _dark: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn set_main_window_topmost(window: &WebviewWindow, topmost: bool) -> Result<(), String> {
    let hwnd_insert_after = if topmost {
        Some(HWND_TOPMOST)
    } else {
        Some(HWND_NOTOPMOST)
    };
    unsafe {
        SetWindowPos(
            window.hwnd().map_err(|source| NativeError::Tauri {
                context: "WebviewWindow::hwnd for topmost",
                source,
            })?,
            hwnd_insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING,
        )
    }
    .map_err(|source| NativeError::win32("SetWindowPos(topmost)", source))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_main_window_topmost(
    _window: &WebviewWindow,
    _topmost: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn hide_window_immediately(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for immediate hide",
        source,
    })?;
    unsafe {
        let _ = ShowWindow(hwnd, SW_HIDE);
    }
    if unsafe { IsWindowVisible(hwnd).as_bool() } {
        return Err("ShowWindow(SW_HIDE) left the main window visible".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn hide_window_immediately(window: &WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hide immediately",
        source,
    })?;
    Ok(())
}
