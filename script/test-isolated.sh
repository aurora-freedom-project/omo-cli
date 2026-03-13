#!/usr/bin/env bash
# test-isolated.sh — Run tests per-file to avoid Bun mock.module isolation issues
# Usage: ./script/test-isolated.sh [pattern]
#
# This runs each test file in a separate Bun process to avoid
# mock.module state leaking between test suites.

set -euo pipefail

PATTERN="${1:-}"
PASSED=0
FAILED=0
SKIPPED=0
FAILED_FILES=()

# Find all test files
if [ -n "$PATTERN" ]; then
  FILES=$(find src -name "*.test.ts" | grep "$PATTERN" | sort)
else
  FILES=$(find src -name "*.test.ts" | sort)
fi

TOTAL=$(echo "$FILES" | wc -l | tr -d ' ')
echo "🧪 Running $TOTAL test files individually..."
echo ""

for file in $FILES; do
  result=$(bun test "$file" --timeout 10000 2>&1)
  exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    PASSED=$((PASSED + 1))
    echo "  ✅ $file"
  else
    # Check if it's a skip (0 tests)
    if echo "$result" | grep -q "0 pass"; then
      SKIPPED=$((SKIPPED + 1))
      echo "  ⏭️  $file (skipped)"
    else
      FAILED=$((FAILED + 1))
      FAILED_FILES+=("$file")
      echo "  ❌ $file"
    fi
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASSED passed, $FAILED failed, $SKIPPED skipped / $TOTAL total"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
  echo ""
  echo "Failed files:"
  for f in "${FAILED_FILES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

exit 0
