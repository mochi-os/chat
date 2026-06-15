import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EntityAvatar,
  GeneralError,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  SearchInput,
  Skeleton,
  cn,
  getErrorMessage,
  toast,
} from '@mochi/web'
import { Forward, Loader2, MessageCircle, Users } from 'lucide-react'
import {
  useChatsQuery,
  useForwardMessagesMutation,
  useNewChatFriendsQuery,
  useCreateChatMutation,
} from '@/hooks/useChats'
import { chatActive } from '@/api/types/chats'

interface ForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceChatId: string
  messageIds: string[]
  onForwarded?: (toChat: string) => void
}

type Destination =
  | { kind: 'chat'; id: string; name: string; other?: string; members: number }
  | { kind: 'friend'; id: string; name: string }

export function ForwardDialog({
  open,
  onOpenChange,
  sourceChatId,
  messageIds,
  onForwarded,
}: ForwardDialogProps) {
  const { t } = useLingui()
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null)
  const [filter, setFilter] = useState('')

  const chatsQuery = useChatsQuery({ enabled: open })
  const friendsQuery = useNewChatFriendsQuery({ enabled: open })

  const createChatMutation = useCreateChatMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to create chat`))
    },
  })

  const forwardMutation = useForwardMessagesMutation({
    onSuccess: (data) => {
      toast.success(t`Forwarded`)
      onForwarded?.(data.to_chat)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to forward`))
    },
  })

  // Eligible destinations, kept in two groups: existing active chats (excluding
  // the source) and friends without an existing direct chat yet.
  const { chatDests, friendDests } = useMemo(() => {
    const chats = chatsQuery.data?.chats ?? []
    const friends = friendsQuery.data?.friends ?? []
    const query = filter.trim().toLowerCase()

    const chatDests: Destination[] = chats
      .filter((c) => c.id !== sourceChatId && chatActive(c))
      .filter((c) => (query ? c.name.toLowerCase().includes(query) : true))
      .map((c) => ({
        kind: 'chat',
        id: c.id,
        name: c.name,
        other: c.other,
        members: c.members,
      }))

    const friendDests: Destination[] = friends
      .filter((f) => !f.chatId)
      .filter((f) => (query ? f.name.toLowerCase().includes(query) : true))
      .map((f) => ({ kind: 'friend', id: f.id, name: f.name }))

    return { chatDests, friendDests }
  }, [chatsQuery.data, friendsQuery.data, sourceChatId, filter])

  const hasDestinations = chatDests.length > 0 || friendDests.length > 0

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setSelectedDest(null)
      setFilter('')
    }
  }, [open])

  const handleForward = async () => {
    if (!selectedDest || messageIds.length === 0) return

    if (selectedDest.kind === 'chat') {
      forwardMutation.mutate({
        chatId: sourceChatId,
        messageIds,
        toChat: selectedDest.id,
      })
    } else {
      // No existing chat with this friend — create it first, then forward.
      try {
        const newChat = await createChatMutation.mutateAsync({
          members: selectedDest.id,
          name: selectedDest.name,
        })
        forwardMutation.mutate({
          chatId: sourceChatId,
          messageIds,
          toChat: newChat.fingerprint ?? newChat.id,
        })
      } catch {
        // Error already shown by createChatMutation onError.
      }
    }
  }

  const isLoading = chatsQuery.isLoading || friendsQuery.isLoading
  const queryError = chatsQuery.error ?? friendsQuery.error
  const isPending = createChatMutation.isPending || forwardMutation.isPending

  const renderDestination = (dest: Destination) => {
    const isSelected =
      selectedDest?.kind === dest.kind && selectedDest.id === dest.id
    return (
      <button
        key={`${dest.kind}-${dest.id}`}
        type='button'
        onClick={() => setSelectedDest(dest)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors',
          isSelected
            ? 'bg-primary/10 ring-primary/40 ring-1'
            : 'hover:bg-muted'
        )}
      >
        {dest.kind === 'friend' ? (
          <EntityAvatar
            src={`/people/${dest.id}/-/avatar`}
            styleUrl={`/people/${dest.id}/-/style`}
            name={dest.name}
            size='lg'
          />
        ) : dest.members === 2 && dest.other ? (
          <EntityAvatar
            src={`/people/${dest.other}/-/avatar`}
            styleUrl={`/people/${dest.other}/-/style`}
            name={dest.name}
            size='lg'
          />
        ) : (
          <EntityAvatar icon={Users} size='lg' />
        )}
        <span className='min-w-0 flex-1 truncate text-sm font-medium'>
          {dest.name}
        </span>
      </button>
    )
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='flex items-center gap-2'>
            <Forward className='size-5' />
            <Trans>Forward to…</Trans>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            <Trans>Choose a chat or friend to forward the selected messages to</Trans>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-3'>
          <SearchInput
            value={filter}
            onValueChange={setFilter}
            placeholder={t`Search chats…`}
            clearLabel={t`Clear search`}
          />

          <div className='max-h-72 space-y-1 overflow-y-auto px-1'>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full rounded-lg' />
              ))
            ) : queryError ? (
              <GeneralError
                error={queryError}
                minimal
                mode='inline'
                reset={() => {
                  chatsQuery.refetch()
                  friendsQuery.refetch()
                }}
              />
            ) : !hasDestinations ? (
              <div className='flex flex-col items-center justify-center px-4 py-8 text-center'>
                <MessageCircle className='text-muted-foreground mb-2 size-8 opacity-50' />
                <p className='text-muted-foreground text-sm'>
                  <Trans>No chats to forward to</Trans>
                </p>
              </div>
            ) : (
              <>
                {chatDests.length > 0 && (
                  <div className='space-y-1'>
                    <p className='text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium uppercase tracking-wide'>
                      <Trans>Chats</Trans>
                    </p>
                    {chatDests.map(renderDestination)}
                  </div>
                )}
                {friendDests.length > 0 && (
                  <div className='space-y-1'>
                    <p className='text-muted-foreground px-2 pt-2 pb-0.5 text-xs font-medium uppercase tracking-wide'>
                      <Trans>Friends</Trans>
                    </p>
                    {friendDests.map(renderDestination)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <ResponsiveDialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedDest || isPending}
          >
            {isPending ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Forward className='size-4' />
            )}
            <Trans>Forward</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
