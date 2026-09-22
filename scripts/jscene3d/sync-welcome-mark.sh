#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/../brand/images/jscene3d-mark.svg"
TARGET="$ROOT/src/vs/workbench/contrib/jscene3d/browser/media/jscene3d-mark.svg"

cp "$SOURCE" "$TARGET"
echo "Copied JScene3D Welcome mark from the authoritative brand SVG."
