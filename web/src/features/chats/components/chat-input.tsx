// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  type ChangeEvent,
  type FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  AttachmentComposer,
  type ComposerItem,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useFormat,
  formatVideoDuration,
  MentionTextarea,
  type MentionUser,
  toast,
  isInShell,
  shellMicStart,
  shellMicStop,
  shellMicCancel,
  shellMicProbe,
  onShellMicLevel,
  createMicSessionHost,
  micDurationSecs,
  micFilenameForMime,
  startShellMicGuarded,
  UploadProgress,
  type Upload,
} from '@mochi/web'
// Image is aliased: the bare name shadows the DOM Image constructor.
import { Loader2, Paperclip, Send, X, Mic, Trash, Square, FileText, Music, Image as ImageIcon } from 'lucide-react'
import type { PendingAttachment } from '../utils'
import { MESSAGE_MAX_LENGTH } from '../constants/limits'
import type { ReplyTarget } from '../utils/reply'
import { ReplyQuoteContent } from './reply-quote-content'
import { VoiceNotePlayer } from './audio-player'
import { VoiceWaveform } from './voice-waveform'

/** Character count appears this close to the limit, not before. */
const MESSAGE_COUNTER_FROM = MESSAGE_MAX_LENGTH - 500

/** Soft cap for voice notes — auto-stop and keep the clip. */
const MAX_VOICE_DURATION_SECS = 300
/** Reject attach if encoded blob exceeds this (bitrate runaway safety). */
const MAX_VOICE_BLOB_BYTES = 16 * 1024 * 1024

