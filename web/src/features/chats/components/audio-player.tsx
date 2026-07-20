// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useLingui } from '@lingui/react/macro'
import { Headphones, Pause, Play, X } from 'lucide-react'
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

export type PlayableAudioKind = 'voice' | 'audio'

export interface VoiceNotePlayerProps {
  src: string
  durationSecs: number
  /** Mic voice note (waveform) vs attached audio file (headphones + bar). */
  kind?: PlayableAudioKind
  /** Visual treatment */
  variant?: 'composer' | 'sent' | 'received'
  /** Optional precomputed peaks (0..1); otherwise placeholder then lazy decode */
  peaks?: number[]
  /** Shown under audio-file chrome (filename). */
  title?: string
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

function seekRatioFromClientX(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

export function VoiceNotePlayer({
  src,
  durationSecs,
  kind = 'voice',
  variant = 'received',
  peaks: peaksProp,
  title,
  onRemove,
  className,
}: VoiceNotePlayerProps) {
  const { t } = useLingui()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrubRef = useRef<HTMLDivElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(Math.max(1, durationSecs))
  const [peaks, setPeaks] = useState<number[]>(
    () =>
      peaksProp ??
      placeholderPeaks(PREVIEW_BAR_COUNT, Math.round(durationSecs * 10) || 7)
  )

  const isAudioFile = kind === 'audio'

  useEffect(() => {
    if (isAudioFile) return
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
  }, [src, peaksProp, isAudioFile])

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

  const seekRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current
      if (!audio) return
      const next = ratio * duration
      audio.currentTime = next
      setProgress(next)
    },
    [duration]
  )

  const handleScrubPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!scrubRef.current) return
      e.preventDefault()
      e.stopPropagation()
      scrubRef.current.setPointerCapture(e.pointerId)
      seekRatio(seekRatioFromClientX(scrubRef.current, e.clientX))
    },
    [seekRatio]
  )

  const handleScrubMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!scrubRef.current?.hasPointerCapture(e.pointerId)) return
      seekRatio(seekRatioFromClientX(scrubRef.current, e.clientX))
    },
    [seekRatio]
  )

  const handleScrubKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const ratio = duration > 0 ? progress / duration : 0
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekRatio(Math.max(0, ratio - 0.05))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekRatio(Math.min(1, ratio + 0.05))
      }
    },
    [duration, progress, seekRatio]
  )

  const tone =
    variant === 'sent'
      ? 'sent'
      : variant === 'composer'
        ? 'composer'
        : 'received'

  const displayTime = isPlaying || progress > 0 ? progress : duration
  const playLabel = isPlaying
    ? isAudioFile
      ? t`Pause audio`
      : t`Pause voice note`
    : isAudioFile
      ? t`Play audio`
      : t`Play voice note`
  const removeLabel = isAudioFile ? t`Remove audio` : t`Remove voice note`
  const isBubble = variant === 'sent' || variant === 'received'
  const progressRatio = duration > 0 ? progress / duration : 0

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

  const removeButton =
    onRemove && variant === 'composer' ? (
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
    ) : null

  // Attached audio file: headphones badge + linear scrubber (WhatsApp-style).
  if (isAudioFile) {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5',
          variant === 'composer' &&
            'border-border/60 bg-muted/30 w-full max-w-full rounded-2xl border px-2.5 py-1.5 sm:max-w-[28rem]',
          isBubble && 'w-full max-w-full min-w-0 bg-transparent p-0',
          className
        )}
      >
        <audio ref={audioRef} src={src} preload='metadata' />
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            variant === 'sent' && 'bg-primary-foreground/20 text-primary-foreground',
            (variant === 'received' || variant === 'composer') && 'bg-primary text-primary-foreground'
          )}
          aria-hidden
        >
          <Headphones className='size-4' strokeWidth={2} />
        </div>
        {playButton}
        <div className='flex min-w-0 flex-1 flex-col gap-1 py-0.5'>
          {title ? (
            <span
              className={cn(
                'truncate text-xs font-medium leading-tight',
                variant === 'sent' && 'text-primary-foreground/90',
                (variant === 'received' || variant === 'composer') &&
                  'text-foreground'
              )}
            >
              {title}
            </span>
          ) : null}
          <div className='flex items-center gap-2'>
            <div
              ref={scrubRef}
              role='slider'
              tabIndex={0}
              aria-label={t`Seek in audio`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressRatio * 100)}
              onPointerDown={handleScrubPointer}
              onPointerMove={handleScrubMove}
              onKeyDown={handleScrubKey}
              className='flex h-5 min-w-0 flex-1 cursor-pointer touch-none items-center'
            >
              <div
                className={cn(
                  'relative h-1 w-full rounded-full',
                  variant === 'sent' && 'bg-primary-foreground/30',
                  (variant === 'received' || variant === 'composer') &&
                    'bg-muted-foreground/30'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-y-0 start-0 rounded-full',
                    variant === 'sent' && 'bg-primary-foreground',
                    (variant === 'received' || variant === 'composer') &&
                      'bg-primary'
                  )}
                  style={{ width: `${progressRatio * 100}%` }}
                />
                <div
                  className={cn(
                    'absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full',
                    variant === 'sent' && 'bg-primary-foreground',
                    (variant === 'received' || variant === 'composer') &&
                      'bg-primary'
                  )}
                  style={{
                    left: `calc(${progressRatio * 100}% - 5px)`,
                  }}
                />
              </div>
            </div>
            {durationEl}
          </div>
        </div>
        {removeButton}
      </div>
    )
  }

  const waveform = (
    <VoiceWaveform
      peaks={peaks}
      progress={progressRatio}
      interactive
      onSeek={seekRatio}
      tone={tone}
      className='min-w-0 flex-1'
    />
  )

  return (
    <div
      className={cn(
        'flex items-center gap-2.5',
        variant === 'composer' &&
          'border-border/60 bg-muted/30 w-full max-w-full rounded-2xl border px-2.5 py-1.5 sm:max-w-[28rem]',
        isBubble && 'w-full max-w-full min-w-0 bg-transparent p-0',
        className
      )}
    >
      <audio ref={audioRef} src={src} preload='metadata' />

      {variant === 'composer' ? (
        <>
          {playButton}
          {waveform}
          {durationEl}
          {removeButton}
        </>
      ) : (
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
