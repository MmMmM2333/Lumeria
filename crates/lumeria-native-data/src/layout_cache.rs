use lumeria_core::{
    file_cache::{file_revision, FileRevision},
    layout_store::{load_layout_from_path, save_layout_to_path},
};
use serde_json::Value;
use std::{collections::HashMap, path::Path};

#[derive(Default)]
pub(crate) struct LayoutCache {
    revision: Option<FileRevision>,
    value: Option<Option<Value>>,
    pub(crate) items: HashMap<String, Value>,
    pub(crate) reads: usize,
    pub(crate) hits: usize,
}

fn revision(path: &Path) -> Result<Option<FileRevision>, String> {
    match file_revision(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Failed to inspect layout {}: {error}",
            path.display()
        )),
    }
}

impl LayoutCache {
    fn adopt(&mut self, value: Option<Value>, revision: Option<FileRevision>) {
        fn collect(pages: &Value, index: &mut HashMap<String, Value>) {
            if let Some(pages) = pages.as_array() {
                for page in pages {
                    if let Some(items) = page.as_array() {
                        for item in items {
                            if item["type"] == "folder" {
                                collect(&item["childPages"], index);
                            } else if let Some(id) = item["id"].as_str() {
                                index.insert(id.to_owned(), item.clone());
                            }
                        }
                    }
                }
            }
        }
        self.items.clear();
        if let Some(layout) = &value {
            collect(&layout["pages"], &mut self.items);
        }
        self.value = Some(value);
        self.revision = revision;
    }
    pub(crate) fn load(&mut self, path: &Path) -> Result<Option<Value>, String> {
        for _ in 0..3 {
            let before = revision(path)?;
            if self.value.is_some() && before == self.revision {
                self.hits += 1;
                return Ok(self.value.as_ref().unwrap().clone());
            }
            let value = load_layout_from_path(path)?;
            self.reads += 1;
            let after = revision(path)?;
            if before == after {
                self.adopt(value.clone(), after);
                return Ok(value);
            }
        }
        Err("Layout changed repeatedly while reading; retry after the writer finishes".into())
    }
    pub(crate) fn save(&mut self, path: &Path, layout: &Value) -> Result<(), String> {
        if self.value.as_ref().and_then(Option::as_ref) == Some(layout)
            && revision(path)? == self.revision
        {
            return Ok(());
        }
        save_layout_to_path(path, layout)?;
        // A concurrent external replacement must be read/validated instead of
        // assigning its revision to the snapshot we just wrote.
        self.value = None;
        self.load(path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_changes_failures_and_equal_saves_preserve_the_success_boundary() {
        let dir = std::env::temp_dir().join(format!(
            "lumeria-layout-cache-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("layout.json");
        let mut layout: Value = serde_json::from_str(include_str!(
            "../../../src/domain/fixtures/layout-v2-roundtrip.json"
        ))
        .unwrap();
        let mut cache = LayoutCache::default();
        cache.save(&path, &layout).unwrap();
        let stamp = file_revision(&path).unwrap();
        cache.save(&path, &layout).unwrap();
        assert_eq!(file_revision(&path).unwrap(), stamp);
        let reads = cache.reads;
        cache.load(&path).unwrap();
        assert_eq!(cache.reads, reads);
        assert!(cache.items.contains_key("tool-shortcut"));
        std::fs::write(&path, "{corrupt").unwrap();
        assert!(cache.load(&path).is_err());
        assert!(cache.save(&path, &serde_json::json!({})).is_err());
        layout["settings"]["gridRows"] = serde_json::json!(5);
        save_layout_to_path(&path, &layout).unwrap();
        assert_eq!(cache.load(&path).unwrap(), Some(layout));
        std::fs::remove_file(&path).unwrap();
        assert_eq!(cache.load(&path).unwrap(), None);
        assert!(cache.items.is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
