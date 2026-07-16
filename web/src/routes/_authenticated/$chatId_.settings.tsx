// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  EntityAvatar,
  Label,
  PageHeader,
  Main,
  usePageTitle,
  getErrorMessage,
  toastAction,
  useAuthStore,
  GeneralError,
  ListSkeleton,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  SearchInput,
  Section,
  FieldRow,
  EditableFieldRow,
  DataChip,
  DetailSkeleton,
  naturalCompare,
} from '@mochi/web'
import {
  Loader2,
  MessageCircle,
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
  const { t } = useLingui()
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

  const members = useMemo(
    () => [...(membersData?.members ?? [])].sort((a, b) => naturalCompare(a.name, b.name)),
    [membersData]
  )

  usePageTitle(
    chatDetail?.chat.name ? t`${chatDetail.chat.name} settings` : t`Chat settings`
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
        <PageHeader title={t`Chat settings`} back={{ label: t`Back to chat`, onFallback: goBackToChat }} />
        <Main>
          <DetailSkeleton />
        </Main>
      </div>
    )
  }

  if (!chatDetail && !chatDetailError) {
    return (
      <>
        <PageHeader title={t`Chat settings`} back={{ label: t`Back to chat`, onFallback: goBackToChat }} />
        <Main>
          <EmptyState
            icon={MessageCircle}
            title={t`Chat not found`}
            description={t`This chat may have been deleted or you don't have access to it`}
          />
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={chatDetail?.chat.name ? t`${chatDetail.chat.name} settings` : t`Chat settings`}
        back={{ label: t`Back to chat`, onFallback: goBackToChat }}
      />
      <Main className='space-y-8'>
        {chatDetailError ? (
          <Section title={t`General`} description={t`Adjust chat settings`}>
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
          chatName={chatDetail?.chat.name ?? t`this chat`}
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
  const { t } = useLingui()

  const renameMutation = useRenameChatMutation()

  const validateName = (value: string): string | null => {
    if (!value.trim()) return t`Chat name is required`
    if (value.length > 1000) return t`Name must be 1000 characters or less`
    return null
  }

  return (
    <Section title={t`General`} description={t`Adjust chat settings`}>
      <EditableFieldRow
        label={t`Chat name`}
        value={name}
        onSave={async (newName) => {
          await toastAction(
            renameMutation.mutateAsync({ chatId, name: newName }),
            {
              loading: t`Renaming chat...`,
              success: t`Chat renamed`,
              error: (error) =>
                getErrorMessage(error, t`Failed to rename chat`),
            }
          )
        }}
        validate={validateName}
        emphasize
      />
      <FieldRow label={t`Chat ID`}>
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
  const { t } = useLingui()
  return (
    <Section
      title={t`Members`}
      description={t`List of people in this chat`}
      action={!error && !isLoading ? (
        <Button size='sm' onClick={onAddMember} variant="outline">
          <UserPlus className='me-2 size-4' />
          <Trans>Add member</Trans>
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
                className='flex items-center justify-between group rounded-lg hover:bg-hover px-3 py-2 transition-colors'
              >
                <div className='flex items-center gap-3'>
                  <EntityAvatar
                    src={`/people/${member.id}/-/avatar`}
                    styleUrl={`/people/${member.id}/-/style`}
                    name={member.name}
                    size="md"
                  />
                  <span className="font-medium">{member.name}</span>
                  {isCurrentUser && (
                    <span className='text-muted-foreground text-xs'>(you)</span>
                  )}
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => onRemoveMember(member, isCurrentUser)}
                  className='text-muted-foreground h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity'
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
  const { t } = useLingui()
  const [deleteOnLeave, setDeleteOnLeave] = useState(false)

  const leaveMutation = useLeaveChatMutation()

  const handleLeave = async () => {
    try {
      await toastAction(
        leaveMutation.mutateAsync({ chatId, delete: deleteOnLeave }),
        {
          loading: t`Leaving chat...`,
          success: t`Left chat`,
          error: (error) => getErrorMessage(error, t`Failed to leave chat`),
        }
      )
      onSuccess()
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) setDeleteOnLeave(false)
      }}
      title={t`Leave chat?`}
      desc={t`Are you sure you want to leave "${chatName}"? You can be added back by other members.`}
      confirmText={
        leaveMutation.isPending ? (
          <>
            <Loader2 className='me-2 size-4 animate-spin' />
            <Trans>Leaving...</Trans>
          </>
        ) : (
          t`Leave chat`
        )
      }
      destructive
      handleConfirm={handleLeave}
      isLoading={leaveMutation.isPending}
    >
      <div className='flex items-center space-x-2 py-4'>
        <Checkbox
          id='delete-on-leave-settings'
          checked={deleteOnLeave}
          onCheckedChange={(checked) => setDeleteOnLeave(checked === true)}
        />
        <Label htmlFor='delete-on-leave-settings' className='text-sm font-medium'>
          <Trans>Delete chat history</Trans>
        </Label>
      </div>
    </ConfirmDialog>
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
  const { t } = useLingui()
  const [filter, setFilter] = useState('')
  const { data: friendsData, isLoading: isLoadingFriends, error, refetch } =
    useNewChatFriendsQuery({
      enabled: open,
    })

  const addMemberMutation = useAddMemberMutation()

  const availableFriends = useMemo(() => {
    if (!friendsData?.friends) return []
    const query = filter.trim().toLowerCase()
    return friendsData.friends
      .filter((f) => !existingMemberIds.includes(f.id))
      .filter((f) => (query ? f.name.toLowerCase().includes(query) : true))
  }, [friendsData?.friends, existingMemberIds, filter])

  // Reset the search field whenever the dialog closes.
  useEffect(() => {
    if (!open) setFilter('')
  }, [open])

  const handleAddMember = async (memberId: string) => {
    try {
      await toastAction(
        addMemberMutation.mutateAsync({ chatId, member: memberId }),
        {
          loading: t`Adding member...`,
          success: t`Member added`,
          error: (error) => getErrorMessage(error, t`Failed to add member`),
        }
      )
      onSuccess()
      onOpenChange(false)
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='flex items-center gap-2'>
            <UserPlus className='size-5' />
            <Trans>Add member</Trans>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            <Trans>Select a friend to add to this chat.</Trans>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-3'>
          <SearchInput
            value={filter}
            onValueChange={setFilter}
            placeholder={t`Search friends…`}
            clearLabel={t`Clear search`}
          />

          <div className='max-h-72 space-y-1 overflow-y-auto px-1'>
            {isLoadingFriends ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='text-muted-foreground size-6 animate-spin' />
              </div>
            ) : error ? (
              <GeneralError error={error} minimal mode='inline' reset={refetch} />
            ) : availableFriends.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title={filter.trim() ? t`No friends found` : t`No friends available`}
                description={
                  filter.trim()
                    ? t`Try a different search term`
                    : t`All your friends are already in this chat`
                }
              />
            ) : (
              <div className='space-y-1'>
                <p className='text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium uppercase tracking-wide'>
                  <Trans>Friends</Trans>
                </p>
                {availableFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type='button'
                    aria-label={t`Add ${friend.name} to chat`}
                    className='hover:bg-hover flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors disabled:opacity-50'
                    onClick={() => handleAddMember(friend.id)}
                    disabled={addMemberMutation.isPending}
                  >
                    <EntityAvatar
                      src={`/people/${friend.id}/-/avatar`}
                      styleUrl={`/people/${friend.id}/-/style`}
                      name={friend.name}
                      size='lg'
                    />
                    <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                      {friend.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
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
  const { t } = useLingui()
  const removeMemberMutation = useRemoveMemberMutation()

  const handleRemove = async () => {
    if (!member) return
    try {
      await toastAction(
        removeMemberMutation.mutateAsync({ chatId, member: member.id }),
        {
          loading: t`Removing member...`,
          success: t`Member removed`,
          error: (error) => getErrorMessage(error, t`Failed to remove member`),
        }
      )
      onSuccess()
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t`Remove member?`}
      desc={t`Are you sure you want to remove ${member?.name} from this chat?`}
      confirmText={
        removeMemberMutation.isPending ? (
          <>
            <Loader2 className='me-2 size-4 animate-spin' />
            <Trans>Removing...</Trans>
          </>
        ) : (
          t`Remove`
        )
      }
      destructive
      handleConfirm={handleRemove}
      isLoading={removeMemberMutation.isPending}
    >
      <div className="mt-2 mb-4 flex gap-2 rounded-lg bg-muted/50 p-3">
        <span className="font-semibold">{member?.name}</span>
      </div>
    </ConfirmDialog>
  )
}
