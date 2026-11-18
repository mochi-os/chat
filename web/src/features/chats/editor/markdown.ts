// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  escapeBlockStart,
  parseFormattedText,
  parseInline,
  type FormattedBlock,
  type FormattedInline,
} from '@mochi/web/lib/text-format'
import type { JSONContent } from '@tiptap/core'

/*
 * The composer edits a Tiptap document, and a message body is stored as the
 * Markdown subset of lib/web's text-format.ts. These two functions convert
 * between them, so the server, notifications, bridges and older clients keep
 * seeing plain text with markers, exactly as before the editor.
 *
 * markdownToDoc reads with the same parser the message list renders with, so
 * whatever the list shows bold opens bold in the editor. docToMarkdown writes
 * the fewest markers it can, then checks its own output with that parser; if
 * the parser would read the line differently (a typed `*`, say), the line is
 * written again with its literal characters escaped.
 */

type MarkName = 'bold' | 'italic' | 'strike' | 'code' | 'link'

interface Marks {
  bold?: true
  italic?: true
  strike?: true
  code?: true
  link?: string
}

/** One run of inline content: text, or a mention token, with its marks. */
interface Segment {
  text: string
  mention?: true
  marks: Marks
}

// Outermost first. A link wraps any formatting inside its label, and code
// is innermost: Tiptap's code mark excludes every other mark anyway.
const ORDER: MarkName[] = ['link', 'bold', 'italic', 'strike', 'code']

const WORD = /[\p{L}\p{N}]/u
const MENTION = /(@\[[^\]\n]+\])/

// ---------------------------------------------------------------------------
// Markdown to document

/** The editor document for a stored message body. */
export function markdownToDoc(markdown: string): JSONContent {
  const content = blocksToNodes(parseFormattedText(markdown))
  return { type: 'doc', content: content.length ? content : [paragraph([])] }
}

function paragraph(content: JSONContent[]): JSONContent {
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function blocksToNodes(blocks: FormattedBlock[]): JSONContent[] {
  const nodes: JSONContent[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        // The stored body breaks lines with "\n"; the editor has a paragraph
        // per line, which is what Shift+Enter makes.
        nodes.push(...splitLines(inlineToNodes(block.children, {})))
        break
      case 'code':
        nodes.push({
          type: 'codeBlock',
          ...(block.text
            ? { content: [{ type: 'text', text: block.text }] }
            : {}),
        })
        break
      case 'quote': {
        const inner = blocksToNodes(block.children)
        nodes.push({
          type: 'blockquote',
          content: inner.length ? inner : [paragraph([])],
        })
        break
      }
      case 'list':
        nodes.push({
          type: block.ordered ? 'orderedList' : 'bulletList',
          ...(block.ordered ? { attrs: { start: block.start } } : {}),
          content: block.items.map((item) => ({
            type: 'listItem',
            content: [paragraph(inlineToNodes(item, {}).filter(isNode))],
          })),
        })
        break
    }
  }
  return nodes
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- a debugging description, never shown
const LINE_BREAK = Symbol('line break')
type InlineNode = JSONContent | typeof LINE_BREAK

const isNode = (node: InlineNode): node is JSONContent => node !== LINE_BREAK

function toMarks(marks: Marks): JSONContent['marks'] {
  const list: NonNullable<JSONContent['marks']> = []
  if (marks.link) list.push({ type: 'link', attrs: { href: marks.link } })
  if (marks.bold) list.push({ type: 'bold' })
  if (marks.italic) list.push({ type: 'italic' })
  if (marks.strike) list.push({ type: 'strike' })
  return list.length ? list : undefined
}

function textNodes(text: string, marks: Marks): InlineNode[] {
  const nodes: InlineNode[] = []
  text.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push(LINE_BREAK)
    for (const part of line.split(MENTION)) {
      if (!part) continue
      const mark = toMarks(marks)
      if (MENTION.test(part) && part.startsWith('@[')) {
        const label = part.slice(2, -1)
        nodes.push({
          type: 'mention',
          attrs: { id: label, label },
          ...(mark ? { marks: mark } : {}),
        })
      } else {
        nodes.push({
          type: 'text',
          text: part,
          ...(mark ? { marks: mark } : {}),
        })
      }
    }
  })
  return nodes
}

