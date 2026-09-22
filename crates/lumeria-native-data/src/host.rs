use std::{
    collections::HashMap,
    io::{self, BufRead, Write},
    path::Path,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use lumeria_core::{
    catalog::{icon_cache_dir, scan_apps_from_roots, ScanFilters, ScanRoot},
    launch::{
        check_launch_targets_sync, launch_app_with_mode as launch_selected_catalog_app, LaunchFailure,
        LaunchTargetCheckRequest,
    },
    layout_store::{load_layout_from_path, save_layout_to_path},
    models::AppCatalogItem,
};

use crate::autostart::{native_autostart, native_autostart_available};
use crate::native_paths::data_directory;

const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
    RevealLayout { version: u32, id: u64 },
    BackupResetLayout { version: u32, id: u64 },
    RevealPath { version: u32, id: u64, path: String, folder: bool },
    CheckLaunchTargets {
        version: u32,
        id: u64,
        targets: Vec<LaunchTargetCheckRequest>,
    },
    CacheBackground {
        version: u32,
        id: u64,
        path: String,
    },
    Wallpaper {
        version: u32,
        id: u64,
        rect: [i32; 4],
    },
    Autostart {
        version: u32,
        id: u64,
        enabled: Option<bool>,
    },
    LoadIconChoices {
        version: u32,
        id: u64,
        #[serde(rename = "targetPath")]
        target_path: String,
    },
    CacheCustomIcon {
        version: u32,
        id: u64,
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    SaveLayout {
        version: u32,
        id: u64,
        layout: Value,
    },
    Hello {
        version: u32,
        id: u64,
    },
    LoadLayout {
        version: u32,
        id: u64,
    },
    ScanApps {
        version: u32,
        id: u64,
        roots: Vec<ScanRoot>,
        #[serde(default)]
        filters: ScanFilters,
    },
    LaunchApp {
        version: u32,
        id: u64,
        #[serde(rename = "appId")]
        app_id: String,
        #[serde(default)]
        elevated: bool,
    },
}

impl Request {
    fn id(&self) -> u64 {
        match self {
            Self::Hello { id, .. }
            | Self::RevealLayout { id, .. }
            | Self::BackupResetLayout { id, .. }
            | Self::RevealPath { id, .. }
            | Self::CheckLaunchTargets { id, .. }
            | Self::CacheBackground { id, .. }
            | Self::Wallpaper { id, .. }
            | Self::Autostart { id, .. }
            | Self::LoadIconChoices { id, .. }
            | Self::CacheCustomIcon { id, .. }
            | Self::SaveLayout { id, .. }
            | Self::LoadLayout { id, .. }
            | Self::ScanApps { id, .. }
            | Self::LaunchApp { id, .. } => *id,
        }
    }

    fn version(&self) -> u32 {
        match self {
            Self::Hello { version, .. }
            | Self::RevealLayout { version, .. }
            | Self::BackupResetLayout { version, .. }
            | Self::RevealPath { version, .. }
            | Self::CheckLaunchTargets { version, .. }
            | Self::CacheBackground { version, .. }
            | Self::Wallpaper { version, .. }
            | Self::Autostart { version, .. }
            | Self::LoadIconChoices { version, .. }
            | Self::CacheCustomIcon { version, .. }
            | Self::SaveLayout { version, .. }
            | Self::LoadLayout { version, .. }
            | Self::ScanApps { version, .. }
            | Self::LaunchApp { version, .. } => *version,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    version: u32,
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

impl Response {
    fn success(id: u64, value: Value) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            id,
            ok: true,
            value: Some(value),
            error: None,
        }
    }

    fn failure(id: u64, error: impl Into<String>) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            id,
            ok: false,
            value: None,
            error: Some(Value::String(error.into())),
        }
    }

    fn launch_failure(id: u64, error: LaunchFailure) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            id,
            ok: false,
            value: None,
            error: Some(json!(error.payload())),
        }
    }
}

#[derive(Default)]
struct HostState {
    catalog: HashMap<String, AppCatalogItem>,
}

pub fn run() -> Result<(), String> {
    let data_dir = data_directory()?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    run_with_io(stdin.lock(), stdout.lock(), &data_dir)
}

