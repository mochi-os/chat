// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// /chat/share, where another app's "Send in a chat" lands: a choice of the
// user's chats, the chosen one opening with its message box holding what was
// shared, and nothing sent.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDraft, setDraft } from '@/hooks/useChatStorage'
import { SharePage, sharedDraft } from './share-page'
import { resolveComposerDraftRestore } from './utils/composer-draft'

const state = vi.hoisted(() => ({
  chats: [] as unknown[],
  navigate: vi.fn(),
  canGoBack: false,
  back: vi.fn(),
  shellBack: vi.fn(),
  shell: false,
  present: vi.fn(),
  newChat: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/hooks/useChats', () => ({
  useChatsQuery: () => ({
    data: { chats: state.chats },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
// Nothing on the page may send: a send reaching the server would come here.
vi.mock('@/api/chats', () => ({
  chatsApi: { sendMessage: state.send },
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    isChatPinned: (id: string) => id === 'c3',
    openNewChatFor: state.newChat,
    setChatDraftPresent: state.present,
  }),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => state.navigate,
  useRouter: () => ({
    history: { canGoBack: () => state.canGoBack, back: state.back },
  }),
}))
vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  isInShell: () => state.shell,
  shellNavigateBack: (otherwise?: () => void) => state.shellBack(otherwise),
}))

const message = 'Launch party\n\nhttps://example.org/e1'

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <SharePage />
      </I18nProvider>
    </QueryClientProvider>
  )
}

// What the chat page's message box holds once it opens on the chat: its
// draft, restored into an empty box.
async function composer(chatId: string) {
  return resolveComposerDraftRestore({
    composerText: '',
    draft: await getDraft(chatId),
  })
}

describe('Send in a chat', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    localStorage.clear()
    state.chats = [
      {
        id: 'c1',
        key: 'k1',
        name: 'Alice',
        updated: 30,
        members: 2,
        other: 'p1',
      },
      { id: 'c2', key: 'k2', name: 'Book club', updated: 50, members: 5 },
      { id: 'c3', key: 'k3', name: 'Family', updated: 10, members: 4 },
      {
        id: 'c4',
        key: 'k4',
        name: 'Invited',
        updated: 90,
        members: 3,
        status: 'invited',
      },
    ]
    state.navigate = vi.fn()
    state.canGoBack = false
    state.back = vi.fn()
    state.shellBack = vi.fn()
    state.shell = false
    state.present = vi.fn()
    state.newChat = vi.fn()
    state.send = vi.fn()
    window.history.replaceState(
      null,
      '',
      '/chat/share?text=Launch+party&url=https%3A%2F%2Fexample.org%2Fe1'
    )
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('offers the chats a message may be written in, pinned first, then the most recent', () => {
    show()
    const names = screen
      .getAllByText(/^(Alice|Book club|Family|Invited)$/)
      .map((name) => name.textContent)
    expect(names).toEqual(['Family', 'Book club', 'Alice'])
  })

  it('opens the chosen chat with its message box holding what was shared, sending nothing', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Book club/ }))
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: '/$chatId',
        params: { chatId: 'c2' },
        replace: true,
      })
    )
    expect(await composer('c2')).toBe(message)
    expect(state.present).toHaveBeenCalledWith('c2', true)
    expect(state.send).not.toHaveBeenCalled()
  })

  it("keeps the chat's draft, with what was shared after it", async () => {
    setDraft('c1', 'See you there')
    show()
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }))
    await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1))
    expect(await composer('c1')).toBe(`See you there\n\n${message}`)
  })

  it('fills a new chat the same way, once the new chat dialog ends on it', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(state.newChat).toHaveBeenCalledTimes(1)
    await state.newChat.mock.calls[0][0]('c9')
    expect(await composer('c9')).toBe(message)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('finds a chat by its name', () => {
    show()
    fireEvent.change(screen.getByPlaceholderText('Search chats'), {
      target: { value: 'book' },
    })
    expect(screen.getByRole('button', { name: /Book club/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Alice/ })).toBeNull()
  })

  it('goes back when cancelled, writing nothing', async () => {
    state.canGoBack = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(state.back).toHaveBeenCalledTimes(1))
    expect(state.navigate).not.toHaveBeenCalled()
    expect(await getDraft('c2')).toBeNull()
  })

  it('goes back through the shell to the app the share came from', async () => {
    // Reached from another app: this frame's router has no history of its
    // own, but the window has somewhere to go back to.
    window.history.pushState(null, '', window.location.href)
    state.shell = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(state.shellBack).toHaveBeenCalledTimes(1))
    expect(state.back).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it("opens Chat's home when the shell has nowhere to go back to", async () => {
    state.shell = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(state.shellBack).toHaveBeenCalledTimes(1))
    // THE POINT: the shell's refusal runs the page's way out, not nothing.
    const otherwise = state.shellBack.mock.calls[0][0] as () => void
    otherwise()
    expect(state.navigate).toHaveBeenCalledWith({ to: '/', replace: true })
  })

  it('offers a new chat to a user who has none', () => {
    state.chats = []
    show()
    expect(screen.getByText('No chats')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(state.newChat).toHaveBeenCalledTimes(1)
  })
})

describe('sharedDraft', () => {
  it('is what was shared, a blank line after any draft', () => {
    expect(sharedDraft(null, message)).toBe(message)
    expect(sharedDraft(' \n', message)).toBe(message)
    expect(sharedDraft('Hello\n', message)).toBe(`Hello\n\n${message}`)
  })
})
