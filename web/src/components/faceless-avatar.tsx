import { memo } from 'react'
import { cn } from '@/lib/utils'

type FacelessAvatarProps = {
  seed?: string
  name?: string
  size?: number
  className?: string
}

const backgroundColors = ['#E0ECFF', '#FFF1F2', '#F0F9FF', '#FFF7ED', '#ECFDF5', '#FDF2F8']
const skinTones = ['#FCD7B8', '#F5C3A7', '#D1A082', '#8C5A44', '#B0765C', '#E5B196']
const hairColors = ['#111827', '#FF8E00', '#6B21A8', '#1D4ED8', '#92400E', '#0F172A']
const shirtColors = ['#475569', '#F97316', '#0EA5E9', '#10B981', '#E11D48', '#6366F1']

const hairShapes = [
  'M13 38c2-10 11-20 19-20s17 10 19 20v6H13z',
  'M14 36c3-8 10-14 18-14s15 6 18 14v10H14z',
  'M12 40c4-14 12-22 20-22s16 8 20 22v4H12z',
  'M16 34c2-8 11-12 16-12s13 4 16 12v10H16z',
]

const shoulderShapes = [
  'M10 52c5-12 12-18 22-18s17 6 22 18v12H10z',
  'M12 54c4-14 12-20 20-20s16 6 20 20v10H12z',
  'M14 50c6-10 12-14 18-14s12 4 18 14v16H14z',
]

const hashSeed = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
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
  const skin = skinTones[hashed % skinTones.length]
  const hairColor = hairColors[hashed % hairColors.length]
  const shirt = shirtColors[hashed % shirtColors.length]
  const hair = hairShapes[hashed % hairShapes.length]
  const shoulders = shoulderShapes[hashed % shoulderShapes.length]

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden={!name}
    >
      <svg
        role='img'
        aria-label={name ? `Faceless avatar for ${name}` : 'Faceless avatar'}
        focusable='false'
        viewBox='0 0 64 64'
        className='h-full w-full'
      >
        <circle cx='32' cy='32' r='32' fill={bg} />
        <path d={shoulders} fill={shirt} />
        <rect x='24' y='30' width='16' height='8' fill={skin} rx='6' />
        <circle cx='32' cy='24' r='14' fill={skin} />
        <circle cx='21' cy='24' r='3' fill={skin} opacity='0.9' />
        <circle cx='43' cy='24' r='3' fill={skin} opacity='0.9' />
        <path d={hair} fill={hairColor} />
      </svg>
    </div>
  )
})


