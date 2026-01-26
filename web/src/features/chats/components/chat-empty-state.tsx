import { Button } from '@mochi/common'
import { MessagesSquare, Plus } from 'lucide-react'

interface ChatEmptyStateProps {
  onNewChat: () => void
  hasExistingChats: boolean
}

export function ChatEmptyState({ onNewChat, hasExistingChats }: ChatEmptyStateProps) {
  if (hasExistingChats) {
    return (
      <div className='flex h-full w-full flex-1 flex-col items-center justify-center p-8'>
        <div className='bg-primary/5 mb-6 flex h-20 w-20 items-center justify-center rounded-full'>
          <MessagesSquare className='text-primary h-10 w-10' />
        </div>
        <h2 className='text-xl font-semibold tracking-tight'>Select a chat</h2>
        <p className='text-muted-foreground mt-2 text-center text-sm'>
          Choose a conversation from the sidebar or start a new one.
        </p>
        <div className='mt-8'>
          <Button onClick={onNewChat} variant="outline">
            <Plus className='mr-2 size-4' />
            New chat
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-1 flex-col items-center justify-center p-8'>
      <div className='bg-primary/10 mb-6 flex h-24 w-24 items-center justify-center rounded-full'>
        <MessagesSquare className='text-primary h-12 w-12' />
      </div>
      <h2 className='text-2xl font-semibold tracking-tight'>Start a conversation</h2>
      <p className='text-muted-foreground mt-2 max-w-sm text-center text-balance'>
        You haven't started any chats yet. Connect with a friend to get things rolling.
      </p>
      <div className='mt-8'>
        <Button size='lg' onClick={onNewChat}>
          <Plus className='mr-2 size-5' />
          Get Started
        </Button>
      </div>
    </div>
  )
}
