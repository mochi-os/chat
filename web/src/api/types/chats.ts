export interface Chat {
  id: string
  fingerprint?: string
  identity: string
  key: string
  name: string
  updated: number
  members: number
  other?: string  // For 2-member chats: the other member's entity ID
  left?: number  // 0 = active, 1 = left voluntarily, 2 = removed by another member
  unread?: number
}

export interface MarkReadRequest {
  read?: number
}

export interface MarkReadResponse {
  read: number
}

export interface ChatMember {
  id: string
  name: string
}

export interface ChatDetail extends Omit<Chat, 'members'> {
  members: ChatMember[]
}

export interface ChatViewResponse {
  chat: ChatDetail
  identity: string
}

export type ReactionId =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionCounts = Partial<Record<ReactionId, number>>

export interface ChatMessageAttachment {
  id: string
  name: string
  size: number
  type: string
  content_type?: string
  url?: string
  thumbnail_url?: string
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
  reply_to?: string | null
  attachments: ChatMessageAttachment[]
  reaction_counts?: ReactionCounts
  my_reaction?: ReactionId | null
  [key: string]: unknown
}

export interface PaginationMeta {
  total?: number
  page?: number
  limit?: number
}

export interface GetChatsResponse extends PaginationMeta {
  chats: Chat[]
}

export interface GetMessagesResponse extends PaginationMeta {
  messages: ChatMessage[]
  chat?: Chat
  hasMore?: boolean
  nextCursor?: number
}

export interface ChatSearchResult {
  id: string
  member: string
  name: string
  body: string
  excerpt: string
  created: number
}

export interface SearchMessagesResponse {
  query: string
  results: ChatSearchResult[]
}

export interface CreateChatRequest {
  name: string
  members: string
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
  reply_to?: string
  attachments?: SendMessageAttachment[]
}

export interface SendMessageResponse {
  id: string
  [key: string]: unknown
}

export interface GetMembersResponse {
  members: ChatMember[]
}

export interface RenameRequest {
  name: string
}

export interface RenameResponse {
  success: boolean
}

export interface LeaveRequest {
  delete?: boolean
}

export interface LeaveResponse {
  success: boolean
}

export interface DeleteResponse {
  success: boolean
}

export interface MemberAddRequest {
  member: string
}

export interface MemberAddResponse {
  success: boolean
  member: ChatMember
}

export interface MemberRemoveRequest {
  member: string
}

export interface MemberRemoveResponse {
  success: boolean
}

export interface ReactToMessageRequest {
  message: string
  reaction: string
}

export interface ReactToMessageResponse {
  reaction_counts: ReactionCounts
  my_reaction: ReactionId | null
}
