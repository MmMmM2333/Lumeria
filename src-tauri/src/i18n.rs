use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(target_os = "windows")]
use windows::{
    core::PWSTR,
    Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME},
};

pub(crate) const DEFAULT_LOCALE: &str = "zh-CN";
pub(crate) const DEFAULT_LOCALE_PREFERENCE: &str = "system";
pub(crate) const SUPPORTED_LOCALES: [&str; 2] = ["zh-CN", "en-US"];

const ZH_CN_CATALOG_SOURCE: &str = include_str!("../../locales/zh-CN.json");
const EN_US_CATALOG_SOURCE: &str = include_str!("../../locales/en-US.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundledCatalog {
    locale: String,
    display_name: String,
    direction: String,
    messages: Value,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocaleIssue {
    pub(crate) code: String,
    pub(crate) value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocaleState {
    pub(crate) preference: String,
    pub(crate) resolved_locale: String,
    #[serde(rename = "match")]
    pub(crate) match_kind: String,
    pub(crate) issue: Option<LocaleIssue>,
}

impl Default for LocaleState {
    fn default() -> Self {
        resolve_locale_preference(DEFAULT_LOCALE_PREFERENCE, &[])
    }
}

fn normalize_preference(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case(DEFAULT_LOCALE_PREFERENCE) {
        return DEFAULT_LOCALE_PREFERENCE.to_string();
    }
    SUPPORTED_LOCALES
        .iter()
        .find(|locale| locale.eq_ignore_ascii_case(trimmed))
        .copied()
        .unwrap_or(trimmed)
        .to_string()
}

pub(crate) fn validate_locale_preference(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("Locale preference must be a non-empty string up to 64 bytes".to_string());
    }
    Ok(normalize_preference(trimmed))
}

fn match_system_language(value: &str) -> Option<(&'static str, &'static str)> {
    let normalized = value.trim().replace('_', "-");
    if normalized.is_empty() {
        return None;
    }
    if let Some(locale) = SUPPORTED_LOCALES
        .iter()
        .find(|locale| locale.eq_ignore_ascii_case(&normalized))
    {
        return Some((locale, "exact"));
    }

    let parts = normalized
        .split('-')
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>();
    match parts.first().map(String::as_str) {
        Some("en") => Some(("en-US", "language")),
        Some("zh")
            if parts.len() == 1
                || parts
                    .iter()
                    .any(|part| matches!(part.as_str(), "hans" | "cn" | "sg")) =>
        {
            Some(("zh-CN", "language"))
        }
        _ => None,
    }
}

pub(crate) fn resolve_locale_preference(
    preference: &str,
    system_languages: &[String],
) -> LocaleState {
    let normalized = normalize_preference(preference);
    if normalized != DEFAULT_LOCALE_PREFERENCE {
        if SUPPORTED_LOCALES.contains(&normalized.as_str()) {
            return LocaleState {
                preference: normalized.clone(),
                resolved_locale: normalized,
                match_kind: "explicit".to_string(),
                issue: None,
            };
        }
        return LocaleState {
            preference: normalized.clone(),
            resolved_locale: DEFAULT_LOCALE.to_string(),
            match_kind: "default".to_string(),
            issue: Some(LocaleIssue {
                code: "unsupportedPreference".to_string(),
                value: normalized,
            }),
        };
    }

    for language in system_languages {
        if let Some((locale, match_kind)) = match_system_language(language) {
            return LocaleState {
                preference: DEFAULT_LOCALE_PREFERENCE.to_string(),
                resolved_locale: locale.to_string(),
                match_kind: match_kind.to_string(),
                issue: None,
            };
        }
    }
    LocaleState {
        preference: DEFAULT_LOCALE_PREFERENCE.to_string(),
        resolved_locale: DEFAULT_LOCALE.to_string(),
        match_kind: "default".to_string(),
        issue: None,
    }
}

fn parse_ui_language_buffer(buffer: &[u16]) -> Vec<String> {
    buffer
        .split(|value| *value == 0)
        .filter(|segment| !segment.is_empty())
        .filter_map(|segment| String::from_utf16(segment).ok())
        .collect()
}

#[cfg(target_os = "windows")]
pub(crate) fn system_ui_languages() -> Result<Vec<String>, String> {
    let mut language_count = 0u32;
    let mut buffer_length = 0u32;
    unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut language_count,
            None,
            &mut buffer_length,
        )
    }
    .map_err(|error| format!("Failed to read Windows preferred UI languages: {error}"))?;
    if buffer_length == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u16; buffer_length as usize];
    unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut language_count,
            Some(PWSTR(buffer.as_mut_ptr())),
            &mut buffer_length,
        )
    }
    .map_err(|error| format!("Failed to read Windows preferred UI languages: {error}"))?;
    Ok(parse_ui_language_buffer(&buffer))
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn system_ui_languages() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

