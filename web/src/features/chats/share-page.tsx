// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// Where another app's "Send in a chat" lands: a choice of the user's chats,
// or a new one. The chat chosen opens with its message box holding what was
// shared, after any draft it already had; nothing is sent until the user
// sends it. Cancelling goes back to where they came from.
import { useMemo, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EmptyState,
  EntityAvatar,
  GeneralError,
  Main,
  PageHeader,
  SearchInput,
  Skeleton,
  isInShell,
  shareMessage,
  shareRead,
  shellNavigateBack,
  usePageTitle,
} from '@mochi/web'
import { Globe, MessageCircle, Plus, Users } from 'lucide-react'
import { personAssetUrl } from '@/api/person'
import { chatActive, type Chat } from '@/api/types/chats'
import { useSidebarContext } from '@/context/sidebar-context'
import { getDraft, setDraft } from '@/hooks/useChatStorage'
import { useChatsQuery } from '@/hooks/useChats'
import { chatIsDirect, chatMatchesSearch } from './utils/chat-filter'

/** A chat's draft with what was shared after it, a blank line between. */
export function sharedDraft(draft: string | null, message: string): string {
  const kept = (draft ?? '').trimEnd()
  return kept ? `${kept}\n\n${message}` : message
}

function ChatAvatar({ chat }: { chat: Chat }) {
  if (chat.account) return <EntityAvatar icon={Globe} size='lg' />
  if (chatIsDirect(chat) && chat.other) {
    return (
      <EntityAvatar
        src={personAssetUrl(chat.other, 'avatar')}
        styleUrl={personAssetUrl(chat.other, 'style')}
        name={chat.name}
        size='lg'
      />
    )
  }
  return <EntityAvatar icon={Users} size='lg' />
}

export function SharePage() {
  const { t } = useLingui()
  usePageTitle(t`Send in a chat`)
  const navigate = useNavigate()
  const router = useRouter()
  const { isChatPinned, openNewChatFor, setChatDraftPresent } =
    useSidebarContext()
  const chatsQuery = useChatsQuery()
  const [search, setSearch] = useState('')
  const [opening, setOpening] = useState(false)

  // Read once: what was shared does not change while the page is open.
  const [message] = useState(() =>
    shareMessage(shareRead(window.location.search))
  )

  // The chats a message may be written in, as the sidebar orders them:
  // pinned first, then the most recent.
  const chats = useMemo(
    () =>
      (chatsQuery.data?.chats ?? [])
        .filter((chat) => chatActive(chat) && chatMatchesSearch(chat, search))
        .sort((a, b) => {
          const pinned = Number(isChatPinned(b.id)) - Number(isChatPinned(a.id))
          return pinned || b.updated - a.updated
        }),
    [chatsQuery.data?.chats, search, isChatPinned]
  )

  // The chat's draft holds the message once it opens; the chat page restores
  // it into the message box.
  const fill = async (chatId: string) => {
    setDraft(chatId, sharedDraft(await getDraft(chatId), message))
    setChatDraftPresent(chatId, true)
  }

  const choose = async (chatId: string) => {
    if (opening) return
    setOpening(true)
    await fill(chatId)
    void navigate({ to: '/$chatId', params: { chatId }, replace: true })
  }

  const cancel = () => {
    // Back to the app the share came from. A page reached from another app
    // starts this frame's history afresh, so the window's own history says
    // whether there is anywhere to go back to; with nowhere, Chat's home.
    if (router.history.canGoBack() || window.history.length > 1) {
      if (isInShell()) shellNavigateBack()
      else router.history.back()
      return
    }
    void navigate({ to: '/', replace: true })
  }

  const newChat = (
    <Button variant='outline' onClick={() => openNewChatFor(fill)}>
      <Plus className='size-4' />
      <Trans>New chat</Trans>
    </Button>
  )

  const all = chatsQuery.data?.chats ?? []

  return (
    <>
      <PageHeader
        title={t`Send in a chat`}
        icon={<MessageCircle className='size-4 md:size-5' />}
        back={{ label: t`Cancel`, onFallback: cancel }}
      />
      <Main className='space-y-4'>
        {chatsQuery.error ? (
          <GeneralError
            error={chatsQuery.error}
            minimal
            mode='inline'
            reset={() => void chatsQuery.refetch()}
          />
        ) : chatsQuery.isLoading ? (
          <div className='space-y-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : !all.some(chatActive) ? (
          <EmptyState icon={MessageCircle} title={t`No chats`}>
            {newChat}
          </EmptyState>
        ) : (
          <>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <SearchInput
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t`Search chats`}
                  clearLabel={t`Clear search`}
                />
              </div>
              {newChat}
            </div>
            <div className='space-y-1'>
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type='button'
                  disabled={opening}
                  onClick={() => void choose(chat.id)}
                  className='hover:bg-hover flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors'
                >
                  <ChatAvatar chat={chat} />
                  <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                    {chat.name}
                  </span>
                </button>
              ))}
              {chats.length === 0 && (
                <p className='text-muted-foreground px-2 py-4 text-sm'>
                  {t`No chats`}
                </p>
              )}
            </div>
          </>
        )}
      </Main>
    </>
  )
}
