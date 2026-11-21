// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ChatMessage, MessageWarning } from '@/api/types/chats'

// The newer version wins, and with it the warning it came with, where one is
// given: the text shown is that version's.
export function applyMessageEditLWW(
  message: ChatMessage,
  next: { body: string; edited: number; warning?: MessageWarning }
): ChatMessage {
  if ((message.edited ?? 0) >= next.edited) {
    return message
  }
  return {
    ...message,
    body: next.body,
    edited: next.edited,
    ...(next.warning === undefined ? {} : { warning: next.warning }),
  }
}
