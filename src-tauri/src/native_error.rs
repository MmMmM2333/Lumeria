#[derive(Debug, thiserror::Error)]
pub(crate) enum NativeError {
    #[error("tauri {context} failed: {source}")]
    Tauri {
        context: &'static str,
        #[source]
        source: tauri::Error,
    },
    #[cfg(target_os = "windows")]
    #[error("COM {context} failed: {source}")]
    Com {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[cfg(target_os = "windows")]
    #[error("DWM {context} failed: {source}")]
    Dwm {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[cfg(target_os = "windows")]
    #[error("shell {context} failed: {source}")]
    Shell {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[cfg(target_os = "windows")]
    #[error("Win32 {context} failed: {source}")]
    Win32 {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[cfg(target_os = "windows")]
    #[error("Windows string {context} failed: {source}")]
    Utf16 {
        context: &'static str,
        #[source]
        source: std::string::FromUtf16Error,
    },
}

impl NativeError {
    #[cfg(target_os = "windows")]
    pub(crate) fn windows_code(&self) -> Option<windows::core::HRESULT> {
        match self {
            Self::Com { source, .. }
            | Self::Dwm { source, .. }
            | Self::Shell { source, .. }
            | Self::Win32 { source, .. } => Some(source.code()),
            Self::Tauri { .. } | Self::Utf16 { .. } => None,
        }
    }
}

impl From<NativeError> for String {
    fn from(error: NativeError) -> Self {
        error.to_string()
    }
}
