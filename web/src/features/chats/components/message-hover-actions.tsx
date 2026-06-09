import { useLingui } from '@lingui/react/macro'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  shellClipboardWrite,
  toast,
} from '@mochi/web'
import { Copy, MoreHorizontal, Reply } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'

interface MessageHoverActionsProps {
  message: ChatMessage
  onReply: (message: ChatMessage) => void
  className?: string
}

export function MessageHoverActions({
  message,
  onReply,
  className,
}: MessageHoverActionsProps) {
  const { t } = useLingui()
  const copyValue = message.body?.trim() ?? ''
  const canCopy = copyValue.length > 0

  const handleCopy = async () => {
    if (!canCopy) return
    const ok = await shellClipboardWrite(copyValue)
    if (ok) {
      toast.success(t`Message copied`)
    } else {
      toast.error(t`Failed to copy message`)
    }
  }

  return (
    <div
      className={cn(
        'opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100',
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-6'
            aria-label={t`Message actions`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className='size-3.5' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='top' align='end' sideOffset={4}>
          {canCopy ? (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                void handleCopy()
              }}
            >
              <Copy className='me-2 size-3.5' />
              {t`Copy`}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onReply(message)
            }}
          >
            <Reply className='me-2 size-3.5' />
            {t`Reply`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
