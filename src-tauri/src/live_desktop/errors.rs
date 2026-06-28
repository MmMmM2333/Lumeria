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
    #[error("D3D11 {context} failed: {source}")]
    D3dContext {
        context: String,
        #[source]
        source: windows::core::Error,
    },
    #[error("composition {context} failed: {source}")]
    Composition {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[error("composition {context} failed: {source}")]
    CompositionContext {
        context: String,
        #[source]
        source: windows::core::Error,
    },
    #[error("composition {context} failed: {source}; fallback failed: {fallback}")]
    CompositionFallback {
        context: String,
        #[source]
        source: windows::core::Error,
        fallback: windows::core::Error,
    },
    #[error("capture {context} failed: {source}")]
    Capture {
        context: &'static str,
        #[source]
        source: windows::core::Error,
    },
    #[error("capture {context} failed: {source}")]
    CaptureContext {
        context: String,
        #[source]
        source: windows::core::Error,
    },
    #[error("shader {context} compile failed: {source}; {message}")]
    ShaderCompile {
        context: String,
        #[source]
        source: windows::core::Error,
        message: String,
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
