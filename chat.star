# Mochi Chat app
# Copyright Alistair Cunningham 2024-2025

# Create database
def database_create():
	mochi.db.execute("create table if not exists chats ( id text not null primary key, identity text not null, name text not null, key text not null, updated integer not null, left integer not null default 0 )")
	mochi.db.execute("create index if not exists chats_updated on chats( updated )")

	mochi.db.execute("create table if not exists members ( chat references chats( id ), member text not null, name text not null, primary key ( chat, member ) )")

	mochi.db.execute("create table if not exists messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null )")
	mochi.db.execute("create index if not exists messages_chat_created on messages( chat, created )")

# Upgrade database
def database_upgrade(to_version):
	if to_version == 3:
		# Add left column to track left/removed chats
		columns = mochi.db.rows("pragma table_info(chats)")
		has_left = False
		for col in columns:
			if col["name"] == "left":
				has_left = True
		if not has_left:
			mochi.db.execute("alter table chats add column left integer not null default 0")

# Create new chat
def action_create(a):
	name = a.input("name")
	if not mochi.valid(name, "name"):
		a.error(400, "Invalid chat name")
		return

	# Build prospective member list
	prospective_members = [{"id": a.user.identity.id, "name": a.user.identity.name}]
	
	members_str = a.input("members")
	if members_str:
		for member_id in members_str.split(","):
			if not mochi.valid(member_id, "entity"):
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
					member_name = "Unknown"
			
			prospective_members.append({"id": member_id, "name": member_name})

	# Check for existing 1-on-1 chat
	if len(prospective_members) == 2:
		other_member = prospective_members[1]
		# Find chat where both are members and total members is 2
		existing_rows = mochi.db.rows("""
			SELECT c.id, c.name 
			FROM chats c
			JOIN members m1 ON c.id = m1.chat
			JOIN members m2 ON c.id = m2.chat
			WHERE m1.member = ? AND m2.member = ?
			GROUP BY c.id
			HAVING (SELECT count(*) FROM members WHERE chat = c.id) = 2
		""", a.user.identity.id, other_member["id"])
		
		if existing_rows:
			existing_chat = existing_rows[0]
			return {
				"data": {"id": existing_chat["id"], "name": existing_chat["name"], "members": prospective_members}
			}

	chat = mochi.uid()
	mochi.db.execute("replace into chats ( id, identity, name, key, updated ) values ( ?, ?, ?, ?, ? )", chat, a.user.identity.id, name, mochi.random.alphanumeric(12), mochi.time.now())
	
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
	return {
		"data": mochi.db.rows("""
			SELECT c.*, (SELECT count(*) FROM members WHERE chat=c.id) as members 
			FROM chats c 
			LEFT JOIN members m ON m.chat = c.id AND m.member = ? 
			WHERE m.member IS NOT NULL OR c.left != 0 
			ORDER BY c.updated DESC
		""", a.user.identity.id)
	}

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
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	# Allow viewing if member OR if chat is marked as left
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and not chat["left"]:
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
	if len(body) > 10000:
		a.error(400, "Message too long")
		return

	id = mochi.uid()
	mochi.db.execute("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], a.user.identity.id, a.user.identity.name, body, mochi.time.now())

	# Get other chat members for notification
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	member_ids = [m["member"] for m in members]

	# Save any uploaded attachments and notify other members via attachment/create events
	attachments = []
	if a.input("files"):
		attachments = mochi.attachment.save("chat/" + chat["id"] + "/" + id, "files", [], [], member_ids)

	mochi.websocket.write(chat["key"], {"created": mochi.time.now(), "member": a.user.identity.id, "name": a.user.identity.name, "body": body, "attachments": attachments})

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

	# Allow viewing if member OR if chat is marked as left (user was removed or left)
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id)
	if not is_member and not chat["left"]:
		a.error(403, "Not a member of this chat")
		return

	members = mochi.db.rows("select member as id, name from members where chat=? order by name", chat["id"])
	chat["members"] = members

	mochi.service.call("notifications", "clear.object", "chat", chat["id"])
	return {
		"data": {"chat": chat, "identity": a.user.identity.id}
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

	# Attachments arrive via attachment/create events and are saved automatically
	attachments = mochi.attachment.list("chat/" + chat["id"] + "/" + id)

	mochi.websocket.write(chat["key"], {"created": created, "name": name, "body": body, "attachments": attachments})
	mochi.service.call("notifications", "send", "message", "Chat message", name + ": " + body, chat["id"], "/chat/" + chat["id"])

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

# Received a rename event
def event_rename(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member or the original creator
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender)
	is_creator = chat["identity"] == sender
	if not is_member and not is_creator:
		return

	name = e.content("name")
	if not mochi.valid(name, "name"):
		return

	mochi.db.execute("update chats set name=?, updated=? where id=?", name, mochi.time.now(), chat["id"])
	mochi.websocket.write(chat["key"], {"event": "rename", "name": name})

# Received a leave event - a member left the chat
def event_leave(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	member = e.content("member")
	if not mochi.valid(member, "entity"):
		return

	# Verify the event is from the member who is leaving
	if e.header("from") != member:
		return

	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	mochi.websocket.write(chat["key"], {"event": "leave", "member": member})

# Received a member_add event - someone added a new member
def event_member_add(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member or the original creator
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender)
	is_creator = chat["identity"] == sender
	if not is_member and not is_creator:
		return

	member = e.content("member")
	if not mochi.valid(member, "entity"):
		return

	name = e.content("name")
	if not mochi.valid(name, "name"):
		return

	mochi.db.execute("replace into members (chat, member, name) values (?, ?, ?)", chat["id"], member, name)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])
	mochi.websocket.write(chat["key"], {"event": "member_add", "member": member, "name": name})

