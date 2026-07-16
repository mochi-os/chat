// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Loader2, Play } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import {
  ImageLightbox,
  type LightboxMedia,
  cn,
  formatVideoDuration,
  isVideo,
  useLightboxHash,
  useVideoThumbnailCached,
} from '@mochi/web'
import type { GalleryAttachment } from '@mochi/web'

/** Visible slots in the bubble media grid; the 4th tile shows +N when exceeded. */
const GRID_SLOT_COUNT = 4

interface MessageMediaGridProps {
  media: GalleryAttachment[]
  getUrl: (att: GalleryAttachment) => string
  getThumbnailUrl: (att: GalleryAttachment) => string
}

function VideoTile({ url }: { url: string }) {
  const { t } = useLingui()
  const { url: thumbnailUrl, loading, error, duration } = useVideoThumbnailCached(url)

  if (loading) {
    return (
      <div className='bg-muted flex h-full w-full items-center justify-center'>
        <Loader2 className='text-muted-foreground size-6 animate-spin' />
      </div>
    )
  }

  if (error || !thumbnailUrl) {
    return (
      <div className='bg-muted flex h-full w-full items-center justify-center'>
        <Play className='text-muted-foreground size-10' />
      </div>
    )
  }

  return (
    <>
      <img
        src={thumbnailUrl}
        alt={t`Video thumbnail`}
        className='h-full w-full object-cover'
      />
      <div className='absolute inset-0 flex items-center justify-center'>
        <div className='rounded-full bg-black/50 p-2'>
          <Play className='size-5 text-white' />
        </div>
      </div>
      {duration != null ? (
        <div className='absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white'>
          {formatVideoDuration(duration)}
        </div>
      ) : null}
    </>
  )
}

function gridClassName(count: number) {
  if (count <= 1) return 'grid-cols-1'
  return 'grid-cols-2'
}

function tileClassName(count: number, index: number) {
  if (count === 1) return 'aspect-[4/3] max-h-56'
  if (count === 3 && index === 2) return 'col-span-2 aspect-[2/1]'
  return 'aspect-square'
}

export function MessageMediaGrid({
  media,
  getUrl,
  getThumbnailUrl,
}: MessageMediaGridProps) {
  const extraCount = Math.max(0, media.length - GRID_SLOT_COUNT)
  const visibleMedia =
    media.length > GRID_SLOT_COUNT ? media.slice(0, GRID_SLOT_COUNT) : media
  const slotCount = visibleMedia.length

  const lightboxMedia: LightboxMedia[] = media.map((att) => ({
    id: att.id,
    name: att.name,
    url: getUrl(att),
    type: isVideo(att.type) ? 'video' : 'image',
  }))

  const { open, currentIndex, openLightbox, closeLightbox, setCurrentIndex } =
    useLightboxHash(lightboxMedia)

  if (media.length === 0) {
    return null
  }

  return (
    <>
      <div className={cn('grid w-full min-w-0 gap-1', gridClassName(slotCount))}>
        {visibleMedia.map((attachment, index) => {
          const isOverflowTile = extraCount > 0 && index === visibleMedia.length - 1

          return (
            <button
              key={attachment.id}
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                openLightbox(index)
              }}
              className={cn(
                'bg-muted group/thumb relative overflow-hidden rounded-lg border border-black/5',
                tileClassName(slotCount, index)
              )}
            >
              {isVideo(attachment.type) ? (
                <VideoTile url={getUrl(attachment)} />
              ) : (
                <img
                  src={getThumbnailUrl(attachment)}
                  alt={attachment.name}
                  className='h-full w-full object-cover'
                />
              )}
              {isOverflowTile ? (
                <div className='absolute inset-0 flex items-center justify-center bg-black/55'>
                  <span className='text-2xl font-semibold text-white'>+{extraCount}</span>
                </div>
              ) : null}
            </button>
          )
        })}
      </div>

      <ImageLightbox
        images={lightboxMedia}
        currentIndex={currentIndex}
        open={open}
        onOpenChange={(isOpen) => !isOpen && closeLightbox()}
        onIndexChange={setCurrentIndex}
      />
    </>
  )
}
