# Mochi Chat app
# Copyright © 2026 Mochi OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

def notify(topic, object="", title="", body="", url="", name="", event_id=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), name, "", None, event_id)

# Helper: Broadcast event to chat members via the durable broadcast log.
# Sequence + log + gap-detection live in core. The chat UID is the
# stream key, so every member sees one ordered stream per originating
# host per chat.
#
# Unlike feeds / forums / projects / crm / wikis, chat has no per-chat
# owner entity: any member can broadcast as themselves, so `from_id` is
# passed explicitly (the broadcasting member's identity). Membership is
# per-chat in the `members` table; call sites do the lookup themselves
# (some sites exclude the new member, the kicked member, etc.) and pass
# the resolved list as `subscribers`.
#
# Single-recipient bootstrap events (`new` to a fresh member, `removed`
# to a kicked member) stay on raw mochi.message.send because there is
# no stream to sequence against.
def broadcast_chat(chat_id, from_id, subscribers, event, data, exclude=None):
	if not subscribers:
		return
	mochi.broadcast.send(from_id, chat_id, subscribers, "chat", event, data, exclude or "")

# Tell a peer who still lists us in `chat` to drop us. Sent when a broadcast
# arrives for a chat we've left / been removed from / deleted: the sender's
# roster is stale (our `leave` never reached them, or their host was the one
# host the broadcast missed). It is the exact `leave` a member sends on
# departure, so the receiver's event_leave deletes precisely (chat, us) - it
# can only ever prune our own membership, never another member's row. That
# self-only property is what makes this inline signal safe for chat where the
# bidirectional/chaining handlers of wikis would make it unsafe.
def chat_leave_back(chat_id, me, peer):
	mochi.message.send({"from": me, "to": peer, "service": "chat", "event": "leave"}, {"id": chat_id, "member": me})

# error_message_timeout: core calls this when a fan-out to a member stayed
# undeliverable past the queue max age. If the member now resolves to zero
# locations their host is gone for good, so prune them from every local chat
# roster - the dead-host half of stale-roster cleanup that leave-back (which
# needs a live host to answer) can't reach. Each surviving member's host runs
# this independently as its own fan-out to the dead member expires, so the
# rosters converge without anyone broadcasting a removal.
def error_message_timeout(e):
	if e.detail.get("locations", 1) != 0:
		return
	member = e.entity
	affected = mochi.db.rows("select distinct chat from members where member=?", member)
	for row in affected or []:
		mochi.db.remove("members_all", ["chat", "member"], {"chat": row["chat"], "member": member})
	for r in affected:
		row = mochi.db.row("select key from chats where id=?", r["chat"])
		if row:
			chat_websocket(row["key"], {"event": "member/remove", "member": member})

# Commit hook: fires the message-arrival websocket on every host that
# sees a new messages row commit, whether locally (via action_send /
# event_message calling mochi.db.commit.fire) or via replication
# apply (auto-fired by core with op.UID set, per the row-uid wire
# field added in #36). Both replicas of a paired account thus see the
# live update in any open browser tab, instead of only the host that
# served the action.
#
# Scoped narrowly to messages.insert. Multi-semantic chats / members
# updates (rename, kick, leave) stay on direct mochi.websocket.write
# for now; the hook can't disambiguate "name changed" from "left flag
# flipped" from "updated timestamp bumped" by looking at the row state
# alone, and routing those through the hook would need either parallel
# semantic-marker tables or per-event log rows.
# chat_websocket pushes a websocket update, skipping chats whose key is empty.
# Older shared chats predate the per-chat websocket key and carry key='' (the
# column is `not null` but '' slips through and replicates across members); core
# rejects an empty key, which would otherwise fail the whole commit hook or
# action with "invalid key". Such chats get no live push until their key is
# backfilled.
def chat_websocket(key, payload):
	if key:
		mochi.websocket.write(key, payload)

def chat_commit_hook(table, kind, row_uid):
	if kind != "insert" or not row_uid:
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
	# (passed by message_reaction_apply); clients keep their own my_reaction
	# and reconcile counts from this payload.
	if table == "reactions":
		message = mochi.db.row("select chat from messages where id=?", row_uid)
		if not message:
			return
		chat = mochi.db.row("select key from chats where id=?", message["chat"])
		if not chat:
			return
		chat_websocket(chat["key"], {"event": "reaction", "message": row_uid, "reaction_counts": message_reaction_counts(message["chat"], row_uid)})
		return
	if table != "messages":
		return
	message = mochi.db.row("select * from messages where id=?", row_uid)
	if not message:
		return
	chat = mochi.db.row("select key from chats where id=?", message["chat"])
	if not chat:
		return
	attachments = mochi.attachment.list("chat/" + message["chat"] + "/" + message["id"])
	chat_websocket(chat["key"], {
		"id": message["id"],
		"created": message["created"],
		"member": message["member"],
		"name": message["name"],
		"body": message["body"],
		"reply_to": message.get("reply_to"),
		"attachments": attachments,
	})

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

	# Membership is a converging LWW-Register (mochi.db.merge / mochi.db.remove):
	# the real rows live in members_all with version/writer/removed; the `members`
	# view exposes only the active (removed=0) rows, so all existing reads stay
	# correct and only writes target members_all.
	mochi.db.execute("create table if not exists members_all ( chat references chats( id ), member text not null, name text not null default '', writer text not null default '', version integer not null default 0, removed integer not null default 0, primary key ( chat, member ) )")
	mochi.db.execute("create index if not exists members_member on members_all( member )")
	mochi.db.execute("create view if not exists members as select chat, member, name from members_all where removed=0")

	mochi.db.execute("create table if not exists messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null, reply_to text references messages( id ) )")
	mochi.db.execute("create index if not exists messages_chat_created on messages( chat, created )")

	# Per-chat read watermark for the local account (read tracking / unread
	# badge). Local-only, not replicated — a per-device cursor.
	mochi.db.execute("create table if not exists chat_read ( chat text not null primary key references chats( id ), last_read integer not null default 0 )")

	# One reaction per member per message; counts are derived at read time
	# (count(*) group by reaction), never stored, so they converge under
	# multi-host without counter arithmetic.
	mochi.db.execute("create table if not exists reactions ( chat text not null, message text not null, member text not null, name text not null, reaction text not null, primary key ( chat, message, member ) )")
	mochi.db.execute("create index if not exists reactions_message on reactions ( chat, message )")

	# Append-only tombstone log for "delete for everyone". A message is
	# deleted iff a row exists here; the body is also blanked on delete so
	# the content is gone, but the log row is what drives convergence — it
	# merges naturally under multi-host and survives an out-of-order replay
	# of the original message (event_message checks it before storing).
	mochi.db.execute("create table if not exists deletions ( chat text not null, message text not null primary key, member text not null, created integer not null )")
	mochi.db.execute("create index if not exists deletions_chat on deletions( chat )")

