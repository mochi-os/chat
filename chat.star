# Mochi Chat app
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

def notify(topic, object="", title="", body="", url="", name="", event_id=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), name, "", None, event_id)

# Broadcast a chat event to `subscribers` through core's durable broadcast log,
# keyed on the chat id. Chat has no owner entity, so `from_id` is the
# broadcasting member and callers resolve the roster. Single-recipient bootstrap
# events (`new`, `removed`) use mochi.message.send - there is no stream to
# sequence against.
def broadcast_chat(chat_id, from_id, subscribers, event, data, exclude=None):
	# A member on another network is reached through the conversation's
	# account, never over P2P, or through the member whose server relays them
	# (phase 24).
	reached = []
	for s in subscribers or []:
		if mochi.text.valid(s, "entity"):
			reached.append(s)
			continue
		row = mochi.db.row("select relay from members where chat=? and member=?", chat_id, s)
		if row and row["relay"] and row["relay"] != from_id:
			reached.append(row["relay"])
	subscribers = []
	for s in reached:
		if s not in subscribers:
			subscribers.append(s)
	if not subscribers:
		return 0
	return mochi.broadcast.send(from_id, chat_id, subscribers, "chat", event, data, exclude or "")

# Tell a peer whose roster still lists us to drop us: the same `leave` a
# departing member sends, so the receiver deletes only (chat, us) and can never
# prune another member's row.
def chat_leave_back(chat_id, me, peer):
	mochi.message.send({"from": me, "to": peer, "service": "chat", "event": "leave"}, {"id": chat_id, "member": me})

# Core calls this when a fan-out stayed undeliverable past the queue max age.
# Zero locations means the member's host is gone for good: prune them from every
# local roster, the case leave-back (which needs a live host) cannot cover.
def error_message_timeout(e):
	if e.detail.get("locations", 1) != 0:
		return
	member = e.entity
	affected = mochi.db.rows("select distinct chat from members where member=?", member)
	for row in affected:
		mochi.db.execute("delete from members where chat=? and member=?", row["chat"], member)
		# As in event_leave: dropping them from the roster stops deliveries, not
		# replay of this host's stream.
		mochi.broadcast.subscriber.remove(row["chat"], member)
	for r in affected:
		row = mochi.db.row("select key from chats where id=?", r["chat"])
		if row:
			chat_websocket(row["key"], {"event": "member/remove", "member": member})

# Live-update pushes. Only messages and deletions commits route through
# chat_commit_hook; chats/members updates (rename, kick, leave) stay on direct
# writes because the hook cannot tell them apart from the row state.
# chat_websocket skips an empty key: older shared chats carry key='' and core
# rejects it, which would fail the whole commit hook or action.
def chat_websocket(key, payload):
	if key:
		mochi.websocket.write(key, payload)

def chat_commit_hook(table, kind, row_uid):
	if not row_uid:
		return
	# A messages row update is an own-message edit (local action or
	# received event), or an encrypted message whose keys came: push the new
	# body so open tabs replace it in place.
	if table == "messages" and kind == "update":
		message = mochi.db.row("select * from messages where id=?", row_uid)
		if not message:
			return
		chat = mochi.db.row("select key from chats where id=?", message["chat"])
		if not chat:
			return
		# An encrypted message never edited is one whose keys came, with its
		# files perhaps: open tabs read it again.
		if message.get("encrypted") and not message.get("edited"):
			chat_websocket(chat["key"], {"event": "decrypted", "message": row_uid})
			return
		chat_websocket(chat["key"], {"event": "edit", "message": row_uid, "body": message["body"], "edited": message.get("edited", 0)})
		return
	if kind != "insert":
		return
	# A deletions row commit (local delete or replicated apply) tells every
	# host's open tabs to replace the message with a "deleted" placeholder.
	if table == "deletions":
		deletion = mochi.db.row("select * from deletions where message=?", row_uid)
		if not deletion:
			return
		chat = mochi.db.row("select key from chats where id=?", deletion["chat"])
		if not chat:
			return
		chat_websocket(chat["key"], {"event": "delete", "message": deletion["message"]})
		return
	# A reactions row commit recomputes that message's authoritative counts
	# and pushes them to every member's tabs. row_uid is the message id
	# (passed by message_reaction_apply); clients keep their own reaction
	# and reconcile counts from this payload.
	if table == "reactions":
		message = mochi.db.row("select chat from messages where id=?", row_uid)
		if not message:
			return
		chat = mochi.db.row("select key from chats where id=?", message["chat"])
		if not chat:
			return
		chat_websocket(chat["key"], {"event": "reaction", "message": row_uid, "reactions": message_reaction_counts(message["chat"], row_uid)})
		return
	if table != "messages":
		return
	message = mochi.db.row("select * from messages where id=?", row_uid)
	if not message:
		return
	chat = mochi.db.row("select key from chats where id=?", message["chat"])
	if not chat:
		return
	attachments = attachment_list("chat/" + message["chat"] + "/" + message["id"], message["chat"])
	chat_websocket(chat["key"], {
		"id": message["id"],
		"created": message["created"],
		"member": message["member"],
		"name": message["name"],
		"body": message["body"],
		"reply": message.get("reply"),
		"edited": message.get("edited", 0),
		"attachments": attachments,
		"quote": message_quote_of(message),
		"thread": message.get("thread", ""),
	})

# --- Quotes -----------------------------------------------------------------
#
# A message's first link to a post on another network is quoted (the
# federation plan, phase 13): the server reads the post when the message is
# sent and keeps what the card shows with the message, as JSON in its quote
# column, so every member and every host sees the same quote.

# What a quote keeps of a post's text.
QUOTE_TEXT = 2000

def quote_link(body):
	"""The first web link in a message, which may be a post on another network."""
	for token in body.split():
		for prefix in ("https://", "http://"):
			at = token.find(prefix)
			if at >= 0:
				link = token[at:].rstrip(".,;:!?)]}>'\"")
				if "." in link[len(prefix):]:
					return link
	return None

def message_quote(body):
	"""The post on another network a message's first link names, or None."""
	link = quote_link(body)
	if not link:
		return None
	return quote_clean(mochi.url.quote(link))

def quote_web_link(value):
	"""A link kept only as a web one: a quote arrives from another server."""
	link = str(value or "")
	return link[:2048] if link.startswith("https://") or link.startswith("http://") else ""

def quote_clean(quote):
	"""A quote as it is kept and sent: known fields only, links web ones, the
	text cut; None where it is not a quote of a post."""
	if type(quote) != "dict":
		return None
	url = quote_web_link(quote.get("url"))
	text = str(quote.get("text", "") or "")[:QUOTE_TEXT]
	image = quote_web_link(quote.get("image"))
	if not url or not text and not image:
		return None
	created = quote.get("created", 0)
	clean = {
		"network": str(quote.get("network", "") or "")[:50],
		"url": url,
		"id": str(quote.get("id", "") or "")[:2048],
		"text": text,
		"image": image,
		"created": created if type(created) == "int" else 0,
	}
	author = quote.get("author")
	if type(author) == "dict":
		clean["author"] = {
			"id": str(author.get("id", "") or "")[:2048],
			"name": str(author.get("name", "") or "")[:200],
			"address": str(author.get("address", "") or "")[:300],
			"avatar": quote_web_link(author.get("avatar")),
			"url": quote_web_link(author.get("url")),
		}
	return clean

def message_quote_of(message):
	"""A stored message's quote, decoded for the client, or None."""
	raw = message.get("quote", "") if message else ""
	return json.decode(raw, None) if raw else None

# Lazy hook registration; the call to mochi.db.commit.hook needs a
# user/app context that's only present during a real request, not at
# module load. Re-registering on every call is a plain assignment on
# the AppVersion struct - cheap and idempotent at the framework level.
def chat_ensure_commit_hook():
	mochi.db.commit.hook("chat_commit_hook")

# Create database
def database_create():
	mochi.db.execute("create table if not exists chats ( id text not null primary key, name text not null, key text not null, updated integer not null, status text not null default 'active', synced integer not null default 0 )")
	mochi.db.execute("create index if not exists chats_updated on chats( updated )")

	mochi.db.execute("create table if not exists members ( chat references chats( id ), member text not null, name text not null default '', primary key ( chat, member ) )")
	mochi.db.execute("create index if not exists members_member on members( member )")

	mochi.db.execute("create table if not exists messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null, reply text references messages( id ), edited integer not null default 0, quote text not null default '' )")
	mochi.db.execute("create index if not exists messages_chat_created on messages( chat, created )")

	# Per-chat read watermark for the local account (read tracking / unread
	# badge). Local-only, not replicated — a per-device cursor.
	mochi.db.execute("create table if not exists chat_read ( chat text not null primary key references chats( id ), last_read integer not null default 0 )")

	# One reaction per member per message; counts are derived at read time
	# (count(*) group by reaction), never stored, so they converge under
	# multi-host without counter arithmetic.
	mochi.db.execute("create table if not exists reactions ( chat text not null, message text not null, member text not null, name text not null, reaction text not null, primary key ( chat, message, member ) )")

	# Append-only tombstones for "delete for everyone": a message is deleted iff a
	# row exists here. The body is blanked too, but the row is what survives an
	# out-of-order replay of the original (event_message checks it before storing).
	mochi.db.execute("create table if not exists deletions ( chat text not null, message text not null primary key, member text not null, created integer not null )")
	mochi.db.execute("create index if not exists deletions_chat on deletions( chat )")

	# Attachments now live in this database, owned by the shared library.
	attachment_schema_create()
	chat_schema_federation()
	chat_schema_linked()
	chat_schema_matrix()
	chat_schema_xmpp()
	chat_schema_encryption()

def database_upgrade(version):
	if version == 2:
		# Own-message editing: last-edit timestamp, 0 = never edited.
		# Idempotent via the column check.
		columns = [c["name"] for c in mochi.db.table("messages")]
		if "edited" not in columns:
			mochi.db.execute("alter table messages add column edited integer not null default 0")
	if version == 3 or version == 4:
		# Drop the broadcast tables left behind when broadcast state moved to the
		# per-app system DB. Version 4 re-issues version 3; idempotent.
		for table in ["sequence", "log", "acknowledged", "received"]:
			mochi.db.execute("drop table if exists " + table)
	if version == 10:
		# The post on another network a message's first link quotes, kept as
		# JSON with the message (the federation plan, phase 13).
		if not any([c["name"] == "quote" for c in mochi.db.table("messages")]):
			mochi.db.execute("alter table messages add column quote text not null default ''")
	if version == 11:
		# Threads, receipts and conversations on another network's account
		# (the federation plan, phase 22).
		chat_schema_federation()
	if version == 12:
		# Conversations on linked accounts: rooms, encryption, a message's
		# further ids and other networks' presence (the federation plan,
		# phase 23).
		chat_schema_linked()
	if version == 13:
		# A reaction's id on Matrix, and the members a group's relaying
		# member carries from Matrix (the federation plan, phase 24).
		chat_schema_matrix()
	if version == 14:
		# A hosted XMPP account's archive and rooms (the federation plan,
		# phase 26).
		chat_schema_xmpp()
	if version == 15:
		# What a file sent to an encrypted XMPP conversation went as (the
		# federation plan, phase 27).
		chat_schema_encryption()
	if version == 5 or version == 6 or version == 7:
		# Attachments move into this database, owned by the shared library: create the
		# table and copy rows out of core's store (bridge or export file). Versions 6
		# and 7 re-issue the step; idempotent.
		attachment_schema_create()
		attachment_migrate()
	if version == 8:
		# (chat, message) is a prefix of the reactions primary key, so the index
		# served no query and cost a second write per reaction.
		mochi.db.execute("drop index if exists reactions_message")
	if version == 9:
		# The quoted message is the wire key `reply`; the rows go out as read,
		# so the column carries that name. Idempotent via the column check.
		if "reply_to" in [c["name"] for c in mochi.db.table("messages")]:
			mochi.db.execute("alter table messages rename column reply_to to reply")

# Writes need membership plus an active chat; reads of a left/removed chat's
# history check membership OR status instead. The status test is what stops a
# removed member (event_removed keeps their row). One label for both refusals.
# chat_active also gates peer events: a departed chat still holds the other
# members' rows, so a stale-roster peer could otherwise rename it or change its
# membership.
def chat_active(chat):
	return chat and chat["status"] == "active"

# The live one-on-one chat between two members, or None. Active only: a chat we
# were removed from keeps both members rows, and matching it would hand back a
# tombstone that refuses writes. Newest first, since skipping tombstones allows
# a second chat for the same pair.
def chat_direct(first, second):
	rows = mochi.db.rows("""
		select c.id, c.name
		from chats c
		join members m1 on c.id = m1.chat
		join members m2 on c.id = m2.chat
		where m1.member = ? and m2.member = ? and c.status = 'active'
		group by c.id
		having (select count(*) from members where chat = c.id) = 2
		order by c.updated desc
	""", first, second)
	return rows[0] if rows else None

def chat_write_allowed(a, chat):
	failure = chat_write_check(chat, a.user.identity.id)
	if failure:
		fail(a, failure)
		return False
	return True

def chat_write_check(chat, user_id):
	"""Why the user may not write to a conversation, or None."""
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], user_id):
		return (403, "errors.not_a_member_of_this_chat")
	if chat["status"] != "active":
		return (403, "errors.not_a_member_of_this_chat")
	return None

# fail answers a helper's refusal, (status, label[, arguments]), as an
# action's error.
def fail(a, failure):
	if len(failure) > 2:
		a.error.label(failure[0], failure[1], **failure[2])
	else:
		a.error.label(failure[0], failure[1])

def stream_asset(a, entity_id, service, asset):
	if not entity_id:
		a.error.label(404, "errors.asset_unavailable", asset=asset)
		return None
	# Reject a malformed id before opening a stream: mochi.remote.stream errors
	# out on an invalid entity, which aborts the whole action as a 500. The
	# user-asset routes pass a caller-supplied id here. Mirrors crm.
	if not mochi.text.valid(entity_id, "entity") and not mochi.text.valid(entity_id, "fingerprint"):
		a.error.label(404, "errors.asset_unavailable", asset=asset)
		return None
	s = mochi.remote.stream(entity_id, service, asset, {})
	if not s:
		a.error.label(404, "errors.asset_unavailable", asset=asset)
		return None
	header = s.read()
	if not header or header.get("status") != "200":
		a.error.label(404, "errors.asset_not_set", asset=asset)
		return None
	a.header("Cache-Control", "private, max-age=300")
	if "data" in header:
		return {"data": header["data"]}
	a.header("Content-Type", header.get("content_type", "application/octet-stream"))
	# Per-slot byte caps matching what the people app accepts on upload; the route
	# is public, so an uncapped stream could run indefinitely. Unknown slots fall
	# back to the largest cap.
	caps = {"avatar": 2 * 1024 * 1024, "banner": 10 * 1024 * 1024, "favicon": 64 * 1024}
	a.write.stream(s, maximum=caps.get(asset, 10 * 1024 * 1024))
	return None

# Only what the message list renders. The people service offers banner,
# favicon and information too, but proxying those here would widen what a
# chat URL discloses about its participants for no caller that wants them.
_PERSON_ASSETS = ("avatar", "style")

