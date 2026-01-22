import { requestHelpers } from '@mochi/common'
import endpoints from '@/api/endpoints'
import type {
  Chat,
  ChatDetail,
  ChatMessage,
  ChatMessageAttachment,
  ChatViewResponse,
  CreateChatRequest,
  CreateChatResponse,
  DeleteResponse,
  GetChatsRaw,
  GetChatsResponse,
  GetMembersResponse,
  GetMessagesRaw,
  GetMessagesResponse,
  GetNewChatResponse,
  LeaveRequest,
  LeaveResponse,
  MemberAddRequest,
  MemberAddResponse,
  MemberRemoveRequest,
  MemberRemoveResponse,
  RenameRequest,
  RenameResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '@/api/types/chats'

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

const toBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

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
    hasMore: toBoolean(record.hasMore) ?? toBoolean(dataRecord?.hasMore),
    nextCursor: toNumber(record.nextCursor) ?? toNumber(dataRecord?.nextCursor),
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
  if (messagesFromData.length || dataRecord) {
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
      chat: record.chat as Chat | undefined,
      ...meta,
    }
  }

  logUnexpectedStructure('chat messages', payload)
  return {
    messages: [],
    chat: record.chat as Chat | undefined,
    ...meta,
  }
}

const listChats = async (): Promise<GetChatsResponse> => {
  const response = await requestHelpers.post<GetChatsRaw>(
    endpoints.chat.list,
    null
  )
  return normalizeChatsResponse(response)
}

const getChatDetail = async (chatId: string): Promise<ChatViewResponse> => {
  const response = await requestHelpers.post<ChatViewResponse>(
    endpoints.chat.detail(chatId),
    null,
    { params: { chat: chatId } }
  )
  return response
}

const listChatMessages = async (
  chatId: string,
  options?: { before?: number; limit?: number }
): Promise<GetMessagesResponse> => {
  const response = await requestHelpers.post<GetMessagesRaw>(
    endpoints.chat.messages(chatId),
    null,
    {
      params: {
        chat: chatId,
        ...(options?.before !== undefined && { before: options.before }),
        ...(options?.limit !== undefined && { limit: options.limit }),
      },
    }
  )
  return normalizeMessagesResponse(response)
}

const createChat = (payload: CreateChatRequest) => {
  return requestHelpers.post<CreateChatResponse>(endpoints.chat.create, {
    name: payload.name,
    members: payload.participantIds.join(','),
  })
}

const sendChatMessage = (chatId: string, payload: SendMessageRequest) => {
  const hasAttachments = Boolean(payload.attachments?.length)

  if (hasAttachments) {
    const formData = new FormData()
    formData.append('body', payload.body ?? '')
    formData.append('chat', chatId)
    payload.attachments?.forEach((file) => {
      formData.append('files', file)
    })

    return requestHelpers.post<SendMessageResponse>(
      endpoints.chat.send(chatId),
      formData
    )
  }

  // Text-only messages use JSON body per spec
  return requestHelpers.post<SendMessageResponse>(endpoints.chat.send(chatId), {
    chat: chatId,
    body: payload.body,
  })
}

const getFriendsForNewChat = () =>
  requestHelpers.get<GetNewChatResponse>(endpoints.chat.new)

const getMembers = (chatId: string) =>
  requestHelpers.post<GetMembersResponse>(endpoints.chat.members(chatId), null, {
    params: { chat: chatId },
  })

const renameChat = (chatId: string, payload: RenameRequest) =>
  requestHelpers.post<RenameResponse>(endpoints.chat.rename(chatId), {
    chat: chatId,
    name: payload.name,
  })

const leaveChat = (chatId: string, payload?: LeaveRequest) =>
  requestHelpers.post<LeaveResponse>(endpoints.chat.leave(chatId), {
    chat: chatId,
    delete: payload?.delete ? 'true' : undefined,
  })

const deleteChat = (chatId: string) =>
  requestHelpers.post<DeleteResponse>(endpoints.chat.delete(chatId), {
    chat: chatId,
  })

const addMember = (chatId: string, payload: MemberAddRequest) =>
  requestHelpers.post<MemberAddResponse>(endpoints.chat.memberAdd(chatId), {
    chat: chatId,
    member: payload.member,
  })

const removeMember = (chatId: string, payload: MemberRemoveRequest) =>
  requestHelpers.post<MemberRemoveResponse>(endpoints.chat.memberRemove(chatId), {
    chat: chatId,
    member: payload.member,
  })

export const chatsApi = {
  list: listChats,
  detail: getChatDetail,
  messages: listChatMessages,
  create: createChat,
  sendMessage: sendChatMessage,
  getFriendsForNewChat,
  getMembers,
  rename: renameChat,
  leave: leaveChat,
  delete: deleteChat,
  addMember,
  removeMember,
}

export type {
  Chat,
  ChatDetail,
  ChatMessageAttachment,
  ChatMessage,
  ChatViewResponse,
  CreateChatRequest,
  CreateChatResponse,
  DeleteResponse,
  GetChatsResponse,
  GetMembersResponse,
  GetMessagesResponse,
  GetNewChatResponse,
  LeaveRequest,
  LeaveResponse,
  MemberAddRequest,
  MemberAddResponse,
  MemberRemoveRequest,
  MemberRemoveResponse,
  RenameRequest,
  RenameResponse,
  SendMessageRequest,
  SendMessageResponse,
}

export default chatsApi
