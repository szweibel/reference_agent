#!/bin/bash
# Quick test for a single hallucination-prone question

if [ -z "$1" ]; then
  echo "Usage: ./tests/quick-test.sh \"your question\""
  echo ""
  echo "Examples:"
  echo "  ./tests/quick-test.sh \"Is there a copy machine?\""
  echo "  ./tests/quick-test.sh \"Where is the circulation desk?\""
  exit 1
fi

QUESTION="$1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Question: $QUESTION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the question and capture output
echo "$QUESTION" | npm run dev:cli 2>&1 | tee /tmp/quick_test.txt

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VALIDATION CHECKS:"
echo ""

# Check for tool calls
if grep -qi "WebFetch\|SearchPrimo\|SearchBlog\|SearchDatabases" /tmp/quick_test.txt; then
  echo "✓ Tool call detected"
else
  echo "✗ NO TOOL CALLS (possible hallucination)"
fi

# Check for known hallucinations
if grep -qi "cunycard" /tmp/quick_test.txt; then
  echo "✗ HALLUCINATION: Mentions CUNYcard (doesn't exist)"
fi

if grep -qi "book exchange" /tmp/quick_test.txt; then
  echo "✗ HALLUCINATION: Mentions CUNY Book Exchange (doesn't exist)"
fi

if grep -qi "circulation.*2nd floor\|2nd floor.*circulation" /tmp/quick_test.txt; then
  echo "✗ HALLUCINATION: Says circulation on 2nd floor (actually 1st)"
fi

if grep -qi "value station" /tmp/quick_test.txt; then
  echo "✗ HALLUCINATION: Mentions value station (doesn't exist)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
