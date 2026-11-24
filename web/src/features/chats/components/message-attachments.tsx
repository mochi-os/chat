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
  shellDownload,
  useFormat,
  type GalleryAttachment,
} from '@mochi/web'
import type { ChatMessageAttachment } from '@/api/chats'
import { attachmentAddress } from '../addresses'
import { VoiceNotePlayer } from './audio-player'
import { MessageMediaGrid } from './message-media-grid'

interface MessageAttachmentsProps {
  attachments: ChatMessageAttachment[]
  chatId: string
  isSent?: boolean
}

/** Files shown before collapse toggle appears. */
const CHAT_FILE_COLLAPSED_COUNT = 3

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value)
// A substring test alone would accept "//host/-/attachments/x", which names
// another origin. Require a path, not something the browser reads as a host.
const isAttachmentPathCompatible = (value: string) =>
  !value.startsWith('//') && value.includes('/-/attachments/')

const isPlayableCaption = (caption?: string) =>
  Boolean(caption?.startsWith('voice:') || caption?.startsWith('audio:'))

function useAttachmentUrls(chatId: string) {
  // The fallback is built from the chat and attachment ids, each one path
  // segment; an id that cannot be one leaves the attachment without an address.
  const resolve = (own: string | undefined, fallback: string | undefined) => {
    const address =
      own && (isAbsoluteUrl(own) || isAttachmentPathCompatible(own))
        ? own
        : fallback
    return address ? authenticatedUrl(normalizeEntityUrl(address)) : ''
  }

  return {
    getUrl: (att: GalleryAttachment) =>
      resolve(att.url, attachmentAddress(chatId, att.id)),
    // Bubble media tiles render large enough that the 250px thumbnail blurs;
    // use the preview variant.
    getPreviewUrl: (att: GalleryAttachment) =>
      resolve(att.preview_url, attachmentAddress(chatId, att.id, 'preview')),
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
            className='w-full max-w-full min-w-0'
          >
            <AttachmentTrigger asChild>
              {/* A button, not an <a href>: the address carries the asset
                token, which must not sit in the DOM or a copied link. */}
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  void shellDownload(getUrl(attachment), attachment.name) // method-ok: an attachment's address, an asset route
                }}
              >
                <span className='sr-only'>{attachment.name}</span>
              </button>
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
              one='Show # more file'
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
  const { getUrl, getPreviewUrl } = useAttachmentUrls(chatId)

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
          (isImage(att.type) || isVideo(att.type)) &&
          !isPlayableCaption(att.caption)
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
          getPreviewUrl={getPreviewUrl}
        />
      ) : null}
      <MessageFileList files={files} getUrl={getUrl} isSent={isSent} />
    </div>
  )
}
