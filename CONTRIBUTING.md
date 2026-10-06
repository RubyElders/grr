# Contributing

Use Rust 1.90+, Node 22.20+ within Node 22, and the checked-in lockfiles. Native development currently targets Fedora Linux 44; see the system dependencies in [README.md](README.md).

## Development

```sh
npm ci
npm run tauri -- dev
npm run check
```

The Preact frontend lives in `ui/`. The Rust app, Tauri configuration, capabilities and icons live in `src-tauri/`. Git parsing uses libgit2; review data and window chrome are separate from the UI.

`npm run build:app` uses the Tauri CLI to build the executable. `npm run install:local` also installs the Linux desktop integration. macOS 11+ uses an AppKit toolbar for native window chrome. Packaged releases are not available yet.

On macOS, Cargo uses a compatible system libgit2 when available and builds its bundled copy otherwise. For a direct production build on any platform, run `npm run build` at the project root, then `cargo build --release --locked` from `src-tauri`. The default `custom-protocol` feature embeds the frontend; rebuild it after frontend changes. `tauri dev` disables this feature to use the development server.

## Tests

```sh
cargo install cargo-llvm-cov --version 0.8.7 --locked
rustup component add llvm-tools-preview
cargo install tauri-driver --version 2.0.6 --locked
sudo dnf install xorg-x11-server-Xvfb dbus-daemon xdotool xprop which webkitgtk6.0

npm run check
npm run coverage:rust
npm run test:e2e:linux
npm run test:multi-instance:linux
```

Native tests use the release executable produced by `npm run build:app`. Commands ending in `:linux` and local installation are Linux-only.

Add regression tests for behavior changes and keep coverage thresholds unchanged. Native tests use temporary repositories. Also check GNOME/Wayland controls, focus, initial paint, and the Alt+Tab icon manually.

Keep changes focused and commit messages short. Preserve useful existing comments; do not add comments that narrate changes.

## Dependencies

```sh
cargo install cargo-deny --version 0.20.2 --locked
npm run audit:all
```

`npm run audit:all` also requires Gitleaks. System WebKitGTK and libgit2 receive updates through the operating system, not Cargo or npm audits.

GTK3 requires `glib 0.18.5`, affected by [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html). The affected `VariantStrIter` API has no callers in the resolved application graph outside glib itself; this is a reachability assessment, not a fix. GTK3 prevents a compatible upgrade to glib 0.20. This and the unmaintained `proc-macro-error` exception are individually recorded in [deny.toml](deny.toml).

The native test stack overrides WebdriverIO's transitive Mocha, diff parser, JavaScript serializer, Puppeteer browser installer and FTP client versions to avoid vulnerable dependencies. Keep these overrides covered by the native tests until upstream dependencies support the upgraded versions.

`npm run audit` rejects all npm advisories and incomplete audit reports. Revisit the Rust exceptions when dependencies change.

## GitHub Actions

CI has independent jobs for frontend checks, Rust tests and coverage, Windows and macOS Rust checks, native Linux tests, dependency audits, secret scanning and workflow validation. It runs on pushes, pull requests or manual dispatch with read-only permissions and no repository secrets. The Rust and native Linux jobs run directly on Ubuntu 26.04 and share the setup action in `.github/actions/setup-linux`. The macOS job uses an Apple Silicon runner on macOS 15 and checks formatting, Clippy, Rust tests and the release build.

Require `Frontend`, `Rust checks and coverage`, `Rust checks (Windows)`, `Rust checks (macOS)`, `Native tests (Linux)`, `Dependency audit`, `Secret scan` and `Workflow lint` checks for `main` after the first hosted run succeeds. CI does not publish releases. Native macOS window behavior still needs manual validation.
