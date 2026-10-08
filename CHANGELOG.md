# Changelog

## Unreleased

## 0.5.0 - 2026-10-08

### Added

- Show the installed version and an About tab in help, with builder credits and a clearly marked updates placeholder.
- Open the Ruby Elders website from the About tab.
- Build and run on Windows with a native-style title bar that holds the review controls, like the GTK header bar.

### Changed

- Split Navigation shortcuts across two columns and separate alternative shortcuts with "or".
- Keep the help dialog size and edge spacing consistent when switching tabs.

### Fixed

- Copy non-ASCII review text to the Windows clipboard without corrupting it.

## 0.4.0 - 2026-10-03

### Added

- Finish a review and copy its exact terminal output with `Ctrl+Alt+Enter`.
- Add public contribution and security guidance, the MIT license, and continuous integration checks.

### Changed

- Use the `grr` logo for the application and shortcut help.
- Put review controls in a native GTK header bar.
- Separate platform window chrome from the shared review interface for a future macOS wrapper.
- Declare Rust and Node requirements and separate frontend, Rust, and Linux validation targets.
- Use the standard `src-tauri/` layout and Tauri development commands.
- Update development tools and check dependency advisories against documented, version-specific exceptions.
- Upgrade Tauri to 2.12 and require Rust 1.90. Upgrade native test dependencies, reject all npm advisories, and remove five Rust advisory exceptions.
- Render only nearby diff files while preserving the full scroll range.
- Avoid duplicate worktree diff copies and repeated commit metadata in large selections.
- Share immutable diff snapshots across Tauri commands and reuse unchanged syntax highlighting.
- Track the visible file with logarithmic layout reads and avoid rescanning comments while scrolling.
- Reflect the prepared clipboard shortcut in the review action button labels.

### Fixed

- Keep local installs on the tested Rust dependency lockfile.
- Associate Linux windows with the installed `grr` desktop icon.
- Show unchanged file renames as path movements instead of equal permission metadata.
- Open a dirty repository on its standalone virtual commit instead of the grouped comparison.
- Keep rapid commit-picker navigation to one step per key press.
- Prevent clipboard helper processes from freezing the review window.
- Keep simultaneous reviews in independent windows without redirecting the second launch into the first.
- Flush terminal output and avoid native exit-handler crashes when closing Linux reviews.

## 0.3.3 - 2026-09-05

### Added

- Show the shared keyboard shortcut reference with `?` or the top-bar help button.
- Navigate commits and files with Vim-style `h`, `j`, `k`, and `l` bindings.
- Open and browse the commit selector from the keyboard with `c`, directional keys, Enter, and Space.
- Cycle through `Show all`, commit rows, and `Show (N)` when browsing commits from the keyboard.

### Changed

- Navigate grouped or individual commits with Left and Right, and switch files with Up and Down.
- Present commits and virtual commits through the same title, reference, author, and message context.
- Keep commit references in the main context instead of repeating them in the message strip.
- Show source-commit labels on files only when a multi-commit selection needs them.
- Keep global navigation shortcuts active when a button or link has keyboard focus.

### Fixed

- Keep file selection from scrolling the whole application horizontally.
- Keep equal spacing around the diff pane, commit text, header controls, and review actions.
- Avoid offering a grouped commit view when a comparison contains fewer than two commits.
- Keep long commit messages from widening the application beyond its window.

## 0.3.2 - 2026-08-31

### Added

- Read full commit messages below the header and step through newer or older commits.

## 0.3.1 - 2026-08-22

### Added

- Find text in changed code with native keyboard shortcuts and match navigation.

## 0.3.0 - 2026-08-22

### Changed

- Keep the file tree and diff pane in the same directory-first order.

## 0.2.0 - 2026-08-16

### Added

- Review every commit between the detected base branch and `HEAD`.
- Select one or more commits and inspect full commit messages from the top bar.
- Review staged, unstaged, deleted, and untracked files through an `Uncommitted changes` virtual commit.
- Highlight source code and navigate the diff with keyboard shortcuts.

### Changed

- Remember vertical position for each commit selection and follow the visible file in the sidebar.
- Scroll long code across a complete file instead of scrolling individual lines.
- Show queued comment counts and make the primary review action available with `Ctrl+Enter` or `Cmd+Enter`.
- Reveal the native window only after the initial interface is rendered.

### Fixed

- Keep commit headers consistent for single and multiple selections.
- Serialize rapid commit selection changes.
- Restore responsive native title bar controls on Wayland.
