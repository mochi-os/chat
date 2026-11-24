// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewChat, friendRequest, refusal, unset } from './new-chat'

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
  // The networks the server offers an account on.
  offered: [] as string[],
  // The router's navigation, and what the dialog's opener was handed.
  route: vi.fn(),
  chosen: vi.fn((_chatId: string) => Promise.resolve()),
  // The user's friends, and what a link opened the dialog with.
  friends: [] as { id: string; name: string; chat?: string }[],
  proposal: null as null | {
    friend?: string
    account?: string
    address?: string
    name?: string
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => calls.route,
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
  // The picker is lib/web's; here it finds Tien in the directory and picks
  // him, and says who is picked.
  PersonPicker: (props: {
    value: string[]
    directoryFn: (query: string) => Promise<unknown>
    onChange: (value: string[]) => void
  }) => (
    <>
      <button
        onClick={async () => {
          await props.directoryFn('tien')
          props.onChange([STRANGER])
        }}
      >
        Pick Tien
      </button>
      <output aria-label='Picked'>{props.value.join(',')}</output>
    </>
  ),
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    newChatDialogOpen: true,
    closeNewChatDialog: calls.close,
    newChatChosen: (chatId: string) => calls.chosen(chatId),
    newChatProposal: calls.proposal,
  }),
}))
vi.mock('@/hooks/useChats', () => ({
  useNewChatFriendsQuery: () => ({
    data: {
      friends: calls.friends,
      name: 'Me',
      accounts: calls.accounts,
      offered: calls.offered,
    },
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
  calls.offered = []
  calls.create = vi.fn()
  calls.close = vi.fn()
  calls.navigate = vi.fn()
  calls.toasted = []
  calls.route = vi.fn()
  calls.chosen = vi.fn(() => Promise.resolve())
  calls.friends = []
  calls.proposal = null
})

describe('NewChat', () => {
  it('opens the chat it made once its opener has had it, as Share fills its message box', async () => {
    let release = () => {}
    calls.chosen = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve))
    )
    calls.create.mockResolvedValue({ id: 'c9' })
    await create()
    await waitFor(() => expect(calls.chosen).toHaveBeenCalledWith('c9'))
    expect(calls.route).not.toHaveBeenCalled()
    release()
    await waitFor(() =>
      expect(calls.route).toHaveBeenCalledWith({
        to: '/$chatId',
        params: { chatId: 'c9' },
      })
    )
  })

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

describe('NewChat opened by a link', () => {
  // THE POINT: anyone can put a link in a post, so what it proposes is only
  // filled in, and nothing is made until the user presses Create chat.
  const FRIEND = 'friend-identity'

  function opened() {
    render(
      <I18nProvider i18n={i18n}>
        <NewChat />
      </I18nProvider>
    )
  }

  it('picks the friend it proposes and makes nothing until Create chat', async () => {
    calls.friends = [{ id: FRIEND, name: 'Ann Lee' }]
    calls.proposal = { friend: FRIEND, name: 'Chosen by the link' }
    calls.create.mockResolvedValue({ id: 'c1' })
    opened()
    await waitFor(() =>
      expect(screen.getByLabelText('Chat name')).toHaveValue('Ann Lee')
    )
    expect(screen.getByLabelText('Picked')).toHaveTextContent(FRIEND)
    const button = screen.getByRole('button', { name: /Create chat/ })
    expect(button).toBeEnabled()
    expect(calls.create).not.toHaveBeenCalled()

    fireEvent.click(button)
    await waitFor(() =>
      expect(calls.create).toHaveBeenCalledWith({
        members: FRIEND,
        name: 'Ann Lee',
      })
    )
  })

  it('picks no one where the person it names is not a friend', async () => {
    calls.friends = [{ id: FRIEND, name: 'Ann Lee' }]
    calls.proposal = { friend: STRANGER, name: 'Tien Hoang' }
    opened()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create chat/ })).toBeDisabled()
    )
    expect(screen.getByLabelText('Picked')).toBeEmptyDOMElement()
    expect(screen.getByLabelText('Chat name')).toHaveValue('')
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('opens the chat there already is with the friend it proposes', async () => {
    calls.friends = [{ id: FRIEND, name: 'Ann Lee', chat: 'c7' }]
    calls.proposal = { friend: FRIEND }
    opened()
    await waitFor(() =>
      expect(calls.route).toHaveBeenCalledWith({
        to: '/$chatId',
        params: { chatId: 'c7' },
      })
    )
    expect(calls.close).toHaveBeenCalled()
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('fills in an address on one of the user’s accounts and makes nothing until Create chat', async () => {
    calls.accounts = [
      { id: 'a1', identifier: '@me:example.org', network: 'matrix' },
    ]
    calls.proposal = {
      account: 'a1',
      address: '@ann:example.org',
      name: 'Ann Lee',
    }
    calls.create.mockResolvedValue({ id: 'c2' })
    opened()
    const people = await screen.findByRole('textbox', { name: 'Addresses' })
    expect(people).toHaveValue('@ann:example.org')
    expect(calls.create).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Create chat/ }))
    await waitFor(() =>
      expect(calls.create).toHaveBeenCalledWith({
        account: 'a1',
        members: '@ann:example.org',
        name: 'Ann Lee',
      })
    )
  })

  it('fills in nothing for an account that is not the user’s', async () => {
    calls.accounts = [
      { id: 'a1', identifier: '@me:example.org', network: 'matrix' },
    ]
    calls.proposal = { account: 'elsewhere', address: '@ann:example.org' }
    opened()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create chat/ })).toBeDisabled()
    )
    expect(screen.queryByRole('textbox', { name: 'Addresses' })).toBeNull()
    expect(calls.create).not.toHaveBeenCalled()
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

describe('NewChat where the user has no account on a network the server offers', () => {
  it('offers the network, and a way to set an account up in place of the people', async () => {
    calls.accounts = [
      { id: 'a1', identifier: '@me:example.org', network: 'matrix' },
    ]
    calls.offered = ['fediverse', 'matrix', 'xmpp']
    render(
      <I18nProvider i18n={i18n}>
        <NewChat />
      </I18nProvider>
    )
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    // Matrix has an account, so it is offered once, as that account.
    expect(
      await screen.findByRole('option', { name: /@me:example\.org/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Matrix' })).toBeNull()
    expect(
      screen.getByRole('option', { name: 'ActivityPub' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'XMPP' }))
    expect(
      await screen.findByRole('button', { name: 'Set up' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pick Tien' })).toBeNull()
    expect(screen.queryByLabelText('Chat name')).toBeNull()
    expect(screen.getByRole('button', { name: /Create chat/ })).toBeDisabled()
  })

  it('shows the network choice where the user has no account anywhere yet', () => {
    calls.offered = ['xmpp']
    render(
      <I18nProvider i18n={i18n}>
        <NewChat />
      </I18nProvider>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows no network choice where the server offers none and there is no account', () => {
    render(
      <I18nProvider i18n={i18n}>
        <NewChat />
      </I18nProvider>
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('unset', () => {
  it('counts a linked Mastodon account as being on the fediverse', () => {
    expect(
      unset(
        ['fediverse', 'xmpp'],
        [{ id: 'm1', identifier: '@me@mastodon.social', network: 'mastodon' }]
      )
    ).toEqual(['xmpp'])
  })
})
