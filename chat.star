# Mochi Chat app
# Copyright Alistair Cunningham 2024-2025


# Create database
def database_create():
	mochi.db.query("create table chats ( id text not null primary key, identity text not null, name text not null, updated integer not null )")
	mochi.db.query("create index chats_updated on chats( updated )")

	mochi.db.query("create table members ( chat references chats( id ), member text not null, name text not null, primary key ( chat, member ) )")

	mochi.db.query("create table messages ( id text not null primary key, chat references chats( id ), member text not null, name text not null, body text not null, created integer not null )")
	mochi.db.query("create index messages_chat_created on messages( chat, created )")
	return 1


# Create new chat
def action_create(action, inputs):
	chat = mochi.text.uid()
	name = inputs.get("name")
	if not mochi.text.valid(name, "name"):
		mochi.action.error(400, "Invalid chat name")
		return
	
	mochi.db.query("replace into chats ( id, identity, name, updated ) values ( ?, ?, ?, ? )", chat, action["identity.id"], name, mochi.time.now())
	mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, action["identity.id"], action["identity.name"])

	members = [{"id": action["identity.id"], "name": action["identity.name"]}]
	for friend in mochi.service.call("friends", "list"):
		if inputs.get(friend["id"]):
			mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, friend["id"], friend["name"])
			members.append({"id": friend["id"], "name": friend["name"]})

	for member in members:
		if member["id"] != action["identity.id"]:
			mochi.message.send({"from": action["identity.id"], "to": member["id"], "service": "chat", "event": "new"}, {"id": chat, "name": name}, members)

	mochi.action.redirect("/chat/" + chat)


# List chats
def action_list(action, inputs):
	mochi.action.write("list", action["format"], mochi.db.query("select * from chats order by updated desc"))


# Enter details of new chat
def action_new(action, inputs):
	mochi.action.write("new", action["format"], {"name": action["identity.name"], "friends": mochi.service.call("friends", "list")})


# Send previous messages to client
def action_messages(action, inputs):
	chat = mochi.db.row("select * from chats where id=?", inputs.get("chat"))
	if not chat:
		mochi.action.error(404, "Chat not found")
		return

	messages = mochi.db.query("select * from messages where chat=? order by id", chat["id"])
	
	for m in messages:
		m["attachments"] = mochi.attachments.get("chat/" + chat["id"] + "/" + m["id"])
		m["created_local"] = mochi.time.local(m["created"])

	mochi.action.write("", "json", {"messages": messages})


# Send a message
def action_send(action, inputs):
	chat = mochi.db.row("select * from chats where id=?", inputs.get("chat"))
	if not chat:
		mochi.action.error(404, "Chat not found")
		return

	body = inputs.get("body")
	if not mochi.text.valid(body, "text"):
		mochi.action.error(400, "Invalid message")
		return
	
	id = mochi.text.uid()
	mochi.db.query("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], action["identity.id"], action["identity.name"], body, mochi.time.now())

	attachments = mochi.attachments.put("attachments", "chat/" + chat["id"] + "/" + id, action["identity.id"], True)
	mochi.action.websocket.write("chat", {"created_local": mochi.time.local(mochi.time.now()), "name": action["identity.name"], "body": body, "attachments": attachments})

	for member in mochi.db.query("select * from members where chat=? and member!=?", chat["id"], action["identity.id"]):
		mochi.message.send({"from": action["identity.id"], "to": member["member"], "service": "chat", "event": "message"}, {"chat": chat["id"], "message": id, "created": mochi.time.now(), "body": body}, attachments)


# View a chat
def action_view(action, inputs):
	chat = mochi.db.row("select * from chats where id=?", inputs.get("chat"))
	if not chat:
		mochi.action.error(404, "Chat not found")
		return
	
	mochi.service.call("notifications", "clear.object", "chat", chat["id"])
	mochi.action.write("view", action["format"], {"chat": chat})


# Recieve a chat message from another member
def event_message(event, content):
	chat = mochi.db.row("select * from chats where id=?", content.get("chat"))
	if not chat:
		return

	member = mochi.db.row("select * from members where chat=? and member=?", chat["id"], event["from"])
	if not member:
		return
	
	id = content.get("message")
	if not mochi.text.valid(id, "id"):
		return
	
	created = content.get("created")
	if not mochi.text.valid(created, "integer"):
		return
	
	body = content.get("body")
	if not mochi.text.valid(body, "text"):
		return
	
	mochi.db.query("replace into messages ( id, chat, member, name, body, created ) values ( ?, ?, ?, ?, ?, ? )", id, chat["id"], member["member"], member["name"], body, created)

	attachments = mochi.event.segment()
	mochi.attachments.save(attachments, "chat/" + chat["id"] + "/" + id, event["from"])

	mochi.action.websocket.write("chat", {"created_local": mochi.time.local(created), "name": member["name"], "body": body, "attachments": attachments})
	mochi.service.call("notifications", "create", "chat", "message", chat["id"], member["name"] + ": " + body, "/chat/" + chat["id"])


# Received a new chat event
def event_new(event, content):
	f = mochi.service.call("friends", "get", event["from"])
	if not f:
		return
	
	chat = content.get("id")
	if not mochi.text.valid(chat, "id"):
		return
	
	if mochi.db.exists("select id from chats where id=?", chat):
		# Duplicate chat
		return
	
	name = content.get("name")
	if not mochi.text.valid(name, "name"):
		return
	
	mochi.db.query("replace into chats ( id, identity, name, updated ) values ( ?, ?, ?, ? )", chat, event["to"], name, mochi.time.now())

	for member in mochi.event.segment():
		if not mochi.text.valid(member["id"], "entity"):
			continue
		if not mochi.text.valid(member["name"], "name"):
			continue
		mochi.db.query("replace into members ( chat, member, name ) values ( ?, ?, ? )", chat, member["id"], member["name"])

	mochi.service.call("notifications", "create", "chat", "new", chat, "New chat from " + f["name"] + ": " + name, "/chat/" + chat)
