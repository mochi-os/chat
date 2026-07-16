// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '@mochi/web'

export interface VoiceWaveformProps {
  peaks: number[]
  /** 0..1 playback progress for played/unplayed split */
  progress?: number
  interactive?: boolean
  onSeek?: (ratio: number) => void
  /** Visual tone matching chat bubble / recording UI */
  tone?: 'sent' | 'received' | 'composer' | 'recording'
  className?: string
}

function seekRatioFromClientX(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

/** Soften peak heights so bars stay readable without looking spiky. */
function normalizePeak(peak: number): number {
  const clamped = Math.min(1, Math.max(0, peak))
  return 0.22 + Math.pow(clamped, 0.85) * 0.78
}

export function VoiceWaveform({
  peaks,
  progress = 0,
  interactive = false,
  onSeek,
  tone = 'received',
  className,
}: VoiceWaveformProps) {
  const { t } = useLingui()
  const trackRef = useRef<HTMLDivElement | null>(null)

  const handlePointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!interactive || !onSeek || !trackRef.current) return
      e.preventDefault()
      e.stopPropagation()
      trackRef.current.setPointerCapture(e.pointerId)
      onSeek(seekRatioFromClientX(trackRef.current, e.clientX))
    },
    [interactive, onSeek]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!interactive || !onSeek || !trackRef.current) return
      if (!trackRef.current.hasPointerCapture(e.pointerId)) return
      onSeek(seekRatioFromClientX(trackRef.current, e.clientX))
    },
    [interactive, onSeek]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!interactive || !onSeek) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onSeek(Math.max(0, progress - 0.05))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onSeek(Math.min(1, progress + 0.05))
      }
    },
    [interactive, onSeek, progress]
  )

  const bars =
    peaks.length > 0
      ? peaks
      : tone === 'recording'
      ? []
      : Array.from({ length: 32 }, () => 0.35)

  return (
    <div
      ref={trackRef}
      role={interactive ? 'slider' : 'img'}
      aria-label={
        interactive ? t`Seek in voice note` : t`Voice note waveform`
      }
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={handlePointer}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className={cn(
        // Explicit height — percentage bar heights fail inside flex and collapse to 0.
        'flex h-9 min-h-9 min-w-0 w-full flex-1 items-center',
        tone === 'recording'
          ? 'max-w-[160px] sm:max-w-[240px] justify-end overflow-hidden gap-[2px]'
          : 'gap-[3px]',
        interactive && 'cursor-pointer touch-none',
        className
      )}
    >
      {bars.map((peak, i) => {
        const ratio = (i + 0.5) / bars.length
        const played = ratio <= progress
        // Pixel heights always paint; % height on empty flex spans often resolve to 0.
        const heightPx =
          tone === 'recording'
            ? Math.round(3 + Math.min(1, Math.max(0, peak)) * 21)
            : Math.round(7 + normalizePeak(peak) * 22)
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              'block rounded-full',
              tone === 'recording' ? 'w-[3px] shrink-0' : 'min-w-[2px] flex-1',
              tone === 'recording'
                ? 'bg-muted-foreground/60 transition-[height] duration-75 ease-out'
                : 'transition-[height,background-color] duration-100 ease-out',
              // Sent sits on primary bubble: white played, translucent unplayed.
              tone === 'sent' &&
                (played
                  ? 'bg-primary-foreground'
                  : 'bg-primary-foreground/35'),
              // Received / composer: primary blue played, muted unplayed.
              tone === 'received' &&
                (played ? 'bg-primary' : 'bg-muted-foreground/40'),
              tone === 'composer' &&
                (played ? 'bg-primary' : 'bg-muted-foreground/40')
            )}
            style={{ height: `${heightPx}px` }}
          />
        )
      })}
    </div>
  )
}
