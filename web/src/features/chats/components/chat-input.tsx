// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
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
} from '@mochi/web'
import { Loader2, Paperclip, Send, X, Mic, Trash, Square, FileText, Music } from 'lucide-react'
import type { PendingAttachment } from '../utils'
import type { ReplyTarget } from '../utils/reply'
import { ReplyQuoteContent } from './reply-quote-content'
import { VoiceNotePlayer } from './audio-player'
import { VoiceWaveform } from './voice-waveform'

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
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
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
  const { formatFileSize } = useFormat()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [livePeaks, setLivePeaks] = useState<number[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveformIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAtRef = useRef<number>(0)
  const shellMicRequestIdRef = useRef<number | null>(null)
  const localMicHostRef = useRef<ReturnType<typeof createMicSessionHost> | null>(null)
  const shellMicSupportedRef = useRef<boolean | null>(null)
  const stoppingRef = useRef(false)
  const startingRef = useRef(false)
  const autoStoppedRef = useRef(false)
  const stopRecordingRef = useRef<(cancel?: boolean) => Promise<void>>(
    async () => {}
  )
  const livePeaksRef = useRef<number[]>([])

  const hasPendingAttachments = pendingAttachments.length > 0
  const canReorder = pendingAttachments.length > 1
  const pendingFiles = pendingAttachments.filter((a) => !a.playable)
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
    mediaRecorderRef.current = null
    audioChunksRef.current = []
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
        t`Installed Mochi shell may not support voice recording. Update the Menu/shell app and try again.`
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
          t`Microphone is blocked in this embedded view. Update the Mochi shell and try again.`
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
          if (shellMicSupportedRef.current === null) {
            shellMicSupportedRef.current = await shellMicProbe()
          }
          if (!shellMicSupportedRef.current) {
            startingRef.current = false
            toast.error(
              t`Installed Mochi shell may not support voice recording. Update the Menu/shell app and try again.`
            )
            return
          }
          const requestId = await shellMicStart()
          shellMicRequestIdRef.current = requestId
          startingRef.current = false
          beginRecordingUi()
        } catch (err) {
          endRecordingUi()
          toastMicError(err)
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
        startingRef.current = false
        beginRecordingUi()
      } catch (err) {
        endRecordingUi()
        toastMicError(err)
      }
    } catch (err) {
      endRecordingUi()
      toastMicError(err)
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

      // Legacy local MediaRecorder path (should not normally be reached)
      if (!mediaRecorderRef.current) {
        endRecordingUi()
        return
      }
      const recorder = mediaRecorderRef.current
      const stream = recorder.stream
      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop())
          if (!cancel && audioChunksRef.current.length > 0) {
            const mimeType = recorder.mimeType || 'audio/webm'
            const blob = new Blob(audioChunksRef.current, { type: mimeType })
            attachVoiceNote(
              blob,
              mimeType,
              micFilenameForMime(mimeType),
              micDurationSecs(elapsedMs)
            )
          }
          resolve()
        }
        try {
          recorder.stop()
        } catch {
          resolve()
        }
      })
      endRecordingUi()
    } catch (err) {
      toastMicError(err)
      endRecordingUi()
    }
  }
  stopRecordingRef.current = stopRecording

  // Cleanup on unmount — cancel any in-flight shell/local recording.
  useEffect(() => {
    return () => {
      clearRecordingTimer()
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current)
      }
      const shellId = shellMicRequestIdRef.current
      if (shellId != null && isInShell()) {
        void shellMicCancel(shellId)
      }
      localMicHostRef.current?.abortAll()
    }
  }, [])

  useEffect(() => {
    if (replyTo) {
      focusInput()
    }
  }, [replyTo, focusInput])

  const handleDragStart = (e: DragEvent<HTMLDivElement>, attachmentId: string) => {
    if (!canReorder) return
    e.dataTransfer.setData('text/plain', attachmentId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(attachmentId)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>, attachmentId: string) => {
    if (!canReorder || !draggingId || draggingId === attachmentId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(attachmentId)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggingId
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null)
      setDropTargetId(null)
      return
    }
    const fromIndex = pendingAttachments.findIndex((a) => a.id === sourceId)
    const toIndex = pendingAttachments.findIndex((a) => a.id === targetId)
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorderAttachments(fromIndex, toIndex)
    }
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSendMessage(e)
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
              <AttachmentGroup
                onDragOver={(e) => {
                  if (canReorder) e.preventDefault()
                }}
              >
                {pendingFiles.map((attachment) => {
                  const isImage = attachment.kind === 'image'
                  const isVideo = attachment.kind === 'video'
                  const isDragging = draggingId === attachment.id
                  const isDropTarget = dropTargetId === attachment.id

                  return (
                    <Attachment
                      key={attachment.id}
                      draggable={canReorder}
                      onDragStart={(e: DragEvent<HTMLDivElement>) =>
                        handleDragStart(e, attachment.id)
                      }
                      onDragOver={(e: DragEvent<HTMLDivElement>) =>
                        handleDragOver(e, attachment.id)
                      }
                      onDrop={(e: DragEvent<HTMLDivElement>) =>
                        handleDrop(e, attachment.id)
                      }
                      onDragEnd={handleDragEnd}
                      className={cn(
                        canReorder && 'cursor-grab active:cursor-grabbing',
                        isDragging && 'opacity-40',
                        isDropTarget &&
                          'ring-primary rounded-lg ring-2 ring-inset'
                      )}
                      state={isSending ? 'uploading' : 'idle'}
                    >
                      <AttachmentMedia
                        variant={isImage || isVideo ? 'image' : 'icon'}
                      >
                        {isImage && attachment.previewUrl ? (
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.file.name}
                            draggable={false}
                          />
                        ) : isVideo && attachment.previewUrl ? (
                          <video
                            src={attachment.previewUrl}
                            muted
                            playsInline
                            draggable={false}
                          />
                        ) : (
                          <Paperclip />
                        )}
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{attachment.file.name}</AttachmentTitle>
                        <AttachmentDescription>
                          {formatFileSize(attachment.file.size)}
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          aria-label={t`Remove ${attachment.file.name}`}
                          onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation()
                            onRemoveAttachment(attachment.id)
                          }}
                        >
                          <X className='size-4' />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  )
                })}
              </AttachmentGroup>
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
                aria-label={t`Elapsed ${Math.floor(recordingDuration / 60)}:${Math.floor(
                  recordingDuration % 60
                )
                  .toString()
                  .padStart(2, '0')}`}
              >
                {Math.floor(recordingDuration / 60)}:
                {Math.floor(recordingDuration % 60)
                  .toString()
                  .padStart(2, '0')}
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
                <span className='sr-only'><Trans>Chat Text Box</Trans></span>
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
                      handleSubmit(e as unknown as FormEvent)
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
      {sendMessageErrorMessage && (
        <p className='text-destructive w-full pe-2 text-end text-xs'>
          {sendMessageErrorMessage}
        </p>
      )}
    </form>
  )
  }
)
