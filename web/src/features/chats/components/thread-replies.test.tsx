// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/chats'
import { ThreadReplies } from './thread-replies'

const answers = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      ({
        id: `r${i + 1}`,
        chat: 'c1',
        member: 'ann',
        name: 'Ann',
        body: `Answer ${i + 1}`,
        created: 1700000000 + i,
        thread: 'm1',
      }) as ChatMessage
  )

const show = (count: number, onOpen = vi.fn()) => {
  render(
    <I18nProvider i18n={i18n}>
      <ThreadReplies answers={answers(count)} isSent={false} onOpen={onOpen} />
    </I18nProvider>
  )
  return onOpen
}

describe('ThreadReplies', () => {
  it('shows every reply, with nothing to load', () => {
    const onOpen = show(7)
    expect(screen.getByText('Answer 1')).toBeInTheDocument()
    expect(screen.getByText('Answer 7')).toBeInTheDocument()
    expect(screen.queryByText('Show earlier replies')).toBeNull()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('folds a long reply, whose whole text is in the thread', () => {
    const onOpen = show(1)
    expect(screen.getByText('Answer 1')).toHaveClass('line-clamp-4')
    fireEvent.click(screen.getByText('Answer 1'))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
