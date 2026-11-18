// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { cn, type MentionUser } from '@mochi/web'
import { computeMentionDropdownPosition } from '@mochi/web/components/mention-dropdown-position'
import { createPortal } from 'react-dom'

interface MentionMenuProps {
  items: MentionUser[]
  rect: DOMRect | null
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (person: MentionUser) => void
}

/**
 * The @ menu of the message editor, drawn and placed as MentionTextarea's
 * dropdown is, so a mention looks the same wherever it is typed.
 */
export function MentionMenu({
  items,
  rect,
  activeIndex,
  onHover,
  onSelect,
}: MentionMenuProps) {
  if (!rect) return null
  const position = computeMentionDropdownPosition({
    rect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: 240 },
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })

  return createPortal(
    <div
      role='listbox'
      style={{
        position: 'fixed',
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        overflowY: 'auto',
        zIndex: 9999,
      }}
      className='bg-popover rounded-md border shadow-md'
    >
      {items.map((person, index) => (
        <button
          key={person.id}
          role='option'
          aria-selected={index === activeIndex}
          type='button'
          className={cn(
            'text-foreground flex w-full items-center px-3 py-2 text-start text-sm transition-colors outline-none',
            index === activeIndex
              ? 'bg-selected'
              : 'hover:bg-hover hover:text-hover-foreground'
          )}
          // Keep the editor focused, so the mention lands at the caret.
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(person)
          }}
          onMouseEnter={() => onHover(index)}
        >
          <span className='flex min-w-0 flex-col items-start gap-0.5'>
            <span className='truncate'>{person.name}</span>
            {person.detail ? (
              <span className='text-muted-foreground truncate text-xs'>
                {person.detail}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>,
    document.body
  )
}