# Received a member_remove event - someone removed a member
def event_member_remove(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	sender = e.header("from")

	# Verify sender is a member or the original creator
	is_member = mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], sender)
	is_creator = chat["identity"] == sender
	if not is_member and not is_creator:
		return

	member = e.content("member")
	if not mochi.valid(member, "entity"):
		return

	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member)
	mochi.websocket.write(chat["key"], {"event": "member_remove", "member": member})

# Received a removed event - current user was removed from chat
def event_removed(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("id"))
	if not chat:
		return

	# Mark chat as left (removed by another member)
	mochi.db.execute("update chats set left=2, updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify frontend via websocket
	mochi.websocket.write(chat["key"], {"event": "removed"})

# Notification proxy actions - forward to notifications service

def action_notifications_subscribe(a):
	"""Create a notification subscription via the notifications service."""
	label = a.input("label", "").strip()
	type = a.input("type", "").strip()
	object = a.input("object", "").strip()
	destinations = a.input("destinations", "")

	if not label:
		a.error(400, "label is required")
		return
	if not mochi.valid(label, "text"):
		a.error(400, "Invalid label")
		return

	destinations_list = json.decode(destinations) if destinations else []

	result = mochi.service.call("notifications", "subscribe", label, type, object, destinations_list)
	return {"data": {"id": result}}

def action_notifications_check(a):
	"""Check if a notification subscription exists for this app."""
	result = mochi.service.call("notifications", "subscriptions")
	return {"data": {"exists": len(result) > 0}}

def action_notifications_destinations(a):
	"""List available notification destinations."""
	result = mochi.service.call("notifications", "destinations")
	return {"data": result}

# List members of a chat
def action_members(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	members = mochi.db.rows("select member as id, name from members where chat=? order by name", chat["id"])
	return {"data": {"members": members}}

# Rename a chat
def action_rename(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	name = a.input("name")
	if not mochi.valid(name, "name"):
		a.error(400, "Invalid chat name")
		return

	mochi.db.execute("update chats set name=?, updated=? where id=?", name, mochi.time.now(), chat["id"])

	# Notify other members
	members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], a.user.identity.id)
	for member in members:
		mochi.message.send({"from": a.user.identity.id, "to": member["member"], "service": "chat", "event": "rename"}, {"id": chat["id"], "name": name})

	mochi.websocket.write(chat["key"], {"event": "rename", "name": name})
	return {"data": {"success": True}}

# Leave a chat
def action_leave(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if chat["left"]:
		a.error(400, "Already left this chat")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
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
		# Notify remaining members
		for member in remaining:
			mochi.message.send({"from": a.user.identity.id, "to": member["member"], "service": "chat", "event": "leave"}, {"id": chat["id"], "member": a.user.identity.id})
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
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	# Only allow deleting left chats
	if not chat["left"]:
		a.error(400, "Can only delete chats you have left")
		return

	# Delete locally
	mochi.db.execute("delete from messages where chat=?", chat["id"])
	mochi.db.execute("delete from members where chat=?", chat["id"])
	mochi.db.execute("delete from chats where id=?", chat["id"])

	return {"data": {"success": True}}

# Add a member to a chat
def action_member_add(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	member_id = a.input("member")
	if not mochi.valid(member_id, "entity"):
		a.error(400, "Invalid member ID")
		return

	# Check if already a member
	if mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
		a.error(400, "Already a member of this chat")
		return

	# Verify target is a friend of the user
	friend = mochi.service.call("friends", "get", a.user.identity.id, member_id)
	if not friend:
		a.error(400, "Can only add friends to chat")
		return

	member_name = friend["name"]

	# Add new member
	mochi.db.execute("replace into members (chat, member, name) values (?, ?, ?)", chat["id"], member_id, member_name)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	# Get all current members for the new event
	all_members = mochi.db.rows("select member as id, name from members where chat=?", chat["id"])

	# Notify existing members about the addition
	existing_members = mochi.db.rows("select member from members where chat=? and member!=?", chat["id"], member_id)
	for m in existing_members:
		if m["member"] != a.user.identity.id:
			mochi.message.send({"from": a.user.identity.id, "to": m["member"], "service": "chat", "event": "member_add"}, {"id": chat["id"], "member": member_id, "name": member_name})

	# Send new event to the added member with full chat details
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "new"}, {"id": chat["id"], "name": chat["name"]}, all_members)

	mochi.websocket.write(chat["key"], {"event": "member_add", "member": member_id, "name": member_name})
	return {"data": {"success": True, "member": {"id": member_id, "name": member_name}}}

# Remove a member from a chat
def action_member_remove(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], a.user.identity.id):
		a.error(403, "Not a member of this chat")
		return

	member_id = a.input("member")
	if not mochi.valid(member_id, "entity"):
		a.error(400, "Invalid member ID")
		return

	# Cannot remove self (use leave for that)
	if member_id == a.user.identity.id:
		a.error(400, "Use leave to remove yourself")
		return

	# Check if target is actually a member
	if not mochi.db.exists("select 1 from members where chat=? and member=?", chat["id"], member_id):
		a.error(404, "Member not found in this chat")
		return

	# Remove the member
	mochi.db.execute("delete from members where chat=? and member=?", chat["id"], member_id)
	mochi.db.execute("update chats set updated=? where id=?", mochi.time.now(), chat["id"])

	# Notify remaining members
	remaining = mochi.db.rows("select member from members where chat=?", chat["id"])
	for m in remaining:
		if m["member"] != a.user.identity.id:
			mochi.message.send({"from": a.user.identity.id, "to": m["member"], "service": "chat", "event": "member_remove"}, {"id": chat["id"], "member": member_id})

	# Send removed event to the removed member
	mochi.message.send({"from": a.user.identity.id, "to": member_id, "service": "chat", "event": "removed"}, {"id": chat["id"]})

	mochi.websocket.write(chat["key"], {"event": "member_remove", "member": member_id})
	return {"data": {"success": True}}
