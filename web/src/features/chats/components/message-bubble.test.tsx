// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ComponentProps } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, GetMessagesResponse } from '@/api/types/chats'
import { ChatMessageList } from './chat-message-list'

// Each drawing of a thread in a bubble, counted.
const drawn = vi.hoisted(() => ({ count: 0 }))
vi.mock('./thread-replies', async (original) => {
  const actual = await original<typeof import('./thread-replies')>()
  return {
    ThreadReplies: (props: ComponentProps<typeof actual.ThreadReplies>) => {
      drawn.count++
      return <actual.ThreadReplies {...props} />
    },
  }
})

const message = (id: string, body: string, created = 1700000000) =>
  ({
    id,
    chat: 'c1',
    member: 'dave',
    name: 'Dave',
    body,
    created,
    attachments: [],
  }) as unknown as ChatMessage

const answer = (id: string, created: number) =>
  ({ ...message(id, `Answer ${id}`, created), thread: 'm1' }) as ChatMessage

// A root with five replies, the newest three in its bubble.
const root = (replies = 5) =>
  ({
    ...message('m1', 'Start a thread here'),
    replies,
    latest: 1700000500,
    answers: [
      answer('r3', 1700000300),
      answer('r4', 1700000400),
      answer('r5', 1700000500),
    ],
  }) as ChatMessage

const query = {
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => Promise.resolve(),
} as unknown as UseInfiniteQueryResult<
  InfiniteData<GetMessagesResponse>,
  unknown
>

const list = (
  messages: ChatMessage[],
  onThread: (m: ChatMessage) => void,
  onReply?: (m: ChatMessage) => void
) => (
  <QueryClientProvider client={new QueryClient()}>
    <I18nProvider i18n={i18n}>
      <ChatMessageList
        chatId='c1'
        messagesQuery={query}
        chatMessages={messages}
        isLoadingMessages={false}
        messagesError={null}
        currentUserIdentity='me'
        isGroupChat={false}
        onThread={onThread}
        onReply={onReply}
      />
    </I18nProvider>
  </QueryClientProvider>
)

describe('a thread in its root bubble', () => {
  it('shows the newest replies and how many earlier ones, which opens the thread', () => {
    // THE POINT: the page carries the newest three; the rest are counted,
    // and the thread panel, which pages, holds them.
    const opened = vi.fn()
    const shown = root()
    render(list([shown], opened))
    expect(screen.getByText('Answer r3')).toBeInTheDocument()
    expect(screen.getByText('Answer r5')).toBeInTheDocument()
    fireEvent.click(screen.getByText('2 earlier replies'))
    expect(opened).toHaveBeenCalledWith(shown)
  })

  it('stays under a deleted message, still opening the thread', () => {
    // THE POINT: the members' replies under a message deleted for everyone
    // are still there, so its thread is too.
    const opened = vi.fn()
    const gone = { ...root(4), body: '', deleted: true } as ChatMessage
    render(list([gone], opened))
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByText('Answer r3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('1 earlier reply'))
    expect(opened).toHaveBeenCalledWith(gone)
  })

  it('says one earlier reply in the singular, and nothing when all are shown', () => {
    const { unmount } = render(list([root(4)], () => {}))
    expect(screen.getByText('1 earlier reply')).toBeInTheDocument()
    unmount()
    render(list([root(3)], () => {}))
    expect(screen.queryByText(/earlier repl/)).toBeNull()
  })
})

// THE POINT: an arriving message drew every bubble again, each with its whole
// thread: 400-800 ms a message in a conversation with a long one.
describe('the bubbles are memoised', () => {
  it('draws no bubble again for a message that arrives, with callbacks made anew', () => {
    const shown = root()
    const other = message('m2', 'Another message', 1700000600)
    const { rerender } = render(
      list(
        [shown, other],
        () => {},
        () => {}
      )
    )
    const before = drawn.count
    rerender(
      list(
        [shown, other, message('m3', 'A new message', 1700000700)],
        () => {},
        () => {}
      )
    )
    expect(screen.getByText('A new message')).toBeInTheDocument()
    expect(drawn.count).toBe(before)
    // A root that changes is drawn again.
    rerender(
      list(
        [{ ...shown, replies: 6 }, other],
        () => {},
        () => {}
      )
    )
    expect(drawn.count).toBe(before + 1)
    expect(screen.getByText('3 earlier replies')).toBeInTheDocument()
  })

  it('calls the callback the list was given last, not the one it was drawn with', () => {
    const shown = root()
    const first = vi.fn()
    const latest = vi.fn()
    const { rerender } = render(list([shown], first))
    rerender(list([shown], latest))
    fireEvent.click(screen.getByText('2 earlier replies'))
    expect(latest).toHaveBeenCalledWith(shown)
    expect(first).not.toHaveBeenCalled()
  })
})

// A Matrix message read from a device the user distrusted, or from one whose
// keys do not match, is shown with a warning naming which; another with none.
describe('a message read from a device to warn of', () => {
  it('says which warning it came with, and none for a message without one', () => {
    render(
      list(
        [
          {
            ...message('m1', 'From a distrusted device'),
            warning: 'distrusted',
          },
          {
            ...message('m2', 'From a mismatched device', 1700000100),
            warning: 'mismatched',
          },
          message('m3', 'From a device in good standing', 1700000200),
        ],
        () => {}
      )
    )
    expect(
      screen.getByText('Sent from a device you distrusted')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Sent from a device whose keys do not match')
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Sent from a device/)).toHaveLength(2)
  })
})
