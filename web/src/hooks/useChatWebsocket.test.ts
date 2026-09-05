// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test fixtures, not user-facing */
import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { handleWebsocketEvent } from './useChatWebsocket'
import { chatKeys } from './useChats'
import type { ChatMessage, GetMessagesResponse } from '@/api/chats'

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
  client.setQueryData(chatKeys.messages('c1'), { pages: [page], pageParams: [undefined] })
  return client
}

describe('handleWebsocketEvent', () => {
  it('replaces the counts from a reaction frame and leaves reaction alone', () => {
    const client = seeded()
    handleWebsocketEvent('c1', { event: 'reaction', message: 'm1', reactions: { love: 2 } }, client, 'me')
    const cached = client.getQueryData<{ pages: GetMessagesResponse[] }>(chatKeys.messages('c1'))
    const patched = cached?.pages[0].messages[0]
    expect(patched?.reactions).toEqual({ love: 2 })
    // The frame carries no member or reaction, so nothing else can be patched.
    expect(patched?.reaction).toBe('like')
  })

  it('invalidates the list and detail keys exactly on a rename, not every loaded page', () => {
    const client = seeded()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent('c1', { event: 'rename', name: 'New name' }, client, 'me')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.all(), exact: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.detail('c1'), exact: true })
    // The messages key must not be a prefix match of either call.
    for (const call of invalidate.mock.calls) {
      const filter = call[0] as { queryKey?: unknown[]; exact?: boolean }
      if (filter.queryKey && filter.queryKey.length <= 2) {
        expect(filter.exact).toBe(true)
      }
    }
  })
})
