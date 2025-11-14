const endpoints = {
  chat: {
    list: '/chat',
    new: '/chat/new',
    create: '/chat/create',
    messages: (chatId: string) => `/chat/${chatId}/messages`,
    send: (chatId: string) => `/chat/${chatId}/send`,
    detail: (chatId: string) => `/chat/${chatId}`,
  },
  auth: {
    login: '/login',
    signup: '/signup',
    verify: '/login/auth',
    logout: '/logout',
    me: '/me', // Optional: Load user profile for UI
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