# Upgrade database
def database_upgrade(to_version):
	# chats.updated was only bumped on member events (add/remove/rename/
	# leave), never on the messages themselves — so the chat list sort
	# by `updated` was effectively "last member event", not "last message".
	# action_send + event_message now update it, but existing chats still
	# carry stale values; backfill from each chat's most recent message so
	# the next launch shows the expected order.
	#
	# Schema 5 carried the same intent but used Python-style implicit
	# string concatenation that Starlark rejected; the server still
	# bumped the version on parse failure, so the actual backfill lands
	# at schema 6 with a single-line SQL string.
	if to_version == 5 or to_version == 6:
		mochi.db.execute("update chats set updated = coalesce((select max(created) from messages where chat = chats.id), updated)")
	if to_version == 7:
		# Add chats.synced for throttled resync requests when an
		# incoming message references a chat we haven't seen yet — happens
		# when event_new was missed (offline at chat creation time) but
		# subsequent messages arrived.
		cols = [r["name"] for r in mochi.db.table("chats") or []]
		if "synced" not in cols:
			mochi.db.execute("alter table chats add column synced integer not null default 0")
	if to_version == 8:
		# Drop the unused chats.identity column. It recorded the local DB
		# owner, but the only read site compared it to a remote event sender
		# (a no-op "is_creator" check); membership is now gated solely on the
		# members table.
		cols = [r["name"] for r in mochi.db.table("chats") or []]
		if "identity" in cols:
			mochi.db.execute("alter table chats drop column identity")
	if to_version == 9:
		# Append-only tombstone log for per-message "delete for everyone".
		mochi.db.execute("create table if not exists deletions ( chat text not null, message text not null primary key, member text not null, created integer not null )")
		mochi.db.execute("create index if not exists deletions_chat on deletions( chat )")
	if to_version == 13:
		# Catch-up create for the deletions log. Some dev DBs were bumped to
		# schema 10-12 by the unmerged featured-chat branch (which never
		# created deletions); with user_version already past 9 and no
		# downgrade function, the v9 step above never runs for them, so
		# action_messages hit "no such table: deletions". Bumping the app
		# schema above that range forces this idempotent create to run.
		mochi.db.execute("create table if not exists deletions ( chat text not null, message text not null primary key, member text not null, created integer not null )")
		mochi.db.execute("create index if not exists deletions_chat on deletions( chat )")
	if to_version == 14:
		# Read tracking: per-chat read watermark for the local account.
		mochi.db.execute("create table if not exists chat_read ( chat text not null primary key references chats( id ), last_read integer not null default 0 )")
	if to_version == 15:
		# Message reactions: one per member per message, counts derived.
		mochi.db.execute("create table if not exists reactions ( chat text not null, message text not null, member text not null, name text not null, reaction text not null, primary key ( chat, message, member ) )")
		mochi.db.execute("create index if not exists reactions_message on reactions ( chat, message )")
	if to_version == 16:
		# Structured replies: reply_to references the quoted message.
		cols = [r["name"] for r in mochi.db.table("messages") or []]
		if "reply_to" not in cols:
			mochi.db.execute("alter table messages add column reply_to text references messages( id )")
	if to_version == 17:
		# Promote the chats.left flag (0/1/2) to a named status. The status
		# doubles as a departure tombstone: a left/removed/deleted chat keeps
		# its row, so the receive path can tell "we left this chat" (drop the
		# message + tell the sender to prune us) from "we were never a member"
		# (genuine out-of-order delivery, resync). 'deleted' is the hidden
		# tombstone kept after the user deletes a left chat from their list.
		cols = [r["name"] for r in mochi.db.table("chats") or []]
		if "status" not in cols:
			mochi.db.execute("alter table chats add column status text not null default 'active'")
			# Backfill per-row, keyed by id, so the REPLICATED statement
			# references only `status` and `id` - never `left`. A literal
			# "update chats set status='left' where left=1" would be captured
			# and replayed on a paired host that has already dropped `left`,
			# failing with "no such column: left" (and emailing the admin).
			# Reading `left` here (a non-replicated select) and writing by id
			# keeps every emitted op idempotent and replay-safe. Rows at the
			# default 0 need no write - the column default already made them
			# 'active'.
			for row in mochi.db.rows("select id, left from chats") or []:
				if row["left"] == 1:
					mochi.db.execute("update chats set status='left' where id=?", row["id"])
				elif row["left"] == 2:
					mochi.db.execute("update chats set status='removed' where id=?", row["id"])
		if "left" in cols:
			mochi.db.execute("alter table chats drop column left")
	if to_version == 18:
		# Make membership a converging LWW-Register: move the rows into
		# members_all (with version/writer/removed) and expose the active rows
		# through a `members` view, so every existing read stays correct and
		# writes go through mochi.db.merge / mochi.db.remove on members_all.
		if not mochi.db.table("members_all"):
			mochi.db.execute("create table members_all ( chat references chats( id ), member text not null, name text not null default '', writer text not null default '', version integer not null default 0, removed integer not null default 0, primary key ( chat, member ) )")
			mochi.db.execute("insert into members_all ( chat, member, name ) select chat, member, name from members")
			mochi.db.execute("drop table members")
			mochi.db.execute("create index if not exists members_member on members_all( member )")
			mochi.db.execute("create view members as select chat, member, name from members_all where removed=0")

