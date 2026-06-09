import { cn } from '@mochi/web'

interface ReplyQuoteContentProps {
  body: string
  className?: string
}

export function ReplyQuoteContent({ body, className }: ReplyQuoteContentProps) {
  if (!body) return null

  return (
    <div
      className={cn(
        'text-sm leading-relaxed break-words whitespace-pre-wrap',
        'line-clamp-2 overflow-hidden',
        className
      )}
    >
      {body}
    </div>
  )
}
