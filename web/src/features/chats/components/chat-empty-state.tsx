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
        description="You haven't started any chats yet. Connect with a friend to get things rolling."
      >
        <Button size='lg' onClick={onNewChat}>
          <Plus className='size-5' />
          <Trans>Get Started</Trans>
        </Button>
      </EmptyState>
    </div>
  )
}