# Proxy a message sender's person asset. Not public: the caller must be able to
# read the chat, so a leaked URL cannot confirm a message exists. The web client
# appends the app token (authenticatedUrl) since cookies do not survive the
# shell's sandboxed iframe.
def action_message_asset(a):
	asset = a.input("asset")
	if asset not in _PERSON_ASSETS:
		a.error.label(404, "errors.unknown_asset")
		return

	chat = mochi.db.row("select status from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	# Same rule action_messages applies: a member, or a chat we left but can
	# still read back. Gated on a.user so an unauthenticated caller is refused
	# rather than resolved to some other user.
	user = a.user.identity.id if a.user and a.user.identity else None
	if not user:
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", a.input("chat"), user) and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	# Bind the message to the route chat so this can't be used to resolve a
	# message (and its author) in a chat the URL doesn't name.
	row = mochi.db.row("select member from messages where id=? and chat=?", a.input("message"), a.input("chat"))
	return stream_asset(a, row["member"] if row else "", "people", asset)

# Serves a person's avatar or style through THIS app, so the SPA never fetches
# /people/<id>/-/avatar itself. A cross-app image request carries Origin: null
# and no cookies inside the shell's sandboxed iframe, and the people route is
# public - so with no locally-known entity core resolves the owner to the first
# administrator, and the ADMIN's account performs the outbound stream for every
# avatar every chat user renders.
#
# The gate is what chat legitimately knows about a person: we share a chat with
# them, or they are a friend. Both are cheap and neither leaks a person the
# caller could not already name.
def action_person_asset(a):
	asset = a.input("asset")
	if asset not in _PERSON_ASSETS:
		a.error.label(404, "errors.unknown_asset")
		return

	person = a.input("person")
	user = a.user.identity.id if a.user and a.user.identity else None
	if not user:
		a.error.label(403, "errors.asset_unavailable", asset=asset)
		return

	shared = mochi.db.exists(
		"select 1 from members m1 join members m2 on m1.chat=m2.chat where m1.member=? and m2.member=?",
		user, person)
	if not shared and not mochi.service.call("friends", "get", user, person):
		a.error.label(403, "errors.asset_unavailable", asset=asset)
		return

	return stream_asset(a, person, "people", asset)

# Whom may start a chat with this user: friends only (default) or anyone.
_VALID_CHAT_POLICIES = ("friends", "anyone")

# Most members one chat may hold, including the creator. Enforced on every path
# that grows a roster: action_create, action_member_add, event_new,
# event_member_add.
_MEMBERS_MAXIMUM = 1000

# Chat ids bound into one "in (...)" when resolving the counterpart of each
# two-member chat. Well under any SQLite variable limit, and large enough that
# a normal account resolves its whole list in a single query.
_LIST_BATCH = 500

# Seconds between resync attempts per chat. Each call is a blocking remote
# request at a peer of the caller's choosing; the manual window is short enough
# to be invisible to a person but still stops a scripted loop.
_RESYNC_AUTOMATIC = 60
_RESYNC_MANUAL = 5

# Bounds on non-friend probing in one create: a count and a time budget. An
# unreachable member costs seconds, so the time budget is the real protection;
# friends are never probed.
_PROBES_MAXIMUM = 100
_PROBES_BUDGET = 45

# Most attachments one forward may copy. Messages are already capped at 100 per
# forward; this bounds the per-attachment work that cap does not.
_FORWARD_ATTACHMENTS_MAXIMUM = 100

# Preferences: the incoming chat policy, and the three sharing switches -
# presence and last seen, read receipts, typing - each on until turned off
# (the federation plan, phase 22).
def action_preferences_get(a):
	data = {"policy": a.user.preference.get("chat_policy") or "friends"}
	for name in SWITCHES:
		data[name] = chat_switch(a.user.preference, name)
	return {"data": data}

def action_preferences_set(a):
	policy = a.input("policy")
	if policy != None:
		policy = policy.strip()
		if policy not in _VALID_CHAT_POLICIES:
			a.error.label(400, "errors.invalid_chat_policy")
			return
	switches = {}
	for name in SWITCHES:
		value = a.input(name)
		if value == None:
			continue
		if value not in ("true", "false", "1", "0"):
			a.error.label(400, "errors.invalid_preference")
			return
		switches[name] = "1" if value in ("true", "1") else "0"
	if policy != None:
		a.user.preference.set("chat_policy", policy)
	shared = chat_switch(a.user.preference, "presence")
	for name in switches:
		a.user.preference.set("chat_" + name, switches[name])
	# The linked accounts show the user's presence as the switch now says.
	if "presence" in switches and (switches["presence"] != "0") != shared:
		linked_presence_share(a.user, switches["presence"] != "0")
	return {"data": {}}

# Search the directory for person entities, for the new-chat picker: with
# chat_policy a non-friend may be addressed too (the accept/query probe at
# create decides whether they allow it). Matches by name, entity id, or
# fingerprint - the same forms the people app's search accepts.
def action_person_search(a):
	search = a.input("search", "").strip()
	if not search or len(search) > 200:
		return {"data": {"results": []}}
	results = []
	if mochi.text.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			results.append(entry)
	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		for entry in mochi.directory.search("person", "", False, fingerprint=fingerprint):
			if not [r for r in results if r.get("id") == entry.get("id")]:
				results.append(entry)
	for entry in mochi.directory.search("person", search, False):
		if not [r for r in results if r.get("id") == entry.get("id")]:
			results.append(entry)
	found = [{"id": r.get("id"), "name": r.get("name"), "fingerprint": r.get("fingerprint", "")} for r in results[:20]]
	return {"data": {"results": found}}

# May `user` start a chat with `member`? Friends always may; a non-friend's own
# server answers from their chat_policy (accept/query), so create fails loudly
# instead of event_new dropping it silently (#206). Returns {"name": ...} or
# {"error": label}.
def chat_member_allowed(user, member_id):
	friend = mochi.service.call("friends", "get", user, member_id)
	if friend:
		# No network cost, so callers metering probes don't count this one.
		return {"name": friend["name"], "probed": False}
	response = mochi.remote.request(member_id, "chat", "accept/query", {})
	# A transport failure is not a refusal: mochi.remote.request reports
	# it as {"error": ..., "code": ...}, never None, so an "error" key
	# means the member's server could not be reached or did not answer -
	# distinct from an explicit {"accept": False} policy refusal.
	if response == None or response.get("error"):
		return {"error": "errors.member_unreachable"}
	answered = response.get("name", "")
	if response.get("accept") and type(answered) == "string" and mochi.text.valid(answered, "display"):
		return {"name": answered, "probed": True}
	return {"error": "errors.does_not_accept_chats"}

# Create new chat
def action_create(a):
	name = a.input("name")
	# A conversation on one of the user's accounts on another network, with
	# people there by their addresses (phase 22).
	account = a.input("account", "") or ""
	if account:
		addresses = [x.strip() for x in (a.input("members") or "").split(",") if x.strip()]
		acc = [x for x in chat_accounts() if x["id"] == account]
		if acc and acc[0]["network"] != "fediverse":
			return chat_create_linked(a, acc[0], name or "", addresses)
		return chat_create_remote(a, account, name or "", addresses)
	if not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_chat_name")
		return

	# Build prospective member list
	prospective_members = [{"id": a.user.identity.id, "name": a.user.identity.name}]
	
	# Deduplicate and cap the requested ids before probing: each id costs a round
	# trip and a delivery, and a repeated id breaks the one-on-one detection below
	# (len == 2).
	member_ids = []
	members_str = a.input("members")
	if members_str:
		for member_id in members_str.split(","):
			if member_id == a.user.identity.id:
				continue
			if not mochi.text.valid(member_id, "entity"):
				a.error.label(400, "errors.invalid_member_id")
				return
			if member_id not in member_ids:
				member_ids.append(member_id)

	if len(member_ids) + 1 > _MEMBERS_MAXIMUM:
		a.error.label(400, "errors.too_many_members", maximum=_MEMBERS_MAXIMUM)
		return

	# Bound probing by count AND elapsed time: an unreachable stranger blocks up to
	# remote_address_wait (5s in core), so a run of them would exhaust the
	# request's compute limit mid-loop. Friends resolve locally and cost nothing.
	probes = 0
	started = mochi.time.now()
	for member_id in member_ids:
		if probes >= _PROBES_MAXIMUM or (probes and mochi.time.now() - started >= _PROBES_BUDGET):
			a.error.label(400, "errors.too_many_to_check", maximum=_PROBES_MAXIMUM)
			return

		# Friends may always be added; a non-friend only if their
		# chat_policy allows (verified by probing their server), so the
		# creation fails loudly here instead of the recipient's
		# event_new dropping it silently (#206).
		member = chat_member_allowed(a.user.identity.id, member_id)
		if member.get("error"):
			a.error.label(400, member["error"])
			return
		if member.get("probed"):
			probes += 1

		prospective_members.append({"id": member_id, "name": member["name"]})

	# Check for existing 1-on-1 chat
	if len(prospective_members) == 2:
		other_member = prospective_members[1]
		existing_chat = chat_direct(a.user.identity.id, other_member["id"])
		if existing_chat:
			return {
				"data": {"id": existing_chat["id"], "name": existing_chat["name"], "members": prospective_members}
			}

	chat = mochi.uid()
	mochi.db.execute("replace into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())
	
	for member in prospective_members:
		mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? ) on conflict ( chat, member ) do update set name=excluded.name", chat, member["id"], member["name"])
		if member["id"] != a.user.identity.id:
			chat_name_for_member = name
			if len(prospective_members) == 2:
				chat_name_for_member = a.user.identity.name
			mochi.message.send({"from": a.user.identity.id, "to": member["id"], "service": "chat", "event": "new"}, {"id": chat, "name": chat_name_for_member}, prospective_members)

	return {
		"data": {"id": chat, "name": name, "members": prospective_members}
	}

# List chats
def action_list(a):
	identity = a.user.identity.id
	chats = mochi.db.rows("""
		SELECT c.*,
			(SELECT count(*) FROM members WHERE chat=c.id) as members,
			(SELECT count(*) FROM messages msg
			 WHERE msg.chat = c.id
			   AND msg.created > coalesce((SELECT last_read FROM chat_read WHERE chat = c.id), 0)
			   AND msg.member != ?
			   AND msg.id NOT IN (SELECT message FROM deletions WHERE chat = c.id)) as unread
		FROM chats c
		LEFT JOIN members m ON m.chat = c.id AND m.member = ?
		WHERE (m.member IS NOT NULL OR c.status IN ('left', 'removed'))
		ORDER BY c.updated DESC
	""", identity, identity)
	# One query per batch of two-member chats rather than one per chat; batched so
	# an unbounded list cannot hit SQLite's variable limit.
	pair_ids = [chat["id"] for chat in chats if chat.get("members") == 2]
	others = {}
	for start in range(0, len(pair_ids), _LIST_BATCH):
		batch = pair_ids[start:start + _LIST_BATCH]
		places = ", ".join(["?" for _ in batch])
		for row in mochi.db.rows(
			"select chat, member from members where member<>? and chat in (" + places + ")",
			identity, *batch
		) or []:
			others[row["chat"]] = row["member"]

	accounts = {}
	if any([chat.get("account") for chat in chats]):
		accounts = {acc["id"]: acc for acc in chat_accounts()}
	for chat in chats:
		if chat.get("status") != "active":
			chat["unread"] = 0
		if chat.get("members") == 2 and chat["id"] in others:
			chat["other"] = others[chat["id"]]
		if chat.get("account"):
			acc = accounts.get(chat["account"], {})
			chat["address"] = acc.get("identifier", "")
			chat["network"] = acc.get("network", "")
	return {"data": chats}

# Enter details of new chat
def action_new(a):
	friends = mochi.service.call("friends", "list", a.user.identity.id) or []

	# The live one-on-one chat per counterpart, the same rule as chat_direct: a
	# chat we were removed from keeps both roster rows, so without the status
	# filter the picker offered a tombstone that refuses every write. Newest
	# first, so the first row per counterpart wins.
	rows = mochi.db.rows("""
		select c.id, m.member as other
		from chats c
		join members m on m.chat = c.id
		where c.status = 'active' and m.member <> ?
		and c.id in (select chat from members where member = ?)
		and (select count(*) from members where chat = c.id) = 2
		order by c.updated desc
	""", a.user.identity.id, a.user.identity.id)

	existing_chats = {}
	for row in rows:
		if row["other"] not in existing_chats:
			existing_chats[row["other"]] = row["id"]

	for friend in friends:
		if friend["id"] in existing_chats:
			friend["chat"] = existing_chats[friend["id"]]

	return {
		"data": {"name": a.user.identity.name, "friends": friends, "accounts": [account_entry(acc) for acc in chat_accounts()]}
	}

# Attachment routes (bytes, thumbnail, preview). attachment_serve performs no
# access check: serve_attachment is the gate (same rule as action_messages) and
# binds the attachment to this chat via its "chat/<chat>/<message>" object
# prefix.
def action_attachment(a):
	serve_attachment(a, "")

def action_attachment_thumbnail(a):
	serve_attachment(a, "thumbnail")

def action_attachment_preview(a):
	serve_attachment(a, "preview")

def serve_attachment(a, variant):
	attachment = a.input("id")
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return
	# The library serves the bytes with no access check of its own. Membership
	# was checked above; the binding runs in the member predicate: the
	# attachment's object is "chat/<chat_id>/<message_id>", so a prefix check
	# binds it to this chat and blocks fetching another chat's file by id.
	prefix = "chat/" + chat["id"] + "/"
	attachment_serve(a, attachment, chat["id"], variant=variant,
		member=lambda object: object.startswith(prefix))

# P2P byte-pull responder: a member on another host stores the metadata and
# pulls bytes from the sender on demand. The chat id comes from the attachment's
# object; the requester must be a current member and the object prefix binds the
# attachment to that chat.
def event_attachment_fetch(e):
	# content_text, not e.content: a non-string aborts the handler at .split,
	# and this is a peer-supplied field on an unauthenticated path.
	object = content_text(e, "object", "")
	parts = object.split("/")
	chat_id = parts[1] if len(parts) >= 2 and parts[0] == "chat" else ""
	prefix = "chat/" + chat_id + "/"
	attachment_respond(e, chat_id,
		lambda sender, container: bool(container) and mochi.db.exists("select 1 from members where chat=? and member=?", container, sender),
		member=lambda obj: obj.startswith(prefix))

# Get messages for a chat with cursor-based pagination
def action_messages(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	# Allow viewing if member OR if chat is marked as left
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	# Pagination parameters
	limit = 30
	limit_str = a.input("limit")
	if limit_str and mochi.text.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)

	# Keyset cursor on (created desc, id desc), carried as one opaque
	# "<created>:<id>" string: `created` is whole seconds, so the id (UUIDv7,
	# time-ordered) breaks ties that would otherwise duplicate or stall pages.
	# A cursor that does not parse serves the first page.
	before = None
	before_id = None
	cursor = a.input("cursor", "")
	if cursor and ":" in cursor:
		stamp, _, boundary = cursor.partition(":")
		# "integer" (<=12 digits), NOT "natural": the natural pattern caps at 9
		# digits, and unix timestamps have been 10 since 2001 - so a timestamp
		# cursor never validated and pagination silently served the first page
		# again.
		if mochi.text.valid(stamp, "integer") and mochi.text.valid(boundary, "id"):
			before = int(stamp)
			before_id = boundary

	# The conversation's own messages, or a thread's replies (phase 22).
	thread = a.input("thread", "") or ""
	if thread and not mochi.text.valid(thread, "id"):
		a.error.label(400, "errors.invalid_message")
		return

	# Fetch one extra (limit + 1) to detect whether older messages remain.
	if before:
		messages = mochi.db.rows("select * from messages where chat=? and thread=? and ( created<? or ( created=? and id<? ) ) order by created desc, id desc limit ?", chat["id"], thread, before, before, before_id, limit + 1)
	else:
		messages = mochi.db.rows("select * from messages where chat=? and thread=? order by created desc, id desc limit ?", chat["id"], thread, limit + 1)

	# Check if there are more (older) messages
	has_more = len(messages) > limit
	if has_more:
		messages = messages[:limit]

	# Reverse to chronological order (oldest first) for display
	messages = list(reversed(messages))

	# Cursor for the next (older) page is the oldest message we kept: its
	# timestamp and id, so the next request resumes inside a same-second run.
	cursor = None
	if has_more and len(messages) > 0:
		cursor = str(messages[0]["created"]) + ":" + messages[0]["id"]

	deleted_ids = messages_deleted_set(chat["id"], [m["id"] for m in messages])
	attachments = attachment_list_many(["chat/" + chat["id"] + "/" + m["id"] for m in messages if m["id"] not in deleted_ids], chat["id"])
	for m in messages:
		if m["id"] in deleted_ids:
			m["deleted"] = True
			m["body"] = ""
			m["reply"] = None
			m["attachments"] = []
			m["quote"] = None
		else:
			m["deleted"] = False
			m["attachments"] = attachments.get("chat/" + chat["id"] + "/" + m["id"], [])
			m["quote"] = message_quote_of(m)

	# Reaction counts + the viewer's own reaction, for non-deleted messages.
	messages_attach_reactions(chat["id"], [m for m in messages if not m["deleted"]], a.user.identity.id)
	for m in messages:
		if m["deleted"]:
			m["reactions"] = {}
			m["reaction"] = None

	# How many replies each message has in its thread.
	if not thread:
		counts = thread_counts(chat["id"], [m["id"] for m in messages if not m["deleted"]])
		for m in messages:
			m["replies"] = counts.get(m["id"], {}).get("replies", 0)
			m["latest"] = counts.get(m["id"], {}).get("latest", 0)

	return {
		"data": {
			"messages": messages,
			"more": has_more,
			"cursor": cursor,
			"receipts": chat_receipts(chat["id"]),
		}
	}

# Send a message
def action_send(a):
	body = a.input("body", "")
	has_files = a.input("files")

	# Optional @mentions: a JSON array of member identity ids. The body
	# carries the @[Name] display markup; the ids here are what recipients
	# use to decide "mentions me" precisely (names collide, ids do not).
	mentions = []
	mentions_raw = a.input("mentions")
	if mentions_raw:
		decoded = json.decode(mentions_raw, None)
		if type(decoded) != "list" or len(decoded) > 50:
			a.error.label(400, "errors.invalid_message")
			return
		mentions = [str(raw) for raw in decoded]

	# Optional per-file captions for attachment metadata (JSON array of
	# strings aligned with the files' order). Voice notes use this to carry
	# their duration so recipients can render a player before downloading.
	captions = []
	captions_raw = a.input("captions")
	if captions_raw:
		decoded = json.decode(captions_raw, None)
		if type(decoded) != "list" or len(decoded) > 100:
			a.error.label(400, "errors.invalid_message")
			return
		for raw in decoded:
			caption = str(raw)
			if len(caption) > 200:
				a.error.label(400, "errors.invalid_message")
				return
			captions.append(caption)

	save = (lambda object: attachment_save(a, object, captions=captions)) if has_files else None
	result, failure = message_send(a.input("chat"), a.user.identity.id, a.user.identity.name, body, a.input("reply", ""), a.input("thread", "") or "", mentions, save)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def message_send(chat_input, user_id, user_name, body, reply, thread, mentions, save):
	"""Send a message to a conversation as the user: checked as the send
	action checks it, kept, sent through the conversation's account where it
	is on another network, and told to the other members. save keeps the
	message's files, or is None for a message with none. Answers ({id},
	None) or (None, failure)."""
	if not mochi.text.valid(chat_input, "id"):
		return None, (400, "errors.invalid_chat_id")
	chat = mochi.db.row("select * from chats where id=?", chat_input)
	if not chat:
		return None, (404, "errors.chat_not_found")

	failure = chat_write_check(chat, user_id)
	if failure:
		return None, failure

	if not mochi.text.valid(body, "text"):
		return None, (400, "errors.invalid_message")
	if len(body) > 10000:
		return None, (400, "errors.message_too_long")

	if not body.strip() and not save:
		return None, (400, "errors.message_empty")

	# Optional structured reply: the quoted message must exist in this chat.
	if reply:
		if not mochi.text.valid(str(reply), "id"):
			return None, (400, "errors.invalid_message")
		if not mochi.db.exists("select 1 from messages where id=? and chat=?", reply, chat["id"]):
			return None, (404, "errors.message_not_found")
	else:
		reply = None

	# Optional thread: the reply goes under a message of the conversation that
	# is not itself in a thread (phase 22).
	if thread and not thread_root(chat["id"], thread):
		return None, (404, "errors.message_not_found")

	# Each mentioned id must be a current member of this chat.
	named = []
	for member_id in mentions:
		if not mochi.text.valid(member_id, "entity"):
			return None, (400, "errors.invalid_message")
		if member_id in named:
			continue
		if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
			return None, (400, "errors.mentioned_not_a_member")
		named.append(member_id)
	mentions = named

	# A link to a post on another network is quoted: its text, image and author
	# are kept with the message and sent with it, so every member sees the
	# quote as the sender did.
	quote = message_quote(body)

	chat_ensure_commit_hook()
	id = mochi.uid()
	now_send = mochi.time.now()

	# Every file before the row: an upload the builtin refuses (oversize, over
	# quota) ends the handler, and statements run per call, so a row written
	# first was durable before the refusal - a message the sender saw on reload
	# that no recipient was ever sent.
	attachments = []
	if save:
		attachments = save("chat/" + chat["id"] + "/" + id)

	mochi.db.execute("replace into messages ( id, chat, member, name, body, created, reply, quote, thread ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], user_id, user_name, body, now_send, reply, json.encode(quote) if quote else "", thread)

	# A conversation on another network takes the message through its
	# account; one that cannot go is not kept.
	if chat.get("account") and not remote_send(chat, id, body, attachments):
		mochi.db.execute("delete from messages where id=?", id)
		for att in attachments:
			attachment_delete(att["id"])
		return None, (502, "errors.network_unavailable")
	# Bump the chat's updated timestamp so the chat list sorts by last
	# message activity, not by member-event history.
	mochi.db.execute("update chats set updated=? where id=?", now_send, chat["id"])

	# Get other chat members for notification
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], user_id)
	member_ids = [m["member"] for m in members]

	# Live-update websocket: fired from chat_commit_hook on every host
	# that sees this messages row (local + paired replicas via the
	# row-uid wire field from #36), so the user's tabs on every host
	# see the message arrive without a refresh.
	mochi.db.commit.fire("messages", "insert", id)

	# Broadcast with attachment metadata piggybacked; `created` is now_send so
	# every host stores the same timestamp.
	msg_data = {"chat": chat["id"], "message": id, "created": now_send, "body": body, "name": user_name}
	if reply:
		msg_data["reply"] = reply
	if quote:
		msg_data["quote"] = quote
	if mentions:
		msg_data["mentions"] = mentions
	if thread:
		msg_data["thread"] = thread
	if attachments:
		msg_data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now_send), "caption": att.get("caption", ""), "description": att.get("description", "")} for att in attachments]
	broadcast_chat(chat["id"], user_id, member_ids, "message", msg_data)

	# A group with people from Matrix whose room this member relays.
	if chat.get("relay"):
		bridge_forward(chat, id, user_id, body, reply, thread, attachments)

	return {"id": id}, None

# --- Read tracking ---------------------------------------------------------

def chat_last_read(chat_id):
	row = mochi.db.row("select last_read from chat_read where chat=?", chat_id)
	if not row:
		return 0
	return row["last_read"]

def chat_set_last_read(chat_id, ts):
	mochi.db.execute("insert or replace into chat_read ( chat, last_read ) values ( ?, ? )", chat_id, ts)

# Mark a chat read up to a timestamp watermark (defaults to the latest
# message). The watermark only moves forward. Local-only, not synced.
def action_mark_read(a):
	read_ts = None
	read_str = a.input("read", "")
	if read_str and mochi.text.valid(read_str, "integer"):
		read_ts = int(read_str)
	result, failure = chat_read(a.input("chat"), a.user.identity.id, a.user.preference, read_ts)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def chat_read(chat_input, user_id, preference, read_ts):
	"""Mark a conversation read up to a time, or its latest message, as the
	read action does; preference is the user's, which says whether the
	other members are told. Answers ({read}, None) or (None, failure)."""
	if not mochi.text.valid(chat_input, "id"):
		return None, (400, "errors.invalid_chat_id")
	chat = mochi.db.row("select * from chats where id=?", chat_input)
	if not chat:
		return None, (404, "errors.chat_not_found")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], user_id) and chat["status"] not in ("left", "removed"):
		return None, (403, "errors.not_a_member_of_this_chat")

	last = mochi.db.row("select max(created) as ts from messages where chat=?", chat["id"])
	latest = last["ts"] if last and last.get("ts") else chat["updated"]
	if read_ts == None:
		read_ts = latest
	# The watermark only moves forward, so a client sending a far-future stamp
	# would zero this chat's unread count for good: clamp to the newest thing
	# a message could carry.
	read_ts = min(read_ts, max(latest, mochi.time.now()))

	prior = chat_last_read(chat["id"])
	if read_ts < prior:
		read_ts = prior
	chat_set_last_read(chat["id"], read_ts)
	# The other members are told how far the user has read, where the user's
	# switch allows (phase 22).
	if read_ts > prior and chat_active(chat) and not chat.get("account") and chat_switch(preference, "receipts"):
		for peer in chat_peers(chat["id"], user_id):
			receipt_send(user_id, peer, chat["id"], displayed=read_ts)
	# A linked conversation is told too, or its server alone where the switch
	# is off (phase 23).
	if read_ts > prior and chat_active(chat) and chat.get("account"):
		linked_read(chat, user_id, preference, read_ts)
	return {"read": read_ts}, None


# --- Reactions -------------------------------------------------------------

# Whitelist of reaction types; "" / "none" clears the member's reaction.
def is_reaction_valid(reaction):
	if not reaction or reaction == "none":
		return {"valid": True, "reaction": ""}
	if mochi.text.valid(reaction, "^(like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return {"valid": True, "reaction": reaction}
	return {"valid": False, "reaction": ""}

def message_reaction_counts(chat_id, message_id):
	rows = mochi.db.rows("select reaction, count(*) as n from reactions where chat=? and message=? group by reaction", chat_id, message_id) or []
	counts = {}
	for r in rows:
		counts[r["reaction"]] = r["n"]
	return counts

# Apply a member's reaction change (set/replace or clear) and fire the commit
# hook so the websocket update goes out through chat_commit_hook (consistent
# with the message path, multi-host ready) rather than a direct write.
def message_reaction_apply(chat_id, message_id, member_id, name, reaction):
	if reaction:
		mochi.db.execute("replace into reactions ( chat, message, member, name, reaction ) values ( ?, ?, ?, ?, ? )", chat_id, message_id, member_id, name, reaction)
	else:
		mochi.db.execute("delete from reactions where chat=? and message=? and member=?", chat_id, message_id, member_id)
	chat_ensure_commit_hook()
	mochi.db.commit.fire("reactions", "insert", message_id)

# Validate the target exists, apply, and return the authoritative state.
def message_reaction_set(chat_id, message_id, member_id, name, reaction):
	if not mochi.db.exists("select 1 from messages where id=? and chat=?", message_id, chat_id):
		return None
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat_id, member_id):
		return None
	message_reaction_apply(chat_id, message_id, member_id, name, reaction)
	return {"reactions": message_reaction_counts(chat_id, message_id), "reaction": reaction if reaction else None}

# Attach the reaction counts + the viewer's own reaction to a list of messages.
def messages_attach_reactions(chat_id, messages, viewer_id):
	if not messages:
		return
	message_ids = [m["id"] for m in messages]
	placeholders = ", ".join(["?" for _ in message_ids])
	count_rows = mochi.db.rows("select message, reaction, count(*) as n from reactions where chat=? and message in (" + placeholders + ") group by message, reaction", chat_id, *message_ids) or []
	counts_by_message = {}
	for r in count_rows:
		mid = r["message"]
		if mid not in counts_by_message:
			counts_by_message[mid] = {}
		counts_by_message[mid][r["reaction"]] = r["n"]
	my_args = [chat_id] + message_ids + [viewer_id]
	my_rows = mochi.db.rows("select message, reaction from reactions where chat=? and message in (" + placeholders + ") and member=?", *my_args) or []
	my_by_message = {}
	for r in my_rows:
		my_by_message[r["message"]] = r["reaction"]
	for m in messages:
		m["reactions"] = counts_by_message.get(m["id"], {})
		mine = my_by_message.get(m["id"])
		m["reaction"] = mine if mine else None

# Add / update / clear the caller's reaction on a message.
def action_react(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	if not chat_write_allowed(a, chat):
		return

	message_id = a.input("message")
	if not mochi.text.valid(str(message_id), "id"):
		a.error.label(400, "errors.invalid_message")
		return

	result = is_reaction_valid(a.input("reaction"))
	if not result["valid"]:
		a.error.label(400, "errors.invalid_reaction")
		return
	reaction = result["reaction"]

	prior = mochi.db.row("select remote from reactions where chat=? and message=? and member=?", chat["id"], message_id, a.user.identity.id)
	outcome = message_reaction_set(chat["id"], message_id, a.user.identity.id, a.user.identity.name, reaction)
	if not outcome:
		a.error.label(404, "errors.message_not_found")
		return

	# A Matrix or XMPP conversation has the reaction too (phases 24 and 26),
	# as does the room of a group this member relays.
	if chat.get("account"):
		acc = chat_account(chat)
		if acc and acc["network"] in LINKED_CHAT:
			linked_react(chat, acc, a.user.identity.id, message_id, reaction, prior["remote"] if prior else "")
	if chat.get("relay"):
		bridge_react(chat, a.user.identity.id, message_id, reaction, prior["remote"] if prior else "")

	# Propagate to other members; their event_message_react applies it and
	# fires their own commit hook to update their tabs.
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	member_ids = [m["member"] for m in members]
	broadcast_chat(chat["id"], a.user.identity.id, member_ids, "message/react", {"message": message_id, "member": a.user.identity.id, "name": a.user.identity.name, "reaction": reaction if reaction else None})

	return {"data": outcome}

# Received a reaction change from another member.
def event_message_react(e):
	message_id = e.content("message")
	if not mochi.text.valid(str(message_id), "id"):
		return
	member_id = e.content("member")
	if not mochi.text.valid(str(member_id), "entity"):
		return
	if e.header("from") != member_id:
		return
	# None clears (action_react sends it that way); anything else must be a
	# string, because mochi.text.valid errors on any other type.
	reaction_raw = e.content("reaction")
	if reaction_raw != None and type(reaction_raw) != "string":
		return
	result = is_reaction_valid(reaction_raw)
	if not result["valid"]:
		return
	reaction = result["reaction"]

	message = mochi.db.row("select chat from messages where id=?", message_id)
	if not message:
		return
	chat = mochi.db.row("select * from chats where id=?", message["chat"])
	if not chat:
		return
	if chat["status"] != "active":
		return
	member = mochi.db.row("select name from members where chat=? and member=?", chat["id"], member_id)
	if not member:
		return
	# Roster name only - payload names are untrusted (see event_message).
	name = member["name"]
	prior = mochi.db.row("select remote from reactions where chat=? and message=? and member=?", chat["id"], message_id, member_id)
	message_reaction_apply(chat["id"], message_id, member_id, name, reaction)
	if chat.get("relay"):
		bridge_react(chat, member_id, message_id, reaction, prior["remote"] if prior else "")

# --- Search ----------------------------------------------------------------

# Search a chat's messages by body substring. Returns newest-first.
def action_search(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id) and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	query = a.input("q", "").strip()
	if len(query) < 2:
		return {"data": {"query": query, "results": []}}

	# Escape LIKE wildcards in the user's term so they match literally.
	escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
	pattern = "%" + escaped + "%"
	results = mochi.db.rows("select id, member, name, body, created from messages where chat=? and body like ? escape '\\' and id not in (select message from deletions where chat=?) order by created desc limit 100", chat["id"], pattern, chat["id"])
	return {"data": {"query": query, "results": results or []}}

# Purge a chat's local rows but keep a 'deleted' tombstone row: it lets
# event_message tell "we deleted this chat" (drop and leave-back) from "never a
# member" (bootstrap from the sender). Without it a deleted chat resurrects on
# the next message from a stale peer.
def chat_delete_local(chat_id):
	# Attachments first, per message: attachment_clear matches the exact object
	# "chat/<chat>/<message>", so the messages rows are the only way to enumerate
	# them.
	for _row in mochi.db.rows("select id from messages where chat=?", chat_id) or []:
		attachment_clear("chat/" + chat_id + "/" + _row["id"])
	mochi.db.execute("delete from reactions where chat=?", chat_id)
	mochi.db.execute("delete from deletions where chat=?", chat_id)
	mochi.db.execute("delete from messages where chat=?", chat_id)
	mochi.db.execute("delete from members where chat=?", chat_id)
	mochi.db.execute("delete from chat_read where chat=?", chat_id)
	mochi.db.execute("update chats set status='deleted', updated=? where id=?", mochi.time.now(), chat_id)

# Return the subset of message_ids that are tombstoned (deleted for everyone).
def messages_deleted_set(chat_id, message_ids):
	if not message_ids:
		return {}
	placeholders = ", ".join(["?" for _ in message_ids])
	rows = mochi.db.rows("select message from deletions where chat=? and message in (" + placeholders + ")", chat_id, *message_ids) or []
	deleted = {}
	for r in rows:
		deleted[r["message"]] = True
	return deleted

# Apply a "delete for everyone": append the tombstone, purge the body and
# attachments, and fire the commit hook so every host's open tabs update.
# Idempotent — re-applying a delete is a no-op beyond the websocket nudge.
def message_delete_apply(chat_id, message_id, member_id, ts):
	mochi.db.execute("insert or ignore into deletions ( chat, message, member, created ) values ( ?, ?, ?, ? )", chat_id, message_id, member_id, ts)
	mochi.db.execute("update messages set body='' where id=? and chat=?", message_id, chat_id)
	attachment_clear("chat/" + chat_id + "/" + message_id)
	chat_ensure_commit_hook()
	mochi.db.commit.fire("deletions", "insert", message_id)

# Delete one or more of the caller's own messages for everyone. Input
# `messages` is a JSON-encoded array string of ids (decoded like market's `ids`).
def action_messages_delete(a):
	raw_ids = a.input("messages")
	if not raw_ids:
		a.error.label(400, "errors.invalid_message")
		return
	# The shape check below was already here and is right, but it never ran on
	# malformed input: a bare json.decode RAISES, which ends the action before
	# the caller can be told anything, so a bad body answered 500 instead of
	# this 400. content_decode returns the fallback instead of aborting.
	message_ids = content_decode(raw_ids, None)
	result, failure = messages_delete(a.input("chat"), message_ids, a.user.identity.id)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def messages_delete(chat_input, message_ids, user_id):
	"""Delete some of the user's messages for everyone, as the delete action
	does. Answers ({deleted}, None) or (None, failure)."""
	if not mochi.text.valid(chat_input, "id"):
		return None, (400, "errors.invalid_chat_id")
	chat = mochi.db.row("select * from chats where id=?", chat_input)
	if not chat:
		return None, (404, "errors.chat_not_found")
	failure = chat_write_check(chat, user_id)
	if failure:
		return None, failure
	if type(message_ids) != "list" or len(message_ids) == 0 or len(message_ids) > 100:
		return None, (400, "errors.invalid_message")

	now_delete = mochi.time.now()
	deleted = []
	for raw_id in message_ids:
		message_id = str(raw_id)
		if not mochi.text.valid(message_id, "id"):
			continue
		# Own messages only: the row must exist in this chat and belong to
		# the caller. Skip silently so a partial selection still succeeds.
		owner = mochi.db.row("select member, remote from messages where id=? and chat=?", message_id, chat["id"])
		if not owner or owner["member"] != user_id:
			continue
		message_delete_apply(chat["id"], message_id, user_id, now_delete)
		if chat.get("account"):
			remote_delete(chat, message_id, owner.get("remote", ""))
		if chat.get("relay"):
			bridge_delete(chat, message_id, user_id, owner.get("remote", ""))
		deleted.append(message_id)

	if not deleted:
		return None, (404, "errors.message_not_found")

	# Propagate to the other members so they replace the message in real time.
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], user_id)
	member_ids = [m["member"] for m in members]
	broadcast_chat(chat["id"], user_id, member_ids, "message/delete", {"chat": chat["id"], "messages": deleted})

	return {"deleted": deleted}, None