fn parse_catalog(source: &str) -> Result<BundledCatalog, String> {
    let catalog: BundledCatalog = serde_json::from_str(source)
        .map_err(|error| format!("Failed to parse bundled locale catalog: {error}"))?;
    if catalog.locale.trim().is_empty()
        || catalog.display_name.trim().is_empty()
        || !matches!(catalog.direction.as_str(), "ltr" | "rtl")
    {
        return Err("Bundled locale catalog metadata is invalid".to_string());
    }
    Ok(catalog)
}

fn catalog(locale: &str) -> Result<&'static BundledCatalog, String> {
    static ZH_CN: OnceLock<Result<BundledCatalog, String>> = OnceLock::new();
    static EN_US: OnceLock<Result<BundledCatalog, String>> = OnceLock::new();
    let result = match locale {
        "zh-CN" => ZH_CN.get_or_init(|| parse_catalog(ZH_CN_CATALOG_SOURCE)),
        "en-US" => EN_US.get_or_init(|| parse_catalog(EN_US_CATALOG_SOURCE)),
        _ => return Err(format!("Unsupported locale: {locale}")),
    };
    result.as_ref().map_err(Clone::clone)
}

fn message<'a>(catalog: &'a BundledCatalog, key: &str) -> Option<&'a str> {
    let mut current = &catalog.messages;
    for segment in key.split('.') {
        current = current.as_object()?.get(segment)?;
    }
    current.as_str()
}

pub(crate) fn translate(
    locale: &str,
    key: &str,
    values: &[(&str, &str)],
) -> Result<String, String> {
    let template = message(catalog(locale)?, key)
        .ok_or_else(|| format!("Missing i18n message: {locale}.{key}"))?;
    let mut translated = template.to_string();
    for (name, value) in values {
        translated = translated.replace(&format!("{{{name}}}"), value);
    }
    if translated.contains('{') || translated.contains('}') {
        return Err(format!("Missing interpolation value for {locale}.{key}"));
    }
    Ok(translated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_resolution_matches_the_frontend_contract() {
        assert_eq!(
            resolve_locale_preference("en-US", &["zh-CN".to_string()]),
            LocaleState {
                preference: "en-US".to_string(),
                resolved_locale: "en-US".to_string(),
                match_kind: "explicit".to_string(),
                issue: None,
            }
        );
        assert_eq!(
            resolve_locale_preference("system", &["fr-FR".to_string(), "en-GB".to_string()])
                .resolved_locale,
            "en-US"
        );
        let unsupported = resolve_locale_preference("fr-FR", &["en-US".to_string()]);
        assert_eq!(unsupported.resolved_locale, "zh-CN");
        assert_eq!(
            unsupported
                .issue
                .expect("unsupported preference issue")
                .code,
            "unsupportedPreference"
        );
    }

    #[test]
    fn native_translation_uses_the_shared_catalog_and_named_values() {
        assert_eq!(
            translate("en-US", "common.actions.cancel", &[]).expect("English message"),
            "Cancel"
        );
        assert_eq!(
            translate("zh-CN", "errors.launch.title", &[("appName", "计算器")])
                .expect("Chinese interpolated message"),
            "无法打开 计算器"
        );
        assert!(translate("en-US", "missing.key", &[]).is_err());
    }

    #[test]
    fn windows_ui_language_multistring_preserves_preference_order() {
        let buffer = "fr-FR\0en-GB\0\0".encode_utf16().collect::<Vec<_>>();
        assert_eq!(
            parse_ui_language_buffer(&buffer),
            vec!["fr-FR".to_string(), "en-GB".to_string()]
        );
    }

    #[test]
    fn locale_preference_boundary_rejects_empty_or_oversized_values() {
        assert!(validate_locale_preference("   ").is_err());
        assert!(validate_locale_preference(&"x".repeat(65)).is_err());
        assert_eq!(
            validate_locale_preference(" EN-us ").expect("supported preference"),
            "en-US"
        );
    }
}
