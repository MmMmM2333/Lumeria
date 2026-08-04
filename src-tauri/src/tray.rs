use std::io;

use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, Runtime,
};

use crate::i18n::translate;

pub(crate) const TRAY_ID: &str = "lumeria-main-tray";

struct TrayLabels {
    show: String,
    settings: String,
    logs: String,
    restart: String,
    quit: String,
}

fn tray_labels(locale: &str) -> Result<TrayLabels, String> {
    Ok(TrayLabels {
        show: translate(locale, "native.tray.show", &[])?,
        settings: translate(locale, "native.tray.settings", &[])?,
        logs: translate(locale, "native.tray.logs", &[])?,
        restart: translate(locale, "native.tray.restart", &[])?,
        quit: translate(locale, "native.tray.quit", &[])?,
    })
}

fn build_tray_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    locale: &str,
) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    let labels = tray_labels(locale).map_err(io::Error::other)?;
    Ok(MenuBuilder::new(manager)
        .text("show", labels.show)
        .text("settings", labels.settings)
        .text("logs", labels.logs)
        .separator()
        .text("restart", labels.restart)
        .text("quit", labels.quit)
        .build()?)
}

pub(crate) fn setup_tray(
    app: &mut tauri::App,
    locale: &str,
    icon: Image<'static>,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app, locale)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Lumeria")
        .icon(icon)
        .build(app)?;
    Ok(())
}

pub(crate) fn set_tray_icon(app: &AppHandle, icon: Image<'static>) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Lumeria tray icon is unavailable".to_string())?;
    tray.set_icon(Some(icon))
        .map_err(|error| format!("Failed to update Lumeria tray icon: {error}"))
}

pub(crate) fn update_tray_menu(
    app: &AppHandle,
    locale: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app, locale)?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Lumeria tray icon is missing"))?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_labels_use_the_shared_locale_catalog() {
        let labels = tray_labels("en-US").expect("English tray labels");
        assert_eq!(labels.show, "Show Lumeria");
        assert_eq!(labels.settings, "Settings");
        assert_eq!(labels.logs, "Open Logs Folder");
        assert_eq!(labels.restart, "Restart Lumeria");
        assert_eq!(labels.quit, "Quit");
    }
}
