// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { naturalCompare } from '@mochi/web'
import type { ChatMessage, ChatReceipt } from '@/api/types/chats'

export type ReceiptState = 'sent' | 'delivered' | 'read'

// How far the other members have the user's own message: read when every one
// has read up to it, delivered when every one holds it, else sent.
export function receiptState(
  message: Pick<ChatMessage, 'created'>,
  receipts: ChatReceipt[],
  me: string
): ReceiptState {
  const others = receipts.filter((receipt) => receipt.member !== me)
  if (others.length === 0) return 'sent'
  if (others.every((receipt) => receipt.displayed >= message.created))
    return 'read'
  if (others.every((receipt) => receipt.delivered >= message.created))
    return 'delivered'
  return 'sent'
}

// In a group, who has read the user's newest message: its id and their
// names, or null while nobody has.
export function seenBy(
  messages: ChatMessage[],
  receipts: ChatReceipt[],
  me: string
): { id: string; names: string[] } | null {
  const newest = [...messages]
    .reverse()
    .find((m) => m.member === me && !m.deleted)
  if (!newest) return null
  const names = receipts
    .filter(
      (receipt) => receipt.member !== me && receipt.displayed >= newest.created
    )
    .map(
      (receipt) =>
        receipt.name ||
        messages.find((m) => m.member === receipt.member)?.name ||
        ''
    )
    .filter(Boolean)
    .sort(naturalCompare)
  return names.length > 0 ? { id: newest.id, names } : null
}
