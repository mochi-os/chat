// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
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
} as unknown as UseInfiniteQueryResult<
  InfiniteData<GetMessagesResponse>,
  unknown
>

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

  it('keeps the thread of a message deleted while its count stands', () => {
    // The replies under it are still there to read.
    threaded(() => {}, { deleted: true })
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByText('The first answer')).toBeInTheDocument()
  })

  it('shows no thread where the conversation has none', () => {
    threaded(undefined)
    expect(screen.queryByText('The first answer')).toBeNull()
  })

  // A photo cannot size its own bubble: Firefox gives an image sized in
  // percentages no width in a bubble that fits its content, so a photo sent
  // without a caption showed as an empty circle.
  const photo = (id: string) => ({
    id,
    name: `${id}.jpg`,
    size: 1000,
    type: 'image/jpeg',
    content_type: 'image/jpeg',
    caption: '',
    created: 1700000000,
  })
  const bubbleOf = (messages: ChatMessage[], alt: string) => {
    render(
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
            onThread={() => {}}
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    return screen
      .getByAltText(alt)
      .closest('[data-slot="bubble-content"]') as HTMLElement
  }

  it('gives a photo with no caption a bubble of the photo width', () => {
    const content = bubbleOf(
      [{ ...message('m1', ''), attachments: [photo('p1')] } as ChatMessage],
      'p1.jpg'
    )
    // THE POINT: a width of its own, not one taken from the photo.
    expect(content.className.split(' ')).toContain('w-[20rem]')
  })

  it('gives a message the photo width when a reply in its thread holds a photo', () => {
    const answer = {
      ...message('r1', ''),
      thread: 'm1',
      attachments: [photo('p2')],
    } as ChatMessage
    const content = bubbleOf(
      [
        {
          ...message('m1', 'Hi'),
          replies: 1,
          latest: 1700000100,
          answers: [answer],
        } as ChatMessage,
      ],
      'p2.jpg'
    )
    expect(content).toHaveTextContent('Hi')
    expect(content.className.split(' ')).toContain('w-[20rem]')
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

describe('Editing a message', () => {
  it('shows the edit box at the bubble side, with no band across the row, and scrolls all of it into view', () => {
    const scrolled: { element: Element; options: unknown }[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (options) {
      scrolled.push({ element: this as Element, options })
    }
    onTestFinished(() => {
      Element.prototype.scrollIntoView = original
    })
    const mine = { ...message('m1', '4'), member: 'me', name: 'Me' }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <ChatMessageList
            chatId='c1'
            messagesQuery={query}
            chatMessages={[mine as ChatMessage]}
            isLoadingMessages={false}
            messagesError={null}
            currentUserIdentity='me'
            isGroupChat={false}
            editingMessageId='m1'
            editingBody='4a'
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    const field = screen.getByRole('textbox', { name: 'Edit' })
    expect(field.textContent).toBe('4a')
    const box = field.closest('.rounded-xl')
    expect(box?.className.split(' ')).toContain('ml-auto')
    // THE POINT: nothing between the box and the list tints the whole row.
    const column = document.getElementById('chat-message-m1')
    const row = column?.parentElement
    for (const element of [column, row]) {
      expect(element?.className).not.toMatch(/\bbg-primary/)
    }
    // The box is taller than the bubble: its buttons must show too.
    expect(scrolled).toContainEqual({
      element: box,
      options: { block: 'nearest' },
    })
  })
})

// A thread docking beside the timeline narrows it, and its messages wrap
// taller without anything scrolling.
describe('Timeline width', () => {
  function observed() {
    const resized: (() => void)[] = []
    const original = global.ResizeObserver
    global.ResizeObserver = class {
      constructor(callback: () => void) {
        resized.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    onTestFinished(() => {
      global.ResizeObserver = original
    })
    render(
      <I18nProvider i18n={i18n}>
        <ChatMessageList
          chatId='c1'
          messagesQuery={query}
          chatMessages={[message('m1', 'One'), message('m2', 'Two')]}
          isLoadingMessages={false}
          messagesError={null}
          currentUserIdentity='me'
          isGroupChat={false}
        />
      </I18nProvider>
    )
    const list = screen.getByText('One').closest('.overflow-y-auto')
    if (!(list instanceof HTMLElement)) throw new Error('no timeline')
    let width = 800
    let top = 0
    Object.defineProperties(list, {
      clientWidth: { configurable: true, get: () => width },
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = value
        },
      },
    })
    return {
      list,
      // The timeline narrowing, as the observer reports it.
      narrow: () => {
        width = 500
        resized.forEach((callback) => callback())
      },
      scrollTo: (value: number) => {
        top = value
        fireEvent.scroll(list)
      },
    }
  }

  it('keeps a reader at the bottom there when it narrows', () => {
    const { list, narrow, scrollTo } = observed()
    scrollTo(700)
    // The messages wrapped taller and nothing scrolled.
    Object.defineProperty(list, 'scrollHeight', { value: 1200 })
    narrow()
    expect(list.scrollTop).toBe(1200 - 300)
  })

  it('leaves a reader higher up where they are', () => {
    const { list, narrow, scrollTo } = observed()
    scrollTo(100)
    Object.defineProperty(list, 'scrollHeight', { value: 1200 })
    narrow()
    expect(list.scrollTop).toBe(100)
  })
})
