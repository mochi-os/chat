import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquare, Search, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useNewChatFriendsQuery, useCreateChatMutation } from '@/hooks/useChats'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'

type NewChatProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewChat({ onOpenChange, open }: NewChatProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

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

  const friends = useMemo(() => data?.data?.friends ?? [], [data?.data?.friends])

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends
    const query = searchQuery.toLowerCase()
    return friends.filter((friend) =>
      friend.name.toLowerCase().includes(query)
    )
  }, [friends, searchQuery])

  const handleToggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    )
  }

  const handleCreateChat = () => {
    if (selectedFriends.length === 0) {
      toast.error('Please select at least one friend')
      return
    }

    const isGroup = selectedFriends.length > 1
    const chatName = isGroup && groupName ? groupName : ''

    createChatMutation.mutate({
      participantIds: selectedFriends,
      name: chatName,
    })
  }

  useEffect(() => {
    if (!open) {
      setSelectedFriends([])
      setGroupName('')
      setSearchQuery('')
    }
  }, [open])

  const isGroup = selectedFriends.length > 1
  const canSubmit = selectedFriends.length > 0 && !createChatMutation.isPending

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[650px]'>
        <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
          <ResponsiveDialogTitle className='text-2xl font-semibold'>
            New Chat
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='text-muted-foreground mt-1 text-sm'>
            Select friends to start a conversation
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 px-6 py-4'>
          {/* Search Input */}
          <div className='space-y-2'>
            <Label className='flex items-center gap-1.5 text-sm font-medium'>
              <Search className='h-4 w-4' />
              Search Friends
            </Label>
            <div className='relative'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform' />
              <Input
                placeholder='Search by name...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='h-10 pl-9'
              />
            </div>
          </div>

          {/* Group Name Input (only show if multiple friends selected) */}
          {isGroup && (
            <div className='space-y-2'>
              <Label htmlFor='group-name' className='flex items-center gap-1.5 text-sm font-medium'>
                <Users className='h-4 w-4' />
                Group Name <span className='text-muted-foreground font-normal'>(optional)</span>
              </Label>
              <Input
                id='group-name'
                placeholder='Enter group name...'
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className='h-10'
              />
            </div>
          )}

          {/* Selected Friends Badge */}
          {selectedFriends.length > 0 && (
            <div className='flex items-center gap-2'>
              <Badge variant='secondary' className='text-sm'>
                {selectedFriends.length} {selectedFriends.length === 1 ? 'friend' : 'friends'} selected
              </Badge>
            </div>
          )}

          {/* Friends List */}
          <ScrollArea className='flex-1 rounded-lg border'>
            <div className='p-2 min-h-[300px]'>
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
                <div className='space-y-1'>
                  {filteredFriends.map((friend) => {
                    const isSelected = selectedFriends.includes(friend.id)
                    return (
                      <div
                        key={friend.id}
                        onClick={() => handleToggleFriend(friend.id)}
                        className='flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-all hover:bg-accent hover:text-accent-foreground group'
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleFriend(friend.id)}
                          className='shrink-0'
                        />
                        <Avatar className='h-10 w-10 shrink-0'>
                          <AvatarImage
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.name}`}
                          />
                          <AvatarFallback className='from-primary to-primary/60 text-primary-foreground bg-gradient-to-br font-semibold'>
                            {friend.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex min-w-0 flex-1 flex-col'>
                          <span className='truncate text-sm font-medium'>
                            {friend.name}
                          </span>
                          <span className='text-muted-foreground truncate text-xs'>
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

        <div className='bg-muted/30 flex items-center justify-between gap-3 border-t px-6 py-4'>
          <div className='text-muted-foreground text-sm'>
            {selectedFriends.length > 0 ? (
              <span>
                Ready to create{' '}
                {isGroup ? (
                  <>
                    a <span className='text-foreground font-medium'>group chat</span>
                  </>
                ) : (
                  <>
                    a <span className='text-foreground font-medium'>direct chat</span>
                  </>
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
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateChat}
              disabled={!canSubmit}
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
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
