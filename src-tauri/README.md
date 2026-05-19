# Native Backend Placeholder

This folder is reserved for the future Tauri/Rust backend.

Planned modules:

- `commands.rs`: Tauri command handlers matching `docs/frontend-backend-contract.md`
- `catalog/`: Windows Start Menu and app catalog scanning
- `layout_store.rs`: layout JSON persistence under the user app data directory
- `launcher.rs`: Windows shell launch integration
- `icons.rs`: icon extraction and cache management

Do not add frontend code here. Vue code should call native features through
`src/api/launchpadApi.js`.
