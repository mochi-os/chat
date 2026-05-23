import { AttachmentGallery, authenticatedUrl, normalizeEntityUrl } from '@mochi/web'
import type { ChatMessageAttachment } from '@/api/chats'

interface MessageAttachmentsProps {
  attachments: ChatMessageAttachment[]
  chatId: string
}

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value)
const isAttachmentPathCompatible = (value: string) => value.includes('/-/attachments/')

export function MessageAttachments({ attachments, chatId }: MessageAttachmentsProps) {
  const appBase = import.meta.env.VITE_APP_BASE_URL || '/chat'

  const resolve = (own: string | undefined, fallback: string) => {
    if (own && (isAbsoluteUrl(own) || isAttachmentPathCompatible(own))) {
      return normalizeEntityUrl(own)
    }
    return authenticatedUrl(normalizeEntityUrl(fallback))
  }

  return (
    <AttachmentGallery
      attachments={attachments}
      getUrl={(att) => resolve(att.url, `${appBase}/${chatId}/-/attachments/${att.id}`)}
      getThumbnailUrl={(att) =>
        resolve(att.thumbnail_url, `${appBase}/${chatId}/-/attachments/${att.id}/thumbnail`)
      }
      // Chat messages live inside narrow bubble layouts.
      rowHeight={120}
    />
  )
}
