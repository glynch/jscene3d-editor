#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_dir="$repo_root/../brand/images"
target_dir="$repo_root/src/vs/code/electron-browser/workbench/media/jscene3d"

assets=(
	"viewport-emergence-background.png"
	"jscene3d-mark.svg"
)

mkdir -p "$target_dir"

for asset in "${assets[@]}"; do
	source="$source_dir/$asset"
	target="$target_dir/$asset"

	if [[ ! -f "$source" ]]; then
		echo "Missing authoritative splash asset: $source" >&2
		exit 1
	fi

	cp "$source" "$target"
	cmp --silent "$source" "$target"
done

echo "Copied JScene3D startup splash assets from the authoritative brand files."
