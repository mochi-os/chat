// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn, type MentionUser } from '@mochi/web'
import { safeHref } from '@mochi/web/lib/text-format'
import { Extension, type Editor } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import { Placeholder } from '@tiptap/extensions'
import { Slice } from '@tiptap/pm/model'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionProps } from '@tiptap/suggestion'
import { docToMarkdown, markdownToDoc } from './markdown'
import { MentionMenu } from './mention-menu'

/*
 * The composer's rich-text editor: Tiptap with the formats the stored
 * Markdown can carry and nothing else. Its value in and out is that Markdown,
 * so callers keep a plain string as they did with the textarea.
 *
 * Keys follow Slack: Enter sends, Shift+Enter starts a new line (a new item
 * in a list, a new line in a code block), Escape cancels.
 */

export interface MessageEditorOptions {
  value: string
  onValueChange: (value: string) => void
  /** Enter, unless the mention menu has the key. */
  onSubmit: () => void
  /** Escape, unless the mention menu has the key. */
  onEscape?: () => void
  placeholder?: string
  ariaLabel: string
  /** People offered after @. None means no mention menu. */
  people?: MentionUser[]
  onMentionSelect?: (person: MentionUser) => void
  autoFocus?: boolean
  className?: string
}

/** Opens the link field of the toolbar showing this editor, for Mod+K. */
const linkOpeners = new WeakMap<Editor, () => void>()

export function registerLinkOpener(editor: Editor, open: () => void) {
  linkOpeners.set(editor, open)
  return () => {
    if (linkOpeners.get(editor) === open) linkOpeners.delete(editor)
  }
}

interface MenuState {
  items: MentionUser[]
  command: (person: MentionUser) => void
  rect: DOMRect | null
}

const EDITOR_CLASS = cn(
  'max-h-40 min-h-5 overflow-y-auto text-sm leading-5 break-words outline-none',
  // Placeholder, drawn by the Placeholder extension's empty-node class.
  '[&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-start [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]'
)