# A member deleted their own message(s) for everyone. Tombstone locally.
# We only honour a delete for a message we already hold whose author is the
# sender — broadcast ordering guarantees a member's message arrives before
# its own delete, so this also blocks a member suppressing others' messages.
def event_message_delete(e):
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		return
	if chat["status"] != "active":
		return
	sender = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return
	messages = e.content("messages")
	# Event content decoded off the wire arrives as a TUPLE (core sl_encode
	# maps Go slices to Starlark tuples), not a list — a list-only check
	# silently dropped every delete on the receiving side, so a deleted
	# message tombstoned only on the deleter's own host.
	if type(messages) not in ("list", "tuple"):
		return
	now_delete = mochi.time.now()
	for raw_id in messages:
		message_id = str(raw_id)
		if not mochi.text.valid(message_id, "id"):
			continue
		owner = mochi.db.row("select member, remote from messages where id=? and chat=?", message_id, chat["id"])
		if not owner or owner["member"] != sender:
			continue
		message_delete_apply(chat["id"], message_id, sender, now_delete)
		if chat.get("relay"):
			bridge_delete(chat, message_id, sender, owner["remote"])

# Edit one of the caller's own messages for everyone. Same body rules as
# send; editing to empty is a delete and is refused. Deleted messages stay
# deleted. The edited timestamp is what recipients converge on (LWW).
def action_message_edit(a):
	result, failure = message_edit(a.input("chat"), a.input("message", ""), a.user.identity.id, a.input("body", ""))
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def message_edit(chat_input, message_id, user_id, body):
	"""Edit one of the user's messages, as the edit action does. Answers
	({id, edited}, None) or (None, failure)."""
	if not mochi.text.valid(chat_input, "id"):
		return None, (400, "errors.invalid_chat_id")
	chat = mochi.db.row("select * from chats where id=?", chat_input)
	if not chat:
		return None, (404, "errors.chat_not_found")
	failure = chat_write_check(chat, user_id)
	if failure:
		return None, failure

	if not mochi.text.valid(message_id, "id"):
		return None, (400, "errors.invalid_message")
	row = mochi.db.row("select member, edited from messages where id=? and chat=?", message_id, chat["id"])
	if not row:
		return None, (404, "errors.message_not_found")
	if row["member"] != user_id:
		return None, (403, "errors.not_your_message")
	if mochi.db.exists("select 1 from deletions where message=?", message_id):
		return None, (404, "errors.message_not_found")

	if not mochi.text.valid(body, "text"):
		return None, (400, "errors.invalid_message")
	if len(body) > 10000:
		return None, (400, "errors.message_too_long")
	if not body.strip():
		return None, (400, "errors.message_empty")

	now_edit = mochi.time.now()
	mochi.db.execute("update messages set body=?, edited=? where id=? and chat=?", body, now_edit, message_id, chat["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message_id)
	if chat.get("account"):
		remote_edit(chat, mochi.db.row("select * from messages where id=?", message_id))

	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], user_id)
	member_ids = [m["member"] for m in members]
	broadcast_chat(chat["id"], user_id, member_ids, "message/edit", {"chat": chat["id"], "message": message_id, "body": body, "edited": now_edit})
	if chat.get("relay"):
		bridge_edit(chat, message_id, user_id, body)

	return {"id": message_id, "edited": now_edit}, None


