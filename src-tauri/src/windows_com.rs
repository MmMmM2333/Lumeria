#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

#[cfg(target_os = "windows")]
use crate::native_error::NativeError;

#[cfg(target_os = "windows")]
pub(crate) struct ComGuard {
    initialized: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    pub(crate) fn new() -> Result<Self, NativeError> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
            .ok()
            .map_err(|source| NativeError::Com {
                context: "CoInitializeEx(COINIT_APARTMENTTHREADED)",
                source,
            })?;
        Ok(Self { initialized: true })
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}
