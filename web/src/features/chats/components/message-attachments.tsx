// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useMemo, useState } from 'react'
import { Plural, Trans } from '@lingui/react/macro'
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
  authenticatedUrl,
  cn,
  getFileIcon,
  isImage,
  isVideo,
  normalizeEntityUrl,
  useFormat,
} from '@mochi/web'
import type { GalleryAttachment } from '@mochi/web'
import type { ChatMessageAttachment } from '@/api/chats'
import { MessageMediaGrid } from './message-media-grid'
import { VoiceNotePlayer } from './audio-player'

interface MessageAttachmentsProps {
  attachments: ChatMessageAttachment[]
  chatId: string
  isSent?: boolean
}

/** Files shown before collapse toggle appears. */
const CHAT_FILE_COLLAPSED_COUNT = 3

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value)
const isAttachmentPathCompatible = (value: string) => value.includes('/-/attachments/')

const isPlayableCaption = (caption?: string) =>
  Boolean(caption?.startsWith('voice:') || caption?.startsWith('audio:'))

function useAttachmentUrls(chatId: string) {
  const appBase = import.meta.env.VITE_APP_BASE_URL || '/chat'

  const resolve = (own: string | undefined, fallback: string) => {
    const path =
      own && (isAbsoluteUrl(own) || isAttachmentPathCompatible(own)) ? own : fallback
    return authenticatedUrl(normalizeEntityUrl(path))
  }

  return {
    getUrl: (att: GalleryAttachment) =>
      resolve(att.url, `${appBase}/${chatId}/-/attachments/${att.id}`),
    getThumbnailUrl: (att: GalleryAttachment) =>
      resolve(
        att.thumbnail_url,
        `${appBase}/${chatId}/-/attachments/${att.id}/thumbnail`
      ),
  }
}

function MessageFileList({
  files,
  getUrl,
  isSent = false,
}: {
  files: GalleryAttachment[]
  getUrl: (att: GalleryAttachment) => string
  isSent?: boolean
}) {
  const { formatFileSize } = useFormat()
  const [expanded, setExpanded] = useState(false)

  if (files.length === 0) {
    return null
  }

  const isCollapsible = files.length > CHAT_FILE_COLLAPSED_COUNT
  const visibleFiles =
    isCollapsible && !expanded
      ? files.slice(0, CHAT_FILE_COLLAPSED_COUNT)
      : files
  const hiddenCount = files.length - CHAT_FILE_COLLAPSED_COUNT

  const toggleClass = isSent
    ? 'text-primary-foreground/85 hover:text-primary-foreground'
    : 'text-primary hover:text-primary/90'

  return (
    <div className='flex w-full min-w-0 flex-col gap-1.5'>
      {visibleFiles.map((attachment) => {
        const FileIcon = getFileIcon(attachment.type)
        return (
          <Attachment
            key={attachment.id}
            size='sm'
            className='w-full min-w-0 max-w-full'
          >
            <AttachmentTrigger asChild>
              <a
                href={getUrl(attachment)}
                onClick={(e) => e.stopPropagation()}
                target='_blank'
                rel='noopener noreferrer'
              >
                <span className='sr-only'>{attachment.name}</span>
              </a>
            </AttachmentTrigger>
            <AttachmentMedia>
              <FileIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{attachment.name}</AttachmentTitle>
              <AttachmentDescription>
                {formatFileSize(attachment.size)}
              </AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        )
      })}
      {isCollapsible ? (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((value) => !value)
          }}
          className={cn(
            'self-start text-xs font-medium underline-offset-2 hover:underline',
            toggleClass
          )}
        >
          {expanded ? (
            <Trans>Show less</Trans>
          ) : (
            <Plural
              value={hiddenCount}
              one='Show 1 more file'
              other='Show # more files'
            />
          )}
        </button>
      ) : null}
    </div>
  )
}

export function MessageAttachments({
  attachments,
  chatId,
  isSent = false,
}: MessageAttachmentsProps) {
  const { getUrl, getThumbnailUrl } = useAttachmentUrls(chatId)

  const normalizedAttachments = useMemo(
    () =>
      attachments.map((att) => ({
        ...att,
        type: att.type || att.content_type || '',
      })),
    [attachments]
  )

  const voiceNotes = useMemo(
    () =>
      normalizedAttachments.filter((att) => att.caption?.startsWith('voice:')),
    [normalizedAttachments]
  )

  const audioFiles = useMemo(
    () =>
      normalizedAttachments.filter((att) => att.caption?.startsWith('audio:')),
    [normalizedAttachments]
  )

  const media = useMemo(
    () =>
      normalizedAttachments.filter(
        (att) =>
          (isImage(att.type) || isVideo(att.type)) && !isPlayableCaption(att.caption)
      ),
    [normalizedAttachments]
  )

  const files = useMemo(
    () =>
      normalizedAttachments.filter(
        (att) =>
          !isImage(att.type) &&
          !isVideo(att.type) &&
          !isPlayableCaption(att.caption)
      ),
    [normalizedAttachments]
  )

  if (normalizedAttachments.length === 0) {
    return null
  }

  const playableRow = (
    att: (typeof normalizedAttachments)[number],
    kind: 'voice' | 'audio'
  ) => {
    const colon = att.caption!.indexOf(':')
    const duration = parseInt(att.caption!.slice(colon + 1), 10) || 0
    return (
      <VoiceNotePlayer
        key={att.id}
        src={getUrl(att)}
        durationSecs={duration}
        kind={kind}
        title={kind === 'audio' ? att.name : undefined}
        variant={isSent ? 'sent' : 'received'}
      />
    )
  }

  return (
    <div className='flex w-full min-w-0 flex-col gap-2'>
      {voiceNotes.length > 0 ? (
        <div className='flex flex-col gap-2'>
          {voiceNotes.map((att) => playableRow(att, 'voice'))}
        </div>
      ) : null}
      {audioFiles.length > 0 ? (
        <div className='flex flex-col gap-2'>
          {audioFiles.map((att) => playableRow(att, 'audio'))}
        </div>
      ) : null}
      {media.length > 0 ? (
        <MessageMediaGrid
          media={media}
          getUrl={getUrl}
          getThumbnailUrl={getThumbnailUrl}
        />
      ) : null}
      <MessageFileList files={files} getUrl={getUrl} isSent={isSent} />
    </div>
  )
}
