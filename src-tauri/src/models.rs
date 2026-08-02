use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CatalogIdentityStatus {
    Exact,
    Unresolved,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AppSourceType {
    WindowsAppCatalog,
    StartMenuUser,
    StartMenuSystem,
    CustomDirectory,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AppSourceState {
    Primary,
    Equivalent,
    Shadowed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppCatalogItem {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) item_type: String,
    pub(crate) name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) icon_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) emoji: Option<String>,
    pub(crate) launch_target: LaunchTarget,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) launch_args: Option<String>,
    pub(crate) tracking_key: String,
    pub(crate) identity_status: CatalogIdentityStatus,
    pub(crate) sources: Vec<AppSource>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchTarget {
    pub(crate) kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) app_user_model_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSource {
    pub(crate) key: String,
    #[serde(rename = "type")]
    pub(crate) source_type: AppSourceType,
    pub(crate) state: AppSourceState,
    pub(crate) root_id: String,
    pub(crate) root_label: String,
    pub(crate) relative_path: String,
    pub(crate) absolute_path: String,
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
