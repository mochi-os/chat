// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewChat, friendRequest, refusal } from './new-chat'

const STRANGER = '1sfEACmTnQhBVgquGhaCs8Jw4SXKF9XY2apnUwJ63duq2QSxh5'

const calls = vi.hoisted(() => ({
  create: vi.fn(),
  close: vi.fn(),
  navigate: vi.fn(),
  // What the create's error resolver answered for each failure: a message
  // toasted, or false for none.
  toasted: [] as unknown[],
  // The user's accounts on other networks.
  accounts: [] as { id: string; identifier: string; network: string }[],
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  shellNavigateExternal: (url: string) => calls.navigate(url),
  toastAction: (
    promise: Promise<unknown>,
    messages: { error?: (error: unknown) => unknown }
  ) =>
    promise.catch((error) => {
      calls.toasted.push(messages.error?.(error))
      throw error
    }),
  // The picker is lib/web's; here it finds Tien in the directory and picks him.
  PersonPicker: (props: {
    directoryFn: (query: string) => Promise<unknown>
    onChange: (value: string[]) => void
  }) => (
    <button
      onClick={async () => {
        await props.directoryFn('tien')
        props.onChange([STRANGER])
      }}
    >
      Pick Tien
    </button>
  ),
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    newChatDialogOpen: true,
    closeNewChatDialog: calls.close,
  }),
}))
vi.mock('@/hooks/useChats', () => ({
  useNewChatFriendsQuery: () => ({
    data: { friends: [], name: 'Me', accounts: calls.accounts },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateChatMutation: () => ({
    mutateAsync: calls.create,
    isPending: false,
  }),
}))
vi.mock('@/api/chats', () => ({
  chatsApi: {
    personSearch: () =>
      Promise.resolve({
        results: [
          { id: STRANGER, name: 'Tien Hoang', fingerprint: 'abcdefghi' },
        ],
      }),
    addMember: vi.fn(),
  },
}))

function failure(status: number, message: string) {
  return { response: { status, data: { message } } }
}

async function create() {
  render(
    <I18nProvider i18n={i18n}>
      <NewChat />
    </I18nProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pick Tien' }))
  const button = screen.getByRole('button', { name: /Create chat/ })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

// Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}
Element.prototype.scrollIntoView = () => {}

beforeEach(() => {
  calls.accounts = []
  calls.create = vi.fn()
  calls.close = vi.fn()
  calls.navigate = vi.fn()
  calls.toasted = []
})

describe('NewChat', () => {
  it('says who refused the chat and opens their page in People for a friend request', async () => {
    // THE POINT: a refusal is a dialog naming the person, not an error toast,
    // and its button lands on the page where the request is one tap.
    calls.create.mockRejectedValue(
      failure(403, 'This member does not accept chats from you')
    )
    await create()
    expect(await screen.findByText('Chat refused')).toBeInTheDocument()
    expect(
      screen.getByText('Tien Hoang only accepts chats from friends.')
    ).toBeInTheDocument()
    expect(calls.toasted).toEqual([false])
    fireEvent.click(screen.getByRole('button', { name: /Send friend request/ }))
    expect(calls.close).toHaveBeenCalled()
    expect(calls.navigate).toHaveBeenCalledWith('/people/abcdefghi')
  })

  it('goes back to the form from a refusal', async () => {
    calls.create.mockRejectedValue(
      failure(403, 'This member does not accept chats from you')
    )
    await create()
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(screen.queryByText('Chat refused')).toBeNull()
    expect(screen.getByRole('button', { name: /Create chat/ })).toBeEnabled()
  })

  it('toasts a member it could not reach, which no friend request helps', async () => {
    calls.create.mockRejectedValue(
      failure(400, 'This member could not be reached')
    )
    await create()
    await waitFor(() =>
      expect(calls.toasted).toEqual(['This member could not be reached'])
    )
    expect(screen.queryByText('Chat refused')).toBeNull()
  })
})

describe('refusal', () => {
  it('names the one stranger whose chat policy refused', () => {
    expect(refusal(failure(403, 'refused'), [STRANGER])).toEqual({
      person: STRANGER,
    })
  })

  it('names no one where several strangers were asked, as the server does not say which', () => {
    expect(refusal(failure(403, 'refused'), [STRANGER, 'another'])).toEqual({
      person: null,
    })
  })

  it('is no refusal where their server could not be reached', () => {
    expect(refusal(failure(400, 'unreachable'), [STRANGER])).toBeNull()
  })
})

describe('friendRequest', () => {
  it("opens the person's page in People", () => {
    expect(friendRequest('abcdefghi')).toBe('/people/abcdefghi')
    expect(friendRequest('a/b')).toBe('/people/a%2Fb')
  })
})

describe('NewChat on another network', () => {
  it("asks for a name only for a group, as one person's chat is named after them", async () => {
    // THE POINT: the server names a one-to-one conversation itself and drops
    // a typed name, so no name is asked for.
    calls.accounts = [
      { id: 'a1', identifier: '@me:example.org', network: 'matrix' },
    ]
    render(
      <I18nProvider i18n={i18n}>
        <NewChat />
      </I18nProvider>
    )
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    fireEvent.click(
      await screen.findByRole('option', { name: /@me:example\.org/ })
    )
    const people = await screen.findByRole('textbox', { name: 'Addresses' })
    expect(screen.queryByLabelText('Chat name')).toBeNull()
    fireEvent.change(people, { target: { value: '@ann:example.org' } })
    expect(screen.queryByLabelText('Chat name')).toBeNull()
    expect(screen.getByRole('button', { name: /Create chat/ })).toBeEnabled()
    fireEvent.change(people, {
      target: { value: '@ann:example.org, @bob:example.org' },
    })
    expect(screen.getByLabelText('Chat name')).toBeInTheDocument()
  })
})
