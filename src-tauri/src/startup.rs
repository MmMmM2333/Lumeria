use std::ffi::OsStr;

use serde::Serialize;
use tauri::State;

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SecondInstanceAction {
    ActivateExisting,
    Ignore,
}

pub(crate) fn launch_context_from_args<I, S>(args: I) -> LaunchContext
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let is_login_startup = args
        .into_iter()
        .skip(1)
        .any(|arg| arg.as_ref() == OsStr::new(AUTOSTART_ARGUMENT));
    let origin = if is_login_startup {
        LaunchOrigin::LoginStartup
    } else {
        LaunchOrigin::Manual
    };
    LaunchContext { origin }
}

pub(crate) fn second_instance_action<I, S>(args: I) -> SecondInstanceAction
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if launch_context_from_args(args).origin == LaunchOrigin::LoginStartup {
        SecondInstanceAction::Ignore
    } else {
        SecondInstanceAction::ActivateExisting
    }
}

pub(crate) fn current_launch_context() -> LaunchContext {
    launch_context_from_args(std::env::args_os())
}

fn should_delegate_foreground_activation(context: LaunchContext) -> bool {
    context.origin == LaunchOrigin::Manual
}

pub(crate) fn prepare_single_instance_foreground_handoff(
    context: LaunchContext,
) -> Result<(), String> {
    if !should_delegate_foreground_activation(context) {
        return Ok(());
    }
    delegate_foreground_activation()
}

#[cfg(target_os = "windows")]
fn delegate_foreground_activation() -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};

    unsafe { AllowSetForegroundWindow(ASFW_ANY) }
        .map_err(|error| format!("Windows rejected foreground activation delegation: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn delegate_foreground_activation() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) fn get_launch_context(context: State<'_, LaunchContext>) -> LaunchContext {
    *context
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
    fn manual_second_instance_activates_the_existing_process() {
        assert_eq!(
            second_instance_action(["lumeria.exe"]),
            SecondInstanceAction::ActivateExisting
        );
        assert_eq!(
            second_instance_action(["lumeria.exe", "--opened-from-start-menu"]),
            SecondInstanceAction::ActivateExisting
        );
    }

    #[test]
    fn login_startup_second_instance_keeps_the_existing_process_hidden() {
        assert_eq!(
            second_instance_action(["lumeria.exe", AUTOSTART_ARGUMENT]),
            SecondInstanceAction::Ignore
        );
    }

    #[test]
    fn only_manual_launches_delegate_foreground_activation() {
        assert!(should_delegate_foreground_activation(LaunchContext {
            origin: LaunchOrigin::Manual,
        }));
        assert!(!should_delegate_foreground_activation(LaunchContext {
            origin: LaunchOrigin::LoginStartup,
        }));
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
