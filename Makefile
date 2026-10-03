.PHONY: check check-ui check-rust check-linux coverage e2e e2e-multi-instance build install install-desktop uninstall uninstall-desktop audit

check:
	npm ci
	$(MAKE) check-ui
	$(MAKE) check-rust
	$(MAKE) check-linux

check-ui:
	npm run test:audit
	npm run typecheck
	npm run test:coverage
	npm run build

check-rust:
	cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
	cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
	cargo test --manifest-path src-tauri/Cargo.toml --locked

check-linux: build
	ldd src-tauri/target/release/grr | grep 'libgit2.so.1.9'

coverage:
	cargo llvm-cov --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets --ignore-filename-regex 'src/main\.rs$$' --fail-under-lines 85

e2e: build
	mkdir -p e2e-results
	xvfb-run -a npm run test:e2e

e2e-multi-instance: build
	xvfb-run -a dbus-run-session -- node e2e/multi-instance.mjs

build:
	npm run build
	cargo build --manifest-path src-tauri/Cargo.toml --release --locked --features custom-protocol

install:
	npm run build
	cargo install --path src-tauri --locked --features custom-protocol
	$(MAKE) install-desktop

install-desktop:
	data_home="$${XDG_DATA_HOME:-$${HOME}/.local/share}"; \
	install -Dm644 packaging/com.rubyelders.grr.desktop "$$data_home/applications/com.rubyelders.grr.desktop"; \
	install -Dm644 src-tauri/icons/icon.png "$$data_home/icons/hicolor/512x512/apps/com.rubyelders.grr.png"; \
	if command -v update-desktop-database >/dev/null; then update-desktop-database "$$data_home/applications"; fi; \
	if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$$data_home/icons/hicolor"; fi

uninstall: uninstall-desktop
	cargo uninstall grr

uninstall-desktop:
	data_home="$${XDG_DATA_HOME:-$${HOME}/.local/share}"; \
	rm -f "$$data_home/applications/com.rubyelders.grr.desktop" "$$data_home/icons/hicolor/512x512/apps/com.rubyelders.grr.png"; \
	if command -v update-desktop-database >/dev/null; then update-desktop-database "$$data_home/applications"; fi; \
	if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$$data_home/icons/hicolor"; fi

audit:
	cargo deny --manifest-path src-tauri/Cargo.toml check advisories licenses sources
	npm run audit
	gitleaks git --redact --log-opts=--all .
