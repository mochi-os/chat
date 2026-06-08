# Mochi Chat app
# Copyright Alistair Cunningham 2024-2026

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
def chat_commit_hook(table, kind, row_uid):
	if table != "messages" or kind != "insert" or not row_uid:
		return
	message = mochi.db.row("select * from messages where id=?", row_uid)
	if not message:
		return
	chat = mochi.db.row("select key from chats where id=?", message["chat"])
	if not chat:
		return
	attachments = mochi.attachment.list("chat/" + message["chat"] + "/" + message["id"])
	mochi.websocket.write(chat["key"], {
		"id": message["id"],
		"created": message["created"],
		"member": message["member"],
		"name": message["name"],
		"body": message["body"],
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
	mochi.db.execute("create table if not exists chats ( id text not null primary key, name text not null, key text not null, updated integer not null, left integer not null default 0, synced integer not null default 0 )")
	mochi.db.execute("create index if not exists chats_updated on chats( updated )")

	mochi.db.execute("create table if not exists members ( chat references chats( id ), member text not null, name text not null, primary key ( chat, member ) )")
	mochi.db.execute("create index if not exists members_member on members( member )")

	mochi.db.execute("create table if not exists messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null )")
	mochi.db.execute("create index if not exists messages_chat_created on messages( chat, created )")

	mochi.db.execute("create table if not exists chat_read ( chat text not null primary key references chats( id ), last_read integer not null default 0 )")

# Ensure chat_read exists (migration v9 used the wrong mochi.db.tables() shape).
def ensure_chat_read_table():
	tables = mochi.db.tables() or []
	if "chat_read" in tables:
		return
	mochi.db.execute("create table chat_read ( chat text not null primary key references chats( id ), last_read integer not null default 0 )")
	mochi.db.execute("insert or ignore into chat_read ( chat, last_read ) select id, updated from chats")

# Per-chat read watermark for the local account (not replicated).
def chat_last_read(chat_id):
	ensure_chat_read_table()
	row = mochi.db.row("select last_read from chat_read where chat=?", chat_id)
	if not row:
		return 0
	return row["last_read"]

def chat_set_last_read(chat_id, ts):
	mochi.db.execute("insert or replace into chat_read ( chat, last_read ) values ( ?, ? )", chat_id, ts)

def chat_unread_count(chat_id, identity, last_read):
	row = mochi.db.row("select count(*) as n from messages where chat=? and created>? and member!=?", chat_id, last_read, identity)
	if not row:
		return 0
	return row["n"]

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
	if to_version == 9 or to_version == 10:
		ensure_chat_read_table()

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
		mochi.db.execute("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member["id"], member["name"])
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
	ensure_chat_read_table()
	identity = a.user.identity.id
	chats = mochi.db.rows("""
		SELECT c.*,
			(SELECT count(*) FROM members WHERE chat=c.id) as members,
			(SELECT count(*) FROM messages msg
			 WHERE msg.chat = c.id
			   AND msg.created > coalesce((SELECT last_read FROM chat_read WHERE chat = c.id), 0)
			   AND msg.member != ?) as unread
		FROM chats c
		LEFT JOIN members m ON m.chat = c.id AND m.member = ?
		WHERE m.member IS NOT NULL OR c.left != 0
		ORDER BY c.updated DESC
	""", identity, identity)
	for chat in chats:
		if chat.get("left"):
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
	if not is_member and not chat["left"]:
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	# Pagination parameters
	limit = 30
	limit_str = a.input("limit")
	if limit_str and mochi.text.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)

	before = None
	before_str = a.input("before")
	if before_str and mochi.text.valid(before_str, "natural"):
		before = int(before_str)

	# Fetch messages (newest first internally, then reverse for chronological display)
	if before:
		messages = mochi.db.rows("select * from messages where chat=? and created<? order by created desc limit ?", chat["id"], before, limit + 1)
	else:
		messages = mochi.db.rows("select * from messages where chat=? order by created desc limit ?", chat["id"], limit + 1)

	# Check if there are more (older) messages
	has_more = len(messages) > limit
	if has_more:
		messages = messages[:limit]

	# Reverse to chronological order (oldest first) for display
	messages = list(reversed(messages))

	# Cursor for next page is the oldest message's timestamp
	next_cursor = None
	if has_more and len(messages) > 0:
		next_cursor = messages[0]["created"]

	for m in messages:
		m["attachments"] = mochi.attachment.list("chat/" + chat["id"] + "/" + m["id"])

	return {
		"data": {
			"messages": messages,
			"hasMore": has_more,
			"nextCursor": next_cursor
		}
	}

# Search messages in a chat by body text
def action_search(a):
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and not chat["left"]:
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	query = a.input("q", "")
	if not query or len(query.strip()) == 0:
		return {"data": {"query": "", "results": []}}

	query = query.strip()
	if len(query) < 2:
		return {"data": {"query": query, "results": []}}

	escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
	pattern = "%" + escaped + "%"

	results = mochi.db.rows(
		"select id, member, name, body, created, substr(body, 1, 200) as excerpt from messages where chat=? and body like ? escape '\\' order by created desc limit 100",
		chat["id"],
		pattern,
	)

	return {"data": {"query": query, "results": results}}

# Mark a chat as read up to a timestamp watermark
def action_mark_read(a):
	ensure_chat_read_table()
	if not mochi.text.valid(a.input("chat"), "id"):
		a.error.label(400, "errors.invalid_chat_id")
		return
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error.label(404, "errors.chat_not_found")
		return

	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and not chat["left"]:
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	read_ts = None
	read_str = a.input("read", "")
	if read_str and mochi.text.valid(read_str, "natural"):
		read_ts = int(read_str)

	if read_ts == None:
		last_msg = mochi.db.row("select max(created) as ts from messages where chat=?", chat["id"])
		if last_msg and last_msg.get("ts"):
			read_ts = last_msg["ts"]
		else:
			read_ts = chat["updated"]

	current = chat_last_read(chat["id"])
	if read_ts < current:
		read_ts = current

	chat_set_last_read(chat["id"], read_ts)
	return {"data": {"read": read_ts}}

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

	chat_ensure_commit_hook()
	id = mochi.uid()
	now_send = mochi.time.now()
	mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], a.user.identity.id, a.user.identity.name, body, now_send)
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
	# arg is needed here. Reuse now_send (the timestamp already written to
	# the DB) so sender and recipients store the identical created value.
	msg_data = {"chat": chat["id"], "message": id, "created": now_send, "body": body, "name": a.user.identity.name}
	if attachments:
		msg_data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now_send)} for att in attachments]
	broadcast_chat(chat["id"], a.user.identity.id, member_ids, "message", msg_data)

	return {
		"data": {"id": id}
	}

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
	if not is_member and not chat["left"]:
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
		mochi.db.execute(
			"replace into members ( chat, member, name ) values ( ?, ?, ? )",
			chat_id, m["id"], m["name"])
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
		# Out-of-order: event_new was missed. Try to bootstrap the chat
		# from the sender, who must be a member if they're sending us a
		# message they thought we'd want. Only trust the sender if they're a
		# known friend — otherwise any peer that knows a chat UID could plant
		# a fabricated chat + member roster via request_resync. Mirrors the
		# friends.get gate in event_new. (action_resync is exempt: it resyncs
		# from a verified co-member of a chat the user already belongs to.)
		if not mochi.service.call("friends", "get", e.header("to"), e.header("from")):
			return
		request_resync(chat_id, e.header("from"))
		chat = mochi.db.row("select * from chats where id=?", chat_id)
		if not chat:
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

	mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], name, body, created)
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

	# Use insert or ignore to handle concurrent events atomically
	# If chat already exists, this is a duplicate event - skip processing
	result = mochi.db.execute("insert or ignore into chats ( id, name, key, updated ) values ( ?, ?, ?, ? )", chat, name, mochi.random.alphanumeric(16), mochi.time.now())
	if result == 0:
		# Chat already existed, duplicate event
		return

	members = e.read()
	if len(members) > 10000:
		return

	for member in members:
		if not mochi.text.valid(member["id"], "entity"):
			continue
		if not mochi.text.valid(member["name"], "name"):
			continue
		mochi.db.execute("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member["id"], member["name"])

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
	mochi.websocket.write(chat["key"], {"event": "rename", "name": name})

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

	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	mochi.websocket.write(chat["key"], {"event": "leave", "member": member})

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

	mochi.db.execute("replace into members (chat, member, name) values (?, ?, ?)", chat["id"], member, name)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
	mochi.websocket.write(chat["key"], {"event": "member/add", "member": member, "name": name})

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

	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	mochi.websocket.write(chat["key"], {"event": "member/remove", "member": member})

# Received a removed event - current user was removed from chat
def event_removed(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	# Mark chat as left (removed by another member)
	mochi.db.execute("update chats set left=2, updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify frontend via websocket
	mochi.websocket.write(chat["key"], {"event": "removed"})

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

	mochi.websocket.write(chat["key"], {"event": "rename", "name": name})
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

	if chat["left"]:
		a.error.label(400, "errors.already_left_this_chat")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error.label(403, "errors.not_a_member_of_this_chat")
		return

	delete_local = a.input("delete") == "true"

	# Remove self from members
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], a.user.identity.id)

	# Check if any members remain
	remaining = mochi.db.rows("select member from members where chat=?", chat["id"])

	if len(remaining) == 0:
		# Last member left, delete chat and messages
		mochi.db.execute("delete from messages where chat=?", chat["id"])
		mochi.db.execute("delete from chats where id=?", chat["id"])
	else:
		# Notify remaining members. The actor's own row was already
		# deleted above, so `remaining` excludes them — no `exclude` arg.
		remaining_ids = [m["member"] for m in remaining]
		broadcast_chat(chat["id"], a.user.identity.id, remaining_ids, "leave", {"id": chat["id"], "member": a.user.identity.id})
		mochi.websocket.write(chat["key"], {"event": "leave", "member": a.user.identity.id})

		if delete_local:
			# Delete chat locally
			mochi.db.execute("delete from messages where chat=?", chat["id"])
			mochi.db.execute("delete from members where chat=?", chat["id"])
			mochi.db.execute("delete from chats where id=?", chat["id"])
		else:
			# Mark chat as left
			mochi.db.execute("update chats set left=1, updated=? where id=?", mochi.time.now(), chat["id"])

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

	# Only allow deleting left chats
	if not chat["left"]:
		a.error.label(400, "errors.delete_only_left_chat")
		return

	# Delete locally
	mochi.db.execute("delete from messages where chat=?", chat["id"])
	mochi.db.execute("delete from members where chat=?", chat["id"])
	mochi.db.execute("delete from chats where id=?", chat["id"])

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
	mochi.db.execute("replace into members (chat, member, name) values (?, ?, ?)", chat["id"], member_id, member_name)
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

	mochi.websocket.write(chat["key"], {"event": "member/add", "member": member_id, "name": member_name})
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
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member_id)
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

	mochi.websocket.write(chat["key"], {"event": "member/remove", "member": member_id})
	return {"data": {"success": True}}

