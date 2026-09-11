#!/usr/bin/env python3
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Chat status/tombstone test against live dev instance 2: event_new,
# event_message, event_leave and tombstone reactivation, asserting on chat.db
# state. A is the instance's admin and B its user (as get-token.sh picks them),
# both driven through port 8082; their accounts and identities are resolved
# from their sessions.
import json, os, subprocess, sqlite3, sys, time, urllib.request

SCRIPTS = "/home/alistair/mochi/claude/scripts"
BASE = "http://localhost:8082"
DATA = "/home/alistair/var/lib/mochi2"

passed = failed = 0
def check(ok, name, detail=""):
    global passed, failed
    if ok: passed += 1; print(f"[PASS] {name}")
    else:  failed += 1; print(f"[FAIL] {name}: {detail}")

def session(role):
    return subprocess.check_output([f"{SCRIPTS}/get-token.sh", role, "2"]).decode().strip()

def account(s):
    # The account a session belongs to names its per-user data directory.
    c = sqlite3.connect(f"file:{DATA}/db/sessions.db?mode=ro", uri=True)
    try: return c.execute("select user from sessions where code=?", (s,)).fetchone()[0]
    finally: c.close()

def identity(s):
    req = urllib.request.Request(f"{BASE}/_/identity", headers={"Cookie": f"session={s}"})
    return json.load(urllib.request.urlopen(req))["identity"]["id"]

def jwt(s, app="chat"):
    req = urllib.request.Request(f"{BASE}/_/token", data=json.dumps({"app": app}).encode(),
                                 headers={"Content-Type": "application/json", "Cookie": f"session={s}"})
    return json.load(urllib.request.urlopen(req))["token"]

A_SESSION, B_SESSION = session("admin"), session("user")
A_ID, B_ID = identity(A_SESSION), identity(B_SESSION)
A_DB = f"{DATA}/users/{account(A_SESSION)}/chat/db/chat.db"
B_DB = f"{DATA}/users/{account(B_SESSION)}/chat/db/chat.db"
A_JWT, B_JWT = jwt(A_SESSION), jwt(B_SESSION)

