# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Direct messages for other apps (the federation plan, phase 28): what core's
# Mastodon and Lemmy interfaces call for a hosted fediverse account - its
# conversations, their messages, and sending, editing, deleting and reading
# them - through the same helpers the chat actions use.

def direct_identity():
	"""The user's person entity, as the functions act for it."""
	for e in mochi.entity.owned() or []:
		if e.get("class") == "person":
			return {"id": e["id"], "name": e.get("name", "")}
	return None

def direct_account(account):
	"""The hosted fediverse account a function names, or None."""
	for acc in hosted_accounts():
		if acc["id"] == account and acc.get("kind") != "group":
			return acc
	return None

def direct_chats(account):
	"""The ids of the account's conversations."""
	return [r["id"] for r in mochi.db.rows("select id from chats where account=?", account) or []]

def direct_message(row, me, read):
	"""A message as the functions answer it: whether it is the user's own
	and whether the user has read it."""
	mine = row["member"] == me
	return {"id": row["id"], "chat": row["chat"], "member": row["member"], "name": row["name"], "body": row["body"],
		"created": row["created"], "edited": row.get("edited", 0) or 0, "remote": row.get("remote", "") or "",
		"mine": mine, "read": mine or row["created"] <= read}

def direct_members(chat, me):
	return [{"id": m["member"], "name": m["name"]} for m in mochi.db.rows("select member, name from members where chat=? and member!=?", chat, me) or []]

def function_direct_conversations(context, account, limit=20, before=0):
	"""The account's conversations, the latest first: their people, last
	message and whether it is unread; before is the time a page ends at."""
	identity = direct_identity()
	if not identity or not direct_account(account):
		return []
	limit = min(max(int(limit or 20), 1), 100)
	rows = mochi.db.rows("select * from chats where account=? and status='active' and (?=0 or updated<?) order by updated desc limit ?", account, int(before or 0), int(before or 0), limit) or []
	out = []
	for chat in rows:
		read = chat_last_read(chat["id"])
		last = mochi.db.row("select * from messages where chat=? and id not in (select message from deletions where chat=?) order by created desc limit 1", chat["id"], chat["id"])
		item = {"id": chat["id"], "name": chat["name"], "updated": chat["updated"], "kind": chat.get("kind", "") or "", "people": direct_members(chat["id"], identity["id"]), "last": None, "unread": False}
		if last:
			item["last"] = direct_message(last, identity["id"], read)
			item["unread"] = not item["last"]["read"]
		out.append(item)
	return out

def function_direct_messages(context, account, chat="", person="", limit=20, before=0, after=0):
	"""Messages of the account's conversations, the newest first: of one
	conversation, of the one with a person, or of them all; a page runs
	before or after a time."""
	identity = direct_identity()
	if not identity or not direct_account(account):
		return []
	chats = direct_chats(account)
	if chat:
		chats = [c for c in chats if c == chat]
	if person:
		found = remote_conversation(account, [person])
		chats = [c for c in chats if found and c == found["id"]]
	if not chats:
		return []
	limit = min(max(int(limit or 20), 1), 100)
	places = ", ".join(["?" for _ in chats])
	rows = mochi.db.rows("select * from messages where chat in (" + places + ") and id not in (select message from deletions) and (?=0 or created<?) and created>? order by created desc limit ?", *(chats + [int(before or 0), int(before or 0), int(after or 0), limit])) or []
	reads = {}
	out = []
	for row in rows:
		if row["chat"] not in reads:
			reads[row["chat"]] = chat_last_read(row["chat"])
		out.append(direct_message(row, identity["id"], reads[row["chat"]]))
	return out

def function_direct_send(context, account, body, people=None, chat="", kind=""):
	"""Send a message as the account: to a conversation, or to people by
	their address or id, in the one with them or a new one; kind ChatMessage
	makes a new one as Lemmy's private messages are."""
	identity = direct_identity()
	if not identity or not direct_account(account):
		return {"error": mochi.app.label("errors.invalid_account")}
	if not chat:
		made, failure = remote_create(account, "", [str(p) for p in (people or [])], identity["id"], identity["name"], "ChatMessage" if kind == "ChatMessage" else "")
		if failure:
			return {"error": mochi.app.label(failure[1], **(failure[2] if len(failure) > 2 else {}))}
		chat = made["id"]
	elif chat not in direct_chats(account):
		return {"error": mochi.app.label("errors.chat_not_found")}
	result, failure = message_send(chat, identity["id"], identity["name"], body, "", "", [], None)
	if failure:
		return {"error": mochi.app.label(failure[1], **(failure[2] if len(failure) > 2 else {}))}
	row = mochi.db.row("select * from messages where id=?", result["id"])
	return direct_message(row, identity["id"], 0)

def direct_owned(account, message):
	"""The row of a message of one of the account's conversations, or None."""
	row = mochi.db.row("select * from messages where id=?", message) if mochi.text.valid(message, "id") else None
	if not row or row["chat"] not in direct_chats(account):
		return None
	return row

def function_direct_edit(context, account, message, body):
	"""Edit one of the user's messages of the account's conversations."""
	identity = direct_identity()
	row = direct_owned(account, message) if identity and direct_account(account) else None
	if not row:
		return {"error": mochi.app.label("errors.message_not_found")}
	result, failure = message_edit(row["chat"], message, identity["id"], body)
	if failure:
		return {"error": mochi.app.label(failure[1])}
	return direct_message(mochi.db.row("select * from messages where id=?", message), identity["id"], 0)

def function_direct_delete(context, account, message):
	"""Delete one of the user's messages of the account's conversations for
	everyone."""
	identity = direct_identity()
	row = direct_owned(account, message) if identity and direct_account(account) else None
	if not row:
		return {"error": mochi.app.label("errors.message_not_found")}
	result, failure = messages_delete(row["chat"], [message], identity["id"])
	if failure:
		return {"error": mochi.app.label(failure[1])}
	return result

def function_direct_read(context, account, chat="", message=""):
	"""Mark a conversation of the account read: to a message, or all of it."""
	identity = direct_identity()
	if not identity or not direct_account(account):
		return {"error": mochi.app.label("errors.invalid_account")}
	read = None
	if message:
		row = direct_owned(account, message)
		if not row:
			return {"error": mochi.app.label("errors.message_not_found")}
		chat, read = row["chat"], row["created"]
	if chat not in direct_chats(account):
		return {"error": mochi.app.label("errors.chat_not_found")}
	result, failure = chat_read(chat, identity["id"], mochi.user.preference, read)
	if failure:
		return {"error": mochi.app.label(failure[1])}
	return result

def function_direct_message(context, account, message):
	"""One message of the account's conversations, with the conversation's
	people, or None."""
	identity = direct_identity()
	row = direct_owned(account, message) if identity and direct_account(account) else None
	if not row or mochi.db.exists("select 1 from deletions where message=?", message):
		return None
	out = direct_message(row, identity["id"], chat_last_read(row["chat"]))
	out["people"] = direct_members(row["chat"], identity["id"])
	return out
