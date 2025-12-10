import type { ChatMessageAttachment } from '@/api/chats'
import { FileText, Video } from 'lucide-react'
import { detectRemoteAttachmentKind, formatFileSize } from '../utils'

interface MessageAttachmentPreviewProps {
  attachment: ChatMessageAttachment
  index: number
}

export const MessageAttachmentPreview = ({
  attachment,
  index,
}: MessageAttachmentPreviewProps) => {
  const kind = detectRemoteAttachmentKind(attachment)
  const fallbackLabel = `Attachment ${index + 1}`
  const label = attachment.name ?? attachment.url ?? fallbackLabel
  const previewUrl =
    typeof attachment.url === 'string' && attachment.url.length > 0
      ? attachment.url
      : undefined
  const sizeLabel =
    typeof attachment.size === 'number'
      ? formatFileSize(attachment.size)
      : undefined
  const canRenderMedia =
    Boolean(previewUrl) && (kind === 'image' || kind === 'video')

  const mediaPreview = canRenderMedia ? (
    kind === 'image' ? (
      <img
        src={previewUrl}
        alt={label}
        className='h-16 w-16 rounded-xl object-cover'
      />
    ) : (
      <video
        src={previewUrl}
        className='h-16 w-16 rounded-xl object-cover'
        muted
        loop
        playsInline
      />
    )
  ) : (
    <div className='bg-muted text-muted-foreground flex h-16 w-16 items-center justify-center rounded-xl'>
      {kind === 'video' ? (
        <Video className='h-5 w-5' />
      ) : (
        <FileText className='h-5 w-5' />
      )}
    </div>
  )

  const textSection = (
    <div className='min-w-0 flex-1'>
      <p className='truncate text-xs font-medium'>{label}</p>
      {sizeLabel && (
        <p className='text-muted-foreground text-[10px]'>{sizeLabel}</p>
      )}
      {previewUrl && (
        <p className='text-primary text-[11px] font-medium'>Open</p>
      )}
    </div>
  )

  if (previewUrl) {
    return (
      <a
        href={previewUrl}
        target='_blank'
        rel='noreferrer'
        className='hover:bg-accent/50 group flex max-w-[240px] items-center gap-3 rounded-2xl border p-2 text-left transition-colors'
      >
        {mediaPreview}
        {textSection}
      </a>
    )
  }

  return (
    <div className='flex max-w-[240px] items-center gap-3 rounded-2xl border p-2 text-left'>
      {mediaPreview}
      {textSection}
    </div>
  )
}
