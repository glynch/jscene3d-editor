#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_dir="$repo_root/.build/jscene3d-java-tooling"

for tool in curl shasum; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "Missing required tool: $tool" >&2
		exit 1
	fi
done

mkdir -p "$output_dir"

fetch() {
	local filename="$1"
	local expected_sha256="$2"
	local url="$3"
	local output="$output_dir/$filename"

	if [[ -f "$output" ]] && [[ "$(shasum -a 256 "$output" | awk '{print $1}')" == "$expected_sha256" ]]; then
		echo "Verified $output"
		return
	fi

	local temporary
	temporary="$(mktemp "$output_dir/.${filename}.XXXXXX")"
	trap 'rm -f "$temporary"' RETURN
	curl --proto '=https' --tlsv1.2 --fail --location --retry 3 --output "$temporary" "$url"

	local actual_sha256
	actual_sha256="$(shasum -a 256 "$temporary" | awk '{print $1}')"
	if [[ "$actual_sha256" != "$expected_sha256" ]]; then
		echo "Checksum mismatch for $filename" >&2
		echo "Expected: $expected_sha256" >&2
		echo "Actual:   $actual_sha256" >&2
		exit 1
	fi

	mv "$temporary" "$output"
	trap - RETURN
	echo "Downloaded and verified $output"
}

fetch \
	"redhat.java-1.56.0-darwin-arm64.vsix" \
	"0326b19b55d378dfdd11cc01a86eb6c90fcc42755c542f6261179be41d7e1812" \
	"https://github.com/redhat-developer/vscode-java/releases/download/v1.56.0/java-darwin-arm64-1.56.0-1066.vsix"

fetch \
	"vscjava.vscode-java-debug-0.59.0.vsix" \
	"87627e24dbb5b01137decc0265f043cb08adad22af3c195f1ba39898dafb1588" \
	"https://open-vsx.org/api/vscjava/vscode-java-debug/0.59.0/file/vscjava.vscode-java-debug-0.59.0.vsix"

fetch \
	"vscjava.vscode-maven-0.45.3.vsix" \
	"2d7b30676793604e0c140ab0e5cc5a649d6af2fd9e0b2797911f86a9164654b0" \
	"https://open-vsx.org/api/vscjava/vscode-maven/0.45.3/file/vscjava.vscode-maven-0.45.3.vsix"

fetch \
	"vscjava.vscode-java-test-0.46.0.vsix" \
	"56c1e14dc73a30e9574c47042106fa52893bf8325b580f47c14ace07d5eef255" \
	"https://open-vsx.org/api/vscjava/vscode-java-test/0.46.0/file/vscjava.vscode-java-test-0.46.0.vsix"
