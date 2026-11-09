// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post, warning } = vi.hoisted(() => ({
  post: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  createAppClient: () => ({ get: vi.fn(), post, delete: vi.fn() }),
  toast: { warning },
}))

import { chatsApi } from './chats'

// Making a chat on another network and accepting an invitation to one wait on
// the account's server, which the server bounds and always answers: the
// client sets no limit of its own, so a slow one is not reported as failed.
describe('chatsApi on another network', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { id: 'c1' } })
  })

  it("create waits for the server's answer", async () => {
    await chatsApi.create({
      account: 'a1',
      members: '@bob:matrix.example',
      name: 'Room',
    } as Parameters<typeof chatsApi.create>[0])
    expect(post.mock.calls[0][2]).toEqual({ timeout: 0 })
  })

  it("accept waits for the server's answer", async () => {
    await chatsApi.accept('c1')
    expect(post.mock.calls[0][2]).toEqual({ timeout: 0 })
  })
})

// A message on another network that went without a file says so once it is
// sent, a line each as the server words it.
describe('chatsApi.sendMessage', () => {
  beforeEach(() => {
    post.mockReset()
    warning.mockReset()
  })

  it('warns of each file the message went without', async () => {
    post.mockResolvedValue({ data: { id: 'm1', unsent: ['Without it'] } })
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    await chatsApi.sendMessage('c1', { body: 'Hi', attachments: [file] })
    expect(warning.mock.calls).toEqual([['Without it']])
  })

  it('says nothing where the message went whole', async () => {
    post.mockResolvedValue({ data: { id: 'm1', unsent: [] } })
    await chatsApi.sendMessage('c1', { body: 'Hi' })
    expect(warning).not.toHaveBeenCalled()
  })
})