def request(tok, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        try: return json.load(e)
        except Exception: return {"_http": e.code}

def call(role, method, path, body=None):
    return request(A_JWT if role == "admin" else B_JWT, method, path, body)

# B accepts new chats only from friends. Befriending is a no-op when A and B
# already are: the invite and the accept are refused and nothing changes.
request(jwt(A_SESSION, "people"), "POST", "/people/-/friends/create", {"id": B_ID, "name": "Chat test B"})
time.sleep(1)
request(jwt(B_SESSION, "people"), "POST", "/people/-/friends/accept", {"id": A_ID})
time.sleep(1)

def db(path, q, args=()):
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try: return c.execute(q, args).fetchall()
    finally: c.close()

def chat_status(path, cid):
    r = db(path, "select status from chats where id=?", (cid,))
    return r[0][0] if r else None
def is_member(path, cid, ident):
    return bool(db(path, "select 1 from members where chat=? and member=?", (cid, ident)))

def wipe(role, path, other):
    # Leave+delete every chat this side shares with the other test account, so
    # action_create can't dedup onto a stale 1-on-1 and event_new lands fresh.
    # Chats with anyone else are left alone.
    if not os.path.exists(path): return
    for (cid,) in db(path, "select distinct chat from members where member=?", (other,)):
        call(role, "POST", f"/chat/{cid}/-/leave", {"delete": True})
        call(role, "POST", f"/chat/{cid}/-/delete", {})

print("=== T0: clean slate (both sides leave+delete the chats they share) ===")
wipe("admin", A_DB, B_ID); wipe("user", B_DB, A_ID); time.sleep(2)

print("=== T1: create + cross-host receive (event_new, status=active) ===")
r = call("admin", "POST", "/chat/-/create", {"name": "Status Test", "members": B_ID})
C = r.get("data", {}).get("id")
check(bool(C), "A creates chat", r)
time.sleep(2)
check(chat_status(A_DB, C) == "active", "A: chat active", chat_status(A_DB, C))
check(chat_status(B_DB, C) == "active", "B: chat received as active (event_new)", chat_status(B_DB, C))
check(is_member(B_DB, C, A_ID), "B roster has A")
check(is_member(A_DB, C, B_ID), "A roster has B")

print("=== T2: message ingestion on an active chat (event_message) ===")
call("admin", "POST", f"/chat/{C}/-/send", {"body": "hello-from-A"})
time.sleep(2)
msgs = db(B_DB, "select body from messages where chat=?", (C,))
check(any("hello-from-A" in m[0] for m in msgs), "B ingested A's message", msgs)

print("=== T3: B leaves -> status=left, A prunes B (event_leave) ===")
call("user", "POST", f"/chat/{C}/-/leave", {"delete": False})
time.sleep(2)
check(chat_status(B_DB, C) == "left", "B: status=left", chat_status(B_DB, C))
check(not is_member(A_DB, C, B_ID), "A: B pruned from roster (event_leave)")
check(chat_status(A_DB, C) == "active", "A: chat still active")
# B can no longer send (not a member of own active chat)
r = call("user", "POST", f"/chat/{C}/-/send", {"body": "should-fail"})
check("error" in r or r.get("_http") in (403, 400), "B: send blocked on left chat", r)

print("=== T4: A re-adds B -> tombstone reactivates (event_new reactivation) ===")
call("admin", "POST", f"/chat/{C}/-/member/add", {"member": B_ID})
time.sleep(2)
check(chat_status(B_DB, C) == "active", "B: left tombstone reactivated to active", chat_status(B_DB, C))
check(is_member(A_DB, C, B_ID), "A: B back in roster")
# B can send again
r = call("user", "POST", f"/chat/{C}/-/send", {"body": "back-again-from-B"})
time.sleep(2)
msgs = db(A_DB, "select body from messages where chat=?", (C,))
check(any("back-again-from-B" in m[0] for m in msgs), "A ingests B's post-reactivation message", msgs)

print("=== T5: B leaves then deletes -> hidden 'deleted' tombstone, gone from list ===")
call("user", "POST", f"/chat/{C}/-/leave", {"delete": False})
time.sleep(1)
call("user", "POST", f"/chat/{C}/-/delete", {})
time.sleep(1)
check(chat_status(B_DB, C) == "deleted", "B: deleted tombstone kept (not row-removed)", chat_status(B_DB, C))
lst = call("user", "GET", "/chat/-/list").get("data", [])
check(not any(c.get("id") == C for c in lst), "B: deleted chat hidden from list")
# tombstone retains no members/messages
check(not db(B_DB, "select 1 from members where chat=?", (C,)), "B: members purged on delete")

print("=== T6: stale-roster drop -> leave-back, no resurrection (event_message) ===")
# Fresh active chat
C2 = call("admin", "POST", "/chat/-/create", {"name": "LeaveBack Test", "members": B_ID}).get("data", {}).get("id")
time.sleep(2)
check(chat_status(B_DB, C2) == "active" and is_member(A_DB, C2, B_ID), "T6 setup: C2 active on both")
# Simulate a LOST leave: B locally deleted the chat (deleted tombstone, members
# purged) but the leave never reached A, so A still lists B. Inject that state
# directly into B's chat.db (the one condition clean API flows can't produce,
# since a real leave always prunes A).
w = sqlite3.connect(B_DB, timeout=10)
w.execute("update chats set status='deleted' where id=?", (C2,))
w.execute("delete from members where chat=?", (C2,))
w.commit(); w.close()
check(chat_status(B_DB, C2) == "deleted", "T6 setup: B injected to deleted tombstone")
# A (still listing B) sends -> fans to B -> B sees a non-active chat ->
# leave-back to A, drop. B must NOT resurrect; A must prune B.
call("admin", "POST", f"/chat/{C2}/-/send", {"body": "ping-the-ghost"})
time.sleep(3)
check(chat_status(B_DB, C2) == "deleted", "B: NOT resurrected (still deleted)", chat_status(B_DB, C2))
check(not db(B_DB, "select 1 from messages where chat=? and body='ping-the-ghost'", (C2,)), "B: ghost message not ingested")
check(not is_member(A_DB, C2, B_ID), "A: B pruned via leave-back")

# Clean up: A still holds both chats, with B pruned from each.
for cid in (C, C2):
    if cid:
        call("admin", "POST", f"/chat/{cid}/-/leave", {"delete": True})
        call("admin", "POST", f"/chat/{cid}/-/delete", {})

print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(1 if failed else 0)
