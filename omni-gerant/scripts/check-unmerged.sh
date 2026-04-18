#!/usr/bin/env bash
# check-unmerged.sh — Audit des branches non-mergees a main
# Usage : ./scripts/check-unmerged.sh [--verbose]
#
# Detecte :
# - Les branches locales avec des commits non-merges dans origin/main
# - Les commits recents qui paraissent importants (feat:, fix:)
# - Les fichiers modifies non commites sur la branche courante
#
# Exit codes :
# - 0 : tout est synchronise
# - 1 : des branches non-mergees existent
# - 2 : working tree pas clean

set -e

VERBOSE=0
if [ "$1" = "--verbose" ] || [ "$1" = "-v" ]; then
  VERBOSE=1
fi

# Refresh remote state
git fetch origin main --quiet 2>/dev/null || true

# Check working tree
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "[!] Working tree has uncommitted changes"
  git status --short | head -5
  exit 2
fi

# Find branches ahead of origin/main
UNMERGED_COUNT=0
IMPORTANT_COUNT=0

echo "=== Branches non-mergees dans origin/main ==="
for branch in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  # Skip main-ish branches
  case "$branch" in main|master) continue ;; esac

  ahead=$(git rev-list --count "origin/main..$branch" 2>/dev/null || echo 0)
  if [ "$ahead" != "0" ] && [ -n "$ahead" ]; then
    UNMERGED_COUNT=$((UNMERGED_COUNT + 1))
    latest=$(git log -1 --format='%s' "$branch" 2>/dev/null | head -c 80)

    # Detect potentially important work (feat/fix commits)
    important=$(git log --format='%s' "origin/main..$branch" 2>/dev/null | grep -cE '^(feat|fix)(\(.+\))?:' || echo 0)
    if [ "$important" != "0" ] && [ "$important" -gt 2 ]; then
      IMPORTANT_COUNT=$((IMPORTANT_COUNT + 1))
      marker='[!]'
    else
      marker='[-]'
    fi

    echo "$marker $branch : $ahead commits ahead | $latest"

    if [ "$VERBOSE" = "1" ]; then
      git log --format='    %h %s' "origin/main..$branch" 2>/dev/null | head -10
      echo ""
    fi
  fi
done

echo ""
echo "=== Resume ==="
echo "Branches non-mergees : $UNMERGED_COUNT"
echo "Avec travail important (>2 feat/fix) : $IMPORTANT_COUNT"

if [ "$IMPORTANT_COUNT" -gt 0 ]; then
  echo ""
  echo "[!] Des branches marquees [!] contiennent du travail potentiellement en cours."
  echo "    Rejoue avec --verbose pour voir le detail des commits."
  echo "    Reference : DEPLOYMENT-RULES.md"
  exit 1
fi

if [ "$UNMERGED_COUNT" = "0" ]; then
  echo "[OK] Tout est synchronise avec origin/main"
fi

exit 0
