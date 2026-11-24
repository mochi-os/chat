// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// The new chat dialog opened for something that wants the chat it ends on:
// Share, which fills that chat's message box before it opens.
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarProvider, useSidebarContext } from './sidebar-context'

vi.mock('@/hooks/useChatStorage', () => ({
  getDraftChatIds: () => Promise.resolve(new Set()),
  getMarkedUnreadChats: () => Promise.resolve(new Set()),
  getPinnedChats: () => Promise.resolve(new Set()),
  setDraftChatIds: vi.fn(),
  setMarkedUnreadChats: vi.fn(),
  setPinnedChats: vi.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <SidebarProvider>{children}</SidebarProvider>
)

describe('the new chat dialog for a chosen chat', () => {
  it('hands its opener the chat it ends on, once', async () => {
    const { result } = renderHook(() => useSidebarContext(), { wrapper })
    const wanted = vi.fn(() => Promise.resolve())
    act(() => result.current.openNewChatFor(wanted))
    expect(result.current.newChatDialogOpen).toBe(true)
    await act(() => result.current.newChatChosen('c9'))
    await act(() => result.current.newChatChosen('c10'))
    expect(wanted.mock.calls).toEqual([['c9']])
  })

  it('hands nothing to an earlier opener once opened plainly', async () => {
    const { result } = renderHook(() => useSidebarContext(), { wrapper })
    const wanted = vi.fn(() => Promise.resolve())
    act(() => result.current.openNewChatFor(wanted))
    act(() => result.current.closeNewChatDialog())
    act(() => result.current.openNewChatDialog())
    await act(() => result.current.newChatChosen('c9'))
    expect(wanted).not.toHaveBeenCalled()
  })
})

describe('the new chat dialog opened by a link', () => {
  it('holds what the link proposed until opened plainly', () => {
    const { result } = renderHook(() => useSidebarContext(), { wrapper })
    act(() => result.current.openNewChatWith({ friend: 'f1' }))
    expect(result.current.newChatDialogOpen).toBe(true)
    expect(result.current.newChatProposal).toEqual({ friend: 'f1' })
    act(() => result.current.closeNewChatDialog())
    act(() => result.current.openNewChatDialog())
    expect(result.current.newChatProposal).toBeNull()
  })
})
