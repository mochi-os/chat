// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type { ChatMessage } from '@/api/types/chats'

export function applyMessageEditLWW(
  message: ChatMessage,
  next: { body: string; edited: number }
): ChatMessage {
  if ((message.edited ?? 0) >= next.edited) {
    return message
  }
  return {
    ...message,
    body: next.body,
    edited: next.edited,
  }
}
