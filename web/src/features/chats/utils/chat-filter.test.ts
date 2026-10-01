// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { Chat } from '@/api/types/chats'
import {
  chatMatchesFilter,
  chatMatchesSearch,
  type ChatFilterState,
} from './chat-filter'

const chat = (over: Partial<Chat>): Chat => ({
  id: 'c',
  key: 'k',
  name: 'Chat',
  updated: 0,
  members: 3,
  ...over,
})

const state = (over: Partial<ChatFilterState> = {}): ChatFilterState => ({
  isChatMarkedUnread: () => false,
  ...over,
})

describe('chatMatchesFilter', () => {
  it('unread takes a count or a manual mark, only on an active chat', () => {
    expect(chatMatchesFilter(chat({ unread: 2 }), 'unread', state())).toBe(true)
    expect(chatMatchesFilter(chat({}), 'unread', state())).toBe(false)
    expect(
      chatMatchesFilter(
        chat({}),
        'unread',
        state({ isChatMarkedUnread: () => true })
      )
    ).toBe(true)
    expect(
      chatMatchesFilter(chat({ unread: 2, status: 'left' }), 'unread', state())
    ).toBe(false)
  })

  it('unread keeps the open chat after it is read', () => {
    expect(
      chatMatchesFilter(chat({ id: 'x' }), 'unread', state({ openChatId: 'x' }))
    ).toBe(true)
  })

  it('groups excludes one-on-one chats only', () => {
    expect(
      chatMatchesFilter(chat({ members: 2, other: 'p' }), 'groups', state())
    ).toBe(false)
    expect(chatMatchesFilter(chat({ members: 2 }), 'groups', state())).toBe(
      true
    )
    expect(chatMatchesFilter(chat({ members: 5 }), 'groups', state())).toBe(
      true
    )
  })
})

describe('chatMatchesSearch', () => {
  it('matches a trimmed, case-insensitive part of the name', () => {
    expect(chatMatchesSearch(chat({ name: 'Family Group' }), '  fam ')).toBe(
      true
    )
    expect(chatMatchesSearch(chat({ name: 'Family Group' }), 'work')).toBe(
      false
    )
    expect(chatMatchesSearch(chat({ name: 'Anything' }), '   ')).toBe(true)
  })
})
