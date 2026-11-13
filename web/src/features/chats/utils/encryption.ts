// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { Verification } from '@/api/encryption'
import type { ChatMessage } from '@/api/types/chats'

// A message encrypted before the account was added to Mochi, which no
// device of Mochi's can ever read.
export function isEarlierHistory(message: ChatMessage): boolean {
  return (
    message.encrypted === 2 &&
    message.deleted !== true &&
    !message.body &&
    !message.attachments?.length
  )
}

// The messages to show, oldest first: each run of history from before the
// account was added to Mochi keeps only its first message, which stands for
// the run.
export function collapseEarlierHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message, index) =>
      !isEarlierHistory(message) ||
      index === 0 ||
      !isEarlierHistory(messages[index - 1])
  )
}

// A fingerprint in groups of eight, as other clients show them.
export function fingerprintGroups(fingerprint: string): string {
  return (fingerprint.match(/.{1,8}/g) ?? []).join(' ')
}

// The verification to show: the latest one still under way that the user
// has not closed.
export function verificationShown(
  verifications: Verification[],
  dismissed: Set<string>
): Verification | undefined {
  return [...verifications]
    .reverse()
    .find(
      (v) =>
        !dismissed.has(v.flow) && v.phase !== 'done' && v.phase !== 'cancelled'
    )
}
