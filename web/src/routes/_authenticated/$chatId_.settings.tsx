import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  PageHeader,
  Main,
  usePageTitle,
  getErrorMessage,
  Input,
  toast,
  useAuthStore,
} from '@mochi/common'
import {
  Loader2,
  MessageSquare,
  Pencil,
  Check,
  X,
  UserMinus,
  UserPlus,
  LogOut,
} from 'lucide-react'
import {
  useChatDetailQuery,
  useChatMembersQuery,
  useRenameChatMutation,
  useLeaveChatMutation,
  useAddMemberMutation,
  useRemoveMemberMutation,
  useNewChatFriendsQuery,
} from '@/hooks/useChats'

export const Route = createFileRoute('/_authenticated/$chatId_/settings')({
  component: ChatSettingsPage,
})

function ChatSettingsPage() {
  const { chatId } = Route.useParams()
  const navigate = useNavigate()
  const { name: currentUserName } = useAuthStore()

  const { data: chatDetail, isLoading: isLoadingChat } =
    useChatDetailQuery(chatId)
  const {
    data: membersData,
    isLoading: isLoadingMembers,
    refetch: refetchMembers,
  } = useChatMembersQuery(chatId)

  const members = membersData?.members ?? []

  usePageTitle(
    chatDetail?.chat.name ? `${chatDetail.chat.name} settings` : 'Chat settings'
  )

  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string
    name: string
  } | null>(null)

  const isLoading = isLoadingChat || isLoadingMembers

  if (isLoading && !chatDetail) {
    return (
      <>
        <PageHeader title='Chat settings' />
        <Main>
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        </Main>
      </>
    )
  }

  if (!chatDetail) {
    return (
      <>
        <PageHeader title='Chat settings' />
        <Main>
          <EmptyState
            icon={MessageSquare}
            title="Chat not found"
            description="This chat may have been deleted or you don't have access to it"
          />
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader title={`${chatDetail.chat.name} settings`} />
      <Main className='space-y-6'>
        <ChatNameCard chatId={chatId} name={chatDetail.chat.name} />

        <MembersCard
          chatId={chatId}
          members={members}
          currentUserName={currentUserName}
          onAddMember={() => setShowAddMemberDialog(true)}
          onRemoveMember={(member, isCurrentUser) => {
            if (isCurrentUser) {
              setShowLeaveDialog(true)
            } else {
              setMemberToRemove(member)
            }
          }}
          refetchMembers={refetchMembers}
        />

        <LeaveDialog
          open={showLeaveDialog}
          onOpenChange={setShowLeaveDialog}
          chatId={chatId}
          chatName={chatDetail.chat.name}
          onSuccess={() => void navigate({ to: '/' })}
        />

        <AddMemberDialog
          open={showAddMemberDialog}
          onOpenChange={setShowAddMemberDialog}
          chatId={chatId}
          existingMemberIds={members.map((m) => m.id)}
          onSuccess={() => void refetchMembers()}
        />

        <RemoveMemberDialog
          open={!!memberToRemove}
          onOpenChange={(open) => !open && setMemberToRemove(null)}
          chatId={chatId}
          member={memberToRemove}
          onSuccess={() => {
            setMemberToRemove(null)
            void refetchMembers()
          }}
        />
      </Main>
    </>
  )
}

interface ChatNameCardProps {
  chatId: string
  name: string
}

function ChatNameCard({ chatId, name }: ChatNameCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [nameError, setNameError] = useState<string | null>(null)

  const renameMutation = useRenameChatMutation({
    onSuccess: () => {
      setIsEditing(false)
      toast.success('Chat renamed')
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to rename chat'))
    },
  })

  const validateName = (name: string): string | null => {
    if (!name.trim()) return 'Chat name is required'
    if (name.length > 100) return 'Name must be 100 characters or less'
    return null
  }

  const handleStartEdit = () => {
    setEditName(name)
    setNameError(null)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditName(name)
    setNameError(null)
  }

  const handleSaveEdit = async () => {
    const trimmedName = editName.trim()
    const error = validateName(trimmedName)
    if (error) {
      setNameError(error)
      return
    }
    if (trimmedName === name) {
      setIsEditing(false)
      return
    }
    renameMutation.mutate({ chatId, name: trimmedName })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat name</CardTitle>
        <CardDescription>
          Customize the name of this chat
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <Input
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value)
                  setNameError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveEdit()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                className='h-8'
                disabled={renameMutation.isPending}
                autoFocus
              />
              <Button
                size='sm'
                variant='ghost'
                onClick={() => void handleSaveEdit()}
                disabled={renameMutation.isPending}
                className='h-8 w-8 p-0'
              >
                {renameMutation.isPending ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Check className='size-4' />
                )}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={handleCancelEdit}
                disabled={renameMutation.isPending}
                className='h-8 w-8 p-0'
              >
                <X className='size-4' />
              </Button>
            </div>
            {nameError && (
              <span className='text-destructive text-sm'>{nameError}</span>
            )}
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <span>{name}</span>
            <Button
              size='sm'
              variant='ghost'
              onClick={handleStartEdit}
              className='h-6 w-6 p-0'
            >
              <Pencil className='size-3' />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface MembersCardProps {
  chatId: string
  members: Array<{ id: string; name: string }>
  currentUserName: string
  onAddMember: () => void
  onRemoveMember: (
    member: { id: string; name: string },
    isCurrentUser: boolean
  ) => void
  refetchMembers: () => void
}

