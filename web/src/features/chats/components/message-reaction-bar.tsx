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
                    className={`rounded p-1.5 text-lg transition-colors hover:bg-interactive-hover active:bg-interactive-active ${
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
          <Tooltip key={r.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                  isYours
                    ? 'bg-foreground/10 text-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <span>{r.emoji}</span>
                <span className='font-medium'>{count}</span>
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
