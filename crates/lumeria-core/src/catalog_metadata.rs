use crate::file_cache::{file_revision, write_cache_atomic, FileRevision};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
struct Entry {
    revision: FileRevision,
    desktop_ini: Option<FileRevision>,
    value: Value,
}
#[derive(Default, Serialize, Deserialize)]
struct Document {
    version: u32,
    entries: HashMap<String, Entry>,
}
struct Session {
    path: PathBuf,
    document: Document,
    used: HashSet<String>,
    dirty: bool,
    hits: usize,
    reads: usize,
}
thread_local! { static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) }; }

/// One scan owns its thread's cache. Other host operations never observe it.
pub(crate) struct MetadataScan;
impl MetadataScan {
    pub(crate) fn begin(icon_dir: &Path) -> Self {
        let path = icon_dir
            .parent()
            .unwrap_or(icon_dir)
            .join("catalog-metadata.json");
        // Corruption/version changes rebuild this derived cache. Bound parsing IO.
        let document = fs::metadata(&path)
            .ok()
            .filter(|m| m.len() <= 32 * 1024 * 1024)
            .and_then(|_| fs::read(&path).ok())
            .and_then(|bytes| serde_json::from_slice::<Document>(&bytes).ok())
            .filter(|doc| doc.version == 1)
            .unwrap_or_else(|| Document {
                version: 1,
                ..Default::default()
            });
        SESSION.with(|slot| {
            assert!(slot.borrow().is_none(), "nested catalog scan");
            *slot.borrow_mut() = Some(Session {
                path,
                document,
                used: HashSet::new(),
                dirty: false,
                hits: 0,
                reads: 0,
            });
        });
        Self
    }
    pub(crate) fn finish(self, complete: bool) -> (usize, usize) {
        let mut session = SESSION
            .with(|slot| slot.borrow_mut().take())
            .expect("scan session");
        if complete {
            let count = session.document.entries.len();
            session
                .document
                .entries
                .retain(|key, _| session.used.contains(key));
            session.dirty |= count != session.document.entries.len();
        }
        if session.dirty {
            let result = serde_json::to_vec(&session.document)
                .map_err(std::io::Error::other)
                .and_then(|bytes| write_cache_atomic(&session.path, &bytes));
            if let Err(error) = result {
                log::warn!("Catalog metadata cache unavailable: {error}");
            }
        }
        (session.hits, session.reads)
    }
}
impl Drop for MetadataScan {
    fn drop(&mut self) {
        SESSION.with(|slot| {
            slot.borrow_mut().take();
        });
    }
}

pub(crate) fn cached<T: Serialize + DeserializeOwned, E>(
    kind: &str,
    path: &Path,
    load: impl FnOnce() -> Result<T, E>,
) -> Result<T, E> {
    let active = SESSION.with(|slot| slot.borrow().is_some());
    if !active {
        return load();
    }
    let key = format!("{kind}:{}", path.to_string_lossy().to_lowercase());
    let revision = file_revision(path).ok();
    let desktop_ini = if kind == "name" {
        file_revision(&if path.is_dir() {
            path.join("desktop.ini")
        } else {
            path.parent().unwrap_or(path).join("desktop.ini")
        })
        .ok()
    } else {
        None
    };
    if let Some(value) = SESSION.with(|slot| {
        let mut borrow = slot.borrow_mut();
        let session = borrow.as_mut().unwrap();
        session.used.insert(key.clone());
        session
            .document
            .entries
            .get(&key)
            .filter(|entry| {
                Some(&entry.revision) == revision.as_ref() && entry.desktop_ini == desktop_ini
            })
            .and_then(|entry| serde_json::from_value::<T>(entry.value.clone()).ok())
            .inspect(|_| session.hits += 1)
    }) {
        return Ok(value);
    }
    SESSION.with(|slot| slot.borrow_mut().as_mut().unwrap().reads += 1);
    let value = load()?; // Failures are retried rather than persisted as negative hits.
    if let (Some(revision), Ok(serialized)) = (revision, serde_json::to_value(&value)) {
        SESSION.with(|slot| {
            let mut borrow = slot.borrow_mut();
            let session = borrow.as_mut().unwrap();
            session.document.entries.insert(
                key,
                Entry {
                    revision,
                    desktop_ini,
                    value: serialized,
                },
            );
            session.dirty = true;
        });
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persisted_entries_follow_changes_deletions_and_corruption() {
        let dir = std::env::temp_dir().join(format!(
            "lumeria-metadata-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let icons = dir.join("icons");
        fs::create_dir_all(&icons).unwrap();
        let first = dir.join("first.url");
        let second = dir.join("second.url");
        fs::write(&first, "one").unwrap();
        fs::write(&second, "two").unwrap();
        let scan = MetadataScan::begin(&icons);
        assert_eq!(
            cached("fixture", &first, || Ok::<_, ()>("one".to_string())).unwrap(),
            "one"
        );
        cached("fixture", &second, || Ok::<_, ()>("two".to_string())).unwrap();
        assert_eq!(scan.finish(true), (0, 2));
        let scan = MetadataScan::begin(&icons);
        assert_eq!(
            cached("fixture", &first, || Err::<String, _>(())).unwrap(),
            "one"
        );
        assert_eq!(scan.finish(false), (1, 0));
        // An incomplete scan must retain metadata for unvisited sources.
        let scan = MetadataScan::begin(&icons);
        cached("fixture", &second, || Err::<String, _>(())).unwrap();
        scan.finish(false);
        fs::write(&first, "changed length").unwrap();
        fs::remove_file(&second).unwrap();
        let scan = MetadataScan::begin(&icons);
        assert_eq!(
            cached("fixture", &first, || Ok::<_, ()>("changed".to_string())).unwrap(),
            "changed"
        );
        scan.finish(true);
        let document: Document =
            serde_json::from_slice(&fs::read(dir.join("catalog-metadata.json")).unwrap()).unwrap();
        assert_eq!(document.entries.len(), 1);
        fs::write(dir.join("catalog-metadata.json"), "corrupt").unwrap();
        let scan = MetadataScan::begin(&icons);
        cached("fixture", &first, || Ok::<_, ()>("rebuilt".to_string())).unwrap();
        assert_eq!(scan.finish(true), (0, 1));
        fs::remove_dir_all(dir).unwrap();
    }
}
