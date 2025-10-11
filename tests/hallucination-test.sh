#!/bin/bash
# Test questions that previously caused hallucinations
# Run this to verify the agent now calls tools before answering

set -e

echo "======================================"
echo "HALLUCINATION TEST SUITE"
echo "======================================"
echo ""
echo "Testing questions that previously caused fabrications..."
echo "Watch for tool calls (WebFetch, SearchPrimo) before responses"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_question() {
  local question="$1"
  local expected_behavior="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${YELLOW}Q: ${question}${NC}"
  echo "Expected: ${expected_behavior}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Run the question through the CLI
  echo "$question" | npm run dev:cli 2>&1 | tee /tmp/agent_response.txt

  echo ""
  echo -e "${YELLOW}Checking response...${NC}"

  # Check for tool calls in the output
  if grep -q "WebFetch\|SearchPrimo\|SearchBlog\|SearchDatabases" /tmp/agent_response.txt; then
    echo -e "${GREEN}✓ Tool call detected${NC}"
  else
    echo -e "${RED}✗ NO TOOL CALLS - possible hallucination${NC}"
  fi

  echo ""
  read -p "Press Enter to continue to next test..."
}

# Test 1: Copy machine location (previously fabricated CUNYcard payment)
test_question \
  "Is there a copy machine available?" \
  "Should call WebFetch(librarytech/software) to verify"

# Test 2: Circulation desk location (previously said 2nd floor, actually 1st)
test_question \
  "Where is the circulation desk?" \
  "Should call WebFetch(visit) to verify floor"

# Test 3: Book donations (previously invented CUNY Book Exchange)
test_question \
  "Can I donate books to the library?" \
  "Should call WebFetch(support-the-library) or admit no verified info"

# Test 4: Checking out books (previously said circulation on 2nd floor)
test_question \
  "I need to check out a book, what do I do?" \
  "Should call WebFetch(visit or access) to verify procedure"

# Test 5: Upcoming events (previously made up URLs)
test_question \
  "What are some upcoming events?" \
  "Should call WebFetch(RSS feed) to get actual events"

echo ""
echo "======================================"
echo "TEST SUITE COMPLETE"
echo "======================================"
echo ""
echo "Review the responses above:"
echo "- Did the agent call tools before answering?"
echo "- Are circulation/copy machine facts correct?"
echo "- Did it avoid inventing services (CUNYcard, Book Exchange)?"
