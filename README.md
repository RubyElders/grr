# grr

`grr` is a small local GUI for reviewing the commits on the current branch. It shows a GitHub-style unified diff, lets you attach comments to individual lines, and prints a paste-ready review back to the terminal.

## Requirements

Fedora Linux 44 is the supported platform. macOS support is planned; its native wrapper has not been implemented or tested yet. Distribution is currently source-only, with local installation rather than packaged application bundles.

The application dynamically links the system WebKitGTK and libgit2 libraries:

```sh
sudo dnf install webkit2gtk4.1-devel libgit2-devel openssl-devel \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"
```

Building requires Rust 1.88 or later, Node.js 22.12 or later within the Node 22 release line, and npm. The installed executable does not require Node.js, npm, or the `git` command.

## Build and install

```sh
npm ci
make check
make install
```

The install target also registers the application ID and icon with Linux desktop environments so the `grr` logo is used in launchers and window switchers. The executable is installed in Cargo's bin directory; ensure that directory is on your `PATH`.

The repository forces `LIBGIT2_NO_VENDOR=1`: compilation fails unless a compatible system libgit2 1.9.x development package is available.

Uninstall the local executable and desktop integration with `make uninstall`. Clipboard copying requires `wl-copy` from `wl-clipboard` on a Wayland session.

## Use

Run in the repository you want to review:

```sh
grr
```

Or pass a repository or nested working-tree path:

```sh
grr ../another-project
```

By default, `grr` compares the merge base of `HEAD` with the detected base branch. Detection checks `grr.base` in Git config, the current branch's upstream remote's default branch and `main`/`master`, `origin/HEAD`, `origin/main`, `origin/master`, local `main`/`master`, and finally falls back to `HEAD^` (or an empty tree for a root commit). Override it for one run with:

```sh
grr --base release/next ../another-project
```

Set a repository-specific default with `git config grr.base release/next`.

Click the commit summary in the top bar to choose what is shown. `Show all` returns to the cumulative merge-base-to-`HEAD` branch diff. A row's `Show` button displays only that commit's parent-to-commit diff, while `Message` expands its full commit message. Check multiple commits and use `Show (N)` to display their individual diffs in chronological sections; repeated file paths are labelled with their source commit.

The strip below the top bar shows the focused commit's message on one line; click it to expand a longer message. The left and right buttons or keyboard arrow keys step through newer and older commits. From the grouped range, Right opens the latest individual commit; Left from that commit returns to the grouped range. These controls are disabled for multi-commit selections.

Use Up and Down to jump to the previous or next changed file. Space and Shift+Space continue to page the diff down or up.

Use the top-left sidebar button or `Ctrl+B` to hide or restore the file tree.

Press `?` or use the help button in the top bar to see every keyboard shortcut.

When the repository is dirty, the review opens on an `Uncommitted changes` virtual commit. It combines staged, unstaged, deleted, and untracked changes relative to `HEAD`; ignored files remain excluded. Select it alone to review only the working tree, or combine it with real commits. In this state, `Show all` compares the merge base to the final working tree so committed and uncommitted changes are reviewed together.

`Approve` prints a friendly approval. `Share comments` prints Markdown ordered by file and diff position. Closing the window with the title-bar control cancels the review and exits with status 2.

Use `Ctrl+W`, `Alt+F4`, or `Escape` to cancel and close the window. When a comment editor is open, the first `Escape` closes the editor instead; press it again to close the review.

Use `Ctrl+Enter` for the current primary action: it approves when there are no draft comments and shares comments when drafts exist. Inside an open comment editor, it saves that comment without submitting the review.

Use `Ctrl+Alt+Enter` to run the same primary action and copy the exact result to the system clipboard. The result is still printed to stdout.

Use `Ctrl+F` or `F3` to find text in changed code. Press `Enter`, `F3`, or `Ctrl+G` for the next match, and add `Shift` for the previous match. `Escape` closes find without closing the review.

## Tests

```sh
make check       # types, frontend coverage, Rust checks/tests, release build
make coverage    # Rust coverage gate (requires cargo-llvm-cov)
make e2e         # actual Tauri/WebKitGTK window under Xvfb
```

The end-to-end suite additionally requires `tauri-driver` and `WebKitWebDriver`:

```sh
cargo install tauri-driver --version 2.0.6 --locked
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture and validation details, and [SECURITY.md](SECURITY.md) for security reports and dependency limitations.

## License

MIT; see [LICENSE](LICENSE). Third-party dependencies retain their own licenses. The application icon is included under the same project license.
