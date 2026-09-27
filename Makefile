UUID := island@caionazario.dev
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: test lint build dev clean

test:
	npx vitest run

lint:
	npx eslint .
	npx prettier --check .
	npx tsc --noEmit

build: clean
	npx tsc -p tsconfig.build.json
	mkdir -p dist/schemas
	glib-compile-schemas schemas --targetdir=dist/schemas
	cp metadata.json dist/
	cp -r icons dist/

dev: build
	dbus-run-session gnome-shell --devkit --wayland

clean:
	rm -rf dist
