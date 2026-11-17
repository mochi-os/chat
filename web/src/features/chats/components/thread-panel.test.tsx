// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/chats'
import { ThreadPanel } from './thread-panel'

const calls = vi.hoisted(() => ({
  send: vi.fn(),
  error: vi.fn(),
  edit: vi.fn(),
  forward: vi.fn(),
  remove: vi.fn(),
  // The thread's replies, as its query answers them.
  replies: [] as unknown[],
}))

vi.mock('@mochi/web', async (importOriginal) => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    ...(await importOriginal<typeof import('@mochi/web')>()),
    SidePanel: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div>{children}</div> : null,
    SidePanelHeader: Pass,
    SidePanelTitle: Pass,
    SidePanelBody: Pass,
    SidePanelFooter: Pass,
    useFormat: () => ({ formatTimestamp: String, formatNumber: String }),
    toast: { error: calls.error },
  }
})
vi.mock('@/api/chats', () => ({
  chatsApi: { sendMessage: calls.send },
}))
vi.mock('@/hooks/useChats', () => ({
  chatKeys: {
    thread: (chat: string, root: string) => ['chats', chat, 'thread', root],
  },
  useEditMessageMutation: () => ({ mutate: calls.edit, isPending: false }),
  useThreadMessagesQuery: () => ({
    data: { pages: [{ messages: calls.replies }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
  }),
}))

const root = {
  id: 'r1',
  chat: 'c1',
  member: 'them',
  name: 'Tien',
  body: 'Root',
  created: 1,
} as ChatMessage

function setup() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const panel = (open: ChatMessage | null) => (
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <ThreadPanel
          chatId='c1'
          root={open}
          currentUserIdentity='me'
          canWrite
          onClose={() => {}}
          onForward={calls.forward}
          onDelete={calls.remove}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
  const view = render(panel(root))
  return { invalidate, close: () => view.rerender(panel(null)) }
}

describe('ThreadPanel', () => {
  beforeEach(() => {
    calls.replies = []
    calls.edit.mockReset()
    calls.forward.mockReset()
    calls.remove.mockReset()
    calls.send.mockReset()
    calls.error.mockReset()
  })

  it('checks the thread it sent to when the panel closed before the answer', async () => {
    let answer: (value: { id: string }) => void = () => {}
    calls.send.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    const { invalidate, close } = setup()
    fireEvent.change(screen.getByLabelText('Reply in thread'), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(calls.send).toHaveBeenCalled())
    expect(calls.send).toHaveBeenCalledWith('c1', {
      body: 'Hello',
      thread: 'r1',
    })
    close()
    answer({ id: 'm2' })
    await waitFor(
      () =>
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ['chats', 'c1', 'thread', 'r1'],
        }),
      { timeout: 3000 }
    )
  })

  it('refuses a reply over the server limit in bytes, not characters', () => {
    const { invalidate } = setup()
    // 3400 Chinese characters are 10200 bytes.
    fireEvent.change(screen.getByLabelText('Reply in thread'), {
      target: { value: '你'.repeat(3400) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(calls.error).toHaveBeenCalledWith('Message is too long')
    expect(calls.send).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })

  const reply = (id: string, member: string, body: string) =>
    ({
      id,
      chat: 'c1',
      member,
      name: member === 'me' ? 'Me' : 'Tien',
      body,
      created: 2,
      thread: 'r1',
    }) as ChatMessage

  // Radix opens a menu from the keyboard; jsdom has no pointer events.
  const menu = (index: number) =>
    fireEvent.keyDown(
      screen.getAllByRole('button', { name: 'Message actions' })[index],
      { key: 'Enter' }
    )

  it("offers the timeline's actions on a reply, and none on the root", () => {
    calls.replies = [reply('a1', 'me', 'Mine'), reply('a2', 'tien', 'Theirs')]
    setup()
    // THE POINT: one menu per reply; the root's actions are on its bubble.
    expect(
      screen.getAllByRole('button', { name: 'Message actions' })
    ).toHaveLength(2)
    menu(0)
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(calls.remove).toHaveBeenCalledWith(calls.replies[0])
  })

  it("lets the user forward another member's reply but not edit or delete it", () => {
    calls.replies = [reply('a2', 'tien', 'Theirs')]
    setup()
    menu(0)
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Forward' }))
    expect(calls.forward).toHaveBeenCalledWith(calls.replies[0])
  })

  it('edits a reply in place', () => {
    calls.replies = [reply('a1', 'me', 'Mine')]
    setup()
    menu(0)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit' }), {
      target: { value: 'Mine, edited' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(calls.edit).toHaveBeenCalledWith({
      chatId: 'c1',
      messageId: 'a1',
      body: 'Mine, edited',
    })
  })

  it("holds a reply's reactions and actions in the timeline's pill", () => {
    calls.replies = [
      { ...reply('a1', 'tien', 'Theirs'), reactions: { like: 2 } },
    ]
    setup()
    const pill = screen
      .getByRole('button', { name: 'Message actions' })
      .closest('[data-slot="bubble-reactions"]')
    expect(pill).not.toBeNull()
    expect(pill).toHaveTextContent('2')
  })
})
