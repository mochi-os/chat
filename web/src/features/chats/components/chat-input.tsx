import { type ChangeEvent, type FormEvent } from 'react'
import { FileText, Paperclip, Send, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingAttachment } from '../utils'

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onAttachClick: () => void
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
}

export function ChatInput({
  newMessage,
  setNewMessage,
  onSendMessage,
  isSending,
  fileInputRef,
  pendingAttachments,
  onRemoveAttachment,
  onAttachClick,
  onFileSelect,
}: ChatInputProps) {
  return (
    <form
      onSubmit={onSendMessage}
      className='flex w-full flex-none flex-col gap-2'
    >
      {pendingAttachments.length > 0 && (
        <div className='flex gap-2 pb-2'>
          <div className='flex gap-2 overflow-x-auto py-2'>
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className='bg-muted relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border'
              >
                {att.previewUrl &&
                (att.kind === 'image' || att.kind === 'video') ? (
                  att.kind === 'image' ? (
                    <img
                      src={att.previewUrl}
                      alt='preview'
                      className='h-full w-full object-cover'
                    />
                  ) : (
                    <video
                      src={att.previewUrl}
                      className='h-full w-full object-cover'
                    />
                  )
                ) : (
                  <div className='text-muted-foreground'>
                    {att.kind === 'video' ? (
                      <Video className='h-6 w-6' />
                    ) : (
                      <FileText className='h-6 w-6' />
                    )}
                  </div>
                )}
                <button
                  type='button'
                  onClick={() => onRemoveAttachment(att.id)}
                  className='bg-destructive text-destructive-foreground absolute top-0.5 right-0.5 rounded-full p-0.5 shadow-sm hover:opacity-90'
                >
                  <X className='h-3 w-3' />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='flex items-end gap-2'>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='text-muted-foreground shrink-0 rounded-full'
          onClick={onAttachClick}
        >
          <Paperclip className='h-5 w-5' />
          <span className='sr-only'>Attach file</span>
        </Button>
        <input
          type='file'
          ref={fileInputRef}
          className='hidden'
          multiple
          onChange={onFileSelect}
        />

        <label className='relative flex-1'>
          <input
            className='bg-muted/50 focus:bg-background border-input placeholder:text-muted-foreground flex h-10 w-full rounded-full border px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            placeholder='Type a message...'
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
        </label>

        <Button
          type='submit'
          size='icon'
          className='shrink-0 rounded-full'
          disabled={!newMessage.trim() && pendingAttachments.length === 0}
        >
          {isSending ? ( // You didn't pass Loader2 so maybe cleaner to just disable
             // Assuming caller handles spinner or just disable
             <Send className='h-5 w-5' />
          ) : (
            <Send className='h-5 w-5' />
          )}
          <span className='sr-only'>Send</span>
        </Button>
      </div>
    </form>
  )
}
