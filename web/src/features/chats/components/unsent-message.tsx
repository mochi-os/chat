// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// A message whose send failed while the composer already held the next one:
// its text, why it failed, and Retry, Copy and Discard; and where it was
// refused for want of encryption, Send unencrypted.

import { Trans } from '@lingui/react/macro'
import { Button, useFormat } from '@mochi/web'
import {
  AlertCircle,
  Copy,
  LockOpen,
  Paperclip,
  RotateCcw,
  X,
} from 'lucide-react'

interface UnsentMessageProps {
  body: string
  files: number
  error: string
  retryDisabled: boolean
  onRetry: () => void
  onSendUnencrypted?: () => void
  onCopy: () => void
  onDiscard: () => void
}

export function UnsentMessage({
  body,
  files,
  error,
  retryDisabled,
  onRetry,
  onSendUnencrypted,
  onCopy,
  onDiscard,
}: UnsentMessageProps) {
  const { formatNumber } = useFormat()
  const text = body.trim()
  return (
    <div className='flex flex-col items-end gap-1 px-4 pb-2'>
      <div className='border-destructive/30 bg-destructive/10 max-w-[min(32rem,85%)] rounded-lg border px-3 py-2 text-sm'>
        {text ? (
          <p className='line-clamp-4 break-words whitespace-pre-wrap'>{text}</p>
        ) : null}
        {files > 0 ? (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Paperclip className='size-3' aria-hidden='true' />
            {formatNumber(files)}
          </p>
        ) : null}
        <p className='text-destructive mt-1 flex items-center gap-1 text-xs'>
          <AlertCircle className='size-3.5 shrink-0' aria-hidden='true' />
          {error}
        </p>
      </div>
      <div className='flex gap-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onRetry}
          disabled={retryDisabled}
        >
          <RotateCcw className='size-4' />
          <Trans>Retry</Trans>
        </Button>
        {onSendUnencrypted ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onSendUnencrypted}
            disabled={retryDisabled}
          >
            <LockOpen className='size-4' />
            <Trans>Send unencrypted</Trans>
          </Button>
        ) : null}
        {text ? (
          <Button type='button' variant='ghost' size='sm' onClick={onCopy}>
            <Copy className='size-4' />
            <Trans>Copy</Trans>
          </Button>
        ) : null}
        <Button type='button' variant='ghost' size='sm' onClick={onDiscard}>
          <X className='size-4' />
          <Trans>Discard</Trans>
        </Button>
      </div>
    </div>
  )
}
