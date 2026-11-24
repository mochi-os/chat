// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { GetNewChatResponse } from '@/api/types/chats'
import {
  useSidebarContext,
  type NewChatProposal,
} from '@/context/sidebar-context'
import { useNewChatFriendsQuery } from '@/hooks/useChats'

export interface ChatLink {
  with?: string
  name?: string
  account?: string
  address?: string
}

// What a link's proposal comes to: the one-to-one chat there already is with a
// friend, to open; that friend, to pick; or an address on one of the user's own
// accounts, to fill in. A link can only propose, so it never names a stranger
// or an account that is not the user's, and starts nothing itself.
export type Proposed =
  | { chat: string }
  | { friend: string }
  | { account: string; address: string; name: string }

export function proposed(
  proposal: NewChatProposal,
  data: GetNewChatResponse
): Proposed | null {
  if (proposal.account && proposal.address) {
    if (!(data.accounts ?? []).some((own) => own.id === proposal.account))
      return null
    return {
      account: proposal.account,
      address: proposal.address,
      name: proposal.name ?? '',
    }
  }
  const friend = data.friends.find((f) => f.id === proposal.friend)
  if (!friend) return null
  return friend.chat ? { chat: friend.chat } : { friend: friend.id }
}

// A link to chat with someone: ?with=<friend>&name=, or ?account=<id>&
// address=<address>&name= for an address on another network, as People hands
// one over. Anyone can put such a link in a post, so it only proposes: it
// opens the one-to-one chat there already is with a friend, or else the new
// chat dialog filled in, and nothing is made until the user asks for it.
export function useChatLink(link: ChatLink, viewing: boolean) {
  const navigate = useNavigate()
  const { openNewChatWith } = useSidebarContext()
  const proposal = useMemo<NewChatProposal | null>(() => {
    if (link.with) return { friend: link.with }
    if (link.account && link.address)
      return { account: link.account, address: link.address, name: link.name }
    return null
  }, [link.with, link.account, link.address, link.name])
  const wanted = !viewing && proposal !== null
  const { data, isPending } = useNewChatFriendsQuery({ enabled: wanted })
  const handled = useRef(false)

  useEffect(() => {
    if (!wanted || !proposal || handled.current || isPending) return
    handled.current = true
    const fill = data ? proposed(proposal, data) : null
    if (fill && 'chat' in fill) {
      void navigate({
        to: '/$chatId',
        params: { chatId: fill.chat },
        replace: true,
      })
      return
    }
    openNewChatWith(proposal)
  }, [wanted, proposal, data, isPending, navigate, openNewChatWith])
}
