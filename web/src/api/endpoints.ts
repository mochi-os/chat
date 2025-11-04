const endpoints = {
  chat: {
    list: '/chat',
    new: '/chat/new',
    create: '/chat/create',
    messages: (chatId: string) => `/chat/${chatId}/messages`,
    send: (chatId: string) => `/chat/${chatId}/send`,
    detail: (chatId: string) => `/chat/${chatId}`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
