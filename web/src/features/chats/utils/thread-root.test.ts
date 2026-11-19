// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/chats'
import { liveThreadRoot } from './thread-root'

const opened = { id: 'r1', body: 'Before', created: 1 } as ChatMessage

describe('liveThreadRoot', () => {
  it('shows the root as the timeline has it now', () => {
    const edited = { ...opened, body: 'After', edited: 2 } as ChatMessage
    expect(liveThreadRoot(opened, [edited])).toBe(edited)
  })

  it('shows a root deleted in the timeline as deleted', () => {
    const gone = { ...opened, deleted: true } as ChatMessage
    expect(liveThreadRoot(opened, [gone])?.deleted).toBe(true)
  })

  it('keeps the copy it opened with once the root is not loaded', () => {
    expect(liveThreadRoot(opened, [])).toBe(opened)
  })

  it('is no root while no thread is open', () => {
    expect(liveThreadRoot(undefined, [opened])).toBeNull()
  })
})
