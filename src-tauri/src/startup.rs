use serde::Serialize;

pub(crate) const AUTOSTART_ARGUMENT: &str = "--lumeria-autostart";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LaunchOrigin {
    Manual,
    LoginStartup,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchContext {
    pub(crate) origin: LaunchOrigin,
}

pub(crate) fn launch_context_from_args<I, S>(args: I) -> LaunchContext
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let origin = args
        .into_iter()
        .skip(1)
        .any(|arg| arg.as_ref() == AUTOSTART_ARGUMENT)
        .then_some(LaunchOrigin::LoginStartup)
        .unwrap_or(LaunchOrigin::Manual);
    LaunchContext { origin }
}

#[tauri::command]
pub(crate) fn get_launch_context() -> LaunchContext {
    launch_context_from_args(std::env::args())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_startup_is_detected_only_from_the_exact_argument() {
        assert_eq!(
            launch_context_from_args(["lumeria.exe", AUTOSTART_ARGUMENT]),
            LaunchContext {
                origin: LaunchOrigin::LoginStartup,
            }
        );
        assert_eq!(
            launch_context_from_args(["lumeria.exe", "--lumeria-autostart-extra"]),
            LaunchContext {
                origin: LaunchOrigin::Manual,
            }
        );
    }

    #[test]
    fn duplicate_autostart_arguments_remain_login_startup() {
        assert_eq!(
            launch_context_from_args(["lumeria.exe", AUTOSTART_ARGUMENT, AUTOSTART_ARGUMENT]),
            LaunchContext {
                origin: LaunchOrigin::LoginStartup,
            }
        );
    }

    #[test]
    fn launch_context_serializes_as_the_frontend_contract() {
        let context = launch_context_from_args(["lumeria.exe", AUTOSTART_ARGUMENT]);
        assert_eq!(
            serde_json::to_value(context).expect("launch context should serialize"),
            serde_json::json!({ "origin": "loginStartup" })
        );
    }
}
