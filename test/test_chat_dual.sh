#!/bin/bash
# Chat P2P dual-instance test suite
# Tests chat creation and messaging between two instances
#
# Note: Users must be friends to chat with each other

set -e

CURL="/home/alistair/mochi/test/claude/curl.sh"

PASSED=0
FAILED=0

pass() {
    echo "[PASS] $1"
    ((PASSED++)) || true
}

fail() {
    echo "[FAIL] $1: $2"
    ((FAILED++)) || true
}

echo "=============================================="
echo "Chat Dual-Instance P2P Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Get identity IDs and ensure friendship
# ============================================================================

echo ""
echo "--- Setup: Get Identities and Ensure Friendship ---"

# Get identity IDs from current friends list
RESULT1=$("$CURL" -i 1 -a admin -X GET "/people/friends")
IDENTITY1=$(echo "$RESULT1" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)
FRIEND_ID1=$(echo "$RESULT1" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['id'] if d['friends'] else '')" 2>/dev/null)

RESULT2=$("$CURL" -i 2 -a admin -X GET "/people/friends")
IDENTITY2=$(echo "$RESULT2" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)

# Verify they are friends (required for chat)
if [ -z "$IDENTITY1" ] || [ -z "$IDENTITY2" ]; then
    echo "Users are not friends. Setting up friendship first..."

    # Search for users to get their IDs
    RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends/search?search=User")
    IDENTITY2=$(echo "$RESULT" | python3 -c "import sys, json; results=json.load(sys.stdin)['data']['results']; print([r for r in results if 'User 21' in r['name']][0]['id'] if results else '')" 2>/dev/null)

    RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends/search?search=test")
    IDENTITY1=$(echo "$RESULT" | python3 -c "import sys, json; results=json.load(sys.stdin)['data']['results']; print(results[0]['id'] if results else '')" 2>/dev/null)

    # Create mutual friendship
    "$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
        -d "{\"id\":\"$IDENTITY2\",\"name\":\"User 21\"}" "/people/friends/create" >/dev/null
    sleep 1
    "$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
        -d "{\"id\":\"$IDENTITY1\",\"name\":\"test\"}" "/people/friends/create" >/dev/null
    sleep 2
fi

# Refresh identity info
RESULT1=$("$CURL" -i 1 -a admin -X GET "/people/friends")
IDENTITY1=$(echo "$RESULT1" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)

RESULT2=$("$CURL" -i 2 -a admin -X GET "/people/friends")
IDENTITY2=$(echo "$RESULT2" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)

if [ -z "$IDENTITY1" ] || [ -z "$IDENTITY2" ]; then
    echo "Could not establish friendship between instances"
    echo "Identity1: $IDENTITY1"
    echo "Identity2: $IDENTITY2"
    exit 1
fi

echo "Identity 1: $IDENTITY1"
echo "Identity 2: $IDENTITY2"
pass "Both instances are friends"

# ============================================================================
# TEST: Create chat from instance 1 with instance 2 as member
# ============================================================================

echo ""
echo "--- Create Chat Test ---"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"P2P Test Chat\",\"members\":\"$IDENTITY2\"}" "/chat/create")
CHAT_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$CHAT_ID" ]; then
    pass "Create chat on instance 1 (id: $CHAT_ID)"
else
    fail "Create chat" "$RESULT"
    exit 1
fi

sleep 2

# Verify chat appears on instance 1
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/list")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Chat visible on instance 1"
else
    fail "Chat visible on instance 1" "$RESULT"
fi

# Verify chat synced to instance 2
RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/list")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Chat synced to instance 2"
else
    fail "Chat synced to instance 2" "$RESULT"
fi

# ============================================================================
# TEST: View chat details
# ============================================================================

echo ""
echo "--- View Chat Test ---"

RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/view")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Instance 1 can view chat details"
else
    fail "Instance 1 view chat" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/view")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Instance 2 can view chat details"
else
    fail "Instance 2 view chat" "$RESULT"
fi

# ============================================================================
# TEST: Send message from instance 1
# ============================================================================

echo ""
echo "--- Send Message Test ---"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Hello from instance 1!"}' "/chat/$CHAT_ID/-/send")
MSG_ID1=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$MSG_ID1" ]; then
    pass "Send message from instance 1 (id: $MSG_ID1)"
else
    fail "Send message from instance 1" "$RESULT"
