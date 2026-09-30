use std::path::Path;

use serde::Serialize;

use crate::{
    catalog::{icon_file_data_url, stable_app_id},
    encoding::{cache_content_addressed, decode_base64, PNG_SIGNATURE},
    icons::cache_app_icon_choices,
};

const CUSTOM_ICON_DATA_URL_PREFIX: &str = "data:image/png;base64,";
const MAX_CUSTOM_ICON_DATA_URL_LENGTH: usize = 1_400_000;
const MAX_CUSTOM_ICON_BYTES: usize = 1_048_576;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIconChoice {
    pub id: String,
    pub icon_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedCustomIconResult {
    pub icon_path: String,
    pub icon_data_url: String,
}

pub fn load_app_icon_choices_from_dir(
    target_path: &str,
    icon_dir: &Path,
) -> Result<Vec<AppIconChoice>, String> {
    let path = Path::new(target_path.trim());
    if path.as_os_str().is_empty() || !path.exists() {
        return Ok(Vec::new());
    }

    let app_id = stable_app_id(target_path);
    let choices = cache_app_icon_choices(path, icon_dir, &app_id)?
        .into_iter()
        .map(|path| {
            AppIconChoice {
                id: path.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
                icon_path: path.to_string_lossy().to_string(),
            }
        })
        .collect();
    Ok(choices)
}

pub fn cache_custom_icon_to_dir(
    data_url: &str,
    icon_dir: &Path,
) -> Result<CachedCustomIconResult, String> {
    let bytes = decode_custom_icon_data_url(data_url)?;
    #[cfg(target_os = "windows")]
    crate::icons::validate_icon_png(&bytes)?;
    let icon_path =
        cache_content_addressed(icon_dir, "icon-content", "png", &bytes).map_err(|error| {
            format!(
                "Failed to write custom icon {}: {error}",
                error.path().display(),
                error = error.source()
            )
        })?;
    let icon_path = icon_path.to_string_lossy().to_string();
    let icon_data_url = icon_file_data_url(&icon_path)
        .ok_or_else(|| "Failed to read cached custom icon".to_string())?;
    Ok(CachedCustomIconResult {
        icon_path,
        icon_data_url,
    })
}

pub fn decode_custom_icon_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let trimmed = data_url.trim();
    if trimmed.len() > MAX_CUSTOM_ICON_DATA_URL_LENGTH {
        return Err("Custom icon data URL is too large".to_string());
    }
    let encoded = trimmed
        .strip_prefix(CUSTOM_ICON_DATA_URL_PREFIX)
        .ok_or_else(|| "Custom icons must be PNG data URLs".to_string())?;
    let bytes = decode_base64(encoded)?;
    if bytes.len() > MAX_CUSTOM_ICON_BYTES {
        return Err("Custom icon image is too large".to_string());
    }
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Custom icon data is not a PNG image".to_string());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_custom_icon_accepts_png_data_urls() {
        let bytes = decode_custom_icon_data_url("data:image/png;base64,iVBORw0KGgo=")
            .expect("png data url should decode");

        assert!(bytes.starts_with(PNG_SIGNATURE));
    }

    #[test]
    fn decode_custom_icon_rejects_non_png_data_urls() {
        let error = decode_custom_icon_data_url("data:image/jpeg;base64,abcd")
            .expect_err("non-png data urls should fail");

        assert!(error.contains("PNG"));
    }
}
