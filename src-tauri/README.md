# Tauri Native Backend

This folder contains the Windows native shell for LaunchPad.

Implemented commands:

- `scan_apps`: scans the enabled scan roots passed by the frontend for `.lnk`, `.url`, and `.exe` launch entries.
- `load_layout`: loads `layout.json` from the app data directory.
- `save_layout`: saves the current LaunchPad layout and settings.
- `check_launch_targets`: checks whether local launch paths still exist.
- `load_cached_app_icons`: reads cached icon PNGs from the app icon cache for layout hydration.
- `launch_app`: launches a catalog item by server-side `appId`.

Known MVP limits:

- Shortcut targets are not resolved yet; `.lnk` files are launched through the Windows shell.
- Real application icon extraction is not implemented yet.
- Packaged/UWP app discovery is not implemented yet.
