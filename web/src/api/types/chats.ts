export interface Chat {
  id: string
  fingerprint?: string
  identity: string
  key: string
  name: string
  updated: number
  members: number
}

export interface ChatMember {
  id: string
  name: string
}

export interface ChatDetail extends Omit<Chat, 'members'> {
  members: ChatMember[]
}

export interface ChatMessageAttachment {
  id: string
  name: string
  size: number
  type: string
  created?: number
}

export interface ChatMessage {
  id: string
  chat: string
  chatFingerprint?: string
  body: string
  member: string
  name: string
  email?: string
  created: number
  created_local: string
  attachments: ChatMessageAttachment[]
  [key: string]: unknown
}

export interface PaginationMeta {
  total?: number
  page?: number
  limit?: number
}

export interface ChatListEnvelope extends PaginationMeta {
  chats?: unknown
  data?: unknown
  items?: unknown
  results?: unknown
}

// API responses in dev have returned either bare arrays or wrapped payloads, so we keep a permissive union here.
export type GetChatsRaw = Chat[] | ChatListEnvelope

export interface GetChatsResponse extends PaginationMeta {
  chats: Chat[]
}

export interface MessagesEnvelope extends PaginationMeta {
  messages?: unknown
  data?: unknown
  chat?: unknown
  items?: unknown
  results?: unknown
}

// Messages endpoints behave similarly with multiple envelope shapes depending on backend version.
export type GetMessagesRaw = ChatMessage[] | MessagesEnvelope

export interface GetMessagesResponse extends PaginationMeta {
  messages: ChatMessage[]
  chat?: Chat
  hasMore?: boolean
  nextCursor?: number
}

export interface CreateChatRequest {
  name: string
  participantIds: string[]
}

export interface CreateChatResponse {
  id: string
  fingerprint?: string
  members: ChatMember[]
  name: string
  [key: string]: unknown
}

export interface NewChatFriend {
  class: string
  id: string
  identity: string
  name: string
  chatId?: string
  chatFingerprint?: string
}

export interface GetNewChatResponse {
  friends: NewChatFriend[]
  name: string
}

export type SendMessageAttachment = File | Blob

export interface SendMessageRequest {
  body: string
  attachments?: SendMessageAttachment[]
}

export interface SendMessageResponse {
  id: string
  [key: string]: unknown
}
