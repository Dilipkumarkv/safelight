#!/bin/bash
# Publish this folder to GitHub through the Contents API.
# git-over-HTTPS is rewritten by the environment's global gitconfig, so the API
# is the reliable path here. Payloads go through files: the 512px icon is large
# enough to blow the command-line argument limit.
set -u

REPO="Dilipkumarkv/safelight"
BRANCH="main"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.publish.log"
: > "$LOG"

cd "$ROOT" || exit 1

# Probe write access before touching every file.
if ! gh api "repos/$REPO" --jq '.permissions.push' >> "$LOG" 2>&1; then
  echo "probe-failed" >> "$LOG"
  exit 1
fi

fail=0
while IFS= read -r f; do
  payload="$ROOT/.payload.json"
  b64=$(base64 "$f" | tr -d '\n')
  {
    printf '{"message":"Add %s","content":"%s","branch":"%s"}' "$f" "$b64" "$BRANCH"
  } > "$payload"

  if gh api -X PUT "repos/$REPO/contents/$f" --input "$payload" > /dev/null 2>>"$LOG"; then
    echo "ok   $f" >> "$LOG"
  else
    echo "FAIL $f" >> "$LOG"
    fail=1
  fi
  rm -f "$payload"
done < <(git ls-files)

echo "done fail=$fail" >> "$LOG"
exit "$fail"
