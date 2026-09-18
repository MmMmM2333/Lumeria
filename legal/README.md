# Third-party notices

Keep original notices for code and artwork copied into this repository. Dependency
lockfiles do not make every development tool part of the distributed application.
`THIRD_PARTY_LICENSES.txt` holds the retained original texts in one file.
`sources.json` indexes source URLs, hashes and byte ranges; overrides
supply exact-version texts missing from a package archive. `native-components.json`
records native runtime mappings and research follow-ups, not mandatory approvals.

`native:stage` creates just two files under `licenses/third-party/`:

- `THIRD_PARTY_NOTICES.md`: the components and source links for this Native build.
- `LICENSES.txt`: their collected original notices and Lumeria's GPLv3 license, deduplicated into one file.

The component notice also preserves the existing Lumeria brand policy.

JavaScript packages are selected from actual bundle module headers, plus copied
native modules and embedded Fluent icons. Rust notices use the Windows normal
runtime dependency graph rooted at the `lumeria-native-data` workspace package,
excluding build-only/dev edges and procedural macros. The retained Tauri host is
a separate workspace member and does not belong to that runtime graph.
This retains notices conservatively where linker elimination is unknown; it does
not claim each Rust crate is present in the executable. Native libraries are
selected by payload files. SDK-only components are reviewed with the SDK archive.

## Optional local audit

For a broader investigation, explicitly run:

```powershell
npm run licenses:generate -- artifacts/license-review-1
npm run licenses:check -- artifacts/license-review-1
```

Generation needs installed npm packages and locked Cargo sources. It includes
build/development dependencies and writes a local report, not application payload.
`licenses:check` verifies that local report's collected files and lists outstanding
questions. Follow-up items are advisory and do not cause a packaging failure.
Malformed input, missing files and corrupted evidence still report real errors.

Normal installer packaging does not call the audit checker and has no license
review approval switch. Existing payload integrity and production-build checks
remain in place. Successful packaging is not legal clearance: resolve actual
redistribution obligations for the components being shipped, particularly native
runtime source/notice requirements. A missing development-tool license is not by
itself an application release blocker. See the short project notice at the root.

When updating an upstream text, rebuild its byte-range index and verify every
section hash. The combined file preserves original bytes (Git does not normalize
its line endings). Installed dependencies with their own LICENSE are read directly;
only additional/otherwise missing upstream texts are retained here.
