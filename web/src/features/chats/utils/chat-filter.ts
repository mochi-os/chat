// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { chatActive, type Chat } from '@/api/types/chats'

export const CHAT_FILTERS = ['all', 'unread', 'groups'] as const

export type ChatFilter = (typeof CHAT_FILTERS)[number]

export interface ChatFilterState {
  isChatMarkedUnread: (chatId: string) => boolean
  // The open chat stays in the Unread list after reading it, so the row does
  // not vanish from under the pointer the moment it is clicked.
  openChatId?: string
}

// A one-on-one chat is two members with a known counterpart, the same test the
// sidebar uses to pick a person's avatar over the group icon.
export function chatIsDirect(chat: Chat): boolean {
  return chat.members === 2 && Boolean(chat.other)
}

// Same rule as the sidebar badge: only an active chat shows as unread.
export function chatIsUnread(
  chat: Chat,
  isChatMarkedUnread: (chatId: string) => boolean
): boolean {
  if (!chatActive(chat)) return false
  return (chat.unread ?? 0) > 0 || isChatMarkedUnread(chat.id)
}

export function chatMatchesFilter(
  chat: Chat,
  filter: ChatFilter,
  state: ChatFilterState
): boolean {
  switch (filter) {
    case 'unread':
      return (
        chat.id === state.openChatId ||
        chatIsUnread(chat, state.isChatMarkedUnread)
      )
    case 'groups':
      return !chatIsDirect(chat)
    case 'all':
      return true
  }
}

// Case-insensitive substring match on the chat's name, in the reader's locale.
export function chatMatchesSearch(chat: Chat, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase()
  if (!needle) return true
  return chat.name.toLocaleLowerCase().includes(needle)
}
