export interface Chat {
  id: string
  identity: string
  key: string
  name: string
  updated: number
}

export interface ChatMember {
  id: string
  name: string
}

export interface ChatMessageAttachment {
  id?: string
  url?: string
  type?: string
  size?: number
  name?: string
  [key: string]: unknown
}

export interface ChatMessage {
  id: string
  chat: string
  body: string
  member: string
  name: string
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
}

export interface CreateChatRequest {
  name: string
  participantIds: string[]
}

export interface CreateChatResponse {
  id: string
  members: ChatMember[]
  name: string
  [key: string]: unknown
}

export interface NewChatFriend {
  class: string
  id: string
  identity: string
  name: string
}

export interface GetNewChatResponse {
  data: {
    friends: NewChatFriend[]
    name: string
  }
}

export interface SendMessageRequest {
  body: string
  attachments?: ChatMessageAttachment[]
}

export interface SendMessageResponse {
  id: string
  [key: string]: unknown
}

export interface UpdateChatRequest {
  name?: string
  [key: string]: unknown
}

export interface MutationSuccessResponse {
  success: boolean
  message?: string
}