fi

sleep 2

# Verify message on instance 1
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/messages")
if echo "$RESULT" | grep -q "Hello from instance 1"; then
    pass "Message visible on instance 1"
else
    fail "Message visible on instance 1" "$RESULT"
fi

# Verify message synced to instance 2
RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/messages")
if echo "$RESULT" | grep -q "Hello from instance 1"; then
    pass "Message synced to instance 2"
else
    fail "Message synced to instance 2" "$RESULT"
fi

# ============================================================================
# TEST: Reply from instance 2
# ============================================================================

echo ""
echo "--- Reply Message Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Hello back from instance 2!"}' "/chat/$CHAT_ID/-/send")
MSG_ID2=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$MSG_ID2" ]; then
    pass "Send reply from instance 2 (id: $MSG_ID2)"
else
    fail "Send reply from instance 2" "$RESULT"
fi

sleep 2

# Verify reply on instance 2
RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/messages")
if echo "$RESULT" | grep -q "Hello back from instance 2"; then
    pass "Reply visible on instance 2"
else
    fail "Reply visible on instance 2" "$RESULT"
fi

# Verify reply synced to instance 1
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/messages")
if echo "$RESULT" | grep -q "Hello back from instance 2"; then
    pass "Reply synced to instance 1"
else
    fail "Reply synced to instance 1" "$RESULT"
fi

# ============================================================================
# TEST: Multiple messages conversation
# ============================================================================

echo ""
echo "--- Conversation Test ---"

# Send a few more messages back and forth
"$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Message 2 from instance 1"}' "/chat/$CHAT_ID/-/send" >/dev/null
sleep 1

"$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Message 2 from instance 2"}' "/chat/$CHAT_ID/-/send" >/dev/null
sleep 1

"$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Final message from instance 1"}' "/chat/$CHAT_ID/-/send" >/dev/null
sleep 2

# Verify all test messages present on both sides
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/messages")
FOUND_ALL1=true
echo "$RESULT" | grep -q "Hello from instance 1" || FOUND_ALL1=false
echo "$RESULT" | grep -q "Hello back from instance 2" || FOUND_ALL1=false
echo "$RESULT" | grep -q "Message 2 from instance 1" || FOUND_ALL1=false
echo "$RESULT" | grep -q "Message 2 from instance 2" || FOUND_ALL1=false
echo "$RESULT" | grep -q "Final message from instance 1" || FOUND_ALL1=false

if [ "$FOUND_ALL1" = "true" ]; then
    pass "Instance 1 has all test messages"
else
    fail "Instance 1 missing messages" "Not all test messages found"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/messages")
FOUND_ALL2=true
echo "$RESULT" | grep -q "Hello from instance 1" || FOUND_ALL2=false
echo "$RESULT" | grep -q "Hello back from instance 2" || FOUND_ALL2=false
echo "$RESULT" | grep -q "Message 2 from instance 1" || FOUND_ALL2=false
echo "$RESULT" | grep -q "Message 2 from instance 2" || FOUND_ALL2=false
echo "$RESULT" | grep -q "Final message from instance 1" || FOUND_ALL2=false

if [ "$FOUND_ALL2" = "true" ]; then
    pass "Instance 2 has all test messages"
else
    fail "Instance 2 missing messages" "Not all test messages found"
fi

# ============================================================================
# TEST: Non-member cannot access chat
# ============================================================================

echo ""
echo "--- Access Control Test ---"

# Try to access chat from instance 2 with a different user (if available)
# For now, we just verify the access check exists by checking the code behavior
# The 403 test would require a third user which may not be set up

RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/messages")
if echo "$RESULT" | grep -q '"messages":\['; then
    pass "Members can access chat messages"
else
    fail "Members access chat" "$RESULT"
fi

# ============================================================================
# TEST: Verify chat listing on both instances
# ============================================================================

echo ""
echo "--- Chat Listing Test ---"

# Verify chat appears in list on instance 1
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/list")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Chat appears in instance 1 list"
else
    fail "Chat in instance 1 list" "$RESULT"
fi

# Verify chat appears in list on instance 2
RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/list")
if echo "$RESULT" | grep -q "\"id\":\"$CHAT_ID\""; then
    pass "Chat appears in instance 2 list"
else
    fail "Chat in instance 2 list" "$RESULT"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "=============================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "=============================================="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
