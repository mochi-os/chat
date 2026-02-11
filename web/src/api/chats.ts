
import { createAppClient } from '@mochi/common'
import type {
  GetChatsResponse,
  GetMembersResponse,
  GetMessagesResponse,
  SendMessageRequest,
  SendMessageResponse,
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
  list: () => client.get<GetChatsResponse>(endpoints.chat.list),

  detail: (chatId: string) =>
    client.get<ChatViewResponse>(endpoints.chat.detail(chatId)),

  messages: (chatId: string, params?: { before?: number; limit?: number }) =>
    client.get<GetMessagesResponse>(endpoints.chat.messages(chatId), { params }),

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

  getFriendsForNewChat: () => 
    client.get<GetNewChatResponse>(endpoints.chat.new),

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
    client.get<{ exists: boolean }>('/chat/-/notifications/check'),
}

