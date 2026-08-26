# Third-Party Notices

Copyright 2026 Ambryn

Unless otherwise noted, Lumeria's original source code is licensed under the
GNU General Public License, version 3 only. Third-party software and assets are not relicensed
under the Lumeria license; they remain subject to their respective terms.

This file is the human-maintained notice for dependencies with material
redistribution, attribution, or source-availability considerations. Before an
official binary release, the release process must also generate and bundle a
complete license inventory from the exact versions in `package-lock.json` and
`src-tauri/Cargo.lock`, including all applicable license and upstream NOTICE
texts.

## GSAP

- Component: GSAP
- Version: 3.15.0
- Copyright holder: Webflow / GreenSock
- License: Standard "No Charge" GSAP License
- Project: <https://github.com/greensock/GSAP>
- License terms: <https://gsap.com/community/standard-license/>

GSAP is not licensed under GPL-3.0-only and is not an OSI-approved open-source
dependency. Its license contains use restrictions and does not expressly grant
the same modification, redistribution, and sublicensing rights as
GPL-3.0-only. Before distributing an official Lumeria desktop binary containing
GSAP, obtain written confirmation covering desktop bundling, minification,
redistribution, public source repositories, and downstream forks, or replace
GSAP with a dependency whose license expressly permits those activities.

## Mozilla Public License 2.0 Components

The Windows dependency graph currently contains the following MPL-2.0
components:

| Component | Version | Corresponding source |
| --- | --- | --- |
| cssparser | 0.36.0 | <https://crates.io/crates/cssparser/0.36.0> |
| cssparser-macros | 0.6.1 | <https://crates.io/crates/cssparser-macros/0.6.1> |
| dtoa-short | 0.3.5 | <https://crates.io/crates/dtoa-short/0.3.5> |
| option-ext | 0.2.0 | <https://crates.io/crates/option-ext/0.2.0> |
| selectors | 0.36.1 | <https://crates.io/crates/selectors/0.36.1> |

License text: <https://www.mozilla.org/MPL/2.0/>

These components and modifications to their MPL-covered files remain under
MPL-2.0. A distributed executable must inform recipients how to obtain the
corresponding source for the exact covered versions in a timely and reasonable
manner.

## Fluent UI System Icons

Lumeria uses Fluent UI System Icons through `@iconify-json/fluent` 1.2.51.

- Copyright: Microsoft Corporation
- License: MIT
- Project: <https://github.com/microsoft/fluentui-system-icons>
- License text: <https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE>

The icons remain subject to their upstream license and are not relicensed
under GPL-3.0-only.

## Major Open-Source Runtime Components

The application also uses open-source components including Vue, Vue I18n,
PixiJS, pinyin-pro, TanStack Virtual, Fluent UI Web Components, Tauri, Tauri
plugins, and their transitive dependencies. These components remain under the
MIT, Apache-2.0, dual MIT/Apache-2.0, BSD, ISC, MPL-2.0, or other license terms
declared by their respective distributions.

The exact lockfiles, rather than this summary, determine the component versions
included in a particular build. This summary must not be used as a substitute
for the complete license bundle shipped with an official release.

## Assets and User-Provided Content

The Lumeria name, logo, application icon, and distinctive branding assets are
not third-party software and are not licensed under GPL-3.0-only; see
`TRADEMARKS.md` for their separate terms.

Application icons extracted from software installed on a user's device,
user-selected backgrounds, and other user-provided content are not part of the
Lumeria source distribution. Rights in that content remain with their
respective owners.

The limited additional permission for combining original project code with GSAP
3.15.0 is in GSAP-COMBINATION-PERMISSION.md; GSAP retains its original terms.
