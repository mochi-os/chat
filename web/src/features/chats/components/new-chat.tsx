import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Checkbox,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  getErrorMessage,
  toast,
  Skeleton,
} from '@mochi/common'
import { Loader2, MessageCircle, Search, UserPlus, X } from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState('')

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

  // Auto-fill chat name based on selected friends
  useEffect(() => {
    if (selectedFriends.length === 0) {
      setChatName('')
      return
    }

    const selectedNames = selectedFriends
      .map((id) => friends.find((f) => f.id === id)?.name)
      .filter(Boolean) as string[]

    if (selectedFriends.length === 1) {
      // Just the friend's name for 1-on-1 chat
      setChatName(selectedNames[0] || '')
    } else {
      // Include my name for group chats
      const allNames = myName ? [...selectedNames, myName] : selectedNames
      setChatName(allNames.join(', '))
    }
  }, [selectedFriends, friends, myName])

  const filteredFriends = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return friends
    return friends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(query) ||
        friend.identity?.toLowerCase().includes(query)
    )
  }, [friends, searchQuery])

  const handleToggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    )
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
      setSearchQuery('')
    }
  }, [open])

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[650px]'>
        <ResponsiveDialogHeader className='shrink-0 border-b px-6 pt-6 pb-4'>
          <div className='flex items-start justify-between gap-4'>
            <div className='flex-1'>
              <ResponsiveDialogTitle className='text-2xl font-semibold'>
                New chat
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className='sr-only'>
                Create a new chat
              </ResponsiveDialogDescription>
            </div>
          </div>

          {/* Search Input */}
          <div className='mt-4'>
            <div className='relative'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                placeholder='Search friends...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='h-9 pr-9 pl-9'
              />
              {searchQuery && (
                <Button
                  variant='ghost'
                  size='xs'
                  className='absolute top-1/2 right-1 aspect-square p-0 -translate-y-1/2'
                  onClick={() => setSearchQuery('')}
                >
                  <X className='h-3.5 w-3.5' />
                </Button>
              )}
            </div>
          </div>
        </ResponsiveDialogHeader>

        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          {/* Friends List - Scrollable */}
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4'>
            <div className='flex flex-1 flex-col overflow-hidden rounded-lg border'>
              <div className='flex-1 overflow-y-auto p-2'>
                {isLoading && (
                  <div className='space-y-2'>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className='flex items-center gap-3 p-2.5'>
                        <Skeleton className='size-4 rounded-sm' />
                        <Skeleton className='h-4 w-32' />
                      </div>
                    ))}
                  </div>
                )}

                {isError && (
                  <div className='flex flex-col items-center justify-center py-12 text-center'>
                    <p className='text-destructive mb-1 text-sm font-medium'>
                      Failed to load friends
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      Please try again later
                    </p>
                  </div>
                )}

                {!isLoading && !isError && filteredFriends.length === 0 && (
                  <div className='flex flex-col items-center justify-center py-12 text-center'>
                    <UserPlus className='text-muted-foreground mb-3 h-12 w-12 opacity-50' />
                    <p className='text-muted-foreground text-sm font-medium'>
                      {searchQuery ? 'No friends found' : 'No friends yet'}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {searchQuery
                        ? 'Try a different search term'
                        : 'Add friends to start chatting'}
                    </p>
                  </div>
                )}

                {!isLoading && !isError && filteredFriends.length > 0 && (
                  <div className='space-y-4'>
                    {(() => {
                      const friendsWithoutChat = filteredFriends.filter(
                        (f) => !f.chatId
                      )
                      const friendsWithChat = filteredFriends.filter(
                        (f) => f.chatId
                      )

                      return (
                        <>
                          {friendsWithoutChat.length > 0 && (
                            <div className='space-y-0.5'>
                              {friendsWithChat.length > 0 && (
                                <div className='text-muted-foreground mb-1 px-2 py-1 text-xs font-semibold'>
                                  Start a new chat
                                </div>
                              )}
                              {friendsWithoutChat.map((friend) => {
                                const isSelected = selectedFriends.includes(
                                  friend.id
                                )
                                return (
                                  <div
                                    key={friend.id}
                                    onClick={() =>
                                      handleToggleFriend(friend.id)
                                    }
                                    className='hover:bg-accent hover:text-accent-foreground group flex cursor-pointer items-center gap-3 rounded-md p-2.5 transition-colors'
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() =>
                                        handleToggleFriend(friend.id)
                                      }
                                      className='shrink-0'
                                    />
                                    <span className='truncate text-sm font-medium'>
                                      {friend.name}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {friendsWithChat.length > 0 && (
                            <div className='space-y-0.5'>
                              {friendsWithoutChat.length > 0 && (
                                <div className='text-muted-foreground mt-2 mb-1 px-2 py-1 text-xs font-semibold'>
                                  Existing conversations
                                </div>
                              )}
                              {friendsWithChat.map((friend) => (
                                <div
                                  key={friend.id}
                                  onClick={() => handleToggleFriend(friend.id)}
                                  className='hover:bg-accent hover:text-accent-foreground group flex cursor-pointer items-center gap-3 rounded-md p-2.5 transition-colors'
                                >
                                  <Checkbox
                                    checked={selectedFriends.includes(
                                      friend.id
                                    )}
                                    onCheckedChange={() =>
                                      handleToggleFriend(friend.id)
                                    }
                                    className='shrink-0'
                                  />
                                  <span className='truncate text-sm font-medium'>
                                    {friend.name}
                                  </span>
                                  <Button
                                    variant='secondary'
                                    size='xs'
                                    className='ml-auto'
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleOpenChat(friend.chatFingerprint ?? friend.chatId!)
                                    }}
                                  >
                                    <MessageCircle className='mr-1.5 h-3 w-3' />
                                    Open chat
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className='bg-background shrink-0 space-y-4 border-t px-6 py-4'>
          <Input
            id='chat-name'
            placeholder='Chat name...'
            value={chatName}
            onChange={(e) => setChatName(e.target.value)}
            required
            aria-invalid={!isChatNameValid}
          />
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
