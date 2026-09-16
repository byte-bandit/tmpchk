#!/usr/bin/env bash
# Run every suite. Node suites first (fast), then the browser ones.
set -u
cd "$(dirname "$0")/.."
fail=0
for t in tests/physics.test.js tests/attitude.test.js tests/missions.test.js tests/deep.test.js tests/docking.test.js \
         tests/coldstart.test.js tests/cdu.test.js \
         tests/browser/layout.test.js tests/browser/text.test.js tests/browser/fullscreen.test.js; do
  printf '%-36s' "$(basename "$t")"
  if out=$(node "$t" 2>&1); then
    echo "$(echo "$out" | tail -1)"
  else
    echo "FAILED"; echo "$out" | grep -E '  FAIL  |Error' | head -8; fail=1
  fi
done
[ $fail -eq 0 ] && echo && echo "all suites passed"
exit $fail
