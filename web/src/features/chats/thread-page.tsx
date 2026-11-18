// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  AuthenticatedLayout,
  ConfirmDialog,
  getErrorMessage,
  toastAction,
  useAuthStore,
  usePageTitle,
} from '@mochi/web'
import { Trash2 } from 'lucide-react'
import { chatActive } from '@/api/types/chats'
import { useChatWebsocket } from '@/hooks/useChatWebsocket'
import {
  chatKeys,
  useChatDetailQuery,
  useDeleteMessagesMutation,
} from '@/hooks/useChats'
import { ForwardDialog } from './components/forward-dialog'
import { ThreadView } from './components/thread-panel'
import { useThreadRoot } from './hooks/use-thread-root'

interface ThreadPageProps {
  chatId: string
  messageId: string
}

/**
 * A thread on its own page, as the thread panel's "Open in new window" opens
 * it: the user keeps the conversation in one window and the thread in this
 * one. It has the panel's replies and reply box, and the conversation's own
 * delete and forward.
 */
export function ThreadPage({ chatId, messageId }: ThreadPageProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { identity } = useAuthStore()
  const detail = useChatDetailQuery(chatId)
  const chat = detail.data?.chat
  const root = useThreadRoot(chatId, messageId)
  const [draft, setDraft] = useState('')
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [forwardIds, setForwardIds] = useState<string[] | null>(null)
  const remove = useDeleteMessagesMutation()

  usePageTitle(chat?.name ? t`Thread in ${chat.name}` : t`Thread`)

  // Live replies, edits and reactions, as on the conversation's page.
  useChatWebsocket(chat?.id, chat?.key, identity)

  const confirmDelete = async () => {
    if (!deleteIds?.length) return
    try {
      await toastAction(remove.mutateAsync({ chatId, messageIds: deleteIds }), {
        loading: t`Deleting...`,
        success: t`Message deleted`,
        error: (error) => getErrorMessage(error, t`Failed to delete`),
      })
      setDeleteIds(null)
      void queryClient.invalidateQueries({
        queryKey: chatKeys.threads(chatId),
      })
    } catch {
      // toastAction already showed the error.
    }
  }

  // The app's own layout with no sidebar, as home has: it tells the shell to
  // lay its menu across the top and pads the page clear of it, and puts in
  // the shell's link and clipboard handling. The thread sits in a reading
  // column, so a full-width window does not stretch it.
  return (
    <AuthenticatedLayout>
      <div className='bg-background flex h-full flex-col'>
        <header className='mx-auto flex w-full max-w-3xl shrink-0 items-baseline gap-2 border-b px-4 py-3 sm:px-6'>
          <h1 className='text-lg font-semibold'>
            <Trans>Thread</Trans>
          </h1>
          {chat?.name ? (
            <span className='text-muted-foreground min-w-0 truncate text-sm'>
              {chat.name}
            </span>
          ) : null}
        </header>
        <div className='mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col'>
          <ThreadView
            layout='page'
            chatId={chatId}
            rootId={messageId}
            root={root}
            currentUserIdentity={identity ?? ''}
            canWrite={chat ? chatActive(chat) : false}
            onForward={(message) => setForwardIds([message.id])}
            onDelete={(message) => setDeleteIds([message.id])}
            draft={draft}
            onDraftChange={setDraft}
          />
        </div>
      </div>
      <ConfirmDialog
        open={deleteIds !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteIds(null)
        }}
        title={plural(deleteIds?.length ?? 0, {
          1: 'Delete message?',
          other: 'Delete # messages?',
        })}
        desc={t`This deletes the message for everyone and cannot be undone.`}
        confirmText={t`Delete`}
        icon={<Trash2 className='size-4' />}
        destructive
        handleConfirm={confirmDelete}
        isLoading={remove.isPending}
      />
      <ForwardDialog
        open={forwardIds !== null}
        onOpenChange={(open) => {
          if (!open) setForwardIds(null)
        }}
        sourceChatId={chatId}
        messageIds={forwardIds ?? []}
        onForwarded={() => setForwardIds(null)}
      />
    </AuthenticatedLayout>
  )
}
