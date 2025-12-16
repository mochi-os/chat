import { FileText } from 'lucide-react'
import type { ChatMessageAttachment } from '@/api/chats'
import { detectRemoteAttachmentKind, formatFileSize } from '../utils'

interface MessageAttachmentPreviewProps {
  attachment: ChatMessageAttachment
  index: number
}

export function MessageAttachmentPreview({
  attachment,
  index,
}: MessageAttachmentPreviewProps) {
  const kind = detectRemoteAttachmentKind(attachment)
  const sizeLabel = formatFileSize(attachment.size)

  if (kind === 'image') {
    return (
      <a
        href={attachment.url}
        target='_blank'
        rel='noopener noreferrer'
        className='block'
      >
        <img
          src={attachment.url}
          alt={attachment.name ?? `Attachment ${index + 1}`}
          className='max-h-48 max-w-full rounded-lg object-cover'
        />
      </a>
    )
  }

  if (kind === 'video') {
    return (
      <video
        src={attachment.url}
        controls
        className='max-h-48 max-w-full rounded-lg'
      />
    )
  }

  return (
    <a
      href={attachment.url}
      target='_blank'
      rel='noopener noreferrer'
      className='bg-muted/50 hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2 transition-colors'
    >
      <FileText className='text-muted-foreground h-5 w-5' />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-xs font-medium'>
          {attachment.name ?? 'File'}
        </p>
        {sizeLabel && (
          <p className='text-muted-foreground text-[10px]'>{sizeLabel}</p>
        )}
      </div>
    </a>
  )
}
