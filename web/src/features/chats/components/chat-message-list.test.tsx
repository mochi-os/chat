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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