/** A Tiptap editor holding a message as Markdown, and its mention menu. */
export function useMessageEditor(options: MessageEditorOptions): {
  editor: Editor | null
  mentionMenu: ReactNode
} {
  // The editor is built once; these refs carry the latest props into it.
  const latest = useRef(options)
  latest.current = options
  const lastValue = useRef(options.value)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<{ menu: MenuState | null; index: number }>({
    menu: null,
    index: 0,
  })
  menuRef.current = { menu, index: activeIndex }
  const menuOpen = () => Boolean(menuRef.current.menu?.items.length)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
          underline: false,
          hardBreak: false,
          trailingNode: false,
          bulletList: { HTMLAttributes: { class: 'list-disc ps-5' } },
          orderedList: { HTMLAttributes: { class: 'list-decimal ps-5' } },
          blockquote: {
            HTMLAttributes: {
              class:
                'border-foreground/25 text-foreground/80 border-s-2 ps-2.5',
            },
          },
          code: {
            HTMLAttributes: {
              class:
                'bg-foreground/10 rounded px-1 py-0.5 font-mono text-[0.85em]',
            },
          },
          codeBlock: {
            HTMLAttributes: {
              class:
                'bg-foreground/10 rounded-md px-2 py-1.5 font-mono text-xs leading-relaxed',
            },
          },
          link: {
            openOnClick: false,
            // A typed URL stays text, as in the message list; pasting a URL
            // over selected text links it.
            autolink: false,
            linkOnPaste: true,
            defaultProtocol: 'https',
            isAllowedUri: (url) => safeHref(url) !== null,
            HTMLAttributes: {
              class: 'text-primary font-medium underline underline-offset-2',
              rel: 'noopener noreferrer',
              target: '_blank',
            },
          },
        }),
        Placeholder.configure({
          placeholder: () => latest.current.placeholder ?? '',
        }),
        Mention.configure({
          HTMLAttributes: {
            class:
              'bg-primary/15 text-primary rounded-sm px-1 py-0.5 font-medium',
          },
          renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
          suggestion: {
            char: '@',
            allowSpaces: true,
            items: ({ query }) => {
              const lower = query.toLowerCase()
              return (latest.current.people ?? [])
                .filter((person) => person.name.toLowerCase().startsWith(lower))
                .slice(0, 8)
            },
            render: () => {
              const show = (props: SuggestionProps<MentionUser>) => {
                setActiveIndex(0)
                setMenu({
                  items: props.items,
                  rect: props.clientRect?.() ?? null,
                  command: (person) => {
                    props.command({ id: person.id, label: person.name })
                    latest.current.onMentionSelect?.(person)
                  },
                })
              }
              return {
                onStart: show,
                onUpdate: show,
                onExit: () => setMenu(null),
                onKeyDown: ({ event }) => {
                  const current = menuRef.current.menu
                  if (!current?.items.length) return false
                  const count = current.items.length
                  if (event.key === 'ArrowDown') {
                    setActiveIndex((menuRef.current.index + 1) % count)
                    return true
                  }
                  if (event.key === 'ArrowUp') {
                    setActiveIndex((menuRef.current.index - 1 + count) % count)
                    return true
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                    current.command(current.items[menuRef.current.index])
                    return true
                  }
                  return false
                },
              }
            },
          },
        }),
        Extension.create({
          name: 'messageKeys',
          // Ahead of StarterKit's own Enter handling and the mention menu's.
          priority: 1000,
          addKeyboardShortcuts() {
            return {
              Enter: () => {
                if (menuOpen()) return false
                latest.current.onSubmit()
                return true
              },
              'Shift-Enter': ({ editor }) =>
                editor.commands.first(({ commands }) => [
                  () => commands.newlineInCode(),
                  () => commands.splitListItem('listItem'),
                  () => commands.createParagraphNear(),
                  () => commands.liftEmptyBlock(),
                  () => commands.splitBlock(),
                ]),
              Escape: () => {
                if (menuOpen() || !latest.current.onEscape) return false
                latest.current.onEscape()
                return true
              },
              // Slack's keys, beside Tiptap's Mod-Shift-s and Mod-Shift-b.
              'Mod-Shift-x': ({ editor }) => editor.commands.toggleStrike(),
              'Mod-Shift-9': ({ editor }) => editor.commands.toggleBlockquote(),
              'Mod-k': ({ editor }) => {
                linkOpeners.get(editor)?.()
                return true
              },
              // The stored format has no nested lists, so Tab does not
              // indent an item. Outside a list it moves focus as usual.
              Tab: ({ editor }) => editor.isActive('listItem'),
              'Shift-Tab': ({ editor }) => editor.isActive('listItem'),
            }
          },
        }),
      ],
      content: markdownToDoc(options.value),
      autofocus: options.autoFocus ? 'end' : false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: cn(EDITOR_CLASS, options.className),
          'aria-label': options.ariaLabel,
          'aria-multiline': 'true',
          role: 'textbox',
        },
        // Plain text that carries markers (a copied message body) pastes as
        // formatting. A paste with HTML is left to Tiptap, which keeps the
        // formats this editor has and drops the rest.
        handlePaste: (view, event) => {
          const data = event.clipboardData
          if (!data || data.types.includes('text/html')) return false
          const text = data.getData('text/plain')
          if (!/[*_~`[>]|^\s*(?:[-+]|\d+[.)])\s/m.test(text)) return false
          const editor = editorRef.current
          // Code keeps what was pasted as it was, markers and lines and all.
          if (
            !editor ||
            editor.isActive('codeBlock') ||
            editor.isActive('code')
          )
            return false
          // A lone address is left to the link extension, which links the
          // selected text with it, or puts it in as text, as a typed one is.
          const trimmed = text.trim()
          if (!/\s/.test(trimmed) && safeHref(trimmed) !== null) return false
          const doc = editor.schema.nodeFromJSON(markdownToDoc(text))
          // Open at both ends, as ProseMirror's own paste is: the first and
          // last blocks join the line the caret is in. Inserting them as
          // whole blocks split that line, so a_b pasted into the middle of a
          // sentence sent as three lines.
          view.dispatch(
            view.state.tr
              .replaceSelection(Slice.maxOpen(doc.content))
              .scrollIntoView()
          )
          return true
        },
      },
      onUpdate: ({ editor }) => {
        const markdown = docToMarkdown(editor.getJSON())
        if (markdown === lastValue.current) return
        lastValue.current = markdown
        latest.current.onValueChange(markdown)
      },
    },
    []
  )
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  // A value set from outside (a draft restored, the box cleared after
  // sending) replaces the content. The editor's own edits come back equal.
  useEffect(() => {
    if (!editor || options.value === lastValue.current) return
    lastValue.current = options.value
    editor.commands.setContent(markdownToDoc(options.value), {
      emitUpdate: false,
    })
  }, [editor, options.value])

  // The placeholder is a decoration, redrawn on the next transaction.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr)
  }, [editor, options.placeholder])

  const mentionMenu = menu?.items.length ? (
    <MentionMenu
      items={menu.items}
      rect={menu.rect}
      activeIndex={activeIndex}
      onHover={setActiveIndex}
      onSelect={menu.command}
    />
  ) : null

  return { editor, mentionMenu }
}