# A member edited their own message. Apply if the sender is the author and
# the edit is newer than what we hold; the deletion tombstone always wins.
# Broadcast ordering guarantees the original message arrives before its own
# edit, so a missing row means we were never sent the message — ignore.
def event_message_edit(e):
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat or chat["status"] != "active":
		return
	sender = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	message_id = str(e.content("message"))
	if not mochi.text.valid(message_id, "id"):
		return
	edited = content_number(e, "edited", None)
	if edited == None:
		return
	now = mochi.time.now()
	if edited > now + 86400 or edited < now - 31536000:
		return
	body = content_text(e, "body", None)
	if body == None or not mochi.text.valid(body, "text"):
		return
	if len(body) > 10000 or not body.strip():
		return

	row = mochi.db.row("select member, edited from messages where id=? and chat=?", message_id, chat["id"])
	if not row or row["member"] != sender:
		return
	if mochi.db.exists("select 1 from deletions where message=?", message_id):
		return
	if edited <= (row["edited"] or 0):
		return

	mochi.db.execute("update messages set body=?, edited=? where id=? and chat=?", body, edited, message_id, chat["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message_id)
	if chat.get("relay"):
		bridge_edit(chat, message_id, sender, body)

# Collect the forwardable source messages named by a JSON-array `messages`
# string: rows that exist in the source chat and are not tombstoned. None when
# the payload is malformed, empty or oversized (caller maps to
# errors.invalid_message); [] when none of the named messages qualify.
def chat_collect_forwardable(source_id, raw_ids):
	if not raw_ids:
		return None
	message_ids = json.decode(raw_ids, None)
	if type(message_ids) != "list" or len(message_ids) == 0 or len(message_ids) > 100:
		return None
	out = []
	for raw_id in message_ids:
		source_message_id = str(raw_id)
		if not mochi.text.valid(source_message_id, "id"):
			continue
		# Source must exist in the source chat and not be a tombstone.
		source_message = mochi.db.row("select * from messages where id=? and chat=?", source_message_id, source_id)
		if not source_message:
			continue
		if mochi.db.exists("select 1 from deletions where message=?", source_message_id):
			continue
		out.append(source_message)
	return out

# chat_forward_allowed: may this forward's attachments be copied? Copying reads
# each file into memory (no server-side copy), so the count is bounded up front
# from metadata - failing part way would leave a half-forwarded set with nothing
# to roll back. Returns the per-message attachment lists for chat_forward_into
# to reuse, or None when refused. chat_forward_into: copy validated source
# messages into target_id as new messages by the caller, with attachments,
# commit hook and broadcast. Shared by both forward paths.
def chat_forward_allowed(a, source_id, source_messages):
	total = 0
	listed = {}
	for source_message in source_messages:
		attachments = attachment_list("chat/" + source_id + "/" + source_message["id"], source_id) or []
		listed[source_message["id"]] = attachments
		total += len(attachments)
		if total > _FORWARD_ATTACHMENTS_MAXIMUM:
			a.error.label(400, "errors.too_many_attachments", maximum=_FORWARD_ATTACHMENTS_MAXIMUM)
			return None
	return listed

def chat_forward_into(a, source_id, target_id, source_messages, listed=None):
	chat_ensure_commit_hook()
	members = mochi.db.rows("select member from members where chat=? and member!=?", target_id, a.user.identity.id)
	member_ids = [m["member"] for m in members]

	forwarded = []
	for source_message in source_messages:
		new_id = mochi.uid()
		now_forward = mochi.time.now()
		mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", new_id, target_id, a.user.identity.id, a.user.identity.name, source_message["body"], now_forward)
		mochi.db.execute("update chats set updated=? where id=?", now_forward, target_id)

		# Copy attachment bytes into the new message's object. attachment_copy
		# streams file to file: an attachment may be as large as the uploader's
		# remaining quota, and reading one into memory to write it back would
		# charge that to a process every user on this host shares.
		source_attachments = listed.get(source_message["id"]) if listed != None else attachment_list("chat/" + source_id + "/" + source_message["id"], source_id)
		# Caption and description ride along: a voice note carries its duration
		# in the caption, and a copy without it renders with no player.
		for att in source_attachments or []:
			attachment_copy(att["id"], "chat/" + target_id + "/" + new_id, a.user.identity.id,
				caption=att.get("caption", ""), description=att.get("description", ""))
		new_attachments = attachment_list("chat/" + target_id + "/" + new_id, target_id)

		mochi.db.commit.fire("messages", "insert", new_id)

		msg_data = {"chat": target_id, "message": new_id, "created": now_forward, "body": source_message["body"], "name": a.user.identity.name}
		if new_attachments:
			msg_data["attachments"] = [{"id": at["id"], "name": at["name"], "size": at["size"], "content_type": at.get("type", ""), "rank": at.get("rank", 0), "created": at.get("created", now_forward), "caption": at.get("caption", ""), "description": at.get("description", "")} for at in new_attachments]
		broadcast_chat(target_id, a.user.identity.id, member_ids, "message", msg_data)
		forwarded.append(new_id)

	return forwarded

def action_messages_forward(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	source = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not source:
		a.error.label(404, "errors.chat_not_found")
		return
	if not chat_write_allowed(a, source):
		return

	destination = a.input("destination")
	if not mochi.text.valid(str(destination), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	target = mochi.db.row("select * from chats where id=?", destination)
	if not target:
		a.error.label(404, "errors.chat_not_found")
		return
	if not chat_write_allowed(a, target):
		return
	# A conversation on another network takes only what its member writes
	# there, through its account.
	if target.get("account"):
		a.error.label(400, "errors.forward_not_possible")
		return

	source_messages = chat_collect_forwardable(source["id"], a.input("messages"))
	if source_messages == None:
		a.error.label(400, "errors.invalid_message")
		return

	listed = chat_forward_allowed(a, source["id"], source_messages)
	if listed == None:
		return

	forwarded = chat_forward_into(a, source["id"], target["id"], source_messages, listed)
	if not forwarded:
		a.error.label(404, "errors.message_not_found")
		return

	return {"data": {"forwarded": forwarded, "destination": target["id"]}}

# Forward messages to a friend, creating or reusing the one-on-one chat. Source
# messages are validated before any chat is created, so an empty forward never
# leaves an orphaned chat.
def action_messages_forward_friend(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	source = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not source:
		a.error.label(404, "errors.chat_not_found")
		return
	if not chat_write_allowed(a, source):
		return

	member_id = a.input("member")
	if not mochi.text.valid(str(member_id), "entity") or member_id == a.user.identity.id:
		a.error.label(400, "errors.invalid_member_id")
		return

	# Validate the messages first — nothing below creates a chat until we know
	# there is at least one real message to forward.
	source_messages = chat_collect_forwardable(source["id"], a.input("messages"))
	if source_messages == None:
		a.error.label(400, "errors.invalid_message")
		return
	if not source_messages:
		a.error.label(404, "errors.message_not_found")
		return
	# Checked here for the same reason the messages are: refusing after the
	# chat exists would leave an empty one behind.
	listed = chat_forward_allowed(a, source["id"], source_messages)
	if listed == None:
		return

	# Friends may always be targeted; a non-friend only if their chat_policy
	# allows (verified by probing their server), so the forward fails loudly
	# instead of creating a chat whose `new` event the recipient's gate
	# silently drops (#206).
	member = chat_member_allowed(a.user.identity.id, member_id)
	if member.get("error"):
		a.error.label(400, member["error"])
		return
	member_name = member["name"]

	# Reuse the existing 1-on-1 chat with this member if there is one, else
	# create it (mirrors action_create's direct-chat path).
	existing = chat_direct(a.user.identity.id, member_id)

	if existing:
		target_id = existing["id"]
	else:
		target_id = mochi.uid()
		mochi.db.execute("replace into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", target_id, member_name, mochi.random.alphanumeric(16), mochi.time.now())
		mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? ) on conflict ( chat, member ) do update set name=excluded.name", target_id, a.user.identity.id, a.user.identity.name)
		mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? ) on conflict ( chat, member ) do update set name=excluded.name", target_id, member_id, member_name)
		# Tell the friend about the new chat; they see our name as its title.
		mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "new"}, {"id": target_id, "name": a.user.identity.name}, [{"id": a.user.identity.id, "name": a.user.identity.name}, {"id": member_id, "name": member_name}])

	forwarded = chat_forward_into(a, source["id"], target_id, source_messages, listed)
	if not forwarded:
		a.error.label(404, "errors.message_not_found")
		return

	return {"data": {"forwarded": forwarded, "destination": target_id}}

# View a chat
def action_view(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	# Allow viewing if member OR if chat is marked as left (user was removed or left)
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	members = mochi.db.rows("select member as id, name, relay, role from members where chat=?", chat["id"])
	chat["members"] = members
	acc = chat_account(chat)
	if acc:
		chat["address"] = acc.get("identifier", "")
		chat["network"] = acc["network"]

	mochi.service.call("notifications", "clear/object", chat["id"])
	return {
		"data": {"chat": chat, "identity": a.user.identity.id}
	}

# Manual resync from the most recently active other member, under the shorter
# manual throttle window.
def action_resync(a):
	chat_id = a.input("chat")
	if not mochi.text.valid(chat_id, "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	identity = a.user.identity.id
	if not chat_write_allowed(a, chat):
		return
	# Pick the most recently active member who isn't us as the responder.
	row = mochi.db.row(
		"select member from messages where chat=? and member!=? order by created desc limit 1",
		chat_id, identity)
	peer = row["member"] if row else None
	if not peer:
		# Fall back to any other member.
		row = mochi.db.row(
			"select member from members where chat=? and member!=? limit 1",
			chat_id, identity)
		peer = row["member"] if row else None
	if not peer:
		# Solo chat — nothing to sync from.
		return {"data": {"synced": False}}
	# A manual resync uses a shorter window than the automatic one rather than
	# clearing `synced` outright, which defeated the throttle entirely.
	# `throttled` lets the client say "just a moment" instead of showing a
	# forced sync as a failure.
	row = mochi.db.row("select synced from chats where id=?", chat_id)
	throttled = row and row["synced"] and mochi.time.now() - row["synced"] < _RESYNC_MANUAL
	synced = request_resync(chat_id, peer, _RESYNC_MANUAL)
	return {"data": {"synced": synced, "throttled": True if throttled else False}}

# Ask a member peer for the chat's name and roster when an event references a
# chat we do not hold; throttled per chat so a burst of out-of-order events
# cannot spam.
def request_resync(chat_id, peer_member, minimum=_RESYNC_AUTOMATIC):
	"""True only when data was fetched and applied; throttled, invalid and failed calls return False. `minimum` is the seconds since the last attempt."""
	# Validated here as well as by the callers: the id is inserted verbatim
	# below and then appears in URLs and websocket payloads.
	if not chat_id or not peer_member or not mochi.text.valid(chat_id, "id"):
		return False
	row = mochi.db.row("select synced from chats where id=?", chat_id)
	now = mochi.time.now()
	if row and row["synced"] and now - row["synced"] < minimum:
		return False
	# Stamp the attempt, not only the success: a peer that never answers is the
	# case the throttle must cover.
	if row:
		mochi.db.execute("update chats set synced=? where id=?", now, chat_id)
	response = mochi.remote.request(peer_member, "chat", "info", {"chat": chat_id})
	if not response or response.get("error"):
		return False
	name = response.get("name") or ""
	members = response.get("members") or []
	if type(name) != "string" or not mochi.text.valid(name, "display"):
		return False
	# event_new caps its roster; this path answers the same claim from the same
	# kind of peer, so it carries the same ceiling. Without it one `info`
	# response inserts as many members rows as it names.
	if type(members) not in ["list", "tuple"] or len(members) > _MEMBERS_MAXIMUM:
		return False
	# Validate the roster before writing anything: it decides the chat's title
	# below, and the peer's answer is untrusted.
	roster = []
	for m in members:
		if type(m) != "dict":
			continue
		id = m.get("id", "")
		display = m.get("name", "")
		relay = m.get("relay") or ""
		if type(id) != "string" or type(relay) != "string":
			continue
		# A person from Matrix comes with the member who relays them.
		if relay and not (bridge_person(id) and mochi.text.valid(relay, "entity")):
			continue
		if not relay and not mochi.text.valid(id, "entity"):
			continue
		# "display", not "name": these are rendered to other participants and
		# into notification bodies, and "name" admits the Cf bidirectional
		# overrides that "display" exists to reject.
		if type(display) != "string" or not mochi.text.valid(display, "display"):
			continue
		roster.append({"id": id, "name": display, "relay": relay})
	# Create chat if missing. Re-read existence here (not the throttle read
	# above): a concurrent event_new may have inserted the chat while we were
	# awaiting the blocking remote request, and the insert below is not
	# insert-or-ignore.
	existing = mochi.db.row("select id from chats where id=?", chat_id)
	if not existing:
		# Each side of a two-member chat is titled after the other party
		# (action_create), so the answering peer's title is the requester's own
		# name; their roster entry is the title the requester should hold.
		if len(roster) == 2:
			for m in roster:
				if m["id"] == peer_member:
					name = m["name"]
		mochi.db.execute(
			"insert into chats ( id, name, key, updated, synced ) values ( ?, ?, ?, ?, ? )",
			chat_id, name, mochi.random.alphanumeric(16), now, now)
	else:
		mochi.db.execute("update chats set synced=? where id=?", now, chat_id)
	# Insert members we do not hold. Never a rename: the answering peer is a
	# member like any other, and the roster name is what every later message
	# and notification from that member is labelled with.
	listed_ids = [m["id"] for m in roster]
	for m in roster:
		if m["relay"] and m["relay"] not in listed_ids:
			continue
		mochi.db.execute("insert or ignore into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat_id, m["id"], m["name"], m["relay"])
	return True

# Answer a member's resync request with the chat's name and roster; non-members
# are refused since membership is private. Errors are label keys so the
# requesting server can localise them.
def event_info(e):
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		e.stream.write({"error": "errors.invalid_chat_id"})
		return
	chat = mochi.db.row("select id, name from chats where id=?", chat_id)
	if not chat:
		e.stream.write({"error": "errors.chat_not_found"})
		return
	requester = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat_id, requester):
		e.stream.write({"error": "errors.not_a_member_of_this_chat"})
		return
	members = mochi.db.rows("select member as id, name, relay from members where chat=?", chat_id) or []
	e.stream.write({"name": chat["name"], "members": members})

# Recieve a chat message from another member
def event_message(e):
	# A list or dict here fails to bind and aborts the handler before any gate;
	# the id is also what request_resync inserts verbatim on the bootstrap path.
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		# No row means we were never a member (departures keep a tombstone), so treat
		# this as a missed event_new and bootstrap from the sender - but only a
		# friend, or any peer knowing a chat id could plant a fabricated chat and
		# roster via request_resync.
		if not mochi.service.call("friends", "get", e.header("to"), e.header("from")):
			return
		request_resync(chat_id, e.header("from"))
		chat = mochi.db.row("select * from chats where id=?", chat_id)
		if not chat:
			return
	elif chat["status"] != "active":
		# We left / were removed from / deleted this chat, but a live sender
		# still lists us and keeps fanning messages here. Tell them to drop us
		# (leave-back) so the futile fan-out stops, then ignore the message.
		chat_leave_back(chat_id, e.header("to"), e.header("from"))
		return

	member = mochi.db.row("select * from members where chat=? and member=?", chat["id"], e.header("from"))
	if not member:
		return

	id = e.content("message")
	if not mochi.text.valid(str(id), "id"):
		return

	# messages.id is global: replace-into would move a row from another chat or
	# author. A member may only (re)create their own message in this chat.
	prior = mochi.db.row("select chat, member from messages where id=?", id)
	if prior and (prior["chat"] != chat["id"] or prior["member"] != e.header("from")):
		return

	created = content_number(e, "created", None)
	if created == None:
		return

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if created > now + 86400 or created < now - 31536000:
		return

	body = content_text(e, "body", None)
	if body == None or not mochi.text.valid(body, "text"):
		return
	if len(body) > 10000:
		return

	# Name from the local members row, never the payload: a sender could otherwise
	# label their messages with another participant's name.
	name = member["name"]

	# If this message was already deleted-for-everyone, an out-of-order or
	# replayed copy must not resurrect its body. Keep the tombstone.
	if mochi.db.exists("select 1 from deletions where message=?", id):
		body = ""

	# Same for edits: a replayed original carries the pre-edit body, and the
	# replace below would silently un-edit the message. Keep the edited copy.
	edited = 0
	existing = mochi.db.row("select body, edited from messages where id=? and chat=?", id, chat["id"])
	if existing and existing["edited"]:
		body = existing["body"]
		edited = existing["edited"]

	# Structured reply: keep only if the quoted message is one we hold in
	# this chat (out-of-order delivery may not have it yet — drop silently).
	reply = e.content("reply") or None
	if reply:
		if not mochi.text.valid(str(reply), "id"):
			reply = None
		elif not mochi.db.exists("select 1 from messages where id=? and chat=?", reply, chat["id"]):
			reply = None

	# The quote travels with the message; a sender's copy is taken as it is
	# shaped here, links checked, the rest cut to size.
	quote = quote_clean(e.content("quote"))

	# The thread the message replies in: kept by its id, since the root may be
	# another member's message still on its way (phase 22).
	thread = content_text(e, "thread", "") or ""
	if thread and (not mochi.text.valid(thread, "id") or thread == id):
		thread = ""

	mochi.db.execute("replace into messages ( id, chat, member, name, body, created, reply, edited, quote, thread ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], name, body, created, reply, edited, json.encode(quote) if quote else "", thread)
	# Bump the chat's updated timestamp so the chat list sorts by last
	# message activity. Use the message's own `created` (not now()) so
	# replayed history doesn't drag the chat forward in time.
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		attachment_store(attachments, e.header("from"), "chat/" + chat["id"] + "/" + id)
		attachments = attachment_list("chat/" + chat["id"] + "/" + id, chat["id"])

	# The live-update push fires from chat_commit_hook.
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)

	# A group with people from Matrix whose room this member relays.
	if chat.get("relay") and not existing:
		bridge_forward(chat, id, member["member"], body, reply, thread, attachments)

	# The sender learns the message arrived. Not under the receipts switch:
	# it says the message is here, not that it was read.
	receipt_send(e.header("to"), e.header("from"), chat["id"], delivered=created)

	# A conversation this member only carries for another (phase 24) is not
	# theirs to be told of.
	if chat.get("kind") == "bridge":
		return

	# An @mention of this user notifies on the separate "mention" topic so it cuts
	# through a muted Messages topic.
	mentions = e.content("mentions")
	excerpt = body.strip()[:80]
	if type(mentions) in ("list", "tuple") and e.header("to") in [str(m) for m in mentions]:
		notify("mention", chat["id"], mochi.app.label("notifications.title.mention"), mochi.app.label("notifications.body.mentioned_you", author=name, excerpt=excerpt), "/chat/" + chat["id"], chat["name"], event_id="mention:" + str(id))
	else:
		# Same excerpt and the same label treatment as the mention above: the
		# body may be 10000 characters, and a locale may want the author and
		# the text in the other order.
		notify("message", chat["id"], mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=excerpt), "/chat/" + chat["id"], chat["name"], event_id="message:" + str(id))

# Received a new chat event
def event_new(e):
	# Accept from friends, or from anyone when chat_policy is "anyone". A refused
	# invite is dropped silently on purpose: any peer can send this event, and an
	# unfriended or blocked sender must not learn they were dropped. The
	# sender-side refusal is the accept/query probe (#206).
	f = mochi.service.call("friends", "get", e.header("to"), e.header("from"))
	if not f:
		if (e.user.preference.get("chat_policy") or "friends") != "anyone":
			return

	chat = content_text(e, "id", "")
	if not mochi.text.valid(chat, "id"):
		return

	# "display" rejects the Cf bidirectional overrides "name" admits, and this
	# string is rendered to every other participant.
	name = content_text(e, "name", "")
	if not mochi.text.valid(name, "display"):
		return

	# Read rather than insert-or-ignore: an active row is a duplicate event, a
	# non-active row is a departure tombstone that a genuine re-add reactivates
	# (guarded below).
	existing = mochi.db.row("select status from chats where id=?", chat)
	if existing and existing["status"] == "active":
		return

	# e.read() answers None at EOF, so an event sent with no stream body would
	# raise here rather than being dropped. The body is whatever the sender put
	# in the segment: an integer fails len() and a string fails iteration, both
	# of which abort the handler.
	members = e.read() or []
	if type(members) not in ("list", "tuple"):
		return
	if len(members) > _MEMBERS_MAXIMUM:
		return

	# Validate the whole roster before creating or reactivating anything, and
	# deduplicate it: membership is all-or-nothing, so a roster that turns bad
	# part way through can't leave a chat holding the entries that happened to
	# come before it.
	roster = []
	seen = {}
	for member in members:
		if type(member) != "dict":
			return
		relay = member.get("relay") or ""
		if type(member.get("id")) != "string" or type(relay) != "string":
			return
		# A person from Matrix comes with the member who relays them.
		if relay:
			if not bridge_person(member["id"]) or not mochi.text.valid(relay, "entity"):
				return
		elif not mochi.text.valid(member["id"], "entity"):
			return
		if type(member.get("name")) != "string" or not mochi.text.valid(member["name"], "display"):
			return
		if member["id"] in seen:
			continue
		seen[member["id"]] = True
		roster.append(member)
	for member in roster:
		if member.get("relay") and member["relay"] not in seen:
			return

	# A chat we are not in is a chat we can never see or delete: action_list
	# filters on membership and action_delete refuses an active chat, so the
	# rows would persist unreachable while later events from listed members
	# kept landing in them. The sender has to be in it too -
	# nobody creates a conversation they are not part of.
	listed = [m["id"] for m in roster]
	if e.header("to") not in listed or e.header("from") not in listed:
		return

	if existing:
		# Reactivating a tombstone needs evidence of a real re-add: the sender must be
		# a remembered co-member, or any sender past the policy gate could force a
		# deliberately-left chat back to active. A deleted chat has no remembered
		# members, so it can never be reactivated - the sender must start a fresh chat.
		if not mochi.db.exists("select 1 from members where chat=? and member=?", chat, e.header("from")):
			return
		mochi.db.execute("update chats set status='active', name=?, updated=? where id=?", name, mochi.time.now(), chat)
		# The adder's stream resumes at the addition, not where it stood when
		# this member went.
		since = content_number(e, "since", 0)
		if since > 0 and e.header("peer"):
			mochi.broadcast.advance(e.header("peer"), chat, since)
	else:
		mochi.db.execute("insert or ignore into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())

	# Insert, never rename: on reactivation the remembered roster keeps its
	# names, or the re-adding member could relabel everyone (its own row
	# included) and every later message would carry the label.
	for member in roster:
		mochi.db.execute("insert or ignore into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat, member["id"], member["name"], member.get("relay") or "")

# Would-you-accept probe: answers from the same rule as event_new (friendship or
# chat_policy "anyone") and carries the display name so the sender needs no
# directory lookup. Reveals accept/refuse to a non-friend, which the create
# attempt would reveal anyway.
def event_accept_query(e):
	accept = False
	if mochi.service.call("friends", "get", e.header("to"), e.header("from")):
		accept = True
	elif (e.user.preference.get("chat_policy") or "friends") == "anyone":
		accept = True
	if not accept:
		e.stream.write({"accept": False})
		return
	name = e.user.identity.name if e.user and e.user.identity else ""
	e.stream.write({"accept": True, "name": name})

# Received a rename event
def event_rename(e):
	chat_id = content_text(e, "id", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	name = content_text(e, "name", "")
	if not mochi.text.valid(name, "display"):
		return

	# LWW gate: if a newer rename has already landed locally (concurrent
	# rename from another member's host), drop this older one. Older
	# events without `updated` (pre-conversion senders) fall back to
	# applying with local now, preserving prior behaviour.
	now = mochi.time.now()
	incoming = content_number(e, "updated", 0)
	# Same window as created/edited. A far-future stamp would pin the chat to the
	# top of the list and make every later rename lose to the gate below, freezing
	# the name. Fall back to our clock; the name itself is legitimate.
	if incoming > now + 86400 or incoming < now - 31536000:
		incoming = 0
	if incoming and chat["updated"] and incoming <= chat["updated"]:
		return
	if not incoming:
		incoming = now

	mochi.db.execute("update chats set name=?, updated=? where id=?", name, incoming, chat["id"])
	chat_websocket(chat["key"], {"event": "rename", "name": name})
	if chat.get("relay"):
		mochi.bridge.rename(chat["relay"], name)

# Received a leave event - a member left the chat
def event_leave(e):
	chat_id = content_text(e, "id", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return

	member = content_text(e, "member", "")
	if not mochi.text.valid(member, "entity"):
		return

	# Verify the event is from the member who is leaving
	if e.header("from") != member:
		return

	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	if chat.get("relay"):
		mochi.bridge.leave(chat["relay"], member)
	bridge_depart(chat, member)
	# A conversation carried for a member who has gone from it is closed.
	if chat.get("kind") == "bridge" and chat.get("relay") and not chat_peers(chat["id"], e.header("to")):
		mochi.bridge.close(chat["relay"])
		chat_delete_local(chat["id"])
		return
	# Every member originates their own stream, so each remaining host has to
	# revoke the leaver from ITS OWN broadcast log. Doing this only where the
	# removal is initiated would leave every other member's history replayable.
	mochi.broadcast.subscriber.remove(chat["id"], member)
	chat_websocket(chat["key"], {"event": "leave", "member": member})

# Received a member/add event - someone added a new member
def event_member_add(e):
	chat_id = content_text(e, "id", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	member = content_text(e, "member", "")
	# A person from Matrix is added by the member who relays them, and named
	# with them (phase 24).
	relay = content_text(e, "relay", "")
	if relay and (relay != sender or not bridge_person(member)):
		return
	if not relay and not mochi.text.valid(member, "entity"):
		return

	name = content_text(e, "name", "")
	if not mochi.text.valid(name, "display"):
		return

	# A member we already hold is a replayed or duplicate add - nothing to do.
	# It is also the only way the sender's name could reach an existing row:
	# the roster name is what every message and notification from that member
	# is labelled with, and action_member_add refuses to re-add a member, so no
	# honest sender produces an add for one.
	if mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member):
		return

	# The cap holds on the way in too, or a peer could grow a roster past it one
	# add at a time. A refusal leaves our roster short, repairable by resync.
	count = mochi.db.row("select count(*) as members from members where chat=?", chat["id"])
	if count and count["members"] >= _MEMBERS_MAXIMUM:
		return

	mochi.db.execute("insert or ignore into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat["id"], member, name, relay)
	if relay:
		mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
		chat_websocket(chat["key"], {"event": "member/add", "member": member, "name": name})
		return
	bridge_seat(chat, member, name)
	# The member/add broadcast goes to the EXISTING members, so the joiner is
	# absent from the very event that admits them and core would refuse them a
	# resync of this host's stream until some later message included them.
	mochi.broadcast.subscriber.add(chat["id"], member)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
	chat_websocket(chat["key"], {"event": "member/add", "member": member, "name": name})

# removed_mark records that another member removed us: the chat stays, read
# only, the open page learns at once, and the user is told.
def removed_mark(chat):
	mochi.db.execute("update chats set status='removed', updated=? where id=?", mochi.time.now(), chat["id"])
	# A member put out of a group whose room they relay closes it, and the
	# people from Matrix they relayed go from their copy.
	if chat.get("relay"):
		mochi.bridge.close(chat["relay"])
		mochi.db.execute("delete from members where chat=? and relay!=''", chat["id"])
		mochi.db.execute("update chats set relay='' where id=?", chat["id"])
	chat_websocket(chat["key"], {"event": "removed"})
	notify("member/removed", chat["id"], mochi.app.label("notifications.title.removed"), mochi.app.label("notifications.body.removed"), "/chat/" + chat["id"], chat["name"], event_id="removed:" + chat["id"])

# Received a member/remove event - someone removed a member
def event_member_remove(e):
	chat_id = content_text(e, "id", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	member = content_text(e, "member", "")
	if not mochi.text.valid(member, "entity") and not mochi.db.exists("select 1 from members where chat=? and member=? and relay!=''", chat["id"], member):
		return

	# Our own removal must arrive as `removed`; converge on that handler's state
	# rather than deleting our own row, which strands the chat - dropped from the
	# list, 403 on every read, and refused by delete, with no resync able to
	# repair it.
	if member == e.header("to"):
		removed_mark(chat)
		return

	relayed = mochi.db.row("select relay from members where chat=? and member=?", chat["id"], member)
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	# The room of a group this member relays loses them too: a person from
	# Matrix is put out of it, a Mochi member's stand-in leaves.
	if chat.get("relay"):
		if relayed and relayed["relay"] == e.header("to"):
			mochi.bridge.remove(chat["relay"], member)
		elif mochi.text.valid(member, "entity"):
			mochi.bridge.leave(chat["relay"], member)
	bridge_depart(chat, member)
	# As in event_leave: this host's own stream must stop serving them.
	if mochi.text.valid(member, "entity"):
		mochi.broadcast.subscriber.remove(chat["id"], member)
	chat_websocket(chat["key"], {"event": "member/remove", "member": member})

# Received a removed event - current user was removed from chat
def event_removed(e):
	chat_id = content_text(e, "id", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return

	# Verify the sender is a member (the remover). Without this, any peer that
	# knows the chat id could spoof a "removed" event and force this chat
	# read-only. Same gate as event_member_remove.
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], e.header("from")):
		return

	removed_mark(chat)

# List members of a chat
def action_members(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	# Same rule as action_view, action_messages, action_search and
	# serve_attachment: a member, or a chat we left but can still read back.
	# Without the second arm the settings page 403s its member list on a chat
	# whose view call on the same page succeeds.
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id) and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	members = mochi.db.rows("select member as id, name, relay, role from members where chat=?", chat["id"])
	return {"data": {"members": members}}

# Rename a chat
def action_rename(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if not chat_write_allowed(a, chat):
		return

	name = a.input("name")
	if not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_chat_name")
		return

	now = mochi.time.now()
	mochi.db.execute("update chats set name=?, updated=? where id=?", name, now, chat["id"])

	# Notify other members. Includes `updated` so receivers can LWW-gate
	# against their own chats.updated and drop stale concurrent renames.
	members = mochi.db.rows("select member from members where chat=?", chat["id"])
	member_ids = [m["member"] for m in members]
	broadcast_chat(chat["id"], a.user.identity.id, member_ids, "rename", {"id": chat["id"], "name": name, "updated": now}, exclude=a.user.identity.id)
	if chat.get("relay"):
		mochi.bridge.rename(chat["relay"], name)

	chat_websocket(chat["key"], {"event": "rename", "name": name})
	return {"data": {"success": True}}

# Leave a chat
def action_leave(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if chat["status"] != "active":
		a.error.label(400, "errors.already_left_this_chat")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	delete_local = a.input("delete") == "true"

	# A room on a linked account is left there too (phase 23).
	if chat.get("account") and chat.get("room"):
		acc = chat_account(chat)
		if acc and acc["network"] in LINKED_CHAT:
			mochi.account.room.leave(acc["id"], chat["room"])
	# The member relaying a group's people from Matrix takes them along, and
	# the room is closed (phase 24).
	if chat.get("relay"):
		bridge_close(chat, a.user.identity.id)

	# Remove self from members
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], a.user.identity.id)

	# Check if any members remain
	remaining = mochi.db.rows("select member from members where chat=?", chat["id"])

	if len(remaining) == 0:
		# Last member left: purge local content (keeps a 'deleted' tombstone)
		chat_delete_local(chat["id"])
	else:
		# Notify remaining members. The actor's own row was already
		# deleted above, so `remaining` excludes them — no `exclude` arg.
		remaining_ids = [m["member"] for m in remaining]
		broadcast_chat(chat["id"], a.user.identity.id, remaining_ids, "leave", {"id": chat["id"], "member": a.user.identity.id})
		chat_websocket(chat["key"], {"event": "leave", "member": a.user.identity.id})

		if delete_local:
			chat_delete_local(chat["id"])
		else:
			# Mark chat as left; kept read-only in the list.
			mochi.db.execute("update chats set status='left', updated=? where id=?", mochi.time.now(), chat["id"])

	return {"data": {"success": True}}

# Delete a chat locally (for left chats)
def action_delete(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	# The rule every read applies: a member, or a chat we left or were removed
	# from. action_leave deletes the caller's own roster row before stamping
	# the chat left, so a roster-only gate refused every left chat, which then
	# stayed in the list with no way to remove it.
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id) and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	# Only allow deleting a chat we've already left or been removed from.
	if chat["status"] == "active":
		a.error.label(400, "errors.delete_only_left_chat")
		return

	# Delete locally
	chat_delete_local(chat["id"])

	return {"data": {"success": True}}

# Add a member to a chat
def action_member_add(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if not chat_write_allowed(a, chat):
		return
	if chat.get("account"):
		a.error.label(400, "errors.members_fixed")
		return

	member_id = a.input("member")
	# A person from Matrix, by their address (phase 24).
	person = bridge_person(member_id)
	if person and chat.get("kind") != "bridge":
		return bridge_add(a, chat, person)
	if not mochi.text.valid(member_id, "entity"):
		a.error.label(400, "errors.invalid_member_id")
		return

	# Check if already a member
	if mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
		a.error.label(400, "errors.already_member")
		return

	# The same cap action_create applies, so a chat can't grow past it one
	# member at a time.
	count = mochi.db.row("select count(*) as members from members where chat=?", chat["id"])
	if count and count["members"] >= _MEMBERS_MAXIMUM:
		a.error.label(400, "errors.too_many_members", maximum=_MEMBERS_MAXIMUM)
		return

	# Friends may always be added; a non-friend only if their chat_policy
	# allows (verified by probing their server).
	member = chat_member_allowed(a.user.identity.id, member_id)
	if member.get("error"):
		a.error.label(400, member["error"])
		return

	member_name = member["name"]

	# Add new member
	mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? ) on conflict ( chat, member ) do update set name=excluded.name", chat["id"], member_id, member_name)
	# As in event_member_add: the notification below excludes the joiner, so
	# record them explicitly or this host's stream will refuse them a resync.
	mochi.broadcast.subscriber.add(chat["id"], member_id)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	bridge_seat(chat, member_id, member_name)

	# Get all current members for the new event, a person from Matrix with
	# the member who relays them.
	all_members = mochi.db.rows("select member as id, name, relay from members where chat=?", chat["id"])

	# Notify existing members about the addition. The new member's id is
	# excluded by the SQL filter; the sender's id is excluded via the
	# broadcast helper's `exclude` arg.
	existing_members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], member_id)
	existing_member_ids = [m["member"] for m in existing_members]
	since = broadcast_chat(chat["id"], a.user.identity.id, existing_member_ids, "member/add", {"id": chat["id"], "member": member_id, "name": member_name}, exclude=a.user.identity.id)

	# Single-recipient bootstrap with the roster as stream body: broadcast.send
	# carries no body and the receiver has no stream state yet. A member added
	# back picks up this host's stream from the addition: what was sent while
	# they were away, their own removal among it, is not theirs to replay.
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "new"}, {"id": chat["id"], "name": chat["name"], "since": since or 0}, all_members)

	chat_websocket(chat["key"], {"event": "member/add", "member": member_id, "name": member_name})
	return {"data": {"success": True, "member": {"id": member_id, "name": member_name}}}

# Remove a member from a chat
def action_member_remove(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if not chat_write_allowed(a, chat):
		return
	if chat.get("account"):
		a.error.label(400, "errors.members_fixed")
		return

	member_id = a.input("member")
	relayed = mochi.db.row("select relay from members where chat=? and member=? and relay!=''", chat["id"], member_id) if member_id else None
	if not mochi.text.valid(member_id, "entity") and not relayed:
		a.error.label(400, "errors.invalid_member_id")
		return

	# Cannot remove self (use leave for that)
	if member_id == a.user.identity.id:
		a.error.label(400, "errors.use_leave_to_remove_yourself")
		return

	# Check if target is actually a member
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
		a.error.label(404, "errors.member_not_found_in_this_chat")
		return

	# Remove the member
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member_id)
	# Stop serving them replay of this host's stream. The other members revoke
	# from theirs when they handle the member/remove event below.
	mochi.broadcast.subscriber.remove(chat["id"], member_id)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify remaining members. The removed member's row is already gone
	# from `members`, so `remaining` excludes them; the sender is excluded
	# via the broadcast helper's `exclude` arg.
	remaining = mochi.db.rows("select member from members where chat=?", chat["id"])
	remaining_ids = [m["member"] for m in remaining]
	broadcast_chat(chat["id"], a.user.identity.id, remaining_ids, "member/remove", {"id": chat["id"], "member": member_id}, exclude=a.user.identity.id)

	# A person from Matrix is put out of the room by the member who relays
	# them, here or on hearing of it; a Mochi member's stand-in leaves it.
	if relayed:
		if relayed["relay"] == a.user.identity.id and chat.get("relay"):
			mochi.bridge.remove(chat["relay"], member_id)
		elif relayed["relay"] not in remaining_ids:
			broadcast_chat(chat["id"], a.user.identity.id, [relayed["relay"]], "member/remove", {"id": chat["id"], "member": member_id})
		chat_websocket(chat["key"], {"event": "member/remove", "member": member_id})
		return {"data": {"success": True}}
	if chat.get("relay"):
		mochi.bridge.leave(chat["relay"], member_id)
	bridge_depart(chat, member_id)

	# Send removed event to the removed member. Single recipient with no
	# stream to sequence against — stays on raw mochi.message.send.
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "removed"}, {"id": chat["id"]})

	chat_websocket(chat["key"], {"event": "member/remove", "member": member_id})
	return {"data": {"success": True}}


# === Signals, threads and conversations on other networks (the federation plan, phase 22) ===
#
# Typing, delivery receipts, displayed markers and presence go between Mochi
# members over P2P as short-lived events, each as the sender's switches allow.
# A conversation may instead belong to one of the user's hosted fediverse
# accounts: its other members are people on that network by their own ids, and
# its messages are direct Notes sent and received through the account.

# How long a typing indicator stands without a fresh one, and how long a
# receipt waits for an offline member before it is no longer worth sending.
TYPING_WINDOW = 8
RECEIPT_EXPIRES = 86400

# The sharing switches beside the policy, each on until the user turns it off.
SWITCHES = ("presence", "receipts", "typing")

# The networks chat holds conversations on through an account, and the
# messaging address schemes (vCard IMPP) that name a person on each.
CHAT_NETWORKS = ("fediverse",)
ADDRESS_SCHEMES = {"acct": "fediverse", "xmpp": "xmpp", "matrix": "matrix"}

# The most people a conversation on another network is had with at once.
DIRECT_MAXIMUM = 20

PUBLIC = ("https://www.w3.org/ns/activitystreams#Public", "as:Public", "Public")

def chat_schema_federation():
	"""The columns and table of phase 22, at creation and by the migration
	alike: the account a conversation is on and the kind of object its
	network takes; a message's thread and its id on another network; and each
	member's delivered and displayed watermarks."""
	column_add("chats", "account", "text not null default ''")
	column_add("chats", "kind", "text not null default ''")
	column_add("messages", "thread", "text not null default ''")
	column_add("messages", "remote", "text not null default ''")
	mochi.db.execute("create index if not exists messages_thread on messages( chat, thread )")
	mochi.db.execute("create index if not exists messages_remote on messages( remote )")
	mochi.db.execute("create table if not exists receipts ( chat text not null, member text not null, delivered integer not null default 0, displayed integer not null default 0, primary key ( chat, member ) )")

def chat_switch(preference, name):
	"""Whether a sharing switch is on; each is on until turned off."""
	return preference.get("chat_" + name) != "0"

def chat_peers(chat_id, me):
	"""The other members a Mochi event goes to: Mochi identities alone, since a
	conversation on another network is had through its account."""
	return [m["member"] for m in mochi.db.rows("select member from members where chat=? and member!=?", chat_id, me) or [] if mochi.text.valid(m["member"], "entity")]

def chat_member_of(a, chat_id):
	"""The chat an action names, when the caller is a member of it, else None
	having answered."""
	if not mochi.text.valid(chat_id, "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return None
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return None
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id) and chat["status"] not in ("left", "removed"):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return None
	return chat

def chat_shared(me, other):
	"""Whether two people are members of an active conversation together."""
	return mochi.db.exists("select 1 from members a join members b on a.chat=b.chat join chats c on c.id=a.chat where a.member=? and b.member=? and c.status='active'", me, other)

# --- Typing ---

def action_typing(a):
	"""Tell the other members the user is typing, where the user's switch
	allows and the conversation is a Mochi one. The client calls it at most
	every few seconds while the user types."""
	chat = chat_member_of(a, a.input("chat"))
	if not chat or not chat_write_allowed(a, chat):
		return
	if not chat_switch(a.user.preference, "typing"):
		return {"data": {"sent": False}}
	# A linked XMPP or Matrix conversation is told through its account; other
	# networks have no typing.
	if chat.get("account"):
		acc = chat_account(chat)
		target = linked_target(chat) if acc and acc["network"] in LINKED_CHAT else ""
		if target:
			mochi.account.typing(acc["id"], target)
		return {"data": {"sent": bool(target)}}
	now = mochi.time.now()
	for peer in chat_peers(chat["id"], a.user.identity.id):
		mochi.message.send({"from": a.user.identity.id, "to": peer, "service": "chat", "event": "typing"}, {"chat": chat["id"], "at": now}, expires=TYPING_WINDOW)
	return {"data": {"sent": True}}

def event_typing(e):
	"""A member is typing: shown on the conversation's open tabs while fresh."""
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return
	member = mochi.db.row("select member, name from members where chat=? and member=?", chat_id, e.header("from"))
	if not member:
		return
	at = content_number(e, "at", 0)
	now = mochi.time.now()
	if at < now - TYPING_WINDOW or at > now + TYPING_WINDOW:
		return
	chat_websocket(chat["key"], {"event": "typing", "member": member["member"], "name": member["name"], "at": at})

# --- Receipts ---

def receipt_send(me, peer, chat_id, delivered=0, displayed=0):
	"""Tell a member how far this user has received or read a conversation."""
	data = {"chat": chat_id}
	if delivered:
		data["delivered"] = delivered
	if displayed:
		data["displayed"] = displayed
	mochi.message.send({"from": me, "to": peer, "service": "chat", "event": "receipt"}, data, expires=RECEIPT_EXPIRES)

def event_receipt(e):
	"""A member's delivered or displayed watermark: their copy holds, or they
	have read, every message up to that time. Each only moves forward, and
	read implies received."""
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat_active(chat):
		return
	member = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat_id, member):
		return
	limit = mochi.time.now() + 86400
	delivered = min(max(content_number(e, "delivered", 0), 0), limit)
	displayed = min(max(content_number(e, "displayed", 0), 0), limit)
	if not delivered and not displayed:
		return
	delivered = max(delivered, displayed)
	mochi.db.execute("insert into receipts ( chat, member, delivered, displayed ) values ( ?, ?, ?, ? ) on conflict ( chat, member ) do update set delivered=max(delivered, excluded.delivered), displayed=max(displayed, excluded.displayed)", chat_id, member, delivered, displayed)
	row = mochi.db.row("select delivered, displayed from receipts where chat=? and member=?", chat_id, member)
	chat_websocket(chat["key"], {"event": "receipt", "member": member, "delivered": row["delivered"], "displayed": row["displayed"]})

