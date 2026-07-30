# Tauri Native Backend

This folder contains the Windows native shell for Lumeria.

Implemented commands:

- `scan_apps`: scans the enabled scan roots passed by the frontend for `.lnk`, `.url`, and `.exe` launch entries.
- `load_layout`: loads `layout.json` from the app data directory.
- `save_layout`: saves the current Lumeria layout and settings.
- `pick_launch_file`: opens a Windows file picker for `.exe`, `.lnk`, and `.url` launch targets and returns the selected native launch target.
- `pick_scan_root_directory`: opens a Windows folder picker for custom scan roots.
- `load_app_icon_choices`: extracts available icon choices from `.exe`, `.dll`, `.ico`, or `.lnk` targets.
- `check_launch_targets`: checks whether local launch paths still exist.
- `launch_app`: launches by app id/name after the frontend persists launch-critical changes for that app. The backend resolves the launch target from the native catalog, saved layout, or saved-root rescan, and does not accept renderer-supplied launch targets or arguments. Launch arguments are used only for saved `.exe` targets. Native launch failures are shown with a Windows message box that includes a reason and suggested action.
- `hide_main_window`: hides the main Lumeria window after close animations.
- `show_main_window`: opens the initially hidden main window through the cloaked show flow.
- `reveal_main_window`: uncloaks the main window after the renderer reports that the opening frame has painted.
- `get_main_window_effects_support`: reports Windows build support for Acrylic, Mica, and Mica Alt.
- `set_main_window_effects_enabled`: toggles and updates Acrylic/Mica/Mica Alt window effects during open/close transitions.
- `set_main_window_mode`: switches the frameless main window between fullscreen and resizable windowed mode.
- `set_main_window_native_frame_enabled`: toggles the native window frame so close animations do not show a stray shadow, border, or rounded corner.

Known MVP limits:

- Directory scanning keeps `.lnk` and `.url` entries as shell-launched local shortcuts.
- Packaged/UWP app discovery is not implemented yet.
