# Changelog

## 0.3.0 - 2026-08-22

### Added

- Find text in changed code with native keyboard shortcuts and match navigation.

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
