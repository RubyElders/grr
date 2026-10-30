# grr

A small local Git review app. Browse diffs and commit history, add line comments, and send the review back to your terminal.

Tested on Fedora Linux 44, Windows 10, and macOS.

## Install

Download the [latest release](https://github.com/RubyElders/grr/releases/latest) for your platform:

### Linux (x86_64)

```sh
mkdir -p ~/.local/bin
curl -fL https://github.com/RubyElders/grr/releases/latest/download/grr-linux-x86_64 -o ~/.local/bin/grr
chmod +x ~/.local/bin/grr
```

Requires WebKitGTK 4.1 and libgit2 1.9.x. See [Linux dependencies](CONTRIBUTING.md#installation-requirements).

### macOS (Apple Silicon)

```sh
mkdir -p ~/.local/bin
curl -fL https://github.com/RubyElders/grr/releases/latest/download/grr-macos-arm64 -o ~/.local/bin/grr
chmod +x ~/.local/bin/grr
```

Releases are unsigned. If blocked, allow the app in System Settings > Privacy & Security.

For Linux and macOS, make sure `~/.local/bin` is on your `PATH`.

### Windows (x86_64)

```powershell
Invoke-WebRequest https://github.com/RubyElders/grr/releases/latest/download/grr-windows-x86_64.exe -OutFile "$env:LOCALAPPDATA\Microsoft\WindowsApps\grr.exe"
```

## Use

```sh
grr
grr main
grr log
grr -C ../another-project
```

Press `?` for shortcuts. Run `grr help` for options. Reviews stay local and results are printed to stdout.

See [CONTRIBUTING.md](CONTRIBUTING.md) to build from source or contribute.

[MIT](LICENSE), including the app icon. Third-party dependencies retain their own licenses.
