// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useLingui } from '@lingui/react/macro'

export type ReactionId =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionCounts = Partial<Record<ReactionId, number>>

export const reactionOptions: { id: ReactionId; emoji: string }[] = [
  { id: 'like', emoji: '👍' },
  { id: 'dislike', emoji: '👎' },
  { id: 'laugh', emoji: '😂' },
  { id: 'amazed', emoji: '😮' },
  { id: 'love', emoji: '😍' },
  { id: 'sad', emoji: '😢' },
  { id: 'angry', emoji: '😡' },
  { id: 'agree', emoji: '🤝' },
  { id: 'disagree', emoji: '🙅' },
]

export function useReactionOptions(): {
  id: ReactionId
  label: string
  emoji: string
}[] {
  const { t } = useLingui()
  return [
    { id: 'like', label: t`Like`, emoji: '👍' },
    { id: 'dislike', label: t`Dislike`, emoji: '👎' },
    { id: 'laugh', label: t`Laugh`, emoji: '😂' },
    { id: 'amazed', label: t`Amazed`, emoji: '😮' },
    { id: 'love', label: t`Love`, emoji: '😍' },
    { id: 'sad', label: t`Sad`, emoji: '😢' },
    { id: 'angry', label: t`Angry`, emoji: '😡' },
    { id: 'agree', label: t`Agree`, emoji: '🤝' },
    { id: 'disagree', label: t`Disagree`, emoji: '🙅' },
  ]
}

const reactionIdSet = new Set<ReactionId>(
  reactionOptions.map((option) => option.id)
)

export const isReactionId = (value: unknown): value is ReactionId => {
  return typeof value === 'string' && reactionIdSet.has(value as ReactionId)
}