def chat_receipts(chat_id):
	"""Each member's watermarks, as the conversation shows its ticks."""
	return mochi.db.rows("select r.member, m.name, r.delivered, r.displayed from receipts r join members m on m.chat=r.chat and m.member=r.member where r.chat=?", chat_id) or []

# --- Presence ---

def action_presence(a):
	"""Whether another member of a Mochi conversation is online, and when they
	were last seen, as they share it: the other member of a one-to-one
	conversation, or the member named. Seeing others' presence does not depend
	on sharing one's own."""
	chat = chat_member_of(a, a.input("chat"))
	if not chat:
		return
	if chat.get("account"):
		# A linked XMPP or Matrix conversation's other member shows what
		# their network last said of them.
		acc = chat_account(chat)
		other = linked_target(chat) if acc and acc["network"] in LINKED_CHAT and not chat.get("room") else ""
		if acc and acc["network"] == "matrix" and chat.get("room"):
			people = [m["member"] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if not mochi.text.valid(m["member"], "entity")]
			other = people[0] if len(people) == 1 else ""
		row = mochi.db.row("select status, message, seen from presence where account=? and member=?", acc["id"], other) if other else None
		if not row:
			return {"data": {"member": other, "status": "", "message": "", "seen": 0}}
		return {"data": {"member": other, "status": row["status"], "message": row["message"], "seen": row["seen"]}}
	member = a.input("member", "") or ""
	if not member:
		peers = chat_peers(chat["id"], a.user.identity.id)
		member = peers[0] if len(peers) == 1 else ""
	if not mochi.text.valid(member, "entity") or member == a.user.identity.id or not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member):
		a.error.label(400, "errors.invalid_member_id")
		return
	answer = mochi.remote.request(member, "chat", "presence", {"chat": chat["id"]})
	status = str((answer or {}).get("status", "") or "")
	if not answer or answer.get("error") or status not in ("online", "away", "busy", "offline"):
		return {"data": {"member": member, "status": "offline", "message": "", "seen": 0}}
	seen = answer.get("seen", 0)
	return {"data": {"member": member, "status": status, "message": str(answer.get("message", "") or "")[:200], "seen": int(seen) if type(seen) in ("int", "float") else 0}}

def event_presence(e):
	"""Answer a person's question whether the user is online: a friend or a
	member of a conversation with the user is told, unless the user has turned
	sharing off; anyone else, and everyone then, sees the user offline."""
	asker = e.header("from")
	me = e.header("to")
	known = bool(mochi.service.call("friends", "get", me, asker)) or chat_shared(me, asker)
	if not known or not chat_switch(e.user.preference, "presence"):
		e.stream.write({"status": "offline", "message": "", "seen": 0})
		return
	presence = mochi.presence.get() or {}
	e.stream.write({"status": presence.get("status", "offline"), "message": presence.get("message", ""), "seen": presence.get("seen", 0)})

# --- Threads ---

def thread_root(chat_id, thread):
	"""Whether a message may start a thread: one of the conversation's own,
	not itself in a thread, not deleted."""
	return mochi.text.valid(thread, "id") and mochi.db.exists("select 1 from messages where id=? and chat=? and thread=''", thread, chat_id) and not mochi.db.exists("select 1 from deletions where message=?", thread)

def thread_counts(chat_id, roots):
	"""How many replies each root has, and when the latest came."""
	out = {}
	for start in range(0, len(roots), _LIST_BATCH):
		batch = roots[start:start + _LIST_BATCH]
		places = ", ".join(["?" for _ in batch])
		for row in mochi.db.rows("select thread, count(*) as replies, max(created) as latest from messages where chat=? and thread in (" + places + ") and id not in (select message from deletions where chat=?) group by thread", chat_id, *(batch + [chat_id])) or []:
			out[row["thread"]] = {"replies": row["replies"], "latest": row["latest"]}
	return out

# --- Accounts ---

def hosted_accounts():
	"""The user's hosted fediverse accounts, which conversations on that
	network are had through."""
	return [acc for acc in (mochi.account.list("network") or []) if acc.get("hosted") and acc.get("type") in CHAT_NETWORKS and acc.get("url")]

def chat_account(chat):
	"""The account a conversation is on, with its network, or None for a Mochi
	one or where the account is gone."""
	if not chat or not chat.get("account"):
		return None
	acc = mochi.account.get(chat["account"])
	network = account_network(acc)
	if not network:
		return None
	acc["network"] = network
	return acc

def address_network(address):
	"""The network a messaging address (vCard IMPP) names a person on, by its
	scheme, or ''."""
	scheme, _, rest = str(address or "").strip().partition(":")
	return ADDRESS_SCHEMES.get(scheme.lower(), "") if rest else ""

def function_reachable(context, address):
	"""The user's accounts chat can message a messaging address through, as
	{id, identifier}, for a contact's message action: a fediverse address
	through a hosted fediverse or linked Mastodon account, an XMPP or Matrix
	one through a hosted or linked account there; none where the user has no
	such account."""
	reaches = REACHES.get(address_network(address), ())
	return [{"id": acc["id"], "identifier": acc.get("identifier", "")} for acc in chat_accounts() if acc["network"] in reaches]

def remote_resolve(address):
	"""A person on another network by their address or id, as a member row:
	(id, name), or None."""
	value = str(address or "").strip()
	if value.lower().startswith("acct:"):
		value = value[5:]
	found = mochi.account.resolve(value)
	if not found or found.get("network") not in CHAT_NETWORKS or found.get("type") not in ("person", "service", "application") or not remote_ok(found.get("id", "")):
		return None
	name = str(found.get("name", "") or found.get("address", "") or found["id"]).strip()[:200]
	if not mochi.text.valid(name, "display"):
		name = str(found.get("address", "") or found["id"])[:200]
	return (found["id"], name)

def remote_ok(value):
	"""An id on another network: a web address within length."""
	value = str(value or "")
	return bool(value) and len(value) <= 2000 and (value.startswith("https://") or value.startswith("http://"))

def chat_create_remote(a, account, name, addresses):
	result, failure = remote_create(account, name, addresses, a.user.identity.id, a.user.identity.name, "")
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def remote_create(account, name, addresses, user_id, user_name, kind):
	"""A conversation on one of the user's hosted accounts with people on its
	network, by their addresses; the existing one-to-one conversation with the
	same person where there is one. kind is the object a new one sends:
	ChatMessage, as Lemmy's private messages are, else a direct Note. Answers
	({id, name, members}, None) or (None, failure)."""
	acc = mochi.account.get(account) if account else None
	if not acc or not any([h["id"] == acc["id"] for h in hosted_accounts()]):
		return None, (400, "errors.invalid_account")
	people = []
	for address in addresses:
		person = remote_resolve(address)
		if not person:
			return None, (404, "errors.person_not_found_on_network")
		if person[0] != acc["url"] and person[0] not in [p[0] for p in people]:
			people.append(person)
	if not people or len(people) > DIRECT_MAXIMUM:
		return None, (400, "errors.too_many_members", {"maximum": DIRECT_MAXIMUM})
	chat = remote_conversation(acc["id"], [p[0] for p in people])
	if chat:
		return {"id": chat["id"], "name": chat["name"], "members": []}, None
	if len(people) == 1:
		name = people[0][1]
	if not mochi.text.valid(name, "name"):
		return None, (400, "errors.invalid_chat_name")
	chat = remote_chat_make(acc, name, kind, user_id, user_name, people)
	return {"id": chat, "name": name, "members": [{"id": p[0], "name": p[1]} for p in people]}, None


def remote_conversation(account, people):
	"""The active conversation on an account with exactly these people, or
	None. A room counts only where it is marked one-to-one: a group room whose
	other members happen to be the same people is not the conversation with
	them."""
	wanted = sorted(people)
	candidates = mochi.db.rows("select c.id, c.name from chats c join members m on m.chat=c.id where c.account=? and c.status='active' and m.member=? and (c.room='' or c.kind='direct') order by c.updated desc", account, wanted[0]) or []
	for chat in candidates:
		others = sorted([m["member"] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if not mochi.text.valid(m["member"], "entity")])
		if others == wanted:
			return chat
	return None

def remote_chat_make(acc, name, kind, me, my_name, people):
	"""Make a conversation on an account, the user and the people its members."""
	chat = mochi.uid()
	mochi.db.execute("insert into chats ( id, name, key, updated, account, kind ) values ( ?, ?, ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now(), acc["id"], kind)
	mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat, me, my_name)
	for person in people:
		mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat, person[0], person[1])
	return chat

def remote_note(chat, acc, message):
	"""A message as the object the network takes: a direct Note addressed to
	the conversation's other members and mentioning them, in reply to the
	conversation's record before it; a ChatMessage where the conversation came
	as one, as Lemmy's private messages do. None with no one to address."""
	body = message.get("body", "")
	people = [m["member"] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if remote_ok(m["member"]) and m["member"] != acc["url"]]
	# An object addressed to no one is public, so with no one left to write
	# to nothing is written.
	if not people:
		return None
	html = mochi.text.fediverse(body or "")["html"]
	if chat.get("kind") == "ChatMessage":
		note = {"type": "ChatMessage", "content": html, "mediaType": "text/html", "to": people[:1]}
	else:
		note = {"type": "Note", "content": html, "mediaType": "text/html", "to": people, "cc": [], "tag": [{"type": "Mention", "href": p} for p in people]}
		before = mochi.db.row("select remote from messages where chat=? and remote!='' and id!=? and created<=? order by created desc limit 1", chat["id"], message["id"], message["created"])
		if before:
			note["inReplyTo"] = before["remote"]
	note["source"] = {"content": body or "", "mediaType": "text/plain"}
	return note

def remote_documents(acc, attachments):
	"""The message's files uploaded through the account, as the documents the
	Note lists."""
	documents = []
	for att in attachments or []:
		kind = str(att.get("type", "") or att.get("content_type", "") or "")
		data = mochi.file.read(attachment_filename(att["id"], att["name"]), mochi.file.maximum()) if kind else None
		uploaded = mochi.account.upload(acc["id"], data, kind, name=att["name"], description=att.get("caption", "")) if data != None else None
		if uploaded and type(uploaded.get("data")) == "dict":
			documents.append(uploaded["data"])
	return documents

def remote_send(chat, message_id, body, attachments):
	"""Send a message of a conversation on another network through its
	account, and keep its record. Answers False where it could not go."""
	acc = chat_account(chat)
	if not acc:
		return False
	if acc["network"] != "fediverse":
		message = mochi.db.row("select * from messages where id=?", message_id)
		if acc["network"] == "mastodon":
			return mastodon_send(chat, acc, message, attachments)
		return linked_send(chat, acc, message, attachments)
	note = remote_note(chat, acc, {"id": message_id, "body": body, "created": mochi.time.now()})
	if not note:
		return False
	documents = remote_documents(acc, attachments)
	if documents:
		note["attachment"] = documents
	result = mochi.account.object.create(acc["id"], note, key="chat|" + message_id)
	if not result or not result.get("id"):
		return False
	mochi.db.execute("update messages set remote=? where id=?", str(result["id"]), message_id)
	return True

def remote_edit(chat, message):
	acc = chat_account(chat)
	if acc and acc["network"] != "fediverse":
		if message.get("remote"):
			linked_edit(chat, acc, message)
		return
	note = remote_note(chat, acc, message) if acc and message.get("remote") else None
	if note:
		mochi.account.object.update(acc["id"], message["remote"], note)

def remote_delete(chat, message_id, remote):
	acc = chat_account(chat)
	if acc and acc["network"] != "fediverse":
		linked_delete(chat, acc, message_id, remote)
	elif acc and remote:
		mochi.account.object.delete(acc["id"], remote)

# --- Direct messages arriving ---

def listed(value):
	if value == None:
		return []
	if type(value) in ("list", "tuple"):
		return list(value)
	return [value]

def object_id(value):
	if type(value) == "dict":
		return str(value.get("id", "") or "")
	return str(value or "")

def host_of(url):
	rest = str(url or "").split("://", 1)
	return rest[1].split("/", 1)[0].lower() if len(rest) == 2 else ""

def direct_addressed(acc, activity, object):
	"""Whether a Note is a direct message to the account: addressed to it and
	to neither the public nor anyone's followers, nor posted in a community
	(which names its audience). A ChatMessage always is."""
	addresses = []
	for source in (activity, object):
		for key in ("to", "cc", "bto", "bcc"):
			addresses += [object_id(x) for x in listed(source.get(key))]
	if object.get("type") == "ChatMessage":
		return acc["url"] in addresses
	if activity.get("audience") or object.get("audience"):
		return False
	for address in addresses:
		if address in PUBLIC or address.endswith("/followers"):
			return False
	return acc["url"] in addresses

def direct_people(acc, actor, activity, object):
	"""Who a direct message is between, besides the user: the sender and
	everyone else it is addressed to."""
	people = [actor]
	for source in (activity, object):
		for key in ("to", "cc"):
			for address in [object_id(x) for x in listed(source.get(key))]:
				if remote_ok(address) and address != acc["url"] and address not in people:
					people.append(address)
	return people[:DIRECT_MAXIMUM]

def html_text(html):
	"""A message's HTML as the plain text chat keeps: tags gone, blocks and
	breaks as new lines, entities decoded."""
	text = str(html or "")
	for tag in ("<br>", "<br/>", "<br />", "</p>", "</div>", "</li>"):
		text = text.replace(tag, tag + "\n")
	out = []
	inside = False
	for c in text.elems():
		if inside:
			if c == ">":
				inside = False
		elif c == "<":
			inside = True
		else:
			out.append(c)
	text = "".join(out)
	for entity, value in (("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"), ("&nbsp;", " "), ("&amp;", "&")):
		text = text.replace(entity, value)
	while "\n\n\n" in text:
		text = text.replace("\n\n\n", "\n\n")
	return text.strip()

def direct_accepted(acc, actor):
	"""Whether a person may start a conversation with the user on the account:
	anyone where the user's policy is anyone, else someone the account follows."""
	if (mochi.user.preference.get("chat_policy") or "friends") == "anyone":
		return True
	return bool(mochi.account.following(acc["id"], actor=actor))

def function_activitypub_receive(context, account, activities):
	"""The activities core's engine queued for a hosted account: a direct
	message becomes a message of the conversation it belongs to, made where
	the person may start one; an edit or deletion of one follows it."""
	# A community's group account is the forum's, not the person's.
	acc = mochi.account.get(account)
	if not acc or not acc.get("hosted") or acc.get("kind") == "group" or acc.get("type") not in CHAT_NETWORKS or not acc.get("url"):
		return None
	identity = None
	for e in mochi.entity.owned() or []:
		if e.get("class") == "person":
			identity = e
			break
	if not identity:
		return None
	for item in activities or []:
		if type(item) != "dict":
			continue
		actor = str(item.get("actor", "") or "")
		kind = str(item.get("type", "") or "")
		activity = item.get("activity")
		if type(activity) != "dict" or not remote_ok(actor) or host_of(actor) != host_of(object_id(activity.get("id"))):
			continue
		object = activity.get("object")
		if kind == "Create" and type(object) == "dict" and object.get("type") in ("Note", "ChatMessage"):
			direct_received(acc, identity, actor, activity, object)
		elif kind == "Update" and type(object) == "dict":
			direct_updated(actor, object)
		elif kind == "Delete":
			direct_deleted(actor, object_id(object))
	return None

def direct_received(acc, identity, actor, activity, object):
	remote = object_id(object.get("id"))
	if not remote_ok(remote) or host_of(remote) != host_of(actor) or object_id(object.get("attributedTo")) not in ("", actor):
		return
	if not direct_addressed(acc, activity, object) or mochi.db.exists("select 1 from messages where remote=?", remote):
		return
	people = direct_people(acc, actor, activity, object)
	chat = remote_conversation(acc["id"], people)
	if not chat:
		if not direct_accepted(acc, actor):
			mochi.log.info("Chat dropping a direct message from %s: the policy does not take it", actor)
			return
		resolved = [remote_resolve(p) or (p, p) for p in people]
		name = resolved[0][1] if len(resolved) == 1 else ", ".join([r[1] for r in resolved])[:200]
		if not mochi.text.valid(name, "name"):
			name = actor[:200]
		kind = "ChatMessage" if object.get("type") == "ChatMessage" else ""
		chat = mochi.db.row("select * from chats where id=?", remote_chat_make(acc, name, kind, identity["id"], identity.get("name", ""), resolved))
	else:
		chat = mochi.db.row("select * from chats where id=?", chat["id"])
	member = mochi.db.row("select member, name from members where chat=? and member=?", chat["id"], actor)
	if not member:
		return
	body = html_text(object.get("content", ""))
	for attachment in listed(object.get("attachment")):
		link = object_id(attachment.get("url")) if type(attachment) == "dict" else ""
		if type(attachment) == "dict" and type(attachment.get("url")) == "string":
			link = attachment["url"]
		if remote_ok(link):
			body = (body + "\n" + link).strip()
	if not body or not mochi.text.valid(body, "text"):
		return
	body = body[:10000]
	created = mochi.time.parse(str(object.get("published", "") or "")) or mochi.time.now()
	now = mochi.time.now()
	if created > now + 86400 or created < now - 31536000:
		created = now
	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, chat, member, name, body, created, remote ) values ( ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], actor, member["name"], body, created, remote)
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)
	notify("message", chat["id"], mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=member["name"], excerpt=body.strip()[:80]), "/chat/" + chat["id"], chat["name"], event_id="message:" + id)

