# Tauri Native Backend

This folder contains the Windows native shell for LaunchPad.

Implemented commands:

- `scan_apps`: scans the enabled scan roots passed by the frontend for `.lnk`, `.url`, and `.exe` launch entries.
- `load_layout`: loads `layout.json` from the app data directory.
- `save_layout`: saves the current LaunchPad layout and settings.
- `pick_launch_file`: opens a Windows file picker for `.exe` and `.lnk` launch targets and returns the selected native launch target.
- `pick_scan_root_directory`: opens a Windows folder picker for custom scan roots.
- `load_app_icon_choices`: extracts available icon choices from `.exe`, `.dll`, `.ico`, or `.lnk` targets.
- `check_launch_targets`: checks whether local launch paths still exist.
- `load_cached_app_icons`: reads cached icon PNGs from the app icon cache for layout hydration.
- `launch_app`: launches the current frontend launch payload, with catalog and saved-layout fallbacks. Native launch failures are shown with a Windows message box that includes a reason and suggested action.
- `hide_main_window`: hides the main LaunchPad window after close animations.
- `set_main_window_effects_enabled`: toggles acrylic window effects during open/close transitions.

Known MVP limits:

- Directory scanning keeps `.lnk` and `.url` entries as shell-launched local shortcuts.
- Packaged/UWP app discovery is not implemented yet.