export interface ChatInputHandle {
  focusInput: () => void
}

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  /** Current chat members available for @mention (excludes self). */
  people?: MentionUser[]
  selectedMentions: MentionUser[]
  onMentionsChange: (mentions: MentionUser[]) => void
  onSendMessage: () => void
  isSending: boolean
  /** Byte progress of the in-flight attachment upload */
  sendProgress?: Upload | null
  isSendDisabled: boolean
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onReorderAttachments: (fromIndex: number, toIndex: number) => void
  onAttachmentSelection: (e: ChangeEvent<HTMLInputElement>) => void
  onAudioAttachmentSelection: (e: ChangeEvent<HTMLInputElement>) => void
  onAddVoiceNote?: (file: File, durationSecs: number) => void
  sendMessageErrorMessage: string | null
  replyTo?: ReplyTarget | null
  onClearReply?: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      newMessage,
      setNewMessage,
      people = [],
      selectedMentions,
      onMentionsChange,
      onSendMessage,
      isSending,
      sendProgress,
      isSendDisabled,
      pendingAttachments,
      onRemoveAttachment,
      onReorderAttachments,
      onAttachmentSelection,
      onAudioAttachmentSelection,
      onAddVoiceNote,
      sendMessageErrorMessage,
      replyTo,
      onClearReply,
    },
    ref
  ) {
  const { t } = useLingui()
  const { formatNumber } = useFormat()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [livePeaks, setLivePeaks] = useState<number[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveformIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAtRef = useRef<number>(0)
  const shellMicRequestIdRef = useRef<number | null>(null)
  const localMicHostRef = useRef<ReturnType<typeof createMicSessionHost> | null>(null)
  const shellMicSupportedRef = useRef<boolean | null>(null)
  const stoppingRef = useRef(false)
  const startingRef = useRef(false)
  const autoStoppedRef = useRef(false)
  /** True after unmount — mic starts resolving late must cancel, not record. */
  const disposedRef = useRef(false)
  const stopRecordingRef = useRef<(cancel?: boolean) => Promise<void>>(
    async () => {}
  )
  const livePeaksRef = useRef<number[]>([])

  const hasPendingAttachments = pendingAttachments.length > 0
  const pendingFiles = pendingAttachments.filter((a) => !a.playable)

  const fileItems = useMemo<ComposerItem[]>(
    () =>
      pendingFiles.map((attachment) => ({
        key: attachment.id,
        name: attachment.file.name,
        size: attachment.file.size,
        type: attachment.file.type,
        previewUrl: attachment.previewUrl ?? null,
        previewKind: attachment.kind === 'video' ? 'video' : 'image',
        // Slices are indexed against the body, which carries the voice notes
        // this list filters out, so the tile has to find its own position in
        // the full array rather than reuse its position here.
        progress:
          sendProgress?.slices?.[
            pendingAttachments.findIndex((a) => a.id === attachment.id)
          ],
      })),
    [pendingFiles, pendingAttachments, sendProgress]
  )

  // Voice notes render above as players rather than tiles, so the composer's
  // indexes address the filtered list while onReorderAttachments addresses the
  // full one.
  const absoluteIndex = (fileIndex: number) =>
    pendingAttachments.findIndex((a) => a.id === pendingFiles[fileIndex]?.id)
  const pendingPlayableNotes = pendingAttachments.filter((a) => Boolean(a.playable))

  const focusInput = useCallback(() => {
    window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true })
    }, 0)
  }, [])

  useImperativeHandle(ref, () => ({ focusInput }), [focusInput])

  const pushLevel = useCallback((level: number) => {
    const softened = Math.min(1, Math.max(0.08, Math.pow(level, 0.75)))
    const next = [...livePeaksRef.current]
    if (next.length > 0) {
      const prev = next[next.length - 1]
      next[next.length - 1] = prev * 0.35 + softened * 0.65
    } else {
      next.push(softened)
    }
    livePeaksRef.current = next
    setLivePeaks(next)
  }, [])

  // Live levels from shell while recording
  useEffect(() => {
    if (!isRecording || !isInShell()) return
    return onShellMicLevel((requestId, level) => {
      if (shellMicRequestIdRef.current === requestId) {
        pushLevel(level)
      }
    })
  }, [isRecording, pushLevel])

  // Auto-resize: grow with content, shrink when cleared
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [newMessage])

  const clearRecordingTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const beginRecordingUi = () => {
    setIsRecording(true)
    setRecordingDuration(0)
    autoStoppedRef.current = false
    livePeaksRef.current = []
    setLivePeaks([])
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current)
    }
    waveformIntervalRef.current = setInterval(() => {
      const next = [...livePeaksRef.current]
      if (next.length >= 100) {
        next.shift()
      }
      next.push(0.0)
      livePeaksRef.current = next
      setLivePeaks(next)
    }, 80)
    recordingStartedAtRef.current =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now()
    clearRecordingTimer()
    timerRef.current = setInterval(() => {
      const started = recordingStartedAtRef.current
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()
      const secs = micDurationSecs(now - started)
      setRecordingDuration(secs)
      if (
        secs >= MAX_VOICE_DURATION_SECS &&
        !stoppingRef.current &&
        !autoStoppedRef.current
      ) {
        autoStoppedRef.current = true
        toast.info(t`Recording stopped at the 5-minute limit`)
        void stopRecordingRef.current(false)
      }
    }, 250)
  }

  const endRecordingUi = () => {
    clearRecordingTimer()
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current)
      waveformIntervalRef.current = null
    }
    setIsRecording(false)
    setRecordingDuration(0)
    setLivePeaks([])
    autoStoppedRef.current = false
    shellMicRequestIdRef.current = null
    stoppingRef.current = false
    startingRef.current = false
  }

  const toastMicError = (err: unknown) => {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : ''
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : ''

    if (name === 'TimeoutError') {
      toast.error(
        t`Voice recording isn't available in this app version. Please update the app and try again.`
      )
      return
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      toast.error(t`Microphone permission denied`)
      return
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      toast.error(t`No microphone found`)
      return
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      toast.error(t`Microphone is already in use`)
      return
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      toast.error(t`Microphone constraints could not be satisfied`)
      return
    }
    if (name === 'AbortError') {
      // User or navigation cancelled — no toast.
      return
    }
    if (name === 'NotSupportedError' || name === 'TypeError') {
      toast.error(t`Voice recording is not supported in this browser`)
      return
    }
    if (name === 'SecurityError') {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        toast.error(t`Microphone access requires a secure context (HTTPS or localhost)`)
      } else if (isInShell()) {
        toast.error(
          t`Microphone access is blocked here. Please update the app and try again.`
        )
      } else {
        toast.error(t`Microphone access was blocked by the browser`)
      }
      return
    }
    if (name === 'EmptyRecordingError') {
      toast.error(t`Recording produced no audio`)
      return
    }
    if (name === 'MediaRecorderError') {
      toast.error(t`Recording failed. Please try again.`)
      return
    }
    if (name === 'InvalidStateError') {
      toast.error(t`A recording is already in progress.`)
      return
    }
    if (message) {
      toast.error(t`Microphone error: ${message}`)
      return
    }
    toast.error(t`Microphone access denied`)
  }

  const attachVoiceNote = (blob: Blob, mimeType: string, filename: string, durationSecs: number) => {
    if (blob.size > MAX_VOICE_BLOB_BYTES) {
      toast.error(t`Recording is too large to send`)
      return
    }
    const file = new File([blob], filename || micFilenameForMime(mimeType), {
      type: mimeType || blob.type || 'audio/webm',
    })
    onAddVoiceNote?.(file, durationSecs)
  }

  const startRecording = async () => {
    if (isRecording || stoppingRef.current || startingRef.current) return
    startingRef.current = true

    // Secure-context check separate from iframe permission failures.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      startingRef.current = false
      toast.error(t`Microphone access requires a secure context (HTTPS or localhost)`)
      return
    }

    try {
      if (isInShell()) {
        try {
          const outcome = await startShellMicGuarded({
            ensureSupported: async () => {
              if (shellMicSupportedRef.current === null) {
                shellMicSupportedRef.current = await shellMicProbe()
              }
              return shellMicSupportedRef.current
            },
            start: shellMicStart,
            cancel: (requestId) => {
              void shellMicCancel(requestId).catch(() => {})
            },
            isDisposed: () => disposedRef.current,
          })
          if (outcome.status === 'disposed') {
            startingRef.current = false
            return
          }
          if (outcome.status === 'unsupported') {
            startingRef.current = false
            toast.error(
              t`Voice recording is currently unavailable. Please check your setup and try again.`
            )
            return
          }
          shellMicRequestIdRef.current = outcome.requestId
          startingRef.current = false
          beginRecordingUi()
        } catch (err) {
          endRecordingUi()
          if (!disposedRef.current) toastMicError(err)
        }
        return
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        startingRef.current = false
        toast.error(t`Microphone access requires a secure context (HTTPS or localhost)`)
        return
      }

      if (typeof MediaRecorder === 'undefined') {
        startingRef.current = false
        toast.error(t`Voice recording is not supported in this browser`)
        return
      }

      if (!localMicHostRef.current) {
        localMicHostRef.current = createMicSessionHost({
          getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
          MediaRecorder,
          now: () =>
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now(),
          onLevel: pushLevel,
        })
      }
      const host = localMicHostRef.current
      try {
        await host.start()
        if (disposedRef.current) {
          // Unmounted while the permission prompt was open — cleanup's
          // abortAll may have run before start resolved; stop again to be sure.
          host.abortAll()
          return
        }
        startingRef.current = false
        beginRecordingUi()
      } catch (err) {
        endRecordingUi()
        if (!disposedRef.current) toastMicError(err)
      }
    } catch (err) {
      endRecordingUi()
      if (!disposedRef.current) toastMicError(err)
    }
  }

  const stopRecording = async (cancel: boolean = false) => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    clearRecordingTimer()

    const elapsedMs = (() => {
      const started = recordingStartedAtRef.current
      if (!started) return 0
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()
      return now - started
    })()

    try {
      if (isInShell() && shellMicRequestIdRef.current != null) {
        const requestId = shellMicRequestIdRef.current
        if (cancel) {
          await shellMicCancel(requestId)
          endRecordingUi()
          return
        }
        try {
          const result = await shellMicStop(requestId)
          attachVoiceNote(
            result.blob,
            result.mimeType,
            result.filename,
            result.durationSecs || micDurationSecs(elapsedMs)
          )
        } catch (err) {
          toastMicError(err)
        } finally {
          endRecordingUi()
        }
        return
      }

      const host = localMicHostRef.current
      if (host) {
        const requestId = host.getActiveRequestId()
        if (cancel) {
          if (requestId != null) await host.cancel(requestId)
          else await host.cancel()
          endRecordingUi()
          return
        }
        if (requestId == null) {
          endRecordingUi()
          return
        }
        try {
          const result = await host.stop(requestId)
          if (result.ok) {
            attachVoiceNote(
              result.blob,
              result.mimeType,
              result.filename,
              result.durationSecs || micDurationSecs(elapsedMs)
            )
          } else if (result.error) {
            toastMicError(result.error)
          }
        } catch (err) {
          toastMicError(err)
        } finally {
          endRecordingUi()
        }
        return
      }

    } catch (err) {
      toastMicError(err)
      endRecordingUi()
    }
  }
  stopRecordingRef.current = stopRecording

  // Cleanup on unmount — cancel any in-flight shell/local recording.
  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      clearRecordingTimer()
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current)
      }
      const shellId = shellMicRequestIdRef.current
      if (shellId != null && isInShell()) {
        void shellMicCancel(shellId).catch(() => {})
      }
      localMicHostRef.current?.abortAll()
    }
  }, [])

  useEffect(() => {
    if (replyTo) {
      focusInput()
    }
  }, [replyTo, focusInput])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSendMessage()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='flex w-full flex-none flex-col gap-2'
    >
      <div className='border-input bg-card focus-within:ring-ring flex w-full flex-col rounded-xl border focus-within:ring-1 focus-within:outline-hidden'>
        {replyTo ? (
          <div className='border-border/50 flex items-start gap-2 border-b px-4 py-2.5'>
            <div className='flex min-w-0 flex-1 flex-col gap-1 overflow-hidden'>
              <div className='text-foreground text-sm font-medium'>
                <Trans>Replying to {replyTo.name}</Trans>
              </div>
              {replyTo.excerpt ? (
                <ReplyQuoteContent
                  body={replyTo.excerpt}
                  className='text-foreground/75'
                />
              ) : replyTo.isAttachment ? (
                <div className='text-foreground/75 text-sm'>
                  <Trans>Attachment</Trans>
                </div>
              ) : null}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5'
                  onClick={onClearReply}
                  aria-label={t`Cancel reply`}
                >
                  <X className='size-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t`Cancel reply`}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        {hasPendingAttachments && (
          <div className='border-border/50 flex flex-col gap-2 border-b px-4 pt-2 pb-2'>
            {pendingPlayableNotes.length > 0 ? (
              <div className='flex flex-col gap-2'>
                {pendingPlayableNotes.map((attachment) => (
                  <VoiceNotePlayer
                    key={attachment.id}
                    src={attachment.previewUrl ?? ''}
                    durationSecs={attachment.duration ?? 1}
                    kind={attachment.playable === 'audio' ? 'audio' : 'voice'}
                    title={
                      attachment.playable === 'audio'
                        ? attachment.file.name
                        : undefined
                    }
                    variant='composer'
                    onRemove={() => onRemoveAttachment(attachment.id)}
                  />
                ))}
              </div>
            ) : null}
            {pendingFiles.length > 0 ? (
              <AttachmentComposer
                items={fileItems}
                layout='grid'
                preview='tile'
                groupMedia
                state={isSending ? 'uploading' : 'idle'}
                onRemove={(index) =>
                  onRemoveAttachment(pendingFiles[index].id)
                }
                onReorder={(from, to) =>
                  onReorderAttachments(absoluteIndex(from), absoluteIndex(to))
                }
              />
            ) : null}
          </div>
        )}
        <div className='flex w-full items-end gap-2 px-4 py-2'>
          {isRecording ? (
            <div
              className='border-border/50 bg-muted/30 mb-0.5 flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 justify-end'
              role='status'
              aria-live='polite'
              aria-label={t`Recording voice note`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='text-muted-foreground hover:text-destructive h-8 w-8 shrink-0'
                    onClick={() => void stopRecording(true)}
                    aria-label={t`Discard recording`}
                  >
                    <Trash className='size-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t`Discard recording`}</TooltipContent>
              </Tooltip>
              <div
                className='bg-destructive size-2.5 shrink-0 animate-pulse rounded-full'
                aria-hidden
              />
              <div
                className='text-muted-foreground shrink-0 text-sm font-medium tracking-wider tabular-nums'
                aria-label={t`Elapsed ${formatVideoDuration(recordingDuration)}`}
              >
                {formatVideoDuration(recordingDuration)}
              </div>
              <VoiceWaveform
                peaks={livePeaks}
                tone='recording'
                progress={1}
                className='min-w-0 flex-1'
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    size='icon'
                    className='bg-primary h-8 w-8 shrink-0 rounded-full'
                    onClick={() => void stopRecording(false)}
                    aria-label={t`Stop recording`}
                  >
                    <Square className='size-3.5' fill='currentColor' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t`Stop recording`}</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <>
              <div className='flex items-end pb-0.5'>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size='icon'
                          type='button'
                          variant='ghost'
                          aria-label={t`Add attachment`}
                        >
                          <Paperclip size={16} className='stroke-muted-foreground' />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t`Add attachment`}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align='start' className='min-w-44'>
                    {/* First: the most common pick, and the entry that gives a
                        phone its camera and gallery rather than a file browser. */}
                    <DropdownMenuItem
                      onSelect={() => mediaInputRef.current?.click()}
                    >
                      <ImageIcon className='me-2 size-4' />
                      <Trans>Photo or Video</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => fileInputRef.current?.click()}
                    >
                      <FileText className='me-2 size-4' />
                      <Trans>Document</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => audioInputRef.current?.click()}
                    >
                      <Music className='me-2 size-4' />
                      <Trans>Audio</Trans>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <label className='flex-1'>
                <span className='sr-only'><Trans>Chat text box</Trans></span>
                <MentionTextarea
                  ref={textareaRef}
                  rows={1}
                  placeholder={
                    replyTo
                      ? t`Type your reply…`
                      : t`Type your message…`
                  }
                  value={newMessage}
                  people={people}
                  onValueChange={(val) => {
                    setNewMessage(val)
                    const nextMentions = selectedMentions.filter((m) =>
                      val.includes(`@[${m.name}]`)
                    )
                    if (nextMentions.length !== selectedMentions.length) {
                      onMentionsChange(nextMentions)
                    }
                  }}
                  onMentionSelect={(person) => {
                    if (selectedMentions.some((m) => m.id === person.id)) return
                    onMentionsChange([...selectedMentions, person])
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && replyTo) {
                      e.preventDefault()
                      onClearReply?.()
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      onSendMessage()
                    }
                  }}
                  className='border-0 bg-transparent min-h-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-1.5 resize-none w-full max-h-40 overflow-y-auto text-sm leading-5 focus-visible:outline-none shadow-none rounded-none'
                />
              </label>
              <div className='flex items-end gap-0.5 pb-0.5'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='transition-colors'
                      onClick={startRecording}
                      aria-label={t`Record voice note`}
                    >
                      <Mic size={16} className='stroke-muted-foreground' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t`Record voice note`}</TooltipContent>
                </Tooltip>
                {!isSendDisabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type='submit'
                        size='icon'
                        className='bg-primary hover:bg-primary/80 transition-colors'
                        disabled={isSendDisabled}
                        aria-label={t`Send message`}
                      >
                        {isSending ? (
                          <Loader2 size={16} className='animate-spin' />
                        ) : (
                          <Send size={16} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t`Send message`}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </>
          )}
        </div>
        <input
            ref={fileInputRef}
            type='file'
            multiple
            className='hidden'
            onChange={(e) => {
              onAttachmentSelection(e)
              e.target.value = ''
            }}
          />
        {/* Same handler as the Document input: nothing downstream filters by
            type, so accept only sets what the picker offers first. */}
        <input
            ref={mediaInputRef}
            type='file'
            multiple
            accept='image/*,video/*'
            className='hidden'
            onChange={(e) => {
              onAttachmentSelection(e)
              e.target.value = ''
            }}
          />
        <input
            ref={audioInputRef}
            type='file'
            multiple
            accept='audio/*'
            className='hidden'
            onChange={(e) => {
              onAudioAttachmentSelection(e)
              e.target.value = ''
            }}
          />
      </div>
      {isSending && <UploadProgress progress={sendProgress ?? null} />}
      {/* Shown only as the limit approaches, so it isn't noise on every
          message, and turns red once the send is actually blocked. */}
      {newMessage.length >= MESSAGE_COUNTER_FROM && (
        <p
          className={cn(
            'w-full pe-2 text-end text-xs tabular-nums',
            newMessage.length > MESSAGE_MAX_LENGTH
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {newMessage.length > MESSAGE_MAX_LENGTH
            ? t`Message is ${formatNumber(newMessage.length - MESSAGE_MAX_LENGTH)} characters too long`
            : `${formatNumber(newMessage.length)}/${formatNumber(MESSAGE_MAX_LENGTH)}`}
        </p>
      )}
      {sendMessageErrorMessage && (
        <p className='text-destructive w-full pe-2 text-end text-xs'>
          {sendMessageErrorMessage}
        </p>
      )}
    </form>
  )
  }
)