def direct_updated(actor, object):
	"""A sender's edit of a direct message they sent."""
	message = mochi.db.row("select * from messages where remote=? and member=?", object_id(object.get("id")), actor)
	if not message or mochi.db.exists("select 1 from deletions where message=?", message["id"]):
		return
	body = html_text(object.get("content", ""))
	if not body or not mochi.text.valid(body, "text"):
		return
	mochi.db.execute("update messages set body=?, edited=? where id=?", body[:10000], mochi.time.now(), message["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message["id"])

def direct_deleted(actor, remote):
	"""A sender's deletion of a direct message they sent."""
	message = mochi.db.row("select * from messages where remote=? and member=?", remote, actor) if remote_ok(remote) else None
	if message:
		message_delete_apply(message["chat"], message["id"], actor, mochi.time.now())

# === Conversations on linked accounts (the federation plan, phase 23) ===
#
# A conversation may belong to one of the user's linked accounts on another
# network: an XMPP or Matrix account's one-to-one conversations and rooms, and
# a Mastodon account's direct messages. A hosted Matrix account's rooms and a
# hosted XMPP account's conversations come from core's own engines in the same
# events (phases 24 and 25), so they are held the same way. The account's session in core hands
# what it hears to function_linked_receive as conversation events, and what
# the user does goes out through the account. A room keeps its id on its
# network in the room column; a one-to-one XMPP or Mastodon conversation is
# known by its people. Typing, receipts and presence follow the user's
# switches as on Mochi. A conversation its network encrypts is decrypted and
# encrypted by core, which holds the account's device (phase 27): its messages
# come here readable, those whose keys have not yet come as encrypted with no
# text, filled in once the keys come (decrypted).
# Who may write is the account's server's to decide, so chat's policy does
# not apply; an invitation to a room waits for the user to accept or decline.
# A hosted account's server is this one, so the policy applies there: core's
# XMPP engine asks function_linked_accept before taking a stranger's message.

# The networks a linked account holds conversations on, and those of them with
# typing, read markers and presence.
LINKED_NETWORKS = ("xmpp", "matrix", "mastodon")
LINKED_CHAT = ("xmpp", "matrix")

# The accounts that reach a person on each network an address names.
REACHES = {"fediverse": ("fediverse", "mastodon"), "xmpp": ("xmpp",), "matrix": ("matrix",)}

# How long another network's typing stands with no word that it stopped.
TYPING_HELD = 30

# The longest id a network gives a message or a conversation, and the most
# files a message brings.
REMOTE_MAXIMUM = 2000
FILES_MAXIMUM = 10

def column_add(table, column, ddl):
	if not any([c["name"] == column for c in mochi.db.table(table)]):
		mochi.db.execute("alter table " + table + " add column " + column + " " + ddl)

def chat_schema_linked():
	"""The columns and tables of phase 23, at creation and by the migration
	alike: a conversation's id on its network where it is a room, and whether
	the network encrypts it; whether a message came encrypted; a message's
	further ids on its network (its files, and the id a room gave it); and the
	presence each person on another network last showed."""
	column_add("chats", "room", "text not null default ''")
	column_add("chats", "encrypted", "integer not null default 0")
	column_add("messages", "encrypted", "integer not null default 0")
	mochi.db.execute("create index if not exists chats_room on chats( account, room )")
	mochi.db.execute("create table if not exists parts ( message text not null, remote text not null, kind text not null default 'file', primary key ( message, remote ) )")
	mochi.db.execute("create index if not exists parts_remote on parts( remote )")
	mochi.db.execute("create table if not exists presence ( account text not null, member text not null, status text not null default 'offline', message text not null default '', seen integer not null default 0, primary key ( account, member ) )")

def chat_schema_matrix():
	"""The columns of phase 24, at creation and by the migration alike: a
	reaction's id on Matrix, so withdrawing it there withdraws it here; and
	for a group with people from Matrix, the member whose server relays each
	of them and, on that member's own copy, the room it relays through."""
	column_add("reactions", "remote", "text not null default ''")
	column_add("members", "relay", "text not null default ''")
	column_add("chats", "relay", "text not null default ''")
	mochi.db.execute("create index if not exists reactions_remote on reactions( remote )")
	mochi.db.execute("create index if not exists chats_relay on chats( relay )")

def chat_schema_xmpp():
	"""The columns and table of phase 26, at creation and by the migration
	alike: an XMPP message's encrypted content as it came, kept for a hosted
	account's archive to give its other devices; a member's role in a room on
	another network; and the address each file of a message came or went
	with there, by the id of the message it went in, for the archive."""
	column_add("messages", "payload", "text not null default ''")
	column_add("members", "role", "text not null default ''")
	mochi.db.execute("create table if not exists links ( message text not null, remote text not null default '', url text not null, primary key ( message, url ) )")

def chat_schema_encryption():
	"""The column of phase 27, at creation and by the migration alike: the
	encrypted content a file went as to an XMPP conversation, which a hosted
	account's archive gives its other devices."""
	column_add("links", "payload", "text not null default ''")

# The largest encrypted content kept with a message.
PAYLOAD_MAXIMUM = 65536

# A reaction's emoji on Matrix, as chat's web client shows each, and the
# reactions read back by their emoji.
REACTION_EMOJI = {"like": "👍", "dislike": "👎", "laugh": "😂", "amazed": "😮", "love": "😍", "sad": "😢", "angry": "😡", "agree": "🤝", "disagree": "🙅"}
REACTION_NAMES = dict([(emoji, name) for name, emoji in REACTION_EMOJI.items()] + [("❤", "love"), ("😆", "laugh"), ("😮", "amazed"), ("😲", "amazed"), ("😠", "angry")])

def reaction_name(emoji):
	"""The reaction an emoji on Matrix is, or '' for one chat has none for."""
	return REACTION_NAMES.get(str(emoji or "").replace("\ufe0f", "").strip(), "")

# --- Accounts ---

def account_network(acc):
	"""The network an account holds conversations on, or ''."""
	if not acc:
		return ""
	if acc.get("hosted"):
		if acc.get("type") in ("matrix", "xmpp"):
			return acc["type"]
		return "fediverse" if acc.get("type") in CHAT_NETWORKS and acc.get("url") and acc.get("kind") != "group" else ""
	return acc.get("type", "") if acc.get("type") in LINKED_NETWORKS else ""

def chat_accounts():
	"""The accounts conversations are had through, each with its network: the
	user's hosted fediverse, Matrix and XMPP accounts and their linked XMPP,
	Matrix and Mastodon accounts, as enabled."""
	out = []
	seen = {}
	social = [acc for acc in (mochi.account.list("social") or []) if acc.get("type") == "mastodon"]
	engines = [acc for acc in (mochi.account.list("network") or []) if acc.get("hosted") and acc.get("type") in ("matrix", "xmpp")]
	for acc in hosted_accounts() + engines + list(mochi.account.list("chat") or []) + social:
		network = account_network(acc)
		if network and acc["id"] not in seen and acc.get("enabled", 1) != 0:
			seen[acc["id"]] = True
			acc["network"] = network
			out.append(acc)
	return out

def account_entry(acc):
	"""An account as the client lists it."""
	return {"id": acc["id"], "identifier": acc.get("identifier", ""), "network": acc["network"]}

def chat_identity():
	"""The user's own identity, for a function core calls with no action."""
	for e in mochi.entity.owned() or []:
		if e.get("class") == "person":
			return e
	return None

def linked_person(network, address):
	"""A person on a linked account's network by an address as typed or as a
	messaging address gives it - xmpp:name@host, @name:host or
	matrix:u/name:host, acct:name@host - in the form chat keeps; None where it
	is not one."""
	value = str(address or "").strip().split("?")[0]
	lower = value.lower()
	if network == "xmpp":
		if lower.startswith("xmpp:"):
			value = value[5:]
		if value.count("@") != 1 or "/" in value or " " in value or len(value) > 500 or value.startswith("@") or value.endswith("@"):
			return None
		return "xmpp:" + value.lower()
	if network == "matrix":
		if lower.startswith("matrix:u/"):
			value = "@" + value[9:]
		if not value.startswith("@") or value.count(":") < 1 or " " in value or len(value) > 255:
			return None
		return value
	if network == "mastodon":
		if lower.startswith("acct:"):
			value = value[5:]
		value = value.lstrip("@")
		if value.count("@") != 1 or " " in value or len(value) > 300 or value.endswith("@"):
			return None
		return "acct:" + value.lower()
	return None

def linked_room_address(network, address):
	"""A Matrix room's address (#alias:host, !id:host, or a matrix: address of
	either), or None. An XMPP room's address looks like a person's, so it is
	told apart by asking."""
	if network != "matrix":
		return None
	value = str(address or "").strip().split("?")[0]
	lower = value.lower()
	if lower.startswith("matrix:r/"):
		value = "#" + value[9:]
	elif lower.startswith("matrix:roomid/"):
		value = "!" + value[14:]
	if (value.startswith("#") or value.startswith("!")) and ":" in value and " " not in value and len(value) <= 255:
		return value
	return None

def linked_self(acc):
	"""The account as chat knows its people."""
	identifier = str(acc.get("identifier", "") or "")
	if acc.get("network") == "xmpp":
		return "xmpp:" + identifier.lower()
	if acc.get("network") == "mastodon":
		return "acct:" + identifier.lstrip("@").lower()
	return identifier

def linked_chat_make(acc, name, room, me, my_name, people, status="active"):
	"""Make a conversation on a linked account: the user and the people its
	members, a room keeping its id."""
	chat = mochi.uid()
	mochi.db.execute("insert into chats ( id, name, key, updated, account, kind, room, status ) values ( ?, ?, ?, ?, ?, '', ?, ? )", chat, name[:200], mochi.random.alphanumeric(16), mochi.time.now(), acc["id"], room, status)
	mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat, me, my_name)
	for person in people:
		mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat, person[0], person[1][:200])
	return mochi.db.row("select * from chats where id=?", chat)

def chat_create_linked(a, acc, name, addresses):
	"""A conversation on a linked account: a room joined by its address, a
	one-to-one conversation with one person (the one there is, where there is
	one), or a new room with several."""
	network = acc["network"]
	me = a.user.identity.id
	if not addresses:
		a.error.label(400, "errors.too_many_members", maximum=DIRECT_MAXIMUM)
		return
	# A room, joined by its address.
	if len(addresses) == 1 and network in LINKED_CHAT:
		address = linked_room_address(network, addresses[0])
		if not address and network == "xmpp":
			address = linked_person(network, addresses[0])
		joined = mochi.account.room.join(acc["id"], address) if address else None
		if joined and joined.get("conversation"):
			conversation = str(joined["conversation"])
			chat = linked_find(acc, conversation)
			if not chat:
				chat = linked_chat_make(acc, str(joined.get("name", "") or "") or address, conversation, me, a.user.identity.name, [])
			elif chat["status"] != "active":
				linked_rejoin(chat, me, a.user.identity.name)
			return {"data": {"id": chat["id"], "name": chat["name"], "members": []}}
		if linked_room_address(network, addresses[0]):
			a.error.label(404, "errors.person_not_found_on_network")
			return
	people = []
	for address in addresses:
		person = linked_person(network, address)
		if not person:
			a.error.label(404, "errors.person_not_found_on_network")
			return
		if person != linked_self(acc) and person not in people:
			people.append(person)
	if not people or len(people) > DIRECT_MAXIMUM:
		a.error.label(400, "errors.too_many_members", maximum=DIRECT_MAXIMUM)
		return
	if len(people) == 1:
		existing = remote_conversation(acc["id"], people)
		if existing:
			return {"data": {"id": existing["id"], "name": existing["name"], "members": []}}
	elif not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_chat_name")
		return
	if network == "mastodon":
		named = []
		for person in people:
			found = mochi.account.resolve(person[5:])
			if not found or found.get("network") != "fediverse":
				a.error.label(404, "errors.person_not_found_on_network")
				return
			label = str(found.get("name", "") or "").strip()
			named.append((person, label if mochi.text.valid(label, "display") else person[5:]))
		chat = linked_chat_make(acc, named[0][1] if len(named) == 1 else name, "", me, a.user.identity.name, named)
		return {"data": {"id": chat["id"], "name": chat["name"], "members": [{"id": p[0], "name": p[1]} for p in named]}}
	made = mochi.account.room.create(acc["id"], [p[len("xmpp:"):] if network == "xmpp" else p for p in people], name=name if len(people) > 1 else "")
	if not made or not made.get("conversation"):
		a.error.label(404, "errors.person_not_found_on_network")
		return
	named = []
	for p in listed(made.get("people")):
		label = str(p.get("name", "") or "")
		named.append((str(p["id"]), label if mochi.text.valid(label, "display") else str(p["id"])))
	room = str(made["conversation"]) if network == "matrix" or made.get("room") else ""
	label = named[0][1] if len(named) == 1 else name
	# The account's sync may bring the new room before its answer does, and
	# make the conversation for it first.
	chat = mochi.db.row("select * from chats where account=? and room=?", acc["id"], room) if room else None
	if chat:
		mochi.db.execute("update chats set name=? where id=?", label[:200], chat["id"])
		for person in named:
			mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat["id"], person[0], person[1][:200])
	else:
		chat = linked_chat_make(acc, label, room, me, a.user.identity.name, named)
	# A room made for one person is the one-to-one conversation with them.
	if room and len(named) == 1:
		mochi.db.execute("update chats set kind='direct' where id=?", chat["id"])
	return {"data": {"id": chat["id"], "name": label[:200], "members": [{"id": p[0], "name": p[1]} for p in named]}}

def linked_rejoin(chat, me, my_name):
	"""A conversation the user left that its network still carries is theirs
	again."""
	mochi.db.execute("update chats set status='active' where id=?", chat["id"])
	mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat["id"], me, my_name)

def linked_find(acc, conversation):
	"""The conversation on an account an id names: a room by its id, else a
	one-to-one conversation by its person."""
	conversation = str(conversation or "")
	if not conversation:
		return None
	room = mochi.db.row("select * from chats where account=? and room=? order by status='active' desc, updated desc limit 1", acc["id"], conversation)
	if room:
		return room
	found = remote_conversation(acc["id"], [conversation])
	return mochi.db.row("select * from chats where id=?", found["id"]) if found else None

def linked_target(chat):
	"""A conversation's id on its network: a room's, else its one person's."""
	if chat.get("room"):
		return chat["room"]
	people = [m["member"] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if not mochi.text.valid(m["member"], "entity")]
	return people[0] if len(people) == 1 else ""

def linked_message_of(acc, remote):
	"""A message of a conversation on an account by its id on the network, or
	by one of its further ids."""
	remote = str(remote or "")
	if not remote:
		return None
	found = mochi.db.row("select m.* from messages m join chats c on c.id=m.chat where c.account=? and m.remote=?", acc["id"], remote)
	if found:
		return found
	return mochi.db.row("select m.* from parts p join messages m on m.id=p.message join chats c on c.id=m.chat where c.account=? and p.remote=?", acc["id"], remote)

def linked_remote(chat_id, message_id):
	"""The id on the network of a message of a conversation, or ''."""
	if not message_id:
		return ""
	row = mochi.db.row("select remote from messages where id=? and chat=?", message_id, chat_id)
	return row["remote"] if row else ""

def linked_local(chat_id, remote):
	"""The message of a conversation a network id names, its own or one of its
	further ids - in an XMPP room the id the room gave it - or None."""
	if not remote:
		return None
	found = mochi.db.row("select id, thread from messages where chat=? and remote=?", chat_id, remote)
	if found:
		return found
	return mochi.db.row("select m.id, m.thread from parts p join messages m on m.id=p.message where m.chat=? and p.remote=?", chat_id, remote)

def linked_reference(chat, acc, message_id):
	"""The id a message is named by on its network when replying or reacting
	to it: in an XMPP room the id the room gave it, else its own."""
	if acc["network"] == "xmpp" and chat.get("room") and message_id:
		row = mochi.db.row("select remote from parts where message=? and kind='archive'", message_id)
		if row:
			return row["remote"]
	return linked_remote(chat["id"], message_id)

# --- What arrives ---

def function_linked_receive(context, account, network, events):
	"""The events a linked account's session heard: messages, their edits and
	withdrawals, typing, receipts, presence, rooms and their members, and
	invitations, each in its conversation."""
	acc = mochi.account.get(account)
	if not acc or acc.get("type") != network or network not in LINKED_NETWORKS or account_network(acc) != network:
		return None
	acc["network"] = network
	identity = chat_identity()
	if not identity:
		return None
	for event in events or []:
		if type(event) != "dict":
			continue
		kind = str(event.get("kind", "") or "")
		if kind == "session":
			if network in LINKED_CHAT:
				mochi.account.presence(acc["id"], chat_switch(mochi.user.preference, "presence"))
		elif kind == "message":
			linked_received(acc, identity, event)
		elif kind == "decrypted":
			linked_decrypted(acc, identity, event)
		elif kind == "edit":
			linked_edited(acc, identity, event)
		elif kind == "delete":
			linked_withdrawn(acc, identity, event)
		elif kind == "reaction":
			linked_reacted(acc, identity, event)
		elif kind == "sent":
			linked_sent(acc, event)
		elif kind == "typing":
			linked_typing(acc, event)
		elif kind == "receipt":
			linked_receipt(acc, event)
		elif kind == "presence":
			linked_presence(acc, event)
		elif kind == "room":
			linked_room(acc, identity, event)
		elif kind == "member":
			linked_member(acc, event)
		elif kind == "invite":
			linked_invite(acc, identity, event)
	return None

def function_linked_accept(context, account, network, person):
	"""Whether someone on another network may write to one of the user's
	hosted accounts, which core's engine asks before taking a message from
	someone not among the account's contacts: chat's acceptance rule."""
	acc = mochi.account.get(account)
	identity = chat_identity()
	if not acc or not acc.get("hosted") or account_network(acc) != network or not identity:
		return False
	return invite_accepted(mochi.user.preference, identity["id"], str(person or ""))

def function_linked_archive(context, account, network, conversation, start, end, after, before, last, maximum):
	"""A page of a hosted XMPP account's archive, which core's engine answers a
	client's archive query from (phase 26): the messages of the account's
	one-to-one conversations, or of the one with a person, between two times;
	from the message an archive id names or up to it, either inclusive, else
	the latest where last and the earliest otherwise. Each with its id in the
	archive, its id on the network, the person, whether the account sent it,
	its text as it stands, when, the message it replies to, its encrypted
	content and its files; with whether more lie beyond the page and whether
	the message named was found. A withdrawn message is left out."""
	acc = mochi.account.get(account)
	identity = chat_identity()
	if not acc or not acc.get("hosted") or account_network(acc) != "xmpp" or network != "xmpp" or not identity:
		return None
	me = identity["id"]
	maximum = min(maximum, 250) if type(maximum) == "int" and maximum >= 0 else 50
	person = linked_person("xmpp", conversation) if conversation else None
	chats = {}
	for c in mochi.db.rows("select id from chats where account=? and room=''", acc["id"]) or []:
		others = [m["member"] for m in mochi.db.rows("select member from members where chat=? and member!=?", c["id"], me) or []]
		if len(others) == 1 and (not person or others[0] == person):
			chats[c["id"]] = others[0]
	mark = str(after or before or "")
	if not chats:
		return {"messages": [], "more": False, "found": not mark}
	where = "chat in (" + ",".join(["?"] * len(chats)) + ") and id not in (select message from deletions) and (body!='' or payload!='' or id in (select message from links))"
	values = list(chats.keys())
	if type(start) == "int" and start > 0:
		where += " and created>=?"
		values.append(start)
	if type(end) == "int" and end > 0:
		where += " and created<=?"
		values.append(end)
	anchor = None
	if mark:
		anchor = mochi.db.row("select m.chat, m.created, m.rowid as place from parts p join messages m on m.id=p.message where p.kind='archive' and p.remote=?", mark) or mochi.db.row("select chat, created, rowid as place from messages where id=?", mark)
		if not anchor or anchor["chat"] not in chats:
			return {"messages": [], "more": False, "found": False}
	order = "asc"
	if after:
		where += " and (created>? or (created=? and rowid>=?))"
		values += [anchor["created"], anchor["created"], anchor["place"]]
	elif before:
		where += " and (created<? or (created=? and rowid<=?))"
		values += [anchor["created"], anchor["created"], anchor["place"]]
		order = "desc"
	elif last == True:
		order = "desc"
	extra = 1 if anchor else 0
	rows = mochi.db.rows("select rowid as place, * from messages where " + where + " order by created " + order + ", rowid " + order + " limit ?", *(values + [maximum + extra + 1])) or []
	more = len(rows) > maximum + extra
	rows = rows[:maximum + extra]
	if order == "desc":
		rows = reversed(rows)
	return {"messages": [linked_archive_entry(chats[m["chat"]], me, m) for m in rows], "more": more, "found": True}

def linked_archive_entry(person, me, message):
	"""A message as a hosted XMPP account's archive gives it."""
	archive = mochi.db.row("select remote from parts where message=? and kind='archive'", message["id"])
	reply = linked_remote(message["chat"], message["reply"]) if message.get("reply") else ""
	files = [{"id": link["remote"], "url": link["url"], "payload": link["payload"]} for link in mochi.db.rows("select remote, url, payload from links where message=? order by rowid", message["id"]) or []]
	return {"archive": archive["remote"] if archive else message["id"], "id": message["remote"], "person": person, "own": message["member"] == me, "body": message["body"], "created": message["created"], "reply": reply, "payload": message.get("payload", "") or "", "files": files}

def linked_name(value, fallback):
	"""A name an event gives, where it is one to show."""
	name = str(value or "").strip()[:200]
	return name if name and mochi.text.valid(name, "display") else str(fallback)[:200]

def linked_body(acc, chat, event):
	"""A message's text: a Mastodon status's HTML as text, without the
	mentions of the conversation's people it begins with."""
	if acc["network"] != "mastodon":
		return str(event.get("body", "") or "")
	text = html_text(event.get("html", ""))
	people = ["@" + m["member"][len("acct:"):] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if m["member"].startswith("acct:")] + ["@" + linked_self(acc)[len("acct:"):]]
	short = [p.split("@")[1] for p in people if p.count("@") == 2]
	for _ in range(DIRECT_MAXIMUM + 1):
		words = text.split(" ", 1)
		head = words[0].lower()
		if head in [p.lower() for p in people] or head.lstrip("@") in short:
			text = words[1].strip() if len(words) > 1 else ""
		else:
			break
	return text

