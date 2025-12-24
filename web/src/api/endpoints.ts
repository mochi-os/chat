const endpoints = {
  chat: {
    list: '/chat/list',
    new: '/chat/new',
    create: '/chat/create',
    messages: (chatId: string) => `/chat/${chatId}/-/messages`,
    send: (chatId: string) => `/chat/${chatId}/-/send`,
    detail: (chatId: string) => `/chat/${chatId}/-/view`,
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
