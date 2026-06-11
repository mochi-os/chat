import type { ReactNode } from 'react'

export function highlightSearchText(
  text: string,
  query: string,
  isActive: boolean
): ReactNode {
  if (!query || query.length < 2 || !text) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  while (true) {
    const index = lowerText.indexOf(lowerQuery, lastIndex)
    if (index === -1) {
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
      }
      break
    }

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index))
    }

    parts.push(
      <span
        key={key++}
        className={
          isActive
            ? 'rounded bg-warning/70 px-0.5 text-warning-foreground'
            : 'rounded bg-warning/30 px-0.5'
        }
      >
        {text.slice(index, index + query.length)}
      </span>
    )

    lastIndex = index + query.length
  }

  return parts.length > 0 ? parts : text
}
