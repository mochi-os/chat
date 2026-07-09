// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
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
  toastAction,
  Skeleton,
  PersonPicker,
  GeneralError,
  shellNavigateExternal,
  type Person, naturalCompare,} from '@mochi/web'
import { Loader2, MessageCircle, UserPlus } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { useNewChatFriendsQuery, useCreateChatMutation } from '@/hooks/useChats'
import { chatsApi } from '@/api/chats'

export function NewChat() {
  const { t } = useLingui()
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

  const createChatMutation = useCreateChatMutation()

  const friends = useMemo(() => data?.friends ?? [], [data?.friends])

  const myName = data?.name

  // Convert friends to Person format for PersonPicker
  const friendsAsPeople: Person[] = useMemo(
    () => friends.map((f) => ({ id: f.id, name: f.name })),
    [friends]
  )

  // Directory search for the picker: non-friends may be addressed too - the
  // sender-side probe at create refuses anyone whose chat_policy does not
  // allow it. Names of picked directory people are kept for the chat-name
  // autofill (the picker resolves its own display names internally).
  const directoryNames = useRef(new Map<string, string>())
  const searchDirectory = useCallback(async (query: string): Promise<Person[]> => {
    const response = await chatsApi.personSearch(query)
    const results = response.results ?? []
    for (const person of results) directoryNames.current.set(person.id, person.name)
    return results.map((person) => ({ id: person.id, name: person.name }))
  }, [])

  const memberName = useCallback(
    (id: string) => friends.find((f) => f.id === id)?.name ?? directoryNames.current.get(id),
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
      .map((id) => memberName(id))
      .filter(Boolean) as string[]

    if (selectedFriends.length === 1) {
      setChatName(selectedNames[0] || '')
    } else {
      const allNames = myName ? [...selectedNames, myName] : selectedNames
      allNames.sort((a, b) => naturalCompare(a, b))
      setChatName(allNames.join(', '))
    }
  }, [selectedFriends, friends, myName, memberName])

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

  const handleCreateChat = async () => {
    if (selectedFriends.length === 0) {
      toast.error(t`Please select at least one person`)
      return
    }

    if (hasExistingDirectChat) {
      toast.error(t`You already have a chat with this friend`)
      return
    }

    if (!trimmedChatName) {
      toast.error(t`Please provide a chat name`)
      return
    }

    try {
      const data = await toastAction(
        createChatMutation.mutateAsync({
          members: selectedFriends.join(','),
          name: trimmedChatName,
        }),
        {
          loading: t`Creating chat...`,
          success: (result) => (result.id ? t`Chat ready` : t`Chat created`),
          error: (error) => getErrorMessage(error, t`Failed to create chat`),
        }
      )
      onOpenChange(false)
      if (data.id) {
        void navigate({
          to: '/$chatId',
          params: { chatId: data.fingerprint ?? data.id },
        })
      }
    } catch {
      // toastAction already showed error
    }
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
    if (open && !isLoading) {
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
            <Trans>New chat</Trans>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            <Trans>Create a new chat</Trans>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-4'>
          {/* Friend Picker */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'><Trans>People</Trans></label>
            {isLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : error ? (
              <GeneralError error={error} minimal mode='inline' reset={refetch} />
            ) : (
              <>
                <PersonPicker
                  mode='multiple'
                  value={selectedFriends}
                  onChange={handleFriendsChange}
                  local={friendsAsPeople}
                  directory
                  directoryFn={searchDirectory}
                  placeholder={t`Select people...`}
                  emptyMessage={t`No people found`}
                  open={friendsPickerOpen}
                  onOpenChange={setFriendsPickerOpen}
                />
                {friends.length === 0 && (
                  <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
                    <p className='text-muted-foreground text-xs'><Trans>No friends yet</Trans></p>
                    <Button
                      variant='outline'
                      size='xs'
                      onClick={() => {
                        onOpenChange(false)
                        shellNavigateExternal('/people/')
                      }}
                    >
                      <UserPlus className='size-3.5' />
                      <Trans>Open people</Trans>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Existing conversations notice */}
          {existingChats.length > 0 && (
            <div className='rounded-lg border bg-muted/50 p-3'>
              <p className='text-muted-foreground mb-2 text-xs font-medium'>
                <Trans>You already have chats with:</Trans>
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
                      <MessageCircle className='me-1.5 h-3 w-3' />
                      <Trans>Open</Trans>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Name */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'><Trans>Chat name</Trans></label>
            <Input
              id='chat-name'
              placeholder={t`Chat name...`}
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
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={handleCreateChat} disabled={!canSubmit}>
            {createChatMutation.isPending ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <MessageCircle className='size-4' />
            )}
            {createChatMutation.isPending ? t`Creating...` : t`Create chat`}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
