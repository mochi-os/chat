// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useMemo } from 'react'
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

  const normalizedAttachments = useMemo(
    () =>
      attachments.map((att) => ({
        ...att,
        type: att.type || att.content_type || '',
      })),
    [attachments]
  )

  const resolve = (own: string | undefined, fallback: string) => {
    const path =
      own && (isAbsoluteUrl(own) || isAttachmentPathCompatible(own)) ? own : fallback
    return authenticatedUrl(normalizeEntityUrl(path))
  }

  return (
    <AttachmentGallery
      attachments={normalizedAttachments}
      getUrl={(att) => resolve(att.url, `${appBase}/${chatId}/-/attachments/${att.id}`)}
      getThumbnailUrl={(att) =>
        resolve(att.thumbnail_url, `${appBase}/${chatId}/-/attachments/${att.id}/thumbnail`)
      }
      // Chat messages live inside narrow bubble layouts.
      rowHeight={120}
    />
  )
}
