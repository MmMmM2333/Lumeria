use tauri::{menu::MenuBuilder, tray::TrayIconBuilder};

pub(crate) fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show", "显示 Lumeria")
        .text("settings", "设置")
        .text("logs", "打开日志目录")
        .separator()
        .text("restart", "重启 Lumeria")
        .text("quit", "退出")
        .build()?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Lumeria");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
