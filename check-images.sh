#!/usr/bin/env bash
# check-images.sh — ověří, že všechny obrázky odkazované v HTML jsou v gitu.
# Spusť z kořene repа statly1:  ./check-images.sh
# Vrací nenulový kód, pokud nějaký odkazovaný obrázek chybí v gitu (hodí se i jako pre-commit hook).

set -euo pipefail
cd "$(dirname "$0")"

refs=$(grep -rhoE '(src|href)="[^":]+\.(webp|jpg|jpeg|png|gif|svg|avif)"' ./*.html 2>/dev/null \
  | sed -E 's/.*="//; s/"$//' \
  | sort -u)

tracked=$(git ls-files)
missing=0

while IFS= read -r f; do
  [ -z "$f" ] && continue
  # přeskoč externí URL
  case "$f" in http://*|https://*|//*) continue ;; esac
  # absolutní cesta od kořene webu (/foo.png) → relativní k repu (foo.png)
  f="${f#/}"
  if ! printf '%s\n' "$tracked" | grep -qxF "$f"; then
    if [ -f "$f" ]; then
      echo "⚠️  CHYBÍ v gitu (existuje lokálně, přidej: git add \"$f\"): $f"
      missing=1
    else
      echo "❌ NEEXISTUJE ani lokálně (rozbitý odkaz): $f"
      missing=1
    fi
  fi
done <<< "$refs"

if [ "$missing" -eq 0 ]; then
  echo "✅ Všechny odkazované obrázky jsou v gitu."
fi
exit "$missing"
