use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::UNIX_EPOCH,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileRevision {
    size: u64,
    modified: (u64, u32),
    created: Option<(u64, u32)>,
}

pub fn file_revision(path: &Path) -> std::io::Result<FileRevision> {
    let metadata = fs::metadata(path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(std::io::Error::other)?;
    Ok(FileRevision {
        size: metadata.len(),
        modified: (modified.as_secs(), modified.subsec_nanos()),
        created: metadata
            .created()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|time| (time.as_secs(), time.subsec_nanos())),
    })
}

/// Derived caches may be rebuilt; never expose a partial cache as a hit.
pub(crate) fn write_cache_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    static NEXT_WRITE: AtomicU64 = AtomicU64::new(0);
    let temporary = path.with_extension(format!(
        "{}-{}.tmp",
        std::process::id(),
        NEXT_WRITE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = file.write_all(bytes);
    drop(file);
    let result = result.and_then(|()| fs::rename(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
