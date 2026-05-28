use std::path::Path;

pub(crate) fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
}

pub(crate) fn windows_api_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

#[cfg(test)]
mod tests {
    use super::windows_api_path;
    use std::path::Path;

    #[test]
    fn windows_api_path_normalizes_mixed_separators() {
        let path = Path::new(r"C:\Users\233\AppData\Roaming/Microsoft/Windows/Start Menu");
        assert_eq!(
            windows_api_path(path),
            r"C:\Users\233\AppData\Roaming\Microsoft\Windows\Start Menu"
        );
    }
}
