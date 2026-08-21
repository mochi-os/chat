// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Apply a restored draft only while the composer is still empty - the async
 * restore may resolve after the user has typed.
 */
export function resolveComposerDraftRestore(options: {
  composerText: string
  draft: string | null
}): string | null {
  if (options.composerText !== '') return null
  return options.draft ?? ''
}

/** Persist only after draft hydration finished for the active chat. */
export function canPersistComposerDraft(options: {
  chatId: string
  hydratedChatId: string | null
}): boolean {
  return options.hydratedChatId === options.chatId
}
