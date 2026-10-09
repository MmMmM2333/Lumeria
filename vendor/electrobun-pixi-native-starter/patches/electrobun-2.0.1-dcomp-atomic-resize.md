# Electrobun 2.0.1 Windows DComp atomic resize patch

Baseline: official `v2.0.1` tag, commit `8d09d15db791f346e419efd452d6759750addb62`.
The npm package and materialized app devkit do not contain the native sources;
apply this patch to an official source checkout, never to `node_modules` or the
global Hutch cache.

```powershell
git clone --depth 1 --branch v2.0.1 https://github.com/blackboardsh/electrobun.git electrobun-v2.0.1
node tools/electrobun-dcomp-patch.mjs --apply electrobun-v2.0.1
node tools/electrobun-dcomp-patch.mjs electrobun-v2.0.1
```

Build from the checkout's `package` directory with the official entry point:

```powershell
hutch install
hutch build:dev
```

On this machine, Visual Studio Build Tools provides CMake outside `PATH`:

```powershell
$env:PATH = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;' + $env:PATH
hutch build:dev
```

The result is a complete devkit in `package/dist`, including
`libNativeWrapper.dll`. Select it before invoking Electrobun so both dev and
stable packaging consume the patched DLL:

```powershell
$env:HUTCH_ELECTROBUN_DEVKIT_ROOT = (Resolve-Path electrobun-v2.0.1\package\dist)
npm run dev
npm run build
```

This repository stages that complete local devkit at
`.hutch/devkit-dcomp-2.0.1`. Its `start`, `dev`, and `build` scripts use
`tools/run-electrobun.mjs`, which validates the devkit, exports the override,
and applies/verifies the projected WebGPU adapter patch before launching the
Electrobun command. Keeping the source devkit under `.hutch` is intentional:
stable packaging clears `artifacts`, but leaves this staging directory intact.
The current SDK inventory and native DLL hash are recorded in
`native-toolchain.lock.json`.

The Windows tray uses a hidden top-level tool window to receive TaskbarCreated.
It adds the original icon again, falls back to modifying an existing entry for
duplicate/DPI notifications, and retries every second while the shell is not
ready. Removing the tray cancels retries and destroys the receiver window.
Starter 0.2.16 includes native_touchpad.h in the reconstructible patch, with
nativeTouchpadAbi/Attach/Poll/Detach exports (touchpad ABI 1). Direct Manipulation
registers on the GPU surface HWND; registering only its root does not receive
DM_POINTERHITTEST on the tested Windows system. Parent subclassing owns focus/hide
cancellation while the surface owns viewport dimensions. Polling preserves phases,
physical pixel deltas and the native-frame GetTickCount64 clock epoch.
Starter 0.2.14 forwards WM_NCPAINT to default processing: suppressing it leaves
DWM non-client rendering inactive after disabling/re-enabling Acrylic and
produces an opaque gray fallback. Custom full-client windows omit WS_SYSMENU
to suppress DWM caption buttons while keeping caption/thickframe and the app's
explicit minimize/maximize/close commands. Fullscreen preserves that contract.
Starter 0.2.11 primes replacement visuals with a zero-opacity effect, then removes
that effect and the old visual in the same commit. This prevents translucent
generations from blending together during live resize. Real screen-pixel sampling
covers both repeated SetWindowPos changes and the native mouse resize loop.
Starter 0.2.10 preserves resizable native window styles for custom full-client
chrome, consumes the caption area, suppresses caption paint, and creates the
transparent GPU root/container without GDI redirection bitmaps. DComp owns pixel
alpha; Windows materials no longer compete with a creation-sized layered bitmap.
Starter 0.2.9 also separates tray primary activation from the right-click menu.
The primary callback copies its id/function before asynchronous dispatch so tray
destruction cannot invalidate the captured tray object.

The base devkit was produced by the official `build.ts`. For 0.2.14, the native
wrapper was recompiled from the official source with this patch using the
official Windows compile/link flags and existing pinned vendor libraries, then
staged in that devkit. Its hash was verified against the native build output
and the application's copied DLL. This was a wrapper rebuild, not a new full
devkit build. `native-devkit.json` identifies Electrobun 2.0.1 and maps
`layout.runtime.nativeWrapper` to `libNativeWrapper.dll`.

The patch keeps one persistent DComp target/root visual per WGPU child HWND.
The HWND subclass immediately scales the committed active frame on `WM_SIZE`
without resizing its buffers. Configure replaces only the pending generation;
its first successful Present atomically attaches it using the latest HWND
viewport. Failed or stale pending generations never replace active content.
Releasing a WGPU surface abandons unfinished work but leaves the active frame
attached so a replacement surface can claim the same HWND state. The state is
finally released from `WM_NCDESTROY`. In the current test setup this avoids the
observed resize-time blank frames and substantially reduces blanking during
cross-adapter recovery. A rare single blank frame can still occur while
DXGI/DWM retires the old GPU device. When a failed pending generation leaves a
differently sized active frame, the native bridge returns `Outdated` instead of
rendering invisibly underneath it. The WGPU child uses a dedicated no-background
window class with `WS_EX_NOREDIRECTIONBITMAP`, so asynchronous DComp commits
cannot expose the stock `STATIC` control's light redirection surface during
rapid resize.

On the DComp path the native bridge is now the only presentation owner: it
does not also configure Dawn's unused HWND swap chain. Dawn configuration is
reserved for the explicit non-DComp fallback, and the bridge records that
state so unconfigure is called exactly once. This prevents replacement
surfaces from failing `IDXGISwapChain1` creation with `0x80070005` and removes
the duplicate `Surface is not configured` teardown diagnostic.

Starter 0.2.13 adds an opt-in `capacity` resize mode. It queries Dawn device limits, keeps padded backing resources within capacity, and uses DXGI source size plus compensating matrix transforms. Reclaim occurs after one second of settled resize with a 1.5x area threshold. The default is selected by the consumer. See `docs/input-and-window.md` in Lumeria for window behavior and resize validation considerations.
