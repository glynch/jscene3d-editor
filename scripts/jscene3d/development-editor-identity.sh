#!/usr/bin/env bash

# Shared identity contract for the current Code OSS development editor.

readonly JSCENE3D_DEVELOPMENT_APPLICATION_NAME="JScene3D Editor Dev"
readonly JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER="com.jscene3d.editor.dev"
readonly JSCENE3D_STOCK_SOURCE_EDITOR_BUNDLE_IDENTIFIER="com.jscene3d.editor"
readonly JSCENE3D_RETIRED_EDITOR_BUNDLE_IDENTIFIER="io.github.glynch.jscene3d.editor"

jscene3d_macos_app_bundle_for_executable() {
	local executable="$1"
	local macos_directory
	local contents_directory
	local app_bundle

	macos_directory="$(dirname "$executable")"
	contents_directory="$(dirname "$macos_directory")"
	app_bundle="$(dirname "$contents_directory")"
	if [[ "$(basename "$macos_directory")" != "MacOS" || "$(basename "$contents_directory")" != "Contents" || "$app_bundle" != *.app ]]; then
		echo "expected a macOS application executable under <bundle>.app/Contents/MacOS: $executable" >&2
		return 1
	fi
	printf '%s\n' "$app_bundle"
}

jscene3d_macos_plist_value() {
	local plist="$1"
	local key="$2"
	/usr/libexec/PlistBuddy -c "Print :$key" "$plist" 2>/dev/null
}

jscene3d_development_editor_restart_command() {
	local executable="$1"
	local launcher="$2"
	local profile="$3"
	local use_authoring_environment="$4"
	shift 4
	local command
	local argument

	printf -v command 'JSCENE3D_ELECTRON_EXECUTABLE=%q %q' "$executable" "$launcher"
	if [[ "$use_authoring_environment" == true ]]; then
		command+=' --use-authoring-environment'
	fi
	printf -v command '%s --profile %q' "$command" "$profile"
	if (($# > 0)); then
		command+=' --'
		for argument in "$@"; do
			printf -v command '%s %q' "$command" "$argument"
		done
	fi
	printf '%s\n' "$command"
}

jscene3d_validate_canonical_development_editor_executable() {
	local expected_executable="$1"
	local executable="$2"

	if [[ "$executable" != "$expected_executable" ]]; then
		echo "wrong development Electron executable: expected $expected_executable, found $executable" >&2
		return 1
	fi
	jscene3d_validate_development_editor_executable "$executable"
}

jscene3d_validate_development_editor_executable() {
	local executable="$1"
	local app_bundle
	local plist
	local bundle_identifier
	local bundle_name
	local display_name
	local bundle_executable
	local package_type
	local framework_binary

	if [[ "$executable" != /* ]]; then
		echo "development Electron executable must be an absolute path: $executable" >&2
		return 1
	fi
	if [[ -L "$executable" ]]; then
		echo "development Electron executable must not be a symbolic link: $executable" >&2
		return 1
	fi
	if [[ ! -x "$executable" ]]; then
		echo "development Electron executable is missing or not executable: $executable" >&2
		return 1
	fi

	app_bundle="$(jscene3d_macos_app_bundle_for_executable "$executable")" || return 1
	plist="$app_bundle/Contents/Info.plist"
	if [[ ! -f "$plist" ]]; then
		echo "development Electron bundle has no Info.plist: $plist" >&2
		return 1
	fi

	bundle_identifier="$(jscene3d_macos_plist_value "$plist" CFBundleIdentifier || true)"
	if [[ "$bundle_identifier" == "$JSCENE3D_STOCK_SOURCE_EDITOR_BUNDLE_IDENTIFIER" ]]; then
		echo "refusing the stock Code OSS source editor bundle $bundle_identifier at $app_bundle; use $JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" >&2
		return 1
	fi
	if [[ "$bundle_identifier" == "$JSCENE3D_RETIRED_EDITOR_BUNDLE_IDENTIFIER" ]]; then
		echo "refusing the retired standalone Java JScene3D Editor bundle $bundle_identifier at $app_bundle" >&2
		return 1
	fi
	if [[ "$bundle_identifier" != "$JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER" ]]; then
		echo "wrong development editor bundle identifier at $app_bundle: expected $JSCENE3D_DEVELOPMENT_BUNDLE_IDENTIFIER, found ${bundle_identifier:-<missing>}" >&2
		return 1
	fi

	bundle_name="$(jscene3d_macos_plist_value "$plist" CFBundleName || true)"
	display_name="$(jscene3d_macos_plist_value "$plist" CFBundleDisplayName || true)"
	bundle_executable="$(jscene3d_macos_plist_value "$plist" CFBundleExecutable || true)"
	package_type="$(jscene3d_macos_plist_value "$plist" CFBundlePackageType || true)"
	if [[ "$bundle_name" != "$JSCENE3D_DEVELOPMENT_APPLICATION_NAME" || "$display_name" != "$JSCENE3D_DEVELOPMENT_APPLICATION_NAME" ]]; then
		echo "wrong development editor application identity at $app_bundle: expected $JSCENE3D_DEVELOPMENT_APPLICATION_NAME, found name=${bundle_name:-<missing>} display=${display_name:-<missing>}" >&2
		return 1
	fi
	if [[ "$bundle_executable" != "$(basename "$executable")" || "$package_type" != "APPL" ]]; then
		echo "invalid development Electron bundle metadata at $app_bundle: executable=${bundle_executable:-<missing>} packageType=${package_type:-<missing>}" >&2
		return 1
	fi

	framework_binary="$app_bundle/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
	if ! command -v strings >/dev/null 2>&1; then
		echo "strings is required to validate the JScene3D native renderer API" >&2
		return 1
	fi
	if [[ ! -f "$framework_binary" ]] || ! strings "$framework_binary" | grep -F 'launchRenderer' >/dev/null; then
		echo "development Electron bundle does not contain the JScene3D native renderer API: $app_bundle" >&2
		return 1
	fi
}
