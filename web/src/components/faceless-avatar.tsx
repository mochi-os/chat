import { memo } from 'react'
import { cn } from '@/lib/utils'

type FacelessAvatarProps = {
  seed?: string
  name?: string
  size?: number
  className?: string
}

const backgroundColors = ['#DFE4EA', '#E5E7EB', '#D1D5DB', '#F3F4F6']
const textColors = ['#111827', '#1F2937', '#374151', '#4B5563']

const hashSeed = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const getInitials = (value?: string) => {
  if (!value) return '?'
  const trimmed = value.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]!.toUpperCase()
  return `${parts[0][0]!.toUpperCase()}${parts[1][0]!.toUpperCase()}`
}

export const FacelessAvatar = memo(function FacelessAvatar({
  seed,
  name,
  size = 48,
  className,
}: FacelessAvatarProps) {
  const base = name?.trim() || seed || 'mochi-friend'
  const hashed = hashSeed(base)
  const bg = backgroundColors[hashed % backgroundColors.length]
  const color = textColors[hashed % textColors.length]
  const initials = getInitials(name || seed)

  return (
    <div
      className={cn(
        'border-border bg-muted inline-flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold tracking-wide uppercase',
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color,
      }}
      role='img'
      aria-label={name ? `Initials avatar for ${name}` : 'Initials avatar'}
    >
      {initials}
    </div>
  )
})
