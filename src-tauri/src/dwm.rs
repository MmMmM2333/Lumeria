use tauri::WebviewWindow;

use crate::native_error::NativeError;

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::HWND,
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMNCRP_USEWINDOWSTYLE, DWMWA_CLOAK,
        DWMWA_NCRENDERING_POLICY, DWMWA_TRANSITIONS_FORCEDISABLED, DWMWA_USE_IMMERSIVE_DARK_MODE,
        DWMWINDOWATTRIBUTE,
    },
    UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
        SWP_NOSENDCHANGING, SWP_NOSIZE,
    },
};

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
    .map_err(|source| NativeError::Dwm {
        context: "DwmSetWindowAttribute",
        source,
    })
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
pub(crate) fn set_window_non_client_rendering(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    let policy = if enabled {
        DWMNCRP_USEWINDOWSTYLE
    } else {
        DWMNCRP_DISABLED
    };
    set_dwm_attribute(window, DWMWA_NCRENDERING_POLICY, &policy)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_window_non_client_rendering(
    _window: &WebviewWindow,
    _enabled: bool,
) -> Result<(), String> {
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
    .map_err(|source| NativeError::Win32 {
        context: "SetWindowPos(topmost)",
        source,
    })?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn set_main_window_topmost(
    _window: &WebviewWindow,
    _topmost: bool,
) -> Result<(), String> {
    Ok(())
}
