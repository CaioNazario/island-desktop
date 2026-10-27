UUID := island@caionazario.dev
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: test lint build pack dev smoke clean

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

# O zip que vai anexado à release; instala com `gnome-extensions install`.
pack: build
	rm -f $(UUID).shell-extension.zip
	cd dist && zip -qr ../$(UUID).shell-extension.zip .

dev: build
	dbus-run-session gnome-shell --devkit --wayland

smoke: build
	scripts/smoke.sh

clean:
	rm -rf dist $(UUID).shell-extension.zip
