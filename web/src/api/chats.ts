
import { createAppClient } from '@mochi/common'
import type {
  Chat,
  ChatMessage,
  GetChatsRaw,
  GetChatsResponse,
  GetMembersResponse,
  GetMessagesRaw,
  GetMessagesResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetNewChatRaw,
  GetNewChatResponse,
  CreateChatRequest,
  CreateChatResponse,
  ChatViewResponse,
  RenameRequest,
  RenameResponse,
  LeaveRequest,
  LeaveResponse,
  DeleteResponse,
  MemberAddRequest,
  MemberAddResponse,
  MemberRemoveRequest,
  MemberRemoveResponse,
} from './types/chats'
import endpoints from './endpoints'

// Re-export types for convenience
export * from './types/chats'

const client = createAppClient({ appName: 'chat' })

type CreateChatApiResponse = { data: CreateChatResponse } | CreateChatResponse
type ChatViewApiResponse = { data: ChatViewResponse } | ChatViewResponse
type MessagesApiResponse = { data: GetMessagesRaw } | GetMessagesRaw
type GetMembersApiResponse = { data: GetMembersResponse } | GetMembersResponse

const isWrappedCreateChatResponse = (
  value: CreateChatApiResponse
): value is { data: CreateChatResponse } =>
  typeof value === 'object' && value !== null && 'data' in value

const isWrappedChatViewResponse = (
  value: ChatViewApiResponse
): value is { data: ChatViewResponse } =>
  typeof value === 'object' && value !== null && 'data' in value

const isWrappedMessagesResponse = (
  value: MessagesApiResponse
): value is { data: GetMessagesRaw } =>
  typeof value === 'object' && value !== null && 'data' in value

const isWrappedMembersResponse = (
  value: GetMembersApiResponse
): value is { data: GetMembersResponse } =>
  typeof value === 'object' && value !== null && 'data' in value

export const chatsApi = {
  list: async (): Promise<GetChatsResponse> => {
    const payload = await client.get<GetChatsRaw>(endpoints.chat.list)

    if (Array.isArray(payload)) {
      return { chats: payload }
    }

    const candidates = [
      payload?.chats,
      payload?.data,
      payload?.items,
      payload?.results,
    ]
    const chats = candidates.find((value): value is Chat[] => Array.isArray(value)) ?? []

    return {
      chats,
      total: payload?.total,
      page: payload?.page,
      limit: payload?.limit,
    }
  },

  detail: async (chatId: string): Promise<ChatViewResponse> => {
    const payload = await client.get<ChatViewApiResponse>(endpoints.chat.detail(chatId))
    if (isWrappedChatViewResponse(payload)) {
      return payload.data
    }
    return payload
  },

  messages: async (chatId: string, params?: { before?: number; limit?: number }): Promise<GetMessagesResponse> => {
    const payload = await client.get<MessagesApiResponse>(endpoints.chat.messages(chatId), { params })

    // Handle wrapped response (e.g., {data: {messages: [...], hasMore: true}})
    const unwrapped = isWrappedMessagesResponse(payload) ? payload.data : payload

    if (Array.isArray(unwrapped)) {
      return { messages: unwrapped }
    }

    const candidates = [
      unwrapped?.messages,
      unwrapped?.data,
      unwrapped?.items,
      unwrapped?.results,
    ]
    const messages = candidates.find(
      (value): value is ChatMessage[] => Array.isArray(value)
    ) ?? []
    const hasMore =
      typeof unwrapped?.hasMore === 'boolean' ? unwrapped.hasMore : undefined
    const nextCursor =
      typeof unwrapped?.nextCursor === 'number'
        ? unwrapped.nextCursor
        : undefined

    return {
      messages,
      hasMore,
      nextCursor,
    }
  },

  sendMessage: (chatId: string, payload: SendMessageRequest) => {
    // Check if we need to send as FormData (for attachments)
    if (payload.attachments && payload.attachments.length > 0) {
      const formData = new FormData()
      formData.append('body', payload.body)
      payload.attachments.forEach((file) => {
        formData.append('attachments', file)
      })
      
      return client.post<SendMessageResponse, FormData>(
        endpoints.chat.send(chatId),
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )
    }
    
    return client.post<SendMessageResponse>(endpoints.chat.send(chatId), payload)
  },

  getFriendsForNewChat: async (): Promise<GetNewChatResponse> => {
    const payload = await client.get<GetNewChatRaw>(endpoints.chat.new)
    if ('friends' in payload) {
      return payload
    }
    if (
      payload.data &&
      typeof payload.data === 'object' &&
      'friends' in payload.data
    ) {
      return payload.data
    }
    return { friends: [], name: '' }
  },

  create: async (payload: CreateChatRequest): Promise<CreateChatResponse> => {
    const response = await client.post<CreateChatApiResponse>(
      endpoints.chat.create,
      {
        name: payload.name,
        members: payload.participantIds.join(','),
      }
    )

    if (isWrappedCreateChatResponse(response)) {
      return response.data
    }

    return response
  },

  getMembers: async (chatId: string): Promise<GetMembersResponse> => {
    const payload = await client.get<GetMembersApiResponse>(
      endpoints.chat.members(chatId)
    )
    if (isWrappedMembersResponse(payload)) {
      return payload.data
    }
    return payload
  },

  rename: (chatId: string, payload: RenameRequest) =>
    client.post<RenameResponse>(endpoints.chat.rename(chatId), payload),

  leave: (chatId: string, payload: LeaveRequest) =>
    client.post<LeaveResponse>(endpoints.chat.leave(chatId), payload),

  delete: (chatId: string) =>
    client.post<DeleteResponse>(endpoints.chat.delete(chatId)),

  addMember: (chatId: string, payload: MemberAddRequest) =>
    client.post<MemberAddResponse>(endpoints.chat.memberAdd(chatId), payload),

  removeMember: (chatId: string, payload: MemberRemoveRequest) =>
    client.post<MemberRemoveResponse>(endpoints.chat.memberRemove(chatId), payload),

  checkSubscription: () =>
    client.get<{ exists: boolean }>('/-/notifications/check'),
}
