use serde::{Deserialize, Serialize};

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<AppSource>,
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
    #[serde(rename = "type")]
    pub(crate) source_type: String,
    pub(crate) root_id: String,
    pub(crate) root_label: String,
    pub(crate) relative_path: String,
    pub(crate) absolute_path: String,
}
