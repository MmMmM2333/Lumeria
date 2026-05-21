use std::process::Command;
#[cfg(target_os = "windows")]
pub(crate) fn launch_path(path: &str, launch_args: Option<&str>) -> Result<(), String> {
    let mut command = Command::new("cmd");
    command.args(["/C", "start", "", path]);
    for arg in split_launch_args(launch_args.unwrap_or("")) {
        command.arg(arg);
    }
    command
        .spawn()
        .map_err(|error| format!("Failed to launch {path}: {error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn split_launch_args(value: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for character in value.chars() {
        if character == '"' {
            in_quotes = !in_quotes;
            continue;
        }
        if character.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                args.push(current);
                current = String::new();
            }
            continue;
        }
        current.push(character);
    }

    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn launch_path(_path: &str, _launch_args: Option<&str>) -> Result<(), String> {
    Err("Launching apps is only implemented on Windows".to_string())
}
