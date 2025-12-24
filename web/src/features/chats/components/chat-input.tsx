import { type ChangeEvent, type FormEvent, useRef } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Paperclip, Send, X } from 'lucide-react'
import { Button } from '@mochi/common'
import type { PendingAttachment } from '../utils'

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
  isSendDisabled: boolean
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onMoveAttachment: (id: string, direction: 'left' | 'right') => void
  onAttachmentSelection: (e: ChangeEvent<HTMLInputElement>) => void
  sendMessageErrorMessage: string | null
}

export function ChatInput({
  newMessage,
  setNewMessage,
  onSendMessage,
  isSending,
  isSendDisabled,
  pendingAttachments,
  onRemoveAttachment,
  onMoveAttachment,
  onAttachmentSelection,
  sendMessageErrorMessage,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasPendingAttachments = pendingAttachments.length > 0

  return (
    <form
      onSubmit={onSendMessage}
      className='flex w-full flex-none flex-col gap-2'
    >
      <div className='border-input bg-card focus-within:ring-ring flex w-full items-center gap-2 rounded-full border px-4 py-2 focus-within:ring-1 focus-within:outline-hidden'>
        <div className='flex items-center'>
          <Button
            size='icon'
            type='button'
            variant='ghost'
            className='h-8 w-8 rounded-full'
            onClick={() => fileInputRef.current?.click()}
            aria-label='Add attachment'
          >
            <Paperclip
              size={16}
              className='stroke-muted-foreground'
            />
          </Button>
        </div>
        <label className='flex-1'>
          <span className='sr-only'>Chat Text Box</span>
          <input
            type='text'
            placeholder='Type your message...'
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className='w-full bg-inherit text-sm focus-visible:outline-hidden'
          />
        </label>
        <Button
          type='submit'
          size='icon'
          className='bg-primary hover:bg-primary/80 h-8 w-8 rounded-full transition-colors'
          disabled={isSendDisabled}
        >
          {isSending ? (
            <Loader2 size={16} className='animate-spin' />
          ) : (
            <Send size={16} />
          )}
        </Button>
        <input
          ref={fileInputRef}
          type='file'
          multiple
          className='hidden'
          onChange={onAttachmentSelection}
        />
      </div>
      {hasPendingAttachments && (
        <div className='flex flex-wrap gap-2 px-1'>
          {pendingAttachments.map((attachment, index) => {
            const isImage = attachment.kind === 'image'
            const isVideo = attachment.kind === 'video'
            const isFirst = index === 0
            const isLast = index === pendingAttachments.length - 1

            return (
              <div
                key={attachment.id}
                className='group/att relative overflow-hidden rounded-lg border-2 border-dashed border-primary/30 bg-muted/50 flex items-center justify-center'
              >
                {isImage && attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.file.name}
                    className='max-h-[120px] max-w-[160px] block'
                  />
                ) : isVideo && attachment.previewUrl ? (
                  <video
                    src={attachment.previewUrl}
                    className='max-h-[120px] max-w-[160px] block'
                    muted
                    playsInline
                  />
                ) : (
                  <div className='flex h-[80px] w-[120px] flex-col items-center justify-center gap-1 px-2'>
                    <Paperclip className='size-5 text-muted-foreground' />
                    <span className='text-xs text-center line-clamp-2 break-all text-muted-foreground'>
                      {attachment.file.name}
                    </span>
                  </div>
                )}
                {/* Hover overlay with controls */}
                <div className='absolute inset-0 bg-black/50 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2'>
                  <button
                    type='button'
                    className='size-8 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center'
                    disabled={isFirst}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveAttachment(attachment.id, 'left')
                    }}
                  >
                    <ArrowLeft className='size-4' />
                  </button>
                  <button
                    type='button'
                    className='size-8 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center'
                    disabled={isLast}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveAttachment(attachment.id, 'right')
                    }}
                  >
                    <ArrowRight className='size-4' />
                  </button>
                  <button
                    type='button'
                    className='size-8 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center'
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveAttachment(attachment.id)
                    }}
                  >
                    <X className='size-4' />
                    <span className='sr-only'>Remove {attachment.file.name}</span>
                  </button>
                </div>
                {/* Position indicator */}
                {pendingAttachments.length > 1 && (
                  <div className='absolute top-1.5 left-1.5 size-5 rounded-full bg-black/60 text-white text-xs font-medium flex items-center justify-center'>
                    {index + 1}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {sendMessageErrorMessage && (
        <p className='text-destructive w-full pe-2 text-right text-xs'>
          {sendMessageErrorMessage}
        </p>
      )}
    </form>
  )
}
