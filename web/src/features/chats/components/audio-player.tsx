// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useRef, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Pause, Play, X } from 'lucide-react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@mochi/web'
import { VoiceWaveform } from './voice-waveform'
import {
  extractAudioPeaks,
  placeholderPeaks,
} from '../utils/audio-peaks'
import { claimActiveAudio, releaseActiveAudio } from '../utils/active-audio'

export interface VoiceNotePlayerProps {
  src: string
  durationSecs: number
  /** Visual treatment */
  variant?: 'composer' | 'sent' | 'received'
  /** Optional precomputed peaks (0..1); otherwise placeholder then lazy decode */
  peaks?: number[]
  onRemove?: () => void
  className?: string
}

function formatTime(seconds: number) {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
}

const PREVIEW_BAR_COUNT = 36

export function VoiceNotePlayer({
  src,
  durationSecs,
  variant = 'received',
  peaks: peaksProp,
  onRemove,
  className,
}: VoiceNotePlayerProps) {
  const { t } = useLingui()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(Math.max(1, durationSecs))
  const [peaks, setPeaks] = useState<number[]>(
    () =>
      peaksProp ??
      placeholderPeaks(PREVIEW_BAR_COUNT, Math.round(durationSecs * 10) || 7)
  )

  useEffect(() => {
    if (peaksProp) {
      setPeaks(peaksProp)
      return
    }
    if (!src) return
    let cancelled = false
    void extractAudioPeaks(src, PREVIEW_BAR_COUNT).then((next) => {
      if (!cancelled && next.length > 0) setPeaks(next)
    })
    return () => {
      cancelled = true
    }
  }, [src, peaksProp])

  useEffect(() => {
    setDuration(Math.max(1, durationSecs))
  }, [durationSecs])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setProgress(audio.currentTime)
    const onEnded = () => {
      setIsPlaying(false)
      setProgress(0)
      releaseActiveAudio(audio)
    }
    const onPause = () => {
      // Another player claimed exclusive playback — sync UI.
      if (!audio.paused) return
      setIsPlaying(false)
    }
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('loadedmetadata', onLoaded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('loadedmetadata', onLoaded)
      releaseActiveAudio(audio)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      releaseActiveAudio(audio)
    } else {
      claimActiveAudio(audio)
      void audio.play().then(
        () => setIsPlaying(true),
        () => {
          setIsPlaying(false)
          releaseActiveAudio(audio)
        }
      )
    }
  }

  const seekRatio = (ratio: number) => {
    const audio = audioRef.current
    if (!audio) return
    const next = ratio * duration
    audio.currentTime = next
    setProgress(next)
  }

  const tone =
    variant === 'sent'
      ? 'sent'
      : variant === 'composer'
        ? 'composer'
        : 'received'

  const displayTime = isPlaying || progress > 0 ? progress : duration
  const playLabel = isPlaying ? t`Pause voice note` : t`Play voice note`
  const removeLabel = t`Remove voice note`
  const isBubble = variant === 'sent' || variant === 'received'

  const playButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={playLabel}
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          className={cn(
            'size-9 shrink-0 rounded-full',
            variant === 'sent' &&
              'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 hover:text-primary-foreground',
            variant === 'received' &&
              'bg-primary text-primary-foreground hover:bg-primary/90',
            variant === 'composer' &&
              'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {isPlaying ? (
            <Pause className='size-3.5' fill='currentColor' />
          ) : (
            <Play className='ms-0.5 size-3.5' fill='currentColor' />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{playLabel}</TooltipContent>
    </Tooltip>
  )

  const waveform = (
    <VoiceWaveform
      peaks={peaks}
      progress={duration > 0 ? progress / duration : 0}
      interactive
      onSeek={seekRatio}
      tone={tone}
      className='min-w-0 flex-1'
    />
  )

  const durationEl = (
    <span
      className={cn(
        'shrink-0 tabular-nums text-[11px] font-medium tracking-wide',
        variant === 'sent' && 'text-primary-foreground/85',
        variant === 'received' && 'text-muted-foreground',
        variant === 'composer' && 'text-muted-foreground'
      )}
      aria-label={t`Duration ${formatTime(displayTime)}`}
    >
      {formatTime(displayTime)}
    </span>
  )

  return (
    <div
      className={cn(
        'flex min-w-[14rem] items-center gap-2.5',
        // Composer: bordered preview strip
        variant === 'composer' &&
          'border-border/60 bg-muted/30 w-full max-w-full rounded-2xl border px-2.5 py-1.5 sm:max-w-[28rem]',
        // Bubble variant: sit flush in message bubble (no nested card)
        isBubble && 'w-full max-w-[17.5rem] bg-transparent p-0',
        className
      )}
    >
      <audio ref={audioRef} src={src} preload='metadata' />

      {variant === 'composer' ? (
        <>
          {playButton}
          {waveform}
          {durationEl}
          {onRemove ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={removeLabel}
                  className='text-muted-foreground hover:text-destructive size-8 shrink-0'
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                  }}
                >
                  <X className='size-3.5' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{removeLabel}</TooltipContent>
            </Tooltip>
          ) : null}
        </>
      ) : (
        // Bubble layout: play · waveform · duration
        <>
          {playButton}
          {waveform}
          {durationEl}
        </>
      )}
    </div>
  )
}

/** @deprecated Prefer VoiceNotePlayer — kept as alias during refactor */
export const AudioPlayer = VoiceNotePlayer
