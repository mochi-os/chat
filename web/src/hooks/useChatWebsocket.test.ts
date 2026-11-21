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
    // The frame names no member, as an older chat app sends it, so the
    // viewer's own reaction stays.
    expect(patched?.reaction).toBe('like')
  })

  it("takes the viewer's own reaction from a frame that names them, and only them", () => {
    const client = seeded()
    const held = () =>
      client.getQueryData<{ pages: GetMessagesResponse[] }>(
        chatKeys.messages('c1')
      )?.pages[0].messages[0]
    handleWebsocketEvent(
      'c1',
      { event: 'reaction', message: 'm1', reactions: { love: 1 }, member: 'bob', reaction: 'love' },
      client,
      'me'
    )
    expect(held()?.reaction).toBe('like')
    // Removed on another of the viewer's devices.
    handleWebsocketEvent(
      'c1',
      { event: 'reaction', message: 'm1', reactions: { love: 1 }, member: 'me', reaction: null },
      client,
      'me'
    )
    expect(held()?.reactions).toEqual({ love: 1 })
    expect(held()?.reaction).toBeNull()
    handleWebsocketEvent(
      'c1',
      { event: 'reaction', message: 'm1', reactions: { love: 2 }, member: 'me', reaction: 'love' },
      client,
      'me'
    )
    expect(held()?.reaction).toBe('love')
  })

  it('reads the messages again when an encrypted message is decrypted, adding nothing', () => {
    const client = seeded()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const kind = handleWebsocketEvent(
      'c1',
      { event: 'decrypted', message: 'm1' },
      client,
      'me'
    )
    expect(kind).toBe('event')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c1'),
    })
  })

  it('shows a new message whose keys have not come as encrypted, not as an empty bubble', () => {
    const client = seeded()
    appendMessageToCache(
      'c1',
      { id: 'm2', member: 'them', name: 'Them', body: '', created: 2, attachments: [], encrypted: 1 },
      client,
      'Unknown',
      'me'
    )
    appendMessageToCache(
      'c1',
      { id: 'm3', member: 'them', name: 'Them', body: 'plain', created: 3, attachments: [] },
      client,
      'Unknown',
      'me'
    )
    const cached = client.getQueryData<{ pages: GetMessagesResponse[] }>(
      chatKeys.messages('c1')
    )
    const held = cached?.pages[0].messages ?? []
    expect(held.find((m) => m.id === 'm2')?.encrypted).toBe(1)
    expect(held.find((m) => m.id === 'm3')?.encrypted ?? 0).toBe(0)
  })

  it('keeps the warning a message comes with, and the one its edit comes with', () => {
    const client = seeded()
    appendMessageToCache(
      'c1',
      { id: 'm2', member: 'them', name: 'Them', body: 'beware', created: 2, attachments: [], warning: 'mismatched' },
      client,
      'Unknown',
      'me'
    )
    const held = () =>
      client
        .getQueryData<{ pages: GetMessagesResponse[] }>(chatKeys.messages('c1'))
        ?.pages[0].messages.find((m) => m.id === 'm2')
    expect(held()?.warning).toBe('mismatched')
    handleWebsocketEvent(
      'c1',
      { event: 'edit', message: 'm2', body: 'beware, edited', edited: 5, warning: '' },
      client,
      'me'
    )
    expect(held()?.body).toBe('beware, edited')
    expect(held()?.warning).toBe('')
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

  // A root seeded with its thread's replies, as the server sends them.
  const threaded = () => {
    const client = new QueryClient()
    const answer = (id: string, body: string, created: number) =>
      ({
        ...message(id),
        name: 'Bob',
        body,
        created,
        thread: 'm1',
      }) as ChatMessage
    client.setQueryData(chatKeys.messages('c1'), {
      pages: [
        {
          messages: [
            {
              ...message('m1'),
              replies: 2,
              latest: 5,
              answers: [answer('r1', 'first', 4), answer('r2', 'second', 5)],
            },
          ],
          more: false,
          cursor: null,
        },
      ],
      pageParams: [undefined],
    })
    return client
  }
  const root = (client: QueryClient) =>
    pages(client, chatKeys.messages('c1'))[0].messages[0]
  const shown = (client: QueryClient) =>
    (root(client).answers ?? []).map((answer) => answer.id)
  const arrive = (client: QueryClient, id: string, created: number) =>
    appendMessageToCache(
      'c1',
      { id, member: 'bob', name: 'Bob', body: id, created, thread: 'm1' },
      client,
      'Unknown',
      'me'
    )

  it("adds a thread reply that arrives to its root's bubble, in order", () => {
    // THE POINT: the thread in the bubble follows it live.
    const client = threaded()
    arrive(client, 'r3', 6)
    expect(shown(client)).toEqual(['r1', 'r2', 'r3'])
    expect(root(client).replies).toBe(3)
    // One sent earlier that lands late is counted, and takes its place by
    // time: before the newest three the bubble keeps, so it is not shown.
    arrive(client, 'r0', 3)
    expect(shown(client)).toEqual(['r1', 'r2', 'r3'])
    expect(root(client).replies).toBe(4)
    // The bubble holds it already: not counted again.
    arrive(client, 'r3', 6)
    expect(root(client).replies).toBe(4)
  })

  // A root as the server sends one with more replies than its bubble shows:
  // five in all, the newest three in answers.
  const capped = () => {
    const client = threaded()
    const first = root(client)
    const answer = (id: string, created: number) => ({
      ...first.answers![0],
      id,
      body: id,
      created,
    })
    client.setQueryData(chatKeys.messages('c1'), {
      pages: [
        {
          messages: [
            {
              ...first,
              replies: 5,
              latest: 7,
              answers: [answer('r3', 5), answer('r4', 6), answer('r5', 7)],
            },
          ],
          more: false,
          cursor: null,
        },
      ],
      pageParams: [undefined],
    })
    return client
  }

  it('keeps the newest three in the bubble as replies arrive, counting every one', () => {
    // THE POINT: a page carried every reply of every thread; the bubble
    // shows the newest three and the count says how many there are.
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    arrive(client, 'r6', 8)
    expect(shown(client)).toEqual(['r4', 'r5', 'r6'])
    expect(root(client).replies).toBe(6)
    expect(root(client).latest).toBe(8)
    arrive(client, 'r7', 9)
    expect(shown(client)).toEqual(['r5', 'r6', 'r7'])
    expect(root(client).replies).toBe(7)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('reads the page again for a reply older than those shown on a root with earlier ones', () => {
    // It may be one of the earlier replies, counted already.
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    arrive(client, 'r2', 4)
    expect(shown(client)).toEqual(['r3', 'r4', 'r5'])
    expect(root(client).replies).toBe(5)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c1'),
    })
  })

  it('reads the page again when a shown reply of a root with earlier ones is deleted', () => {
    // The next earlier reply takes its place, and only the server has it.
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent(
      'c1',
      { event: 'delete', message: 'r4', thread: 'm1' },
      client,
      'me'
    )
    expect(shown(client)).toEqual(['r3', 'r5'])
    expect(root(client).replies).toBe(4)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c1'),
    })
  })

  it('reads the page again when an earlier reply the bubble does not show is deleted', () => {
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent(
      'c1',
      { event: 'delete', message: 'r1', thread: 'm1' },
      client,
      'me'
    )
    expect(shown(client)).toEqual(['r3', 'r4', 'r5'])
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c1'),
    })
  })

  // A chat app that sends the root's thread with each reply and delete: the
  // root takes it as it is, and the page is never read again for it.
  const summary = (client: QueryClient, replies: number, ...ids: string[]) => {
    const first = root(client).answers![0]
    return {
      replies,
      latest: 9,
      answers: ids.map((id, i) => ({ ...first, id, body: id, created: 7 + i })),
    }
  }

  it('sets the root from the thread a reply frame carries, guessing nothing', () => {
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const thread = summary(client, 6, 'r4', 'r5', 'r6')
    const send = () =>
      appendMessageToCache(
        'c1',
        { id: 'r0', member: 'bob', name: 'Bob', body: 'r0', created: 2, thread: 'm1', root: thread },
        client,
        'Unknown',
        'me'
      )
    // Older than every reply shown, which without the thread is read again.
    send()
    expect(shown(client)).toEqual(['r4', 'r5', 'r6'])
    expect(root(client).replies).toBe(6)
    expect(root(client).latest).toBe(9)
    // THE POINT: the same frame again leaves the count as the server has it.
    send()
    expect(root(client).replies).toBe(6)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('sets the root from the thread a delete frame carries, whether or not it held the reply', () => {
    const client = capped()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent(
      'c1',
      { event: 'delete', message: 'r1', thread: 'm1', root: summary(client, 4, 'r3', 'r4', 'r5') },
      client,
      'me'
    )
    expect(root(client).replies).toBe(4)
    expect(shown(client)).toEqual(['r3', 'r4', 'r5'])
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('starts a read of the page under way again when a frame changes its messages', async () => {
    // The read answers from before the frame, and landing would undo it.
    const client = capped()
    vi.spyOn(client, 'isFetching').mockReturnValue(1)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    appendMessageToCache(
      'c1',
      { event: 'typing', member: 'bob', name: 'Bob' },
      client,
      'Unknown',
      'me'
    )
    await Promise.resolve()
    expect(invalidate).not.toHaveBeenCalled()
    arrive(client, 'r6', 8)
    await Promise.resolve()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c1'),
    })
  })

  it("shows an edit of a reply in its root's bubble", () => {
    const client = threaded()
    handleWebsocketEvent(
      'c1',
      { event: 'edit', message: 'r1', body: 'first, edited', edited: 7 },
      client,
      'me'
    )
    expect(root(client).answers?.[0].body).toBe('first, edited')
    expect(root(client).body).toBe('hello')
  })

  it("takes a deleted reply out of its root's bubble, without reading the conversation again", () => {
    const client = threaded()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    handleWebsocketEvent('c1', { event: 'delete', message: 'r2' }, client, 'me')
    expect(shown(client)).toEqual(['r1'])
    expect(root(client).replies).toBe(1)
    expect(root(client).latest).toBe(4)
    expect(root(client).deleted).toBeUndefined()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
