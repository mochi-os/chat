// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/chats'
import { ThreadPanel, ThreadView } from './thread-panel'

const calls = vi.hoisted(() => ({
  send: vi.fn(),
  error: vi.fn(),
  edit: vi.fn(),
  forward: vi.fn(),
  remove: vi.fn(),
  // The thread's replies, as its query answers them.
  replies: [] as unknown[],
  copy: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
}))

vi.mock('@mochi/web', async (importOriginal) => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    ...(await importOriginal<typeof import('@mochi/web')>()),
    SidePanel: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div>{children}</div> : null,
    SidePanelHeader: ({
      children,
      actions,
    }: {
      children?: ReactNode
      actions?: ReactNode
    }) => (
      <div>
        {children}
        {actions}
      </div>
    ),
    SidePanelTitle: Pass,
    // A real element, so the panel can follow new replies on it.
    SidePanelBody: (props: ComponentProps<'div'>) => (
      <div data-testid='thread-body' {...props} />
    ),
    SidePanelFooter: Pass,
    useFormat: () => ({ formatTimestamp: String, formatNumber: String }),
    toast: { error: calls.error, success: vi.fn() },
    shellClipboardWrite: calls.copy,
    shellOpenExternal: calls.open,
  }
})
// The thread's address, as the router builds it.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({
    buildLocation: ({ params }: { params: Record<string, string> }) => ({
      publicHref: `/${params.chatId}/thread/${params.messageId}`,
    }),
    history: { createHref: (href: string) => href },
  }),
}))
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
    isSuccess: true,
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

/** Replaces what a message editor holds, as typing would. Tiptap hangs its
 *  editor on the element it renders. */
function type(element: HTMLElement, text: string) {
  const editor = (element as HTMLElement & { editor?: Editor }).editor
  if (!editor) throw new Error('not a message editor')
  act(() => {
    editor.chain().selectAll().insertContent(text).run()
  })
}

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
          onClose={calls.close}
          onForward={calls.forward}
          onDelete={calls.remove}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
  const view = render(panel(root))
  return {
    invalidate,
    close: () => view.rerender(panel(null)),
    refresh: () => view.rerender(panel(root)),
  }
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
    type(screen.getByLabelText('Reply in thread'), 'Hello')
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
    type(screen.getByLabelText('Reply in thread'), '你'.repeat(3400))
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
    type(screen.getByRole('textbox', { name: 'Edit' }), 'Mine, edited')
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

describe('ThreadPanel following new replies', () => {
  const reply = (id: string, member: string) =>
    ({
      id,
      chat: 'c1',
      member,
      name: member,
      body: id,
      created: 2,
      thread: 'r1',
    }) as ChatMessage

  /** The body as a 1000px conversation in a 300px panel, scrolled to top. */
  function scrolled(top: number) {
    const body = screen.getByTestId('thread-body')
    let scrollTop = top
    Object.defineProperties(body, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value
        },
      },
    })
    body.scrollTo = vi.fn() as typeof body.scrollTo
    fireEvent.scroll(body)
    return body
  }

  beforeEach(() => {
    calls.replies = [reply('a1', 'them')]
  })

  it('brings the user’s own new reply into view, even scrolled up', () => {
    const { refresh } = setup()
    const body = scrolled(0)
    calls.replies = [reply('a1', 'them'), reply('a2', 'me')]
    refresh()
    expect(body.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: 'smooth',
    })
  })

  it('follows someone else’s reply while at the bottom', () => {
    const { refresh } = setup()
    const body = scrolled(650)
    calls.replies = [reply('a1', 'them'), reply('a2', 'them')]
    refresh()
    // 50px short of the end counts as the bottom, and it is pinned there:
    // the full height less the panel.
    expect(body.scrollTop).toBe(1000 - 300)
  })

  it('leaves the user reading higher up where they are', () => {
    const { refresh } = setup()
    const body = scrolled(100)
    calls.replies = [reply('a1', 'them'), reply('a2', 'them')]
    refresh()
    expect(body.scrollTop).toBe(100)
    expect(body.scrollTo).not.toHaveBeenCalled()
  })

  it('does not move for earlier replies loaded above', () => {
    const { refresh } = setup()
    const body = scrolled(100)
    calls.replies = [reply('a0', 'me'), reply('a1', 'them')]
    refresh()
    expect(body.scrollTop).toBe(100)
    expect(body.scrollTo).not.toHaveBeenCalled()
  })
})

describe('ThreadPanel menu', () => {
  const menu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Thread options' }), {
      key: 'Enter',
    })
  const address = `${window.location.origin}/c1/thread/r1`

  it('copies the thread’s own address', async () => {
    calls.copy.mockResolvedValue(true)
    setup()
    menu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    expect(calls.copy).toHaveBeenCalledWith(address)
  })

  it('opens the thread in a new window and closes the panel', () => {
    calls.open.mockReturnValue(true)
    calls.close.mockClear()
    setup()
    menu()
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Open in new window' })
    )
    expect(calls.open).toHaveBeenCalledWith(address)
    expect(calls.close).toHaveBeenCalledOnce()
  })

  it('keeps the panel when the browser blocks the window', () => {
    calls.open.mockReturnValue(false)
    calls.close.mockClear()
    setup()
    menu()
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Open in new window' })
    )
    expect(calls.close).not.toHaveBeenCalled()
  })
})

describe('ThreadView on its own page', () => {
  const page = (root: ChatMessage | null | undefined) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <ThreadView
            layout='page'
            chatId='c1'
            rootId='r1'
            root={root}
            currentUserIdentity='me'
            canWrite
            draft=''
            onDraftChange={() => {}}
          />
        </I18nProvider>
      </QueryClientProvider>
    )

  it('shows the replies with a note in place of a root it could not find', () => {
    calls.replies = [
      {
        id: 'a1',
        chat: 'c1',
        member: 'them',
        name: 'Tien',
        body: 'A reply',
        created: 2,
        thread: 'r1',
      },
    ]
    page(null)
    expect(screen.getByText('Message not available')).toBeInTheDocument()
    expect(screen.getByText('A reply')).toBeInTheDocument()
    expect(screen.getByLabelText('Reply in thread')).toBeInTheDocument()
  })

  it('shows the root once found', () => {
    calls.replies = []
    page(root)
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.queryByText('Message not available')).toBeNull()
  })
})
