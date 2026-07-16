// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Drop an in-progress edit only when the message list is stable and the target
 * is confirmed missing or soft-deleted. Empty/unfetched lists are treated as
 * transient (chat switch, cache warm-up, reconnect) and must not abort editing.
 */
export function shouldDiscardMessageEdit(options: {
  isFetched: boolean
  messages: readonly { id: string; deleted?: boolean }[]
  editingMessageId: string
}): boolean {
  if (!options.isFetched || options.messages.length === 0) {
    return false
  }

  const editing = options.messages.find(
    (message) => message.id === options.editingMessageId
  )
  return !editing || editing.deleted === true
}