function inlineToNodes(nodes: FormattedInline[], marks: Marks): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push(...textNodes(node.text, marks))
        break
      case 'code':
        // Tiptap's code mark stands alone.
        for (const [index, line] of node.text.split('\n').entries()) {
          if (index > 0) out.push(LINE_BREAK)
          if (line)
            out.push({ type: 'text', text: line, marks: [{ type: 'code' }] })
        }
        break
      case 'strong':
        out.push(...inlineToNodes(node.children, { ...marks, bold: true }))
        break
      case 'emphasis':
        out.push(...inlineToNodes(node.children, { ...marks, italic: true }))
        break
      case 'strike':
        out.push(...inlineToNodes(node.children, { ...marks, strike: true }))
        break
      case 'link':
        out.push(...inlineToNodes(node.children, { ...marks, link: node.href }))
        break
    }
  }
  return out
}

function splitLines(nodes: InlineNode[]): JSONContent[] {
  const paragraphs: JSONContent[] = []
  let line: JSONContent[] = []
  for (const node of nodes) {
    if (node === LINE_BREAK) {
      paragraphs.push(paragraph(line))
      line = []
    } else {
      line.push(node)
    }
  }
  paragraphs.push(paragraph(line))
  return paragraphs
}

// ---------------------------------------------------------------------------
// Document to Markdown

/** The stored message body for an editor document. */
export function docToMarkdown(doc: JSONContent): string {
  return blockLines(doc.content ?? [])
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

function blockLines(nodes: JSONContent[]): string[] {
  const lines: string[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        lines.push(escapeBlockStart(inlineMarkdown(node.content ?? [])))
        break
      case 'codeBlock': {
        const text = (node.content ?? [])
          .map((child) => child.text ?? '')
          .join('')
        lines.push('```', ...text.split('\n'), '```')
        break
      }
      case 'blockquote':
        for (const line of blockLines(node.content ?? [])) {
          lines.push(line ? `> ${line}` : '>')
        }
        break
      case 'bulletList':
      case 'orderedList':
        lines.push(...listLines(node))
        break
      default:
        // Anything else a paste might carry: keep its text.
        if (node.content) lines.push(...blockLines(node.content))
        else if (node.text) lines.push(escapeBlockStart(node.text))
    }
  }
  return lines
}

/**
 * The stored format has no nested lists, so a nested list (from a paste)
 * comes out as further items of the same level, and a list item's extra
 * paragraphs join its first line.
 */
function listLines(list: JSONContent): string[] {
  const ordered = list.type === 'orderedList'
  let number = Number(list.attrs?.start ?? 1) || 1
  const lines: string[] = []
  for (const item of list.content ?? []) {
    const text: string[] = []
    const nested: string[] = []
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        nested.push(...listLines(child))
      } else if (child.type === 'paragraph') {
        const line = inlineMarkdown(child.content ?? [])
        if (line) text.push(line)
      } else {
        text.push(...blockLines([child]).filter(Boolean))
      }
    }
    const marker = ordered ? `${number++}. ` : '- '
    // An item needs text after its marker to read back as an item.
    if (text.length) lines.push(marker + text.join(' '))
    lines.push(...nested)
  }
  return lines
}

function nodeMarks(node: JSONContent): Marks {
  const marks: Marks = {}
  for (const mark of node.marks ?? []) {
    if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
      marks.link = mark.attrs.href
    } else if (
      mark.type === 'bold' ||
      mark.type === 'italic' ||
      mark.type === 'strike' ||
      mark.type === 'code'
    ) {
      marks[mark.type] = true
    }
  }
  return marks
}

function toSegments(nodes: JSONContent[]): Segment[] {
  const segments: Segment[] = []
  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      segments.push({ text: node.text, marks: nodeMarks(node) })
    } else if (node.type === 'mention') {
      const label = String(node.attrs?.label ?? node.attrs?.id ?? '')
      if (label) {
        segments.push({
          text: `@[${label}]`,
          mention: true,
          marks: nodeMarks(node),
        })
      }
    }
  }
  return segments
}

function inlineMarkdown(nodes: JSONContent[]): string {
  const segments = toSegments(nodes)
  const plain = render(segments, 0, false)
  if (sameReading(plain, segments)) return plain
  return render(segments, 0, true)
}

