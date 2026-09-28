mod autostart;
mod host;
mod native_paths;
#[cfg(windows)]
mod pipe;

pub use host::run;
#[cfg(windows)]
pub use pipe::run as run_pipe;