# Stream an entity's asset from its owning service via a Mochi stream.
# Location-transparent: mochi.remote.stream() loops back in-process when the
# entity lives on this server, or goes over P2P otherwise. Handles both binary
# assets (avatar/banner/favicon) and JSON assets (style/information).
def stream_asset(a, entity_id, service, asset):
	if not entity_id:
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
	a.write.stream(s)
	return None

_PERSON_ASSETS = ("avatar", "banner", "favicon", "style", "information")

# Proxy a message sender's person asset from the people service.
def action_message_asset(a):
	asset = a.input("asset")
	if asset not in _PERSON_ASSETS:
		a.error.label(404, "errors.unknown_asset")
		return
	row = mochi.db.row("select member from messages where id=?", a.input("message"))
	return stream_asset(a, row["member"] if row else "", "people", asset)

# Create new chat
def action_create(a):
	name = a.input("name")
	if not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_chat_name")
		return

	# Build prospective member list
	prospective_members = [{"id": a.user.identity.id, "name": a.user.identity.name}]
	
	members_str = a.input("members")
	if members_str:
		for member_id in members_str.split(","):
			if not mochi.text.valid(member_id, "entity"):
				continue
			if member_id == a.user.identity.id:
				continue
			
			# Look up the member in friends or directory to get their name
			friend = mochi.service.call("friends", "get", a.user.identity.id, member_id)
			if friend:
				member_name = friend["name"]
			else:
				# Try directory lookup if not a friend
				dir_entry = mochi.directory.get(member_id)
				if dir_entry:
					member_name = dir_entry["name"]
				else:
					member_name = mochi.app.label("member.unknown")
			
			prospective_members.append({"id": member_id, "name": member_name})

	# Check for existing 1-on-1 chat
	if len(prospective_members) == 2:
		other_member = prospective_members[1]
		# Find chat where both are members and total members is 2
		existing_rows = mochi.db.rows("""
			select c.id, c.name
			from chats c
			join members m1 on c.id = m1.chat
			join members m2 on c.id = m2.chat
			where m1.member = ? and m2.member = ?
			group by c.id
			having (select count(*) from members where chat = c.id) = 2
		""", a.user.identity.id, other_member["id"])
		
		if existing_rows:
			existing_chat = existing_rows[0]
			return {
				"data": {"id": existing_chat["id"], "name": existing_chat["name"], "members": prospective_members}
			}

	chat = mochi.uid()
	mochi.db.execute("replace into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())
	
	for member in prospective_members:
		mochi.db.merge("members_all", ["chat", "member"], {"chat": chat, "member": member["id"], "name": member["name"]})
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
		WHERE m.member IS NOT NULL OR c.status IN ('left', 'removed')
		ORDER BY c.updated DESC
	""", identity, identity)
	for chat in chats:
		if chat.get("status") != "active":
			chat["unread"] = 0
		if chat.get("members") == 2:
			other = mochi.db.row(
				"select member from members where chat=? and member<>?",
				chat["id"], identity
			)
			if other:
				chat["other"] = other["member"]
	return {"data": chats}

# Enter details of new chat
def action_new(a):
	friends = mochi.service.call("friends", "list", a.user.identity.id) or []

	# Find existing 1-on-1 chats
	rows = mochi.db.rows("select chat, member from members where chat in (select chat from members where member=?)", a.user.identity.id)

	chat_members = {}
	for row in rows:
		chat_id = row["chat"]
		if chat_id not in chat_members:
			chat_members[chat_id] = []
		chat_members[chat_id].append(row["member"])

	existing_chats = {}
	for chat_id, members in chat_members.items():
		if len(members) == 2:
			other = None
			if members[0] == a.user.identity.id:
				other = members[1]
			elif members[1] == a.user.identity.id:
				other = members[0]
			
			if other:
				existing_chats[other] = chat_id

	for friend in friends:
		if friend["id"] in existing_chats:
			friend["chatId"] = existing_chats[friend["id"]]

	return {
		"data": {"name": a.user.identity.name, "friends": friends}
	}

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

	# Keyset cursor. `created` is whole seconds, so a busy chat has many
	# messages sharing one timestamp; a `created`-only cursor can't separate
	# them, so pages overlap (duplicates) or stall on a same-second run. The
	# message id (a UUIDv7, already time-ordered) is the unique tiebreaker,
	# giving the total order (created desc, id desc). `before_id` is optional
	# so older clients that send only `before` keep working.
	before = None
	before_str = a.input("before")
	if before_str and mochi.text.valid(before_str, "natural"):
		before = int(before_str)

	before_id = a.input("before_id")
	if before_id and not mochi.text.valid(before_id, "id"):
		before_id = None

	# Fetch one extra (limit + 1) to detect whether older messages remain.
	if before and before_id:
		messages = mochi.db.rows("select * from messages where chat=? and ( created<? or ( created=? and id<? ) ) order by created desc, id desc limit ?", chat["id"], before, before, before_id, limit + 1)
	elif before:
		messages = mochi.db.rows("select * from messages where chat=? and created<? order by created desc, id desc limit ?", chat["id"], before, limit + 1)
	else:
		messages = mochi.db.rows("select * from messages where chat=? order by created desc, id desc limit ?", chat["id"], limit + 1)

	# Check if there are more (older) messages
	has_more = len(messages) > limit
	if has_more:
		messages = messages[:limit]

	# Reverse to chronological order (oldest first) for display
	messages = list(reversed(messages))

	# Cursor for the next (older) page is the oldest message we kept: both its
	# timestamp and id, so the next request resumes inside a same-second run.
	next_cursor = None
	next_cursor_id = None
	if has_more and len(messages) > 0:
		next_cursor = messages[0]["created"]
		next_cursor_id = messages[0]["id"]

	deleted_ids = messages_deleted_set(chat["id"], [m["id"] for m in messages])
	for m in messages:
		if m["id"] in deleted_ids:
			m["deleted"] = True
			m["body"] = ""
			m["reply_to"] = None
			m["attachments"] = []
		else:
			m["deleted"] = False
			m["attachments"] = mochi.attachment.list("chat/" + chat["id"] + "/" + m["id"])

	# Reaction counts + the viewer's own reaction, for non-deleted messages.
	messages_attach_reactions(chat["id"], [m for m in messages if not m["deleted"]], a.user.identity.id)
	for m in messages:
		if m["deleted"]:
			m["reaction_counts"] = {}
			m["my_reaction"] = None

	return {
		"data": {
			"messages": messages,
			"hasMore": has_more,
			"nextCursor": next_cursor,
			"nextCursorId": next_cursor_id
		}
	}

# Send a message
def action_send(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	body = a.input("body", "")
	if not mochi.text.valid(body, "text"):
		a.error.label(400, "errors.invalid_message")
		return
	if len(body) > 10000:
		a.error.label(400, "errors.message_too_long")
		return

	has_files = a.input("files")

	if not body.strip() and not has_files:
		a.error.label(400, "errors.message_empty")
		return

	# Optional structured reply: the quoted message must exist in this chat.
	reply_to = a.input("reply_to", "")
	if reply_to:
		if not mochi.text.valid(str(reply_to), "id"):
			a.error.label(400, "errors.invalid_message")
			return
		if not mochi.db.exists("select 1 from messages where id=? and chat=?", reply_to, chat["id"]):
			a.error.label(404, "errors.message_not_found")
			return
	else:
		reply_to = None

	chat_ensure_commit_hook()
	id = mochi.uid()
	now_send = mochi.time.now()
	mochi.db.execute("replace into messages ( id, chat, member, name, body, created, reply_to ) values ( ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], a.user.identity.id, a.user.identity.name, body, now_send, reply_to)
	# Bump the chat's updated timestamp so the chat list sorts by last
	# message activity, not by member-event history.
	mochi.db.execute("update chats set updated=? where id=?", now_send, chat["id"])

	# Get other chat members for notification
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	member_ids = [m["member"] for m in members]

	# Save any uploaded attachments locally
	attachments = []
	if has_files:
		attachments = mochi.attachment.save("chat/" + chat["id"] + "/" + id, "files", [], [], [])

	# Live-update websocket: fired from chat_commit_hook on every host
	# that sees this messages row (local + paired replicas via the
	# row-uid wire field from #36), so the user's tabs on every host
	# see the message arrive without a refresh.
	mochi.db.commit.fire("messages", "insert", id)

	# Send message to other members with attachment metadata piggybacked.
	# member_ids comes pre-filtered to exclude the sender, so no exclude
	# arg is needed here.
	# Reuse now_send (already written to the DB) so sender and recipients
	# store the identical created value.
	msg_data = {"chat": chat["id"], "message": id, "created": now_send, "body": body, "name": a.user.identity.name}
	if reply_to:
		msg_data["reply_to"] = reply_to
	if attachments:
		msg_data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now_send)} for att in attachments]
	broadcast_chat(chat["id"], a.user.identity.id, member_ids, "message", msg_data)

	return {
		"data": {"id": id}
	}

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

	read_ts = None
	read_str = a.input("read", "")
	if read_str and mochi.text.valid(read_str, "natural"):
		read_ts = int(read_str)
	if read_ts == None:
		last = mochi.db.row("select max(created) as ts from messages where chat=?", chat["id"])
		if last and last.get("ts"):
			read_ts = last["ts"]
		else:
			read_ts = chat["updated"]

	if read_ts < chat_last_read(chat["id"]):
		read_ts = chat_last_read(chat["id"])
	chat_set_last_read(chat["id"], read_ts)
	return {"data": {"read": read_ts}}

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
	return {"reaction_counts": message_reaction_counts(chat_id, message_id), "my_reaction": reaction if reaction else None}

# Attach reaction_counts + the viewer's own my_reaction to a list of messages.
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
		m["reaction_counts"] = counts_by_message.get(m["id"], {})
		mine = my_by_message.get(m["id"])
		m["my_reaction"] = mine if mine else None

# Add / update / clear the caller's reaction on a message.
def action_react(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
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

	outcome = message_reaction_set(chat["id"], message_id, a.user.identity.id, a.user.identity.name, reaction)
	if not outcome:
		a.error.label(404, "errors.message_not_found")
		return

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
	result = is_reaction_valid(e.content("reaction"))
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
	name = e.content("name") or member["name"]
	message_reaction_apply(chat["id"], message_id, member_id, name, reaction)

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
	results = mochi.db.rows("select id, member, name, body, created, substr(body, 1, 200) as excerpt from messages where chat=? and body like ? escape '\\' and id not in (select message from deletions where chat=?) order by created desc limit 100", chat["id"], pattern, chat["id"])
	return {"data": {"query": query, "results": results or []}}

# Remove every local row for a chat (reactions, tombstones, messages,
# members, read state, then the chat). One consistent cleanup path for the
# leave/delete flows so new tables don't leak orphan rows.
# Purge a chat's local content but keep a lightweight 'deleted' tombstone
# row. The tombstone is what lets event_message tell "we deleted this chat"
# (drop the message + leave-back to prune the stale sender) from "we were never
# a member" (out-of-order delivery, resync). Without it a deleted chat
# resurrects the instant a peer who still lists us sends a message. One tiny
# row per deleted chat; chats are low-cardinality, so retention is a non-issue.
def chat_delete_local(chat_id):
	mochi.db.execute("delete from reactions where chat=?", chat_id)
	mochi.db.execute("delete from deletions where chat=?", chat_id)
	mochi.db.execute("delete from messages where chat=?", chat_id)
	for _row in mochi.db.rows("select member from members where chat=?", chat_id) or []:
		mochi.db.remove("members_all", ["chat", "member"], {"chat": chat_id, "member": _row["member"]})
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
	mochi.attachment.clear("chat/" + chat_id + "/" + message_id)
	chat_ensure_commit_hook()
	mochi.db.commit.fire("deletions", "insert", message_id)

# Delete one or more of the caller's own messages for everyone. Input
# `message_ids` is a JSON-encoded array string (decoded like market's `ids`).
def action_messages_delete(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	raw_ids = a.input("message_ids")
	if not raw_ids:
		a.error.label(400, "errors.invalid_message")
		return
	message_ids = json.decode(raw_ids)
	if type(message_ids) != "list" or len(message_ids) == 0 or len(message_ids) > 100:
		a.error.label(400, "errors.invalid_message")
		return

	now_delete = mochi.time.now()
	deleted = []
	for raw_id in message_ids:
		message_id = str(raw_id)
		if not mochi.text.valid(message_id, "id"):
			continue
		# Own messages only: the row must exist in this chat and belong to
		# the caller. Skip silently so a partial selection still succeeds.
		owner = mochi.db.row("select member from messages where id=? and chat=?", message_id, chat["id"])
		if not owner or owner["member"] != a.user.identity.id:
			continue
		message_delete_apply(chat["id"], message_id, a.user.identity.id, now_delete)
		deleted.append(message_id)

	if not deleted:
		a.error.label(404, "errors.message_not_found")
		return

	# Propagate to the other members so they replace the message in real time.
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	member_ids = [m["member"] for m in members]
	broadcast_chat(chat["id"], a.user.identity.id, member_ids, "message/delete", {"chat": chat["id"], "messages": deleted})

	return {"data": {"deleted": deleted}}

# A member deleted their own message(s) for everyone. Tombstone locally.
# We only honour a delete for a message we already hold whose author is the
# sender — broadcast ordering guarantees a member's message arrives before
# its own delete, so this also blocks a member suppressing others' messages.
def event_message_delete(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("chat"))
	if not chat:
		return
	if chat["status"] != "active":
		return
	sender = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return
	messages = e.content("messages")
	if type(messages) != "list":
		return
	now_delete = mochi.time.now()
	for raw_id in messages:
		message_id = str(raw_id)
		if not mochi.text.valid(message_id, "id"):
			continue
		owner = mochi.db.row("select member from messages where id=? and chat=?", message_id, chat["id"])
		if not owner or owner["member"] != sender:
			continue
		message_delete_apply(chat["id"], message_id, sender, now_delete)

# Forward messages from this chat into another chat the caller belongs to,
# copying body and attachment bytes as new messages authored by the caller.
# Input `message_ids` is a JSON-encoded array string; `to_chat` is the target.
# Helper: collect the forwardable source messages named by a JSON-array
# `message_ids` string. Returns the list of message rows that exist in the
# source chat and are not tombstoned, or None if the payload itself is
# malformed/empty/oversized (the caller maps that to errors.invalid_message).
# An empty-but-valid payload returns [] so the caller can decide whether
# "nothing to forward" is an error in its context.
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

# Helper: copy the given (already-validated) source messages into target_id as
# new messages authored by the forwarding member, carrying attachments, firing
# the commit hook, and broadcasting each to the target's members. Returns the
# list of new message ids. Shared by forward-to-existing-chat and
# forward-to-friend so both paths stay identical.
def chat_forward_into(a, source_id, target_id, source_messages):
	chat_ensure_commit_hook()
	members = mochi.db.rows("select member from members where chat=? and member!=?", target_id, a.user.identity.id)
	member_ids = [m["member"] for m in members]

	forwarded = []
	for source_message in source_messages:
		new_id = mochi.uid()
		now_forward = mochi.time.now()
		mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", new_id, target_id, a.user.identity.id, a.user.identity.name, source_message["body"], now_forward)
		mochi.db.execute("update chats set updated=? where id=?", now_forward, target_id)

		# Copy attachment bytes into the new message's object.
		for att in mochi.attachment.list("chat/" + source_id + "/" + source_message["id"]) or []:
			data = mochi.attachment.data(att["id"])
			if data == None:
				continue
			mochi.attachment.create("chat/" + target_id + "/" + new_id, att["name"], data, att.get("type", ""))
		new_attachments = mochi.attachment.list("chat/" + target_id + "/" + new_id)

		mochi.db.commit.fire("messages", "insert", new_id)

		msg_data = {"chat": target_id, "message": new_id, "created": now_forward, "body": source_message["body"], "name": a.user.identity.name}
		if new_attachments:
			msg_data["attachments"] = [{"id": at["id"], "name": at["name"], "size": at["size"], "content_type": at.get("type", ""), "rank": at.get("rank", 0), "created": at.get("created", now_forward)} for at in new_attachments]
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
	if not mochi.db.exists("select 1 from members where chat=? and member=?", source["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	to_chat = a.input("to_chat")
	if not mochi.text.valid(str(to_chat), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	target = mochi.db.row("select * from chats where id=?", to_chat)
	if not target:
		a.error.label(404, "errors.chat_not_found")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", target["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	source_messages = chat_collect_forwardable(source["id"], a.input("message_ids"))
	if source_messages == None:
		a.error.label(400, "errors.invalid_message")
		return

	forwarded = chat_forward_into(a, source["id"], target["id"], source_messages)
	if not forwarded:
		a.error.label(404, "errors.message_not_found")
		return

	return {"data": {"forwarded": forwarded, "to_chat": target["id"]}}

# Forward messages to a friend, creating (or reusing) the 1-on-1 chat as part
# of the same action. The source messages are validated BEFORE any chat is
# created, so a forward with nothing to send can never leave an orphaned empty
# chat behind — the failure case Numan's two-call (create-then-forward) flow
# left open.
def action_messages_forward_friend(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	source = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not source:
		a.error.label(404, "errors.chat_not_found")
		return
	if not mochi.db.exists("select 1 from members where chat=? and member=?", source["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	member_id = a.input("member")
	if not mochi.text.valid(str(member_id), "entity") or member_id == a.user.identity.id:
		a.error.label(400, "errors.invalid_member_id")
		return

	# Validate the messages first — nothing below creates a chat until we know
	# there is at least one real message to forward.
	source_messages = chat_collect_forwardable(source["id"], a.input("message_ids"))
	if source_messages == None:
		a.error.label(400, "errors.invalid_message")
		return
	if not source_messages:
		a.error.label(404, "errors.message_not_found")
		return

	# Resolve the friend's display name (friends first, then directory).
	friend = mochi.service.call("friends", "get", a.user.identity.id, member_id)
	if friend:
		member_name = friend["name"]
	else:
		dir_entry = mochi.directory.get(member_id)
		if dir_entry:
			member_name = dir_entry["name"]
		else:
			member_name = mochi.app.label("member.unknown")

	# Reuse the existing 1-on-1 chat with this member if there is one, else
	# create it (mirrors action_create's direct-chat path).
	existing = mochi.db.rows("""
		select c.id
		from chats c
		join members m1 on c.id = m1.chat
		join members m2 on c.id = m2.chat
		where m1.member = ? and m2.member = ?
		group by c.id
		having (select count(*) from members where chat = c.id) = 2
	""", a.user.identity.id, member_id)

	if existing:
		target_id = existing[0]["id"]
	else:
		target_id = mochi.uid()
		mochi.db.execute("replace into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", target_id, member_name, mochi.random.alphanumeric(16), mochi.time.now())
		mochi.db.merge("members_all", ["chat", "member"], {"chat": target_id, "member": a.user.identity.id, "name": a.user.identity.name})
		mochi.db.merge("members_all", ["chat", "member"], {"chat": target_id, "member": member_id, "name": member_name})
		# Tell the friend about the new chat; they see our name as its title.
		mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "new"}, {"id": target_id, "name": a.user.identity.name}, [{"id": a.user.identity.id, "name": a.user.identity.name}, {"id": member_id, "name": member_name}])

	forwarded = chat_forward_into(a, source["id"], target_id, source_messages)
	if not forwarded:
		a.error.label(404, "errors.message_not_found")
		return

	return {"data": {"forwarded": forwarded, "to_chat": target_id}}

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

	members = mochi.db.rows("select member as id, name from members where chat=?", chat["id"])
	chat["members"] = members

	mochi.service.call("notifications", "clear/object", "chat", chat["id"])
	return {
		"data": {"chat": chat, "identity": a.user.identity.id}
	}

# Force a fresh info pull from another member of the chat. Unlike the
# event-driven request_resync, this picks a peer for the user (the most
# recently active member who isn't us) and bypasses the throttle so the
# user can always force a sync. Useful when the member list is stale or
# the chat is suspected to have drifted.
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
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat_id, identity):
		a.error.label(403, "errors.not_a_member_of_this_chat")
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
	mochi.db.execute("update chats set synced=0 where id=?", chat_id)
	synced = request_resync(chat_id, peer)
	return {"data": {"synced": synced}}

# request_resync asks a member peer for the chat's metadata + member list
# when we receive an event referencing a chat we haven't seen yet. Chat
# is peer-to-peer (no central owner) so the responder is whoever just
# messaged us; they answer if they hold the chat. Throttled to one call
# per 60 seconds per chat so a burst of out-of-order events can't spam.
def request_resync(chat_id, peer_member):
	"""Returns True iff data was actually fetched and applied from the peer.
	Throttle-skipped calls, missing args, and remote-request failures all
	return False so callers don't lie about convergence."""
	if not chat_id or not peer_member:
		return False
	row = mochi.db.row("select synced from chats where id=?", chat_id)
	now = mochi.time.now()
	if row and row["synced"] and now - row["synced"] < 60:
		return False
	response = mochi.remote.request(peer_member, "chat", "info", {"chat": chat_id})
	if not response or response.get("error"):
		return False
	name = response.get("name") or ""
	members = response.get("members") or []
	if not mochi.text.valid(name, "name"):
		return False
	# Create chat if missing. Re-read existence here (not the throttle read
	# above): a concurrent event_new may have inserted the chat while we were
	# awaiting the blocking remote request, and the insert below is not
	# insert-or-ignore.
	existing = mochi.db.row("select id from chats where id=?", chat_id)
	if not existing:
		mochi.db.execute(
			"insert into chats ( id, name, key, updated, synced ) values ( ?, ?, ?, ?, ? )",
			chat_id, name, mochi.random.alphanumeric(16), now, now)
	else:
		mochi.db.execute("update chats set synced=? where id=?", now, chat_id)
	# Insert or refresh members.
	for m in members:
		if not mochi.text.valid(m.get("id", ""), "entity"):
			continue
		if not mochi.text.valid(m.get("name", ""), "name"):
			continue
		mochi.db.merge("members_all", ["chat", "member"], {"chat": chat_id, "member": m["id"], "name": m["name"]})
	return True

# Respond to a peer asking about a chat we both belong to. Returns the
# chat's name and member list, but only if the requester is a member of
# the chat — chat membership is private to its members.
def event_info(e):
	chat_id = e.content("chat")
	if not chat_id:
		e.stream.write({"error": "chat_id required"})
		return
	chat = mochi.db.row("select id, name from chats where id=?", chat_id)
	if not chat:
		e.stream.write({"error": "chat not found"})
		return
	requester = e.header("from")
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat_id, requester):
		e.stream.write({"error": "not a member"})
		return
	members = mochi.db.rows("select member as id, name from members where chat=?", chat_id) or []
	e.stream.write({"name": chat["name"], "members": members})

