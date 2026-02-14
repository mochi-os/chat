const endpoints = {
  chat: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    messages: (chatId: string) => `/${chatId}/-/messages`,
    send: (chatId: string) => `/${chatId}/-/send`,
    detail: (chatId: string) => `/${chatId}/-/view`,
    members: (chatId: string) => `/${chatId}/-/members`,
    rename: (chatId: string) => `/${chatId}/-/rename`,
    leave: (chatId: string) => `/${chatId}/-/leave`,
    delete: (chatId: string) => `/${chatId}/-/delete`,
    memberAdd: (chatId: string) => `/${chatId}/-/member_add`,
    memberRemove: (chatId: string) => `/${chatId}/-/member_remove`,
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