fn run_with_io(input: impl BufRead, mut output: impl Write, data_dir: &Path) -> Result<(), String> {
    let mut state = HostState::default();
    for line in input.lines() {
        let line = line.map_err(|error| format!("Failed to read native data request: {error}"))?;
        let response = handle_line(&line, data_dir, &mut state);
        serde_json::to_writer(&mut output, &response)
            .map_err(|error| format!("Failed to serialize native data response: {error}"))?;
        output
            .write_all(b"\n")
            .and_then(|_| output.flush())
            .map_err(|error| format!("Failed to write native data response: {error}"))?;
    }
    Ok(())
}

fn handle_line(line: &str, data_dir: &Path, state: &mut HostState) -> Response {
    let request = match serde_json::from_str::<Request>(line) {
        Ok(request) => request,
        Err(error) => {
            let id = serde_json::from_str::<Value>(line)
                .ok()
                .and_then(|value| value.get("id").and_then(Value::as_u64))
                .unwrap_or(0);
            return Response::failure(id, format!("Invalid native data request: {error}"));
        }
    };
    let id = request.id();
    if request.version() != PROTOCOL_VERSION {
        return Response::failure(
            id,
            format!(
                "Unsupported native data protocol version {}; expected {PROTOCOL_VERSION}",
                request.version()
            ),
        );
    }

    let result = match request {
        Request::RevealLayout { .. } => {
            let path=data_dir.join("layout.json");
            let (target,folder)=if path.exists(){(path,false)}else{(data_dir.to_path_buf(),true)};
            lumeria_core::target_details::reveal_path(&target.to_string_lossy(),folder).map(|()|Value::Null)
        },
        Request::BackupResetLayout { .. } => backup_reset_layout(data_dir).map(|path|json!({"backupPath":path})),
        Request::RevealPath { path, folder, .. } => lumeria_core::target_details::reveal_path(&path, folder).map(|()| Value::Null),
        Request::CheckLaunchTargets { targets, .. } => check_launch_targets_sync(targets)
            .and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string())),
        Request::CacheBackground { path, .. } => cache_background(data_dir, &path),
        Request::Wallpaper { rect, .. } => cache_wallpaper(data_dir, rect),
        Request::Autostart { enabled, .. } => native_autostart(enabled).map(Value::Bool),
        Request::LoadIconChoices { target_path, .. } => icon_cache_dir(data_dir)
            .and_then(|dir| {
                lumeria_core::app_icon_cache::load_app_icon_choices_from_dir(&target_path, &dir)
            })
            .and_then(|choices| serde_json::to_value(choices).map_err(|error| error.to_string())),
        Request::CacheCustomIcon { data_url, .. } => icon_cache_dir(data_dir)
            .and_then(|dir| lumeria_core::app_icon_cache::cache_custom_icon_to_dir(&data_url, &dir))
            .and_then(|icon| serde_json::to_value(icon).map_err(|error| error.to_string())),
        Request::Hello { .. } => Ok(
            json!({ "protocolVersion": PROTOCOL_VERSION, "autostartAvailable": native_autostart_available() }),
        ),
        Request::SaveLayout { layout, .. } => {
            save_layout_to_path(&data_dir.join("layout.json"), &layout).map(|()| Value::Null)
        }
        Request::LoadLayout { .. } => load_layout_from_path(&data_dir.join("layout.json"))
            .and_then(|layout| serde_json::to_value(layout).map_err(|error| error.to_string())),
        Request::ScanApps { roots, filters, .. } => icon_cache_dir(data_dir).and_then(|icon_dir| {
            scan_apps_from_roots(&roots, &icon_dir, &filters).and_then(|result| {
                state.catalog.clear();
                state
                    .catalog
                    .extend(result.apps.iter().cloned().map(|app| (app.id.clone(), app)));
                serde_json::to_value(result).map_err(|error| error.to_string())
            })
        }),
        Request::LaunchApp { app_id, elevated, .. } => {
            return match launch_app(&app_id, elevated, data_dir, state) {
                Ok(()) => Response::success(id, Value::Null),
                Err(error) => Response::launch_failure(id, error),
            };
        }
    };
    match result {
        Ok(value) => Response::success(id, value),
        Err(error) => Response::failure(id, error),
    }
}