# Recieve a chat message from another member
def event_message(e):
	chat_id = e.content("chat")
	chat = mochi.db.row("select * from chats where id=?", chat_id)
	if not chat:
		# No row at all means we were never a member: departures keep a
		# status tombstone, so a missing row is unambiguous. Treat as
		# out-of-order delivery (event_new was missed) and bootstrap from the
		# sender, who must be a member if they're sending us a message they
		# thought we'd want. Only trust the sender if they're a known friend —
		# otherwise any peer that knows a chat UID could plant a fabricated
		# chat + member roster via request_resync. Mirrors the friends.get
		# gate in event_new. (action_resync is exempt: it resyncs from a
		# verified co-member of a chat the user already belongs to.)
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

	created = e.content("created")
	if not mochi.text.valid(str(created), "integer"):
		return

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if created > now + 86400 or created < now - 31536000:
		return

	body = e.content("body")
	if not mochi.text.valid(str(body), "text"):
		return
	if len(str(body)) > 10000:
		return

	# Use current name from event, fall back to cached member name
	name = e.content("name") or member["name"]

	# If this message was already deleted-for-everyone, an out-of-order or
	# replayed copy must not resurrect its body. Keep the tombstone.
	if mochi.db.exists("select 1 from deletions where message=?", id):
		body = ""

	# Structured reply: keep only if the quoted message is one we hold in
	# this chat (out-of-order delivery may not have it yet — drop silently).
	reply_to = e.content("reply_to") or None
	if reply_to:
		if not mochi.text.valid(str(reply_to), "id"):
			reply_to = None
		elif not mochi.db.exists("select 1 from messages where id=? and chat=?", reply_to, chat["id"]):
			reply_to = None

	mochi.db.execute("replace into messages ( id, chat, member, name, body, created, reply_to ) values ( ?, ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], name, body, created, reply_to)
	# Bump the chat's updated timestamp so the chat list sorts by last
	# message activity. Use the message's own `created` (not now()) so
	# replayed history doesn't drag the chat forward in time.
	if created > (chat.get("updated") or 0):
		mochi.db.execute("update chats set updated=? where id=?", created, chat["id"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		mochi.attachment.store(attachments, e.header("from"), "chat/" + chat["id"] + "/" + id)
		attachments = mochi.attachment.list("chat/" + chat["id"] + "/" + id)

	# Live-update websocket: routes through chat_commit_hook now that
	# both action_send (the sender's host) and event_message (every
	# recipient host) write the same messages row. The hook fires once
	# per host that sees the row commit, so paired tabs see the
	# message arrive without a refresh.
	chat_ensure_commit_hook()
	mochi.db.commit.fire("messages", "insert", id)
	notify("message", chat["id"], mochi.app.label("notifications.title.message"), name + ": " + body, "/chat/" + chat["id"], chat["name"], event_id="message:" + str(id))

# Received a new chat event
def event_new(e):
	f = mochi.service.call("friends", "get", e.header("to"), e.header("from"))
	if not f:
		return

	chat = e.content("id")
	if not mochi.text.valid(chat, "id"):
		return

	name = e.content("name")
	if not mochi.text.valid(name, "name"):
		return

	# mochi.db.execute returns None, not a row count, so a duplicate can't be
	# detected from its result - check the row explicitly. An existing active
	# row is a genuine duplicate event (skip). An existing non-active row is a
	# departure tombstone (we left / were removed / deleted earlier): being
	# freshly added back reactivates it, where a bare insert-or-ignore would
	# silently drop the re-add.
	existing = mochi.db.row("select status from chats where id=?", chat)
	if existing and existing["status"] == "active":
		return
	if existing:
		mochi.db.execute("update chats set status='active', name=?, updated=? where id=?", name, mochi.time.now(), chat)
	else:
		mochi.db.execute("insert or ignore into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())

	members = e.read()
	if len(members) > 10000:
		return

	for member in members:
		if not mochi.text.valid(member["id"], "entity"):
			continue
		if not mochi.text.valid(member["name"], "name"):
			continue
		mochi.db.merge("members_all", ["chat", "member"], {"chat": chat, "member": member["id"], "name": member["name"]})

# Received a rename event
def event_rename(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	name = e.content("name")
	if not mochi.text.valid(name, "name"):
		return

	# LWW gate: if a newer rename has already landed locally (concurrent
	# rename from another member's host), drop this older one. Older
	# events without `updated` (pre-conversion senders) fall back to
	# applying with local now, preserving prior behaviour.
	now = mochi.time.now()
	incoming = str(e.content("updated", "0"))
	if mochi.text.valid(incoming, "integer"):
		incoming = int(incoming)
	else:
		incoming = 0
	if incoming and chat["updated"] and incoming <= chat["updated"]:
		return
	if not incoming:
		incoming = now

	mochi.db.execute("update chats set name=?, updated=? where id=?", name, incoming, chat["id"])
	chat_websocket(chat["key"], {"event": "rename", "name": name})

# Received a leave event - a member left the chat
def event_leave(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	member = e.content("member")
	if not mochi.text.valid(member, "entity"):
		return

	# Verify the event is from the member who is leaving
	if e.header("from") != member:
		return

	mochi.db.remove("members_all", ["chat", "member"], {"chat": chat["id"], "member": member})
	chat_websocket(chat["key"], {"event": "leave", "member": member})

# Received a member/add event - someone added a new member
def event_member_add(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	member = e.content("member")
	if not mochi.text.valid(member, "entity"):
		return

	name = e.content("name")
	if not mochi.text.valid(name, "name"):
		return

	mochi.db.merge("members_all", ["chat", "member"], {"chat": chat["id"], "member": member, "name": name})
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
	chat_websocket(chat["key"], {"event": "member/add", "member": member, "name": name})

# Received a member/remove event - someone removed a member
def event_member_remove(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member of the chat
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender):
		return

	member = e.content("member")
	if not mochi.text.valid(member, "entity"):
		return

	mochi.db.remove("members_all", ["chat", "member"], {"chat": chat["id"], "member": member})
	chat_websocket(chat["key"], {"event": "member/remove", "member": member})

# Received a removed event - current user was removed from chat
def event_removed(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	# Mark chat as removed (kicked by another member); kept read-only.
	mochi.db.execute("update chats set status='removed', updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify frontend via websocket
	chat_websocket(chat["key"], {"event": "removed"})

# List members of a chat
def action_members(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	members = mochi.db.rows("select member as id, name from members where chat=?", chat["id"])
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

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
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

	# Remove self from members
	mochi.db.remove("members_all", ["chat", "member"], {"chat": chat["id"], "member": a.user.identity.id})

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

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	member_id = a.input("member")
	if not mochi.text.valid(member_id, "entity"):
		a.error.label(400, "errors.invalid_member_id")
		return

	# Check if already a member
	if mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
		a.error.label(400, "errors.already_member")
		return

	# Verify target is a friend of the user
	friend = mochi.service.call("friends", "get", a.user.identity.id, member_id)
	if not friend:
		a.error.label(400, "errors.can_only_add_friends_to_chat")
		return

	member_name = friend["name"]

	# Add new member
	mochi.db.merge("members_all", ["chat", "member"], {"chat": chat["id"], "member": member_id, "name": member_name})
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	# Get all current members for the new event
	all_members = mochi.db.rows("select member as id, name from members where chat=?", chat["id"])

	# Notify existing members about the addition. The new member's id is
	# excluded by the SQL filter; the sender's id is excluded via the
	# broadcast helper's `exclude` arg.
	existing_members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], member_id)
	existing_member_ids = [m["member"] for m in existing_members]
	broadcast_chat(chat["id"], a.user.identity.id, existing_member_ids, "member/add", {"id": chat["id"], "member": member_id, "name": member_name}, exclude=a.user.identity.id)

	# Send new event to the added member with full chat details. This is
	# a single-recipient bootstrap event carrying the member list as
	# stream body — broadcast.send doesn't carry a body and the receiver
	# has no prior _received state, so raw mochi.message.send is the
	# right shape.
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "new"}, {"id": chat["id"], "name": chat["name"]}, all_members)

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

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	member_id = a.input("member")
	if not mochi.text.valid(member_id, "entity"):
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
	mochi.db.remove("members_all", ["chat", "member"], {"chat": chat["id"], "member": member_id})
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify remaining members. The removed member's row is already gone
	# from `members`, so `remaining` excludes them; the sender is excluded
	# via the broadcast helper's `exclude` arg.
	remaining = mochi.db.rows("select member from members where chat=?", chat["id"])
	remaining_ids = [m["member"] for m in remaining]
	broadcast_chat(chat["id"], a.user.identity.id, remaining_ids, "member/remove", {"id": chat["id"], "member": member_id}, exclude=a.user.identity.id)

	# Send removed event to the removed member. Single recipient with no
	# stream to sequence against — stays on raw mochi.message.send.
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "removed"}, {"id": chat["id"]})

	chat_websocket(chat["key"], {"event": "member/remove", "member": member_id})
	return {"data": {"success": True}}

