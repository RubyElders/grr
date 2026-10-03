# grr

A small local Git review app. Browse a unified diff, add line comments, and send the review back to your terminal.

Currently tested on Fedora Linux 44. macOS support is planned.

## Install

Requires Rust 1.90+, Node.js 22.20+ (Node 22), npm, and system libgit2 1.9.x.

```sh
sudo dnf install webkit2gtk4.1-devel libgit2-devel openssl-devel \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"

npm ci
npm run install:local
```

Make sure Cargo's bin directory is on your `PATH`. Installation includes the Linux desktop icon. Clipboard copying requires `wl-copy` from `wl-clipboard`.

## Use

```sh
grr
grr ../another-project
grr --base main
```

The app detects the base branch automatically. Uncommitted changes open as a separate virtual commit; use the commit picker to review individual commits or the whole branch.

Add comments with the line's `+` button. `Ctrl+Enter` approves or shares comments; `Ctrl+Alt+Enter` also copies the result. Press `?` for all shortcuts. Closing the window cancels the review.

Reviews stay local and results are printed to stdout. Use `npm run uninstall:local` to remove the app.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and tests.

## License

[MIT](LICENSE), including the app icon. Third-party dependencies retain their own licenses.