fn backup_reset_layout(data_dir:&Path)->Result<String,String>{
    let path=data_dir.join("layout.json");
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error|error.to_string())?.as_nanos();
    let backup=data_dir.join(format!("layout.backup.{stamp}.json"));
    // Reserve a unique destination. Failed backup leaves the original untouched.
    let mut output=std::fs::OpenOptions::new().write(true).create_new(true).open(&backup).map_err(|error|error.to_string())?;
    let mut input=std::fs::File::open(&path).map_err(|error|error.to_string())?;
    std::io::copy(&mut input,&mut output).map_err(|error|error.to_string())?;
    output.sync_all().map_err(|error|error.to_string())?;
    drop(input);drop(output);
    std::fs::remove_file(&path).map_err(|error|error.to_string())?;
    Ok(backup.to_string_lossy().into_owned())
}

#[cfg(target_os = "windows")]
fn cache_background(data_dir: &Path, path: &str) -> Result<Value, String> {
    lumeria_core::background::cache_background_image_to_dir(
        &data_dir.join("backgrounds"),
        Path::new(path),
        "Background image",
    )
    .and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string()))
}
#[cfg(target_os = "windows")]
fn cache_wallpaper(data_dir: &Path, rect: [i32; 4]) -> Result<Value, String> {
    lumeria_core::background::cache_native_wallpaper(&data_dir.join("backgrounds"), rect)
        .and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string()))
}
#[cfg(not(target_os = "windows"))]
fn cache_background(_data_dir: &Path, _path: &str) -> Result<Value, String> {
    Err("Background cache is unavailable on this platform".into())
}
#[cfg(not(target_os = "windows"))]
fn cache_wallpaper(_data_dir: &Path, _rect: [i32; 4]) -> Result<Value, String> {
    Err("Wallpaper is unavailable on this platform".into())
}

