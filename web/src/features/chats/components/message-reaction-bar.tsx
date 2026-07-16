// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useFormat,
} from '@mochi/web'
import { SmilePlus } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  type ReactionCounts,
  type ReactionId,
  useReactionOptions,
} from '../constants/reactions'

type MessageReactionPickerProps = {
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId | '') => void
  isSent?: boolean
  className?: string
}

export function MessageReactionPicker({
  activeReaction,
  onSelect,
  isSent = false,
  className,
}: MessageReactionPickerProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const reactionOptions = useReactionOptions()

  const handlePickerSelect = (id: ReactionId) => {
    const newReaction = activeReaction === id ? '' : id
    onSelect(newReaction)
    setOpen(false)
  }

  return (
    <div
      className={cn(
        'opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100',
        className
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        {open
          ? createPortal(
              <div
                aria-hidden='true'
                className='fixed inset-0 z-[59] md:hidden'
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(false)
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(false)
                }}
              />,
              document.body
            )
          : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-6'
                aria-label={t`Add reaction`}
                onClick={(e) => e.stopPropagation()}
              >
                <SmilePlus className='size-3.5' />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t`Add reaction`}</TooltipContent>
        </Tooltip>
        <PopoverContent
          className='w-auto p-2'
          side='bottom'
          align={isSent ? 'end' : 'start'}
          sideOffset={6}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className='flex gap-1'>
            {reactionOptions.map((reaction) => (
              <Tooltip key={reaction.id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type='button'
                    className={`rounded p-1.5 text-lg transition-colors hover:bg-hover active:bg-interactive-active ${
                      activeReaction === reaction.id
                        ? 'bg-foreground/10 ring-1 ring-foreground/20'
                        : ''
                    }`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => handlePickerSelect(reaction.id)}
                  >
                    {reaction.emoji}
                  </button>
                </TooltipTrigger>
                <TooltipContent side='bottom' className='text-xs'>
                  {activeReaction === reaction.id ? (
                    <Trans>Remove {reaction.label.toLowerCase()}</Trans>
                  ) : (
                    reaction.label
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

type MessageReactionSummaryProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  className?: string
}

export function MessageReactionSummary({
  counts,
  activeReaction,
  className,
}: MessageReactionSummaryProps) {
  const reactionOptions = useReactionOptions()
  const { formatNumber } = useFormat()

  const visibleReactions = reactionOptions.filter(
    (r) => (counts[r.id] ?? 0) > 0
  )

  if (visibleReactions.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-0.5',
        className
      )}
    >
      {visibleReactions.map((r) => {
        const count = counts[r.id] ?? 0
        const isYours = r.id === activeReaction
        return (
          <Tooltip key={`${r.id}-${count}`} delayDuration={300}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] leading-none transition-colors animate-in zoom-in-50 duration-300 ease-out",
                  isYours ? "text-foreground font-semibold" : "text-muted-foreground"
                )}
              >
                <span className="text-[13px]">{r.emoji}</span>
                {count > 1 ? <span>{formatNumber(count)}</span> : null}
              </span>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='text-xs'>
              {r.label}
              {isYours ? <Trans> (includes you)</Trans> : null}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
