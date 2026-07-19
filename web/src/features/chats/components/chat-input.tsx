// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useFormat,
} from '@mochi/web'
import { Loader2, Paperclip, Send, X } from 'lucide-react'
import type { PendingAttachment } from '../utils'
import type { ReplyTarget } from '../utils/reply'
import { ReplyQuoteContent } from './reply-quote-content'

export interface ChatInputHandle {
  focusInput: () => void
}

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
  isSendDisabled: boolean
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onReorderAttachments: (fromIndex: number, toIndex: number) => void
  onAttachmentSelection: (e: ChangeEvent<HTMLInputElement>) => void
  sendMessageErrorMessage: string | null
  replyTo?: ReplyTarget | null
  onClearReply?: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      newMessage,
      setNewMessage,
      onSendMessage,
      isSending,
      isSendDisabled,
      pendingAttachments,
      onRemoveAttachment,
      onReorderAttachments,
      onAttachmentSelection,
      sendMessageErrorMessage,
      replyTo,
      onClearReply,
    },
    ref
  ) {
  const { t } = useLingui()
  const { formatFileSize } = useFormat()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const hasPendingAttachments = pendingAttachments.length > 0
  const canReorder = pendingAttachments.length > 1

  const focusInput = useCallback(() => {
    window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true })
    }, 0)
  }, [])

  useImperativeHandle(ref, () => ({ focusInput }), [focusInput])

  // Auto-resize: grow with content, shrink when cleared
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [newMessage])

  useEffect(() => {
    if (replyTo) {
      focusInput()
    }
  }, [replyTo, focusInput])

  const handleDragStart = (e: DragEvent<HTMLDivElement>, attachmentId: string) => {
    if (!canReorder) return
    e.dataTransfer.setData('text/plain', attachmentId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(attachmentId)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>, attachmentId: string) => {
    if (!canReorder || !draggingId || draggingId === attachmentId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(attachmentId)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggingId
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null)
      setDropTargetId(null)
      return
    }
    const fromIndex = pendingAttachments.findIndex((a) => a.id === sourceId)
    const toIndex = pendingAttachments.findIndex((a) => a.id === targetId)
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorderAttachments(fromIndex, toIndex)
    }
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  return (
    <form
      onSubmit={onSendMessage}
      className='flex w-full flex-none flex-col gap-2'
    >
      <div className='border-input bg-card focus-within:ring-ring flex w-full flex-col rounded-xl border focus-within:ring-1 focus-within:outline-hidden'>
        {replyTo ? (
          <div className='border-border/50 flex items-start gap-2 border-b px-4 py-2.5'>
            <div className='flex min-w-0 flex-1 flex-col gap-1 overflow-hidden'>
              <div className='text-foreground text-sm font-medium'>
                <Trans>Replying to {replyTo.name}</Trans>
              </div>
              {replyTo.excerpt ? (
                <ReplyQuoteContent
                  body={replyTo.excerpt}
                  className='text-foreground/75'
                />
              ) : replyTo.isAttachment ? (
                <div className='text-foreground/75 text-sm'>
                  <Trans>Attachment</Trans>
                </div>
              ) : null}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5'
                  onClick={onClearReply}
                  aria-label={t`Cancel reply`}
                >
                  <X className='size-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t`Cancel reply`}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        {hasPendingAttachments && (
          <AttachmentGroup
            className='border-border/50 border-b px-4 pt-2 pb-2'
            onDragOver={(e) => {
              if (canReorder) e.preventDefault()
            }}
          >
            {pendingAttachments.map((attachment) => {
              const isImage = attachment.kind === 'image'
              const isVideo = attachment.kind === 'video'
              const isDragging = draggingId === attachment.id
              const isDropTarget = dropTargetId === attachment.id

              return (
                <Attachment
                  key={attachment.id}
                  draggable={canReorder}
                  onDragStart={(e: DragEvent<HTMLDivElement>) => handleDragStart(e, attachment.id)}
                  onDragOver={(e: DragEvent<HTMLDivElement>) => handleDragOver(e, attachment.id)}
                  onDrop={(e: DragEvent<HTMLDivElement>) => handleDrop(e, attachment.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    canReorder && 'cursor-grab active:cursor-grabbing',
                    isDragging && 'opacity-40',
                    isDropTarget && 'ring-primary rounded-lg ring-2 ring-inset'
                  )}
                  state={isSending ? 'uploading' : 'idle'}
                >
                  <AttachmentMedia variant={isImage || isVideo ? "image" : "icon"}>
                    {isImage && attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.file.name}
                        draggable={false}
                      />
                    ) : isVideo && attachment.previewUrl ? (
                      <video
                        src={attachment.previewUrl}
                        muted
                        playsInline
                        draggable={false}
                      />
                    ) : (
                      <Paperclip />
                    )}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{attachment.file.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {formatFileSize(attachment.file.size)}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label={t`Remove ${attachment.file.name}`}
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation()
                        onRemoveAttachment(attachment.id)
                      }}
                    >
                      <X className='size-4' />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              )
            })}
          </AttachmentGroup>
        )}
        <div className='flex w-full items-end gap-2 px-4 py-2'>
          <div className='flex items-end pb-0.5'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='icon'
                  type='button'
                  variant='ghost'
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t`Add attachment`}
                >
                  <Paperclip size={16} className='stroke-muted-foreground' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Add attachment`}</TooltipContent>
            </Tooltip>
          </div>
          <label className='flex-1'>
            <span className='sr-only'><Trans>Chat text box</Trans></span>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={replyTo ? t`Type your reply…` : t`Type your message…`}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSendMessage(e as unknown as FormEvent)
                }
              }}
              className='max-h-40 w-full resize-none overflow-y-auto bg-transparent text-sm leading-5 focus-visible:outline-none'
            />
          </label>
          <div className='flex items-end pb-0.5'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='submit'
                  size='icon'
                  className='bg-primary hover:bg-primary/80 transition-colors'
                  disabled={isSendDisabled}
                  aria-label={t`Send message`}
                >
                  {isSending ? (
                    <Loader2 size={16} className='animate-spin' />
                  ) : (
                    <Send size={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Send message`}</TooltipContent>
            </Tooltip>
          </div>
          <input
            ref={fileInputRef}
            type='file'
            multiple
            className='hidden'
            onChange={(e) => {
              onAttachmentSelection(e)
              // Reset input value so the same file can be selected again
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {sendMessageErrorMessage && (
        <p className='text-destructive w-full pe-2 text-end text-xs'>
          {sendMessageErrorMessage}
        </p>
      )}
    </form>
  )
  }
)
