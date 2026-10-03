#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
repository_root="$(cd "$script_dir/../.." && pwd)"
readonly repository_root
authoring_runtime_version_file="$script_dir/authoring-runtime.version"
readonly authoring_runtime_version_file
renderer_runtime_version_file="$script_dir/renderer-runtime.version"
readonly renderer_runtime_version_file
runtime_group_path="io/github/glynch"
readonly runtime_group_path
runtime_artifact="jscene3d-editor-authoring-runtime"
readonly runtime_artifact
renderer_runtime_artifact="jscene3d-editor-renderer-runtime"
readonly renderer_runtime_artifact

fresh_profile=false
created_fresh_profile=false
check_only=false
use_authoring_environment=false
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
  --use-authoring-environment
                        Use the authoring module-path and metadata environment overrides.
  -h, --help            Show this help.

Environment overrides:
  JSCENE3D_MAVEN_LOCAL_REPOSITORY
  JSCENE3D_AUTHORING_SERVICE_MODULE_PATH (with --use-authoring-environment)
  JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH (with --use-authoring-environment)
  JSCENE3D_JAVA_EXECUTABLE
  JSCENE3D_ELECTRON_EXECUTABLE
  JSCENE3D_RENDERER_RUNTIME_ARCHIVE
  JSCENE3D_RENDERER_RUNTIME_DIRECTORY
  JSCENE3D_RENDERER_JAVA_EXECUTABLE
  JSCENE3D_PROJECT_RUNTIME_ARTIFACT_PATH

By default, the launcher resolves the versioned JScene3D authoring runtime from
the default local repository at $HOME/.m2/repository. It resolves the renderer
runtime independently from its installed runtime ZIP. Native viewport
development requires a local downstream binary selected with
JSCENE3D_ELECTRON_EXECUTABLE. This script does not compile sources, invoke Maven,
or run tests.
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
		--use-authoring-environment)
			use_authoring_environment=true
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

