import { Button } from '@mochi/common'
import { MessagesSquare, Plus } from 'lucide-react'

interface ChatEmptyStateProps {
  onNewChat: () => void
  hasExistingChats: boolean
}

export function ChatEmptyState({ onNewChat, hasExistingChats }: ChatEmptyStateProps) {
  return (
    <div className='flex h-full w-full flex-1 flex-col items-center justify-center'>
      <div className='flex flex-col items-center space-y-6'>
        <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
          <MessagesSquare className='size-8' />
        </div>
        <p className='text-muted-foreground text-center text-sm'>
          {hasExistingChats
            ? 'Click on a chat to resume, or start a new chat.'
            : 'You have no chats.'}
        </p>
        <Button onClick={onNewChat}>
          <Plus className='mr-2 size-4' />
          New chat
        </Button>
      </div>
    </div>
  )
}
