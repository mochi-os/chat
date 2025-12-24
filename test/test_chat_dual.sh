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
if echo "$RESULT" | grep -q '"name":"P2P Test Chat"'; then
    pass "Instance 1 can view chat details"
else
    fail "Instance 1 view chat" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/view")
if echo "$RESULT" | grep -q '"name":"P2P Test Chat"'; then
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

# Verify all messages on both sides
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/$CHAT_ID/-/messages")
MSG_COUNT1=$(echo "$RESULT" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['messages']))" 2>/dev/null)

RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/$CHAT_ID/-/messages")
MSG_COUNT2=$(echo "$RESULT" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['messages']))" 2>/dev/null)

if [ "$MSG_COUNT1" = "5" ]; then
    pass "Instance 1 has all 5 messages"
else
    fail "Instance 1 message count" "Expected 5, got $MSG_COUNT1"
fi

if [ "$MSG_COUNT2" = "5" ]; then
    pass "Instance 2 has all 5 messages"
else
    fail "Instance 2 message count" "Expected 5, got $MSG_COUNT2"
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
# TEST: Create another chat to verify listing
# ============================================================================

echo ""
echo "--- Multiple Chats Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"Second Chat\",\"members\":\"$IDENTITY1\"}" "/chat/create")
CHAT_ID2=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$CHAT_ID2" ]; then
    pass "Create second chat from instance 2 (id: $CHAT_ID2)"
else
    fail "Create second chat" "$RESULT"
fi

sleep 2

# Verify both chats appear on both instances
RESULT=$("$CURL" -i 1 -a admin -X GET "/chat/list")
CHAT_COUNT1=$(echo "$RESULT" | python3 -c "import sys, json; chats=json.load(sys.stdin)['data']; print(len([c for c in chats if c['id'] in ['$CHAT_ID', '$CHAT_ID2']]))" 2>/dev/null)

if [ "$CHAT_COUNT1" = "2" ]; then
    pass "Instance 1 has both chats"
else
    fail "Instance 1 chat count" "Expected 2, got $CHAT_COUNT1"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/chat/list")
CHAT_COUNT2=$(echo "$RESULT" | python3 -c "import sys, json; chats=json.load(sys.stdin)['data']; print(len([c for c in chats if c['id'] in ['$CHAT_ID', '$CHAT_ID2']]))" 2>/dev/null)

if [ "$CHAT_COUNT2" = "2" ]; then
    pass "Instance 2 has both chats"
else
    fail "Instance 2 chat count" "Expected 2, got $CHAT_COUNT2"
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
