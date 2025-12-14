const endpoints = {
  chat: {
    list: 'list',
    new: 'new',
    create: 'create',
    messages: (chatId: string) => `${chatId}/messages`,
    send: (chatId: string) => `${chatId}/send`,
    detail: (chatId: string) => `${chatId}`,
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
