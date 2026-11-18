// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@mochi/web'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  SquareCode,
  Strikethrough,
  TextQuote,
  type LucideIcon,
} from 'lucide-react'
import { linkTarget, type LinkTarget } from '../editor/link'
import { registerLinkOpener } from '../editor/use-message-editor'
import { LinkDialog } from './link-dialog'

type Format =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'link'
  | 'orderedList'
  | 'bulletList'
  | 'blockquote'
  | 'code'
  | 'codeBlock'

// Keycaps, as Slack and Tiptap bind them. Code block has Tiptap's Mod-Alt-c.
const SHORTCUTS: Record<Format, [shift: boolean, alt: boolean, key: string]> = {
  bold: [false, false, 'B'],
  italic: [false, false, 'I'],
  strike: [true, false, 'X'],
  link: [false, false, 'K'],
  orderedList: [true, false, '7'],
  bulletList: [true, false, '8'],
  blockquote: [true, false, '9'],
  code: [false, false, 'E'],
  codeBlock: [false, true, 'C'],
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function shortcutLabel(format: Format): string {
  const [shift, alt, key] = SHORTCUTS[format]
  if (isMac) return `${shift ? '⇧' : ''}${alt ? '⌥' : ''}⌘${key}`
  // eslint-disable-next-line lingui/no-unlocalized-strings -- key names as printed on the keycaps, which are not translated
  return `Ctrl+${shift ? 'Shift+' : ''}${alt ? 'Alt+' : ''}${key}`
}

function runFormat(editor: Editor, format: Exclude<Format, 'link'>) {
  const chain = editor.chain().focus()
  switch (format) {
    case 'bold':
      return chain.toggleBold().run()
    case 'italic':
      return chain.toggleItalic().run()
    case 'strike':
      return chain.toggleStrike().run()
    case 'orderedList':
      return chain.toggleOrderedList().run()
    case 'bulletList':
      return chain.toggleBulletList().run()
    case 'blockquote':
      return chain.toggleBlockquote().run()
    case 'code':
      return chain.toggleCode().run()
    case 'codeBlock':
      return chain.toggleCodeBlock().run()
  }
}

interface FormattingToolbarProps {
  editor: Editor | null
  className?: string
}

/**
 * Slack's formatting bar for a message editor. Each button shows whether
 * its format is on at the caret, and pressing it again turns it off.
 */
export function FormattingToolbar({
  editor,
  className,
}: FormattingToolbarProps) {
  const { t } = useLingui()
  const [link, setLink] = useState<LinkTarget | null>(null)

  // Only these values re-render the bar, not every keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive('bold'),
            italic: current.isActive('italic'),
            strike: current.isActive('strike'),
            link: current.isActive('link'),
            orderedList: current.isActive('orderedList'),
            bulletList: current.isActive('bulletList'),
            blockquote: current.isActive('blockquote'),
            code: current.isActive('code'),
            codeBlock: current.isActive('codeBlock'),
          }
        : null,
  })

  useEffect(() => {
    if (!editor) return
    return registerLinkOpener(editor, () => setLink(linkTarget(editor)))
  }, [editor])

  const buttons: { format: Format; label: string; icon: LucideIcon }[] = [
    { format: 'bold', label: t`Bold`, icon: Bold },
    { format: 'italic', label: t`Italic`, icon: Italic },
    { format: 'strike', label: t`Strikethrough`, icon: Strikethrough },
    { format: 'link', label: t`Link`, icon: Link },
    { format: 'orderedList', label: t`Numbered list`, icon: ListOrdered },
    { format: 'bulletList', label: t`Bulleted list`, icon: List },
    { format: 'blockquote', label: t`Quote`, icon: TextQuote },
    { format: 'code', label: t`Code`, icon: Code },
    { format: 'codeBlock', label: t`Code block`, icon: SquareCode },
  ]

  const press = (format: Format) => {
    if (!editor) return
    if (format === 'link') setLink(linkTarget(editor))
    else runFormat(editor, format)
  }

  return (
    <>
      <div
        role='toolbar'
        aria-label={t`Formatting`}
        className={cn('flex flex-wrap items-center gap-0.5', className)}
      >
        {buttons.map(({ format, label, icon: Icon }) => {
          const button = (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              disabled={!editor}
              className={cn(
                'text-muted-foreground hover:text-foreground size-7',
                active?.[format] && 'bg-accent text-foreground'
              )}
              aria-label={label}
              aria-pressed={active?.[format] ?? false}
              // Keep the editor's selection, which is what gets formatted.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => press(format)}
            >
              <Icon className='size-4' />
            </Button>
          )
          return (
            <Tooltip key={format}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>
                {label}
                <span className='ms-2 opacity-70'>{shortcutLabel(format)}</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      {editor ? (
        <LinkDialog
          editor={editor}
          target={link}
          onClose={() => setLink(null)}
        />
      ) : null}
    </>
  )
}
