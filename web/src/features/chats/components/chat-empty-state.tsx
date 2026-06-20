// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Button, EmptyState } from '@mochi/web'
import { Trans } from '@lingui/react/macro'
import { MessageCircle, Plus } from 'lucide-react'
import { t } from '@lingui/core/macro'

interface ChatEmptyStateProps {
  onNewChat: () => void
  hasExistingChats: boolean
}

export function ChatEmptyState({ onNewChat, hasExistingChats }: ChatEmptyStateProps) {
  if (hasExistingChats) {
    return (
      <div className='flex h-full w-full flex-1 flex-col items-center justify-center'>
        <EmptyState
          icon={MessageCircle}
          title={t`Select a chat`}
          description={t`Choose a conversation from the sidebar or start a new one.`}
        >
          <Button onClick={onNewChat} variant="outline">
            <Plus className='size-4' />
            <Trans>New chat</Trans>
          </Button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-1 flex-col items-center justify-center'>
      <EmptyState
        icon={MessageCircle}
        title={t`Start a conversation`}
        description={t`Message a friend to start your first chat.`}
      >
        <Button size='lg' onClick={onNewChat}>
          <Plus className='size-5' />
          <Trans>New chat</Trans>
        </Button>
      </EmptyState>
    </div>
  )
}
