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
  GeneralError,
  ListSkeleton,
  Section,
  FieldRow,
  DataChip,
  DetailSkeleton,
} from '@mochi/common'
import {
  Loader2,
  MessageCircle,
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
  const goBackToChat = () => navigate({ to: '/$chatId', params: { chatId } })
  const { identity: currentUserIdentity } = useAuthStore()

  const {
    data: chatDetail,
    isLoading: isLoadingChat,
    error: chatDetailError,
    refetch: refetchChatDetail,
  } = useChatDetailQuery(chatId)
  const {
    data: membersData,
    isLoading: isLoadingMembers,
    error: membersError,
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

  if (isLoadingChat && !chatDetail) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader title='Chat settings' back={{ label: 'Back to chat', onFallback: goBackToChat }} />
        <Main>
          <DetailSkeleton />
        </Main>
      </div>
    )
  }

  if (!chatDetail && !chatDetailError) {
    return (
      <>
        <PageHeader title='Chat settings' back={{ label: 'Back to chat', onFallback: goBackToChat }} />
        <Main>
          <EmptyState
            icon={MessageCircle}
            title="Chat not found"
            description="This chat may have been deleted or you don't have access to it"
          />
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={chatDetail?.chat.name ? `${chatDetail.chat.name} settings` : 'Chat settings'}
        back={{ label: 'Back to chat', onFallback: goBackToChat }}
      />
      <Main className='space-y-8'>
        {chatDetailError ? (
          <Section title="General" description="Adjust chat settings">
            <GeneralError
              error={chatDetailError}
              minimal
              mode='inline'
              reset={refetchChatDetail}
            />
          </Section>
        ) : chatDetail ? (
          <ChatNameSection chatId={chatId} name={chatDetail.chat.name} />
        ) : null}

        <MembersSection
          members={members}
          currentUserIdentity={currentUserIdentity}
          isLoading={isLoadingMembers}
          error={membersError}
          onRetry={refetchMembers}
          onAddMember={() => setShowAddMemberDialog(true)}
          onRemoveMember={(member, isCurrentUser) => {
            if (isCurrentUser) {
              setShowLeaveDialog(true)
            } else {
              setMemberToRemove(member)
            }
          }}
        />

        <LeaveDialog
          open={showLeaveDialog}
          onOpenChange={setShowLeaveDialog}
          chatId={chatId}
          chatName={chatDetail?.chat.name ?? 'this chat'}
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

function ChatNameSection({ chatId, name }: { chatId: string, name: string }) {
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
    <Section title="General" description="Adjust chat settings">
      <FieldRow label="Chat name">
        {isEditing ? (
          <div className='flex flex-col gap-1 w-full max-w-md'>
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
                className='h-9'
                disabled={renameMutation.isPending}
                autoFocus
              />
              <Button
                size='sm'
                variant='ghost'
                onClick={() => void handleSaveEdit()}
                disabled={renameMutation.isPending}
                className='h-9 w-9 p-0'
              >
                {renameMutation.isPending ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Check className='size-4 text-green-600' />
                )}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={handleCancelEdit}
                disabled={renameMutation.isPending}
                className='h-9 w-9 p-0'
              >
                <X className='size-4 text-destructive' />
              </Button>
            </div>
            {nameError && (
              <span className='text-destructive text-xs'>{nameError}</span>
            )}
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <span className="text-base font-semibold">{name}</span>
            <Button
              size='sm'
              variant='ghost'
              onClick={handleStartEdit}
              className='h-6 w-6 p-0 hover:bg-muted'
            >
              <Pencil className='size-3.5 text-muted-foreground' />
            </Button>
          </div>
        )}
      </FieldRow>
      <FieldRow label="Chat ID">
        <DataChip value={chatId} truncate='middle' />
      </FieldRow>
    </Section>
  )
}

function MembersSection({
  members,
  currentUserIdentity,
  isLoading,
  error,
  onRetry,
  onAddMember,
  onRemoveMember,
}: {
  members: Array<{ id: string; name: string }>
  currentUserIdentity: string
  isLoading: boolean
  error: unknown
  onRetry: () => void
  onAddMember: () => void
  onRemoveMember: (
    member: { id: string; name: string },
    isCurrentUser: boolean
  ) => void
}) {
  return (
    <Section
      title="Members"
      description="List of people in this chat"
      action={!error && !isLoading ? (
        <Button size='sm' onClick={onAddMember} variant="outline">
          <UserPlus className='mr-2 size-4' />
          Add member
        </Button>
      ) : undefined}
    >
      {error ? (
        <GeneralError error={error} minimal mode='inline' reset={onRetry} />
      ) : isLoading ? (
        <ListSkeleton variant='simple' height='h-10' count={4} />
      ) : (
        <div className='space-y-1 py-1'>
          {members.map((member) => {
            const isCurrentUser = member.id === currentUserIdentity
            return (
              <div
                key={member.id}
                className='flex items-center justify-between group rounded-lg hover:bg-muted/50 px-3 py-2 transition-colors'
              >
                <div className='flex items-center gap-2'>
                  <span className="font-medium">{member.name}</span>
                  {isCurrentUser && (
                    <span className='text-muted-foreground text-xs'>(you)</span>
                  )}
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => onRemoveMember(member, isCurrentUser)}
                  className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity'
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
      )}
    </Section>
  )
}

function LeaveDialog({
  open,
  onOpenChange,
  chatId,
  chatName,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  chatName: string
  onSuccess: () => void
}) {
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
        <div className='flex items-center space-x-2 py-4'>
          <Checkbox
            id='delete-on-leave-settings'
            checked={deleteOnLeave}
            onCheckedChange={(checked) => setDeleteOnLeave(checked === true)}
          />
          <Label htmlFor='delete-on-leave-settings' className='text-sm font-medium'>
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
              <Loader2 className='mr-2 size-4 animate-spin' />
            ) : (
              'Leave Chat'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  chatId,
  existingMemberIds,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  existingMemberIds: string[]
  onSuccess: () => void
}) {
  const { data: friendsData, isLoading: isLoadingFriends, error, refetch } =
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
        <div className='max-h-[300px] overflow-y-auto mt-2'>
          {isLoadingFriends ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='text-muted-foreground size-6 animate-spin' />
            </div>
          ) : error ? (
            <GeneralError error={error} minimal mode='inline' reset={refetch} />
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
                  className='hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-50 transition-colors'
                  onClick={() => handleAddMember(friend.id)}
                  disabled={addMemberMutation.isPending}
                >
                  <span className="font-medium">{friend.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RemoveMemberDialog({
  open,
  onOpenChange,
  chatId,
  member,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  member: { id: string; name: string } | null
  onSuccess: () => void
}) {
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
        <div className="flex gap-2 p-3 bg-muted/50 rounded-lg mt-2 mb-4">
           <span className="font-semibold">{member?.name}</span>
        </div>
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
              <Loader2 className='mr-2 size-4 animate-spin' />
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
