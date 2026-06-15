import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EntityAvatar,
  GeneralError,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Skeleton,
  cn,
  getErrorMessage,
  toast,
} from '@mochi/web'
import { Forward, Loader2, MessageCircle, Search } from 'lucide-react'
import { useChatsQuery, useForwardMessagesMutation } from '@/hooks/useChats'
import { chatActive } from '@/api/types/chats'

interface ForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceChatId: string
  messageIds: string[]
  onForwarded?: (toChat: string) => void
}

export function ForwardDialog({
  open,
  onOpenChange,
  sourceChatId,
  messageIds,
  onForwarded,
}: ForwardDialogProps) {
  const { t } = useLingui()
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const chatsQuery = useChatsQuery({ enabled: open })
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

  // Eligible destinations: active chats other than the source.
  const destinations = useMemo(() => {
    const chats = chatsQuery.data?.chats ?? []
    const query = filter.trim().toLowerCase()
    return chats
      .filter((c) => c.id !== sourceChatId && chatActive(c))
      .filter((c) => (query ? c.name.toLowerCase().includes(query) : true))
  }, [chatsQuery.data?.chats, sourceChatId, filter])

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setSelectedChatId(null)
      setFilter('')
    }
  }, [open])

  const handleForward = () => {
    if (!selectedChatId || messageIds.length === 0) return
    forwardMutation.mutate({
      chatId: sourceChatId,
      messageIds,
      toChat: selectedChatId,
    })
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
            <Trans>Choose a chat to forward the selected messages to</Trans>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-3'>
          <div className='relative'>
            <Search className='text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2' />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t`Search chats…`}
              className='ps-8'
            />
          </div>

          <div className='max-h-72 space-y-1 overflow-y-auto'>
            {chatsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full rounded-lg' />
              ))
            ) : chatsQuery.error ? (
              <GeneralError
                error={chatsQuery.error}
                minimal
                mode='inline'
                reset={chatsQuery.refetch}
              />
            ) : destinations.length === 0 ? (
              <div className='flex flex-col items-center justify-center px-4 py-8 text-center'>
                <MessageCircle className='text-muted-foreground mb-2 size-8 opacity-50' />
                <p className='text-muted-foreground text-sm'>
                  <Trans>No chats to forward to</Trans>
                </p>
              </div>
            ) : (
              destinations.map((chat) => {
                const isSelected = selectedChatId === chat.id
                return (
                  <button
                    key={chat.id}
                    type='button'
                    onClick={() => setSelectedChatId(chat.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors',
                      isSelected
                        ? 'bg-primary/10 ring-primary/40 ring-1'
                        : 'hover:bg-muted'
                    )}
                  >
                    {chat.members === 2 && chat.other ? (
                      <EntityAvatar
                        src={`/people/${chat.other}/-/avatar`}
                        styleUrl={`/people/${chat.other}/-/style`}
                        size='lg'
                      />
                    ) : (
                      <span className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-full'>
                        <MessageCircle className='text-muted-foreground size-4' />
                      </span>
                    )}
                    <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                      {chat.name}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <ResponsiveDialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={forwardMutation.isPending}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedChatId || forwardMutation.isPending}
          >
            {forwardMutation.isPending ? (
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
