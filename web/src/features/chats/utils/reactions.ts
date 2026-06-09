import type { ReactionCounts, ReactionId } from '../constants/reactions'

export const applyReaction = (
  counts: ReactionCounts,
  currentReaction: ReactionId | null | undefined,
  reaction: ReactionId | ''
) => {
  const updated: ReactionCounts = { ...counts }
  let nextReaction: ReactionId | null = currentReaction ?? null

  if (reaction === '' || currentReaction === reaction) {
    if (currentReaction) {
      const next = (updated[currentReaction] ?? 0) - 1
      if (next > 0) {
        updated[currentReaction] = next
      } else {
        delete updated[currentReaction]
      }
    }
    nextReaction = null
  } else {
    if (currentReaction) {
      const prev = (updated[currentReaction] ?? 0) - 1
      if (prev > 0) {
        updated[currentReaction] = prev
      } else {
        delete updated[currentReaction]
      }
    }
    updated[reaction] = (updated[reaction] ?? 0) + 1
    nextReaction = reaction
  }

  return { reaction_counts: updated, my_reaction: nextReaction }
}

export function patchMessageReaction<
  T extends {
    reaction_counts?: ReactionCounts
    my_reaction?: ReactionId | null
  },
>(message: T, reaction: ReactionId | ''): T {
  const counts = message.reaction_counts ?? {}
  const userReaction = message.my_reaction ?? null
  return {
    ...message,
    ...applyReaction(counts, userReaction, reaction),
  }
}
