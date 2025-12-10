import { Fragment } from 'react'
import {
  Loader2,
  MessagesSquare,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Search as SearchIcon,
} from 'lucide-react'
import type { Chat } from '@/api/chats'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ChatSidebarProps {
  chats: Chat[]
  isLoading: boolean
  error: string | null
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedChat: Chat | null
  onSelectChat: (chat: Chat) => void
  onNewChat: () => void
  onRetry: () => void
}

export function ChatSidebar({
  chats,
  isLoading,
  error,
  searchQuery,
  setSearchQuery,
  selectedChat,
  onSelectChat,
  onNewChat,
  onRetry,
}: ChatSidebarProps) {
  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  )

  return (
    <div className='bg-background flex h-full w-full flex-col gap-2 rounded-lg border shadow-sm sm:w-56 lg:w-72 2xl:w-80'>
      <div className='sticky top-0 z-10 px-4 pt-4 pb-3 sm:static sm:z-auto'>
        <div className='flex items-center justify-between py-2'>
          <div className='flex gap-2'>
            <h1 className='text-2xl font-bold'>Chats</h1>
          </div>

          <Button
            size='icon'
            variant='ghost'
            onClick={onNewChat}
            className='h-8 w-8 rounded-lg'
          >
            <Plus size={20} className='stroke-muted-foreground' />
          </Button>
        </div>

        <label
          className={cn(
            'focus-within:ring-ring border-border flex h-10 w-full items-center space-x-0 rounded-md border ps-2 focus-within:ring-1 focus-within:outline-hidden'
          )}
        >
          <SearchIcon size={15} className='stroke-slate-500 me-2' />
          <span className='sr-only'>Search</span>
          <input
            type='text'
            className='w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden'
            placeholder='Search chat...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
      </div>
      <div className='border-b' />

      <ScrollArea className='h-full overflow-scroll px-2 py-2'>
        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='h-6 w-6 animate-spin' />
            <span className='text-muted-foreground ml-2 text-sm'>
              Loading chats...
            </span>
          </div>
        ) : error ? (
          <div className='flex flex-col items-center justify-center py-8 text-center'>
            <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
            <p className='text-muted-foreground text-sm'>{error}</p>
            <Button
              variant='outline'
              size='sm'
              className='mt-2'
              onClick={onRetry}
            >
              <RotateCcw className='mr-1.5 h-4 w-4' />
              Retry
            </Button>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-8 text-center'>
            <MessagesSquare className='text-muted-foreground mb-2 h-8 w-8' />
            <p className='text-muted-foreground text-sm'>
              {searchQuery
                ? 'No chats found matching your search.'
                : 'No chats available.'}
            </p>
            {!searchQuery && (
              <Button
                variant='outline'
                size='sm'
                className='mt-2'
                onClick={onNewChat}
              >
                <MessageSquarePlus className='mr-1.5 h-4 w-4' />
                Start a conversation
              </Button>
            )}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <Fragment key={chat.id}>
              <button
                type='button'
                className={cn(
                  'group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm',
                  selectedChat?.id === chat.id && 'sm:bg-muted'
                )}
                onClick={() => onSelectChat(chat)}
              >
                <div className='flex gap-2'>
                  <Avatar>
                    <AvatarFallback>
                      {chat.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0 flex-1'>
                    <span className='col-start-2 row-span-2 truncate font-medium'>
                      {chat.name}
                    </span>
                    <span className='text-muted-foreground group-hover:text-accent-foreground/90 col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis'>
                      {chat.key || 'No recent messages'}
                    </span>
                  </div>
                </div>
              </button>
            </Fragment>
          ))
        )}
      </ScrollArea>
    </div>
  )
}
