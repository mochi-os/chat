
import { createAppClient } from '@mochi/common'
import type {
  Chat,
  GetChatsRaw,
  GetChatsResponse,
  GetMembersResponse,
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
    const payload = await client.get<any>(endpoints.chat.detail(chatId))
    // Handle wrapped response (e.g., {data: {chat: {...}, identity: "..."}})
    return payload?.data ?? payload
  },

  messages: async (chatId: string, params?: { before?: number; limit?: number }): Promise<GetMessagesResponse> => {
    const payload = await client.get<any>(endpoints.chat.messages(chatId), { params })

    // Handle wrapped response (e.g., {data: {messages: [...], hasMore: true}})
    const unwrapped = payload?.data ?? payload

    if (Array.isArray(unwrapped)) {
      return { messages: unwrapped }
    }

    const candidates = [
      unwrapped?.messages,
      unwrapped?.data,
      unwrapped?.items,
      unwrapped?.results,
    ]
    const messages = candidates.find((value): value is any[] => Array.isArray(value)) ?? []

    return {
      messages,
      hasMore: unwrapped?.hasMore,
      nextCursor: unwrapped?.nextCursor,
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

  create: (payload: CreateChatRequest) =>
    client.post<CreateChatResponse>(endpoints.chat.create, payload),

  getMembers: (chatId: string) =>
    client.get<GetMembersResponse>(endpoints.chat.members(chatId)),

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
