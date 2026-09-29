#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
repository_root="$(cd "$script_dir/../.." && pwd)"
readonly repository_root
runtime_version_file="$script_dir/authoring-runtime.version"
readonly runtime_version_file
runtime_group_path="io/github/glynch"
readonly runtime_group_path
runtime_artifact="jscene3d-editor-authoring-runtime"
readonly runtime_artifact

fresh_profile=false
created_fresh_profile=false
check_only=false
profile=""
launch_arguments=()

usage() {
	cat <<'EOF'
Usage:
  ./scripts/jscene3d/launch-source-editor.sh --fresh-profile [-- <editor arguments>]
  ./scripts/jscene3d/launch-source-editor.sh --profile <directory> [-- <editor arguments>]
  ./scripts/jscene3d/launch-source-editor.sh --check --fresh-profile
  ./scripts/jscene3d/launch-source-editor.sh --check --profile <directory>

Options:
  --fresh-profile       Create a new isolated profile under the system temporary directory.
  --profile <directory> Create or reuse a specific isolated profile, including for hot-exit tests.
  --check               Validate and print the launch configuration without opening the editor.
  -h, --help            Show this help.

Environment overrides:
  JSCENE3D_MAVEN_LOCAL_REPOSITORY
  JSCENE3D_AUTHORING_SERVICE_MODULE_PATH
  JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH
  JSCENE3D_JAVA_EXECUTABLE

By default, the launcher resolves the versioned JScene3D authoring runtime from
the default local repository at $HOME/.m2/repository. This script does not
compile sources, invoke Maven, or run tests. It launches only the source-built
product through scripts/code.sh.
EOF
}

fail() {
	echo "JScene3D source launch failed: $*" >&2
	exit 1
}

while (($# > 0)); do
	case "$1" in
		--fresh-profile)
			fresh_profile=true
			shift
			;;
		--profile)
			(($# >= 2)) || fail "--profile requires a directory."
			profile="$2"
			shift 2
			;;
		--check)
			check_only=true
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		--)
			shift
			launch_arguments=("$@")
			break
			;;
		*)
			fail "unknown option: $1"
			;;
	esac
done

if [[ "$fresh_profile" == true && -n "$profile" ]]; then
	fail "use either --fresh-profile or --profile, not both."
fi

if [[ "$fresh_profile" == false && -z "$profile" ]]; then
	fail "choose --fresh-profile or provide --profile <directory>."
fi

if [[ "$fresh_profile" == true ]]; then
	profile_parent="${TMPDIR:-/tmp}"
	if [[ "$OSTYPE" == darwin* ]]; then
		profile_parent="/private/tmp"
	fi
	profile="$(mktemp -d "$profile_parent/jscene3d-source-profile.XXXXXX")"
	created_fresh_profile=true
fi

mkdir -p "$profile/user-data" "$profile/extensions"
profile="$(cd "$profile" && pwd -P)"

