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
// The sidebar is drawn by lib/web; here only its menu entries are wanted, as
// plain buttons.
vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  AuthenticatedLayout: ({ sidebarData }: { sidebarData: SidebarData }) => (
    <>
      {sidebarData.navGroups.flatMap((group) =>
        group.items.flatMap((item) =>
          ((item as { menu?: NavMenuItem[] }).menu ?? []).map((entry) => (
            <button key={entry.title} onClick={entry.onClick}>
              {entry.title}
            </button>
          ))
        )
      )}
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
