import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  getErrorMessage,
  toast,
  Skeleton,
  PersonPicker,
  GeneralError,
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
  const [friendsPickerOpen, setFriendsPickerOpen] = useState(false)

  const handleOpenChat = (chatId: string) => {
    onOpenChange(false)
    navigate({ to: '/$chatId', params: { chatId } })
  }

  const { data, isLoading, error, refetch } = useNewChatFriendsQuery({
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
  const hasExistingDirectChat =
    selectedFriends.length === 1 && existingChats.length === 1
  const canSubmit =
    selectedFriends.length > 0 &&
    isChatNameValid &&
    !hasExistingDirectChat &&
    !createChatMutation.isPending

  const handleCreateChat = () => {
    if (selectedFriends.length === 0) {
      toast.error('Please select at least one friend')
      return
    }

    if (hasExistingDirectChat) {
      toast.error('You already have a chat with this friend')
      return
    }

    if (!trimmedChatName) {
      toast.error('Please provide a chat name')
      return
    }

    createChatMutation.mutate({
      members: selectedFriends.join(','),
      name: trimmedChatName,
    })
  }

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFriends([])
      setChatName('')
      setFriendsPickerOpen(false)
    }
  }, [open])

  // Auto-open friends picker when dialog opens and friends are loaded
  useEffect(() => {
    if (open && !isLoading && friends.length > 0) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => setFriendsPickerOpen(true), 50)
      return () => clearTimeout(timer)
    }
  }, [open, isLoading, friends.length])

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='sm:max-w-[520px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='flex items-center gap-2'>
            <MessageCircle className='size-5' />
            New chat
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            Create a new chat
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-4'>
          {/* Friend Picker */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Friends</label>
            {isLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : error ? (
              <GeneralError error={error} minimal mode='inline' reset={refetch} />
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
                open={friendsPickerOpen}
                onOpenChange={setFriendsPickerOpen}
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
            />
          </div>
        </div>

        <ResponsiveDialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={createChatMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateChat} disabled={!canSubmit}>
            {createChatMutation.isPending ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <MessageCircle className='size-4' />
            )}
            {createChatMutation.isPending ? 'Creating...' : 'Create chat'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