[[ -f "$runtime_version_file" ]] || fail "authoring runtime version file not found: $runtime_version_file"
runtime_version="$(tr -d '\r\n' <"$runtime_version_file")"
readonly runtime_version
[[ "$runtime_version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] \
	|| fail "invalid authoring runtime version in $runtime_version_file"

module_path_source="JSCENE3D_AUTHORING_SERVICE_MODULE_PATH"
module_path="${JSCENE3D_AUTHORING_SERVICE_MODULE_PATH:-}"
metadata_path_source="JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH"
extension_metadata_path="${JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH:-}"
runtime_archive=""

if [[ -z "$module_path" || -z "$extension_metadata_path" ]]; then
	maven_repository="${JSCENE3D_MAVEN_LOCAL_REPOSITORY:-}"
	if [[ -z "$maven_repository" ]]; then
		[[ -n "${HOME:-}" ]] \
			|| fail "HOME is not set; set JSCENE3D_MAVEN_LOCAL_REPOSITORY to the local repository containing the installed authoring runtime."
		maven_repository="$HOME/.m2/repository"
	fi
	[[ -d "$maven_repository" ]] \
		|| fail "Maven local repository does not exist: $maven_repository"
	maven_repository="$(cd "$maven_repository" && pwd -P)"
	runtime_archive="$maven_repository/$runtime_group_path/$runtime_artifact/$runtime_version/$runtime_artifact-$runtime_version-runtime.zip"
	if [[ ! -f "$runtime_archive" ]]; then
		fail "installed authoring runtime $runtime_artifact:$runtime_version is missing at $runtime_archive. From the JScene3D Java repository, run: ./mvnw install -pl $runtime_artifact -am"
	fi
	command -v unzip >/dev/null 2>&1 || fail "unzip is required to read the installed authoring runtime."
	command -v shasum >/dev/null 2>&1 || fail "shasum is required to identify the installed authoring runtime."

	runtime_digest="$(shasum -a 256 "$runtime_archive" | awk '{print $1}')"
	readonly runtime_digest
	runtime_parent="$profile/jscene3d-authoring-runtime"
	runtime_directory="$runtime_parent/$runtime_version-$runtime_digest"
	mkdir -p "$runtime_parent"
	if [[ ! -f "$runtime_directory/.complete" ]]; then
		runtime_staging="$(mktemp -d "$runtime_parent/.extract.XXXXXX")"
		if ! unzip -q "$runtime_archive" -d "$runtime_staging"; then
			rm -rf -- "$runtime_staging"
			fail "could not extract installed authoring runtime: $runtime_archive"
		fi
		[[ -d "$runtime_staging/lib" ]] || fail "installed authoring runtime has no lib directory: $runtime_archive"
		[[ -d "$runtime_staging/metadata" ]] || fail "installed authoring runtime has no metadata directory: $runtime_archive"
		touch "$runtime_staging/.complete"
		if [[ -d "$runtime_directory" ]]; then
			rm -rf -- "$runtime_staging"
		else
			mv "$runtime_staging" "$runtime_directory"
		fi
	fi

	shopt -s nullglob
	runtime_module_jars=("$runtime_directory/lib/"*.jar)
	runtime_metadata_jars=("$runtime_directory/metadata/"*.jar)
	shopt -u nullglob
	((${#runtime_module_jars[@]} > 0)) \
		|| fail "installed authoring runtime contains no module-path JARs: $runtime_archive"
	((${#runtime_metadata_jars[@]} > 0)) \
		|| fail "installed authoring runtime contains no extension metadata JARs: $runtime_archive"

	if [[ -z "$module_path" ]]; then
		module_path="$(IFS=:; echo "${runtime_module_jars[*]}")"
		module_path_source="$runtime_archive"
	fi
	if [[ -z "$extension_metadata_path" ]]; then
		extension_metadata_path="$runtime_directory/metadata"
		metadata_path_source="$runtime_archive"
	fi
fi

[[ -n "$module_path" ]] || fail "the authoring-service module path is empty."
IFS=':' read -r -a module_path_entries <<<"$module_path"
for module_path_entry in "${module_path_entries[@]}"; do
	[[ -e "$module_path_entry" ]] || fail "module-path entry does not exist: $module_path_entry"
done

IFS=':' read -r -a metadata_path_entries <<<"$extension_metadata_path"
for metadata_path_entry in "${metadata_path_entries[@]}"; do
	[[ -f "$metadata_path_entry" || -d "$metadata_path_entry" ]] \
		|| fail "extension-metadata artifact does not exist: $metadata_path_entry"
done

readonly extension_entrypoint="$repository_root/extensions/jscene3d/out/extension.js"
[[ -f "$extension_entrypoint" ]] || fail "compiled JScene3D extension not found: $extension_entrypoint"

if [[ "$OSTYPE" == darwin* ]]; then
	readonly source_application="$repository_root/.build/electron/JScene3D Editor.app"
	readonly source_binary="$source_application/Contents/MacOS/JScene3D Editor"
	[[ -x "$source_binary" ]] || fail "source-built JScene3D Editor not found: $source_binary"

	bundle_identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_application/Contents/Info.plist")"
	readonly bundle_identifier
	[[ "$bundle_identifier" == "com.jscene3d.editor" ]] || fail "unexpected built application bundle identifier: $bundle_identifier"
fi

echo "JScene3D source launch configuration"
echo "  Source repository: $repository_root"
echo "  Runtime version:   $runtime_version"
if [[ -n "$runtime_archive" ]]; then
	echo "  Runtime archive:   $runtime_archive"
fi
echo "  Module path source: $module_path_source"
echo "  Metadata source:    $metadata_path_source"
echo "  Isolated profile:   $profile"
echo "  Restart command:    ./scripts/jscene3d/launch-source-editor.sh --profile '$profile'"

if [[ "$check_only" == true ]]; then
	echo "Configuration is valid; the editor was not launched."
	if [[ "$created_fresh_profile" == true ]]; then
		rm -rf -- "$profile"
	fi
	exit 0
fi

exec env -u ELECTRON_RUN_AS_NODE \
	JSCENE3D_AUTHORING_SERVICE_MODULE_PATH="$module_path" \
	JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH="$extension_metadata_path" \
	VSCODE_SKIP_PRELAUNCH=1 \
	"$repository_root/scripts/code.sh" \
	--user-data-dir "$profile/user-data" \
	--extensions-dir "$profile/extensions" \
	"${launch_arguments[@]}"
