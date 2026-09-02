use std::{
    env, fs,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    catalog::{scan_apps_from_roots, ScanFilters, ScanRoot},
    layout_store::load_layout_from_path,
};

const PROTOCOL_VERSION: u32 = 1;
const APP_IDENTIFIER: &str = "com.lumeria.app";

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
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
}

impl Request {
    fn id(&self) -> u64 {
        match self {
            Self::Hello { id, .. } | Self::LoadLayout { id, .. } | Self::ScanApps { id, .. } => *id,
        }
    }

    fn version(&self) -> u32 {
        match self {
            Self::Hello { version, .. }
            | Self::LoadLayout { version, .. }
            | Self::ScanApps { version, .. } => *version,
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
    error: Option<String>,
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
            error: Some(error.into()),
        }
    }
}

pub fn run() -> Result<(), String> {
    let data_dir = resolve_data_dir()?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    run_with_io(stdin.lock(), stdout.lock(), &data_dir)
}

fn resolve_data_dir() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("LUMERIA_NATIVE_DATA_DIR") {
        let path = PathBuf::from(configured);
        if !path.is_absolute() {
            return Err("LUMERIA_NATIVE_DATA_DIR must be an absolute path".to_string());
        }
        return Ok(path);
    }
    let roaming = env::var_os("APPDATA").map(PathBuf::from).ok_or_else(|| {
        "APPDATA is unavailable; cannot resolve Lumeria data directory".to_string()
    })?;
    Ok(roaming.join(APP_IDENTIFIER))
}

fn run_with_io(input: impl BufRead, mut output: impl Write, data_dir: &Path) -> Result<(), String> {
    for line in input.lines() {
        let line = line.map_err(|error| format!("Failed to read native data request: {error}"))?;
        let response = handle_line(&line, data_dir);
        serde_json::to_writer(&mut output, &response)
            .map_err(|error| format!("Failed to serialize native data response: {error}"))?;
        output
            .write_all(b"\n")
            .and_then(|_| output.flush())
            .map_err(|error| format!("Failed to write native data response: {error}"))?;
    }
    Ok(())
}

fn handle_line(line: &str, data_dir: &Path) -> Response {
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
        Request::Hello { .. } => Ok(json!({ "protocolVersion": PROTOCOL_VERSION })),
        Request::LoadLayout { .. } => load_layout_from_path(&data_dir.join("layout.json"))
            .and_then(|layout| serde_json::to_value(layout).map_err(|error| error.to_string())),
        Request::ScanApps { roots, filters, .. } => {
            let icon_dir = data_dir.join("icons");
            fs::create_dir_all(&icon_dir)
                .map_err(|error| {
                    format!(
                        "Failed to create icon cache directory {}: {error}",
                        icon_dir.display()
                    )
                })
                .and_then(|_| {
                    scan_apps_from_roots(&roots, &icon_dir, &filters).and_then(|result| {
                        serde_json::to_value(result).map_err(|error| error.to_string())
                    })
                })
        }
    };
    match result {
        Ok(value) => Response::success(id, value),
        Err(error) => Response::failure(id, error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_reports_success_and_explicit_errors() {
        let data_dir =
            env::temp_dir().join(format!("lumeria-native-data-host-{}", std::process::id()));
        let hello = handle_line(r#"{"version":1,"id":7,"operation":"hello"}"#, &data_dir);
        assert!(hello.ok);
        assert_eq!(hello.id, 7);
        assert_eq!(hello.value, Some(json!({ "protocolVersion": 1 })));

        let unsupported = handle_line(
            r#"{"version":2,"id":8,"operation":"loadLayout"}"#,
            &data_dir,
        );
        assert!(!unsupported.ok);
        assert!(unsupported
            .error
            .as_deref()
            .is_some_and(|error| error.contains("expected 1")));
    }
}
