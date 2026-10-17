// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import type { ChatMessage, GetMessagesResponse } from '@/api/chats'
import { typingNames } from '@/features/chats/utils/typing'
import { appendMessageToCache, handleWebsocketEvent } from './useChatWebsocket'
import { chatKeys } from './useChats'

const message = (id: string): ChatMessage =>
  ({
    id,
    chat: 'c1',
    member: 'me',
    name: 'Me',
    body: 'hello',
    created: 1,
    reactions: { like: 1 },
    reaction: 'like',
  }) as unknown as ChatMessage

const seeded = () => {
  const client = new QueryClient()
  const page: GetMessagesResponse = {
    messages: [message('m1')],
    more: false,
    cursor: null,
  } as unknown as GetMessagesResponse
  client.setQueryData(chatKeys.messages('c1'), {
    pages: [page],
    pageParams: [undefined],
  })
  return client
}

describe('handleWebsocketEvent', () => {
  it('replaces the counts from a reaction frame and leaves reaction alone', () => {
    const client = seeded()
    handleWebsocketEvent(
      'c1',
      { event: 'reaction', message: 'm1', reactions: { love: 2 } },
      client,
      'me'
    )
    const cached = client.getQueryData<{ pages: GetMessagesResponse[] }>(
      chatKeys.messages('c1')
    )
    const patched = cached?.pages[0].messages[0]
    expect(patched?.reactions).toEqual({ love: 2 })
    // The frame carries no member or reaction, so nothing else can be patched.
    expect(patched?.reaction).toBe('like')
  })

  it('invalidates the list and detail keys exactly on a rename, not every loaded page', () => {
    const client = seeded()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent(
      'c1',
      { event: 'rename', name: 'New name' },
      client,
      'me'
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.all(),
      exact: true,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.detail('c1'),
      exact: true,
    })
    // The messages key must not be a prefix match of either call.
    for (const call of invalidate.mock.calls) {
      const filter = call[0] as { queryKey?: unknown[]; exact?: boolean }
      if (filter.queryKey && filter.queryKey.length <= 2) {
        expect(filter.exact).toBe(true)
      }
    }
  })
})

describe('signals and threads (phase 22)', () => {
  const pages = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryData<{ pages: GetMessagesResponse[] }>(key)?.pages ?? []

  it('moves a member\'s receipt forward and never back', () => {
    const client = seeded()
    handleWebsocketEvent(
      'c1',
      { event: 'receipt', member: 'bob', delivered: 5, displayed: 3 },
      client,
      'me'
    )
    handleWebsocketEvent(
      'c1',
      { event: 'receipt', member: 'bob', delivered: 4, displayed: 2 },
      client,
      'me'
    )
    expect(pages(client, chatKeys.messages('c1'))[0].receipts).toEqual([
      { member: 'bob', name: '', delivered: 5, displayed: 3 },
    ])
  })

  it('shows who is typing until their message comes, never the user', () => {
    const client = seeded()
    handleWebsocketEvent(
      'c1',
      { event: 'typing', member: 'bob', name: 'Bob' },
      client,
      'me'
    )
    handleWebsocketEvent(
      'c1',
      { event: 'typing', member: 'me', name: 'Me' },
      client,
      'me'
    )
    expect(typingNames('c1')).toEqual(['Bob'])
    appendMessageToCache(
      'c1',
      { id: 'm2', member: 'bob', name: 'Bob', body: 'hi', created: 2 },
      client,
      'Unknown',
      'me'
    )
    expect(typingNames('c1')).toEqual([])
  })

  it('holds typing another network says when it stops, and clears it when it does', () => {
    const client = seeded()
    const start = Date.now()
    handleWebsocketEvent(
      'c2',
      { event: 'typing', member: '@dave:example.org', name: 'Dave', typing: true, held: 30 },
      client,
      'me'
    )
    expect(typingNames('c2', start + 20000)).toEqual(['Dave'])
    expect(typingNames('c2', start + 31000)).toEqual([])
    handleWebsocketEvent(
      'c2',
      { event: 'typing', member: '@dave:example.org', name: 'Dave', typing: false },
      client,
      'me'
    )
    expect(typingNames('c2')).toEqual([])
  })

  it('lets a Mochi typing event lapse with the server window', () => {
    const client = seeded()
    const start = Date.now()
    handleWebsocketEvent('c3', { event: 'typing', member: 'bob', name: 'Bob' }, client, 'me')
    expect(typingNames('c3', start + 5000)).toEqual(['Bob'])
    expect(typingNames('c3', start + 9000)).toEqual([])
  })

  it('counts a thread reply on its root and keeps it off the main timeline', () => {
    const client = seeded()
    client.setQueryData(chatKeys.thread('c1', 'm1'), {
      pages: [{ messages: [] }],
      pageParams: [undefined],
    })
    appendMessageToCache(
      'c1',
      { id: 'r1', member: 'bob', name: 'Bob', body: 'in thread', created: 3, thread: 'm1' },
      client,
      'Unknown',
      'me'
    )
    const main = pages(client, chatKeys.messages('c1'))[0].messages
    expect(main.map((m) => m.id)).toEqual(['m1'])
    expect(main[0].replies).toBe(1)
    expect(main[0].latest).toBe(3)
    expect(
      pages(client, chatKeys.thread('c1', 'm1'))[0].messages.map((m) => m.id)
    ).toEqual(['r1'])
  })
})
