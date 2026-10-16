// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type { Quote } from '@mochi/web'

// 'active' = current member; 'left' = we left voluntarily (kept read-only);
// 'removed' = removed by another member (kept read-only); 'deleted' = hidden
// tombstone (never sent in the chat list).
type ChatStatus = 'active' | 'left' | 'removed' | 'deleted'

// A missing status is treated as active so older cached rows keep working.
export const chatActive = (chat: Pick<Chat, 'status'>): boolean =>
  (chat.status ?? 'active') === 'active'

export interface Chat {
  id: string
  key: string
  name: string
  updated: number
  members: number
  other?: string // For 2-member chats: the other member's entity ID
  status?: ChatStatus
  unread?: number
  // A conversation on another network: the user's account it is had through,
  // and that account's address.
  account?: string
  address?: string
}

export interface MarkReadRequest {
  read?: number
}

export interface MarkReadResponse {
  read: number
}

interface ChatMember {
  id: string
  name: string
}

interface ChatDetail extends Omit<Chat, 'members'> {
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
  caption?: string
}

export interface ChatMessage {
  id: string
  chat: string
  body: string
  member: string
  name: string
  created: number
  reply?: string | null
  attachments: ChatMessageAttachment[]
  reactions?: ReactionCounts
  reaction?: ReactionId | null
  deleted?: boolean
  edited?: number
  // The post on another network the message's first link quotes.
  quote?: Quote | null
  // The message a reply in a thread is under; empty on the main timeline.
  thread?: string
  // On the main timeline: how many replies the message's thread has, and
  // when the latest came.
  replies?: number
  latest?: number
}

// How far a member has received and read the conversation: every message up
// to each time.
export interface ChatReceipt {
  member: string
  name: string
  delivered: number
  displayed: number
}

interface PaginationMeta {
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
  more?: boolean
  // Opaque keyset cursor for the next (older) page; null on the last one.
  cursor?: string | null
  receipts?: ChatReceipt[]
}

export interface ChatSearchResult {
  id: string
  member: string
  name: string
  body: string
  created: number
}

export interface SearchMessagesResponse {
  query: string
  results: ChatSearchResult[]
}

export interface CreateChatRequest {
  name: string
  members: string
  // A conversation on one of the user's accounts on another network, with
  // members by their addresses there.
  account?: string
}

export interface CreateChatResponse {
  id: string
  members: ChatMember[]
  name: string
}

interface NewChatFriend {
  class: string
  id: string
  identity: string
  name: string
  chat?: string
}

// One of the user's accounts on another network a conversation can be had
// through.
export interface ChatAccount {
  id: string
  identifier: string
}

export interface GetNewChatResponse {
  friends: NewChatFriend[]
  name: string
  accounts?: ChatAccount[]
}

type SendMessageAttachment = File | Blob

export interface SendMessageRequest {
  body: string
  reply?: string
  attachments?: SendMessageAttachment[]
  mentions?: string[]
  captions?: string[]
  thread?: string
}

export interface SendMessageResponse {
  id: string
}

export interface EditMessageResponse {
  id: string
  edited: number
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

export interface ReactToMessageResponse {
  reactions: ReactionCounts
  reaction: ReactionId | null
}

export interface DeleteMessagesResponse {
  deleted: string[]
}

export interface ForwardMessagesResponse {
  forwarded: string[]
  destination: string
}

// Whom may start a chat with this user (the policy preference).
export type ChatPolicy = 'friends' | 'anyone'

export interface ChatPreferences {
  policy: ChatPolicy
  // What the user shares, each on until turned off.
  presence: boolean
  receipts: boolean
  typing: boolean
}

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline' | ''

export interface ChatPresence {
  member: string
  status: PresenceStatus
  message: string
  seen: number
}

interface PersonSearchResult {
  id: string
  name: string
  fingerprint: string
}

export interface PersonSearchResponse {
  results: PersonSearchResult[]
}
