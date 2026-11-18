// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Editor, type JSONContent } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc } from './markdown'

// The schema the composer uses, so documents are checked against it.
const editors: Editor[] = []
function editorWith(markdown: string): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        underline: false,
        hardBreak: false,
        trailingNode: false,
      }),
      Mention,
    ],
    content: markdownToDoc(markdown),
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** Markdown into the editor and straight back out. */
const roundTrip = (markdown: string) =>
  docToMarkdown(editorWith(markdown).getJSON())

describe('round trip through the editor', () => {
  it.each([
    'plain text',
    '**bold** _italic_ ~~gone~~ `code`',
    '**bold _and italic_**',
    'un**believ**able',
    'see [the docs](https://example.com/a_(b))',
    '[**bold label**](https://example.com)',
    'hi @[Ann Lee], see this',
    'one\ntwo\n\nfour',
    '- a\n- **b**',
    '3. c\n4. d',
    '> quoted\n> - with a list',
    '```\nconst a = **b**\n  indented\n```',
    'before\n```\ncode\n```\nafter',
    'snake_case_name and 2*3*4',
  ])('keeps %j', (markdown) => {
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('writes code holding a backtick with a longer fence', () => {
    const markdown = roundTrip('`` a ` b ``')
    expect(markdown).toBe('``a ` b``')
    const code = editorWith(markdown).getJSON().content?.[0].content?.[0]
    expect(code).toMatchObject({ text: 'a ` b', marks: [{ type: 'code' }] })
  })

  it('reads a list item formatted inside as such', () => {
    const editor = editorWith('- **b**')
    const doc: JSONContent = editor.getJSON()
    const item = doc.content?.[0].content?.[0]
    expect(item?.type).toBe('listItem')
    expect(item?.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }])
  })

  it('reads a mention as a mention node', () => {
    const json = editorWith('hi @[Ann Lee]').getJSON()
    expect(json.content?.[0].content?.[1]).toMatchObject({
      type: 'mention',
      attrs: { label: 'Ann Lee' },
    })
  })
})

describe('docToMarkdown', () => {
  it('writes formatting applied in the editor', () => {
    const editor = editorWith('make this bold')
    editor.commands.setTextSelection({ from: 11, to: 15 })
    editor.commands.toggleBold()
    expect(docToMarkdown(editor.getJSON())).toBe('make this **bold**')
  })

  it('keeps spaces outside the markers', () => {
    const editor = editorWith('a bold word')
    editor.commands.setTextSelection({ from: 2, to: 8 })
    editor.commands.toggleBold()
    expect(docToMarkdown(editor.getJSON())).toBe('a **bold** word')
  })

  it('escapes characters typed literally, so they stay literal', () => {
    const typed = editorWith('')
    typed.commands.insertContent('*not italic* and [x](https://a.b)')
    const markdown = docToMarkdown(typed.getJSON())
    expect(markdown).toBe('\\*not italic\\* and \\[x\\](https://a.b)')
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('escapes a paragraph that would read as a list or quote', () => {
    const typed = editorWith('')
    typed.commands.insertContent('- not a list')
    expect(docToMarkdown(typed.getJSON())).toBe('\\- not a list')
  })

  it('drops italics inside a word, which the stored format cannot hold', () => {
    const editor = editorWith('unbelievable')
    editor.commands.setTextSelection({ from: 3, to: 9 })
    editor.commands.toggleItalic()
    expect(docToMarkdown(editor.getJSON())).toBe('unbelievable')
  })

  it('flattens nested lists to one level', () => {
    expect(
      docToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'b' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe('- a\n- b')
  })

  it('writes an empty editor as an empty body', () => {
    expect(docToMarkdown(editorWith('').getJSON())).toBe('')
  })
})
