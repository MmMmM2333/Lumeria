# Tauri Native Backend

This folder contains the Windows native shell for LaunchPad.

Implemented commands:

- `scan_apps`: scans user and system Start Menu folders for `.lnk`, `.url`, and `.exe` launch entries.
- `load_layout`: loads `layout.json` from the app data directory.
- `save_layout`: saves the current LaunchPad layout and settings.
- `launch_app`: launches a catalog item by server-side `appId`.

Known MVP limits:

- Shortcut targets are not resolved yet; `.lnk` files are launched through the Windows shell.
- Real application icon extraction is not implemented yet.
- Packaged/UWP app discovery is not implemented yet.