def linked_received(acc, identity, event):
	"""A message: kept in its conversation, which is made where it is new, and
	the user told; one the user sent from elsewhere is theirs."""
	network = acc["network"]
	remote = str(event.get("id", "") or "")[:REMOTE_MAXIMUM]
	if not remote or linked_message_of(acc, remote):
		return
	own = event.get("own") == True
	sender = str(event.get("from", "") or "")[:REMOTE_MAXIMUM]
	me = identity["id"]
	if network == "mastodon":
		people = []
		for p in listed(event.get("people")):
			person = linked_person("mastodon", str(p))
			if person and person != linked_self(acc) and person not in people:
				people.append(person)
		people = people[:DIRECT_MAXIMUM]
		if not people:
			return
		found = remote_conversation(acc["id"], people)
		chat = mochi.db.row("select * from chats where id=?", found["id"]) if found else None
		if not chat:
			named = [(p, linked_name(event.get("name"), p[5:]) if p == sender else p[5:]) for p in people]
			chat = linked_chat_make(acc, named[0][1] if len(named) == 1 else ", ".join([n[1] for n in named]), "", me, identity.get("name", ""), named)
	else:
		conversation = str(event.get("conversation", "") or "")[:REMOTE_MAXIMUM]
		if not conversation:
			return
		chat = linked_find(acc, conversation)
		if not chat:
			if network == "matrix" or event.get("room") == True:
				chat = linked_chat_make(acc, linked_name(event.get("name"), conversation), conversation, me, identity.get("name", ""), [])
			else:
				chat = linked_chat_make(acc, linked_name(event.get("name"), conversation[len("xmpp:"):]), "", me, identity.get("name", ""), [(conversation, linked_name(event.get("name"), conversation[len("xmpp:"):]))])
	if chat["status"] == "invited":
		return
	if chat["status"] != "active":
		linked_rejoin(chat, me, identity.get("name", ""))
	member = me if own else sender
	if not own:
		if not sender:
			return
		mochi.db.execute("insert or ignore into members ( chat, member, name ) values ( ?, ?, ? )", chat["id"], sender, linked_name(event.get("name"), sender))
	name = mochi.db.row("select name from members where chat=? and member=?", chat["id"], member)
	name = name["name"] if name else ""
	encrypted = event.get("encrypted") == True
	body = linked_body(acc, chat, event)[:10000]
	if body and not mochi.text.valid(body, "text"):
		return
	created = event.get("created", 0)
	now = mochi.time.now()
	if type(created) != "int" or created > now + 86400 or created < now - 31536000 * 20:
		created = now
	# What this account sent from here, coming back before its id was kept.
	if own and body:
		echo = mochi.db.row("select id from messages where chat=? and member=? and remote='' and body=? and created>=? order by created desc limit 1", chat["id"], me, body, now - 600)
		if echo:
			mochi.db.execute("update messages set remote=? where id=?", remote, echo["id"])
			return
	id = mochi.uid()
	files = [f for f in listed(event.get("files")) if type(f) == "dict"][:FILES_MAXIMUM]
	body = linked_fetched(acc, chat, id, files, body)
	if not body and not files and not encrypted:
		return
	thread = ""
	root = linked_local(chat["id"], str(event.get("thread", "") or ""))
	if root and not root["thread"]:
		thread = root["id"]
	reply = linked_local(chat["id"], str(event.get("reply", "") or ""))
	# An XMPP message's encrypted content as it came, for a hosted account's
	# archive (phase 26).
	payload = str(event.get("payload", "") or "") if encrypted and network == "xmpp" else ""
	if len(payload) > PAYLOAD_MAXIMUM:
		payload = ""
	mochi.db.execute("insert into messages ( id, chat, member, name, body, created, reply, remote, encrypted, thread, payload ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], member, name, body, created, reply["id"] if reply else None, remote, 1 if encrypted else 0, thread, payload)
	if network == "xmpp":
		for f in files:
			link = str(f.get("url", "") or "")
			if remote_ok(link):
				mochi.db.execute("insert or ignore into links ( message, remote, url ) values ( ?, '', ? )", id, link[:REMOTE_MAXIMUM])
	archive = str(event.get("archive", "") or "")[:REMOTE_MAXIMUM]
	if archive and archive != remote:
		mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'archive' )", id, archive)
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])
	# An XMPP person encrypts conversation by conversation, so a one-to-one
	# conversation is encrypted while their latest message is.
	if network == "xmpp" and not chat.get("room") and not own and bool(chat.get("encrypted")) != encrypted:
		mochi.db.execute("update chats set encrypted=? where id=?", 1 if encrypted else 0, chat["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)
	if not own:
		# A message whose keys have not yet come has no text to show.
		excerpt = body.strip()[:80] if body or files else mochi.app.label("messages.encrypted")
		notify("message", chat["id"], mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=excerpt), "/chat/" + chat["id"], chat["name"], event_id="message:" + id)

def linked_fetched(acc, chat, id, files, body):
	"""The files a message came with, fetched through the account and kept as
	the message's attachments; the address of one that could not be is added
	to its text, which is answered."""
	object = "chat/" + chat["id"] + "/" + id
	for f in files:
		link = str(f.get("url", "") or "")
		if not remote_ok(link):
			continue
		fetched = mochi.account.media(acc["id"], link)
		kept = None
		if fetched and fetched.get("status") == 200 and fetched.get("data"):
			kept = attachment_create(object, str(f.get("name", "") or "file")[:200], fetched["data"], content_type=str(fetched.get("type", "") or f.get("type", "") or "").split(";")[0], description=str(f.get("description", "") or "")[:1000])
		if not kept:
			body = (body + "\n" + link).strip()[:10000]
	return body

def linked_decrypted(acc, identity, event):
	"""A message that came encrypted before its keys did, now that they have
	come: its text and its files, where it is still waiting for them."""
	message = linked_message_of(acc, event.get("id"))
	if not message or not message.get("encrypted") or message["body"] or mochi.db.exists("select 1 from deletions where message=?", message["id"]):
		return
	if mochi.db.exists("select 1 from attachments where object=?", "chat/" + message["chat"] + "/" + message["id"]):
		return
	chat = mochi.db.row("select * from chats where id=?", message["chat"])
	if not chat:
		return
	body = linked_body(acc, chat, event)[:10000]
	if body and not mochi.text.valid(body, "text"):
		return
	files = [f for f in listed(event.get("files")) if type(f) == "dict"][:FILES_MAXIMUM]
	body = linked_fetched(acc, chat, message["id"], files, body)
	if not body and not files:
		return
	mochi.db.execute("update messages set body=? where id=?", body, message["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message["id"])

def linked_sender(identity, event):
	"""Who an event says acted: the user where it was them."""
	return identity["id"] if event.get("own") == True else str(event.get("from", "") or "")

def linked_edited(acc, identity, event):
	"""A new version of a message, from whoever sent it."""
	message = linked_message_of(acc, event.get("id"))
	if not message or mochi.db.exists("select 1 from deletions where message=?", message["id"]):
		return
	sender = linked_sender(identity, event)
	if sender and message["member"] != sender:
		return
	chat = mochi.db.row("select * from chats where id=?", message["chat"])
	body = linked_body(acc, chat, event)[:10000]
	if not body or not mochi.text.valid(body, "text") or body == message["body"]:
		return
	mochi.db.execute("update messages set body=?, edited=? where id=?", body, mochi.time.now(), message["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message["id"])

def linked_withdrawn(acc, identity, event):
	"""A message withdrawn: by whoever sent it, or in a room by whoever the
	room lets; or a reaction withdrawn, by the id it has on Matrix."""
	remote = str(event.get("id", "") or "")
	reacted = mochi.db.row("select r.chat, r.message, r.member from reactions r join chats c on c.id=r.chat where c.account=? and r.remote=?", acc["id"], remote) if remote else None
	if reacted:
		message_reaction_set(reacted["chat"], reacted["message"], reacted["member"], "", None)
		return
	message = linked_message_of(acc, event.get("id"))
	if not message:
		return
	chat = mochi.db.row("select * from chats where id=?", message["chat"])
	sender = linked_sender(identity, event)
	if sender and message["member"] != sender and not chat.get("room"):
		return
	message_delete_apply(message["chat"], message["id"], sender or message["member"], mochi.time.now())

def linked_reacted(acc, identity, event):
	"""A reaction to a message: kept as one of chat's with the id it has on its
	network. A reaction chat has no name for is passed over; on XMPP, where a
	person's reactions to a message come whole, none withdraws theirs."""
	message = linked_message_of(acc, event.get("id"))
	given = str(event.get("reaction", "") or "")
	reaction = reaction_name(given)
	if not message:
		return
	member = linked_sender(identity, event)
	row = mochi.db.row("select name from members where chat=? and member=?", message["chat"], member)
	if not row:
		return
	if not given and acc["network"] == "xmpp":
		message_reaction_set(message["chat"], message["id"], member, row["name"], None)
		return
	if not reaction:
		return
	if message_reaction_set(message["chat"], message["id"], member, row["name"], reaction):
		mochi.db.execute("update reactions set remote=? where chat=? and message=? and member=?", str(event.get("event", "") or "")[:REMOTE_MAXIMUM], message["chat"], message["id"], member)

def linked_sent(acc, event):
	"""The id a room gave a message the user sent, by which the room knows it."""
	chat = linked_find(acc, event.get("conversation"))
	archive = str(event.get("archive", "") or "")[:REMOTE_MAXIMUM]
	if not chat or not archive:
		return
	message = linked_local(chat["id"], str(event.get("id", "") or ""))
	if message:
		mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'archive' )", message["id"], archive)

def linked_typing(acc, event):
	"""Someone typing in a conversation, or stopped: shown on its open tabs."""
	chat = linked_find(acc, event.get("conversation"))
	member = str(event.get("from", "") or "")
	if not chat_active(chat) or not member:
		return
	row = mochi.db.row("select name from members where chat=? and member=?", chat["id"], member)
	chat_websocket(chat["key"], {"event": "typing", "member": member, "name": row["name"] if row else member, "at": mochi.time.now(), "typing": event.get("typing") != False, "held": TYPING_HELD})

def linked_receipt(acc, event):
	"""How far a member has received or read a conversation, by the message
	they name."""
	chat = linked_find(acc, event.get("conversation"))
	member = str(event.get("from", "") or "")
	if not chat_active(chat) or not member:
		return
	message = linked_message_of(acc, event.get("id"))
	if not message or message["chat"] != chat["id"]:
		return
	at = message["created"]
	displayed = at if event.get("displayed") == True else 0
	mochi.db.execute("insert into receipts ( chat, member, delivered, displayed ) values ( ?, ?, ?, ? ) on conflict ( chat, member ) do update set delivered=max(delivered, excluded.delivered), displayed=max(displayed, excluded.displayed)", chat["id"], member, at, displayed)
	row = mochi.db.row("select delivered, displayed from receipts where chat=? and member=?", chat["id"], member)
	chat_websocket(chat["key"], {"event": "receipt", "member": member, "delivered": row["delivered"], "displayed": row["displayed"]})

def linked_presence(acc, event):
	"""The presence someone on the account's network shows, kept for the
	conversations with them."""
	member = str(event.get("from", "") or "")[:REMOTE_MAXIMUM]
	status = str(event.get("status", "") or "")
	if not member or status not in ("online", "away", "busy", "offline"):
		return
	message = str(event.get("message", "") or "")[:200]
	mochi.db.execute("insert into presence ( account, member, status, message, seen ) values ( ?, ?, ?, ?, ? ) on conflict ( account, member ) do update set status=excluded.status, message=excluded.message, seen=excluded.seen", acc["id"], member, status, message, mochi.time.now())

def linked_room(acc, identity, event):
	"""What a sync says of a room: made where it is new and named as other
	clients name it, renamed, marked encrypted, joined, or left."""
	conversation = str(event.get("conversation", "") or "")[:REMOTE_MAXIMUM]
	if not conversation:
		return
	chat = mochi.db.row("select * from chats where account=? and room=? order by status='active' desc, updated desc limit 1", acc["id"], conversation)
	me = identity["id"]
	if event.get("left") == True:
		if chat and chat["status"] == "invited":
			chat_delete_local(chat["id"])
		elif chat and chat["status"] == "active":
			mochi.db.execute("delete from members where chat=? and member=?", chat["id"], me)
			mochi.db.execute("update chats set status='left', updated=? where id=?", mochi.time.now(), chat["id"])
			chat_websocket(chat["key"], {"event": "leave", "member": me})
		return
	heroes = [h for h in listed(event.get("heroes")) if type(h) == "dict" and h.get("id")]
	name = str(event.get("name", "") or "").strip()
	if not name and heroes:
		name = ", ".join([linked_name(h.get("name"), h["id"]) for h in heroes])
	if not chat:
		chat = linked_chat_make(acc, linked_name(name, conversation), conversation, me, identity.get("name", ""), [(str(h["id"]), linked_name(h.get("name"), h["id"])) for h in heroes])
	elif chat["status"] != "active":
		linked_rejoin(chat, me, identity.get("name", ""))
	if name and event.get("name") and name[:200] != chat["name"]:
		mochi.db.execute("update chats set name=? where id=?", name[:200], chat["id"])
		chat_websocket(chat["key"], {"event": "rename", "name": name[:200]})
	if event.get("encrypted") == True and not chat.get("encrypted"):
		mochi.db.execute("update chats set encrypted=1 where id=?", chat["id"])
	# A room its network marks one-to-one is the conversation with its person.
	if event.get("direct") == True and chat.get("kind") != "direct":
		mochi.db.execute("update chats set kind='direct' where id=?", chat["id"])

def linked_member(acc, event):
	"""Someone joining or leaving a room, with the role they have there."""
	chat = mochi.db.row("select * from chats where account=? and room=? and status='active'", acc["id"], str(event.get("conversation", "") or ""))
	member = str(event.get("id", "") or "")[:REMOTE_MAXIMUM]
	if not chat or not member or mochi.text.valid(member, "entity"):
		return
	if event.get("left") == True:
		mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
		return
	name = linked_name(event.get("name"), member)
	role = linked_role(event)
	mochi.db.execute("insert into members ( chat, member, name, role ) values ( ?, ?, ?, ? ) on conflict ( chat, member ) do update set name=excluded.name, role=excluded.role", chat["id"], member, name, role)

def linked_role(event):
	"""The role someone has in a room as chat shows it: owner, admin,
	moderator, visitor, or '' for anyone else."""
	affiliation = str(event.get("affiliation", "") or "")
	role = str(event.get("role", "") or "")
	if affiliation in ("owner", "admin"):
		return affiliation
	if role in ("moderator", "visitor"):
		return role
	return ""

def linked_invite(acc, identity, event):
	"""An invitation to a room: a conversation waiting for the user, who is
	told."""
	conversation = str(event.get("conversation", "") or "")[:REMOTE_MAXIMUM]
	inviter = str(event.get("from", "") or "")[:REMOTE_MAXIMUM]
	if not conversation or not inviter:
		return
	if mochi.db.exists("select 1 from chats where account=? and room=? and status in ('active', 'invited')", acc["id"], conversation):
		return
	# A hosted account's invitations are Mochi's to police: chat's policy
	# applies, and one from someone the user does not know is passed over
	# unseen (phase 24). A linked account's server polices its own.
	if acc.get("hosted") and not invite_accepted(mochi.user.preference, identity["id"], inviter):
		return
	name = linked_name(event.get("name"), conversation)
	chat = linked_chat_make(acc, name, conversation, identity["id"], identity.get("name", ""), [(inviter, inviter)], status="invited")
	# An invitation to a one-to-one room, which accepting marks as one.
	if event.get("direct") == True:
		mochi.db.execute("update chats set kind='direct' where id=?", chat["id"])
	notify("invite", chat["id"], mochi.app.label("notifications.title.invite"), mochi.app.label("notifications.body.invite", name=name), "/chat/" + chat["id"], name, event_id="invite:" + acc["id"] + ":" + conversation)

# --- What goes out ---

def linked_mentions(chat):
	"""A Mastodon conversation's people as a status names them."""
	return " ".join(["@" + m["member"][len("acct:"):] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if m["member"].startswith("acct:")])

def mastodon_send(chat, acc, message, attachments):
	"""A message of a Mastodon conversation, as a direct status naming its
	people, in reply to the conversation's latest."""
	mentions = linked_mentions(chat)
	if not mentions:
		return False
	media = []
	for att in attachments or []:
		data = mochi.file.read(attachment_filename(att["id"], att["name"]), mochi.file.maximum())
		uploaded = mochi.account.upload(acc["id"], data, str(att.get("type", "") or att.get("content_type", "") or ""), name=att["name"], description=att.get("caption", "")) if data != None else None
		if uploaded and uploaded.get("id"):
			media.append(str(uploaded["id"]))
	status = {"status": (mentions + " " + message["body"]).strip(), "visibility": "direct"}
	before = mochi.db.row("select remote from messages where chat=? and remote!='' and id!=? and created<=? order by created desc limit 1", chat["id"], message["id"], message["created"])
	if before:
		status["in_reply_to_id"] = before["remote"]
	if media:
		status["media_ids"] = media
	result = mochi.account.object.create(acc["id"], status, key="chat|" + message["id"])
	if not result or not result.get("id"):
		return False
	mochi.db.execute("update messages set remote=? where id=?", str(result["id"]), message["id"])
	return True

def linked_send(chat, acc, message, attachments):
	"""A message of an XMPP or Matrix conversation: its text, then each file
	as one more message, the first kept as the message's id there and the
	rest as its further ids."""
	target = linked_target(chat)
	if not target:
		return False
	sent = ""
	if message["body"]:
		object = {"conversation": target, "content": message["body"]}
		reply = linked_reference(chat, acc, message.get("reply"))
		if reply:
			object["reply"] = reply
		thread = linked_remote(chat["id"], message.get("thread"))
		if thread:
			object["thread"] = thread
		result = mochi.account.object.create(acc["id"], object, key="chat|" + message["id"])
		if not result or not result.get("id"):
			return False
		sent = str(result["id"])
		linked_archived(message["id"], result, sent)
		# What it went encrypted as, for a hosted XMPP account's archive.
		if result.get("payload"):
			mochi.db.execute("update messages set encrypted=1, payload=? where id=?", str(result["payload"])[:PAYLOAD_MAXIMUM], message["id"])
	for att in attachments or []:
		data = mochi.file.read(attachment_filename(att["id"], att["name"]), mochi.file.maximum())
		# A file for an encrypted conversation is uploaded encrypted.
		uploaded = mochi.account.upload(acc["id"], data, str(att.get("type", "") or att.get("content_type", "") or ""), name=att["name"], conversation=target) if data != None else None
		result = mochi.account.object.create(acc["id"], {"conversation": target, "file": uploaded}, key="chat|" + message["id"] + "|" + att["id"]) if uploaded else None
		if not result or not result.get("id"):
			if not sent:
				return False
			continue
		if sent:
			mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'file' )", message["id"], str(result["id"]))
		else:
			sent = str(result["id"])
			linked_archived(message["id"], result, sent)
		# The file's address, and what it went encrypted as, for a hosted
		# XMPP account's archive (phases 26 and 27).
		if acc["network"] == "xmpp" and uploaded.get("url"):
			mochi.db.execute("insert or ignore into links ( message, remote, url, payload ) values ( ?, ?, ?, ? )", message["id"], str(result["id"]), str(uploaded["url"])[:REMOTE_MAXIMUM], str(result.get("payload", "") or "")[:PAYLOAD_MAXIMUM])
	if not sent:
		return False
	mochi.db.execute("update messages set remote=? where id=?", sent, message["id"])
	return True

# --- Encryption ---
#
# Core holds the encryption device of each of the user's Matrix and XMPP
# accounts and decrypts their conversations before chat hears them (phase
# 27). Chat shows the device and the people's devices, takes the user's word
# on them, runs Matrix's emoji verification, and sets up and enters the
# account's recovery key.

def encryption_chat(a):
	"""A conversation on a Matrix or XMPP account the user may write to, with
	its account; None where it is not one, the refusal given."""
	chat_id = a.input("chat")
	if not mochi.text.valid(chat_id, "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return None, None
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return None, None
	if not chat_write_allowed(a, chat):
		return None, None
	acc = mochi.account.get(chat["account"]) if chat.get("account") else None
	network = account_network(acc)
	if network not in ("matrix", "xmpp"):
		a.error.label(400, "errors.encryption_unavailable")
		return None, None
	acc["network"] = network
	return chat, acc

def encryption_person(chat, person):
	"""Whether someone is one of a conversation's people on its network."""
	return person and mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], person)

def action_encryption(a):
	"""The account's device and the conversation's people on its network."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	status = mochi.account.encryption.status(acc["id"])
	people = [{"id": m["member"], "name": m["name"]} for m in mochi.db.rows("select member, name from members where chat=?", chat["id"]) or [] if not mochi.text.valid(m["member"], "entity")]
	return {"data": {"account": acc["id"], "status": status, "people": people}}

def action_encryption_devices(a):
	"""A person's devices: one of the conversation's, or the user's own."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	person = a.input("person", "")
	status = mochi.account.encryption.status(acc["id"])
	own = person == status.get("address") or person == "xmpp:" + str(status.get("address", ""))
	if not own and not encryption_person(chat, person):
		a.error.label(404, "errors.member_not_found_in_this_chat")
		return
	return {"data": {"devices": mochi.account.encryption.devices(acc["id"], person) or []}}

def action_encryption_trust(a):
	"""The user's word on a device of someone's."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	person = a.input("person", "")
	status = mochi.account.encryption.status(acc["id"])
	own = person == status.get("address") or person == "xmpp:" + str(status.get("address", ""))
	if not own and not encryption_person(chat, person):
		a.error.label(404, "errors.member_not_found_in_this_chat")
		return
	trust = a.input("trust", "")
	if trust not in ("verified", "distrusted", "undecided"):
		a.error.label(400, "errors.invalid_preference")
		return
	mochi.account.encryption.trust(acc["id"], person, a.input("device", ""), trust)
	return {"data": {}}

def action_encryption_verify(a):
	"""Ask to verify someone in a Matrix conversation by comparing emoji, or
	the user's own other devices."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	if acc["network"] != "matrix":
		a.error.label(400, "errors.encryption_unavailable")
		return
	person = a.input("person", "")
	status = mochi.account.encryption.status(acc["id"])
	if person == status.get("address"):
		asked = mochi.account.encryption.verify(acc["id"], person)
	elif not encryption_person(chat, person) or not chat.get("room"):
		a.error.label(404, "errors.member_not_found_in_this_chat")
		return
	else:
		asked = mochi.account.encryption.verify(acc["id"], person, room=chat["room"])
	# Core's device verifies once it holds the account's cross-signing keys.
	if asked.get("recovery"):
		a.error.label(409, "errors.recovery_needed")
		return
	return {"data": asked}

def action_encryption_setup(a):
	"""Set up a Matrix account's cross-signing and key backup: the recovery
	key, shown once, or that the account's password is wanted."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	if acc["network"] != "matrix":
		a.error.label(400, "errors.encryption_unavailable")
		return
	return {"data": mochi.account.encryption.setup(acc["id"], password=a.input("password", ""))}

def action_encryption_recover(a):
	"""Take a Matrix account's recovery key set up on another client."""
	chat, acc = encryption_chat(a)
	if not chat:
		return
	if acc["network"] != "matrix":
		a.error.label(400, "errors.encryption_unavailable")
		return
	key = a.input("key", "")
	if not key or len(key) > 200:
		a.error.label(400, "errors.recovery_refused")
		return
	result = mochi.account.encryption.recover(acc["id"], key)
	if result.get("refused"):
		a.error.label(400, "errors.recovery_refused")
		return
	return {"data": result}

def action_encryption_verifications(a):
	"""The verifications under way on the user's Matrix accounts, each with
	its account and the name of the person it is with."""
	out = []
	for acc in chat_accounts():
		if acc.get("network") != "matrix":
			continue
		for v in mochi.account.encryption.verifications(acc["id"]) or []:
			v["account"] = acc["id"]
			member = mochi.db.row("select name from members where member=? and name!='' limit 1", v.get("person", ""))
			v["name"] = member["name"] if member else ""
			out.append(v)
	return {"data": {"verifications": out}}

def action_encryption_act(a):
	"""A step of a verification on one of the user's Matrix accounts."""
	account = a.input("account", "")
	acc = None
	for candidate in chat_accounts():
		if candidate["id"] == account and candidate.get("network") == "matrix":
			acc = candidate
	if not acc:
		a.error.label(400, "errors.invalid_account")
		return
	action = a.input("action", "")
	if action not in ("accept", "start", "confirm", "mismatch", "cancel"):
		a.error.label(400, "errors.invalid_preference")
		return
	if mochi.account.encryption.act(acc["id"], a.input("flow", ""), action).get("recovery"):
		a.error.label(409, "errors.recovery_needed")
		return
	return {"data": {}}

def linked_archived(message_id, result, remote):
	"""The id a hosted XMPP account's archive gave a message chat sent, kept
	among its further ids, as the archive gives it back (phase 26)."""
	archive = str(result.get("archive", "") or "")[:REMOTE_MAXIMUM]
	if archive and archive != remote:
		mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'archive' )", message_id, archive)

def linked_edit(chat, acc, message):
	"""A new version of a message the user sent, on its network."""
	if acc["network"] == "mastodon":
		mochi.account.object.update(acc["id"], message["remote"], {"status": (linked_mentions(chat) + " " + message["body"]).strip()})
		return
	target = linked_target(chat)
	if target:
		mochi.account.object.update(acc["id"], message["remote"], {"conversation": target, "content": message["body"]})

def linked_delete(chat, acc, message_id, remote):
	"""A message the user sent withdrawn from its network, with its files: in
	an XMPP room by the ids the room gave them."""
	if acc["network"] == "mastodon":
		mochi.account.object.delete(acc["id"], remote)
		return
	target = linked_target(chat)
	if not target:
		return
	ids = [remote] + [p["remote"] for p in mochi.db.rows("select remote from parts where message=? and kind='file'", message_id) or []]
	if acc["network"] == "xmpp" and chat.get("room"):
		ids = [p["remote"] for p in mochi.db.rows("select remote from parts where message=? and kind='archive'", message_id) or []]
	for id in ids:
		if id:
			mochi.account.object.delete(acc["id"], id, conversation=target)

def linked_react(chat, acc, me, message_id, reaction, previous):
	"""The user's reaction to a message of a Matrix or XMPP conversation, there
	too: on Matrix the one before withdrawn and the new one sent, its id kept;
	on XMPP, where a person's reactions to a message go whole, the new one
	replacing the one before, and none withdrawing it. In an XMPP room the
	message is named by the id the room gave it."""
	target = linked_target(chat)
	remote = linked_reference(chat, acc, message_id)
	if not target or not remote:
		return
	emoji = REACTION_EMOJI.get(reaction or "", "")
	if previous and (acc["network"] != "xmpp" or not emoji):
		mochi.account.object.delete(acc["id"], previous, conversation=target)
	if not emoji:
		return
	result = mochi.account.object.create(acc["id"], {"conversation": target, "reaction": emoji, "message": remote}, key="chat|react|" + message_id + "|" + mochi.uid())
	if result and result.get("id"):
		mochi.db.execute("update reactions set remote=? where chat=? and message=? and member=?", str(result["id"]), chat["id"], message_id, me)

def linked_read(chat, user_id, preference, read):
	"""Tell a linked conversation how far the user has read it, up to the
	latest message from someone else: its members where the user's switch
	allows, else the server alone where the network has that."""
	acc = chat_account(chat)
	if not acc or acc["network"] not in LINKED_CHAT:
		return
	target = linked_target(chat)
	latest = mochi.db.row("select remote from messages where chat=? and member!=? and remote!='' and created<=? order by created desc limit 1", chat["id"], user_id, read)
	if target and latest:
		mochi.account.read(acc["id"], target, latest["remote"], shared=chat_switch(preference, "receipts"))

def linked_presence_share(user, shared):
	"""Tell each linked chat account whether the user's presence is shared."""
	for acc in chat_accounts():
		if acc["network"] in LINKED_CHAT:
			mochi.account.presence(acc["id"], shared)

# --- Invitations ---

def action_accept(a):
	"""Accept an invitation to a room: the account joins it."""
	chat = chat_member_of(a, a.input("chat"))
	if not chat:
		return
	if chat["status"] != "invited":
		a.error.label(400, "errors.not_invited")
		return
	acc = chat_account(chat)
	person = ""
	if chat.get("kind") == "direct":
		people = [m["member"] for m in mochi.db.rows("select member from members where chat=?", chat["id"]) or [] if not mochi.text.valid(m["member"], "entity")]
		person = people[0] if len(people) == 1 else ""
	if not acc or not mochi.account.room.join(acc["id"], chat["room"], person=person):
		a.error.label(502, "errors.join_failed")
		return
	mochi.db.execute("update chats set status='active', updated=? where id=?", mochi.time.now(), chat["id"])
	return {"data": {"id": chat["id"]}}

def action_decline(a):
	"""Decline an invitation to a room."""
	chat = chat_member_of(a, a.input("chat"))
	if not chat:
		return
	if chat["status"] != "invited":
		a.error.label(400, "errors.not_invited")
		return
	acc = chat_account(chat)
	if acc:
		mochi.account.room.leave(acc["id"], chat["room"])
	chat_delete_local(chat["id"])
	return {"data": {"declined": True}}

# === Groups with people from Matrix and XMPP (the federation plan, phases
# 24 and 26) ===
#
# A Mochi group chat takes people from Matrix or XMPP by their addresses
# (decision 39), from one network at a time. It stays a Mochi chat among its
# Mochi members, and the server of the member who brought the first of them
# in relays between it and a room made for them - on Matrix with every Mochi
# member seated as a stand-in under their own name, on XMPP on that server's
# room service with every Mochi member an occupant under their name. That member's copy keeps the room in chats.relay; every copy keeps,
# for each person from Matrix, the member who relays them in members.relay,
# and takes what that person says only from that member. The relaying member
# passes on what the Mochi members do there and what the people from Matrix
# do here. The room is not end-to-end encrypted, which the chat shows.
#
# A person from Matrix who starts a conversation with a member's stand-in
# reaches that member as a chat request, under the member's own policy, and
# the relaying member carries the conversation in a copy of their own that
# their chat list does not show (kind 'bridge').

def bridge_relayer(chat_id):
	"""The member who relays a chat's people from Matrix, or ''."""
	row = mochi.db.row("select relay from members where chat=? and relay!='' limit 1", chat_id)
	return row["relay"] if row else ""

def bridge_person(value):
	"""A person from Matrix or XMPP by an address, as a member is known by:
	@name:host, or xmpp:name@host; or None."""
	if mochi.text.valid(str(value or ""), "entity"):
		return None
	return linked_person("matrix", value) or linked_person("xmpp", value)

def bridge_network(value):
	"""The network a person a group takes, or the room it relays through, is
	on: XMPP or Matrix."""
	return "xmpp" if str(value or "").startswith("xmpp:") else "matrix"

def bridge_reference(chat, message_id):
	"""The id a message of a relayed group is named by in its room when
	reacting or replying to it: on XMPP the id the room gave it, else its
	own."""
	if message_id and bridge_network(chat.get("relay")) == "xmpp":
		row = mochi.db.row("select remote from parts where message=? and kind='archive'", message_id)
		if row:
			return row["remote"]
	return bridge_remote(chat["id"], message_id)

def bridge_member_ok(chat_id, member, relay):
	"""Whether a member from Matrix is one the relaying member named relays."""
	return relay and mochi.db.exists("select 1 from members where chat=? and member=? and relay=?", chat_id, member, relay)

def bridge_add(a, chat, person):
	"""Add a person from Matrix to a group: the room made the first time, with
	every member seated, else the person invited to it; the other members
	learn of them as relayed by this member."""
	me = a.user.identity.id
	if mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], person):
		a.error.label(400, "errors.already_member")
		return
	count = mochi.db.row("select count(*) as members from members where chat=?", chat["id"])
	if count and count["members"] >= _MEMBERS_MAXIMUM:
		a.error.label(400, "errors.too_many_members", maximum=_MEMBERS_MAXIMUM)
		return
	network = bridge_network(person)
	relayer = bridge_relayer(chat["id"])
	# A group is relayed to one network.
	if relayer and bridge_network(mochi.db.row("select member from members where chat=? and relay!='' limit 1", chat["id"])["member"]) != network:
		a.error.label(400, "errors.bridge_network")
		return
	if relayer and relayer != me:
		row = mochi.db.row("select name from members where chat=? and member=?", chat["id"], relayer)
		a.error.label(400, "errors.bridge_xmpp_other_member" if network == "xmpp" else "errors.bridge_other_member", name=row["name"] if row else relayer)
		return
	if not mochi.bridge.available(network=network):
		a.error.label(400, "errors.bridge_xmpp_unavailable" if network == "xmpp" else "errors.bridge_unavailable")
		return
	if chat.get("relay"):
		found = mochi.bridge.invite(chat["relay"], person)
	else:
		seated = [{"entity": m["member"], "name": m["name"]} for m in mochi.db.rows("select member, name from members where chat=? and member!=?", chat["id"], me) or [] if mochi.text.valid(m["member"], "entity")]
		made = mochi.bridge.create(chat["id"], chat["name"], [person], members=seated)
		found = None
		if made and made.get("room"):
			mochi.db.execute("update chats set relay=? where id=?", str(made["room"]), chat["id"])
			people = listed(made.get("people"))
			found = people[0] if people else None
	if not found:
		a.error.label(404, "errors.person_not_found_on_network")
		return
	name = linked_name(found.get("name"), person)
	mochi.db.execute("insert into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat["id"], person, name, me)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
	others = [m["member"] for m in mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], person) or []]
	broadcast_chat(chat["id"], me, others, "member/add", {"id": chat["id"], "member": person, "name": name, "relay": me}, exclude=me)
	chat_websocket(chat["key"], {"event": "member/add", "member": person, "name": name})
	return {"data": {"success": True, "member": {"id": person, "name": name}}}

