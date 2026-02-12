
import { createAppClient } from '@mochi/common'
import type {
  Chat,
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

const unwrapData = <T>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data
  }
  return raw as T
}

export const chatsApi = {
  list: (): Promise<GetChatsResponse> => 
    client.get<{ data: Chat[] }>(endpoints.chat.list)
      .then((res) => ({ chats: res.data })),

  detail: (chatId: string) =>
    client
      .get<ChatViewResponse | { data: ChatViewResponse }>(
        endpoints.chat.detail(chatId)
      )
      .then((res) => unwrapData<ChatViewResponse>(res)),

  messages: (chatId: string, params?: { before?: number; limit?: number }) =>
    client
      .get<GetMessagesResponse | { data: GetMessagesResponse }>(
        endpoints.chat.messages(chatId),
        { params }
      )
      .then((res) => unwrapData<GetMessagesResponse>(res)),

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
  client.get<{ data: GetNewChatResponse }>(endpoints.chat.new)
    .then((res) => res.data),

  create: (payload: CreateChatRequest) =>
    client.post<CreateChatResponse>(endpoints.chat.create, payload),

  getMembers: (chatId: string) =>
    client
      .get<GetMembersResponse | { data: GetMembersResponse }>(
        endpoints.chat.members(chatId)
      )
      .then((res) => unwrapData<GetMembersResponse>(res)),

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
