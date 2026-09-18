# Native data service

The Rust workspace separates shared Windows/data capabilities (`lumeria-core`),
the serial JSON-lines process (`lumeria-native-data`), and the in-process
Live Desktop library (`lumeria-live-desktop`). The core has no Tauri or Electrobun
dependency. Windows-specific implementations remain explicit. The Tauri host
is retired; its final version is preserved at `archive/tauri-vue-final`.

Build from the repository root with `npm run native:data:build`. The workspace
uses one root `Cargo.lock` and the root `target` directory. The release executable
is `target/release/lumeria_native_data.exe`; Electrobun copies it into
`bun/lumeria-native-data.exe`. `npm run test:native-data` exercises the Rust tests and the actual release
binary through the production TypeScript client.

## Compatibility contract

Requests and responses are UTF-8 JSON, one per line. Requests contain `version: 1`,
an unsigned `id`, and `operation`. Responses contain `version: 1`, the same `id`,
and `ok`; successful replies have `value` (including explicit `null`), failures
have `error`. An unparseable request preserves a recoverable unsigned ID or uses
zero. Unknown operations, fields and protocol versions produce explicit errors.
The service processes requests serially. EOF ends the service; output failures
are errors. Standard output is reserved for protocol messages; diagnostics use
standard error.

| Operation | Request fields | Result |
| --- | --- | --- |
| `hello` | — | Protocol version and autostart availability |
| `loadLayout` | — | Validated layout or `null` |
| `saveLayout` | `layout` | `null`, after validated atomic persistence |
| `scanApps` | `roots`, optional `filters` | Catalog, excluded entries, warnings and statistics |
| `launchApp` | `appId` | `null`; launch errors preserve `kind` and `detail` |
| `checkLaunchTargets` | `targets` | Per-ID `ok`, `missing`, or `unknown` status |
| `loadIconChoices` | `targetPath` | Icon choices with cached path and PNG data URL |
| `cacheCustomIcon` | `dataUrl` | Content-addressed cached PNG |
| `cacheBackground` | `path` | Validated cached background image |
| `wallpaper` | `rect` | Cached desktop wallpaper or `null` |
| `autostart` | optional `enabled` | Current autostart state |

Launching resolves the ID against the server's catalog and validated saved
layout; callers cannot inject an executable path into `launchApp`. Autostart
discovers a verified installed product launcher and never registers the data
service executable. Development executables do not qualify as installed products.

Data remains under `%APPDATA%/com.lumeria.app`: `layout.json`, `icons/`, and
`backgrounds/`. Tests use the absolute `LUMERIA_NATIVE_DATA_DIR` override. The
workspace split does not migrate data or change layout version 2, cache naming,
launch error categories, or the protocol version. The TypeScript client retains
serial request ordering and waits for outstanding requests during normal shutdown.

The Native runtime notice collector starts at the `lumeria-native-data` workspace
member and the Live Desktop library. Archived Tauri code does not imply a data-service
runtime dependency. Check its actual normal/build graph with
`cargo tree -p lumeria-native-data --edges normal,build --locked`.
