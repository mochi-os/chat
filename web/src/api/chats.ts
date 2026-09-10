// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { AxiosProgressEvent } from 'axios'
import { createAppClient } from '@mochi/web'
import endpoints from './endpoints'
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
    client
      .get<{ data: Chat[] }>(endpoints.chat.list)
      .then((res) => ({ chats: res.data })),

  detail: (chatId: string) =>
    client
      .get<ChatViewResponse | { data: ChatViewResponse }>(
        endpoints.chat.detail(chatId)
      )
      .then((res) => unwrapData<ChatViewResponse>(res)),

  messages: (chatId: string, params?: { cursor?: string; limit?: number }) =>
    client
      .get<GetMessagesResponse | { data: GetMessagesResponse }>(
        endpoints.chat.messages(chatId),
        {
          params: {
            cursor: params?.cursor,
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

  sendMessage: (
    chatId: string,
    payload: SendMessageRequest,
    onProgress?: (event: AxiosProgressEvent) => void
  ) => {
    // Check if we need to send as FormData (for attachments)
    if (payload.attachments && payload.attachments.length > 0) {
      const formData = new FormData()
      formData.append('body', payload.body)
      if (payload.reply) {
        formData.append('reply', payload.reply)
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

      return client
        .post<SendMessageResponse | { data: SendMessageResponse }, FormData>(
          endpoints.chat.send(chatId),
          formData,
          { timeout: 0, onUploadProgress: onProgress }
        )
        .then((res) => unwrapData<SendMessageResponse>(res))
    }

    return client
      .post<SendMessageResponse | { data: SendMessageResponse }>(
        endpoints.chat.send(chatId),
        payload
      )
      .then((res) => unwrapData<SendMessageResponse>(res))
  },

  editMessage: (
    chatId: string,
    messageId: string,
    body: string
  ): Promise<EditMessageResponse> =>
    client
      .post<EditMessageResponse | { data: EditMessageResponse }>(
        endpoints.chat.messagesEdit(chatId),
        {
          chat: chatId,
          message: messageId,
          body,
        }
      )
      .then((res) => unwrapData<EditMessageResponse>(res)),

  getFriendsForNewChat: () =>
    client
      .get<{ data: GetNewChatResponse }>(endpoints.chat.new)
      .then((res) => res.data),

  personSearch: (search: string) =>
    client
      .post<{ data: PersonSearchResponse }>(endpoints.chat.personSearch, {
        search,
      })
      .then((res) => res.data),

  getPreferences: () =>
    client
      .get<{ data: ChatPreferences }>(endpoints.chat.preferencesGet)
      .then((res) => res.data),

  // The action answers {"data": {}} - there is nothing to read back, so the
  // call resolves to void rather than unknown.
  setPreferences: (policy: ChatPolicy): Promise<void> =>
    client
      .post<{ data: Record<string, never> }>(endpoints.chat.preferencesSet, {
        policy,
      })
      .then(() => undefined),

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
    client
      .post<RenameResponse | { data: RenameResponse }>(
        endpoints.chat.rename(chatId),
        payload
      )
      .then((res) => unwrapData<RenameResponse>(res)),

  leave: (chatId: string, payload: LeaveRequest) =>
    client
      .post<LeaveResponse | { data: LeaveResponse }>(
        endpoints.chat.leave(chatId),
        payload
      )
      .then((res) => unwrapData<LeaveResponse>(res)),

  delete: (chatId: string) =>
    client
      .post<DeleteResponse | { data: DeleteResponse }>(
        endpoints.chat.delete(chatId)
      )
      .then((res) => unwrapData<DeleteResponse>(res)),

  addMember: (chatId: string, payload: MemberAddRequest) =>
    client
      .post<MemberAddResponse | { data: MemberAddResponse }>(
        endpoints.chat.memberAdd(chatId),
        payload
      )
      .then((res) => unwrapData<MemberAddResponse>(res)),

  removeMember: (chatId: string, payload: MemberRemoveRequest) =>
    client
      .post<MemberRemoveResponse | { data: MemberRemoveResponse }>(
        endpoints.chat.memberRemove(chatId),
        payload
      )
      .then((res) => unwrapData<MemberRemoveResponse>(res)),

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
  // backend skips ids the caller doesn't own. messages is a JSON-encoded
  // array string sent form-encoded (same convention as photo-reorder ids).
  deleteMessages: (
    chatId: string,
    messageIds: string[]
  ): Promise<DeleteMessagesResponse> =>
    client
      .post<DeleteMessagesResponse | { data: DeleteMessagesResponse }>(
        endpoints.chat.messagesDelete(chatId),
        new URLSearchParams({ messages: JSON.stringify(messageIds) }),
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
          messages: JSON.stringify(messageIds),
          destination: toChat,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      .then((res) => unwrapData<ForwardMessagesResponse>(res)),

  // Forward to a friend with no chat yet. The server validates the source
  // messages BEFORE creating anything, so an empty or refused forward cannot
  // leave an orphaned chat behind - which is what create-then-forward did.
  forwardMessagesToFriend: (
    chatId: string,
    messageIds: string[],
    member: string
  ): Promise<ForwardMessagesResponse> =>
    client
      .post<ForwardMessagesResponse | { data: ForwardMessagesResponse }>(
        endpoints.chat.messagesForwardFriend(chatId),
        new URLSearchParams({
          messages: JSON.stringify(messageIds),
          member,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      .then((res) => unwrapData<ForwardMessagesResponse>(res)),
}
