#def database_create():

#def action_create(action, inputs):

def action_list(action, inputs):
	mochi.web.template("list", mochi.db.query("select * from chats order by updated desc"))

def action_new(action, inputs):
	mochi.web.template("new", {"name": action["identity.name"], "friends": mochi.service.call("friends", "list")})

#def action_messages(action, inputs):

#def action_send(action, inputs):

#def action_view(action, inputs):

#def event_message(event):

#def event_new(event):
