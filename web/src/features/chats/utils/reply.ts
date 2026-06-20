// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type { ChatMessage } from '@/api/chats'

export interface ReplyTarget {
  id: string
  name: string
  excerpt: string
  isAttachment?: boolean
}

export function messageToReplyTarget(message: ChatMessage): ReplyTarget {
  const body = message.body ?? ''
  return {
    id: message.id,
    name: message.name,
    excerpt: body,
    isAttachment: !body.trim() && Boolean(message.attachments?.length),
  }
}
