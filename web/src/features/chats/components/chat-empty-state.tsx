import { Button } from '@mochi/common'
import { MessagesSquare, Plus, Users } from 'lucide-react'

interface ChatEmptyStateProps {
  onNewChat: () => void
  hasExistingChats: boolean
  friendsCount: number
  isLoadingFriends: boolean
}

export function ChatEmptyState({
  onNewChat,
  hasExistingChats,
  friendsCount,
  isLoadingFriends,
}: ChatEmptyStateProps) {
  const hasFriends = friendsCount > 0
  const peopleUrl = import.meta.env.VITE_APP_PEOPLE_URL ?? '/people'

  // If user has existing chats, show the simpler resume message
  if (hasExistingChats) {
    return (
      <div className='flex h-full w-full flex-1 flex-col items-center justify-center'>
        <div className='flex flex-col items-center space-y-6'>
          <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
            <MessagesSquare className='size-8' />
          </div>
          <p className='text-muted-foreground text-center text-sm'>
            Click on a chat to resume, or start a new chat.
          </p>
          <Button onClick={onNewChat}>
            <Plus className='mr-2 size-4' />
            Create chat
          </Button>
        </div>
      </div>
    )
  }

  // Welcome page for new users
  return (
    <div className='flex h-full w-full flex-1 flex-col items-center justify-center p-8 text-center'>
      <MessagesSquare className='text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-50' />
      <p className='text-muted-foreground mb-1 text-sm font-medium'>Chat</p>
      <p className='text-muted-foreground mb-4 max-w-sm text-xs'>
        {hasFriends
          ? `You have ${friendsCount} ${friendsCount === 1 ? 'friend' : 'friends'}. Click the button below to start a chat.`
          : 'You have no friends yet. Add some friends first to start chatting.'}
      </p>

      {hasFriends ? (
        <Button onClick={onNewChat}>
          <Plus className='mr-2 size-4' />
          Create chat
        </Button>
      ) : (
        !isLoadingFriends && (
          <Button asChild>
            <a href={peopleUrl}>
              <Users className='mr-2 size-4' />
              Find friends
            </a>
          </Button>
        )
      )}
    </div>
  )
}
