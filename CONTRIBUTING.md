# Contributing

Use Rust 1.88+, Node 22.20+ within Node 22, and the checked-in lockfiles. Native development currently targets Fedora Linux 44; see the system dependencies in [README.md](README.md).

## Development

```sh
npm ci
npm run tauri -- dev
make check
```

The Preact frontend lives in `ui/`. The Rust app, Tauri configuration, capabilities and icons live in `src-tauri/`. Git parsing uses libgit2; review data and window chrome are separate from the UI.

`npm run tauri -- build --no-bundle` builds the executable. `make install` also installs the Linux desktop integration. Packaged bundles and macOS support are not available yet.

## Tests

```sh
cargo install cargo-llvm-cov --version 0.8.7 --locked
rustup component add llvm-tools-preview
cargo install tauri-driver --version 2.0.6 --locked
sudo dnf install xorg-x11-server-Xvfb dbus-daemon xdotool

make check
make coverage
make e2e
make e2e-multi-instance
```

Add regression tests for behavior changes and keep coverage thresholds unchanged. Native tests use temporary repositories. Also check GNOME/Wayland controls, focus, initial paint, and the Alt+Tab icon manually.

Keep changes focused and commit messages short. Preserve useful existing comments; do not add comments that narrate changes.

## Dependencies

```sh
cargo install cargo-deny --version 0.20.2 --locked
make audit
```

`make audit` also requires Gitleaks. System WebKitGTK and libgit2 receive updates through the operating system, not Cargo or npm audits.

GTK3 requires `glib 0.18.5`, affected by [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html). The affected `VariantStrIter` API has no callers in the resolved application graph outside glib itself; this is a reachability assessment, not a fix. GTK3 prevents a compatible upgrade to glib 0.20. This and six unmaintained-package exceptions are individually recorded in [deny.toml](deny.toml).

The native test stack retains development-only `extract-zip 2.0.1`, `basic-ftp 5.3.1` and `serialize-javascript 6.0.2` advisories. The configured external Tauri driver does not download browser archives or process FTP listings; Mocha parallel serialization and watch mode are disabled. Do not use this configuration for untrusted browser downloads, serialization or watch patterns. These packages are not shipped in the app.

The new [braces 3.0.3 advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects Mocha's unused watcher and has no published patch. It currently fails the npm audit gate; no exception has been accepted.

`npm run audit` permits only the exact advisory IDs, versions and development-only entries listed in [scripts/npm-audit.mjs](scripts/npm-audit.mjs). Plain `npm audit` still reports them. New findings and audit failures fail CI. Revisit all exceptions when dependencies change.

## GitHub Actions

CI runs frontend checks, Rust coverage, release and native tests, dependency audits, workflow validation and secret scanning. It runs on pushes, pull requests or manual dispatch with read-only permissions and no repository secrets.

Require `frontend`, `linux` and `secrets` checks for `main` after the first hosted run succeeds. CI does not publish releases or establish macOS support.