const ESCAPE = /[\\`*_~[\]]/g

/**
 * Inline Markdown for segments, one mark per level, outermost first. before
 * and after are the characters just outside these segments, which decide
 * whether a marker would sit inside a word.
 */
function render(
  segments: Segment[],
  level: number,
  escape: boolean,
  before = '',
  after = ''
): string {
  if (level === ORDER.length) {
    return segments
      .map((segment) =>
        segment.mention || !escape
          ? segment.text
          : segment.text.replace(ESCAPE, '\\$&')
      )
      .join('')
  }

  const mark = ORDER[level]
  const key = (segment: Segment) =>
    mark === 'link'
      ? (segment.marks.link ?? '')
      : segment.marks[mark]
        ? '1'
        : ''

  let out = ''
  let index = 0
  while (index < segments.length) {
    const groupKey = key(segments[index])
    let end = index
    while (end < segments.length && key(segments[end]) === groupKey) end++
    const group = segments.slice(index, end)

    const groupBefore = segments[index - 1]?.text.slice(-1) ?? before
    const groupAfter = segments[end]?.text[0] ?? after
    if (!groupKey) {
      out += render(group, level + 1, escape, groupBefore, groupAfter)
    } else if (mark === 'code') {
      out += codeSpan(group.map((segment) => segment.text).join(''))
    } else {
      const inner = render(group, level + 1, escape, groupBefore, groupAfter)
      out += wrap(inner, mark, groupKey, groupBefore, groupAfter)
    }
    index = end
  }
  return out
}

function wrap(
  inner: string,
  mark: MarkName,
  href: string,
  before: string,
  after: string
): string {
  // Markers must touch text: spaces at either end move outside them.
  const lead = /^\s*/.exec(inner)![0]
  const core = inner.slice(lead.length).trimEnd()
  const trail = inner.slice(lead.length + core.length)
  if (!core) return inner

  if (mark === 'link') return `${lead}[${core}](${href})${trail}`

  if (mark === 'italic') {
    // `_` cannot open or close inside a word in the stored format, so
    // italics on part of a word are dropped rather than written as stray
    // underscores.
    const touchesWord =
      (!lead && WORD.test(before)) || (!trail && WORD.test(after))
    if (touchesWord) return inner
  }

  const marker = mark === 'bold' ? '**' : mark === 'italic' ? '_' : '~~'
  return `${lead}${marker}${core}${marker}${trail}`
}

function codeSpan(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length)
  )
  const fence = '`'.repeat(longest + 1)
  // One space of padding keeps a backtick at either end out of the fence;
  // the parser strips it again.
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

// ---------------------------------------------------------------------------
// Checking a line reads back as written

/** Each character of the text, with a key for the marks it carries. */
function characterKeys(segments: Segment[]): [string, string[]] {
  let text = ''
  const keys: string[] = []
  for (const segment of segments) {
    text += segment.text
    for (const char of segment.text) {
      keys.push(markKey(segment.marks, char))
    }
  }
  return [text, keys]
}

function markKey(marks: Marks, char: string): string {
  // Spaces move outside markers when written, so their marks do not count.
  if (/\s/.test(char)) return ''
  return [
    marks.link ? `link:${marks.link}` : '',
    marks.bold ? 'b' : '',
    marks.italic ? 'i' : '',
    marks.strike ? 's' : '',
    marks.code ? 'c' : '',
  ].join('|')
}

function parsedSegments(nodes: FormattedInline[], marks: Marks): Segment[] {
  const out: Segment[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push({ text: node.text, marks })
        break
      case 'code':
        out.push({ text: node.text, marks: { code: true } })
        break
      case 'strong':
        out.push(...parsedSegments(node.children, { ...marks, bold: true }))
        break
      case 'emphasis':
        out.push(...parsedSegments(node.children, { ...marks, italic: true }))
        break
      case 'strike':
        out.push(...parsedSegments(node.children, { ...marks, strike: true }))
        break
      case 'link':
        out.push(
          ...parsedSegments(node.children, { ...marks, link: node.href })
        )
        break
    }
  }
  return out
}

function sameReading(markdown: string, segments: Segment[]): boolean {
  const [text, keys] = characterKeys(segments)
  const [readText, readKeys] = characterKeys(
    parsedSegments(parseInline(markdown), {})
  )
  if (text !== readText) return false
  // Italics inside a word are dropped on purpose (see wrap), so a character
  // that reads back without its italic still matches.
  return keys.every(
    (key, index) =>
      key === readKeys[index] || withoutItalic(key) === readKeys[index]
  )
}

function withoutItalic(key: string): string {
  const parts = key.split('|')
  if (parts.length === 5) parts[2] = ''
  return parts.join('|')
}
