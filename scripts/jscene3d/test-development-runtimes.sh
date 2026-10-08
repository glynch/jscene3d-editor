#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly script_dir
# shellcheck source=scripts/jscene3d/development-runtimes.sh
source "$script_dir/development-runtimes.sh"

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/jscene3d-development-runtimes-test.XXXXXX")"
readonly fixture_root
trap 'rm -rf -- "$fixture_root"' EXIT

java_root="$fixture_root/threejs-java"
mkdir -p "$java_root/module/src/main/java/example"
printf '<project/>\n' >"$java_root/pom.xml"
printf 'final class Example {}\n' >"$java_root/module/src/main/java/example/Example.java"
git -C "$java_root" init -q
git -C "$java_root" add pom.xml module/src/main/java/example/Example.java

identity_before="$(jscene3d_development_source_identity "$java_root")"
printf 'final class Example { int changed; }\n' >"$java_root/module/src/main/java/example/Example.java"
identity_after="$(jscene3d_development_source_identity "$java_root")"
if [[ "$identity_before" == "$identity_after" ]]; then
	echo 'FAIL: changing tracked Java source did not change the development build identity' >&2
	exit 1
fi

make_runtime_archive() {
	local archive="$1"
	local kind="$2"
	local build_identity="$3"
	local staging="$fixture_root/archive-$kind"
	rm -rf -- "$staging"
	mkdir -p "$staging/lib" "$staging/metadata" "$staging/native"
	printf 'fixture\n' >"$staging/lib/fixture.jar"
	printf 'fixture\n' >"$staging/metadata/fixture.jar"
	printf 'fixture\n' >"$staging/native/fixture.dylib"
	cat >"$staging/development-runtime.properties" <<EOF
runtimeKind=$kind
protocolVersion=1.0
contractIdentity=$JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY
buildIdentity=$build_identity
EOF
	(cd "$staging" && zip -q -r "$archive" .)
}

authoring_archive="$fixture_root/authoring.zip"
renderer_archive="$fixture_root/renderer.zip"
make_runtime_archive "$authoring_archive" authoring "$identity_after"
make_runtime_archive "$renderer_archive" renderer "$identity_after"

jscene3d_validate_development_runtime_archive \
	"$authoring_archive" authoring "$identity_after"
jscene3d_validate_development_runtime_archive \
	"$renderer_archive" renderer "$identity_after"
jscene3d_validate_development_runtime_pair \
	"$authoring_archive" "$renderer_archive" "$identity_after"

if output="$(jscene3d_validate_development_runtime_archive \
	"$authoring_archive" authoring "$identity_before" 2>&1)"; then
	echo 'FAIL: a stale runtime archive was accepted' >&2
	exit 1
fi
if [[ "$output" != *'stale JScene3D authoring development runtime'* ]]; then
	echo "FAIL: stale runtime diagnostic was unclear: $output" >&2
	exit 1
fi

make_runtime_archive "$renderer_archive" renderer different-build
if output="$(jscene3d_validate_development_runtime_pair \
	"$authoring_archive" "$renderer_archive" "$identity_after" 2>&1)"; then
	echo 'FAIL: authoring and renderer archives from different builds were accepted' >&2
	exit 1
fi
if [[ "$output" != *'do not share one verified build identity'* ]]; then
	echo "FAIL: mixed-runtime diagnostic was unclear: $output" >&2
	exit 1
fi

version=0.1.0-SNAPSHOT
authoring_target="$java_root/jscene3d-editor-authoring-runtime/target/jscene3d-editor-authoring-runtime-$version-runtime.zip"
renderer_target="$java_root/jscene3d-editor-renderer-runtime/target/jscene3d-editor-renderer-runtime-$version-runtime.zip"
mkdir -p "$(dirname "$authoring_target")" "$(dirname "$renderer_target")"
make_runtime_archive "$authoring_target" authoring "$identity_after"
make_runtime_archive "$renderer_target" renderer "$identity_after"
cat >"$java_root/mvnw" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
build_identity=''
for argument in "$@"; do
	case "$argument" in
		-Djscene3d.developmentBuildIdentity=*) build_identity="${argument#*=}" ;;
	esac
done
[[ -n "$build_identity" ]]
printf '%s\n' "$build_identity" >maven-invoked
for kind in authoring renderer; do
	artifact="jscene3d-editor-${kind}-runtime"
	staging="target-fixture-$kind"
	rm -rf -- "$staging"
	mkdir -p "$staging/lib" "$staging/metadata" "$staging/native" "$artifact/target"
	printf 'fixture\n' >"$staging/lib/fixture.jar"
	printf 'fixture\n' >"$staging/metadata/fixture.jar"
	printf 'fixture\n' >"$staging/native/fixture.dylib"
	cat >"$staging/development-runtime.properties" <<PROPERTIES
runtimeKind=$kind
protocolVersion=1.0
contractIdentity=jscene3d-editor-development
buildIdentity=$build_identity
PROPERTIES
	(cd "$staging" && zip -q -r "../$artifact/target/$artifact-0.1.0-SNAPSHOT-runtime.zip" .)
done
EOF
chmod +x "$java_root/mvnw"

jscene3d_prepare_development_runtimes "$java_root" "$version" "$identity_after" >/dev/null
if [[ -f "$java_root/maven-invoked" ]]; then
	echo 'FAIL: current development runtimes caused an unnecessary Maven rebuild' >&2
	exit 1
fi
if [[ "$JSCENE3D_PREPARED_AUTHORING_RUNTIME_ARCHIVE" != "$authoring_target" \
	|| "$JSCENE3D_PREPARED_RENDERER_RUNTIME_ARCHIVE" != "$renderer_target" ]]; then
	echo 'FAIL: development runtime resolution did not select Java target archives' >&2
	exit 1
fi

printf 'final class Example { int changedAgain; }\n' >"$java_root/module/src/main/java/example/Example.java"
rebuilt_identity="$(jscene3d_development_source_identity "$java_root")"
jscene3d_prepare_development_runtimes "$java_root" "$version" "$rebuilt_identity" >/dev/null
if [[ "$(cat "$java_root/maven-invoked")" != "$rebuilt_identity" ]]; then
	echo 'FAIL: stale development runtimes did not trigger a source-identity build' >&2
	exit 1
fi
jscene3d_validate_development_runtime_pair "$authoring_target" "$renderer_target" "$rebuilt_identity"

printf 'PASS: development runtime source and archive identity checks\n'
