import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquare, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useNewChatFriendsQuery, useCreateChatMutation } from '@/hooks/useChats'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FacelessAvatar } from '@/components/faceless-avatar'

interface NewChatProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewChat({ onOpenChange, open }: NewChatProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [chatName, setChatName] = useState('')

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
    }
  }, [open])

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-[650px]'>
        <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
          <ResponsiveDialogTitle className='text-2xl font-semibold'>
            New Chat
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='text-muted-foreground mt-1.5 text-sm'>
            Name your conversation and choose who to invite
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 px-6 py-4'>
          <div className='space-y-2'>
            <Label className='text-sm font-medium'>Chat Name</Label>
            <Input
              id='chat-name'
              placeholder='Give this chat a name'
              value={chatName}
              onChange={(e) => setChatName(e.target.value)}
              className='h-11'
              required
              aria-invalid={!isChatNameValid}
            />
          </div>

          <div className='flex min-h-0 flex-1'>
            <ScrollArea className='flex-1 rounded-2xl border'>
              <div className='p-3'>
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

                {!isLoading && !isError && friends.length === 0 && (
                  <div className='flex flex-col items-center justify-center py-12 text-center'>
                    <UserPlus className='text-muted-foreground mb-3 h-12 w-12 opacity-50' />
                    <p className='text-muted-foreground text-sm font-medium'>
                      No friends yet
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      Add friends to start chatting
                    </p>
                  </div>
                )}

                {!isLoading && !isError && friends.length > 0 && (
                  <div className='space-y-1.5'>
                    {friends.map((friend) => {
                      const isSelected = selectedFriends.includes(friend.id)
                      const avatarSeed = friend.id || friend.name || friend.identity
                      return (
                        <div
                          key={friend.id}
                          className='flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent'
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleFriend(friend.id)}
                            className='mt-0.5 shrink-0'
                          />
                          <FacelessAvatar
                            seed={avatarSeed}
                            name={friend.name}
                            size={40}
                          />
                          <div className='flex min-w-0 flex-1'>
                            <span className='truncate text-sm font-medium leading-tight'>
                              {friend.name}
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

        <div className='flex items-center justify-between gap-4 border-t px-6 py-4'>
          <p className='text-muted-foreground text-sm'>
            {selectedFriends.length > 0
              ? `Ready to create ${isGroup ? 'a group' : 'a direct'} chat`
              : 'Select friends to continue'}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={createChatMutation.isPending}
              className='min-w-[90px]'
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateChat}
              disabled={!canSubmit}
              className='min-w-[130px]'
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
