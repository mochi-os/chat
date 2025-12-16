import { MessageSquarePlus, MessagesSquare } from 'lucide-react'
import { Button } from '@mochi/common'
import { cn } from '@mochi/common'

interface ChatEmptyStateProps {
  onNewChat: () => void
}

export function ChatEmptyState({ onNewChat }: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border bg-card absolute inset-0 start-full z-50 hidden h-full w-full flex-1 flex-col justify-center rounded-lg border shadow-sm sm:static sm:z-auto sm:flex'
      )}
    >
      <div className='flex flex-col items-center space-y-6'>
        <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
          <MessagesSquare className='size-8' />
        </div>
        <div className='space-y-2 text-center'>
          <h1 className='text-xl font-semibold'>Your messages</h1>
          <p className='text-muted-foreground text-sm'>
            Send a message to start a chat.
          </p>
        </div>
        <Button onClick={onNewChat}>
          <MessageSquarePlus className='mr-2 h-4 w-4' />
          Send message
        </Button>
      </div>
    </div>
  )
}
