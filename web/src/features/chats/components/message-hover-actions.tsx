// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useRef } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  shellClipboardWrite,
  toast,
} from '@mochi/web'
import { CheckSquare, Copy, Forward, MoreHorizontal, Reply, Trash2, Pencil } from 'lucide-react'
import type { ChatMessage } from '@/api/chats'

interface MessageHoverActionsProps {
  message: ChatMessage
  onReply: (message: ChatMessage) => void
  onSelect?: () => void
  onForward?: () => void
  onDelete?: () => void
  onEdit?: () => void
  canDelete?: boolean
  canEdit?: boolean
  className?: string
}

export function MessageHoverActions({
  message,
  onReply,
  onSelect,
  onForward,
  onDelete,
  onEdit,
  canDelete = false,
  canEdit = false,
  className,
}: MessageHoverActionsProps) {
  const { t } = useLingui()
  const replyingRef = useRef(false)
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
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>{t`Message actions`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side='top'
          align='end'
          sideOffset={4}
          onCloseAutoFocus={(e) => {
            if (replyingRef.current) {
              e.preventDefault()
              replyingRef.current = false
            }
          }}
        >
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
          {onSelect ? (
            <DropdownMenuItem onSelect={onSelect}>
              <CheckSquare className='me-2 size-3.5' />
              {t`Select`}
            </DropdownMenuItem>
          ) : null}
          {canEdit && onEdit ? (
            <DropdownMenuItem
              onSelect={() => {
                onEdit()
              }}
            >
              <Pencil className='me-2 size-3.5' />
              {t`Edit`}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              replyingRef.current = true
              onReply(message)
            }}
          >
            <Reply className='me-2 size-3.5' />
            {t`Reply`}
          </DropdownMenuItem>
          {onForward ? (
            <DropdownMenuItem onSelect={onForward}>
              <Forward className='me-2 size-3.5' />
              {t`Forward`}
            </DropdownMenuItem>
          ) : null}
          {canDelete && onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete}>
                <Trash2 className='me-2 size-3.5' />
                {t`Delete`}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
