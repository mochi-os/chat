// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, GetMessagesResponse } from '@/api/types/chats'
import { ChatMessageList } from './chat-message-list'

const message = (id: string, body: string, encrypted?: number): ChatMessage =>
  ({
    id,
    chat: 'c1',
    member: 'dave',
    name: 'Dave',
    body,
    created: 1700000000,
    attachments: [],
    encrypted,
  }) as ChatMessage

const query = {
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => Promise.resolve(),
} as unknown as UseInfiniteQueryResult<InfiniteData<GetMessagesResponse>, unknown>

describe('ChatMessageList', () => {
  it('shows an encrypted message the server read, and one whose keys have not come as encrypted', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ChatMessageList
          chatId='c1'
          messagesQuery={query}
          chatMessages={[
            message('m1', 'Hello in the clear'),
            message('m2', '', 1),
            message('m3', 'Hello decrypted', 1),
          ]}
          isLoadingMessages={false}
          messagesError={null}
          currentUserIdentity='me'
          isGroupChat={false}
        />
      </I18nProvider>
    )
    expect(screen.getByText('Hello in the clear')).toBeInTheDocument()
    expect(screen.getByText('Hello decrypted')).toBeInTheDocument()
    expect(screen.getAllByText('Encrypted message')).toHaveLength(1)
  })

  // A sender's avatar route names one of their messages, so a group chat that
  // built each message's own address fetched the same picture once per message.
  it('fetches each sender once in a group, however many turns they take', () => {
    const by = (id: string, member: string) =>
      ({ ...message(id, `Body ${id}`), member, name: member }) as ChatMessage
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <ChatMessageList
            chatId='c1'
            messagesQuery={query}
            chatMessages={[
              by('m1', 'Ann'),
              by('m2', 'Bob'),
              by('m3', 'Ann'),
              by('m4', 'Bob'),
              by('m5', 'Ann'),
            ]}
            isLoadingMessages={false}
            messagesError={null}
            currentUserIdentity='me'
            isGroupChat
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    const sources = (name: string) =>
      screen
        .getAllByAltText(`Avatar for ${name}`)
        .map((img) => img.getAttribute('src'))
    expect(sources('Ann')).toEqual(Array(3).fill('/c1/-/m1/asset/avatar'))
    expect(sources('Bob')).toEqual(Array(2).fill('/c1/-/m2/asset/avatar'))
  })

  const threaded = (
    onThread?: (m: ChatMessage) => void,
    { deleted = false } = {}
  ) => {
    const answer = (id: string, name: string, body: string, created: number) =>
      ({
        ...message(id, body),
        member: name.toLowerCase(),
        name,
        created,
        thread: 'm1',
      }) as ChatMessage
    const root = {
      ...message('m1', deleted ? '' : 'Start a thread here'),
      deleted,
      replies: 2,
      latest: 1700000200,
      answers: [
        answer('r1', 'Ann', 'The first answer', 1700000100),
        answer('r2', 'Bob', 'The second answer', 1700000200),
      ],
    } as ChatMessage
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <ChatMessageList
            chatId='c1'
            messagesQuery={query}
            chatMessages={[root]}
            isLoadingMessages={false}
            messagesError={null}
            currentUserIdentity='me'
            isGroupChat={false}
            onThread={onThread}
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    return root
  }

  it("shows a message's thread inside its own bubble, each reply below a rule, oldest first", () => {
    // THE POINT: the recipient sees the thread in the message itself,
    // without hovering or opening anything.
    const opened = vi.fn()
    const root = threaded(opened)
    const content = screen
      .getByText('Start a thread here')
      .closest('[data-slot="bubble-content"]')!
    const first = screen.getByText('The first answer')
    const second = screen.getByText('The second answer')
    expect(content).toContainElement(first)
    expect(content).toContainElement(second)
    expect(content).toHaveTextContent('Ann')
    expect(content).toHaveTextContent('Bob')
    expect(content.querySelectorAll('hr')).toHaveLength(2)
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(content.closest('[class*="opacity-0"]')).toBeNull()
    fireEvent.click(second)
    expect(opened).toHaveBeenCalledWith(root)
  })

  it('shows no thread in a message deleted while its count stands', () => {
    threaded(() => {}, { deleted: true })
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByText('The first answer')).toBeNull()
  })

  it('shows no thread where the conversation has none', () => {
    threaded(undefined)
    expect(screen.queryByText('The first answer')).toBeNull()
  })
})

describe('Seen by', () => {
  it('sits under the newest message in a group, not beside it in the bubble row', () => {
    // THE POINT: a paragraph in the bubble's own row is laid out beside it.
    const mine = {
      ...message('m1', 'Did you see this'),
      member: 'me',
      name: 'Me',
    } as ChatMessage
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <ChatMessageList
            chatId='c1'
            messagesQuery={query}
            chatMessages={[mine]}
            receipts={[
              {
                member: 'ann',
                name: 'Ann',
                delivered: 1700000000,
                displayed: 1700000000,
              },
              { member: 'bob', name: 'Bob', delivered: 0, displayed: 0 },
            ]}
            isLoadingMessages={false}
            messagesError={null}
            currentUserIdentity='me'
            isGroupChat
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    const seen = screen.getByText('Seen by Ann')
    const column = document.getElementById('chat-message-m1')
    expect(seen.parentElement).toBe(column)
  })
})
