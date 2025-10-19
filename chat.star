# Mochi Chat app
# Copyright Alistair Cunningham 2024-2025

# Create database
def database_create():
	mochi.db.query("create table chats ( id text not null primary key, identity text not null, name text not null, key text not null, updated integer not null )")
	mochi.db.query("create index chats_updated on chats( updated )")

	mochi.db.query("create table members ( chat references chats( id ), member text not null, name text not null, primary key ( chat, member ) )")

	mochi.db.query("create table messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null )")
	mochi.db.query("create index messages_chat_created on messages( chat, created )")
	return 1

# Create new chat
def action_create(a):
	chat = mochi.uid()
	name = a.input("name")
	if not mochi.valid(name, "name"):
		a.error(400, "Invalid chat name")
		return

	mochi.db.query("replace into chats ( id, identity, name, key, updated ) values ( ?, ?, ?, ?, ? )", chat, a.user.identity.id, name, mochi.random.alphanumeric(12), mochi.time.now())
	mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, a.user.identity.id, a.user.identity.name)

	members = [{"id": a.user.identity.id, "name": a.user.identity.name}]
	for friend in mochi.service.call("friends", "list"):
		if a.input(friend["id"]):
			mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, friend["id"], friend["name"])
			members.append({"id": friend["id"], "name": friend["name"]})

	for member in members:
		if member["id"] != a.user.identity.id:
			mochi.message.send({"from": a.user.identity.id, "to": member["id"], "service": "chat", "event": "new"}, {"id": chat, "name": name}, members)

	return {
		"format": "json",
		"data": {"id": chat, "name": name, "members": members}
	}

# List chats
def action_list(a):
	return {
		"format": "json",
		"data": mochi.db.query("select * from chats order by updated desc")
	}

# Enter details of new chat
def action_new(a):
	return {
		"format": "json",
		"data": {"name": a.user.identity.name, "friends": mochi.service.call("friends", "list")}
	}

# Send latest previous messages to client
def action_messages(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	messages = mochi.db.query("select * from ( select * from messages where chat=? order by id desc limit 1000 ) as ss order by id", chat["id"])
    
	for m in messages:
		m["attachments"] = mochi.attachment.get("chat/" + chat["id"] + "/" + m["id"])
		m["created_local"] = mochi.time.local(m["created"])

	return {
		"format": "json",
		"data": {"messages": messages}
	}

# Send a message
def action_send(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return

	body = a.input("body")
	if not mochi.valid(body, "text"):
		a.error(400, "Invalid message")
		return
    
	id = mochi.uid()
	mochi.db.query("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], a.user.identity.id, a.user.identity.name, body, mochi.time.now())

	# If the request includes file uploads (multipart/form-data), attachments can be handled here.
	# Current UI sends text only; skip upload to avoid errors when not multipart.
	attachments = []
	a.websocket.write(chat["key"], {"created_local": mochi.time.local(mochi.time.now()), "name": a.user.identity.name, "body": body, "attachments": attachments})

	for member in mochi.db.query("select * from members where chat=? and member!=?", chat["id"], a.user.identity.id):
		# Only send if the member ID is a valid entity
		if mochi.valid(member["member"], "entity"):
			mochi.message.send({"from": a.user.identity.id, "to": member["member"], "service": "chat", "event": "message"}, {"chat": chat["id"], "message": id, "created": mochi.time.now(), "body": body}, attachments)

	return {
		"format": "json",
		"data": {"id": id}
	}

# View a chat
def action_view(a):
	chat = mochi.db.row("select * from chats where id=?", a.input("chat"))
	if not chat:
		a.error(404, "Chat not found")
		return
    
	mochi.service.call("notifications", "clear.object", "chat", chat["id"])
	return {
		"format": "json",
		"data": {"chat": chat}
	}

# Recieve a chat message from another member
def event_message(e):
	chat = mochi.db.row("select * from chats where id=?", e.content("chat"))
	if not chat:
		return

	member = mochi.db.row("select * from members where chat=? and member=?", chat["id"], e.content("from"))
	if not member:
		return
    
	id = e.content("message")
	if not mochi.valid(id, "id"):
		return
    
	created = e.content("created")
	if not mochi.valid(created, "integer"):
		return
    
	body = e.content("body")
	if not mochi.valid(body, "text"):
		return
    
	mochi.db.query("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], member["name"], body, created)

	attachments = mochi.event.segment()
	mochi.attachment.save(attachments, "chat/" + chat["id"] + "/" + id, e.content("from"))

	e.websocket.write(chat["key"], {"created_local": mochi.time.local(created), "name": member["name"], "body": body, "attachments": attachments})
	mochi.service.call("notifications", "create", "chat", "message", chat["id"], member["name"] + ": " + body, "/chat/" + chat["id"])

# Received a new chat event
def event_new(e):
	f = mochi.service.call("friends", "get", e.content("from"))
	if not f:
		return
    
	chat = e.content("id")
	if not mochi.valid(chat, "id"):
		return
    
	if mochi.db.exists("select id from chats where id=?", chat):
		# Duplicate chat
		return
    
	name = e.content("name")
	if not mochi.valid(name, "name"):
		return
    
	mochi.db.query("replace into chats ( id, identity, name, key, updated ) values ( ?, ?, ?, ?, ? )", chat, e.content("to"), name, mochi.random.alphanumeric(12), mochi.time.now())

	for member in mochi.event.segment():
		if not mochi.valid(member["id"], "entity"):
			continue
		if not mochi.valid(member["name"], "name"):
			continue
		mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member["id"], member["name"])

	mochi.service.call("notifications", "create", "chat", "new", chat, "New chat from " + f["name"] + ": " + name, "/chat/" + chat)
