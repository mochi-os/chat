// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Check } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  getErrorMessage,
  toastAction,
} from '@mochi/web'
import {
  useChatPreferencesQuery,
  useSetChatPreferencesMutation,
} from '@/hooks/useChats'
import type { ChatPolicy } from '@/api/chats'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useLingui()
  const options: { value: ChatPolicy; label: string; description: string }[] = [
    {
      value: 'friends',
      label: t`Friends only`,
      description: t`Only friends can start a chat with you (default).`,
    },
    {
      value: 'anyone',
      label: t`Anyone`,
      description: t`Anyone can start a chat with you.`,
    },
  ]
  const { data, isLoading } = useChatPreferencesQuery()
  const setPolicy = useSetChatPreferencesMutation()
  const [value, setValue] = useState<ChatPolicy>('friends')

  useEffect(() => {
    if (data?.chat_policy) setValue(data.chat_policy)
  }, [data?.chat_policy])

  const handleSave = async () => {
    if (data?.chat_policy && value === data.chat_policy) {
      onOpenChange(false)
      return
    }
    try {
      await toastAction(setPolicy.mutateAsync(value), {
        loading: t`Saving...`,
        success: t`Chat policy updated`,
        error: (error) => getErrorMessage(error, t`Failed to save`),
      })
      onOpenChange(false)
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle><Trans>Incoming chats</Trans></DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className='space-y-3 py-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : (
          <RadioGroup
            value={value}
            onValueChange={(v) => setValue(v as ChatPolicy)}
            className='py-2'
          >
            {options.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`chat-policy-${opt.value}`}
                className='flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-hover'
              >
                <RadioGroupItem value={opt.value} id={`chat-policy-${opt.value}`} className='mt-0.5' />
                <div className='flex flex-col gap-0.5'>
                  <Label htmlFor={`chat-policy-${opt.value}`} className='font-medium cursor-pointer'>
                    {opt.label}
                  </Label>
                  <span className='text-muted-foreground text-xs'>{opt.description}</span>
                </div>
              </label>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={setPolicy.isPending}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              setPolicy.isPending ||
              isLoading ||
              (!!data?.chat_policy && value === data.chat_policy)
            }
          >
            <Check className='size-4' />
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
