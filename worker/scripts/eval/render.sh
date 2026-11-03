#!/usr/bin/env bash
# «Фото» для пробного варианта (scripts/ai-eval.mjs): снимки страниц из этой папки в Chrome без окна.
#   bash worker/scripts/eval/render.sh <папка>  →  solution.png, paragraph.png, notebook.png
# solution — решение ученика с ошибкой, paragraph — параграф учебника, notebook — тетрадь с самостоятельной.
set -euo pipefail
out="${1:?Укажите папку для снимков}"
dir="$(cd "$(dirname "$0")" && pwd)"
chrome="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$chrome" ] || { echo "Нужен Chrome или Chromium (переменная CHROME)" >&2; exit 1; }
mkdir -p "$out"
for page in solution:900,560 paragraph:900,700 notebook:900,620; do
  name="${page%%:*}"
  "$chrome" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size="${page#*:}" --screenshot="$out/$name.png" "file://$dir/$name.html" >/dev/null 2>&1
  [ -s "$out/$name.png" ] || { echo "Не получился снимок $name" >&2; exit 1; }
  echo "✓ $name.png"
done
