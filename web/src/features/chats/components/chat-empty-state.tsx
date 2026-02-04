import { Button, EmptyState } from '@mochi/common'
import { MessageCircle, Plus } from 'lucide-react'

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
          title="Select a chat"
          description="Choose a conversation from the sidebar or start a new one."
        >
          <Button onClick={onNewChat} variant="outline">
            <Plus className='size-4' />
            New chat
          </Button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-1 flex-col items-center justify-center'>
      <EmptyState
        icon={MessageCircle}
        title="Start a conversation"
        description="You haven't started any chats yet. Connect with a friend to get things rolling."
      >
        <Button size='lg' onClick={onNewChat}>
          <Plus className='size-5' />
          Get Started
        </Button>
      </EmptyState>
    </div>
  )
}