fn launch_app(app_id: &str, elevated: bool, data_dir: &Path, state: &HostState) -> Result<(), LaunchFailure> {
    let app_id = lumeria_core::launch::validate_launch_app_id(app_id)?;
    let catalog_app = state.catalog.get(app_id).cloned();
    let saved_layout = load_layout_from_path(&data_dir.join("layout.json"))
        .map_err(LaunchFailure::layout_read_failed)?;
    launch_selected_catalog_app(app_id, catalog_app, saved_layout.as_ref(), elevated, || {
        icon_cache_dir(data_dir)
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn backup_reset_failure_preserves_original() {
        let directory=std::env::temp_dir().join(format!("lumeria-reset-failure-{}",std::process::id()));
        std::fs::create_dir_all(directory.join("layout.json")).unwrap();
        assert!(super::backup_reset_layout(&directory).is_err());
        assert!(directory.join("layout.json").is_dir());
        std::fs::remove_dir_all(directory).unwrap();
    }
    use super::*;
    use std::{
        env, fs,
        io::{self, Read},
        path::PathBuf,
    };

    #[test]
    fn background_cache_reuses_original_validation_and_content_addressing() {
        let dir = env::temp_dir().join(format!("lumeria-native-background-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let image = dir.join("source.png");
        fs::write(&image,lumeria_core::encoding::decode_base64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=").unwrap()).unwrap();
        let value = cache_background(&dir, image.to_str().unwrap()).unwrap();
        let cached = PathBuf::from(value["imagePath"].as_str().unwrap());
        assert!(cached.starts_with(dir.join("backgrounds")));
        assert_eq!(fs::read(&image).unwrap(), fs::read(&cached).unwrap());
        assert_eq!(
            cache_background(&dir, image.to_str().unwrap()).unwrap(),
            value
        );
        assert!(cache_background(&dir, "relative.png").is_err());
        assert!(cache_wallpaper(&dir, [0, 0, 0, 0]).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn protocol_eof_finishes_without_output() {
        let mut output = Vec::new();
        run_with_io(io::Cursor::new(Vec::new()), &mut output, &env::temp_dir())
            .expect("EOF should end the protocol loop cleanly");
        assert!(output.is_empty());
    }

    #[test]
    fn malformed_request_preserves_parseable_id_and_reports_invalid_json() {
        let invalid_json = handle_line(
            r#"{"version":1,"id":12"#,
            &env::temp_dir(),
            &mut HostState::default(),
        );
        assert!(!invalid_json.ok);
        assert_eq!(invalid_json.id, 0);
        assert!(invalid_json
            .error
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("Invalid native data request")));

        let response = handle_line(
            r#"{"version":1,"id":12,"operation":"unknown"}"#,
            &env::temp_dir(),
            &mut HostState::default(),
        );

        assert!(!response.ok);
        assert_eq!(response.id, 12);
        assert!(response
            .error
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("Invalid native data request")));
    }

    #[test]
    fn read_failure_is_reported_as_a_protocol_host_error() {
        struct FailingReader;

        impl Read for FailingReader {
            fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read probe failed"))
            }
        }

        impl BufRead for FailingReader {
            fn fill_buf(&mut self) -> io::Result<&[u8]> {
                Err(io::Error::other("read probe failed"))
            }

            fn consume(&mut self, _amount: usize) {}
        }

        let error = run_with_io(FailingReader, Vec::new(), &env::temp_dir())
            .expect_err("read failures should stop the protocol host");
        assert!(error.contains("Failed to read native data request"));
    }

    #[test]
    fn write_failure_is_reported_as_a_protocol_host_error() {
        struct FailingWriter;

        impl Write for FailingWriter {
            fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
                Err(io::Error::other("write probe failed"))
            }

            fn flush(&mut self) -> io::Result<()> {
                Err(io::Error::other("write probe failed"))
            }
        }

        let error = run_with_io(
            io::Cursor::new(b"{\"version\":1,\"id\":1,\"operation\":\"hello\"}\n"),
            FailingWriter,
            &env::temp_dir(),
        )
        .expect_err("write failures should stop the protocol host");
        assert!(
            error.contains("Failed to serialize native data response")
                || error.contains("Failed to write native data response")
        );
    }

    #[test]
    fn stored_layout_corruption_is_reported_and_can_be_recovered() {
        let data_dir = env::temp_dir().join(format!(
            "lumeria-native-corrupt-layout-{}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        let layout_path = data_dir.join("layout.json");
        fs::write(&layout_path, "{not json").unwrap();
        let mut state = HostState::default();

        let loaded = handle_line(
            r#"{"version":1,"id":1,"operation":"loadLayout"}"#,
            &data_dir,
            &mut state,
        );
        assert!(!loaded.ok);
        assert!(loaded
            .error
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("Failed to parse layout")));
        assert_eq!(fs::read_to_string(&layout_path).unwrap(), "{not json");

        let recovered: Value = serde_json::from_str(include_str!(
            "../../../src/domain/fixtures/layout-v2-roundtrip.json"
        ))
        .unwrap();
        let saved = handle_line(
            &json!({"version":1,"id":2,"operation":"saveLayout","layout":recovered}).to_string(),
            &data_dir,
            &mut state,
        );
        assert!(saved.ok, "{:?}", saved.error);

        let loaded = handle_line(
            r#"{"version":1,"id":3,"operation":"loadLayout"}"#,
            &data_dir,
            &mut state,
        );
        assert!(loaded.ok);
        assert_eq!(loaded.value, Some(recovered));
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn launch_validation_precedes_corrupt_layout_io() {
        let data_dir = env::temp_dir().join(format!(
            "lumeria-native-launch-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(&data_dir).unwrap();
        fs::write(data_dir.join("layout.json"), "{not json").unwrap();

        let response = handle_line(
            r#"{"version":1,"id":1,"operation":"launchApp","appId":"  "}"#,
            &data_dir,
            &mut HostState::default(),
        );

        assert!(!response.ok);
        assert_eq!(
            response.error,
            Some(json!({
                "kind": "missingLaunchInfo",
                "detail": "App id is required"
            }))
        );
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn save_protocol_roundtrips_and_rejects_invalid_layout_without_overwrite() {
        let data_dir = env::temp_dir().join(format!("lumeria-native-save-{}", std::process::id()));
        let mut state = HostState::default();
        let layout: Value = serde_json::from_str(include_str!(
            "../../../src/domain/fixtures/layout-v2-roundtrip.json"
        ))
        .unwrap();
        let saved = handle_line(
            &json!({"version":1,"id":1,"operation":"saveLayout","layout":layout}).to_string(),
            &data_dir,
            &mut state,
        );
        assert!(saved.ok, "{:?}", saved.error);
        let loaded = handle_line(
            r#"{"version":1,"id":2,"operation":"loadLayout"}"#,
            &data_dir,
            &mut state,
        );
        assert_eq!(loaded.value, Some(layout.clone()));
        let rejected = handle_line(
            r#"{"version":1,"id":3,"operation":"saveLayout","layout":{}}"#,
            &data_dir,
            &mut state,
        );
        assert!(!rejected.ok);
        assert_eq!(
            load_layout_from_path(&data_dir.join("layout.json")).unwrap(),
            Some(layout)
        );
        fs::remove_file(data_dir.join("layout.json")).unwrap();
        fs::remove_dir(data_dir).unwrap();
    }

    #[test]
    fn protocol_reports_success_and_explicit_errors() {
        let data_dir =
            env::temp_dir().join(format!("lumeria-native-data-host-{}", std::process::id()));
        let mut state = HostState::default();
        let hello = handle_line(
            r#"{"version":1,"id":7,"operation":"hello"}"#,
            &data_dir,
            &mut state,
        );
        assert!(hello.ok);
        assert_eq!(hello.id, 7);
        assert_eq!(
            hello.value,
            Some(json!({ "protocolVersion": 1, "autostartAvailable": false }))
        );

        let unsupported = handle_line(
            r#"{"version":2,"id":8,"operation":"loadLayout"}"#,
            &data_dir,
            &mut state,
        );
        assert!(!unsupported.ok);
        assert!(unsupported
            .error
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("expected 1")));
    }

    #[test]
    fn launch_protocol_accepts_only_app_id_and_preserves_failure_kind_and_detail() {
        let rejected = handle_line(
            r#"{"version":1,"id":1,"operation":"autostart","enabled":true,"executable":"C:/other.exe"}"#,
            &env::temp_dir(),
            &mut HostState::default(),
        );
        assert!(
            !rejected.ok,
            "autostart protocol must not accept a caller-selected executable"
        );
        let data_dir =
            env::temp_dir().join(format!("lumeria-native-launch-host-{}", std::process::id()));
        let mut state = HostState::default();
        let missing_id = handle_line(
            r#"{"version":1,"id":9,"operation":"launchApp","appId":"  "}"#,
            &data_dir,
            &mut state,
        );

        assert!(!missing_id.ok);
        assert_eq!(
            missing_id.error,
            Some(json!({
                "kind": "missingLaunchInfo",
                "detail": "App id is required"
            }))
        );

        let injected_path = handle_line(
            r#"{"version":1,"id":10,"operation":"launchApp","appId":"app","path":"C:/Injected.exe"}"#,
            &data_dir,
            &mut state,
        );
        assert!(!injected_path.ok);
        assert!(injected_path
            .error
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("unknown field `path`")));
    }

    #[test]
    fn icon_protocol_rejects_invalid_data_and_caches_png_in_isolated_directory() {
        let data_dir =
            env::temp_dir().join(format!("lumeria-native-icon-host-{}", std::process::id()));
        let mut state = HostState::default();
        let invalid = handle_line(
            r#"{"version":1,"id":1,"operation":"cacheCustomIcon","dataUrl":"not-png"}"#,
            &data_dir,
            &mut state,
        );
        assert!(!invalid.ok);
        let request = json!({"version":1,"id":2,"operation":"cacheCustomIcon","dataUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII="});
        let response = handle_line(&request.to_string(), &data_dir, &mut state);
        assert!(response.ok, "{:?}", response.error);
        let value = response.value.unwrap();
        let path = PathBuf::from(value["iconPath"].as_str().unwrap());
        assert!(path.starts_with(data_dir.join("icons")));
        assert!(path.is_file());
        let repeat = handle_line(&request.to_string(), &data_dir, &mut state);
        assert_eq!(repeat.value, Some(value));
        fs::remove_dir_all(data_dir).unwrap();
    }
}
