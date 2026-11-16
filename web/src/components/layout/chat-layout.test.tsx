// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { NavMenuItem, SidebarData } from '@mochi/web'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatLayout } from './chat-layout'

const markRead = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => null,
  useParams: () => ({}),
}))
// The sidebar is drawn by lib/web; here only its entries that act on a click
// and their menu entries are wanted, as plain buttons, with what the layout
// holds.
vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  AuthenticatedLayout: ({
    sidebarData,
    children,
  }: {
    sidebarData: SidebarData
    children: ReactNode
  }) => (
    <>
      {sidebarData.navGroups.flatMap((group) =>
        group.items.flatMap((item) => {
          const entry = item as {
            title: string
            onClick?: () => void
            menu?: NavMenuItem[]
          }
          return [
            ...(entry.onClick
              ? [
                  <button key={'item ' + entry.title} onClick={entry.onClick}>
                    {entry.title}
                  </button>,
                ]
              : []),
            ...(entry.menu ?? []).map((choice) => (
              <button key={choice.title} onClick={choice.onClick}>
                {choice.title}
              </button>
            )),
          ]
        })
      )}
      {children}
    </>
  ),
}))
vi.mock('@/context/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
  useSidebarContext: () => ({
    setChat: vi.fn(),
    openNewChatDialog: vi.fn(),
    isChatMarkedUnread: () => false,
    markChatAsUnread: vi.fn(),
    clearMarkedUnread: vi.fn(),
    isChatPinned: () => false,
    pinChat: vi.fn(),
    unpinChat: vi.fn(),
    hasChatDraft: () => false,
  }),
}))
vi.mock('@/hooks/useChats', () => ({
  useChatsQuery: () => ({
    data: {
      chats: [{ id: 'c1', name: 'Team', status: 'active', unread: 2 }],
    },
  }),
  useMarkChatReadMutation: () => ({ mutateAsync: markRead }),
}))
vi.mock('@/features/chats/components/new-chat', () => ({ NewChat: () => null }))
vi.mock('@/features/chats/components/verification-watcher', () => ({
  VerificationWatcher: () => null,
}))
vi.mock('./chat-list-filters', () => ({ ChatListFilters: () => null }))
vi.mock('@/features/chats/components/chat-settings-dialog', () => ({
  ChatSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div>Privacy settings</div> : null,
}))

// Mark as read from the chat's menu clears the badge on the click. That is
// the instant flag; without it the hook waits for the server, which is right
// for the read sent as a chat opens and wrong for this menu entry.
describe('ChatLayout Mark as read', () => {
  beforeEach(() => {
    markRead.mockReset().mockResolvedValue(undefined)
  })

  it('asks for the read to show at once', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ChatLayout />
      </I18nProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))
    await waitFor(() =>
      expect(markRead).toHaveBeenCalledWith({ chatId: 'c1', instant: true })
    )
  })
})

// Who may start a chat and what the user shares are for every chat at once, so
// they are reached from the sidebar, open chat or none.
describe('ChatLayout Privacy', () => {
  it('opens the privacy settings from the sidebar', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ChatLayout />
      </I18nProvider>
    )
    expect(screen.queryByText('Privacy settings')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Privacy' }))
    expect(await screen.findByText('Privacy settings')).toBeTruthy()
  })
})
