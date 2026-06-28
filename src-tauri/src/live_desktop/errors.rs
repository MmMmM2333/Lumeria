#[allow(unused_imports)]
use super::*;

#[derive(Debug, thiserror::Error)]
pub(crate) enum LiveDesktopError {
    #[error("D3D11 {context} failed: {source}")]
    D3d {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[allow(dead_code)]
    #[error("composition {context} failed: {source}")]
    Composition {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Message(String),
}

impl From<LiveDesktopError> for String {
    fn from(error: LiveDesktopError) -> Self {
        error.to_string()
    }
}
