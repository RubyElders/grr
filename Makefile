.PHONY: check coverage e2e build install

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
