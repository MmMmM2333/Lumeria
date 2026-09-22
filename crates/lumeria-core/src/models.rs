use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogIdentityStatus {
    Exact,
    Unresolved,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppSourceType {
    WindowsAppCatalog,
    StartMenuUser,
    StartMenuSystem,
    CustomDirectory,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppSourceState {
    Primary,
    Equivalent,
    Shadowed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCatalogItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    pub launch_target: LaunchTarget,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_args: Option<String>,
    pub tracking_key: String,
    pub identity_status: CatalogIdentityStatus,
    pub sources: Vec<AppSource>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTarget {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_user_model_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSource {
    pub key: String,
    #[serde(rename = "type")]
    pub source_type: AppSourceType,
    pub state: AppSourceState,
    pub root_id: String,
    pub root_label: String,
    pub relative_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_display_name: Option<String>,
    pub absolute_path: String,
}

#[cfg(test)]
mod tests {
    use super::{AppSourceState, AppSourceType, CatalogIdentityStatus};
    use serde_json::json;

    #[test]
    fn catalog_enums_keep_the_existing_ipc_strings() {
        assert_eq!(
            [
                CatalogIdentityStatus::Exact,
                CatalogIdentityStatus::Unresolved,
            ]
            .map(|value| serde_json::to_value(value).expect("serialize identity status")),
            [json!("exact"), json!("unresolved")]
        );
        assert_eq!(
            [
                AppSourceType::WindowsAppCatalog,
                AppSourceType::StartMenuUser,
                AppSourceType::StartMenuSystem,
                AppSourceType::CustomDirectory,
            ]
            .map(|value| serde_json::to_value(value).expect("serialize source type")),
            [
                json!("windowsAppCatalog"),
                json!("startMenuUser"),
                json!("startMenuSystem"),
                json!("customDirectory"),
            ]
        );
        assert_eq!(
            [
                AppSourceState::Primary,
                AppSourceState::Equivalent,
                AppSourceState::Shadowed,
            ]
            .map(|value| serde_json::to_value(value).expect("serialize source state")),
            [json!("primary"), json!("equivalent"), json!("shadowed")]
        );
    }

    #[test]
    fn catalog_enums_reject_unknown_contract_values() {
        assert!(serde_json::from_value::<CatalogIdentityStatus>(json!("approximate")).is_err());
        assert!(serde_json::from_value::<AppSourceType>(json!("unknownRoot")).is_err());
        assert!(serde_json::from_value::<AppSourceState>(json!("secondary")).is_err());
    }
}
