#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_svg="$repo_root/../brand/images/jscene3d-mark.svg"
output_icon="$repo_root/resources/jscene3d/jscene3d-editor.icns"

for tool in rsvg-convert iconutil; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "Missing required tool: $tool" >&2
		exit 1
	fi
done

if [[ ! -f "$source_svg" ]]; then
	echo "Missing authoritative SVG: $source_svg" >&2
	exit 1
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/jscene3d-icon.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
iconset="$temp_dir/JScene3D.iconset"
mkdir -p "$iconset" "$(dirname "$output_icon")"

render_icon() {
	local pixels="$1"
	local filename="$2"
	rsvg-convert --width "$pixels" --height "$pixels" \
		--output "$iconset/$filename" "$source_svg"
}

render_icon 16 icon_16x16.png
render_icon 32 icon_16x16@2x.png
render_icon 32 icon_32x32.png
render_icon 64 icon_32x32@2x.png
render_icon 128 icon_128x128.png
render_icon 256 icon_128x128@2x.png
render_icon 256 icon_256x256.png
render_icon 512 icon_256x256@2x.png
render_icon 512 icon_512x512.png
render_icon 1024 icon_512x512@2x.png

generated_icns="$temp_dir/jscene3d-editor.icns"
iconutil --convert icns --output "$generated_icns" "$iconset"
mv "$generated_icns" "$output_icon"
echo "Generated $output_icon from $source_svg"
