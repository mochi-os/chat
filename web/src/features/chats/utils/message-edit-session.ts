// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Discard an edit only when the fetched list confirms the target missing or
 * deleted; an empty or unfetched list is transient (chat switch, reconnect).
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