def bridge_remote(chat_id, message_id):
	"""A message's id in the relayed room, or ''."""
	return linked_remote(chat_id, message_id) if message_id else ""

def bridge_bytes(att):
	"""An attachment's bytes, fetched from its member's server, as the user,
	where this one holds only its description."""
	row = attachment_row(att["id"])
	if not row:
		return None
	if not row.get("entity"):
		return mochi.file.read(attachment_filename(att["id"], row["name"]), mochi.file.maximum())
	me = chat_identity()
	if not me or not attachment_fetch(att["id"], me["id"]):
		return None
	return mochi.cache.read(attachment_cache_name(att["id"]))

def bridge_forward(chat, message_id, member, body, reply, thread, attachments):
	"""A Mochi member's message, passed to the relayed room as their stand-in:
	its text, then each file, the first kept as its id there and the rest as
	its further ids."""
	room = chat["relay"]
	sent = ""
	if body:
		object = {"content": body}
		if bridge_reference(chat, reply):
			object["reply"] = bridge_reference(chat, reply)
		if bridge_remote(chat["id"], thread):
			object["thread"] = bridge_remote(chat["id"], thread)
		result = mochi.bridge.send(room, member, object, key=message_id)
		sent = str(result["id"]) if result and result.get("id") else ""
	for att in attachments or []:
		data = bridge_bytes(att)
		uploaded = mochi.bridge.upload(room, data, str(att.get("type", "") or att.get("content_type", "") or ""), name=att.get("name", "")) if data != None else None
		result = mochi.bridge.send(room, member, {"file": uploaded}, key=message_id + "|" + att["id"]) if uploaded else None
		if not result or not result.get("id"):
			continue
		if sent:
			mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'file' )", message_id, str(result["id"]))
		else:
			sent = str(result["id"])
	if sent:
		mochi.db.execute("update messages set remote=? where id=?", sent, message_id)

def bridge_edit(chat, message_id, member, body):
	"""A Mochi member's edit, passed to the relayed room."""
	remote = bridge_remote(chat["id"], message_id)
	if remote:
		mochi.bridge.update(chat["relay"], member, remote, {"content": body})

def bridge_delete(chat, message_id, member, remote):
	"""A Mochi member's withdrawn message, withdrawn in the relayed room with
	its files."""
	ids = [remote] + [p["remote"] for p in mochi.db.rows("select remote from parts where message=? and kind='file'", message_id) or []]
	for id in ids:
		if id:
			mochi.bridge.delete(chat["relay"], member, id)

def bridge_react(chat, member, message_id, reaction, previous):
	"""A Mochi member's reaction, passed to the relayed room: on Matrix the one
	before withdrawn and the new one sent, its id kept; on XMPP, where a
	person's reactions to a message go whole, the new one replacing the one
	before, and none withdrawing it."""
	remote = bridge_reference(chat, message_id)
	if not remote:
		return
	emoji = REACTION_EMOJI.get(reaction or "", "")
	if previous and (bridge_network(chat["relay"]) != "xmpp" or not emoji):
		mochi.bridge.delete(chat["relay"], member, previous)
	if not emoji:
		return
	result = mochi.bridge.send(chat["relay"], member, {"reaction": emoji, "message": remote}, key=message_id + "|react|" + mochi.uid())
	if result and result.get("id"):
		mochi.db.execute("update reactions set remote=? where chat=? and message=? and member=?", str(result["id"]), chat["id"], message_id, member)

def bridge_seat(chat, member, name):
	"""A Mochi member joining a relayed group is seated in its room."""
	if chat.get("relay") and mochi.text.valid(member, "entity"):
		mochi.bridge.member(chat["relay"], member, name)

def bridge_close(chat, me):
	"""The relaying member leaving: the people from Matrix leave the group with
	them, the other members dropping them on hearing the leave, and the room
	is closed."""
	mochi.db.execute("delete from members where chat=? and relay=?", chat["id"], me)
	mochi.bridge.close(chat["relay"])
	mochi.db.execute("update chats set relay='' where id=?", chat["id"])

def bridge_depart(chat, member):
	"""A member gone from a group, by leaving or being put out: the people
	from Matrix they relayed go with them."""
	for row in mochi.db.rows("select member from members where chat=? and relay=?", chat["id"], member) or []:
		mochi.db.execute("delete from members where chat=? and member=?", chat["id"], row["member"])
		chat_websocket(chat["key"], {"event": "member/remove", "member": row["member"]})

# --- What arrives from the room ---

def function_bridge_receive(context, room, events):
	"""What the people from Matrix did in a room this server relays: each
	passed to the group's Mochi members, or an invitation to a member's
	stand-in passed on as a chat request."""
	identity = chat_identity()
	if not identity:
		return None
	room = str(room or "")
	chat = mochi.db.row("select * from chats where relay=? and status='active'", room) if room else None
	for event in events or []:
		if type(event) != "dict":
			continue
		kind = str(event.get("kind", "") or "")
		if kind == "invite":
			bridge_invited(identity, room, event)
		elif not chat:
			continue
		elif kind == "message":
			bridge_received(chat, identity, event)
		elif kind == "edit":
			bridge_edited(chat, identity, event)
		elif kind == "delete":
			bridge_withdrawn(chat, identity, event)
		elif kind == "reaction":
			bridge_reacted(chat, identity, event)
		elif kind == "member" and event.get("left") == True:
			bridge_departed(chat, identity, str(event.get("id", "") or ""))
	return None

def bridge_peers(chat, me):
	"""The Mochi members a relayed member's doing is passed to."""
	return chat_peers(chat["id"], me)

def bridge_received(chat, identity, event):
	"""A message from a person from Matrix: kept as theirs and passed to the
	Mochi members, its files fetched through the relaying server."""
	me = identity["id"]
	sender = str(event.get("from", "") or "")
	remote = str(event.get("id", "") or "")[:REMOTE_MAXIMUM]
	if not remote or not bridge_member_ok(chat["id"], sender, me):
		return
	if mochi.db.exists("select 1 from messages where chat=? and remote=?", chat["id"], remote):
		return
	name = mochi.db.row("select name from members where chat=? and member=?", chat["id"], sender)["name"]
	body = str(event.get("body", "") or "")[:10000]
	if body and not mochi.text.valid(body, "text"):
		return
	created = event.get("created", 0)
	now = mochi.time.now()
	if type(created) != "int" or created > now + 86400 or created < now - 31536000 * 20:
		created = now
	id = mochi.uid()
	object = "chat/" + chat["id"] + "/" + id
	for f in [f for f in listed(event.get("files")) if type(f) == "dict"][:FILES_MAXIMUM]:
		fetched = mochi.bridge.media(chat["relay"], str(f.get("url", "") or ""))
		if fetched and fetched.get("status") == 200 and fetched.get("data"):
			attachment_create(object, str(f.get("name", "") or "file")[:200], fetched["data"], content_type=str(fetched.get("type", "") or f.get("type", "") or "").split(";")[0])
	if not body and not attachment_list(object, chat["id"]):
		return
	reply = linked_local(chat["id"], str(event.get("reply", "") or ""))
	root = linked_local(chat["id"], str(event.get("thread", "") or ""))
	thread = root["id"] if root and not root["thread"] else ""
	mochi.db.execute("insert into messages ( id, chat, member, name, body, created, reply, remote, thread ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], sender, name, body, created, reply["id"] if reply else None, remote, thread)
	# On XMPP the id the room gave it, which reactions and withdrawals name.
	archive = str(event.get("archive", "") or "")[:REMOTE_MAXIMUM]
	if archive and archive != remote:
		mochi.db.execute("insert or ignore into parts ( message, remote, kind ) values ( ?, ?, 'archive' )", id, archive)
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)
	attachments = attachment_list(object, chat["id"])
	data = {"chat": chat["id"], "message": id, "member": sender, "created": created, "body": body}
	if reply:
		data["reply"] = reply["id"]
	if thread:
		data["thread"] = thread
	if attachments:
		data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", created), "caption": att.get("caption", ""), "description": att.get("description", "")} for att in attachments]
	broadcast_chat(chat["id"], me, bridge_peers(chat, me), "bridge/message", data)
	if chat.get("kind") != "bridge":
		notify("message", chat["id"], mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=body.strip()[:80]), "/chat/" + chat["id"], chat["name"], event_id="message:" + id)

def bridge_message(chat, remote):
	"""A message of a relayed group by its id in the room, its own or the one
	the room gave it, or None."""
	found = linked_local(chat["id"], str(remote or ""))
	return mochi.db.row("select * from messages where id=?", found["id"]) if found else None

def bridge_edited(chat, identity, event):
	"""A person from Matrix or XMPP's edit of their message, passed on."""
	sender = str(event.get("from", "") or "")
	message = bridge_message(chat, event.get("id"))
	body = str(event.get("body", "") or "")[:10000]
	if not message or message["member"] != sender or not body or not mochi.text.valid(body, "text") or body == message["body"]:
		return
	if mochi.db.exists("select 1 from deletions where message=?", message["id"]):
		return
	now = mochi.time.now()
	mochi.db.execute("update messages set body=?, edited=? where id=?", body, now, message["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message["id"])
	broadcast_chat(chat["id"], identity["id"], bridge_peers(chat, identity["id"]), "bridge/edit", {"chat": chat["id"], "message": message["id"], "member": sender, "body": body, "edited": now})

def bridge_withdrawn(chat, identity, event):
	"""A person from Matrix withdrawing a message or a reaction, passed on."""
	me = identity["id"]
	remote = str(event.get("id", "") or "")
	if not remote:
		return
	reacted = mochi.db.row("select message, member from reactions where chat=? and remote=?", chat["id"], remote)
	if reacted:
		message_reaction_set(chat["id"], reacted["message"], reacted["member"], "", None)
		if not mochi.text.valid(reacted["member"], "entity"):
			broadcast_chat(chat["id"], me, bridge_peers(chat, me), "bridge/react", {"message": reacted["message"], "member": reacted["member"], "reaction": None})
		return
	message = bridge_message(chat, remote)
	if not message or mochi.text.valid(message["member"], "entity"):
		return
	message_delete_apply(chat["id"], message["id"], message["member"], mochi.time.now())
	broadcast_chat(chat["id"], me, bridge_peers(chat, me), "bridge/delete", {"chat": chat["id"], "message": message["id"], "member": message["member"]})

def bridge_reacted(chat, identity, event):
	"""A person from Matrix or XMPP's reaction, kept with its id there and
	passed on; on XMPP, where a person's reactions to a message come whole,
	none withdraws theirs."""
	me = identity["id"]
	sender = str(event.get("from", "") or "")
	given = str(event.get("reaction", "") or "")
	reaction = reaction_name(given)
	message = bridge_message(chat, event.get("id"))
	if not message or not bridge_member_ok(chat["id"], sender, me):
		return
	if not given and bridge_network(chat["relay"]) == "xmpp":
		message_reaction_set(chat["id"], message["id"], sender, "", None)
		broadcast_chat(chat["id"], me, bridge_peers(chat, me), "bridge/react", {"message": message["id"], "member": sender, "reaction": None})
		return
	if not reaction:
		return
	name = mochi.db.row("select name from members where chat=? and member=?", chat["id"], sender)["name"]
	if message_reaction_set(chat["id"], message["id"], sender, name, reaction):
		mochi.db.execute("update reactions set remote=? where chat=? and message=? and member=?", str(event.get("event", "") or "")[:REMOTE_MAXIMUM], chat["id"], message["id"], sender)
		broadcast_chat(chat["id"], me, bridge_peers(chat, me), "bridge/react", {"message": message["id"], "member": sender, "reaction": reaction})

def bridge_departed(chat, identity, person):
	"""A person from Matrix leaving the room leaves the group."""
	me = identity["id"]
	if not bridge_member_ok(chat["id"], person, me):
		return
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], person)
	others = [m["member"] for m in mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], me) or []]
	broadcast_chat(chat["id"], me, others, "member/remove", {"id": chat["id"], "member": person}, exclude=me)
	chat_websocket(chat["key"], {"event": "member/remove", "member": person})

def bridge_invited(identity, room, event):
	"""A person from Matrix starting a conversation with a member's stand-in:
	a chat request to that member, carried by a copy of this member's that
	their list does not show; the user's own stand-in's conversation is the
	user's, under their own policy."""
	me = identity["id"]
	member = str(event.get("to", "") or "")
	person = bridge_person(event.get("from"))
	if not person or not mochi.text.valid(member, "entity") or mochi.db.exists("select 1 from chats where relay=?", room):
		return
	found = mochi.account.resolve(person)
	name = linked_name((found or {}).get("name") if found else event.get("name"), person)
	chat = mochi.uid()
	if member == me:
		if not invite_accepted(mochi.user.preference, me, person):
			return
		mochi.db.execute("insert into chats ( id, name, key, updated, relay ) values ( ?, ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now(), room)
		mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? )", chat, me, identity.get("name", ""))
		mochi.db.execute("insert into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat, person, name, me)
		mochi.bridge.join(room, me, chat=chat)
		notify("message", chat, mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=""), "/chat/" + chat, name, event_id="bridge:" + room)
		return
	known = mochi.db.row("select name from members where member=? and chat in (select chat from members where relay=?) limit 1", member, me)
	if not known:
		return
	mochi.db.execute("insert into chats ( id, name, key, updated, kind, relay ) values ( ?, ?, ?, ?, 'bridge', ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now(), room)
	mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? )", chat, member, known["name"])
	mochi.db.execute("insert into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat, person, name, me)
	mochi.message.send({"from": me, "to": member, "service": "chat", "event": "bridge/new"}, {"id": chat, "name": name, "person": person})

def event_bridge_new(e):
	"""A person from Matrix starting a conversation with the user through the
	member whose server relays them: taken under the user's policy, the
	relaying member then told to join."""
	me = e.header("to")
	relay = e.header("from")
	chat = content_text(e, "id", "")
	name = content_text(e, "name", "")
	person = bridge_person(content_text(e, "person", ""))
	if not mochi.text.valid(chat, "id") or not mochi.text.valid(name, "display") or not person:
		return
	if mochi.db.exists("select 1 from chats where id=?", chat):
		return
	# The member relays the person into a group with the user, and the user's
	# policy takes them.
	if not mochi.db.exists("select 1 from members where member=? and relay=?", person, relay) or not invite_accepted(e.user.preference, me, person):
		return
	mine = mochi.db.row("select name from members where member=? limit 1", me)
	mochi.db.execute("insert into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())
	mochi.db.execute("insert into members ( chat, member, name ) values ( ?, ?, ? )", chat, me, mine["name"] if mine else "")
	mochi.db.execute("insert into members ( chat, member, name, relay ) values ( ?, ?, ?, ? )", chat, person, name, relay)
	mochi.message.send({"from": me, "to": relay, "service": "chat", "event": "bridge/accept"}, {"id": chat})
	notify("message", chat, mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=""), "/chat/" + chat, name, event_id="bridge:" + chat)

def event_bridge_accept(e):
	"""The member a person from Matrix wrote to took the conversation: their
	stand-in joins the room."""
	chat = mochi.db.row("select * from chats where id=? and kind='bridge'", content_text(e, "id", ""))
	if not chat or not chat.get("relay") or not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], e.header("from")):
		return
	mochi.bridge.join(chat["relay"], e.header("from"), chat=chat["id"])

def bridge_event_chat(e):
	"""The active chat a relayed event names, or None."""
	chat_id = content_text(e, "chat", "")
	if not mochi.text.valid(chat_id, "id"):
		return None
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	return chat if chat_active(chat) else None

def event_bridge_message(e):
	"""A message from a person from Matrix, from the member who relays them."""
	chat = bridge_event_chat(e)
	member = content_text(e, "member", "")
	if not chat or not bridge_member_ok(chat["id"], member, e.header("from")):
		return
	id = content_text(e, "message", "")
	if not mochi.text.valid(id, "id") or mochi.db.exists("select 1 from messages where id=?", id):
		return
	created = content_number(e, "created", None)
	now = mochi.time.now()
	if created == None or created > now + 86400 or created < now - 31536000 * 20:
		return
	body = content_text(e, "body", "")
	if not mochi.text.valid(body, "text") or len(body) > 10000:
		return
	reply = content_text(e, "reply", "")
	if reply and not mochi.db.exists("select 1 from messages where id=? and chat=?", reply, chat["id"]):
		reply = ""
	thread = content_text(e, "thread", "")
	if thread and not mochi.text.valid(thread, "id"):
		thread = ""
	name = mochi.db.row("select name from members where chat=? and member=?", chat["id"], member)["name"]
	mochi.db.execute("insert into messages ( id, chat, member, name, body, created, reply, thread ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], member, name, body, created, reply or None, thread)
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])
	attachments = e.content("attachments") or []
	if attachments:
		attachment_store(attachments, e.header("from"), "chat/" + chat["id"] + "/" + id)
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)
	notify("message", chat["id"], mochi.app.label("notifications.title.message"), mochi.app.label("notifications.body.message", author=name, excerpt=body.strip()[:80]), "/chat/" + chat["id"], chat["name"], event_id="message:" + id)

def event_bridge_edit(e):
	"""A person from Matrix's edit, from the member who relays them."""
	chat = bridge_event_chat(e)
	member = content_text(e, "member", "")
	if not chat or not bridge_member_ok(chat["id"], member, e.header("from")):
		return
	message = mochi.db.row("select * from messages where id=? and chat=?", content_text(e, "message", ""), chat["id"])
	body = content_text(e, "body", "")
	edited = content_number(e, "edited", 0)
	if not message or message["member"] != member or not body or not mochi.text.valid(body, "text") or len(body) > 10000 or edited <= (message["edited"] or 0):
		return
	if mochi.db.exists("select 1 from deletions where message=?", message["id"]):
		return
	mochi.db.execute("update messages set body=?, edited=? where id=?", body, edited, message["id"])
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "update", message["id"])

def event_bridge_delete(e):
	"""A person from Matrix's withdrawn message, from the member who relays
	them."""
	chat = bridge_event_chat(e)
	member = content_text(e, "member", "")
	if not chat or not bridge_member_ok(chat["id"], member, e.header("from")):
		return
	message = mochi.db.row("select * from messages where id=? and chat=?", content_text(e, "message", ""), chat["id"])
	if message and message["member"] == member:
		message_delete_apply(chat["id"], message["id"], member, mochi.time.now())

def event_bridge_react(e):
	"""A person from Matrix's reaction, from the member who relays them."""
	message = mochi.db.row("select chat from messages where id=?", content_text(e, "message", ""))
	chat = mochi.db.row("select * from chats where id=?", message["chat"]) if message else None
	member = content_text(e, "member", "")
	if not chat_active(chat) or not bridge_member_ok(chat["id"], member, e.header("from")):
		return
	raw = e.content("reaction")
	if raw != None and type(raw) != "string":
		return
	result = is_reaction_valid(raw)
	if not result["valid"]:
		return
	name = mochi.db.row("select name from members where chat=? and member=?", chat["id"], member)["name"]
	message_reaction_set(chat["id"], content_text(e, "message", ""), member, name, result["reaction"])

def invite_accepted(preference, me, person):
	"""Whether someone on another network may start a conversation with the
	user: anyone where the user's policy is anyone, else someone among their
	contacts or already in a conversation with them."""
	if (preference.get("chat_policy") or "friends") == "anyone":
		return True
	if chat_shared(me, person):
		return True
	return bool(mochi.service.call("people", "contacts/known", me, person))

def function_directory(context, query):
	"""People on Matrix whose name or address holds a query, through the
	user's Matrix accounts, for people's search: each as {id, name, address,
	network}."""
	out = []
	seen = {}
	for acc in chat_accounts():
		if acc["network"] != "matrix":
			continue
		for p in listed(mochi.account.directory(acc["id"], str(query or ""))):
			id = str(p.get("id", "") or "")
			if not id or id in seen or not id.startswith("@"):
				continue
			seen[id] = True
			out.append({"id": id, "name": linked_name(p.get("name"), id), "address": "matrix:u/" + id[1:], "network": "matrix"})
	return out[:20]
