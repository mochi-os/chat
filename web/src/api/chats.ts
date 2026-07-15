// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createAppClient } from '@mochi/web'
import type {
  Chat,
  GetChatsResponse,
  GetMembersResponse,
  GetMessagesResponse,
  SearchMessagesResponse,
  SendMessageRequest,
  SendMessageResponse,
  EditMessageResponse,
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
  MarkReadRequest,
  MarkReadResponse,
  ReactToMessageResponse,
  DeleteMessagesResponse,
  ForwardMessagesResponse,
  ChatPolicy,
  ChatPreferences,
  PersonSearchResponse,
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

  messages: (
    chatId: string,
    params?: { before?: number; beforeId?: string; limit?: number }
  ) =>
    client
      .get<GetMessagesResponse | { data: GetMessagesResponse }>(
        endpoints.chat.messages(chatId),
        {
          params: {
            before: params?.before,
            before_id: params?.beforeId,
            limit: params?.limit,
          },
        }
      )
      .then((res) => unwrapData<GetMessagesResponse>(res)),

  search: (chatId: string, params: { q: string }) =>
    client
      .get<SearchMessagesResponse | { data: SearchMessagesResponse }>(
        endpoints.chat.search(chatId),
        { params }
      )
      .then((res) => unwrapData<SearchMessagesResponse>(res)),

  markRead: (chatId: string, payload?: MarkReadRequest) =>
    client
      .post<MarkReadResponse | { data: MarkReadResponse }>(
        endpoints.chat.read(chatId),
        payload ?? {}
      )
      .then((res) => unwrapData<MarkReadResponse>(res)),

  sendMessage: (chatId: string, payload: SendMessageRequest) => {
    // Check if we need to send as FormData (for attachments)
    if (payload.attachments && payload.attachments.length > 0) {
      const formData = new FormData()
      formData.append('body', payload.body)
      if (payload.reply_to) {
        formData.append('reply_to', payload.reply_to)
      }
      if (payload.mentions && payload.mentions.length > 0) {
        formData.append('mentions', JSON.stringify(payload.mentions))
      }
      if (payload.captions && payload.captions.length > 0) {
        formData.append('captions', JSON.stringify(payload.captions))
      }
      payload.attachments.forEach((file) => {
        formData.append('files', file)
      })
      
      return client.post<SendMessageResponse, FormData>(
        endpoints.chat.send(chatId),
        formData,
        { timeout: 0 }
      )
    }
    
    return client.post<SendMessageResponse>(endpoints.chat.send(chatId), payload)
  },

  editMessage: (chatId: string, messageId: string, body: string): Promise<EditMessageResponse> =>
    client.post<EditMessageResponse | { data: EditMessageResponse }>(endpoints.chat.messagesEdit(chatId), {
      chat: chatId,
      message: messageId,
      body,
    }).then((res) => unwrapData<EditMessageResponse>(res)),

  getFriendsForNewChat: () =>
  client.get<{ data: GetNewChatResponse }>(endpoints.chat.new)
    .then((res) => res.data),

  personSearch: (search: string) =>
    client
      .post<{ data: PersonSearchResponse }>(endpoints.chat.personSearch, { search })
      .then((res) => res.data),

  getPreferences: () =>
    client
      .get<{ data: ChatPreferences }>(endpoints.chat.preferencesGet)
      .then((res) => res.data),

  setPreferences: (policy: ChatPolicy) =>
    client.post(endpoints.chat.preferencesSet, { chat_policy: policy }),

  create: (payload: CreateChatRequest) =>
    client
      .post<CreateChatResponse | { data: CreateChatResponse }>(
        endpoints.chat.create,
        payload
      )
      .then((res) => unwrapData<CreateChatResponse>(res)),

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

  reactToMessage: (
    chatId: string,
    messageId: string,
    reaction: string
  ): Promise<ReactToMessageResponse> =>
    client
      .post<
        ReactToMessageResponse | { data: ReactToMessageResponse },
        { chat: string; message: string; reaction: string }
      >(endpoints.chat.react(chatId), {
        chat: chatId,
        message: messageId,
        reaction: reaction || 'none',
      })
      .then((res) => unwrapData<ReactToMessageResponse>(res)),

  // Delete messages for everyone. The source chat is the URL entity; the
  // backend skips ids the caller doesn't own. message_ids is a JSON-encoded
  // array string sent form-encoded (same convention as photo-reorder ids).
  deleteMessages: (
    chatId: string,
    messageIds: string[]
  ): Promise<DeleteMessagesResponse> =>
    client
      .post<DeleteMessagesResponse | { data: DeleteMessagesResponse }>(
        endpoints.chat.messagesDelete(chatId),
        new URLSearchParams({ message_ids: JSON.stringify(messageIds) }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      .then((res) => unwrapData<DeleteMessagesResponse>(res)),

  // Forward messages from this (source) chat into another chat. body +
  // attachments are copied as new messages authored by the caller.
  forwardMessages: (
    chatId: string,
    messageIds: string[],
    toChat: string
  ): Promise<ForwardMessagesResponse> =>
    client
      .post<ForwardMessagesResponse | { data: ForwardMessagesResponse }>(
        endpoints.chat.messagesForward(chatId),
        new URLSearchParams({
          message_ids: JSON.stringify(messageIds),
          to_chat: toChat,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      .then((res) => unwrapData<ForwardMessagesResponse>(res)),
}
