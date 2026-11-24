// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// A link to chat with someone can be put in a post by anyone, so opening it
// must never make a chat: that would have this server reach the person it
// names in the reader's name.
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatLink, type ChatLink } from './use-chat-link'

const calls = vi.hoisted(() => ({
  route: vi.fn(),
  open: vi.fn(),
  create: vi.fn(),
  query: {
    data: undefined as
      | undefined
      | {
          friends: { id: string; name: string; chat?: string }[]
          name: string
          accounts: { id: string; identifier: string }[]
        },
    isPending: false,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => calls.route,
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({ openNewChatWith: calls.open }),
}))
vi.mock('@/hooks/useChats', () => ({
  useNewChatFriendsQuery: () => calls.query,
  useCreateChatMutation: () => ({ mutateAsync: calls.create }),
}))
vi.mock('@/api/chats', () => ({
  chatsApi: { create: calls.create },
}))

const FRIEND = 'friend-identity'
const STRANGER = 'stranger-identity'

beforeEach(() => {
  calls.route = vi.fn()
  calls.open = vi.fn()
  calls.create = vi.fn()
  calls.query = {
    data: {
      friends: [{ id: FRIEND, name: 'Ann Lee' }],
      name: 'Me',
      accounts: [{ id: 'a1', identifier: '@me:example.org' }],
    },
    isPending: false,
  }
})

function follow(link: ChatLink, viewing = false) {
  return renderHook(() => useChatLink(link, viewing))
}

describe('useChatLink', () => {
  it('opens the new chat dialog with a friend proposed, making nothing', () => {
    follow({ with: FRIEND, name: 'Ann' })
    expect(calls.open).toHaveBeenCalledWith({ friend: FRIEND })
    expect(calls.route).not.toHaveBeenCalled()
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('makes nothing for a stranger it names, leaving the dialog to pick no one', () => {
    follow({ with: STRANGER, name: 'Mallory' })
    expect(calls.open).toHaveBeenCalledWith({ friend: STRANGER })
    expect(calls.route).not.toHaveBeenCalled()
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('opens the chat there already is with a friend', () => {
    calls.query.data!.friends = [{ id: FRIEND, name: 'Ann Lee', chat: 'c7' }]
    follow({ with: FRIEND })
    expect(calls.route).toHaveBeenCalledWith({
      to: '/$chatId',
      params: { chatId: 'c7' },
      replace: true,
    })
    expect(calls.open).not.toHaveBeenCalled()
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('proposes an address on another network, making nothing', () => {
    follow({ account: 'a1', address: '@ann:example.org', name: 'Ann' })
    expect(calls.open).toHaveBeenCalledWith({
      account: 'a1',
      address: '@ann:example.org',
      name: 'Ann',
    })
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('waits for the friends before deciding, and decides once', () => {
    calls.query = { data: undefined, isPending: true }
    const { rerender } = follow({ with: FRIEND })
    expect(calls.open).not.toHaveBeenCalled()
    calls.query = {
      data: { friends: [], name: 'Me', accounts: [] },
      isPending: false,
    }
    rerender()
    rerender()
    expect(calls.open).toHaveBeenCalledTimes(1)
  })

  it('does nothing while a chat is open', () => {
    follow({ with: FRIEND }, true)
    expect(calls.open).not.toHaveBeenCalled()
    expect(calls.route).not.toHaveBeenCalled()
  })

  it('does nothing without a link', () => {
    follow({ name: 'Ann' })
    follow({ account: 'a1' })
    expect(calls.open).not.toHaveBeenCalled()
    expect(calls.route).not.toHaveBeenCalled()
  })
})
