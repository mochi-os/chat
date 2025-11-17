import endpoints from '@/api/endpoints'
import type {
  Chat,
  ChatMessage,
  ChatMessageAttachment,
  CreateChatRequest,
  CreateChatResponse,
  GetChatsRaw,
  GetChatsResponse,
  GetMessagesRaw,
  GetMessagesResponse,
  GetNewChatResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '@/api/types/chats'
import { requestHelpers } from '@/lib/request'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? (value as Record<string, unknown>) : undefined

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

const devConsole = globalThis.console

const logUnexpectedStructure = (context: string, payload: unknown) => {
  if (import.meta.env.DEV) {
    devConsole?.warn?.(`[API] ${context} response shape unexpected`, payload)
  }
}

const pickChatArray = (value: unknown): Chat[] => {
  if (Array.isArray(value)) {
    return value as Chat[]
  }

  const record = asRecord(value)
  if (!record) {
    return []
  }

  const candidates = [record.chats, record.items, record.results, record.data]

  for (const candidate of candidates) {
    const chats = pickChatArray(candidate)
    if (chats.length) {
      return chats
    }
  }

  return []
}

const normalizeChatsResponse = (payload: GetChatsRaw): GetChatsResponse => {
  if (Array.isArray(payload)) {
    return { chats: payload }
  }

  const record = asRecord(payload)
  if (!record) {
    logUnexpectedStructure('chats', payload)
    return { chats: [] }
  }

  const dataRecord = asRecord(record.data)
  const meta = {
    total: toNumber(record.total) ?? toNumber(dataRecord?.total),
    page: toNumber(record.page) ?? toNumber(dataRecord?.page),
    limit: toNumber(record.limit) ?? toNumber(dataRecord?.limit),
  }

  if (Array.isArray(record.chats)) {
    return {
      chats: record.chats as Chat[],
      ...meta,
    }
  }

  const chatsFromData = pickChatArray(record.data)
  if (chatsFromData.length) {
    return {
      chats: chatsFromData,
      ...meta,
    }
  }

  const fallbackChats = pickChatArray(record)
  if (fallbackChats.length) {
    return {
      chats: fallbackChats,
      ...meta,
    }
  }

  logUnexpectedStructure('chats', payload)
  return { chats: [], ...meta }
}

const pickMessagesArray = (value: unknown): ChatMessage[] => {
  if (Array.isArray(value)) {
    return value as ChatMessage[]
  }

  const record = asRecord(value)
  if (!record) {
    return []
  }

  const candidates = [
    record.messages,
    record.items,
    record.results,
    record.data,
  ]

  for (const candidate of candidates) {
    const messages = pickMessagesArray(candidate)
    if (messages.length) {
      return messages
    }
  }

  return []
}

const normalizeMessagesResponse = (
  payload: GetMessagesRaw
): GetMessagesResponse => {
  if (Array.isArray(payload)) {
    return { messages: payload }
  }

  const record = asRecord(payload)
  if (!record) {
    logUnexpectedStructure('chat messages', payload)
    return { messages: [] }
  }

  const dataRecord = asRecord(record.data)
  const meta = {
    total: toNumber(record.total) ?? toNumber(dataRecord?.total),
    page: toNumber(record.page) ?? toNumber(dataRecord?.page),
    limit: toNumber(record.limit) ?? toNumber(dataRecord?.limit),
  }

  if (Array.isArray(record.messages)) {
    return {
      messages: record.messages as ChatMessage[],
      chat:
        (record.chat as Chat | undefined) ??
        (dataRecord?.chat as Chat | undefined),
      ...meta,
    }
  }

  const messagesFromData = pickMessagesArray(record.data)
  if (messagesFromData.length) {
    return {
      messages: messagesFromData,
      chat:
        (dataRecord?.chat as Chat | undefined) ??
        (record.chat as Chat | undefined),
      ...meta,
    }
  }

  const fallbackMessages = pickMessagesArray(record)
  if (fallbackMessages.length) {
    return {
      messages: fallbackMessages,
      chat:
        (record.chat as Chat | undefined) ??
        (dataRecord?.chat as Chat | undefined),
      ...meta,
    }
  }

  logUnexpectedStructure('chat messages', payload)
  return {
    messages: [],
    chat:
      (record.chat as Chat | undefined) ??
      (dataRecord?.chat as Chat | undefined),
    ...meta,
  }
}

const listChats = async (): Promise<GetChatsResponse> => {
  const response = await requestHelpers.get<GetChatsRaw>(endpoints.chat.list)
  return normalizeChatsResponse(response)
}

const getChatDetail = (chatId: string) =>
  requestHelpers.get<Chat>(endpoints.chat.detail(chatId), {
    params: { chat: chatId },
  })

const listChatMessages = async (
  chatId: string,
  options?: { page?: number; limit?: number }
): Promise<GetMessagesResponse> => {
  const response = await requestHelpers.get<GetMessagesRaw>(
    endpoints.chat.messages(chatId),
    {
      params: {
        chat: chatId,
        ...(options?.page !== undefined && { page: options.page }),
        ...(options?.limit !== undefined && { limit: options.limit }),
      },
    }
  )
  return normalizeMessagesResponse(response)
}

const createChat = (payload: CreateChatRequest) => {
  const formData = new FormData()
  formData.append('name', payload.name)
  payload.participantIds.forEach((friendId) => {
    formData.append(friendId, 'true')
  })
  return requestHelpers.post<CreateChatResponse>(
    endpoints.chat.create,
    formData
  )
}

const sendChatMessage = (chatId: string, payload: SendMessageRequest) =>
  requestHelpers.post<SendMessageResponse>(endpoints.chat.send(chatId), null, {
    params: {
      chat: chatId,
      body: payload.body,
    },
  })

const getFriendsForNewChat = () =>
  requestHelpers.get<GetNewChatResponse>(endpoints.chat.new)

export const chatsApi = {
  list: listChats,
  detail: getChatDetail,
  messages: listChatMessages,
  create: createChat,
  sendMessage: sendChatMessage,
  getFriendsForNewChat,
}

export type {
  Chat,
  ChatMessageAttachment,
  ChatMessage,
  CreateChatRequest,
  CreateChatResponse,
  GetChatsResponse,
  GetMessagesResponse,
  GetNewChatResponse,
  SendMessageRequest,
  SendMessageResponse,
}

export default chatsApi
