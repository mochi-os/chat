import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  getErrorMessage,
  toast,
  Skeleton,
  PersonPicker,
  type Person,
} from '@mochi/common'
import { Loader2, MessageCircle, UserPlus } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { useNewChatFriendsQuery, useCreateChatMutation } from '@/hooks/useChats'

export function NewChat() {
  const navigate = useNavigate()
  const { newChatDialogOpen: open, closeNewChatDialog } = useSidebarContext()
  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) closeNewChatDialog()
  }
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [chatName, setChatName] = useState('')

  const handleOpenChat = (chatId: string) => {
    onOpenChange(false)
    navigate({ to: '/$chatId', params: { chatId } })
  }

  const { data, isLoading, isError } = useNewChatFriendsQuery({
    enabled: open,
  })

  const createChatMutation = useCreateChatMutation({
    onSuccess: (data) => {
      onOpenChange(false)
      if (data.id) {
        navigate({ to: '/$chatId', params: { chatId: data.fingerprint ?? data.id } })
        toast.success('Chat ready')
      } else {
        toast.success('Chat created')
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create chat'))
    },
  })

  const friends = useMemo(() => data?.friends ?? [], [data?.friends])

  const myName = data?.name

  // Convert friends to Person format for PersonPicker
  const friendsAsPeople: Person[] = useMemo(
    () => friends.map((f) => ({ id: f.id, name: f.name })),
    [friends]
  )

  // Check if any selected friends have existing chats
  const existingChats = useMemo(() => {
    return selectedFriends
      .map((id) => friends.find((f) => f.id === id))
      .filter((f) => f?.chatId)
      .map((f) => ({
        id: f!.id,
        name: f!.name,
        chatId: f!.chatFingerprint ?? f!.chatId!,
      }))
  }, [selectedFriends, friends])

  // Auto-fill chat name based on selected friends (alphabetical order)
  useEffect(() => {
    if (selectedFriends.length === 0) {
      setChatName('')
      return
    }

    const selectedNames = selectedFriends
      .map((id) => friends.find((f) => f.id === id)?.name)
      .filter(Boolean) as string[]

    if (selectedFriends.length === 1) {
      setChatName(selectedNames[0] || '')
    } else {
      const allNames = myName ? [...selectedNames, myName] : selectedNames
      allNames.sort((a, b) => a.localeCompare(b))
      setChatName(allNames.join(', '))
    }
  }, [selectedFriends, friends, myName])

  const handleFriendsChange = (value: string | string[]) => {
    setSelectedFriends(value as string[])
  }

  const trimmedChatName = chatName.trim()
  const isChatNameValid = Boolean(trimmedChatName)
  const canSubmit =
    selectedFriends.length > 0 &&
    isChatNameValid &&
    !createChatMutation.isPending

  const handleCreateChat = () => {
    if (selectedFriends.length === 0) {
      toast.error('Please select at least one friend')
      return
    }

    if (!trimmedChatName) {
      toast.error('Please provide a chat name')
      return
    }

    createChatMutation.mutate({
      participantIds: selectedFriends,
      name: trimmedChatName,
    })
  }

  useEffect(() => {
    if (!open) {
      setSelectedFriends([])
      setChatName('')
    }
  }, [open])

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]'>
        <ResponsiveDialogHeader className='shrink-0 border-b px-6 pt-6 pb-4'>
          <ResponsiveDialogTitle className='text-2xl font-semibold'>
            New chat
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            Create a new chat
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='flex-1 space-y-4 px-6 py-4'>
          {/* Friend Picker */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Friends</label>
            {isLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : isError ? (
              <div className='text-destructive text-sm'>Failed to load friends</div>
            ) : friends.length === 0 ? (
              <div className='flex flex-col items-center justify-center rounded-lg border py-8 text-center'>
                <UserPlus className='text-muted-foreground mb-3 h-10 w-10 opacity-50' />
                <p className='text-muted-foreground text-sm font-medium'>No friends yet</p>
                <p className='text-muted-foreground mt-1 text-xs'>Add friends to start chatting</p>
              </div>
            ) : (
              <PersonPicker
                mode='multiple'
                value={selectedFriends}
                onChange={handleFriendsChange}
                local={friendsAsPeople}
                placeholder='Select friends...'
                emptyMessage='No friends found'
              />
            )}
          </div>

          {/* Existing conversations notice */}
          {existingChats.length > 0 && (
            <div className='rounded-lg border bg-muted/50 p-3'>
              <p className='text-muted-foreground mb-2 text-xs font-medium'>
                You already have chats with:
              </p>
              <div className='space-y-1'>
                {existingChats.map((chat) => (
                  <div key={chat.id} className='flex items-center justify-between'>
                    <span className='text-sm'>{chat.name}</span>
                    <Button
                      variant='ghost'
                      size='xs'
                      onClick={() => handleOpenChat(chat.chatId)}
                    >
                      <MessageCircle className='mr-1.5 h-3 w-3' />
                      Open
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Name */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Chat name</label>
            <Input
              id='chat-name'
              placeholder='Chat name...'
              value={chatName}
              onChange={(e) => setChatName(e.target.value)}
              required
              aria-invalid={!isChatNameValid}
            />
          </div>
        </div>

        <div className='bg-background shrink-0 border-t px-6 py-4'>
          <div className='flex items-center justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={createChatMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateChat} disabled={!canSubmit}>
              {createChatMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Creating...
                </>
              ) : (
                <>
                  <MessageCircle className='mr-2 h-4 w-4' />
                  Create chat
                </>
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
