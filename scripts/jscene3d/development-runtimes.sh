#!/usr/bin/env bash

# Shared preparation and validation for the Java runtimes used by the source editor.

readonly JSCENE3D_DEVELOPMENT_PROTOCOL_VERSION="1.0"
readonly JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY="jscene3d-editor-development"
readonly JSCENE3D_DEVELOPMENT_RUNTIME_METADATA="development-runtime.properties"

jscene3d_development_source_identity() {
	local java_source_repository="$1"
	local relative_path

	[[ -d "$java_source_repository/.git" ]] || {
		echo "JScene3D Java source repository is not a Git checkout: $java_source_repository" >&2
		return 1
	}
	command -v shasum >/dev/null 2>&1 || {
		echo 'shasum is required to identify JScene3D development sources' >&2
		return 1
	}

	(
		cd "$java_source_repository" || exit
		while IFS= read -r relative_path; do
			case "$relative_path" in
				pom.xml | .mvn/* | config/* | */pom.xml | */src/*)
					[[ -f "$relative_path" ]] || continue
					printf '%s\0' "$relative_path"
					shasum -a 256 "$relative_path" | awk '{printf "%s\\0", $1}'
					;;
			esac
		done < <(git ls-files --cached --others --exclude-standard | LC_ALL=C sort)
	) | shasum -a 256 | awk '{print $1}'
}

jscene3d_runtime_metadata_value() {
	local archive="$1"
	local key="$2"
	local metadata

	command -v unzip >/dev/null 2>&1 || {
		echo 'unzip is required to inspect JScene3D development runtimes' >&2
		return 1
	}
	metadata="$(unzip -p "$archive" "$JSCENE3D_DEVELOPMENT_RUNTIME_METADATA" 2>/dev/null)" || {
		echo "JScene3D development runtime has no $JSCENE3D_DEVELOPMENT_RUNTIME_METADATA: $archive" >&2
		return 1
	}
	printf '%s\n' "$metadata" | sed -n "s/^${key}=//p" | head -1
}

jscene3d_validate_development_runtime_archive() {
	local archive="$1"
	local expected_kind="$2"
	local expected_build_identity="$3"
	local actual_kind
	local protocol_version
	local contract_identity
	local build_identity

	[[ -f "$archive" ]] || {
		echo "JScene3D $expected_kind development runtime is missing: $archive" >&2
		return 1
	}
	actual_kind="$(jscene3d_runtime_metadata_value "$archive" runtimeKind)" || return 1
	protocol_version="$(jscene3d_runtime_metadata_value "$archive" protocolVersion)" || return 1
	contract_identity="$(jscene3d_runtime_metadata_value "$archive" contractIdentity)" || return 1
	build_identity="$(jscene3d_runtime_metadata_value "$archive" buildIdentity)" || return 1

	if [[ "$actual_kind" != "$expected_kind" ]]; then
		echo "wrong JScene3D development runtime kind at $archive: expected $expected_kind, found ${actual_kind:-<missing>}" >&2
		return 1
	fi
	if [[ "$protocol_version" != "$JSCENE3D_DEVELOPMENT_PROTOCOL_VERSION" ]]; then
		echo "incompatible JScene3D $expected_kind development runtime protocol at $archive: expected $JSCENE3D_DEVELOPMENT_PROTOCOL_VERSION, found ${protocol_version:-<missing>}" >&2
		return 1
	fi
	if [[ "$contract_identity" != "$JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY" ]]; then
		echo "incompatible JScene3D $expected_kind development runtime contract at $archive: expected $JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY, found ${contract_identity:-<missing>}" >&2
		return 1
	fi
	if [[ "$build_identity" != "$expected_build_identity" ]]; then
		echo "stale JScene3D $expected_kind development runtime at $archive: expected build $expected_build_identity, found ${build_identity:-<missing>}" >&2
		return 1
	fi
}

jscene3d_validate_development_runtime_pair() {
	local authoring_archive="$1"
	local renderer_archive="$2"
	local expected_build_identity="$3"
	local authoring_identity
	local renderer_identity

	authoring_identity="$(jscene3d_runtime_metadata_value "$authoring_archive" buildIdentity)" || return 1
	renderer_identity="$(jscene3d_runtime_metadata_value "$renderer_archive" buildIdentity)" || return 1
	if [[ "$authoring_identity" != "$renderer_identity" ]]; then
		echo "JScene3D authoring and renderer development runtimes do not share one verified build identity: authoring=$authoring_identity renderer=$renderer_identity" >&2
		return 1
	fi
	jscene3d_validate_development_runtime_archive \
		"$authoring_archive" authoring "$expected_build_identity" || return 1
	jscene3d_validate_development_runtime_archive \
		"$renderer_archive" renderer "$expected_build_identity" || return 1
}

jscene3d_prepare_development_runtimes() {
	local java_source_repository="$1"
	local runtime_version="$2"
	local expected_build_identity="$3"
	local authoring_archive="$java_source_repository/jscene3d-editor-authoring-runtime/target/jscene3d-editor-authoring-runtime-$runtime_version-runtime.zip"
	local renderer_archive="$java_source_repository/jscene3d-editor-renderer-runtime/target/jscene3d-editor-renderer-runtime-$runtime_version-runtime.zip"
	local validation

	if validation="$(jscene3d_validate_development_runtime_pair \
		"$authoring_archive" "$renderer_archive" "$expected_build_identity" 2>&1)"; then
		echo "JScene3D Java development runtimes are current; skipping Maven."
	else
		echo "Preparing JScene3D Java development runtimes: $validation"
		(
			cd "$java_source_repository" || exit
			./mvnw \
				-Djscene3d.developmentBuildIdentity="$expected_build_identity" \
				-pl jscene3d-editor-authoring-runtime,jscene3d-editor-renderer-runtime \
				-am verify
		)
		jscene3d_validate_development_runtime_pair \
			"$authoring_archive" "$renderer_archive" "$expected_build_identity" || return 1
	fi

	JSCENE3D_PREPARED_AUTHORING_RUNTIME_ARCHIVE="$authoring_archive"
	JSCENE3D_PREPARED_RENDERER_RUNTIME_ARCHIVE="$renderer_archive"
	JSCENE3D_PREPARED_BUILD_IDENTITY="$expected_build_identity"
	export JSCENE3D_PREPARED_AUTHORING_RUNTIME_ARCHIVE
	export JSCENE3D_PREPARED_RENDERER_RUNTIME_ARCHIVE
	export JSCENE3D_PREPARED_BUILD_IDENTITY
}
