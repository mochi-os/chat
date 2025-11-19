import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquare, Search, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useNewChatFriendsQuery, useCreateChatMutation } from '@/hooks/useChats'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FacelessAvatar } from '@/components/faceless-avatar'

type NewChatProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewChat({ onOpenChange, open }: NewChatProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [chatName, setChatName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const { data, isLoading, isError } = useNewChatFriendsQuery({
    enabled: open,
  })

  const createChatMutation = useCreateChatMutation({
    onSuccess: () => {
      toast.success('Chat created successfully!')
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error('Failed to create chat', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const friends = useMemo(
    () => data?.data?.friends ?? [],
    [data?.data?.friends]
  )

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends
    const query = searchQuery.toLowerCase()
    return friends.filter((friend) => friend.name.toLowerCase().includes(query))
  }, [friends, searchQuery])

  const handleToggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    )
  }

  const trimmedChatName = chatName.trim()
  const isGroup = selectedFriends.length > 1
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
      setShowSearch(false)
    }
  }, [open])

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[650px]'>
        <ResponsiveDialogHeader className='shrink-0 border-b px-6 pt-6 pb-4'>
          <div className='flex items-start justify-between gap-4'>
            <div className='flex-1'>
              <ResponsiveDialogTitle className='text-2xl font-semibold'>
                New Chat
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className='text-muted-foreground mt-1.5 text-sm'>
                Select friends to start a conversation
              </ResponsiveDialogDescription>
            </div>
            <Button
              variant='ghost'
              size='icon'
              className='mr-8 h-8 w-8 shrink-0'
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search className='h-4 w-4' />
            </Button>
          </div>

          {/* Search Input - Toggleable */}
          {showSearch && (
            <div className='mt-4'>
              <div className='relative'>
                <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                <Input
                  placeholder='Search by name...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='h-9 pr-9 pl-9'
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    variant='ghost'
                    size='icon'
                    className='absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2'
                    onClick={() => setSearchQuery('')}
                  >
                    <X className='h-3.5 w-3.5' />
                  </Button>
                )}
              </div>
            </div>
          )}
        </ResponsiveDialogHeader>

        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          {/* Chat Name Input - Always required */}
          <div className='bg-muted/30 shrink-0 border-b px-6 py-3'>
            <div className='flex items-center gap-2'>
              <MessageSquare className='text-muted-foreground h-4 w-4 shrink-0' />
              <Input
                id='chat-name'
                placeholder='Enter chat name...'
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                className='h-9'
                required
                aria-invalid={!isChatNameValid}
              />
            </div>
          </div>

          {/* Selected Friends Badge */}
          {selectedFriends.length > 0 && (
            <div className='bg-muted/30 shrink-0 border-b px-6 py-2.5'>
              <Badge variant='secondary' className='text-xs'>
                {selectedFriends.length}{' '}
                {selectedFriends.length === 1 ? 'friend' : 'friends'} selected
              </Badge>
            </div>
          )}

          {/* Friends List - Scrollable */}
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4'>
            <div className='flex-1 overflow-hidden rounded-lg border'>
              <ScrollArea className='h-full'>
                <div className='p-2'>
                  {isLoading && (
                    <div className='flex items-center justify-center py-12'>
                      <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
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
                    <div className='space-y-0.5'>
                      {filteredFriends.map((friend) => {
                        const isSelected = selectedFriends.includes(friend.id)
                        const avatarSeed =
                          friend.identity || friend.name || friend.id
                        return (
                          <div
                            key={friend.id}
                            onClick={() => handleToggleFriend(friend.id)}
                            className='hover:bg-accent hover:text-accent-foreground group flex cursor-pointer items-center gap-3 rounded-md p-2.5 transition-colors'
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                handleToggleFriend(friend.id)
                              }
                              className='shrink-0'
                            />
                            <FacelessAvatar
                              seed={avatarSeed}
                              name={friend.name}
                              size={36}
                              className='h-9 w-9'
                            />
                            <div className='flex min-w-0 flex-1 flex-col'>
                              <span className='truncate text-sm leading-tight font-medium'>
                                {friend.name}
                              </span>
                              <span className='text-muted-foreground truncate text-xs leading-tight'>
                                {friend.identity}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className='bg-background shrink-0 border-t px-6 py-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='text-muted-foreground text-sm'>
              {selectedFriends.length > 0 ? (
                <span>
                  Ready to create{' '}
                  {isGroup ? (
                    <span className='text-foreground font-medium'>
                      group chat
                    </span>
                  ) : (
                    <span className='text-foreground font-medium'>
                      direct chat
                    </span>
                  )}
                </span>
              ) : (
                <span>Select friends to continue</span>
              )}
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={createChatMutation.isPending}
                className='min-w-[80px]'
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateChat}
                disabled={!canSubmit}
                className='min-w-[120px]'
              >
                {createChatMutation.isPending ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Creating...
                  </>
                ) : (
                  <>
                    <MessageSquare className='mr-2 h-4 w-4' />
                    Create Chat
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
