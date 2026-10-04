#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
# shellcheck source=scripts/jscene3d/development-editor-identity.sh
source "$script_dir/development-editor-identity.sh"

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/jscene3d-editor-identity-test.XXXXXX")"
readonly fixture_root
trap 'rm -rf -- "$fixture_root"' EXIT

passed=0

make_bundle() {
	local directory="$1"
	local identifier="$2"
	local application_name="$3"
	local executable_name="${4:-Electron}"
	local executable="$directory/Contents/MacOS/$executable_name"
	local framework="$directory/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"

	mkdir -p "$(dirname "$executable")" "$(dirname "$framework")"
	printf '#!/usr/bin/env bash\nexit 0\n' >"$executable"
	chmod +x "$executable"
	printf 'native API marker: launchRenderer\n' >"$framework"
	cat >"$directory/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>$identifier</string>
	<key>CFBundleName</key>
	<string>$application_name</string>
	<key>CFBundleDisplayName</key>
	<string>$application_name</string>
	<key>CFBundleExecutable</key>
	<string>$executable_name</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
</dict>
</plist>
EOF
}

expect_accept() {
	local name="$1"
	local executable="$2"
	if ! jscene3d_validate_development_editor_executable "$executable"; then
		echo "FAIL: $name should have been accepted" >&2
		exit 1
	fi
	passed=$((passed + 1))
}

expect_reject() {
	local name="$1"
	local executable="$2"
	local expected_message="$3"
	local output
	if output="$(jscene3d_validate_development_editor_executable "$executable" 2>&1)"; then
		echo "FAIL: $name should have been rejected" >&2
		exit 1
	fi
	if [[ "$output" != *"$expected_message"* ]]; then
		echo "FAIL: $name returned an unexpected diagnostic: $output" >&2
		exit 1
	fi
	passed=$((passed + 1))
}

expect_canonical_reject() {
	local name="$1"
	local expected_executable="$2"
	local executable="$3"
	local expected_message="$4"
	local output
	if output="$(jscene3d_validate_canonical_development_editor_executable \
		"$expected_executable" "$executable" 2>&1)"; then
		echo "FAIL: $name should have been rejected" >&2
		exit 1
	fi
	if [[ "$output" != *"$expected_message"* ]]; then
		echo "FAIL: $name returned an unexpected diagnostic: $output" >&2
		exit 1
	fi
	passed=$((passed + 1))
}

accepted_bundle="$fixture_root/accepted/Electron.app"
make_bundle "$accepted_bundle" "$JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" "$JSCENE3D_DEVELOPMENT_APPLICATION_NAME"
expect_accept "current development identity" "$accepted_bundle/Contents/MacOS/Electron"

alternate_bundle="$fixture_root/alternate/Electron.app"
make_bundle "$alternate_bundle" "$JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" "$JSCENE3D_DEVELOPMENT_APPLICATION_NAME"

expect_canonical_reject "non-canonical executable path" \
	"$accepted_bundle/Contents/MacOS/Electron" \
	"$alternate_bundle/Contents/MacOS/Electron" \
	"wrong development Electron executable"

generic_bundle="$fixture_root/generic/Electron.app"
make_bundle "$generic_bundle" "com.github.Electron" "Electron"
expect_reject "generic Electron identity" "$generic_bundle/Contents/MacOS/Electron" "wrong development editor bundle identifier"

stock_bundle="$fixture_root/stock/JScene3D Editor.app"
make_bundle "$stock_bundle" "$JSCENE3D_STOCK_SOURCE_EDITOR_BUNDLE_IDENTIFIER" "JScene3D Editor" "JScene3D Editor"
expect_reject "stock Code OSS source Electron identity" \
	"$stock_bundle/Contents/MacOS/JScene3D Editor" \
	"refusing the stock Code OSS source editor bundle $JSCENE3D_STOCK_SOURCE_EDITOR_BUNDLE_IDENTIFIER"

retired_bundle="$fixture_root/retired/JScene3D Editor.app"
make_bundle "$retired_bundle" "$JSCENE3D_RETIRED_EDITOR_BUNDLE_IDENTIFIER" "JScene3D Editor" "JScene3D Editor"
expect_reject "retired standalone Java editor identity" "$retired_bundle/Contents/MacOS/JScene3D Editor" "refusing the retired standalone Java JScene3D Editor"

wrong_name_bundle="$fixture_root/wrong-name/Electron.app"
make_bundle "$wrong_name_bundle" "$JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" "Electron"
expect_reject "wrong application name" "$wrong_name_bundle/Contents/MacOS/Electron" "wrong development editor application identity"

missing_api_bundle="$fixture_root/missing-api/Electron.app"
make_bundle "$missing_api_bundle" "$JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" "$JSCENE3D_DEVELOPMENT_APPLICATION_NAME"
printf 'stock Electron framework\n' >"$missing_api_bundle/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
expect_reject "missing native renderer API" "$missing_api_bundle/Contents/MacOS/Electron" "does not contain the JScene3D native renderer API"

expect_reject "missing executable" "$fixture_root/missing/Electron.app/Contents/MacOS/Electron" "missing or not executable"

restart_command="$(jscene3d_development_editor_restart_command \
	"$accepted_bundle/Contents/MacOS/Electron" \
	"/repository/scripts/jscene3d/launch-source-editor.sh" \
	"$fixture_root/profile with spaces" \
	false \
	--use-mock-keychain)"
if [[ "$restart_command" != *"JSCENE3D_ELECTRON_EXECUTABLE="* \
	|| "$restart_command" != *"/repository/scripts/jscene3d/launch-source-editor.sh"* \
	|| "$restart_command" != *"--profile"* \
	|| "$restart_command" != *"profile\\ with\\ spaces"* \
	|| "$restart_command" != *"-- --use-mock-keychain"* ]]; then
	echo "FAIL: restart command did not preserve executable, launcher, profile, and forwarded arguments: $restart_command" >&2
	exit 1
fi
passed=$((passed + 1))

sandbox_project="/Users/glynch/development/projects/threejs-java/jscene3d-project-examples/src/main/editor-sandbox/jscene3d-editor-sandbox.j3d"
if [[ ! -f "$sandbox_project" || "$sandbox_project" != *.j3d ]]; then
	echo "FAIL: the current Editor Sandbox acceptance Project must be a .j3d file: $sandbox_project" >&2
	exit 1
fi
passed=$((passed + 1))

printf 'PASS: %d development editor identity checks\n' "$passed"
