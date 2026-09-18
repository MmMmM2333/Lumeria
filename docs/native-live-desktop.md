# Native Live Desktop

Live Desktop reuses the original Windows capture and effect implementation in
`crates/lumeria-live-desktop`, loaded in-process through
`bun/lumeria_live_desktop.dll`. It is disabled by default. To opt in for a local
Native run, set `LUMERIA_EXPERIMENTAL_LIVE_DESKTOP=1` before starting the process;
the background choice appears only when the capability probe succeeds. Restart
without the variable to return to the default-disabled behavior. Persisted
`windowsLiveDesktop` settings cannot bypass this gate.

When disabled, the application does not load the DLL or probe/capture the desktop.
The enabled implementation retains the original Wallpaper Engine popup WGC source,
D3D11 copy/effects and capture thread. It is not a general video wallpaper player.
Unsupported sources and capture/device failures are reported; the configured base
background remains the fallback. Mouse relay remains disabled by default.

The DLL owns its capture device and visual; the pinned Electrobun SDK attaches that
visual below Pixi's visual in the same composition tree. This avoids HWND child
clipping and duplicate composition targets. The SDK owns its COM reference until
detach or window destruction. DLL memory remains loaded until process exit so an
abandoned worker can never call unloaded code; stop errors remain observable.

Settings apply uses the existing transaction/rollback path. Hide/minimize pauses
presentation, switching away stops capture, and window display changes restart the
capture source. Shutdown stops capture before acknowledging successful close;
failed cleanup restores the existing close retry path.

Build with `npm run native:live-desktop:build`; normal Native build/dev/smoke
prerequisites also build this library. Runtime notices include both Rust packages.
The public ABI accepts bounded UTF-8 JSON requests through
`lumeria_live_desktop_request` and frees owned responses through
`lumeria_live_desktop_free`. Only current-process HWNDs are accepted.

Stage-six evidence: actual wallpaper + foreground pixel assertion, blur, hide and
minimize restoration, stop/restart, Pixi device recovery, report/trace export and
clean shutdown passed in `artifacts/stage6/live-recovery/`. Production manual/login
startup verified no DLL load with the default flag, even with a persisted Live
Desktop source. Mixed-DPI/multiple physical displays and a separate capture-device
loss were not available for this run; no claim of hardware coverage is made.