function MembersCard({
  members,
  currentUserName,
  onAddMember,
  onRemoveMember,
}: MembersCardProps) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Manage who can access this chat
          </CardDescription>
        </div>
        <Button size='sm' onClick={onAddMember}>
          <UserPlus className='mr-2 size-4' />
          Add member
        </Button>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {members.map((member) => {
            const isCurrentUser = member.name === currentUserName
            return (
              <div
                key={member.id}
                className='flex items-center justify-between rounded-md border px-3 py-2'
              >
                <div className='flex items-center gap-2'>
                  <span>{member.name}</span>
                  {isCurrentUser && (
                    <span className='text-muted-foreground text-xs'>(you)</span>
                  )}
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => onRemoveMember(member, isCurrentUser)}
                  className='text-muted-foreground hover:text-destructive h-8 w-8 p-0'
                >
                  {isCurrentUser ? (
                    <LogOut className='size-4' />
                  ) : (
                    <UserMinus className='size-4' />
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

interface LeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  chatName: string
  onSuccess: () => void
}

function LeaveDialog({
  open,
  onOpenChange,
  chatId,
  chatName,
  onSuccess,
}: LeaveDialogProps) {
  const [deleteOnLeave, setDeleteOnLeave] = useState(false)

  const leaveMutation = useLeaveChatMutation({
    onSuccess: () => {
      toast.success('Left chat')
      onSuccess()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to leave chat'))
    },
  })

  const handleLeave = () => {
    leaveMutation.mutate({ chatId, delete: deleteOnLeave })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) setDeleteOnLeave(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave chat?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to leave "{chatName}"? You can be added back
            by other members.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='flex items-center space-x-2 py-2'>
          <Checkbox
            id='delete-on-leave-settings'
            checked={deleteOnLeave}
            onCheckedChange={(checked) => setDeleteOnLeave(checked === true)}
          />
          <Label htmlFor='delete-on-leave-settings' className='text-sm'>
            Delete chat history
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leaveMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={handleLeave}
            disabled={leaveMutation.isPending}
          >
            {leaveMutation.isPending ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' />
                Leaving...
              </>
            ) : (
              'Leave'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  existingMemberIds: string[]
  onSuccess: () => void
}

function AddMemberDialog({
  open,
  onOpenChange,
  chatId,
  existingMemberIds,
  onSuccess,
}: AddMemberDialogProps) {
  const { data: friendsData, isLoading: isLoadingFriends } =
    useNewChatFriendsQuery({
      enabled: open,
    })

  const addMemberMutation = useAddMemberMutation({
    onSuccess: () => {
      toast.success('Member added')
      onSuccess()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to add member'))
    },
  })

  const availableFriends = useMemo(() => {
    if (!friendsData?.friends) return []
    return friendsData.friends.filter((f) => !existingMemberIds.includes(f.id))
  }, [friendsData?.friends, existingMemberIds])

  const handleAddMember = (memberId: string) => {
    addMemberMutation.mutate({ chatId, member: memberId })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Select a friend to add to this chat.
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[300px] overflow-y-auto'>
          {isLoadingFriends ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='text-muted-foreground size-6 animate-spin' />
            </div>
          ) : availableFriends.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No friends available"
              description="All your friends are already in this chat"
            />
          ) : (
            <div className='space-y-1'>
              {availableFriends.map((friend) => (
                <button
                  key={friend.id}
                  className='hover:bg-accent flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left disabled:opacity-50'
                  onClick={() => handleAddMember(friend.id)}
                  disabled={addMemberMutation.isPending}
                >
                  <span>{friend.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RemoveMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  member: { id: string; name: string } | null
  onSuccess: () => void
}

function RemoveMemberDialog({
  open,
  onOpenChange,
  chatId,
  member,
  onSuccess,
}: RemoveMemberDialogProps) {
  const removeMemberMutation = useRemoveMemberMutation({
    onSuccess: () => {
      toast.success('Member removed')
      onSuccess()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to remove member'))
    },
  })

  const handleRemove = () => {
    if (!member) return
    removeMemberMutation.mutate({ chatId, member: member.id })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove member?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove {member?.name} from this chat?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMemberMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={handleRemove}
            disabled={removeMemberMutation.isPending}
          >
            {removeMemberMutation.isPending ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
