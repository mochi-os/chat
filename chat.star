# Mochi Chat app
# Copyright Alistair Cunningham 2024-2025

# Create database
def database_create():
	mochi.db.execute("create table chats ( id text not null primary key, identity text not null, name text not null, key text not null, updated integer not null )")
	mochi.db.execute("create index chats_updated on chats( updated )")

	mochi.db.execute("create table members ( chat references chats( id ), member text not null, name text not null, primary key ( chat, member ) )")

	mochi.db.execute("create table messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null )")
	mochi.db.execute("create index messages_chat_created on messages( chat, created )")

# Create new chat
def action_create(a):
	chat = mochi.uid()
	name = a.input("name")
	if not mochi.valid(name, "name"):
		a.error(400, "Invalid chat name")
		return

	mochi.db.execute("replace into chats ( id, identity, name, key, updated ) values ( ?, ?, ?, ?, ? )", chat, a.user.identity.id, name, mochi.random.alphanumeric(12), mochi.time.now())
	mochi.db.execute("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, a.user.identity.id, a.user.identity.name)

	members = [{"id": a.user.identity.id, "name": a.user.identity.name}]

	# Handle members from frontend (comma-separated string)
	members_str = a.input("members")
	if members_str:
		for member_id in members_str.split(","):
			if not mochi.valid(member_id, "entity"):
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
					member_name = "Unknown"

			mochi.db.execute("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member_id, member_name)
			members.append({"id": member_id, "name": member_name})

	
	for member in members:
		if member["id"] != a.user.identity.id:
			mochi.message.send({"from": a.user.identity.id, "to": member["id"], "service": "chat", "event": "new"}, {"id": chat, "name": name}, members)

	return {
		"data": {"id": chat, "name": name, "members": members}
	}

# List chats
def action_list(a):
	return {
		"data": mochi.db.rows("select * from chats order by updated desc")
	}

# Enter details of new chat
def action_new(a):
	return {
		"data": {"name": a.user.identity.name, "friends": mochi.service.call("friends", "list", a.user.identity.id)}
	}

# Get messages for a chat with cursor-based pagination
def action_messages(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	# Pagination parameters
	limit = 30
	limit_str = a.input("limit")
	if limit_str and mochi.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)

	before = None
	before_str = a.input("before")
	if before_str and mochi.valid(before_str, "natural"):
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
		m["created_local"] = mochi.time.local(m["created"])

	return {
		"data": {
			"messages": messages,
			"hasMore": has_more,
			"nextCursor": next_cursor
		}
	}

# Send a message
def action_send(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	body = a.input("body")
	if not mochi.valid(body, "text"):
		a.error(400, "Invalid message")
		return
    
	id = mochi.uid()
	mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], a.user.identity.id, a.user.identity.name, body, mochi.time.now())

	# Get other chat members for notification
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	member_ids = [m["member"] for m in members]

	# Save any uploaded attachments and notify other members via _attachment/create events
	attachments = []
	if a.input("files"):
		attachments = mochi.attachment.save("chat/" + chat["id"] + "/" + id, "files", [], [], member_ids)

	mochi.websocket.write(chat["key"], {"created": mochi.time.now(), "name": a.user.identity.name, "body": body, "attachments": attachments})

	# Send message to other members (attachments are sent separately via federation)
	for member in members:
		mochi.message.send({"from": a.user.identity.id, "to": member["member"], "service": "chat", "event": "message"}, {"chat": chat["id"], "message": id, "created": mochi.time.now(), "body": body, "name": a.user.identity.name})

	return {
		"data": {"id": id}
	}

# View a chat
def action_view(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	mochi.service.call("notifications", "clear.object", "chat", chat["id"])
	return {
		"data": {"chat": chat}
	}

# Recieve a chat message from another member
def event_message(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("chat"))
	if not chat:
		return

	member = mochi.db.row("select * from members where chat=? and member=?", chat["id"], e.header("from"))
	if not member:
		return

	id = e.content("message")
	if not mochi.valid(str(id), "id"):
		return

	created = e.content("created")
	if not mochi.valid(str(created), "integer"):
		return

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if created > now + 86400 or created < now - 31536000:
		return

	body = e.content("body")
	if not mochi.valid(str(body), "text"):
		return

	# Use current name from event, fall back to cached member name
	name = e.content("name") or member["name"]

	mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], name, body, created)

	# Attachments arrive via _attachment/create events and are saved automatically
	attachments = mochi.attachment.list("chat/" + chat["id"] + "/" + id)

	mochi.websocket.write(chat["key"], {"created": created, "name": name, "body": body, "attachments": attachments})
	mochi.service.call("notifications", "create", "chat", "message", chat["id"], name + ": " + body, "/chat/" + chat["id"])

# Received a new chat event
def event_new(e):
	f = mochi.service.call("friends", "get", e.header("to"), e.header("from"))
	if not f:
		return

	chat = e.content("id")
	if not mochi.valid(chat, "id"):
		return

	name = e.content("name")
	if not mochi.valid(name, "name"):
		return

	# Use insert or ignore to handle concurrent events atomically
	# If chat already exists, this is a duplicate event - skip processing
	result = mochi.db.execute("insert or ignore into chats ( id, identity, name, key, updated ) values ( ?, ?, ?, ?, ? )", chat, e.header("to"), name, mochi.random.alphanumeric(12), mochi.time.now())
	if result == 0:
		# Chat already existed, duplicate event
		return

	for member in e.read():
		if not mochi.valid(member["id"], "entity"):
			continue
		if not mochi.valid(member["name"], "name"):
			continue
		mochi.db.execute("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member["id"], member["name"])

	mochi.service.call("notifications", "create", "chat", "new", chat, "New chat from " + f["name"] + ": " + name, "/chat/" + chat)
