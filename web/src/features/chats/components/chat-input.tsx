import { type ChangeEvent, type FormEvent, useRef } from 'react'
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react'
import { Button } from '@mochi/common'
import type { PendingAttachment } from '../utils'
import { formatFileSize } from '../utils'

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
  isSendDisabled: boolean
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
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
      {hasPendingAttachments && (
        <div className='border-muted bg-muted/40 text-foreground flex w-full flex-wrap gap-3 rounded-3xl border border-dashed px-4 py-3'>
          {pendingAttachments.map((attachment) => {
            const sizeLabel = formatFileSize(attachment.file.size)
            return (
              <div
                key={attachment.id}
                className='border-input bg-background/80 flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm'
              >
                {attachment.previewUrl &&
                attachment.kind === 'image' ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.file.name}
                    className='h-12 w-12 rounded-xl object-cover'
                  />
                ) : attachment.previewUrl &&
                  attachment.kind === 'video' ? (
                  <video
                    src={attachment.previewUrl}
                    className='h-12 w-12 rounded-xl object-cover'
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <div className='bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-xl'>
                    <FileText className='h-5 w-5' />
                  </div>
                )}
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs font-medium'>
                    {attachment.file.name}
                  </p>
                  {sizeLabel && (
                    <p className='text-muted-foreground text-[10px]'>
                      {sizeLabel}
                    </p>
                  )}
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='hover:bg-destructive/10 text-muted-foreground h-6 w-6 rounded-full'
                  onClick={() =>
                    onRemoveAttachment(attachment.id)
                  }
                >
                  <X className='h-3.5 w-3.5' />
                  <span className='sr-only'>
                    Remove {attachment.file.name}
                  </span>
                </Button>
              </div>
            )
          })}
        </div>
      )}
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
            placeholder='Type your messages...'
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className='w-full bg-inherit text-sm focus-visible:outline-hidden'
          />
        </label>
        <Button
          type='submit'
          size='icon'
          className='bg-primary hover:bg-primary/90 h-8 w-8 rounded-full'
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
      {sendMessageErrorMessage && (
        <p className='text-destructive w-full pe-2 text-right text-xs'>
          {sendMessageErrorMessage}
        </p>
      )}
    </form>
  )
}
