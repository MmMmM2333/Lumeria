# Third-Party Notices

Copyright 2026 Ambryn for original Lumeria contributions, licensed under GPL-3.0-only.
Third-party code and artwork retain their original terms. Lumeria branding follows
[TRADEMARKS.md](TRADEMARKS.md).

## Included code and artwork

- Electrobun and the derived launcher/SDK changes: MIT; original notice retained
  in `vendor/electrobun-launcher/LICENSE` and `legal/THIRD_PARTY_LICENSES.txt` (electrobun-MIT section).
  Starter modifications and origin are described in its `NOTICE.md` and patches.
- Fluent UI System Icons: Copyright Microsoft Corporation, MIT. This includes the
  icon paths embedded in the Native UI; see `legal/THIRD_PARTY_LICENSES.txt` (fluent-icons-MIT section).
- Original assets follow [LICENSING.md](LICENSING.md) and the separate branding
  terms in [TRADEMARKS.md](TRADEMARKS.md).
  User application icons, backgrounds and system fonts remain their owners' content.

## Application binaries

Native releases include PixiJS and other bundled JS libraries, a Rust data service,
Electrobun, Bun/JavaScriptCore, canvas/Skia/ICU, Dawn and native helper libraries.
The staged application carries a component list and collected original texts in
`licenses/third-party/THIRD_PARTY_NOTICES.md` and `LICENSES.txt`, plus its Microsoft
runtime notice. Build and test dependencies are not automatically treated as
application contents. The Rust runtime graph is a conservative notice scope where
linker elimination is not known.

Some native components have additional source/notice requirements. Use their
actual upstream distribution materials, including Bun's JavaScriptCore/WebKit
terms; collecting a top-level MIT/BSD file does not replace those requirements.
Outstanding research is documented separately and does not block local packaging.
See the component records and distribution guidance in [legal/README.md](legal/README.md).

## Other distributions

The retained Web interface uses GSAP under its [standard license](https://gsap.com/community/standard-license/),
which has use restrictions and is not GPL-3.0-only. GSAP is not selected for Native
notices merely because its name appears in bundled package metadata.

The standalone SDK archive contains additional CEF/Chromium and SDK components;
its notices belong to that archive's release, not every Lumeria installer. Optional
full dependency audits are local maintainer artifacts; see [legal/README.md](legal/README.md).

The limited additional permission for combining original project code with GSAP
3.15.0 is in GSAP-COMBINATION-PERMISSION.md; GSAP retains its original terms.
