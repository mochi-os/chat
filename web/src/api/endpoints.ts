const endpoints = {
  chat: {
    list: '/chat/list',
    new: '/chat/new',
    create: '/chat/create',
    messages: (chatId: string) => `/chat/${chatId}/-/messages`,
    send: (chatId: string) => `/chat/${chatId}/-/send`,
    detail: (chatId: string) => `/chat/${chatId}/-/view`,
    members: (chatId: string) => `/chat/${chatId}/-/members`,
    rename: (chatId: string) => `/chat/${chatId}/-/rename`,
    leave: (chatId: string) => `/chat/${chatId}/-/leave`,
    delete: (chatId: string) => `/chat/${chatId}/-/delete`,
    memberAdd: (chatId: string) => `/chat/${chatId}/-/member_add`,
    memberRemove: (chatId: string) => `/chat/${chatId}/-/member_remove`,
  },
  auth: {
    code: '/_/code',
    verify: '/_/verify',
    identity: '/_/identity',
    logout: '/_/logout',
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
