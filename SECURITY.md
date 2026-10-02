# Security

Security fixes target the latest published version. Fedora Linux 44 is the supported platform; macOS is still planned.

Report suspected vulnerabilities privately to `josef.simanek@gmail.com`. Include the affected version, platform, reproduction conditions, and expected impact. Avoid posting sensitive repository contents in public issues.

## Local data and permissions

The application reads the repository passed to its CLI and displays its changes in a local WebKit view. It does not fetch repositories or upload review data. Git configuration can choose the comparison base. Repository content is rendered as text, without executing its HTML or scripts.

Review submission validates line anchors before formatting output. Clipboard copying starts `wl-copy` on Linux; the exact review is also printed to the invoking terminal. Closing without submission discards draft comments.

Tauri capabilities apply only to the main review window. The frontend needs event subscription and basic window operations; it has no shell, filesystem, or network plugin permissions. The application loads its bundled frontend under a content security policy.

## Known dependency limitations

The Linux GTK3/WebKit stack requires `glib 0.18.5`. [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) concerns unsound iteration through `glib::VariantStrIter`, fixed in `glib 0.20`. The current GTK3 bindings and Tauri runtime require the older API, so adding a second glib version does not fix that dependency.

The application does not use `VariantStrIter` or `Variant::array_iter_str`. A source search of the resolved Linux dependencies found no calls outside glib's own implementation and tests. This is a reachability assessment, not a claim that glib is fixed. The narrowly scoped advisory exception must be revisited whenever GTK or Tauri is upgraded.

The dependency graph also includes unmaintained `proc-macro-error` through GTK macros and unmaintained `unic-char-property`, `unic-char-range`, `unic-common`, `unic-ucd-ident`, and `unic-ucd-version` through Tauri's URL-pattern dependency. Their maintenance advisories are recorded individually in `deny.toml`; new advisories still fail the dependency check.

System WebKitGTK and libgit2 are dynamically linked and must receive updates from the operating system. Rust and npm dependency checks do not audit those installed system libraries.

The native test toolchain retains three development-only dependencies without compatible patched releases: `extract-zip 2.0.1` (GHSA-jmr9-qjv8-65gv and GHSA-7pqw-9j4j-h8q3), `basic-ftp 5.3.1` (GHSA-c475-qrg2-pj4r), and `serialize-javascript 6.0.2` (GHSA-5c6j-r48x-rmvq and GHSA-qj8w-gfj5-8c6v). The external Tauri driver configuration does not download Chrome/Firefox archives or process FTP listings, and Mocha parallel serialization is disabled. These dependencies are not included in the application frontend or executable. Do not use this test configuration to download or unpack untrusted browsers or serialize untrusted values.

`npm run audit` checks the live npm advisory report and permits only those exact advisory IDs, versions, and development-only lockfile entries. Other advisories and audit failures fail CI. Plain `npm audit` still reports the retained findings. Revisit these exceptions when the native test dependencies change.
