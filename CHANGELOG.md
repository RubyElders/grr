# Changelog

## 0.3.3 - 2026-09-05

### Added

- Finish a review and copy its exact terminal output with `Ctrl+Alt+Enter`.
- Read full commit messages below the header and step through newer or older commits.
- Show the shared keyboard shortcut reference with `?` or the top-bar help button.
- Navigate commits and files with Vim-style `h`, `j`, `k`, and `l` bindings.
- Open and browse the commit selector from the keyboard with `c`, directional keys, Enter, and Space.
- Cycle through `Show all`, commit rows, and `Show (N)` when browsing commits from the keyboard.

### Changed

- Render only nearby diff files while preserving the full scroll range.
- Avoid duplicate worktree diff copies and repeated commit metadata in large selections.
- Share immutable diff snapshots across Tauri commands and reuse unchanged syntax highlighting.
- Track the visible file with logarithmic layout reads and avoid rescanning comments while scrolling.
- Reflect the prepared clipboard shortcut in the review action button labels.
- Open dirty repositories on their uncommitted changes, navigate grouped or individual commits with Left and Right, and switch files with Up and Down.
- Present commits and virtual commits through the same title, reference, author, and message context.
- Keep commit references in the main context instead of repeating them in the message strip.
- Show source-commit labels on files only when a multi-commit selection needs them.
- Keep global navigation shortcuts active when a button or link has keyboard focus.

### Fixed

- Keep rapid commit-picker navigation to one step per key press.
- Prevent clipboard helper processes from freezing the review window.
- Keep file selection from scrolling the whole application horizontally.
- Keep equal spacing around the diff pane, commit text, header controls, and review actions.
- Avoid offering a grouped commit view when a comparison contains fewer than two commits.
- Keep long commit messages from widening the application beyond its window.

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
