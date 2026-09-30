.PHONY: check coverage e2e build install install-desktop

check:
	npm ci
	npm run typecheck
	npm run test:coverage
	npm run build
	cargo fmt --all --check
	cargo clippy --all-targets -- -D warnings
	cargo test
	cargo build --release
	ldd target/release/grr | grep 'libgit2.so.1.9'

coverage:
	cargo llvm-cov --workspace --all-targets --ignore-filename-regex 'src/main\.rs$$' --fail-under-lines 85

e2e: build
	mkdir -p e2e-results
	xvfb-run -a npm run test:e2e

build:
	npm run build
	cargo build --release

install:
	npm run build
	cargo install --path .
	$(MAKE) install-desktop

install-desktop:
	data_home="$${XDG_DATA_HOME:-$${HOME}/.local/share}"; \
	install -Dm644 packaging/com.rubyelders.grr.desktop "$$data_home/applications/com.rubyelders.grr.desktop"; \
	install -Dm644 icons/icon.png "$$data_home/icons/hicolor/512x512/apps/com.rubyelders.grr.png"
