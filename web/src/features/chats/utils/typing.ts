// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useState } from 'react'

// Who is typing in each conversation, from the typing events the websocket
// brings. Each stands for the server's typing window from when it came, or
// for as long as the event holds it where another network says when typing
// stops, and goes at once when that member's message arrives or they stop.
const WINDOW = 8000

interface Typist {
  name: string
  until: number
}

const typists = new Map<string, Map<string, Typist>>()
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

export function typingAdd(
  chat: string,
  member: string,
  name: string,
  held?: number
) {
  let members = typists.get(chat)
  if (!members) {
    members = new Map()
    typists.set(chat, members)
  }
  members.set(member, {
    name,
    until: Date.now() + (held && held > 0 ? held * 1000 : WINDOW),
  })
  changed()
}

export function typingClear(chat: string, member: string) {
  if (typists.get(chat)?.delete(member)) changed()
}

export function typingNames(chat: string, now = Date.now()): string[] {
  const members = typists.get(chat)
  if (!members) return []
  return [...members.values()]
    .filter((typist) => typist.until > now)
    .map((typist) => typist.name)
}

// The names of the members typing in a conversation, kept current as events
// come and windows lapse.
export function useTyping(chat?: string): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (!chat) {
      setNames([])
      return undefined
    }
    const update = () => setNames(typingNames(chat))
    update()
    listeners.add(update)
    const timer = window.setInterval(update, 1000)
    return () => {
      listeners.delete(update)
      window.clearInterval(timer)
    }
  }, [chat])
  return names
}
