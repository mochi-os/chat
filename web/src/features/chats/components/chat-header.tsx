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

interface WebsocketStatusMeta {
  label: string
  dotClass?: string
  textClass?: string
  color?: string
  showSpinner?: boolean
}

interface ChatHeaderProps {
  selectedChat: Chat
  onBack: () => void
  websocketStatus: WebsocketConnectionStatus
  websocketStatusMeta: WebsocketStatusMeta
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
    <div className='bg-card mb-1 flex flex-none justify-between p-4 shadow-lg sm:rounded-t-md'>
      {/* Left */}
      <div className='flex gap-3'>
        <Button
          size='icon'
          variant='ghost'
          className='-ms-2 h-full sm:hidden'
          onClick={onBack}
        >
          <ArrowLeft className='rtl:rotate-180' />
        </Button>
        <div className='flex items-center gap-2 lg:gap-4'>
          <Avatar className='size-9 lg:size-11'>
            <AvatarFallback>
              {selectedChat.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className='col-start-2 row-span-2 text-sm font-medium lg:text-base'>
              {selectedChat.name}
            </span>
            <div className='mt-1 flex flex-wrap items-center gap-2 text-xs'>
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  websocketStatusMeta.textClass
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    websocketStatusMeta.dotClass || websocketStatusMeta.color
                  )}
                />
                {websocketStatusMeta.label}
                {websocketStatusMeta.showSpinner && (
                  <Loader2 className='h-3 w-3 animate-spin' />
                )}
              </span>
              {websocketStatus === 'error' && (
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 transition'
                  onClick={onReconnect}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className='-me-1 flex items-center gap-1 lg:gap-2'>
        <Button
          size='icon'
          variant='ghost'
          className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
        >
          <Video size={22} className='stroke-muted-foreground' />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='hidden size-8 rounded-full sm:inline-flex lg:size-10'
        >
          <Phone size={22} className='stroke-muted-foreground' />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6'
        >
          <MoreVertical className='stroke-muted-foreground sm:size-5' />
        </Button>
      </div>
    </div>
  )
}
