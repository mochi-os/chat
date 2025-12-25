import {
  ImageLightbox,
  type LightboxMedia,
  useVideoThumbnailCached,
  useLightboxHash,
  formatVideoDuration,
  formatFileSize,
  getFileIcon,
  isImage,
  isVideo,
} from '@mochi/common'
import { Loader2, Play } from 'lucide-react'
import type { ChatMessageAttachment } from '@/api/chats'

interface MessageAttachmentsProps {
  attachments: ChatMessageAttachment[]
  chatId: string
}

function VideoThumbnail({ url }: { url: string }) {
  const {
    url: thumbnailUrl,
    loading,
    error,
    duration,
  } = useVideoThumbnailCached(url)

  if (loading) {
    return (
      <div className='bg-muted flex h-[120px] w-[160px] items-center justify-center'>
        <Loader2 className='text-muted-foreground size-6 animate-spin' />
      </div>
    )
  }

  if (error || !thumbnailUrl) {
    return (
      <div className='bg-muted flex h-[120px] w-[160px] items-center justify-center'>
        <Play className='text-muted-foreground size-10' />
      </div>
    )
  }

  return (
    <div className='relative'>
      <img
        src={thumbnailUrl}
        alt='Video thumbnail'
        className='h-[120px] w-auto object-cover transition-transform group-hover/thumb:scale-105'
      />
      <div className='absolute inset-0 flex items-center justify-center'>
        <div className='rounded-full bg-black/50 p-2'>
          <Play className='size-6 text-white' />
        </div>
      </div>
      {duration != null && (
        <div className='absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white'>
          {formatVideoDuration(duration)}
        </div>
      )}
    </div>
  )
}

export function MessageAttachments({
  attachments,
  chatId,
}: MessageAttachmentsProps) {
  const appBase = import.meta.env.VITE_APP_BASE_URL || '/chat'

  const getAttachmentUrl = (id: string) => {
    return `${appBase}/${chatId}/-/attachments/${id}`
  }

  const getThumbnailUrl = (id: string) => {
    return `${appBase}/${chatId}/-/attachments/${id}/thumbnail`
  }

  const media = (attachments || []).filter(
    (att) => isImage(att.type) || isVideo(att.type)
  )
  const files = (attachments || []).filter(
    (att) => !isImage(att.type) && !isVideo(att.type)
  )

  const lightboxMedia: LightboxMedia[] = media.map((att) => ({
    id: att.id,
    name: att.name,
    url: getAttachmentUrl(att.id),
    type: isVideo(att.type) ? 'video' : 'image',
  }))

  // Use hash-based lightbox state for shareable URLs and back button support
  const { open, currentIndex, openLightbox, closeLightbox, setCurrentIndex } =
    useLightboxHash(lightboxMedia)

  if (!attachments || attachments.length === 0) {
    return null
  }

  const mediaButtons = media.map((attachment, index) => (
    <button
      key={attachment.id}
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        openLightbox(index)
      }}
      className='group/thumb bg-muted relative overflow-hidden rounded-lg border'
    >
      {isVideo(attachment.type) ? (
        <VideoThumbnail url={getAttachmentUrl(attachment.id)} />
      ) : (
        <img
          src={getThumbnailUrl(attachment.id)}
          alt={attachment.name}
          className='max-h-[200px] transition-transform group-hover/thumb:scale-105'
        />
      )}
    </button>
  ))

  const fileLinks = files.map((attachment) => {
    const FileIcon = getFileIcon(attachment.type)
    return (
      <a
        key={attachment.id}
        href={getAttachmentUrl(attachment.id)}
        onClick={(e) => e.stopPropagation()}
        className='flex items-center gap-2 rounded-lg border bg-white/10 p-2 text-sm transition-colors hover:bg-white/20'
      >
        <FileIcon className='size-4 shrink-0 opacity-70' />
        <span className='min-w-0 flex-1 truncate'>{attachment.name}</span>
        <span className='shrink-0 text-xs opacity-70'>
          {formatFileSize(attachment.size)}
        </span>
      </a>
    )
  })

  const lightbox = (
    <ImageLightbox
      images={lightboxMedia}
      currentIndex={currentIndex}
      open={open}
      onOpenChange={(isOpen) => !isOpen && closeLightbox()}
      onIndexChange={setCurrentIndex}
    />
  )

  return (
    <>
      {media.length > 0 && (
        <div className='flex flex-wrap items-start gap-2'>{mediaButtons}</div>
      )}
      {files.length > 0 && <div className='space-y-1'>{fileLinks}</div>}
      {lightbox}
    </>
  )
}
