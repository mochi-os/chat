import type { Chat } from '@/api/chats'
import {
  ArrowLeft,
  Loader2,
  MoreVertical,
  Phone,
  Video,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@mochi/common'
import { Button } from '@mochi/common'
import type { WebsocketConnectionStatus } from '@/lib/websocket-manager'
import { cn } from '@mochi/common'

interface ChatHeaderProps {
  selectedChat: Chat
  onBack: () => void
  websocketStatus: WebsocketConnectionStatus
  websocketStatusMeta: {
    label: string
    color: string
    showSpinner?: boolean
  }
  onReconnect: () => void
}

export function ChatHeader({
  selectedChat,
  onBack,
  websocketStatus,
  websocketStatusMeta,
  onReconnect,
}: ChatHeaderProps) {
  return (
    <div className='bg-background flex shrink-0 items-center justify-between border-b px-6 py-4'>
      <div className='flex items-center gap-3'>
        <Button
          variant='ghost'
          size='icon'
          className='-ml-2 sm:hidden'
          onClick={onBack}
        >
          <ArrowLeft className='h-5 w-5' />
        </Button>
        <Avatar className='h-10 w-10'>
          <AvatarFallback>
            {selectedChat.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className='font-semibold leading-none'>{selectedChat.name}</h2>
          <div
            className='flex cursor-pointer items-center gap-1.5 pt-1'
            onClick={
              websocketStatus === 'error' ? onReconnect : undefined
            }
          >
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                websocketStatusMeta.color
              )}
            />
            <span className='text-muted-foreground text-xs'>
              {websocketStatusMeta.label}
            </span>
            {websocketStatusMeta.showSpinner && (
              <Loader2 className='text-muted-foreground h-3 w-3 animate-spin' />
            )}
          </div>
        </div>
      </div>
      <div className='flex items-center gap-1'>
        <Button variant='ghost' size='icon'>
          <Phone className='h-5 w-5' />
        </Button>
        <Button variant='ghost' size='icon'>
          <Video className='h-5 w-5' />
        </Button>
        <Button variant='ghost' size='icon'>
          <MoreVertical className='h-5 w-5' />
        </Button>
      </div>
    </div>
  )
}
