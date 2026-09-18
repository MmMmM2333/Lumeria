use lumeria_core::native_error::NativeError as CoreNativeError;

#[derive(Debug, thiserror::Error)]
pub(crate) enum NativeError {
    #[error("tauri {context} failed: {source}")]
    Tauri {
        context: &'static str,
        #[source]
        source: tauri::Error,
    },
    #[error(transparent)]
    Core(#[from] CoreNativeError),
}

impl NativeError {
    #[cfg(target_os = "windows")]
    pub(crate) fn dwm(context: &'static str, source: windows::core::Error) -> Self {
        CoreNativeError::Dwm { context, source }.into()
    }

    #[cfg(target_os = "windows")]
    pub(crate) fn win32(context: &'static str, source: windows::core::Error) -> Self {
        CoreNativeError::Win32 { context, source }.into()
    }
}

impl From<NativeError> for String {
    fn from(error: NativeError) -> Self {
        error.to_string()
    }
}
