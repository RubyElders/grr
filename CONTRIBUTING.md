# Contributing

Development and native validation currently target Fedora Linux 44. Install the system dependencies listed in the README, Rust 1.88 or later, and Node 22.12 or later within the Node 22 release line. Use the checked-in Cargo and npm lockfiles.

```sh
npm ci
make check
make coverage
make e2e
make e2e-multi-instance
```

`make check-ui` runs typechecking, frontend coverage, and the frontend build. `make check-rust` runs Rust formatting, strict Clippy, and tests; it requires the Linux system libraries and a built frontend. `make check-linux` builds the release executable and verifies system libgit2 linkage. `make check` combines these checks.

Rust coverage requires `cargo-llvm-cov` and the LLVM tools component:

```sh
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --locked
```

Native end-to-end tests require `tauri-driver`, `WebKitWebDriver`, and Xvfb. On Fedora:

```sh
sudo dnf install webkit2gtk4.1-devel xorg-x11-server-Xvfb dbus-daemon xdotool
cargo install tauri-driver --version 2.0.6 --locked
```

The native suite launches a release build against a temporary repository. It exercises commit selection, navigation, comments, search, layout, and terminal output. Driver warnings during intentional window closure do not replace the test result.

## Architecture

- `src/git_review.rs` builds a structured diff with libgit2; the UI never parses Git CLI output.
- `src/model.rs` and `ui/src/types.ts` define the review contract, checked against the shared fixture.
- `src/output.rs` validates comments and formats the terminal result.
- `src/main.rs` owns the CLI and Tauri commands.
- `src/window_chrome/` owns shared window state and actions, with the GTK implementation in `linux.rs`.
- `ui/src/windowChrome/` resolves the platform and owns the native bridge lifecycle.
- `ui/src/App.tsx` composes the review components; `state.ts` owns review transitions and `useReviewShortcuts.ts` routes keyboard actions.
- `ui/src/shortcuts.ts` is the shared shortcut definition and help-description source.

A future macOS adapter should implement the same window state and action contract. Keep review logic in the shared Rust and Preact layers. Add macOS build and native checks when that adapter is implemented on a Mac.

## Change and review guidance

Add regression coverage for behavioral changes. Keep the existing coverage thresholds; test failure and lifecycle paths when changing bridges or asynchronous work. Run the relevant checks before a local commit and the full matrix before a release.

Use short imperative commit subjects and plain keyboard punctuation. Optional bodies should be brief prose. Put rationale in commit prose rather than comments that narrate a change; preserve comments that explain a current invariant or non-obvious platform constraint.

For native UI changes, also check GNOME window controls, dragging, maximize/restore, the Alt+Tab icon, focus, initial paint, and two concurrent reviews from separate repositories. Automated Xvfb checks do not establish compositor-specific behavior.

## Dependency and publication checks

```sh
cargo install cargo-deny --version 0.20.2 --locked
cargo deny check advisories licenses sources
npm audit
gitleaks git --redact --log-opts=--all .
git diff --check
```

Install Gitleaks separately. `deny.toml` limits advisory exceptions to the reviewed dependencies documented in `SECURITY.md`. Revisit exceptions when upgrading Tauri or GTK. Inspect the full release diff and commit messages, and verify that archives exclude private scratch material and build output.
