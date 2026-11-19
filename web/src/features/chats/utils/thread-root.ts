// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ChatMessage } from '@/api/chats'

/**
 * An open thread's root as the timeline has it now, so an edit, reaction or
 * deletion in the timeline shows in the open thread too. The copy taken when
 * the thread opened stands in once the root has scrolled out of the loaded
 * pages, or before they load.
 */
export function liveThreadRoot(
  opened: ChatMessage | undefined,
  timeline: ChatMessage[]
): ChatMessage | null {
  if (!opened) return null
  return timeline.find((message) => message.id === opened.id) ?? opened
}