[[ -f "$authoring_runtime_version_file" ]] || fail "authoring runtime version file not found: $authoring_runtime_version_file"
authoring_runtime_version="$(tr -d '\r\n' <"$authoring_runtime_version_file")"
readonly authoring_runtime_version
[[ "$authoring_runtime_version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] \
	|| fail "invalid authoring runtime version in $authoring_runtime_version_file"

[[ -f "$renderer_runtime_version_file" ]] || fail "renderer runtime version file not found: $renderer_runtime_version_file"
renderer_runtime_version="$(tr -d '\r\n' <"$renderer_runtime_version_file")"
readonly renderer_runtime_version
[[ "$renderer_runtime_version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] \
	|| fail "invalid renderer runtime version in $renderer_runtime_version_file"

maven_repository="${JSCENE3D_MAVEN_LOCAL_REPOSITORY:-}"
if [[ -z "$maven_repository" ]]; then
	[[ -n "${HOME:-}" ]] \
		|| fail "HOME is not set; set JSCENE3D_MAVEN_LOCAL_REPOSITORY to the local repository containing the installed JScene3D runtimes."
	maven_repository="$HOME/.m2/repository"
fi
[[ -d "$maven_repository" ]] || fail "Maven local repository does not exist: $maven_repository"
maven_repository="$(cd "$maven_repository" && pwd -P)"

module_path_source=""
module_path=""
metadata_path_source=""
extension_metadata_path=""
runtime_archive=""

if [[ "$use_authoring_environment" == true ]]; then
	module_path="${JSCENE3D_AUTHORING_SERVICE_MODULE_PATH:-}"
	extension_metadata_path="${JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH:-}"
	[[ -n "$module_path" && -n "$extension_metadata_path" ]] \
		|| fail "--use-authoring-environment requires both JSCENE3D_AUTHORING_SERVICE_MODULE_PATH and JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH."
	module_path_source="JSCENE3D_AUTHORING_SERVICE_MODULE_PATH"
	metadata_path_source="JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH"
elif [[ -n "${JSCENE3D_AUTHORING_SERVICE_MODULE_PATH:-}" || -n "${JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH:-}" ]]; then
	echo "Ignoring inherited authoring runtime overrides; pass --use-authoring-environment to use them explicitly." >&2
fi

if [[ -z "$module_path" || -z "$extension_metadata_path" ]]; then
	runtime_archive="$maven_repository/$runtime_group_path/$runtime_artifact/$authoring_runtime_version/$runtime_artifact-$authoring_runtime_version-runtime.zip"
	if [[ ! -f "$runtime_archive" ]]; then
		fail "installed authoring runtime $runtime_artifact:$authoring_runtime_version is missing at $runtime_archive. From the JScene3D Java repository, run: ./mvnw install -pl $runtime_artifact -am"
	fi
	command -v unzip >/dev/null 2>&1 || fail "unzip is required to read the installed authoring runtime."
	command -v shasum >/dev/null 2>&1 || fail "shasum is required to identify the installed authoring runtime."

	runtime_digest="$(shasum -a 256 "$runtime_archive" | awk '{print $1}')"
	readonly runtime_digest
	runtime_parent="$profile/jscene3d-authoring-runtime"
	runtime_directory="$runtime_parent/$authoring_runtime_version-$runtime_digest"
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

renderer_runtime_archive="${JSCENE3D_RENDERER_RUNTIME_ARCHIVE:-}"
renderer_runtime_directory="${JSCENE3D_RENDERER_RUNTIME_DIRECTORY:-}"
renderer_runtime_source="JSCENE3D_RENDERER_RUNTIME_DIRECTORY"
if [[ -n "$renderer_runtime_archive" && -n "$renderer_runtime_directory" ]]; then
	fail "use either JSCENE3D_RENDERER_RUNTIME_ARCHIVE or JSCENE3D_RENDERER_RUNTIME_DIRECTORY, not both."
fi
if [[ -z "$renderer_runtime_directory" ]]; then
	if [[ -z "$renderer_runtime_archive" ]]; then
		renderer_runtime_archive="$maven_repository/$runtime_group_path/$renderer_runtime_artifact/$renderer_runtime_version/$renderer_runtime_artifact-$renderer_runtime_version-runtime.zip"
		renderer_runtime_source="$renderer_runtime_archive"
	else
		[[ "$renderer_runtime_archive" = /* ]] || fail "JSCENE3D_RENDERER_RUNTIME_ARCHIVE must be an absolute path."
		renderer_runtime_source="JSCENE3D_RENDERER_RUNTIME_ARCHIVE"
	fi
	[[ -f "$renderer_runtime_archive" ]] \
		|| fail "renderer runtime $renderer_runtime_artifact:$renderer_runtime_version is missing at $renderer_runtime_archive. Install the packaged runtime or set JSCENE3D_RENDERER_RUNTIME_ARCHIVE."
	command -v unzip >/dev/null 2>&1 || fail "unzip is required to read the renderer runtime."
	command -v shasum >/dev/null 2>&1 || fail "shasum is required to identify the renderer runtime."
	renderer_runtime_digest="$(shasum -a 256 "$renderer_runtime_archive" | awk '{print $1}')"
	renderer_runtime_parent="$profile/jscene3d-renderer-runtime"
	renderer_runtime_directory="$renderer_runtime_parent/$renderer_runtime_version-$renderer_runtime_digest"
	mkdir -p "$renderer_runtime_parent"
	if [[ ! -f "$renderer_runtime_directory/.complete" ]]; then
		renderer_runtime_staging="$(mktemp -d "$renderer_runtime_parent/.extract.XXXXXX")"
		if ! unzip -q "$renderer_runtime_archive" -d "$renderer_runtime_staging"; then
			rm -rf -- "$renderer_runtime_staging"
			fail "could not extract renderer runtime: $renderer_runtime_archive"
		fi
		[[ -d "$renderer_runtime_staging/lib" ]] || fail "renderer runtime has no lib directory: $renderer_runtime_archive"
		[[ -d "$renderer_runtime_staging/native" ]] || fail "renderer runtime has no native directory: $renderer_runtime_archive"
		touch "$renderer_runtime_staging/.complete"
		if [[ -d "$renderer_runtime_directory" ]]; then
			rm -rf -- "$renderer_runtime_staging"
		else
			mv "$renderer_runtime_staging" "$renderer_runtime_directory"
		fi
	fi
else
	[[ "$renderer_runtime_directory" = /* ]] || fail "JSCENE3D_RENDERER_RUNTIME_DIRECTORY must be an absolute path."
fi

[[ -d "$renderer_runtime_directory/lib" ]] || fail "renderer runtime lib directory does not exist: $renderer_runtime_directory/lib"
[[ -d "$renderer_runtime_directory/native" ]] || fail "renderer runtime native directory does not exist: $renderer_runtime_directory/native"
shopt -s nullglob
renderer_runtime_jars=("$renderer_runtime_directory/lib/"*.jar)
renderer_runtime_natives=("$renderer_runtime_directory/native/"*)
shopt -u nullglob
((${#renderer_runtime_jars[@]} > 0)) || fail "renderer runtime contains no library JARs: $renderer_runtime_directory"
((${#renderer_runtime_natives[@]} > 0)) || fail "renderer runtime contains no native libraries: $renderer_runtime_directory"

java_executable="${JSCENE3D_JAVA_EXECUTABLE:-}"
if [[ -z "$java_executable" ]]; then
	java_executable="$(command -v java || true)"
fi
[[ -n "$java_executable" && "$java_executable" = /* && -x "$java_executable" ]] \
	|| fail "set JSCENE3D_JAVA_EXECUTABLE to an absolute Java executable."

renderer_java_executable="${JSCENE3D_RENDERER_JAVA_EXECUTABLE:-$java_executable}"
[[ "$renderer_java_executable" = /* && -x "$renderer_java_executable" ]] \
	|| fail "set JSCENE3D_RENDERER_JAVA_EXECUTABLE to an absolute Java executable."

project_runtime_artifact_path="${JSCENE3D_PROJECT_RUNTIME_ARTIFACT_PATH:-}"
if [[ -n "$project_runtime_artifact_path" ]]; then
	IFS=':' read -r -a project_runtime_artifacts <<<"$project_runtime_artifact_path"
	for project_runtime_artifact in "${project_runtime_artifacts[@]}"; do
		[[ "$project_runtime_artifact" = /* ]] \
			|| fail "project runtime artifact must be an absolute path: $project_runtime_artifact"
		[[ -f "$project_runtime_artifact" && "$project_runtime_artifact" == *.jar ]] \
			|| fail "project runtime artifact must be an existing JAR: $project_runtime_artifact"
	done
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
	[[ -n "${JSCENE3D_ELECTRON_EXECUTABLE:-}" ]] \
		|| fail "JSCENE3D_ELECTRON_EXECUTABLE must select the JScene3D Electron downstream; the standard source Electron does not provide native viewport support."
	[[ "$JSCENE3D_ELECTRON_EXECUTABLE" = /* ]] || fail "JSCENE3D_ELECTRON_EXECUTABLE must be an absolute path."
	source_binary="$JSCENE3D_ELECTRON_EXECUTABLE"
	readonly source_binary
	[[ -x "$source_binary" ]] || fail "source-built JScene3D Editor not found: $source_binary"
fi

echo "JScene3D source launch configuration"
echo "  Source repository: $repository_root"
echo "  Authoring runtime version: $authoring_runtime_version"
if [[ -n "$runtime_archive" ]]; then
	echo "  Runtime archive:   $runtime_archive"
fi
echo "  Module path source: $module_path_source"
echo "  Metadata source:    $metadata_path_source"
echo "  Renderer runtime version: $renderer_runtime_version"
echo "  Renderer runtime source:  $renderer_runtime_source"
echo "  Renderer runtime:         $renderer_runtime_directory"
echo "  Authoring Java:           $java_executable"
echo "  Renderer Java:            $renderer_java_executable"
if [[ -n "$project_runtime_artifact_path" ]]; then
	echo "  Project runtime artifacts: $project_runtime_artifact_path"
else
	echo "  Project runtime artifacts: none"
fi
echo "  Electron executable:      $source_binary"
echo "  Isolated profile:   $profile"
if [[ "$use_authoring_environment" == true ]]; then
	echo "  Restart command:    JSCENE3D_ELECTRON_EXECUTABLE='$source_binary' ./scripts/jscene3d/launch-source-editor.sh --use-authoring-environment --profile '$profile'"
else
	echo "  Restart command:    JSCENE3D_ELECTRON_EXECUTABLE='$source_binary' ./scripts/jscene3d/launch-source-editor.sh --profile '$profile'"
fi

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
	JSCENE3D_JAVA_EXECUTABLE="$java_executable" \
	JSCENE3D_RENDERER_RUNTIME_DIRECTORY="$renderer_runtime_directory" \
	JSCENE3D_RENDERER_JAVA_EXECUTABLE="$renderer_java_executable" \
	JSCENE3D_PROJECT_RUNTIME_ARTIFACT_PATH="$project_runtime_artifact_path" \
	VSCODE_SKIP_PRELAUNCH=1 \
	"$repository_root/scripts/code.sh" \
	--user-data-dir "$profile/user-data" \
	--extensions-dir "$profile/extensions" \
	"${launch_arguments[@]}"
